/**
 * Protocol smoke test for src/convex/otslib.ts — run with:
 *   bun run scripts/ots-smoke.ts
 *
 * Everything here uses REAL data, no mocks:
 *   1. Round-trips a genuine Bitcoin-anchored receipt minted by the official
 *      OTS client (examples/hello-world.txt.ots, anchored in block 358391)
 *      and verifies it against real block headers from mempool.space. The
 *      expected result matches `ots verify` from the reference client.
 *   2. Mints a real receipt for a fresh digest against the live OpenTimestamps
 *      aggregators and re-parses the bytes we produced.
 *
 * Fixtures live in scripts/fixtures/. hello-world.txt.ots comes from the
 * official javascript-opentimestamps repo (examples/).
 */

import { readFileSync } from "fs";
import {
  mintRoot,
  serializeDetached,
  deserializeDetached,
  upgradeRoot,
  checkBitcoin,
  toHex,
  fromHex,
} from "../src/convex/otslib";

const KNOWN_DIGEST =
  "03ba204e50d126e4674c005e04d82e84c21366780af1f43bd54a37816b6ab340";
const EXPECTED_HEIGHT = 358391;
const EXPECTED_BLOCKTIME = 1432827678; // 2015-05-28 GMT, matches `ots verify`

async function main() {
  // --- 1. Parse + verify a genuine Bitcoin-anchored receipt ---------------
  console.log("== Verify: official hello-world.txt.ots vs mempool.space ==");
  const receiptHex = readFileSync("scripts/fixtures/hello-world.txt.ots").toString(
    "hex",
  );
  const { digest, root } = deserializeDetached(receiptHex);
  if (toHex(digest) !== KNOWN_DIGEST) {
    throw new Error(
      `digest mismatch: got ${toHex(digest)}, expected ${KNOWN_DIGEST}`,
    );
  }
  const reser = toHex(serializeDetached(root));
  const rt = deserializeDetached(reser);
  if (toHex(serializeDetached(rt.root)) !== reser) {
    throw new Error("serialize/deserialize is not stable");
  }
  console.log("round-trip OK,", reser.length / 2, "bytes");

  await upgradeRoot(root);
  const anchored = await checkBitcoin(root);
  if (!anchored) {
    throw new Error("receipt did not verify against mempool.space");
  }
  if (
    anchored.height !== EXPECTED_HEIGHT ||
    anchored.blockTime !== EXPECTED_BLOCKTIME
  ) {
    throw new Error(
      `unexpected anchor: block ${anchored.height} time ${anchored.blockTime}, expected ${EXPECTED_HEIGHT}/${EXPECTED_BLOCKTIME}`,
    );
  }
  console.log(
    `VERIFIED: bitcoin block ${anchored.height} attests existence at ${new Date(
      anchored.blockTime * 1000,
    ).toISOString()} (matches official ots verify)`,
  );

  // --- 2. Mint a real receipt against live aggregators --------------------
  console.log("\n== Mint: live OpenTimestamps aggregators ==");
  const mintDigest = fromHex(
    "1111111111111111111111111111111111111111111111111111111111111111",
  );
  const root2 = await mintRoot(mintDigest);
  const receipt2 = toHex(serializeDetached(root2));
  const back = deserializeDetached(receipt2);
  if (toHex(back.digest) !== toHex(mintDigest)) {
    throw new Error("minted receipt does not prove the minted digest");
  }
  const hasPending = JSON.stringify(
    (function collect(n: unknown): string[] {
      return [];
    })(root2),
  );
  console.log(
    "minted receipt:",
    receipt2.length / 2,
    "bytes; parses and proves the right digest OK",
  );
  console.log(
    "(pending attestation until a Bitcoin block confirms; the app upgrades receipts on later verify runs)",
  );

  console.log("\nAll smoke checks passed.");
}

main().catch((err) => {
  console.error("SMOKE TEST FAILED:", err);
  process.exit(1);
});
