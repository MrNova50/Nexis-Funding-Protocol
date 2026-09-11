import { getAuthUserId } from "@convex-dev/auth/server";
import {
  paginationOptsValidator,
  type PaginationResult,
} from "convex/server";
import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { Doc } from "./_generated/dataModel";
import { toPaginationResult, windowedPage } from "./pagination";
import {
  balanceOf,
  compareLedgerKeys,
  HANDLE_RE,
  ISSUANCE_RATE,
  issuanceFor,
  supplyStats as computeSupplyStats,
  validatePayment,
} from "./rules";

/**
 * Nexis (NXS) — the Nexis Funding Protocol's internal team currency.
 *
 * The supply policy and all money rules (issuance rate, once-per-proof,
 * payment validation, balance fold) live in ./rules.ts — pure and unit-tested
 * by scripts/nexis.test.ts. This file is only the Convex wiring: auth,
 * ownership, existence checks, and ledger appends.
 *
 * Deliberately out of scope for this increment: fiat on/off ramps, wallets,
 * and anything convertible to real money. NXS is an internal unit of account
 * for recognizing and settling contribution within the team — full stop.
 */

/**
 * The signed-in member's handle and computed balance.
 *
 * Balance computation is deliberately untouched: it still folds over the
 * member's two full indexed ledger scans (tracked separately in the balance
 * issue). The old ~200-entry `entries` truncation is gone: the member's full
 * history is served by the paginated per-handle ledger query (`handleLedger`)
 * used by the public proof page — nothing in the wallet path truncates.
 */
export const myWallet = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    if (!user?.handle) {
      return { handle: null, balance: 0 };
    }
    return walletBalanceFor(ctx, user.handle);
  },
});

async function walletBalanceFor(ctx: QueryCtx, handle: string) {
  const [credited, debited] = await Promise.all([
    ctx.db
      .query("ledger")
      .withIndex("to_handle", (q) => q.eq("toHandle", handle))
      .collect(),
    ctx.db
      .query("ledger")
      .withIndex("from_handle", (q) => q.eq("fromHandle", handle))
      .collect(),
  ]);
  const credit = balanceOf(credited, handle);
  const debit = -balanceOf(debited, handle);
  return { handle, balance: credit + debit };
}

/**
 * A handle's ledger history, newest page first — the public proof page's
 * full-history view. Read-only, no sign-in required: the ledger is the
 * team's shared audit surface. Conforms to the standard paginationOpts
 * contract, so the client can drive it with `usePaginatedQuery`.
 */
export const handleLedger = query({
  args: {
    handle: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: (ctx, { handle, paginationOpts }) =>
    handleLedgerPage(
      ctx,
      handle.toLowerCase().trim(),
      paginationOpts.cursor,
      paginationOpts.numItems,
    ),
});

/**
 * One page of a handle's ledger, returned as a standard PaginationResult.
 * The handle's entries come from two indexed scans (credits + debits); they
 * are merged into the ledger's canonical order — `_creationTime` asc, `_id`
 * breaking ties, newest first here — and windowed by cursor. The full sort
 * key in the cursor keeps the walk gapless even when many entries share one
 * `_creationTime`.
 */
async function handleLedgerPage(
  ctx: QueryCtx,
  handle: string,
  cursor: string | null,
  numItems: number,
) {
  const [credited, debited] = await Promise.all([
    ctx.db
      .query("ledger")
      .withIndex("to_handle", (q) => q.eq("toHandle", handle))
      .collect(),
    ctx.db
      .query("ledger")
      .withIndex("from_handle", (q) => q.eq("fromHandle", handle))
      .collect(),
  ]);
  const sortedDesc = [...credited, ...debited].sort((a, b) =>
    compareLedgerKeys(b, a),
  );
  return toPaginationResult(windowedPage(sortedDesc, cursor, numItems));
}

/**
 * Redeem a Bitcoin-anchored proof for NXS. Idempotent: one proof can be
 * redeemed exactly once (enforced by the by_attestation index), and only
 * proofs that are actually anchored on-chain qualify. Whoever owns the proof
 * claims the issuance.
 */
export const redeemProof = mutation({
  args: { attestationId: v.id("attestations") },
  handler: async (ctx, { attestationId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in first.");
    const user = await ctx.db.get(userId);
    if (!user?.handle) throw new Error("Claim a handle first.");

    const att = await ctx.db.get(attestationId);
    if (!att) throw new Error("Proof not found.");
    if (att.creatorUserId !== userId) {
      throw new Error("Only the proof's owner can redeem it.");
    }

    const prior = await ctx.db
      .query("ledger")
      .withIndex("by_attestation", (q) => q.eq("attestationId", attestationId))
      .first();
    // Anchored-only + once-per-proof + rate are the tested rules in rules.ts.
    const amount = issuanceFor(att, prior !== null);
    await ctx.db.insert("ledger", {
      kind: "issuance",
      toHandle: user.handle,
      amount,
      attestationId,
      digest: att.digest,
    });
    return amount;
  },
});

/** Pay NXS to another team handle. The balance is checked server-side. */
export const pay = mutation({
  args: {
    toHandle: v.string(),
    amount: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { toHandle, amount, note }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in first.");
    const payer = await ctx.db.get(userId);
    if (!payer?.handle) throw new Error("Claim a handle first.");

    // All payment-shape + balance rules are the tested rules in rules.ts.
    const verdict = validatePayment(
      { payerHandle: payer.handle, toHandle, amount },
      [],
    );
    if (!verdict.ok) throw new Error(verdict.error);

    const recipient = await ctx.db
      .query("users")
      .withIndex("by_handle", (q) => q.eq("handle", verdict.toHandle))
      .first();
    if (!recipient) {
      throw new Error(`No member holds the handle "${verdict.toHandle}".`);
    }

    const payerHandle: string = payer.handle;
    const [credited, debited] = await Promise.all([
      ctx.db
        .query("ledger")
        .withIndex("to_handle", (q) => q.eq("toHandle", payerHandle))
        .collect(),
      ctx.db
        .query("ledger")
        .withIndex("from_handle", (q) => q.eq("fromHandle", payerHandle))
        .collect(),
    ]);
    if (balanceOf([...credited, ...debited], payerHandle) < verdict.amount) {
      throw new Error(
        `Insufficient balance: you hold ${balanceOf([...credited, ...debited], payerHandle)} NXS but tried to send ${verdict.amount}.`,
      );
    }

    await ctx.db.insert("ledger", {
      kind: "payment",
      toHandle: verdict.toHandle,
      fromHandle: payer.handle,
      amount: verdict.amount,
      note: note?.trim() || undefined,
    });
    return { to: verdict.toHandle, amount: verdict.amount };
  },
});

/** All anchored, not-yet-redeemed proofs owned by the signed-in member. */
export const redeemable = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const user = await ctx.db.get(userId);
    if (!user?.handle) return [];

    const ownerHandle: string = user.handle;
    const atts = await ctx.db
      .query("attestations")
      .withIndex("handle", (q) => q.eq("handle", ownerHandle))
      .collect();
    const mine = atts.filter(
      (a) => a.creatorUserId === userId && a.status === "anchored",
    );
    const results: {
      attestationId: Doc<"attestations">["_id"];
      repo: string;
      score: number;
      nxs: number;
      bitcoinBlockHeight: number | undefined;
    }[] = [];
    for (const att of mine) {
      const prior = await ctx.db
        .query("ledger")
        .withIndex("by_attestation", (q) => q.eq("attestationId", att._id))
        .first();
      if (!prior) {
        results.push({
          attestationId: att._id,
          repo: att.repo,
          score: att.score,
          nxs: att.score * ISSUANCE_RATE,
          bitcoinBlockHeight: att.bitcoinBlockHeight,
        });
      }
    }
    return results;
  },
});

/** Aggregate supply stats for the workspace: minted, moved, holders. */
export const supplyStats = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("ledger").collect();
    return {
      ...computeSupplyStats(all),
      entries: all.length,
    };
  },
});

/**
 * Public, read-only team ledger — any signed-in team member can audit it.
 * Newest page first via the system `_creation_time` index (O(page) reads per
 * request), paginated back to entry zero: older entries are always reachable,
 * never silently truncated away.
 */
export const recentLedger = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return EMPTY_PAGE_RESULT;
    return ctx.db.query("ledger").order("desc").paginate(paginationOpts);
  },
});

const EMPTY_PAGE_RESULT: PaginationResult<Doc<"ledger">> = {
  page: [],
  isDone: true,
  continueCursor: "",
};
