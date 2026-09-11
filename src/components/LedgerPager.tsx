import { Coins, Loader2, ScrollText } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Load-more control shared by the paginated ledger views. Driven by
 * `usePaginatedQuery`'s status so disabled/loading/end states can't drift.
 * At the end it renders the audit marker instead of a disabled button:
 * the point is that an auditor reaches this line knowing nothing was cut.
 */
export function LedgerPager({
  status,
  onLoadMore,
}: {
  status: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";
  onLoadMore: () => void;
}) {
  if (status === "LoadingFirstPage") return null;
  if (status === "Exhausted") {
    return (
      <p className="mt-3 flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
        <ScrollText className="size-3.5" />
        End of ledger — every entry back to the first is shown.
      </p>
    );
  }
  return (
    <div className="mt-4 flex justify-center">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="clay-card-sm clay-press gap-2"
        disabled={status === "LoadingMore"}
        onClick={onLoadMore}
      >
        {status === "LoadingMore" ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Coins className="size-4" />
        )}
        Load older entries
      </Button>
    </div>
  );
}
