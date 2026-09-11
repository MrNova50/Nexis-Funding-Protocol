import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Every ~10 minutes: verify pending OTS receipts so a minted proof becomes
// Bitcoin-anchored without anyone having to click "Re-verify receipt".
// See src/convex/verifier.ts for batch limits and politeness backoff.
crons.interval(
  "verify-pending-ots-receipts",
  { minutes: 10 },
  internal.verifierActions.verifyPendingTick,
  {},
);

export default crons;
