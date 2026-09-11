/**
 * Pure decision rules for the background OTS verifier
 * (src/convex/verifierActions.ts). No I/O, no Convex — the same shape as
 * src/convex/rules.ts so the tested code is the shipped code.
 *
 * Politeness rules (OTS calendars + mempool.space are shared services):
 *  - BATCH_LIMIT bounds the work per tick;
 *  - MAX_ATTEMPTS caps retries per receipt so a hopeless receipt stops
 *    hitting the calendars;
 *  - MIN_INTERVAL_MS keeps re-checks of one receipt spaced out in time.
 */

export const BATCH_LIMIT = 5;
export const MAX_ATTEMPTS = 48;
export const MIN_INTERVAL_MS = 15 * 60 * 1000;

/** The fields of a pending attestation the selection logic looks at. */
export type PendingCandidate = {
  verifyAttempts?: number;
  lastVerifiedAt?: number;
};

export type SkipReason = "exhausted" | "recently_checked" | "batch_full";

/**
 * Why this receipt should not be checked right now, or null if it should.
 * `checked` is how many receipts this tick has already committed to.
 */
export function skipReason(
  att: PendingCandidate,
  now: number,
  checked: number,
): SkipReason | null {
  if (checked >= BATCH_LIMIT) return "batch_full";
  if ((att.verifyAttempts ?? 0) >= MAX_ATTEMPTS) return "exhausted";
  if (
    att.lastVerifiedAt !== undefined &&
    now - att.lastVerifiedAt < MIN_INTERVAL_MS
  ) {
    return "recently_checked";
  }
  return null;
}

/**
 * Split the pending work list into what this tick should verify (in order)
 * and how many entries were skipped for politeness/cap reasons. Generic so
 * callers pass full attestation documents and get them back intact.
 */
export function selectWork<T extends PendingCandidate>(
  pending: T[],
  now: number,
): { toCheck: T[]; skipped: number } {
  const toCheck: T[] = [];
  let skipped = 0;
  for (const att of pending) {
    if (skipReason(att, now, toCheck.length) !== null) {
      skipped += 1;
      continue;
    }
    toCheck.push(att);
  }
  return { toCheck, skipped };
}

/** The result shape of internal.ots.verifyOtsReceipt (subset). */
export type VerifyResult = {
  changed: boolean;
  bitcoinBlockHeight: number | null;
  bitcoinBlockTime: number | null;
};

export type AttemptOutcome = "anchored" | "already_anchored" | "pending";

/**
 * Map a verify result to an audit-log outcome:
 *  - "anchored": this attempt upgraded the receipt to a Bitcoin block;
 *  - "already_anchored": the block attestation was already in the stored
 *    bytes but the row was still pending (catches up missed upgrades);
 *  - "pending": no Bitcoin attestation yet (expected while waiting).
 */
export function outcomeFor(result: VerifyResult): AttemptOutcome {
  if (
    result.bitcoinBlockHeight === null ||
    result.bitcoinBlockTime === null
  ) {
    return "pending";
  }
  return result.changed ? "anchored" : "already_anchored";
}
