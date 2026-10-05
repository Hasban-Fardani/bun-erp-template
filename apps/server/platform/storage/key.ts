import type { StorageBody } from "./types.ts";

const CONTENT_TYPES: Record<string, string> = {
  json: "application/json",
  txt: "text/plain",
  csv: "text/csv",
  html: "text/html",
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
};

/** Normalize and reject traversal before any driver touches a path or a bucket. */
export function storageKey(key: string): string {
  const value = key.trim().replace(/^\/+/, "");
  if (value === "" || value.length > 512) {
    throw new RangeError("Storage key must contain 1–512 characters");
  }
  if (value.includes("..") || value.includes("\\") || value.includes("\0")) {
    throw new RangeError(`Unsafe storage key: ${key}`);
  }
  return value;
}

export function contentTypeFor(key: string, explicit?: string): string {
  if (explicit) return explicit;
  const dot = key.lastIndexOf(".");
  if (dot === -1) return "application/octet-stream";
  return CONTENT_TYPES[key.slice(dot + 1).toLowerCase()] ?? "application/octet-stream";
}

/** One conversion so every driver receives bytes, never a stream or Blob it must re-handle. */
export async function toBytes(body: StorageBody): Promise<Uint8Array> {
  if (typeof body === "string") return new TextEncoder().encode(body);
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (ArrayBuffer.isView(body)) return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  if (body instanceof Blob) return new Uint8Array(await body.arrayBuffer());
  throw new TypeError("Unsupported storage body");
}

/** Normalize the key, content type, and bytes once so every driver's `put` stays a thin call. */
export async function prepareObject(
  key: string,
  body: StorageBody,
  contentType?: string,
): Promise<{ key: string; bytes: Uint8Array; contentType: string }> {
  const safe = storageKey(key);
  const bytes = await toBytes(body);
  return { key: safe, bytes, contentType: contentTypeFor(safe, contentType) };
}
