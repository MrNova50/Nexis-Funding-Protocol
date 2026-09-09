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
  HANDLE_RE,
  ISSUANCE_RATE,
  issuanceFor,
  supplyStats,
  validatePayment,
  type LedgerEntry,
} from "../src/convex/rules";

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
