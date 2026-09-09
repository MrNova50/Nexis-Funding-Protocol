/**
 * Pure Nexis currency rules — no Convex, no Node, no I/O.
 *
 * This module exists so the money rules are testable in isolation
 * (scripts/nexis.test.ts) and so the server handlers and the client never
 * drift apart on validation. Everything here must stay side-effect free.
 *
 * Supply policy: NXS enters circulation only when a Bitcoin-anchored proof
 * of contribution is redeemed, at a fixed rate of 1 contribution point = 1
 * NXS, once per proof. Payments move existing NXS between handles.
 */

export const ISSUANCE_RATE = 1; // NXS per contribution-score point

export const HANDLE_RE = /^[a-z0-9][a-z0-9-]{1,31}$/;

export type LedgerEntry = {
  kind: "issuance" | "payment";
  toHandle: string;
  fromHandle?: string;
  amount: number;
};

/**
 * Balance of a handle = credits − debits over the whole ledger.
 * The append-only ledger is the single source of truth; there is no mutable
 * balance field anywhere in the system.
 */
export function balanceOf(ledger: LedgerEntry[], handle: string): number {
  let total = 0;
  for (const e of ledger) {
    if (e.toHandle === handle) total += e.amount;
    if (e.fromHandle !== undefined && e.fromHandle === handle) total -= e.amount;
  }
  return total;
}

/**
 * NXS minted by redeeming a proof.
 * Only Bitcoin-anchored proofs qualify, and each proof redeems exactly once.
 */
export function issuanceFor(
  att: { status: string; score: number },
  alreadyRedeemed: boolean,
): number {
  if (att.status !== "anchored") {
    throw new Error(
      "This proof is not Bitcoin-anchored yet. Run the receipt verification first.",
    );
  }
  if (alreadyRedeemed) {
    throw new Error(
      "This proof has already been redeemed — each proof mints NXS exactly once.",
    );
  }
  return att.score * ISSUANCE_RATE;
}

export type PayValidationResult =
  | { ok: true; toHandle: string; amount: number }
  | { ok: false; error: string };

/**
 * Validate a payment against the payer's computed balance. Pure: callers
 * apply the ledger append themselves after this passes.
 */
export function validatePayment(
  input: {
    payerHandle: string;
    toHandle: string;
    amount: number;
    note?: string;
  },
  ledger: LedgerEntry[],
): PayValidationResult {
  const toHandle = input.toHandle.toLowerCase().trim();

  if (!HANDLE_RE.test(toHandle)) {
    return { ok: false, error: "That recipient handle is invalid." };
  }
  if (toHandle === input.payerHandle) {
    return { ok: false, error: "You cannot pay yourself." };
  }
  if (
    !Number.isFinite(input.amount) ||
    input.amount <= 0 ||
    !Number.isInteger(input.amount)
  ) {
    return { ok: false, error: "Amount must be a positive whole number of NXS." };
  }
  const balance = balanceOf(ledger, input.payerHandle);
  if (balance < input.amount) {
    return {
      ok: false,
      error: `Insufficient balance: you hold ${balance} NXS but tried to send ${input.amount}.`,
    };
  }
  return { ok: true, toHandle, amount: input.amount };
}

/** Aggregate stats over the ledger: minted, moved, current holder count. */
export function supplyStats(ledger: LedgerEntry[]): {
  minted: number;
  moved: number;
  holders: number;
} {
  let minted = 0;
  let moved = 0;
  const balances = new Map<string, number>();
  for (const e of ledger) {
    if (e.kind === "issuance") minted += e.amount;
    if (e.kind === "payment") moved += e.amount;
    balances.set(e.toHandle, (balances.get(e.toHandle) ?? 0) + e.amount);
    if (e.fromHandle !== undefined) {
      balances.set(e.fromHandle, (balances.get(e.fromHandle) ?? 0) - e.amount);
    }
  }
  return {
    minted,
    moved,
    holders: [...balances.values()].filter((v) => v !== 0).length,
  };
}
