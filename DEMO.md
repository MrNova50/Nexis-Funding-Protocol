# DEMO — Cycle 1: Nexis Funding Protocol — a currency minted from proven work

A 90-second script for presenting this cycle's increment, followed by exact
reproduction steps.

---

## The 90-second script

**[0:00–0:15] What Nexis is.**
"Nexis is our team's internal currency — NXS — and it is minted by one thing
only: engineering work you can prove. Not allocated, not purchased — issued
against cryptographic evidence, at a published rate, on a ledger every member
can audit."

**[0:15–0:35] Prove the work.**
Sign in, claim a handle, and point at a commit range on a public repo. Nexis
pulls the real commits from GitHub's API, scores them with a rule that's
written into the manifest itself, and hashes everything with SHA-256. The
hash is timestamped through OpenTimestamps into an actual Bitcoin block
header — nobody, including this service, can backdate or edit it.

**[0:35–0:55] Mint the currency.**
Once the proof is Bitcoin-anchored, redeem it: the ledger mints one NXS per
contribution point, exactly once per proof — enforced server-side, not on
the honor system. Show the balance appear in the brass wallet.

**[0:55–1:15] Settle with the team.**
Pay a teammate some NXS with a memo. Both sides see the entry land on the
shared, append-only ledger — mints cite the proof digest that created them,
payments cite their sender. The whole money supply reconciles from entry
zero.

**[1:15–1:30] The honesty clause.**
"NXS is not convertible to money and never leaves the team — it's an
internal unit of account, and it's credible because the issuance policy is
mechanical and the ledger is public to the team. The same primitives —
anchored proof and auditable issuance — are exactly what the longer-term
mission needs before any real funding flows."

---

## Reproduce locally (exact steps)

1. **Backend up.** `bunx convex dev --once` pushes schema + functions
   (includes the new `ledger` table). The Freebuff preview runs Convex
   automatically; use `--once` only for manual codegen.
2. **Verify the protocol layer (optional):**
   ```
   bun run scripts/ots-smoke.ts
   ```
   Round-trips an official Bitcoin-anchored OTS receipt and matches the
   reference client exactly, then mints a fresh live receipt.
3. **Sign in** at `/auth` — team email (OTP) or guest.
4. **Claim a handle** on `/dashboard` (e.g. `alice`). Optionally connect
   GitHub (needs `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` in the Convex
   environment; minting works without it).
5. **Mint a proof**: public repo (`owner/name`), from/to commits (SHAs,
   branch, or tag; `from` exclusive), kind. Submit — the receipt is minted in
   seconds and stays `pending` until a Bitcoin block confirms.
6. **Wait for the block, then press "Re-verify receipt"** — status flips to
   anchored with block height + time. (Bitcoin blocks average ~10 minutes;
   anchors via OpenTimestamps can take longer.)
7. **Redeem**: the anchored proof appears under "Redeem anchored proofs" —
   press **Mint N NXS**. The balance updates in the wallet.
8. **Pay a teammate**: enter their handle, an amount, and a memo, and send.
   Sign in as the recipient (or a second browser profile) to see the entry
   credited, and watch both entries appear in the team ledger.
9. **Audit**: open `/p/alice` signed out — proofs, Bitcoin anchors, and the
   note that anchored proofs mint NXS. Download the `.ots` receipt and run
   `ots verify` locally; the manifest's sha256 equals the anchored digest.

### What makes it auditable

- One proof → one issuance, enforced by a ledger index, not conventions.
- Balances are computed from ledger entries server-side; a payment that
  overdraws is rejected before anything is written.
- The manifest records the scoring rule; its hash is what's anchored in
  Bitcoin; the ledger entry that minted NXS cites that hash.
