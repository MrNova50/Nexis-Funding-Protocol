"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { createHash } from "crypto";

/**
 * Fetch real commits from the GitHub public API for repo + range and score
 * the contribution. Scoring (v1, deliberately legible):
 *   - kind "commits": each commit weighs 1
 *   - kind "pull_request": PR-merge commits weigh 5, other commits weigh 3
 * The manifest records exactly how the score was computed so the digest is
 * independently auditable. Runs in the Node runtime for sha256 via node:crypto.
 */
export const fetchGithubCommits = action({
  args: {
    repo: v.string(), // "owner/name"
    fromCommit: v.string(), // exclusive start: sha / branch / tag
    toCommit: v.string(), // inclusive end: sha / branch / tag
    kind: v.union(v.literal("commits"), v.literal("pull_request")),
  },
  handler: async (ctx, { repo, fromCommit, toCommit, kind }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in first.");

    const parts = repo.split("/").filter(Boolean);
    if (parts.length !== 2) {
      throw new Error("Repo must look like owner/name");
    }
    const [owner, name] = parts;

    // Optional: GITHUB_TOKEN raises rate limits; the public API works without.
    const githubToken = process.env.GITHUB_TOKEN;
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
    };
    if (githubToken) headers.Authorization = `Bearer ${githubToken}`;

    const commits: { sha: string; message: string; weight: number }[] = [];
    let score = 0;
    let reachedFrom = false;
    for (let page = 1; page <= 3 && !reachedFrom; page++) {
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${name}/commits?sha=${encodeURIComponent(toCommit)}&per_page=100&page=${page}`,
        { headers },
      );
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`GitHub API error ${res.status}: ${body.slice(0, 200)}`);
      }
      const batch = (await res.json()) as {
        sha: string;
        commit: { message: string };
      }[];
      if (batch.length === 0) break;
      for (const c of batch) {
        if (c.sha === fromCommit) {
          reachedFrom = true;
          break;
        }
        const isMerge = c.commit.message.startsWith("Merge pull request");
        const weight = kind === "pull_request" ? (isMerge ? 5 : 3) : 1;
        commits.push({ sha: c.sha, message: c.commit.message, weight });
        score += weight;
      }
    }

    const manifest = {
      protocol: "focp-proof-v1",
      repo: `${owner}/${name}`,
      fromCommit,
      toCommit,
      kind,
      score,
      commitCount: commits.length,
      commits: commits.slice(0, 50),
      scoring: {
        commits: "weight 1",
        pull_request: "PR-merge commits weight 5, other commits weight 3",
      },
      generator: "forever-funding-protocol cycle-1",
    };
    const digest = createHash("sha256")
      .update(JSON.stringify(manifest))
      .digest("hex");

    return {
      manifest: JSON.stringify(manifest),
      digest,
      score,
      commitCount: commits.length,
    };
  },
});
