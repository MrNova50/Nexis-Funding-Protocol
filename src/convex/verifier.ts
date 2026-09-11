import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

/**
 * Bookkeeping for automatic + manual OTS receipt verification.
 *
 * A minted receipt is "pending" until a Bitcoin block completes it. Until
 * now that required the creator to click "Re-verify receipt"; the cron in
 * src/convex/crons.ts runs the verifier (src/convex/verifierActions.ts,
 * a Node action) every 10 minutes so anchoring completes on its own.
 * Every attempt — cron or manual — is recorded here so failures are
 * inspectable, not silent.
 */

/**
 * Pending attestations that have stored receipt bytes — the cron's work list.
 */
export const pendingWithReceipts = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("attestations")
      .withIndex("status", (q) => q.eq("status", "pending"))
      .filter((q) => q.neq(q.field("otsReceipt"), undefined))
      .collect();
  },
});

/**
 * Record one verification attempt's outcome: append to the audit log,
 * update the receipt's bookkeeping fields, and (on success) flip the
 * attestation to anchored.
 *
 * Outcome semantics:
 *  - "anchored": this attempt upgraded the receipt to a Bitcoin block.
 *  - "already_anchored": checked, the receipt already carried the block
 *    attestation but the row was still pending (catches up missed upgrades).
 *  - "pending": checked, no Bitcoin attestation yet (expected while waiting
 *    for the next block).
 *  - "error": the check itself failed (calendars/explorer/network).
 */
export const recordAttempt = internalMutation({
  args: {
    attestationId: v.id("attestations"),
    trigger: v.union(v.literal("cron"), v.literal("manual")),
    outcome: v.union(
      v.literal("anchored"),
      v.literal("already_anchored"),
      v.literal("pending"),
      v.literal("error"),
    ),
    error: v.optional(v.string()),
    receiptChanged: v.optional(v.boolean()),
    receipt: v.optional(v.string()),
    bitcoinBlockHeight: v.optional(v.number()),
    bitcoinBlockTime: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const att = await ctx.db.get(args.attestationId);
    if (!att) return;

    const now = Date.now();
    const trimmedError = args.error?.slice(0, 300);

    if (args.outcome === "error") {
      await ctx.db.patch(args.attestationId, {
        lastVerifiedAt: now,
        verifyAttempts: (att.verifyAttempts ?? 0) + 1,
        lastVerifyError: trimmedError ?? "unknown error",
      });
      await ctx.db.insert("otsVerificationLog", {
        attestationId: args.attestationId,
        trigger: args.trigger,
        outcome: "error",
        error: trimmedError,
        receiptChanged: false,
      });
      return;
    }

    const anchoredNow =
      args.outcome === "anchored" || args.outcome === "already_anchored";
    const receiptPatch = args.receiptChanged && args.receipt ? { otsReceipt: args.receipt } : {};

    if (anchoredNow) {
      await ctx.db.patch(args.attestationId, {
        ...receiptPatch,
        status: "anchored",
        bitcoinBlockHeight: args.bitcoinBlockHeight!,
        bitcoinBlockTime: args.bitcoinBlockTime!,
        lastVerifiedAt: now,
        verifyAttempts: 0,
        lastVerifyError: undefined,
      });
    } else {
      await ctx.db.patch(args.attestationId, {
        ...receiptPatch,
        lastVerifiedAt: now,
        verifyAttempts: (att.verifyAttempts ?? 0) + 1,
        lastVerifyError: undefined,
      });
    }

    await ctx.db.insert("otsVerificationLog", {
      attestationId: args.attestationId,
      trigger: args.trigger,
      outcome: args.outcome,
      receiptChanged: args.receiptChanged ?? false,
    });
  },
});
