"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import {
  deserializeDetached,
  mintRoot,
  serializeDetached,
  toHex,
  upgradeRoot,
  checkBitcoin,
  fromHex,
} from "./otslib";

/**
 * Submit the attestation digest to real OpenTimestamps aggregators and
 * return the raw receipt bytes (hex). The receipt starts as "pending" (a
 * Bitcoin block has to be mined before it completes); follow-up calls to
 * `verifyOtsReceipt` upgrade it in place.
 */
export const mintOtsReceipt = internalAction({
  args: { digest: v.string() },
  handler: async (_ctx, { digest }) => {
    const d = fromHex(digest);
    if (d.length !== 32) {
      throw new Error("Digest must be a 32-byte sha256 hex string.");
    }
    const root = await mintRoot(d);
    return { receipt: toHex(serializeDetached(root)) };
  },
});

/**
 * Upgrade + verify an existing receipt: ask calendars for the Bitcoin
 * attestation, then prove the anchored message against a real block header.
 * Returns the (possibly upgraded) receipt and Bitcoin block info when the
 * digest is now Bitcoin-anchored.
 */
export const verifyOtsReceipt = internalAction({
  args: { digest: v.string(), receipt: v.string() },
  handler: async (_ctx, { digest, receipt }) => {
    const { digest: d, root } = deserializeDetached(receipt);
    if (toHex(d) !== digest.toLowerCase()) {
      throw new Error(
        `Receipt digest mismatch: receipt proves ${toHex(d)}, expected ${digest}`,
      );
    }

    await upgradeRoot(root);
    const anchored = await checkBitcoin(root);

    const upgraded = toHex(serializeDetached(root));
    return {
      receipt: upgraded,
      changed: upgraded !== receipt.toLowerCase(),
      bitcoinBlockHeight: anchored?.height ?? null,
      bitcoinBlockTime: anchored?.blockTime ?? null,
    };
  },
});
