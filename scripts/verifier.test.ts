/**
 * Targeted tests for the background OTS verifier's decision rules
 * (src/convex/verifierRules.ts) — the politeness and outcome logic behind
 * the 10-minute anchoring cron. Run with: bun test scripts/verifier.test.ts
 *
 * Pure unit tests: no Convex, no network. The protocol layer it drives is
 * covered by scripts/ots-smoke.ts; the live tick (verifierActions.ts) wires
 * these rules to the database and the calendars.
 */
import { describe, expect, test } from "bun:test";

import {
  BATCH_LIMIT,
  MAX_ATTEMPTS,
  MIN_INTERVAL_MS,
  outcomeFor,
  selectWork,
  skipReason,
  type PendingCandidate,
  type VerifyResult,
} from "../src/convex/verifierRules";

const MIN = 60_000;
const NOW = 1_000_000_000_000;

describe("skipReason (politeness + caps)", () => {
  test("a fresh receipt is never skipped", () => {
    expect(skipReason({}, NOW, 0)).toBeNull();
    expect(skipReason({ verifyAttempts: 47 }, NOW, 0)).toBeNull();
  });

  test("a recently checked receipt waits MIN_INTERVAL_MS", () => {
    const att: PendingCandidate = { lastVerifiedAt: NOW - (MIN_INTERVAL_MS - 1) };
    expect(skipReason(att, NOW, 0)).toBe("recently_checked");
    // Exactly at the interval it becomes eligible again.
    const due: PendingCandidate = { lastVerifiedAt: NOW - MIN_INTERVAL_MS };
    expect(skipReason(due, NOW, 0)).toBeNull();
  });

  test("a receipt that exhausted its attempt budget is never touched again", () => {
    const att: PendingCandidate = { verifyAttempts: MAX_ATTEMPTS };
    expect(skipReason(att, NOW, 0)).toBe("exhausted");
    expect(skipReason({ verifyAttempts: MAX_ATTEMPTS + 5 }, NOW, 0)).toBe(
      "exhausted",
    );
  });

  test("the batch cap applies before anything else", () => {
    expect(skipReason({}, NOW, BATCH_LIMIT)).toBe("batch_full");
    expect(skipReason({}, NOW, BATCH_LIMIT + 1)).toBe("batch_full");
    // Even an exhausted receipt just counts as skipped once the batch is full.
    expect(skipReason({ verifyAttempts: MAX_ATTEMPTS }, NOW, BATCH_LIMIT)).toBe(
      "batch_full",
    );
  });
});

describe("selectWork (batching the pending list)", () => {
  test("returns at most BATCH_LIMIT receipts, in order, skipping the rest", () => {
    const pending: PendingCandidate[] = [{}, {}, {}, {}, {}, {}, {}];
    const { toCheck, skipped } = selectWork(pending, NOW);
    expect(toCheck).toHaveLength(BATCH_LIMIT);
    expect(skipped).toBe(pending.length - BATCH_LIMIT);
  });

  test("priority order is preserved: oldest-first lists are served first", () => {
    const pending: PendingCandidate[] = [
      { verifyAttempts: 10 },
      { verifyAttempts: 0 },
      {},
    ];
    const { toCheck } = selectWork(pending, NOW);
    expect(toCheck).toEqual(pending);
  });

  test("skips exhausted and recently-checked receipts but still fills the batch", () => {
    const pending: PendingCandidate[] = [
      { verifyAttempts: MAX_ATTEMPTS }, // exhausted → skip
      { lastVerifiedAt: NOW - 2 * MIN }, // too recent → skip
      { verifyAttempts: 1, lastVerifiedAt: NOW - 20 * MIN }, // due (outside window)
      { verifyAttempts: 48 }, // exhausted → skip
      {}, // fresh
    ];
    const { toCheck, skipped } = selectWork(pending, NOW);
    expect(toCheck).toEqual([
      { verifyAttempts: 1, lastVerifiedAt: NOW - 20 * MIN },
      {},
    ]);
    expect(skipped).toBe(3);
  });

  test("an empty pending list selects nothing", () => {
    const { toCheck, skipped } = selectWork([], NOW);
    expect(toCheck).toEqual([]);
    expect(skipped).toBe(0);
  });
});

describe("outcomeFor (audit outcome mapping)", () => {
  test("no block attestation yet → pending", () => {
    const r: VerifyResult = { changed: false, bitcoinBlockHeight: null, bitcoinBlockTime: null };
    expect(outcomeFor(r)).toBe("pending");
    expect(
      outcomeFor({ changed: true, bitcoinBlockHeight: null, bitcoinBlockTime: null }),
    ).toBe("pending");
  });

  test("upgraded to a block this attempt → anchored", () => {
    const r: VerifyResult = { changed: true, bitcoinBlockHeight: 900000, bitcoinBlockTime: 1_800_000_000 };
    expect(outcomeFor(r)).toBe("anchored");
  });

  test("block attestation already present, bytes unchanged → already_anchored", () => {
    const r: VerifyResult = { changed: false, bitcoinBlockHeight: 900000, bitcoinBlockTime: 1_800_000_000 };
    expect(outcomeFor(r)).toBe("already_anchored");
  });
});
