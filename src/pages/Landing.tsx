import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Bitcoin,
  Coins,
  FileCode2,
  GitPullRequest,
  Github,
  Landmark,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router";

const fadeUp = {
  initial: { opacity: 0, y: 22 },
  animate: { opacity: 1, y: 0 },
};

export default function Landing() {
  const { isAuthenticated, isLoading } = useAuth();

  const ctaHref = isAuthenticated ? "/dashboard" : "/auth?returnTo=%2Fdashboard";
  const ctaLabel = isAuthenticated ? "Open Nexis" : "Enter Nexis";

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-16">
      {/* ---------------- hero ---------------- */}
      <section className="flex flex-col items-center pt-16 text-center sm:pt-24">
        <motion.div
          {...fadeUp}
          transition={{ duration: 0.5 }}
          className="clay-chip flex items-center gap-2 px-4 py-2 text-xs font-semibold"
        >
          <Landmark className="size-4 text-brass" />
          Nexis — the internal ledger for our team's engineering work
        </motion.div>

        <motion.h1
          {...fadeUp}
          transition={{ duration: 0.5, delay: 0.08 }}
          className="mt-6 max-w-3xl text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-6xl"
        >
          Contribution you can prove,{" "}
          <span className="text-brass">currency you can audit</span>
        </motion.h1>

        <motion.p
          {...fadeUp}
          transition={{ duration: 0.5, delay: 0.16 }}
          className="mt-5 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg"
        >
          Nexis mints our internal currency — <strong>NXS</strong> — directly
          from engineering work. Prove a commit range, anchor the evidence in
          the Bitcoin blockchain, and the corresponding Nexis is issued to you.
          Balances and every transfer settle on a ledger any team member can
          inspect, line by line.
        </motion.p>

        <motion.div
          {...fadeUp}
          transition={{ duration: 0.5, delay: 0.24 }}
          className="mt-8 flex flex-wrap items-center justify-center gap-4"
        >
          <Button asChild className="clay-primary clay-press rounded-full px-7 py-3 text-base">
            <Link to={ctaHref} className="flex items-center gap-2">
              {isLoading ? "Loading…" : ctaLabel}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="clay-card-sm clay-press rounded-full px-7 py-3 text-base"
          >
            <Link to="/p/demo-contributor">See a member's proof page</Link>
          </Button>
        </motion.div>
      </section>

      {/* ---------------- how it works ---------------- */}
      <section className="mt-24">
        <motion.h2
          {...fadeUp}
          transition={{ duration: 0.5 }}
          className="text-center text-2xl font-extrabold tracking-tight sm:text-3xl"
        >
          From commit to currency
        </motion.h2>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            {
              step: "1",
              title: "Prove the work",
              body: "Point at a commit range on a public repository. Nexis pulls the real commits from GitHub's API, applies a published scoring rule, and hashes the manifest with SHA-256.",
              icon: <Github className="size-5" />,
            },
            {
              step: "2",
              title: "Anchor the evidence",
              body: "The hash is timestamped through OpenTimestamps into a Bitcoin block header. The receipt is downloadable and verifiable offline — the record cannot be backdated or edited by anyone, including this service.",
              icon: <Bitcoin className="size-5" />,
            },
            {
              step: "3",
              title: "Mint your Nexis",
              body: "Each anchored proof mints NXS at a fixed rate — one Nexis per contribution point, redeemable exactly once. Spend it by paying teammates; every entry lands on the shared ledger.",
              icon: <Coins className="size-5" />,
            },
          ].map((card, i) => (
            <motion.div
              key={card.step}
              {...fadeUp}
              transition={{ duration: 0.5, delay: 0.1 + i * 0.1 }}
              className="clay-card p-6 text-left"
            >
              <div className="flex items-center justify-between">
                <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  {card.icon}
                </div>
                <span className="text-4xl font-extrabold text-primary/15">
                  {card.step}
                </span>
              </div>
              <h3 className="mt-4 text-lg font-bold tracking-tight">
                {card.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {card.body}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ---------------- what Nexis is ---------------- */}
      <section className="mt-24 grid items-center gap-8 lg:grid-cols-2">
        <motion.div {...fadeUp} transition={{ duration: 0.5 }}>
          <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            A currency with a published monetary policy
          </h2>
          <p className="mt-4 leading-7 text-muted-foreground">
            NXS is not a token sale and not convertible to money. It is an
            internal unit of account with one rule: supply enters circulation
            only against Bitcoin-anchored proof of engineering work, at a fixed
            rate recorded in the manifest itself. No administrator can mint on
            a whim — the ledger is the whole story.
          </p>
          <ul className="mt-6 flex flex-col gap-3 text-sm">
            <li className="clay-card-sm flex items-center gap-3 p-4">
              <FileCode2 className="size-5 shrink-0 text-primary" />
              Issuance rate: 1 contribution point = 1 NXS, once per proof
            </li>
            <li className="clay-card-sm flex items-center gap-3 p-4">
              <GitPullRequest className="size-5 shrink-0 text-primary" />
              Settlement between teammates, recorded with memos and provenance
            </li>
            <li className="clay-card-sm flex items-center gap-3 p-4">
              <ShieldCheck className="size-5 shrink-0 text-primary" />
              Append-only ledger — every balance reconciles from entry zero
            </li>
          </ul>
        </motion.div>

        {/* clay mock of a wallet */}
        <motion.div
          {...fadeUp}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="clay-card p-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brass">
                Nexis wallet
              </p>
              <p className="text-xl font-extrabold">@demo-contributor</p>
            </div>
            <span className="clay-chip px-3 py-1 text-xs font-semibold">
              Member
            </span>
          </div>

          <div className="clay-brass mt-4 rounded-[calc(var(--radius)-0.5rem)] p-5">
            <p className="text-[10px] font-semibold uppercase tracking-wider opacity-80">
              Balance
            </p>
            <p className="text-4xl font-extrabold tabular-nums">
              312 <span className="text-lg font-bold opacity-75">NXS</span>
            </p>
          </div>

          <div className="clay-card-sm mt-4 p-4">
            <div className="flex items-center justify-between">
              <p className="font-bold">Minted from proof</p>
              <span className="clay-chip px-2.5 py-0.5 text-[11px] font-semibold">
                Block #358391
              </span>
            </div>
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">
              torvalds/linux · score 142 → +142 NXS
            </p>
            <p className="mt-2 truncate font-mono text-[10px] text-muted-foreground">
              digest 03ba204e50d1…16b6ab340
            </p>
          </div>
          <div className="clay-card-sm mt-3 flex items-center justify-between p-4">
            <p className="text-sm">
              <span className="font-bold">@maria</span> →{" "}
              <span className="font-bold">@demo-contributor</span>
            </p>
            <p className="text-sm font-extrabold text-brass">+40 NXS</p>
          </div>
        </motion.div>
      </section>

      {/* ---------------- who it's for ---------------- */}
      <section className="clay-card mt-24 p-8 text-center sm:p-12">
        <motion.h2
          {...fadeUp}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-2xl text-2xl font-extrabold tracking-tight sm:text-3xl"
        >
          Built for one team, taken seriously
        </motion.h2>
        <motion.p
          {...fadeUp}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mx-auto mt-4 max-w-2xl leading-7 text-muted-foreground"
        >
          Nexis runs internally — access is limited to our team, and the
          currency is meaningful precisely because it is scarce and earned. If
          the protocol ever grows beyond this room, the accounting is already
          built to survive the scrutiny: anchored evidence, explicit scoring,
          and a ledger that reconciles to the last Nexis.
        </motion.p>
        <motion.div
          {...fadeUp}
          transition={{ duration: 0.5, delay: 0.18 }}
          className="mt-8"
        >
          <Button asChild className="clay-primary clay-press rounded-full px-8 py-3 text-base">
            <Link to={ctaHref} className="flex items-center gap-2">
              Open your wallet
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </motion.div>
      </section>
    </main>
  );
}
