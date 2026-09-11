import type { Doc, Id } from "@/convex/_generated/dataModel";

export type AttestationDoc = Doc<"attestations">;
export type AttestationId = Id<"attestations">;

export const HANDLE_RE = /^[a-z0-9][a-z0-9-]{1,31}$/;

export function shortDigest(digest: string, head = 10, tail = 6): string {
  if (digest.length <= head + tail + 1) return digest;
  return `${digest.slice(0, head)}…${digest.slice(-tail)}`;
}

export function shortSha(sha: string): string {
  return sha.length > 12 ? `${sha.slice(0, 10)}…` : sha;
}

export function formatBlockTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** "3 minutes ago" style formatting for verification bookkeeping. */
export function formatRelativeTime(ms: number): string {
  const diff = ms - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (abs < 60_000) return rtf.format(Math.round(diff / 1000), "second");
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), "minute");
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), "hour");
  return rtf.format(Math.round(diff / 86_400_000), "day");
}

export function downloadReceipt(
  handle: string,
  digest: string,
  receiptHex: string,
) {
  const bytes = new Uint8Array(
    (receiptHex.match(/.{2}/g) ?? []).map((byte) => parseInt(byte, 16)),
  );
  const blob = new Blob([bytes], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${handle}-${digest.slice(0, 12)}.ots`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  ta.remove();
  return Promise.resolve();
}
