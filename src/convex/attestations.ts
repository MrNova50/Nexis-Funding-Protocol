import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";

const HANDLE_RE = /^[a-z0-9][a-z0-9-]{1,31}$/;

/**
 * Claim a public contributor handle. Guest (anonymous) users may claim an
 * unclaimed handle too; if a guest later signs in with email and claims the
 * same handle, the email account takes it over so the public proof page
 * history stays under the contributor's control.
 */
export const claimHandle = mutation({
  args: { handle: v.string() },
  handler: async (ctx, { handle }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Sign in to claim a handle.");
    }
    const normalized = handle.toLowerCase().trim();
    if (!HANDLE_RE.test(normalized)) {
      throw new Error(
        "Handles must be 2-32 chars: lowercase letters, numbers, hyphens.",
      );
    }

    const user = await ctx.db.get(userId);
    if (user?.handle === normalized) return userId;

    const existing = await ctx.db
      .query("users")
      .withIndex("by_handle", (q) => q.eq("handle", normalized))
      .first();

    if (existing && existing._id !== userId) {
      const existingUser = await ctx.db.get(existing._id);
      // Rule: a handle claimed by an anonymous (guest) account that never
      // upgraded to email can be reclaimed by a signed-in account. Anything
      // else is a hard conflict.
      const isReclaimableGuestClaim =
        existingUser?.isAnonymous === true && !existingUser.email;
      if (!isReclaimableGuestClaim) {
        throw new Error(`Handle "${normalized}" is already taken.`);
      }
      // Reclaim an abandoned guest claim.
      await ctx.db.patch(existing._id, { handle: undefined });
      // Move any existing attestations to the new owner.
      const atts = await ctx.db
        .query("attestations")
        .withIndex("handle", (q) => q.eq("handle", normalized))
        .collect();
      for (const att of atts) {
        await ctx.db.patch(att._id, { creatorUserId: userId });
      }
    }

    await ctx.db.patch(userId, { handle: normalized });
    return userId;
  },
});

/** The signed-in user's handle + their attestations (newest first). */
export const myAttestations = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    if (!user.handle) {
      return {
        handle: null,
        attestations: [] as Doc<"attestations">[],
        githubLogin: null,
      };
    }
    const attestations = await ctx.db
      .query("attestations")
      .withIndex("handle", (q) => q.eq("handle", user.handle!))
      .order("desc")
      .collect();
    return {
      handle: user.handle,
      attestations,
      githubLogin: user.githubLogin ?? null,
    };
  },
});

/** Public proof page data for a handle. No auth required. */
export const publicProof = query({
  args: { handle: v.string() },
  handler: async (ctx, { handle }) => {
    const normalized = handle.toLowerCase();
    const user = await ctx.db
      .query("users")
      .withIndex("by_handle", (q) => q.eq("handle", normalized))
      .first();
    if (!user) return null;

    const attestations = await ctx.db
      .query("attestations")
      .withIndex("handle", (q) => q.eq("handle", normalized))
      .order("desc")
      .collect();

    return {
      handle: normalized,
      githubLogin: user.githubLogin ?? null,
      attestations,
      createdAt: user._creationTime,
    };
  },
});

/**
 * Public OAuth config for the connect-GitHub button. The client id is not a
 * secret; the client secret never leaves the server.
 */
export const githubOauthClientId = query({
  args: {},
  handler: () => process.env.GITHUB_CLIENT_ID ?? null,
});

/**
 * Exchange a GitHub OAuth code for a real token and fetch the real GitHub
 * login. Requires GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET in the environment.
 */
export const exchangeGithubOauth = action({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in first.");
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error(
        "GitHub OAuth is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.",
      );
    }

    const tokenRes = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
      },
    );
    if (!tokenRes.ok) {
      throw new Error(`GitHub token exchange failed (${tokenRes.status}).`);
    }
    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };
    if (!tokenData.access_token) {
      throw new Error(
        tokenData.error_description ?? tokenData.error ?? "GitHub token exchange failed.",
      );
    }

    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: "application/vnd.github+json",
      },
    });
    if (!userRes.ok) {
      throw new Error("Failed to fetch the GitHub user.");
    }
    const ghUser = (await userRes.json()) as { login: string };

    // Persist the verified login on the user record.
    await ctx.runMutation(internal.attestations.setGithubLoginInternal, {
      userId,
      login: ghUser.login,
    });
    return { login: ghUser.login };
  },
});

export const setGithubLoginInternal = internalMutation({
  args: { userId: v.id("users"), login: v.string() },
  handler: (ctx, { userId, login }) => ctx.db.patch(userId, { githubLogin: login }),
});

/**
 * Persist the attestation for the current user's handle.
 */
export const saveAttestation = mutation({
  args: {
    repo: v.string(),
    fromCommit: v.string(),
    toCommit: v.string(),
    kind: v.union(v.literal("commits"), v.literal("pull_request")),
    score: v.number(),
    manifest: v.string(),
    digest: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in first.");
    const user = await ctx.db.get(userId);
    if (!user?.handle) throw new Error("Claim a handle first.");
    const id = await ctx.db.insert("attestations", {
      handle: user.handle,
      creatorUserId: userId,
      repo: args.repo,
      fromCommit: args.fromCommit,
      toCommit: args.toCommit,
      kind: args.kind,
      score: args.score,
      manifest: args.manifest,
      digest: args.digest,
      status: "pending",
    });
    return id;
  },
});

type OtsRunResult = {
  receipt: string;
  bitcoinBlockHeight: number | null;
  bitcoinBlockTime: number | null;
};

/**
 * Mint the OpenTimestamps receipt for an attestation: submit the digest to
 * real calendars, store the raw receipt bytes, then verify/upgrade. Owned by
 * the creator; every state change is explicit and user-triggered.
 */
export const runOts = action({
  args: {
    attestationId: v.id("attestations"),
    mode: v.union(v.literal("mint"), v.literal("verify")),
  },
  handler: async (ctx, { attestationId, mode }): Promise<OtsRunResult> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in first.");
    const att = await ctx.runQuery(
      internal.attestations.getAttestationInternal,
      { attestationId },
    );
    if (!att) throw new Error("Attestation not found.");
    if (att.creatorUserId !== userId) {
      throw new Error("Only the creator can run receipts for this attestation.");
    }

    const existing: string | null = att.otsReceipt ?? null;
    if (mode === "mint" || existing === null) {
      const result: { receipt: string } = await ctx.runAction(
        internal.ots.mintOtsReceipt,
        { digest: att.digest },
      );
      await ctx.runMutation(internal.attestations.setOtsReceipt, {
        attestationId,
        receipt: result.receipt,
      });
      return {
        receipt: result.receipt,
        bitcoinBlockHeight: null,
        bitcoinBlockTime: null,
      };
    }

    // Manual verify shares the audit path with the cron: every attempt is
    // logged (trigger: "manual") and bookkeeping is updated in one place.
    try {
      const result: {
        receipt: string;
        changed: boolean;
        bitcoinBlockHeight: number | null;
        bitcoinBlockTime: number | null;
      } = await ctx.runAction(internal.ots.verifyOtsReceipt, {
        digest: att.digest,
        receipt: existing,
      });
      const anchored =
        result.bitcoinBlockHeight !== null && result.bitcoinBlockTime !== null;
      await ctx.runMutation(internal.verifier.recordAttempt, {
        attestationId,
        trigger: "manual",
        outcome: anchored
          ? result.changed
            ? "anchored"
            : "already_anchored"
          : "pending",
        receiptChanged: result.changed,
        receipt: result.receipt,
        bitcoinBlockHeight: result.bitcoinBlockHeight ?? undefined,
        bitcoinBlockTime: result.bitcoinBlockTime ?? undefined,
      });
      return {
        receipt: result.receipt,
        bitcoinBlockHeight: result.bitcoinBlockHeight,
        bitcoinBlockTime: result.bitcoinBlockTime,
      };
    } catch (err) {
      await ctx.runMutation(internal.verifier.recordAttempt, {
        attestationId,
        trigger: "manual",
        outcome: "error",
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  },
});

export const getAttestationInternal = internalQuery({
  args: { attestationId: v.id("attestations") },
  handler: async (ctx, { attestationId }) => ctx.db.get(attestationId),
});

export const setOtsReceipt = internalMutation({
  args: { attestationId: v.id("attestations"), receipt: v.string() },
  handler: async (ctx, { attestationId, receipt }) => {
    await ctx.db.patch(attestationId, { otsReceipt: receipt });
  },
});

export const setAnchored = internalMutation({
  args: {
    attestationId: v.id("attestations"),
    height: v.number(),
    blockTime: v.number(),
  },
  handler: async (ctx, { attestationId, height, blockTime }) => {
    await ctx.db.patch(attestationId, {
      status: "anchored",
      bitcoinBlockHeight: height,
      bitcoinBlockTime: blockTime,
    });
  },
});
