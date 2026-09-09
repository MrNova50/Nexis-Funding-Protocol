# STATE — Cycle 1 snapshot (post-rebrand)

> Rewritten every cycle so it always describes the project as it is right
> now. Not a changelog — HISTORY.md is the changelog. Last updated: Cycle 1,
> Nexis Funding Protocol rename (September 2026).

## What this project is

**Nexis Funding Protocol** (the protocol, implemented by the **Nexis** app,
minting the **NXS** currency) — an internal team currency minted from
provable engineering work.
A member proves a contribution (real commits from GitHub, hashed, anchored in
the Bitcoin blockchain via OpenTimestamps), and the corresponding amount of
**Nexis (NXS)** is issued on an append-only, team-auditable ledger. Members
settle with each other in NXS. NXS is deliberately *not* convertible to money
and *not* a token — it is an internal unit of account with a published,
mechanical monetary policy.

The long-term mission lives in `docs/NORTH_STAR.md` (fund open-source
contributors proportional to proven contribution, verified on-chain). Nexis is
that mission applied first to one team: the proof primitive and the
accounting primitive come before any external funding flows.

## Mission file

`docs/NORTH_STAR.md` — fixed, does not expire.

## Cycle 1 goal (as delivered)

An on-chain proof-of-contribution system for the team, plus the currency it
mints: prove work → anchor it → redeem it for NXS → pay teammates → audit the
ledger.

## What exists right now

- **Landing (`/`)** — the Nexis story: commit → anchored proof → minted NXS,
  with the monetary policy stated plainly.
- **Auth (`/auth`)** — email OTP or anonymous guest, via Convex Auth.
- **Workspace (`/dashboard`, sign-in required)** — a member can:
  - claim a **member handle** (the account address on the ledger and the URL
    of their public proof page). Guest-claimed handles that never upgrade to
    email are reclaimable;
  - connect GitHub (real OAuth code exchange server-side);
  - **mint a proof** for a public repo + commit range: real commits from
    GitHub's API, legible scoring (kind "commits": weight 1 each; kind
    "pull_request": merge commits 5, others 3), deterministic manifest +
    sha256 digest;
  - **mint / verify the OTS receipt** (real calendars, raw .ots bytes stored,
    upgrade to Bitcoin block attestation, block height + time stored);
  - **redeem anchored proofs** — each anchored proof mints NXS at 1 point =
    1 NXS, exactly once, enforced server-side via the ledger's
    by-attestation index;
  - **pay NXS** to any member handle with an optional memo — balance checked
    server-side before the entry is written;
  - watch the **team ledger**: every issuance cites the proof digest that
    minted it, every payment cites sender, recipient, and memo.
- **Public proof page (`/p/:handle`)** — no sign-in; shows the member's
  proofs, receipt status, Bitcoin block anchors, and explains that anchored
  proofs are what mint NXS.
- **Ledger schema (`ledger` table)** — append-only: `issuance` (toHandle,
  amount, attestationId, digest) and `payment` (fromHandle, toHandle,
  amount, note). Whole-number NXS only.
- **Tested money rules (`src/convex/rules.ts`)** — pure module holding the
  issuance rate, once-per-proof rule, balance fold, and payment validation;
  exercised by `bun test scripts/nexis.test.ts` (16 tests). Convex handlers
  in `nexis.ts` delegate to it. The OTS protocol layer has its own smoke
  check (`bun run scripts/ots-smoke.ts`) against a real Bitcoin-anchored
  receipt.

## What works end-to-end today

Claim a handle → connect GitHub → mint a proof from real commits → anchor it
in Bitcoin → redeem it for NXS → pay a teammate → both parties see the entry
on the shared ledger → anyone can open `/p/<handle>` and independently verify
the receipt with `ots verify`.

## What is deliberately NOT built

- No convertibility: NXS cannot be bought, sold, or redeemed for money.
- No treasury, no admin minting — supply exists *only* as issuance against
  anchored proofs.
- No wallet integration, no smart contracts — "on-chain" means
  Bitcoin-anchored via OpenTimestamps.
- No external/ public funding flows; access is the team's.

## Fragile points / known debts

- Balances are computed by scanning ledger entries per query (two indexed
  scans + sum). Fine for a team; becomes a real design question at scale.
- The ledger view truncates (latest ~100 entries; wallet view ~200) — no
  pagination yet.
- OTS anchoring latency: receipts are minted in seconds but confirm in a
  Bitcoin block (minutes to hours); redemption is blocked until then by
  design.
- The OTS receipt format is implemented in-repo (`src/convex/otslib.ts`)
  because the npm package's `bitcore-lib` dep cannot bundle in Convex;
  byte-compatibility is proven by `scripts/ots-smoke.ts` against an
  official-client receipt.
- Handle takeover: a guest handle is reclaimable by any signed-in account;
  attestations move with it. Ledger entries reference handles, so a
  takeover keeps history attached to the handle (this is intentional).

## Possible next increments (not a plan — next cycle decides)

- Ledger pagination and a per-member balance cache if the scans start to hurt.
- A scheduled job that auto-verifies pending receipts so anchoring doesn't
  depend on someone clicking verify.
- An explicit "team treasury" account and treasury-funded grants paid in NXS,
  which would be the first step from internal accounting toward the mission's
  funding flows.
- Per-member mint caps or decay if unbounded issuance from self-scored proofs
  becomes a trust problem — likely the first real governance question.

## Learning to carry forward

- Renaming and repositioning (public protocol → internal team currency) was
  cheap because the auditability constraints were already in place: the same
  ledger, events, and explicit issuance rules carried over intact.
- A currency's credibility is mostly its monetary policy being legible and
  mechanically enforced — the "once per proof, only if anchored" rule is the
  product.
