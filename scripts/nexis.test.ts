/**
 * Targeted tests for the Nexis currency rules (src/convex/rules.ts) — the
 * fund-movement logic. Run with: bun test scripts/nexis.test.ts
 *
 * These are pure unit tests: no Convex, no network. The issuance path's
 * protocol layer (OTS anchoring) is covered separately by scripts/ots-smoke.ts.
 */
import { describe, expect, test } from "bun:test";

import {
  balanceOf,
  compareLedgerKeys,
  HANDLE_RE,
  ISSUANCE_RATE,
  issuanceFor,
  LEDGER_PAGE_SIZE,
  nextCursor,
  supplyStats,
  validatePayment,
  type LedgerCursor,
  type LedgerEntry,
} from "../src/convex/rules";
import {
  clampPageSize,
  toCursor,
  toPaginationResult,
  windowedPage,
} from "../src/convex/pagination";
import type { Doc } from "../src/convex/_generated/dataModel";

const iss = (toHandle: string, amount: number): LedgerEntry => ({
  kind: "issuance",
  toHandle,
  amount,
});
const pay = (
  fromHandle: string,
  toHandle: string,
  amount: number,
): LedgerEntry => ({ kind: "payment", fromHandle, toHandle, amount });

describe("issuance (proof redemption)", () => {
  test("rate is 1 NXS per contribution point", () => {
    expect(ISSUANCE_RATE).toBe(1);
    expect(issuanceFor({ status: "anchored", score: 142 }, false)).toBe(142);
    expect(issuanceFor({ status: "anchored", score: 1 }, false)).toBe(1);
  });

  test("pending proofs cannot mint NXS", () => {
    expect(() =>
      issuanceFor({ status: "pending", score: 142 }, false),
    ).toThrow("not Bitcoin-anchored");
  });

  test("a proof can be redeemed exactly once", () => {
    expect(() =>
      issuanceFor({ status: "anchored", score: 50 }, true),
    ).toThrow("already been redeemed");
  });
});

describe("balances fold over the append-only ledger", () => {
  const ledger: LedgerEntry[] = [
    iss("alice", 100),
    pay("alice", "bob", 40),
    iss("bob", 10),
    pay("carol", "alice", 5),
  ];

  test("credits minus debits per handle", () => {
    expect(balanceOf(ledger, "alice")).toBe(65);
    expect(balanceOf(ledger, "bob")).toBe(50);
    expect(balanceOf(ledger, "carol")).toBe(-5);
  });

  test("total supply is conserved across any set of payments", () => {
    const net = ["alice", "bob", "carol"].reduce(
      (s, h) => s + balanceOf(ledger, h),
      0,
    );
    const minted = ledger
      .filter((e) => e.kind === "issuance")
      .reduce((s, e) => s + e.amount, 0);
    expect(net).toBe(minted);
  });

  test("empty ledger yields zero balance", () => {
    expect(balanceOf([], "alice")).toBe(0);
    expect(balanceOf(ledger, "nobody")).toBe(0);
  });

  test("payments cannot create supply", () => {
    // alice sends 100 (all she has) — sum still equals minted supply
    const drained: LedgerEntry[] = [
      iss("alice", 100),
      pay("alice", "bob", 100),
    ];
    expect(balanceOf(drained, "bob")).toBe(100);
    expect(
      drained.reduce((s, e) => s + (e.kind === "issuance" ? e.amount : 0), 0),
    ).toBe(
      balanceOf(drained, "alice") + balanceOf(drained, "bob"),
    );
  });
});

describe("payment validation", () => {
  const base: LedgerEntry[] = [iss("alice", 100), iss("bob", 20)];

  const attempt = (
    input: Partial<Parameters<typeof validatePayment>[0]>,
    ledger: LedgerEntry[] = base,
  ) =>
    validatePayment(
      {
        payerHandle: "alice",
        toHandle: "bob",
        amount: 10,
        ...input,
      },
      ledger,
    );

  test("a valid payment is accepted and normalizes the handle", () => {
    const v = attempt({ toHandle: "  BOB  " });
    expect(v).toEqual({ ok: true, toHandle: "bob", amount: 10 });
  });

  test("rejects invalid, self, and unknown-shaped recipients", () => {
    expect(attempt({ toHandle: "alice" }).ok).toBe(false); // self
    expect(attempt({ toHandle: "" }).ok).toBe(false);
    expect(attempt({ toHandle: "Bad_Handle!" }).ok).toBe(false);
    expect(attempt({ toHandle: "-lead" }).ok).toBe(false); // must start alnum
    expect(attempt({ toHandle: "x" }).ok).toBe(false); // min 2 chars
  });

  test("rejects zero, negative, fractional, and non-finite amounts", () => {
    expect(attempt({ amount: 0 }).ok).toBe(false);
    expect(attempt({ amount: -5 }).ok).toBe(false);
    expect(attempt({ amount: 1.5 }).ok).toBe(false);
    expect(attempt({ amount: Number.NaN }).ok).toBe(false);
    expect(attempt({ amount: Number.POSITIVE_INFINITY }).ok).toBe(false);
  });

  test("enforces the computed balance — no overdraft", () => {
    const v = attempt({ amount: 101 });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toContain("Insufficient balance");
    expect(attempt({ amount: 100 }).ok).toBe(true); // exact balance is fine
  });

  test("a payer with no issuance has zero buying power", () => {
    const v = attempt({ payerHandle: "carol", amount: 1 });
    expect(v.ok).toBe(false);
  });

  test("validation uses the ledger passed in, not any stored state", () => {
    // same request, different ledger states → different verdicts
    const rich: LedgerEntry[] = [iss("alice", 500)];
    expect(
      validatePayment(
        { payerHandle: "alice", toHandle: "bob", amount: 300 },
        rich,
      ).ok,
    ).toBe(true);
    expect(
      validatePayment(
        { payerHandle: "alice", toHandle: "bob", amount: 300 },
        [],
      ).ok,
    ).toBe(false);
  });
});

describe("handle format", () => {
  test("2–32 chars, lowercase alnum + hyphens, must start alnum", () => {
    expect(HANDLE_RE.test("alice")).toBe(true);
    expect(HANDLE_RE.test("a-b-c-123")).toBe(true);
    expect(HANDLE_RE.test("Alice")).toBe(false);
    expect(HANDLE_RE.test("a")).toBe(false);
    expect(HANDLE_RE.test("a".repeat(33))).toBe(false);
    expect(HANDLE_RE.test("a".repeat(32))).toBe(true);
  });
});

describe("supply stats", () => {
  test("minted counts issuance only; moved counts payments only", () => {
    const s = supplyStats([
      iss("alice", 100),
      pay("alice", "bob", 40),
      iss("bob", 10),
    ]);
    expect(s.minted).toBe(110);
    expect(s.moved).toBe(40);
  });

  test("holders counts handles with non-zero balances", () => {
    const s = supplyStats([
      iss("alice", 100),
      pay("alice", "bob", 100), // alice drained to zero
      iss("carol", 7),
    ]);
    expect(s.holders).toBe(2); // bob + carol
  });
});

// ---------------------------------------------------------------------------
// Ledger pagination — the audit property: paging back to entry zero without
// gaps or repeats, over a stable total order (_creationTime asc, _id tiebreak).
// ---------------------------------------------------------------------------

/** A fake ledger document: only the system fields pagination reads. */
const row = (id: string, creationTime: number): Doc<"ledger"> =>
  ({ _id: id, _creationTime: creationTime }) as unknown as Doc<"ledger">;

const sortedAsc = (rows: Doc<"ledger">[]) =>
  [...rows].sort((a, b) => compareLedgerKeys(a, b));

describe("ledger order (compareLedgerKeys)", () => {
  test("_creationTime dominates; _id breaks ties", () => {
    expect(compareLedgerKeys(row("a", 100), row("b", 200))).toBe(-1);
    expect(compareLedgerKeys(row("b", 200), row("a", 100))).toBe(1);
    expect(compareLedgerKeys(row("a", 100), row("b", 100))).toBe(-1);
    expect(compareLedgerKeys(row("b", 100), row("a", 100))).toBe(1);
    expect(compareLedgerKeys(row("a", 100), row("a", 100))).toBe(0);
  });

  test("fractional creation times order correctly (they are not ms integers)", () => {
    expect(
      compareLedgerKeys(row("a", 1000.25), row("b", 1000.5)),
    ).toBe(-1);
  });

  test("sorting is idempotent and antisymmetric", () => {
    const rows = [
      row("k3", 50),
      row("k1", 50),
      row("k2", 50),
      row("k9", 10),
      row("k4", 50),
    ];
    const once = sortedAsc(rows).map((r) => String(r._id));
    const twice = sortedAsc(sortedAsc(rows)).map((r) => String(r._id));
    expect(once).toEqual(twice);
    expect(once).toEqual(["k9", "k1", "k2", "k3", "k4"]);
  });
});

describe("cursor merging (nextCursor)", () => {
  test("advances past every key seen across pages, newest-page-first", () => {
    // Pages arrive newest first; a later page can hold older/interleaved keys.
    const p1 = [row("a", 300), row("b", 250)];
    const p2 = [row("c", 260), row("d", 100)];
    const c1 = nextCursor(null, p1);
    expect(c1).toEqual({ _creationTime: 300, _id: "a" });
    const c2 = nextCursor(c1, p2);
    expect(c2).toEqual({ _creationTime: 300, _id: "a" }); // p2 adds nothing newer
    const c3 = nextCursor(c2, [row("e", 400)]);
    expect(c3).toEqual({ _creationTime: 400, _id: "e" });
  });

  test("merging is idempotent: a fixed point once all keys are seen", () => {
    const seen = [row("x", 10), row("y", 20)];
    const c = nextCursor(null, seen);
    expect(nextCursor(c, seen)).toEqual(c);
    expect(nextCursor(c, [])).toEqual(c);
  });

  test("empty page with no prior cursor stays null", () => {
    expect(nextCursor(null, [])).toBe(null);
  });
});

describe("page windowing (windowedPage)", () => {
  const size = 7;
  // 57 rows with heavy _creationTime ties (like one big transaction batch).
  const many = Array.from({ length: 57 }, (_, i) =>
    row(`id-${String(i).padStart(3, "0")}`, i < 30 ? 1_000 : 1_000 + Math.floor(i / 10)),
  );
  const sortedDesc = [...many].sort((a, b) =>
    compareLedgerKeys(b, a),
  );

  const walk = (rows: Doc<"ledger">[]): string[] => {
    const seen: string[] = [];
    let cursor: string | null = null;
    let guard = 0;
    while (guard++ < 100) {
      const p = windowedPage(rows, cursor, size);
      seen.push(...p.page.map((r) => String(r._id)));
      if (p.cursor === null) break;
      cursor = p.cursor;
    }
    return seen;
  };

  test("paging back to entry zero is gapless: every entry exactly once", () => {
    const seen = walk(sortedDesc);
    expect(seen).toHaveLength(many.length);
    expect(new Set(seen).size).toBe(many.length);
    expect(seen).toEqual(sortedDesc.map((r) => String(r._id)));
  });

  test("consecutive pages continue without gaps or overlaps", () => {
    const first = windowedPage(sortedDesc, null, size);
    expect(first.page.length).toBe(size);
    const second = windowedPage(sortedDesc, first.cursor, size);
    expect(second.page[0]).toBe(sortedDesc[size]); // no gap between pages
  });

  test("new entries appended between page fetches never hide old history", () => {
    const before = sortedAsc(many.slice(0, 40));
    const first = windowedPage([...before].reverse(), null, size);
    // meanwhile, the rest of `many` plus 17 brand-new entries land above the cursor
    const after = sortedAsc([...many, ...newer]);
    const walked = walkFrom(after, first.cursor);
    const firstIds = first.page.map((r) => String(r._id));
    const walkedIds = walked.map((r) => String(r._id));
    // nothing already fetched is fetched again
    expect(firstIds.some((id) => walkedIds.includes(id))).toBe(false);
    // and the union is exactly the old 40-entry history: the newcomers
    // shifted the window but hid nothing
    const seen = new Set([...firstIds, ...walkedIds]);
    expect(seen.size).toBe(before.length);
    for (const r of before) expect(seen.has(String(r._id))).toBe(true);
  });

  test("cursor past the end of the set yields an empty final page", () => {
    const last = sortedDesc.at(-1)!;
    const stale = `${last._creationTime}|${String(last._id)}`;
    const p = windowedPage(sortedDesc, stale, size);
    expect(p.page).toEqual([]);
    expect(p.cursor).toBe(null);
  });

  test("toCursor round-trips through windowing; result converts to PaginationResult", () => {
    const first = windowedPage(sortedDesc, null, size);
    const res = toPaginationResult(first);
    expect(res.page).toEqual(first.page);
    expect(res.isDone).toBe(false);
    expect(res.continueCursor).toBe(first.cursor);
    // the cursor the server hands out round-trips through toCursor
    expect(first.cursor).toBe(toCursor(first.page[first.page.length - 1]!));
    // end of ledger: cursor null → isDone true, never an empty-string cursor
    const exhausted = toPaginationResult(windowedPage(sortedDesc, null, 1000));
    expect(exhausted.isDone).toBe(true);
  });

  test("page size is clamped and defaults sanely", () => {
    expect(clampPageSize(1000)).toBe(100);
    expect(clampPageSize(0)).toBe(LEDGER_PAGE_SIZE);
    expect(clampPageSize(-5)).toBe(LEDGER_PAGE_SIZE);
    expect(clampPageSize(Number.NaN)).toBe(LEDGER_PAGE_SIZE);
    expect(clampPageSize(3.9)).toBe(3);
  });

  const newer = Array.from({ length: 17 }, (_, i) =>
    row(`new-${String(i).padStart(3, "0")}`, 2_000 + i),
  );

  function walkFrom(rows: Doc<"ledger">[], cursor: string | null) {
    const out: Doc<"ledger">[] = [];
    let c = cursor;
    let guard = 0;
    while (guard++ < 100) {
      const p = windowedPage([...rows].reverse(), c, size);
      out.push(...p.page);
      if (p.cursor === null) break;
      c = p.cursor;
    }
    return out;
  }
});
