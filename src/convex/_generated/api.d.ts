/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as attestations from "../attestations.js";
import type * as auth from "../auth.js";
import type * as auth_emailOtp from "../auth/emailOtp.js";
import type * as crons from "../crons.js";
import type * as github from "../github.js";
import type * as http from "../http.js";
import type * as nexis from "../nexis.js";
import type * as ots from "../ots.js";
import type * as otslib from "../otslib.js";
import type * as pagination from "../pagination.js";
import type * as rules from "../rules.js";
import type * as users from "../users.js";
import type * as verifier from "../verifier.js";
import type * as verifierActions from "../verifierActions.js";
import type * as verifierRules from "../verifierRules.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  attestations: typeof attestations;
  auth: typeof auth;
  "auth/emailOtp": typeof auth_emailOtp;
  crons: typeof crons;
  github: typeof github;
  http: typeof http;
  nexis: typeof nexis;
  ots: typeof ots;
  otslib: typeof otslib;
  pagination: typeof pagination;
  rules: typeof rules;
  users: typeof users;
  verifier: typeof verifier;
  verifierActions: typeof verifierActions;
  verifierRules: typeof verifierRules;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
