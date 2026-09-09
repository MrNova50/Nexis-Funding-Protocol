import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove

      // public contributor handle claimed on the dashboard, e.g. "alice"
      handle: v.optional(v.string()),
      // linked GitHub login, e.g. "octocat" (validated against the GitHub API)
      githubLogin: v.optional(v.string()),
    })
      .index("email", ["email"]) // index for the email. do not remove or modify
      .index("by_handle", ["handle"]),

    // A proof-of-contribution record: one repo + commit range, scored,
    // hashed, and optionally anchored on-chain via an OpenTimestamps
    // Bitcoin receipt.
    attestations: defineTable({
      // public contributor handle this attestation belongs to
      handle: v.string(),
      // user who created the attestation
      creatorUserId: v.id("users"),
      repo: v.string(), // "owner/name" of a public GitHub repository
      fromCommit: v.string(),
      toCommit: v.string(),
      kind: v.union(v.literal("commits"), v.literal("pull_request")),
      score: v.number(),
      // deterministic JSON manifest whose sha256 is anchored on-chain
      manifest: v.string(),
      // hex sha256 of the manifest
      digest: v.string(),

      // "pending" until a Bitcoin-anchored OTS receipt exists
      status: v.union(v.literal("pending"), v.literal("anchored")),
      // raw OpenTimestamps receipt bytes (hex), verifiable with `ots verify`
      otsReceipt: v.optional(v.string()),
      bitcoinBlockHeight: v.optional(v.number()),
      bitcoinBlockTime: v.optional(v.number()),
    })
      .index("handle", ["handle"])
      .index("kind", ["kind"])
      .index("status", ["status"]),

    // Nexis (NXS) internal currency ledger. Append-only: issuance mints NXS
    // from a Bitcoin-anchored proof; payment transfers NXS between handles.
    // Every entry cites its provenance (attestation digest or payer) so the
    // whole money supply can be audited from the ledger alone.
    ledger: defineTable({
      kind: v.union(v.literal("issuance"), v.literal("payment")),
      // credited party
      toHandle: v.string(),
      // debited party; absent for issuance (NXS minted, not transferred)
      fromHandle: v.optional(v.string()),
      // whole NXS; the issuance rate is 1 score point = 1 NXS
      amount: v.number(),
      // issuance provenance: the anchored proof that minted this entry
      attestationId: v.optional(v.id("attestations")),
      digest: v.optional(v.string()),
      // payment memo
      note: v.optional(v.string()),
    })
      .index("to_handle", ["toHandle"])
      .index("from_handle", ["fromHandle"])
      .index("by_attestation", ["attestationId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
