"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { outcomeFor, selectWork } from "./verifierRules";

/**
 * The cron tick (registered in src/convex/crons.ts): scan pending receipts
 * and verify/upgrade each one via the existing OTS path
 * (internal.ots.verifyOtsReceipt → internal.verifier.recordAttempt).
 *
 * The decisions (batching, attempt caps, spacing, outcome mapping) live in
 * src/convex/verifierRules.ts — pure and unit-tested — so the tested code is
 * the shipped code.
 *
 * Idempotent: only still-pending receipts with stored bytes are touched, an
 * anchored receipt is never re-verified, and every write goes through
 * recordAttempt, which is safe to re-run.
 */

type TickResult = {
  pending: number;
  checked: number;
  anchored: number;
  errors: number;
  skipped: number;
};

export const verifyPendingTick = internalAction({
  args: {},
  // Explicit return type: the body resolves `internal.*` (the whole API
  // graph), so an inferred return type would create a self-referential
  // inference cycle for this module.
  handler: async (ctx): Promise<TickResult> => {
    const pending = await ctx.runQuery(internal.verifier.pendingWithReceipts, {});
    const { toCheck, skipped } = selectWork(pending, Date.now());

    let anchored = 0;
    let errors = 0;

    for (const att of toCheck) {
      try {
        const result = await ctx.runAction(internal.ots.verifyOtsReceipt, {
          digest: att.digest,
          receipt: att.otsReceipt!,
        });

        const outcome = outcomeFor(result);
        if (outcome === "anchored" || outcome === "already_anchored") anchored += 1;

        await ctx.runMutation(internal.verifier.recordAttempt, {
          attestationId: att._id,
          trigger: "cron",
          outcome,
          receiptChanged: result.changed,
          receipt: result.receipt,
          bitcoinBlockHeight: result.bitcoinBlockHeight ?? undefined,
          bitcoinBlockTime: result.bitcoinBlockTime ?? undefined,
        });
      } catch (err) {
        errors += 1;
        await ctx.runMutation(internal.verifier.recordAttempt, {
          attestationId: att._id,
          trigger: "cron",
          outcome: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      pending: pending.length,
      checked: toCheck.length,
      anchored,
      errors,
      skipped,
    };
  },
});
