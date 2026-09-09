# Nexis Funding Protocol

**Nexis** — proof of engineering work, minted into an auditable team
currency. (Naming: **Nexis Funding Protocol** is the protocol, **Nexis** is
the app that implements it, and **NXS** is the currency it mints.)

[![CI](https://github.com/YOUR_USERNAME/nexis/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_USERNAME/nexis/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Nexis anchors contributions to real public repositories in the **Bitcoin
blockchain** (via OpenTimestamps) and mints **NXS** — an internal team
currency — at a fixed, published rate against those anchored proofs. Balances
and payments live on an append-only ledger every member can audit, line by
line. The protocol is open source (MIT) and designed so its accounting can
outlive the app that runs it.

## The problem

Every funding/bounty platform eventually pays out against a claim it cannot
verify: someone asserts they contributed, a maintainer or admin eyeballs it,
money moves. The evidence itself is never anchored to anything tamper-proof,
so the money layer inherits the trust assumptions of whoever operates the
database.

Nexis inverts the order: **proof first, currency second.** The proof is a
deterministic manifest (repo, commit range, commits, scoring rule) hashed
with SHA-256 and timestamped into a Bitcoin block header. Only then does the
ledger mint currency against it — mechanically, at a rate anyone can read,
once per proof, with no admin override.

## How Nexis differs

| | Nexis | Drips | GrantFox | Grainlify |
|---|---|---|---|---|
| Core question | *Did this work happen?* | *How should money stream?* | *Which bounty pays out?* | *How should bounties be priced?* |
| Money layer | Internal ledger, minted from proofs | ERC-20 streaming on Ethereum | Stellar smart escrows | Allocation rules over bounties |
| Evidence | SHA-256 manifest anchored in Bitcoin (OpenTimestamps) | None required | Milestone sign-off | Contribution metadata |
| Currency | NXS — not a token, not convertible | Real tokens | USDC | Platform bounties |
| Trust model | Chain anchor + append-only ledger anyone can fold | Ethereum contracts | Escrow contracts | Published rules, operator-run |

The projects above are distribution layers for money that exists elsewhere.
Nexis is the **issuance layer**: it manufactures the *evidence-backed* unit
of account from work itself. It is also deliberately narrower — built for one
team's internal accounting today, with the auditability to grow into
proportional funding later (see [docs/NORTH_STAR.md](docs/NORTH_STAR.md)).

**Honesty clause:** NXS is not a cryptocurrency, cannot be bought or sold, and
never leaves the team. The web3 substance is the Bitcoin-anchored proof layer
and the independently verifiable evidence — not tokenomics.

## What's verifiable, right now

- Every proof page (`/p/:handle`) exposes a downloadable `.ots` receipt that
  verifies **offline** with the standard client: `ots verify receipt.ots`.
- The mint logic in the ledger enforces: anchored-only, exactly-once, fixed
  rate — covered by unit tests (`bun test scripts/nexis.test.ts`).
- The OTS implementation itself is proven against the official client:
  `bun run scripts/ots-smoke.ts` round-trips a real Bitcoin-anchored receipt
  and matches its verdict (block 358391, 2015-05-28).

## Architecture in one screen

```
GitHub (real commits)
   │  fetch + legible scoring (PR merge ×5, PR commit ×3, commit ×1)
   ▼
Deterministic manifest ──sha256──▶ digest
   │                                  │
   │                                  ▼
   │                     OpenTimestamps calendars
   │                                  │
   │                                  ▼
   │                        Bitcoin block header   ← the on-chain anchor
   ▼                                  
Append-only ledger ──▶ NXS issuance (1 point = 1 NXS, once per proof)
   │
   └──▶ payments between members (balance computed, never stored)
```

Money rules live in a pure module (`src/convex/rules.ts`) so the tested code
is the shipped code.

## Setup

**Prereqs:** [Bun](https://bun.sh), a Convex account (free tier works).

```bash
bun install
bunx convex dev --once      # push schema + functions, generate types
bun test scripts/nexis.test.ts   # money rules: 16 tests
bun run scripts/ots-smoke.ts     # OTS protocol vs. real Bitcoin data
```

Then open the app (the platform serves it automatically in this environment)
and: **sign in → claim a handle → mint a proof → wait for the Bitcoin anchor
→ redeem for NXS → pay a teammate.**

Full step-by-step demo script: **[DEMO.md](DEMO.md)**.

### Optional environment variables

| Variable | Purpose |
|---|---|
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | "Connect GitHub" OAuth linking |
| `GITHUB_TOKEN` | Higher GitHub API rate limits (minting works without) |

Never commit these — configure them through your platform's secret store.

## The forever-project docs

This repo runs on a perpetual-cycle prompt: no roadmap to completion, one
honest increment per cycle, decided fresh each time by reading the state of
the project.

- [docs/NORTH_STAR.md](docs/NORTH_STAR.md) — the mission that never changes
- [docs/STATE.md](docs/STATE.md) — what exists right now (rewritten every cycle)
- [docs/HISTORY.md](docs/HISTORY.md) — append-only log of every cycle

## Status

Cycle 1 complete: proof engine, Bitcoin anchoring, NXS issuance, payments,
auditable ledger, 16 passing money-rule tests. Tagged `v0.1.0-mvp`.

## License

[MIT](LICENSE)
