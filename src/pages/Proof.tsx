import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AttestationCard } from "@/components/AttestationCard";
import { LedgerEntryRow } from "@/components/LedgerEntryRow";
import { LedgerPager } from "@/components/LedgerPager";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { formatBlockTime } from "@/lib/proof";
import { LEDGER_PAGE_SIZE } from "@/convex/rules";
import { motion } from "framer-motion";
import { Bitcoin, Coins, ExternalLink, Github, ShieldCheck } from "lucide-react";
import { Link, useParams } from "react-router";

export default function Proof() {
  const { handle = "" } = useParams();
  const proof = useQuery(api.attestations.publicProof, {
    handle: handle.toLowerCase(),
  });
  // Full NXS history for this handle: cursor-paginated, gapless back to the
  // first entry the handle ever touched. No sign-in required to audit it.
  const history = usePaginatedQuery(
    api.nexis.handleLedger,
    { handle: handle.toLowerCase() },
    { initialNumItems: LEDGER_PAGE_SIZE },
  );
  const { isAuthenticated } = useAuth();

  if (proof === undefined) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-14">
        <Skeleton className="clay-card h-40 w-full" />
        <Skeleton className="clay-card mt-6 h-56 w-full" />
      </main>
    );
  }

  if (proof === null) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-col items-center px-4 py-24 text-center">
        <div className="clay-card flex size-20 items-center justify-center text-4xl">
          🔍
        </div>
        <h1 className="mt-6 text-2xl font-extrabold tracking-tight">
          No proof page for “{handle}”
        </h1>
        <p className="mt-2 text-muted-foreground">
          Handles are claimed by Nexis members on their workspace. This one is
          still unclaimed.
        </p>
        <Button asChild className="clay-primary clay-press mt-8 rounded-full">
          <Link to="/">Back to home</Link>
        </Button>
      </main>
    );
  }

  const anchored = proof.attestations.filter((a) => a.status === "anchored");
  const totalScore = proof.attestations.reduce((s, a) => s + a.score, 0);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12">
      {/* identity header */}
      <motion.header
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="clay-card p-6 sm:p-8"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brass">
              Nexis · Proof of contribution
            </p>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
              @{proof.handle}
            </h1>
            {proof.githubLogin && (
              <a
                href={`https://github.com/${proof.githubLogin}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                <Github className="size-4" />
                github.com/{proof.githubLogin}
                <ExternalLink className="size-3" />
              </a>
            )}
          </div>
          <div className="clay-well px-5 py-3 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Contributions
            </p>
            <p className="text-2xl font-extrabold tabular-nums">
              {proof.attestations.length}
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="clay-chip px-3 py-1 font-semibold">
            Bitcoin-anchored proofs: {anchored.length}
          </span>
          <span className="clay-chip px-3 py-1 font-semibold">
            Total contribution score: {totalScore}
          </span>
          <span className="clay-chip px-3 py-1 font-semibold">
            Member since {formatBlockTime(proof.createdAt / 1000)}
          </span>
        </div>
      </motion.header>

      {/* how verification works */}
      <section className="clay-card-sm mt-5 flex items-start gap-4 p-5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <Bitcoin className="size-5" />
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          Each contribution below is a signed-off commit range whose manifest
          hash is anchored in the <strong>Bitcoin</strong> blockchain via{" "}
          <a
            className="underline underline-offset-2"
            href="https://opentimestamps.org"
            target="_blank"
            rel="noopener noreferrer"
          >
            OpenTimestamps
          </a>
          . Anchored proofs are what mint <strong>Nexis (NXS)</strong>, our
          team's internal currency — one Nexis per contribution point, issued
          once, on a ledger every member can audit. Receipts are downloadable
          and verifiable by anyone, offline, with the standard{" "}
          <code className="clay-well px-1 py-0.5">ots</code> tool.
        </p>
      </section>

      {/* attestations */}
      <div className="mt-6 flex flex-col gap-5">
        {proof.attestations.length === 0 ? (
          <div className="clay-card p-8 text-center text-muted-foreground">
            No contributions proven yet.
          </div>
        ) : (
          proof.attestations.map((att, i) => (
            <AttestationCard key={att._id} handle={proof.handle} att={att} index={i} />
          ))
        )}
      </div>

      {/* full NXS history for this handle */}
      <section className="clay-card mt-6 p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold tracking-tight">NXS history</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Every ledger entry that credits or debits @{proof.handle} — the
              same append-only ledger the whole team audits.
            </p>
          </div>
          <span className="clay-chip flex items-center gap-1.5 px-3 py-1 text-xs font-semibold">
            <Coins className="size-3.5" />
            Append-only · no entries omitted
          </span>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          {history.results.length === 0 ? (
            <p className="clay-card-sm p-4 text-center text-sm text-muted-foreground">
              No Nexis has touched this handle yet.
            </p>
          ) : (
            history.results.map((entry) => (
              <LedgerEntryRow key={entry._id} entry={entry} viewerHandle={proof.handle} />
            ))
          )}
        </div>
        <LedgerPager
          status={history.status}
          onLoadMore={() => history.loadMore(LEDGER_PAGE_SIZE)}
        />
      </section>

      <footer className="mt-10 flex flex-col items-center gap-3 pb-8 text-center">
        <ShieldCheck className="size-6 text-brass" />
        <p className="text-sm text-muted-foreground">
          Part of the team?{" "}
          <Link
            to={isAuthenticated ? "/dashboard" : "/auth?returnTo=%2Fdashboard"}
            className="font-semibold text-foreground underline underline-offset-2"
          >
            Claim your handle and start earning Nexis
          </Link>
        </p>
      </footer>
    </main>
  );
}
