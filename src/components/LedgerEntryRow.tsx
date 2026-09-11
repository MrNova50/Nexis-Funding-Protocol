import { ArrowDownLeft, Coins, Send } from "lucide-react";

import type { Doc } from "@/convex/_generated/dataModel";

/**
 * One ledger row, shared by the dashboard team ledger, the wallet history,
 * and the public proof page's full-history view.
 *
 * `viewerHandle` (optional) highlights rows where the viewer is the
 * recipient or the sender; on the public page it is simply omitted.
 */
export function LedgerEntryRow({
  entry,
  viewerHandle,
}: {
  entry: Doc<"ledger">;
  viewerHandle?: string;
}) {
  const mine = viewerHandle !== undefined && entry.toHandle === viewerHandle;
  const outgoing =
    viewerHandle !== undefined && entry.fromHandle === viewerHandle;
  return (
    <div className="clay-card-sm flex flex-wrap items-center justify-between gap-2 p-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={`flex size-8 shrink-0 items-center justify-center rounded-xl ${
            entry.kind === "issuance"
              ? "bg-accent/20 text-accent"
              : "bg-primary/10 text-primary"
          }`}
        >
          {entry.kind === "issuance" ? (
            <Coins className="size-4" />
          ) : mine ? (
            <ArrowDownLeft className="size-4" />
          ) : (
            <Send className="size-4" />
          )}
        </div>
        <div className="min-w-0 text-sm">
          <p className="font-semibold">
            {entry.kind === "issuance"
              ? `Minted for @${entry.toHandle}`
              : `@${entry.fromHandle} → @${entry.toHandle}`}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {entry.kind === "issuance"
              ? `proof ${entry.digest?.slice(0, 10) ?? ""}…`
              : entry.note || "payment"}
          </p>
        </div>
      </div>
      <p
        className={`text-sm font-extrabold tabular-nums ${
          outgoing ? "text-muted-foreground" : "text-brass"
        }`}
      >
        {outgoing ? "−" : "+"}
        {entry.amount} NXS
      </p>
    </div>
  );
}
