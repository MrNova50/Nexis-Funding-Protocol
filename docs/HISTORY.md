# HISTORY — append-only log of every cycle

> One entry per cycle. Never edited, never deleted. If a later cycle
> contradicts a decision recorded here, it says so explicitly in its own
> entry.

---

## Cycle 1 — 2026-09-09

### What changed

- Created the forever-project scaffolding: `docs/NORTH_STAR.md`,
  `docs/STATE.md`, `docs/HISTORY.md` (this file), and `DEMO.md`.
- **Rebranded the project as Nexis** at the founder's direction: an internal
  team currency minted from proven engineering work, not a public protocol.
  The proof engine from earlier in the cycle was kept intact and put in
  service of the currency: anchored proofs are now what mint NXS. Later in
  the cycle the project was named **Nexis Funding Protocol**, with Nexis as
  the app and NXS as the currency unit.
- Shipped the version-1 scope from the Forever Prompt: an **on-chain
  proof-of-contribution page for public contributors**.
- Added an `attestations` table (schema with `handle`, `kind`, and `status`
  indices) storing contribution records, manifests, sha256 digests, and OTS
  receipts.
- Added `handle` and `githubLogin` directly to the `users` table so email and
  anonymous guest accounts share one claiming/onboarding flow. An earlier
  plan for a separate `authedUsers` cross-session table was dropped during
  the cycle as overbuilt; instead, handles claimed by anonymous guests that
  never upgrade to email are reclaimable by signed-in accounts (attestations
  move with the handle).
- Built the public proof page `/p/:handle` (no sign-in required) showing
  contributions and their Bitcoin-anchored receipts.
- Built the dashboard flow: claim handle → connect GitHub → mint proof →
  mint receipt.
- Added the **Nexis (NXS) currency**: an append-only `ledger` table,
  issuance against Bitcoin-anchored proofs at 1 point = 1 NXS (once per
  proof, enforced by index), payments between member handles with memos,
  server-side balance checks, and a team-auditable ledger view.
- Extracted the money rules into `src/convex/rules.ts` (pure, no I/O) and
  added `scripts/nexis.test.ts` — 16 targeted unit tests covering issuance
  (rate, anchored-only, once-per-proof), the balance fold (supply
  conservation), payment validation (shape, self-pay, overdraft), handle
  format, and supply stats. The Convex handlers now delegate to the tested
  rules instead of inlining them, so the tested code is the shipped code.
- Added GitHub OAuth (server-side code→token exchange) and real GitHub
  commit fetching for the manifest.
- Integrated OpenTimestamps: real calendar stamping, real .ots receipt
  storage, real upgrade + verification against Bitcoin block attestation.
  Implemented the receipt format in-repo (`src/convex/otslib.ts`) because the
  official `opentimestamps` npm package depends on `bitcore-lib`, which
  cannot bundle into Convex actions; correctness was proven by round-tripping
  an official-client Bitcoin-anchored receipt and matching its block
  attestation exactly (`scripts/ots-smoke.ts`).
- Styled the whole app with a Claymorphism theme (plush rounded surfaces,
  matte pastels, inflated shadows) per the design brief.

### What was learned

- OpenTimestamps is the honest "on-chain proof" primitive for a v1 that
  doesn't want a wallet in the loop: it is free, the receipts are real .ots
  bytes verifiable by `ots verify` offline, and anchoring goes to actual
  Bitcoin block headers. A mock chain or an EVM PoC would have been more
  "web3-looking" and less real.
- Storing the raw receipt bytes (not a re-encoded version) matters: the
  receipt must round-trip so third parties can verify it independently.
- Guest and email accounts share the same claiming flow by putting the
  handle directly on the `users` row; a cross-session linking table was
  considered and cut as complexity the v1 doesn't need.
- The environment's edit-verification gate (backend must compile before
  further edits) caught several real mistakes early — e.g. a self-referential
  action type and a Node-only dependency in the default runtime. Compile
  early, compile often.
- Making the currency *non-convertible* was the decision that made it safe
  to ship fast: it keeps Nexis clearly on the accounting side of the
  accounting/securities line, matches the internal-team audience, and still
  exercises every hard part (issuance policy, double-spend prevention,
  auditability) that a real funding protocol will need later.

### What was deliberately deferred and why

- Any convertibility of NXS to money, and any treasury or admin minting:
  supply exists only as issuance against anchored proofs. This is the
  credibility of the currency.
- Smart-contract deployment: the ledger is centralized by design for now;
  anchoring is the on-chain layer. Migrating settlement on-chain is a
  deliberate future increment, not an accident.
- Background receipt-minting jobs: minting is user-triggered to keep the
  audit trail clean and costs visible; automate only if it becomes friction.
- Score formula refinement and anti-gaming (mint caps, review gates): the
  current formula is legible and honest; tighten only when issuance volume
  makes gaming a real risk.
