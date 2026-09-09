"use node";

// Minimal OpenTimestamps protocol library (no npm deps, no Convex imports).
//
// Why hand-rolled: the official `opentimestamps` npm package depends on
// bitcore-lib, which cannot be bundled into the Convex runtime. This module
// implements exactly the subset of the OTS protocol this project needs, in a
// byte-compatible way: every receipt produced here can be verified with the
// official `ots verify` tool, and every receipt accepted here was parsed
// strictly (trailing garbage is rejected, not ignored).
//
// Format reference: https://github.com/opentimestamps/opentimestamps-server
//
// Nothing in this file knows about Convex: it is a pure protocol library so
// it can be audited, tested, and reused on its own.

import { createHash } from "crypto";

export type Bytes = number[];

const HEADER_MAGIC: Bytes = [
  0x00, 0x4f, 0x70, 0x65, 0x6e, 0x54, 0x69, 0x6d, 0x65, 0x73, 0x74, 0x61, 0x6d,
  0x70, 0x73, 0x00, 0x00, 0x50, 0x72, 0x6f, 0x6f, 0x66, 0x00, 0xbf, 0x89, 0xe2,
  0xe8, 0x84, 0xe8, 0x92, 0x94,
];
const PENDING_TAG: Bytes = [0x83, 0xdf, 0xe3, 0x0d, 0x2e, 0xf9, 0x0c, 0x8e];
const BITCOIN_TAG: Bytes = [0x05, 0x88, 0x96, 0x0d, 0x73, 0xd7, 0x19, 0x01];
const LITECOIN_TAG: Bytes = [0x06, 0x86, 0x9a, 0x0d, 0x73, 0xd7, 0x1b, 0x45];

const TAG_APPEND = 0xf0;
const TAG_PREPEND = 0xf1;
const TAG_REVERSE = 0xf2;
const TAG_HEXLIFY = 0xf3;
const TAG_SHA1 = 0x02;
const TAG_RIPEMD160 = 0x03;
const TAG_SHA256 = 0x08;

export const AGGREGATORS = [
  "https://a.pool.opentimestamps.org",
  "https://b.pool.opentimestamps.org",
];

export const MEMPOOL = "https://mempool.space/api";

export function toHex(bytes: Bytes | Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function fromHex(hex: string): Bytes {
  if (hex.length % 2 !== 0) throw new Error("Odd-length hex string");
  const out: Bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    out.push(parseInt(hex.slice(i, i + 2), 16));
  }
  return out;
}

function eqBytes(a: Bytes, b: Bytes): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function cmpBytes(a: Bytes, b: Bytes): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}

function writeVaruint(out: Bytes, value: number) {
  if (value < 0) throw new Error("varuint cannot be negative");
  let v = value;
  do {
    let b = v & 0x7f;
    v >>>= 7;
    if (v !== 0) b |= 0x80;
    out.push(b);
  } while (v !== 0);
}

export class Reader {
  private pos = 0;
  private buf: Bytes;
  constructor(buf: Bytes) {
    this.buf = buf;
  }
  read(n: number): Bytes {
    if (this.pos + n > this.buf.length) {
      throw new Error("Unexpected end of OTS data");
    }
    const out = this.buf.slice(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }
  readVaruint(): number {
    let value = 0;
    let shift = 0;
    for (;;) {
      const b = this.read(1)[0];
      value += (b & 0x7f) * 2 ** shift;
      shift += 7;
      if ((b & 0x80) === 0) break;
    }
    return value;
  }
  eof(): boolean {
    return this.pos >= this.buf.length;
  }
}

// --- attestations ---

export type Attestation =
  | { kind: "pending"; uri: string }
  | { kind: "bitcoin"; height: number }
  | { kind: "litecoin"; height: number }
  | { kind: "unknown"; tag: Bytes; payload: Bytes };

function attTag(a: Attestation): Bytes {
  if (a.kind === "pending") return PENDING_TAG;
  if (a.kind === "bitcoin") return BITCOIN_TAG;
  if (a.kind === "litecoin") return LITECOIN_TAG;
  return a.tag;
}

function uriToBytes(uri: string): Bytes {
  return Array.from(uri, (c) => c.charCodeAt(0) & 0xff);
}

function readAttestation(reader: Reader): Attestation {
  const tag = reader.read(8);
  const payloadLen = reader.readVaruint();
  const payload = reader.read(payloadLen);
  const pr = new Reader(payload);
  if (eqBytes(tag, PENDING_TAG)) {
    const uriLen = pr.readVaruint();
    const uri = String.fromCharCode(...pr.read(uriLen));
    return { kind: "pending", uri };
  }
  if (eqBytes(tag, BITCOIN_TAG)) {
    return { kind: "bitcoin", height: pr.readVaruint() };
  }
  if (eqBytes(tag, LITECOIN_TAG)) {
    return { kind: "litecoin", height: pr.readVaruint() };
  }
  return { kind: "unknown", tag, payload };
}

function serializeAttestation(a: Attestation): Bytes {
  const out: Bytes = [];
  out.push(...attTag(a));
  let payload: Bytes;
  if (a.kind === "pending") {
    payload = [];
    const ub = uriToBytes(a.uri);
    writeVaruint(payload, ub.length);
    payload.push(...ub);
  } else if (a.kind === "bitcoin" || a.kind === "litecoin") {
    payload = [];
    writeVaruint(payload, a.height);
  } else {
    payload = a.payload;
  }
  writeVaruint(out, payload.length);
  out.push(...payload);
  return out;
}

function attCompare(a: Attestation, b: Attestation): number {
  const ta = attTag(a);
  const tb = attTag(b);
  if (!eqBytes(ta, tb)) return cmpBytes(ta, tb);
  if (a.kind === "pending" && b.kind === "pending") {
    return cmpBytes(uriToBytes(a.uri), uriToBytes(b.uri));
  }
  if (a.kind === "bitcoin" && b.kind === "bitcoin") return a.height - b.height;
  if (a.kind === "litecoin" && b.kind === "litecoin") return a.height - b.height;
  if (a.kind === "unknown" && b.kind === "unknown") return cmpBytes(a.payload, b.payload);
  return cmpBytes(ta, tb);
}

function attestationsEqual(a: Attestation, b: Attestation): boolean {
  return a.kind === b.kind && eqBytes(serializeAttestation(a), serializeAttestation(b));
}

// --- timestamp tree ---

export type OpEntry = { tag: number; arg: Bytes | null; key: string };
export type TimestampNode = {
  msg: Bytes;
  attestations: Attestation[];
  ops: Map<string, { op: OpEntry; stamp: TimestampNode }>;
};

function makeOpKey(tag: number, arg: Bytes | null): string {
  return tag.toString(16) + ":" + (arg ? toHex(arg) : "");
}

function parseOp(reader: Reader, tag: number): OpEntry {
  if (tag === TAG_APPEND || tag === TAG_PREPEND) {
    const arg = reader.read(reader.readVaruint());
    return { tag, arg, key: makeOpKey(tag, arg) };
  }
  if (
    tag === TAG_REVERSE ||
    tag === TAG_HEXLIFY ||
    tag === TAG_SHA1 ||
    tag === TAG_RIPEMD160 ||
    tag === TAG_SHA256
  ) {
    return { tag, arg: null, key: makeOpKey(tag, null) };
  }
  throw new Error(`Unknown OTS operation tag 0x${tag.toString(16)}`);
}

function serializeOp(out: Bytes, op: OpEntry) {
  out.push(op.tag);
  if (op.arg !== null) {
    writeVaruint(out, op.arg.length);
    out.push(...op.arg);
  }
}

function applyOp(op: OpEntry, msg: Bytes): Bytes {
  switch (op.tag) {
    case TAG_APPEND:
      return msg.concat(op.arg ?? []);
    case TAG_PREPEND:
      return (op.arg ?? []).concat(msg);
    case TAG_REVERSE:
      return msg.slice().reverse();
    case TAG_HEXLIFY: {
      const hex = toHex(msg);
      return Array.from(hex, (c) => c.charCodeAt(0));
    }
    case TAG_SHA1:
      return Array.from(createHash("sha1").update(Buffer.from(msg)).digest());
    case TAG_RIPEMD160:
      return Array.from(
        createHash("ripemd160").update(Buffer.from(msg)).digest(),
      );
    case TAG_SHA256:
      return Array.from(createHash("sha256").update(Buffer.from(msg)).digest());
    default:
      throw new Error(`Cannot apply OTS operation tag 0x${op.tag.toString(16)}`);
  }
}

function deserializeTimestamp(reader: Reader, initialMsg: Bytes): TimestampNode {
  const node: TimestampNode = {
    msg: initialMsg,
    attestations: [],
    ops: new Map(),
  };

  function handleEntry(entryTag: number) {
    if (entryTag === 0x00) {
      node.attestations.push(readAttestation(reader));
      return;
    }
    const op = parseOp(reader, entryTag);
    const result = applyOp(op, node.msg);
    const stamp = deserializeTimestamp(reader, result);
    node.ops.set(op.key, { op, stamp });
  }

  let tag = reader.read(1)[0];
  while (tag === 0xff) {
    handleEntry(reader.read(1)[0]);
    tag = reader.read(1)[0];
  }
  handleEntry(tag);
  return node;
}

function serializeTimestamp(node: TimestampNode): Bytes {
  const out: Bytes = [];
  const sorted = [...node.attestations].sort(attCompare);
  if (sorted.length > 1) {
    for (let i = 0; i < sorted.length - 1; i++) {
      out.push(0xff, 0x00);
      out.push(...serializeAttestation(sorted[i]));
    }
  }
  const opEntries = [...node.ops.values()];
  if (opEntries.length === 0) {
    if (sorted.length > 0) {
      out.push(0x00);
      out.push(...serializeAttestation(sorted[sorted.length - 1]));
    }
  } else {
    if (sorted.length > 0) {
      out.push(0xff, 0x00);
      out.push(...serializeAttestation(sorted[sorted.length - 1]));
    }
    for (let i = 0; i < opEntries.length; i++) {
      if (i < opEntries.length - 1) out.push(0xff);
      serializeOp(out, opEntries[i].op);
      out.push(...serializeTimestamp(opEntries[i].stamp));
    }
  }
  return out;
}

/** Merge `remote` (same message as `local`) into `local`. Returns true if anything new was added. */
function mergeInto(local: TimestampNode, remote: TimestampNode): boolean {
  let changed = false;
  for (const att of remote.attestations) {
    if (!local.attestations.some((a) => attestationsEqual(a, att))) {
      local.attestations.push(att);
      changed = true;
    }
  }
  for (const [key, entry] of remote.ops) {
    const existing = local.ops.get(key);
    if (existing) {
      changed = mergeInto(existing.stamp, entry.stamp) || changed;
    } else {
      local.ops.set(key, entry);
      changed = true;
    }
  }
  return changed;
}

function walk(node: TimestampNode, fn: (node: TimestampNode) => void) {
  fn(node);
  for (const entry of node.ops.values()) walk(entry.stamp, fn);
}

// --- detached file envelope ---

export function serializeDetached(root: TimestampNode): Bytes {
  const out: Bytes = [];
  out.push(...HEADER_MAGIC);
  writeVaruint(out, 1); // MAJOR_VERSION
  out.push(TAG_SHA256);
  out.push(...root.msg);
  out.push(...serializeTimestamp(root));
  return out;
}

export function deserializeDetached(
  receiptHex: string,
): { digest: Bytes; root: TimestampNode } {
  const reader = new Reader(fromHex(receiptHex));
  const magic = reader.read(HEADER_MAGIC.length);
  if (!eqBytes(magic, HEADER_MAGIC)) throw new Error("Not an OpenTimestamps receipt");
  if (reader.readVaruint() !== 1) throw new Error("Unsupported OTS major version");
  const opTag = reader.read(1)[0];
  if (opTag !== TAG_SHA256) throw new Error("Only sha256 OTS receipts are supported");
  const digest = reader.read(32);
  const root = deserializeTimestamp(reader, digest);
  if (!reader.eof()) throw new Error("Trailing garbage in OTS receipt");
  return { digest, root };
}

// --- network: calendars + block explorer ---

async function fetchTimestamp(
  url: string,
  init: RequestInit,
  initialMsg: Bytes,
): Promise<TimestampNode | null> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`OTS calendar ${url} responded ${res.status}`);
  const buf = Array.from(new Uint8Array(await res.arrayBuffer()));
  if (buf.length > 10_000) throw new Error("OTS calendar response exceeded size limit");
  const reader = new Reader(buf);
  const stamp = deserializeTimestamp(reader, initialMsg);
  if (!reader.eof()) throw new Error("Trailing garbage in OTS calendar response");
  return stamp;
}

// --- mint / upgrade / verify ---

export async function mintRoot(digest: Bytes): Promise<TimestampNode> {
  const root: TimestampNode = { msg: digest, attestations: [], ops: new Map() };
  let success = 0;
  for (const base of AGGREGATORS) {
    try {
      const remote = await fetchTimestamp(
        `${base}/digest`,
        {
          method: "POST",
          headers: {
            Accept: "application/vnd.opentimestamps.v1",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new Uint8Array(digest),
        },
        digest,
      );
      if (remote && mergeInto(root, remote)) success++;
    } catch {
      // aggregator unavailable; try the next one
    }
  }
  if (success === 0) {
    throw new Error("All OpenTimestamps aggregators failed; try again shortly.");
  }
  return root;
}

export async function upgradeRoot(root: TimestampNode): Promise<boolean> {
  const pendings: { node: TimestampNode; uri: string }[] = [];
  walk(root, (node) => {
    for (const att of node.attestations) {
      if (att.kind === "pending") pendings.push({ node, uri: att.uri });
    }
  });

  let changed = false;
  for (const p of pendings) {
    try {
      const base = p.uri.replace(/\/+$/, "");
      const remote = await fetchTimestamp(
        `${base}/timestamp/${toHex(p.node.msg)}`,
        {
          method: "GET",
          headers: { Accept: "application/vnd.opentimestamps.v1" },
        },
        p.node.msg,
      );
      if (remote && mergeInto(p.node, remote)) changed = true;
    } catch {
      // calendar unavailable; keep the pending attestation
    }
  }
  return changed;
}

/**
 * Check Bitcoin block attestations against real block headers from
 * mempool.space. The attestation message is the byte-reversed block merkle
 * root; a match proves the digest existed at or before that block's time.
 */
export async function checkBitcoin(
  root: TimestampNode,
): Promise<{ height: number; blockTime: number } | null> {
  const candidates: { msg: Bytes; height: number }[] = [];
  walk(root, (node) => {
    for (const att of node.attestations) {
      if (att.kind === "bitcoin") candidates.push({ msg: node.msg, height: att.height });
    }
  });
  candidates.sort((a, b) => a.height - b.height);

  for (const c of candidates) {
    try {
      const hashRes = await fetch(`${MEMPOOL}/block-height/${c.height}`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!hashRes.ok) continue;
      const hash = (await hashRes.text()).trim();
      const blockRes = await fetch(`${MEMPOOL}/block/${hash}`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!blockRes.ok) continue;
      const block = (await blockRes.json()) as Record<string, unknown>;
      const merkleRoot = block.merkle_root ?? block.merkleRoot;
      const blockTime = block.timestamp ?? block.time;
      if (typeof merkleRoot !== "string" || typeof blockTime !== "number") continue;
      const reversedRoot = fromHex(merkleRoot).reverse();
      if (toHex(c.msg) === toHex(reversedRoot)) {
        return { height: c.height, blockTime };
      }
    } catch {
      // explorer unavailable; try the next attestation
    }
  }
  return null;
}
