import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  copyText,
  downloadReceipt,
  formatBlockTime,
  shortDigest,
  shortSha,
  type AttestationDoc,
} from "@/lib/proof";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import {
  Bitcoin,
  Check,
  Copy,
  Download,
  FileCode2,
  GitPullRequest,
  Hourglass,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function ReceiptActions({
  handle,
  att,
}: {
  handle: string;
  att: AttestationDoc;
}) {
  const { isAuthenticated } = useAuth();
  const [showHex, setShowHex] = useState(false);
  if (!att.otsReceipt) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="clay-card-sm clay-press gap-2"
        onClick={() => downloadReceipt(handle, att.digest, att.otsReceipt!)}
      >
        <Download className="size-4" />
        .ots receipt
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="clay-card-sm clay-press gap-2"
        onClick={() => {
          void copyText(att.digest);
          toast.success("Digest copied");
        }}
      >
        <Copy className="size-4" />
        Digest
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="clay-card-sm clay-press gap-2"
        onClick={() => setShowHex((v) => !v)}
      >
        <FileCode2 className="size-4" />
        {showHex ? "Hide" : "View"} receipt
      </Button>
      <a
        href={`https://mempool.space/block/${att.bitcoinBlockHeight ?? ""}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-muted-foreground underline-offset-2 hover:underline"
      >
        Verify on mempool.space →
      </a>
      {showHex && (
        <pre className="clay-well mt-2 w-full overflow-x-auto p-3 text-[10px] leading-4 text-muted-foreground">
          {att.otsReceipt}
        </pre>
      )}
      {!isAuthenticated && (
        <p className="mt-1 w-full text-[11px] text-muted-foreground">
          Anyone can verify: download the receipt and run{" "}
          <code className="clay-well px-1 py-0.5">ots verify -d {"<digest>"} receipt.ots</code>
        </p>
      )}
    </div>
  );
}

export function AttestationCard({
  handle,
  att,
  index = 0,
  ownerActions,
}: {
  handle: string;
  att: AttestationDoc;
  index?: number;
  ownerActions?: React.ReactNode;
}) {
  const anchored = att.status === "anchored";
  const isPr = att.kind === "pull_request";
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.06, 0.3) }}
      className="clay-card p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <a
            href={`https://github.com/${att.repo}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-lg font-bold tracking-tight hover:underline"
          >
            {att.repo}
          </a>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {shortSha(att.fromCommit)} → {shortSha(att.toCommit)}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span className="clay-chip flex items-center gap-1.5 px-3 py-1 text-xs font-semibold">
            {isPr ? (
              <GitPullRequest className="size-3.5" />
            ) : (
              <FileCode2 className="size-3.5" />
            )}
            {isPr ? "pull request" : "commits"}
          </span>
          <span
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
              anchored
                ? "bg-secondary text-secondary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {anchored ? (
              <>
                <Bitcoin className="size-3.5" />
                Block #{att.bitcoinBlockHeight}
              </>
            ) : (
              <>
                <Hourglass className="size-3.5" />
                pending
              </>
            )}
          </span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <div className="clay-well px-4 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Contribution score
          </p>
          <p className="text-2xl font-extrabold tabular-nums">{att.score}</p>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            SHA-256 of contribution manifest
          </p>
          <p className="truncate font-mono text-sm text-muted-foreground">
            {shortDigest(att.digest, 14, 10)}
          </p>
        </div>
      </div>

      {anchored ? (
        <div className="mt-4 flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <ShieldCheck className="size-5" />
          </div>
          <div className="text-sm">
            <p className="font-semibold">
              Bitcoin-anchored · block {att.bitcoinBlockHeight}
            </p>
            {att.bitcoinBlockTime !== undefined && (
              <p className="text-muted-foreground">
                Attested as of {formatBlockTime(att.bitcoinBlockTime)}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-4 flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Hourglass className="size-5" />
          </div>
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground">
              Timestamped, not yet in a Bitcoin block
            </p>
            <p>
              The digest is committed to OpenTimestamps calendars. A Bitcoin
              anchor usually appears within a few hours; run verify again later.
            </p>
          </div>
        </div>
      )}

      {ownerActions && (
        <div className="mt-4 border-t border-border/60 pt-4">{ownerActions}</div>
      )}
      <ReceiptActions handle={handle} att={att} />
    </motion.div>
  );
}

export function ScorePill({ score }: { score: number }) {
  return (
    <Badge className="clay-chip gap-1">
      <Check className="size-3" /> {score}
    </Badge>
  );
}
