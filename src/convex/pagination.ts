/**
 * Cursor pagination for the ledger views (team ledger, public per-handle
 * history).
 *
 * The ledger's canonical order is `_creationTime` ascending with `_id`
 * breaking ties (see `compareLedgerKeys` in ./rules.ts). Ledger pages are
 * served newest-first; the client walks backward page by page. Because a
 * cursor carries a full sort key — not just a timestamp — paging is gapless
 * even when many entries share one `_creationTime` (every insert in a single
 * transaction does).
 *
 * The per-handle view fetches its candidate set with two indexed scans
 * (credits + debits) and windows it in memory via `windowedPage`, so the
 * merge order stays pure and unit-testable. `windowedPage` output is wrapped
 * into Convex's standard `PaginationResult` shape by `toPaginationResult`,
 * which lets the client use the stock `usePaginatedQuery` hook for page
 * accumulation and "load more" state.
 */
import type { PaginationResult } from "convex/server";
import type { Doc } from "./_generated/dataModel";
import { LEDGER_PAGE_SIZE } from "./rules";

export const PAGE_SIZE = LEDGER_PAGE_SIZE;

/**
 * Window a fully-sorted candidate set (newest first) into one page.
 *
 * `cursor` is the full sort key of the last entry the client already has
 * (see `toCursor`); the window starts at the first strictly-older entry.
 * Pure and deterministic over the same candidate set, so paging page by page
 * walks the candidate set exactly once: no gaps, no repeats — the audit
 * property. New entries appended above the cursor merely shift the window;
 * they never hide already-fetched history.
 */
export function windowedPage(
  sortedDesc: Doc<"ledger">[],
  cursor: string | null,
  numItems: number,
): LedgerPage {
  let start = 0;
  if (cursor) {
    const [timeStr, ...idRest] = cursor.split("|");
    const time = Number.parseFloat(timeStr ?? "");
    const id = idRest.join("|");
    start = sortedDesc.findIndex((e) => {
      if (e._creationTime !== time) return e._creationTime < time;
      return String(e._id) < id;
    });
    if (start === -1) start = sortedDesc.length;
  }
  const size = clampPageSize(numItems);
  const slice = sortedDesc.slice(start, start + size);
  const last = slice.length > 0 ? slice[slice.length - 1] : undefined;
  return {
    page: slice,
    cursor:
      last !== undefined && start + size < sortedDesc.length
        ? toCursor(last)
        : null,
  };
}

/** Shape of one ledger page before conversion to the client contract. */
export type LedgerPage = {
  page: Doc<"ledger">[];
  /** Cursor for the next (older) page, or null at the end of the ledger. */
  cursor: string | null;
};

/**
 * Wrap a windowed page in Convex's standard pagination contract so the
 * stock `usePaginatedQuery` hook can accumulate pages and detect the end.
 */
export function toPaginationResult(
  p: LedgerPage,
): PaginationResult<Doc<"ledger">> {
  return {
    page: p.page,
    isDone: p.cursor === null,
    continueCursor: p.cursor ?? "",
  };
}

/**
 * Opaque pagination cursor for one ledger entry: its full sort key.
 * The sort key is total over all ledger documents, so this always identifies
 * exactly one position in the ledger's order.
 */
export function toCursor(e: Doc<"ledger">): string {
  return `${e._creationTime}|${String(e._id)}`;
}

/** Keep a buggy or hostile client from requesting an unbounded page. */
export function clampPageSize(numItems: number): number {
  const n = Math.floor(numItems);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 100) : PAGE_SIZE;
}
