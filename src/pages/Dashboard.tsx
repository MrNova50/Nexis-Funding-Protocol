import { useAction, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { AttestationCard } from "@/components/AttestationCard";
import { LedgerEntryRow } from "@/components/LedgerEntryRow";
import { LedgerPager } from "@/components/LedgerPager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  copyText,
  HANDLE_RE,
  type AttestationId,
} from "@/lib/proof";
import { LEDGER_PAGE_SIZE } from "@/convex/rules";
import { motion } from "framer-motion";
import {
  Bitcoin,
  Coins,
  Copy,
  ExternalLink,
  Github,
  Hourglass,
  Loader2,
  LogOut,
  Plus,
  Send,
  ShieldCheck,
} from "lucide-react";import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

type Kind = "commits" | "pull_request";

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const data = useQuery(api.attestations.myAttestations);
  const wallet = useQuery(api.nexis.myWallet);
  const redeemable = useQuery(api.nexis.redeemable);
  // Cursor-paginated team ledger: every page appends below, back to entry 0.
  const ledger = usePaginatedQuery(
    api.nexis.recentLedger,
    {},
    { initialNumItems: LEDGER_PAGE_SIZE },
  );
  const claimHandle = useMutation(api.attestations.claimHandle);
  const saveAttestation = useMutation(api.attestations.saveAttestation);
  const redeemProof = useMutation(api.nexis.redeemProof);
  const payNx = useMutation(api.nexis.pay);
  const runOts = useAction(api.attestations.runOts);
  const exchangeGithubOauth = useAction(api.attestations.exchangeGithubOauth);
  const fetchCommitsAction = useAction(api.github.fetchGithubCommits);

  const [handleInput, setHandleInput] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [exchanged, setExchanged] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const handleClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    setClaiming(true);
    try {
      await claimHandle({ handle: handleInput });
      toast.success(`Handle @${handleInput.toLowerCase()} is yours.`);
      setHandleInput("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not claim handle");
    } finally {
      setClaiming(false);
    }
  };

  const connectGithub = () => {
    const clientId =
      (import.meta.env.VITE_GITHUB_CLIENT_ID as string | undefined) ?? "";
    if (!clientId) {
      toast.error(
        "GitHub OAuth is not configured yet (needs a GitHub OAuth app client id).",
      );
      return;
    }
    const redirectUri = `${window.location.origin}/dashboard`;
    const scope = "read:user";
    window.location.href = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}`;
  };

  // GitHub OAuth callback: ?code=... — exchange it once for the real login.
  const oauthCode = new URLSearchParams(window.location.search).get("code");
  useEffect(() => {
    if (!oauthCode || exchanged) return;
    setExchanged(true);
    exchangeGithubOauth({ code: oauthCode })
      .then((r) => toast.success(`GitHub connected: ${r.login}`))
      .catch((err: unknown) =>
        toast.error(
          err instanceof Error ? err.message : "GitHub connection failed",
        ),
      );
  }, [oauthCode, exchanged, exchangeGithubOauth]);

  if (data === undefined || wallet === undefined) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-12">
        <Skeleton className="clay-card h-40 w-full" />
        <Skeleton className="clay-card mt-6 h-56 w-full" />
      </main>
    );
  }

  const atts = data?.attestations ?? [];
  const anchoredCount = atts.filter((a) => a.status === "anchored").length;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brass">
            Nexis workspace
          </p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight">
            {data?.handle ? `@${data.handle}` : "Welcome"}
          </h1>
        </div>
        <Button
          type="button"
          variant="outline"
          className="clay-card-sm clay-press gap-2"
          onClick={handleSignOut}
        >
          <LogOut className="size-4" />
          Sign out
        </Button>
      </header>

      {/* ---- Claim handle ---- */}
      {!data?.handle && (
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          className="clay-card mt-8 p-6 sm:p-8"
        >
          <h2 className="text-xl font-bold tracking-tight">
            Claim your member handle
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your handle is your account on the Nexis ledger and the address of
            your public proof page at <strong>/p/your-handle</strong>.
          </p>
          <form onSubmit={handleClaim} className="mt-5 flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono text-muted-foreground">
                @
              </span>
              <Input
                value={handleInput}
                onChange={(e) =>
                  setHandleInput(e.target.value.toLowerCase().trim())
                }
                placeholder="your-handle"
                className="clay-well rounded-full pl-8"
                disabled={claiming}
                required
              />
            </div>
            <Button
              type="submit"
              className="clay-primary clay-press rounded-full"
              disabled={claiming || !HANDLE_RE.test(handleInput)}
            >
              {claiming ? <Loader2 className="size-4 animate-spin" /> : "Claim handle"}
            </Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">
            2–32 chars: lowercase letters, numbers, hyphens.
          </p>
        </motion.section>
      )}

      {/* ---- Wallet ---- */}
      {data?.handle && (
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          className="clay-brass mt-8 rounded-[calc(var(--radius)+0.5rem)] p-6 sm:p-8"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] opacity-80">
                Nexis balance
              </p>
              <p className="mt-1 text-5xl font-extrabold tabular-nums">
                {wallet?.balance ?? 0}{" "}
                <span className="text-xl font-bold opacity-75">NXS</span>
              </p>
              <p className="mt-2 text-xs opacity-75">
                Issued only against Bitcoin-anchored proof of contribution.
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className="rounded-full bg-white/25 px-3 py-1 text-xs font-bold">
                Internal currency · not convertible
              </span>
              <a
                href={`/p/${data.handle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs font-semibold underline underline-offset-2"
              >
                Public proof page <ExternalLink className="size-3.5" />
              </a>
            </div>
          </div>
          <PayForm
            balance={wallet?.balance ?? 0}
            onPay={async (toHandle, amount, note) => {
              await payNx({ toHandle, amount, note });
              toast.success(`Sent ${amount} NXS to @${toHandle}.`);
            }}
          />
        </motion.section>
      )}

      {/* ---- Connected identity ---- */}
      {data?.handle && (
        <section className="clay-card-sm mt-6 flex flex-wrap items-center justify-between gap-3 p-5">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="clay-chip px-3 py-1 font-semibold">
              /p/{data.handle}
            </span>
            {data.githubLogin ? (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Github className="size-4" />
                {data.githubLogin}
              </span>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="clay-card-sm clay-press gap-2"
                onClick={connectGithub}
              >
                <Github className="size-4" />
                Connect GitHub
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span>{atts.length} proofs minted</span>
            <span>{anchoredCount} Bitcoin-anchored</span>
          </div>
        </section>
      )}

      {/* ---- Mint a new proof ---- */}
      {data?.handle && (
        <section className="clay-card mt-6 p-6 sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold tracking-tight">
                Mint a proof of contribution
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Prove a commit range on a public GitHub repo. Once it is
                anchored, it can be redeemed for Nexis.
              </p>
            </div>
            <Button
              type="button"
              className="clay-primary clay-press shrink-0 gap-2 rounded-full"
              onClick={() => setShowForm((v) => !v)}
            >
              <Plus className="size-4" />
              New proof
            </Button>
          </div>

          {showForm && (
            <NewProofForm
              onSave={async (payload) => {
                const id = await saveAttestation(payload);
                toast.success("Proof recorded — now run its receipt");
                setShowForm(false);
                return id;
              }}
              onRun={async (id) => {
                await runOts({ attestationId: id, mode: "mint" });
                toast.success(
                  "Receipt minted to OpenTimestamps. Re-run verify later for the Bitcoin block.",
                );
              }}
              fetchAction={fetchCommitsAction}
            />
          )}
        </section>
      )}

      {/* ---- Redeemable proofs ---- */}
      {data?.handle && (redeemable?.length ?? 0) > 0 && (
        <section className="clay-card mt-6 p-6 sm:p-8">
          <h2 className="text-xl font-bold tracking-tight">
            Redeem anchored proofs
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            These proofs are Bitcoin-anchored and have not been redeemed yet.
            Issuance is 1 contribution point = 1 NXS, once per proof.
          </p>
          <div className="mt-4 flex flex-col gap-3">
            {redeemable!.map((r) => (
              <div
                key={r.attestationId}
                className="clay-card-sm flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-bold">{r.repo}</p>
                  <p className="text-xs text-muted-foreground">
                    score {r.score} · block #{r.bitcoinBlockHeight}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="clay-brass clay-press gap-2 rounded-full"
                  disabled={busyId === r.attestationId}
                  onClick={async () => {
                    setBusyId(r.attestationId);
                    try {
                      const amount = await redeemProof({
                        attestationId: r.attestationId,
                      });
                      toast.success(`${amount} NXS minted to your balance.`);
                    } catch (err) {
                      toast.error(
                        err instanceof Error ? err.message : "Redemption failed",
                      );
                    } finally {
                      setBusyId(null);
                    }
                  }}
                >
                  {busyId === r.attestationId ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Coins className="size-4" />
                  )}
                  Mint {r.nxs} NXS
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---- Ledger ---- */}
      {data?.handle && (
        <section className="clay-card mt-6 p-6 sm:p-8">
          <h2 className="text-xl font-bold tracking-tight">Team ledger</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Append-only and shared. Every mint cites the proof that created it;
            every payment cites its sender.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            {ledger.results.length === 0 ? (
              <p className="clay-card-sm p-4 text-center text-sm text-muted-foreground">
                No Nexis has moved yet.
              </p>
            ) : (
              ledger.results.map((entry) => (
                <LedgerEntryRow
                  key={entry._id}
                  entry={entry}
                  viewerHandle={data.handle}
                />
              ))
            )}
          </div>
          <LedgerPager
            status={ledger.status}
            onLoadMore={() => ledger.loadMore(LEDGER_PAGE_SIZE)}
          />
        </section>
      )}

      {/* ---- Attestation list ---- */}
      <section className="mt-8 flex flex-col gap-5">
        <h2 className="text-lg font-bold tracking-tight">Your proofs</h2>
        {atts.length === 0 ? (
          <div className="clay-card p-8 text-center text-muted-foreground">
            <Coins className="mx-auto size-8 text-primary/40" />
            <p className="mt-3 text-sm">
              {data?.handle
                ? "No proofs yet. Mint your first one above."
                : "Claim a handle to get started."}
            </p>
          </div>
        ) : (
          atts.map((att, i) => (
            <AttestationCard
              key={att._id}
              handle={data?.handle ?? ""}
              att={att}
              index={i}
              ownerActions={
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="clay-card-sm clay-press gap-2"
                    disabled={busyId === att._id}
                    onClick={async () => {
                      setBusyId(att._id);
                      try {
                        await runOts({
                          attestationId: att._id,
                          mode: att.otsReceipt ? "verify" : "mint",
                        });
                        toast.success(
                          att.otsReceipt
                            ? "Receipt verified against calendars + Bitcoin."
                            : "Receipt minted.",
                        );
                      } catch (err) {
                        toast.error(
                          err instanceof Error ? err.message : "OTS run failed",
                        );
                      } finally {
                        setBusyId(null);
                      }
                    }}
                  >
                    {busyId === att._id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : att.otsReceipt ? (
                      <ShieldCheck className="size-4" />
                    ) : (
                      <Bitcoin className="size-4" />
                    )}
                    {att.otsReceipt ? "Re-verify receipt" : "Run Bitcoin receipt"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="clay-press gap-2"
                    onClick={() => {
                      void copyText(att.manifest);
                      toast.success("Manifest copied");
                    }}
                  >
                    <Copy className="size-4" />
                    Copy manifest
                  </Button>
                </div>
              }
            />
          ))
        )}
      </section>
    </main>
  );
}

function PayForm({
  balance,
  onPay,
}: {
  balance: number;
  onPay: (toHandle: string, amount: number, note?: string) => Promise<void>;
}) {
  const [toHandle, setToHandle] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const amountNum = Number.parseInt(amount, 10);
  const valid =
    HANDLE_RE.test(toHandle.toLowerCase().trim()) &&
    Number.isInteger(amountNum) &&
    amountNum > 0 &&
    amountNum <= balance;

  return (
    <form
      className="mt-6 flex flex-col gap-3 rounded-[calc(var(--radius)-0.5rem)] bg-black/10 p-4 sm:flex-row sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return;
        setBusy(true);
        try {
          await onPay(
            toHandle.toLowerCase().trim(),
            amountNum,
            note.trim() || undefined,
          );
          setToHandle("");
          setAmount("");
          setNote("");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="pay-to" className="text-xs font-semibold opacity-80">
          Pay a teammate
        </Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm opacity-60">
            @
          </span>
          <Input
            id="pay-to"
            value={toHandle}
            onChange={(e) => setToHandle(e.target.value.toLowerCase().trim())}
            placeholder="handle"
            className="clay-well rounded-full pl-7"
            disabled={busy}
            required
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5 sm:w-28">
        <Label htmlFor="pay-amount" className="text-xs font-semibold opacity-80">
          Amount
        </Label>
        <Input
          id="pay-amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
          inputMode="numeric"
          placeholder="0"
          className="clay-well rounded-full"
          disabled={busy}
          required
        />
      </div>
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="pay-note" className="text-xs font-semibold opacity-80">
          Memo (optional)
        </Label>
        <Input
          id="pay-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="what this settles"
          className="clay-well rounded-full"
          disabled={busy}
        />
      </div>
      <Button
        type="submit"
        className="clay-primary clay-press gap-2 rounded-full"
        disabled={busy || !valid}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Send className="size-4" />
        )}
        Send
      </Button>
    </form>
  );
}

function NewProofForm({
  onSave,
  onRun,
  fetchAction,
}: {
  onSave: (payload: {
    repo: string;
    fromCommit: string;
    toCommit: string;
    kind: Kind;
    score: number;
    manifest: string;
    digest: string;
  }) => Promise<AttestationId>;
  onRun: (id: AttestationId) => Promise<void>;
  fetchAction: (args: {
    repo: string;
    fromCommit: string;
    toCommit: string;
    kind: Kind;
  }) => Promise<{
    manifest: string;
    digest: string;
    score: number;
    commitCount: number;
  }>;
}) {
  const [repo, setRepo] = useState("");
  const [fromCommit, setFromCommit] = useState("");
  const [toCommit, setToCommit] = useState("");
  const [kind, setKind] = useState<Kind>("commits");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await fetchAction({
        repo: repo.trim(),
        fromCommit: fromCommit.trim(),
        toCommit: toCommit.trim(),
        kind,
      });
      const id = await onSave({
        repo: repo.trim(),
        fromCommit: fromCommit.trim(),
        toCommit: toCommit.trim(),
        kind,
        score: result.score,
        manifest: result.manifest,
        digest: result.digest,
      });
      await onRun(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Minting failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="repo">Public GitHub repo</Label>
          <Input
            id="repo"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            placeholder="e.g. torvalds/linux"
            className="clay-well"
            disabled={busy}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="kind">Contribution kind</Label>
          <select
            id="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}
            className="clay-well h-9 px-3 text-sm outline-none"
            disabled={busy}
          >
            <option value="commits">commits (weight 1 each)</option>
            <option value="pull_request">pull request (PR-merge 5, others 3)</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="from">From commit (exclusive)</Label>
          <Input
            id="from"
            value={fromCommit}
            onChange={(e) => setFromCommit(e.target.value)}
            placeholder="sha / tag / branch before your work"
            className="clay-well font-mono text-xs"
            disabled={busy}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="to">To commit (inclusive)</Label>
          <Input
            id="to"
            value={toCommit}
            onChange={(e) => setToCommit(e.target.value)}
            placeholder="sha / tag / branch of your work"
            className="clay-well font-mono text-xs"
            disabled={busy}
            required
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Tip: use a tag or branch name (e.g. <code className="clay-well px-1 py-0.5">v1.0</code>) for
        either bound. The server fetches real commits from the GitHub API and
        hashes the manifest.
      </p>
      {error && (
        <p className="rounded-2xl bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button
        type="submit"
        className="clay-primary clay-press self-start rounded-full"
        disabled={busy}
      >
        {busy ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Fetching commits + hashing…
          </>
        ) : (
          <>
            <Hourglass className="size-4" />
            Fetch, hash &amp; timestamp
          </>
        )}
      </Button>
    </form>
  );
}
