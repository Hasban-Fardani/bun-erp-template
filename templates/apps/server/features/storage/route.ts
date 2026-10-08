import { contentTypeFor, storageKey } from "@bun-erp/storage/server";
import type { AppContext } from "../../bootstrap/context.ts";
import { factory } from "../../http/factory.ts";
import { doc } from "../../http/helpers/api-docs.ts";
import { ApiError, ErrorCode } from "../../http/helpers/errors.ts";
import { requireActor } from "../identity/index.ts";

/** A strong validator over the bytes: stores do not all expose one, and `get` returns bytes anyway. */
async function etagOf(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `"${hex.slice(0, 32)}"`;
}

function matchesEtag(header: string | undefined, etag: string): boolean {
  if (!header) return false;
  return header
    .split(",")
    .map((value) => value.trim().replace(/^W\//, ""))
    .some((value) => value === etag || value === "*");
}

/**
 * Self-hosted file reads. Files are private by default: any signed-in user may read a key they
 * know, and a feature that needs per-file rules adds its own check before linking here. Keys are
 * validated by `storageKey` (no traversal) before any driver is touched.
 */
export function storageRoutes(ctx: AppContext) {
  return factory.createApp().get(
    "/:key{.+}",
    doc({
      tag: "files",
      summary: "Baca berkas dari penyimpanan aktif",
      data: { type: "object", description: "Raw file bytes; the response is not a JSON envelope" },
    }),
    async (c) => {
      await requireActor(c, ctx);
      let key: string;
      try {
        key = storageKey(c.req.param("key"));
      } catch {
        throw new ApiError(ErrorCode.badRequest, 400, "Invalid file key");
      }
      const bytes = await ctx.storage.get(key);
      if (!bytes) throw ApiError.notFound("File not found");

      const etag = await etagOf(bytes);
      const headers = {
        ETag: etag,
        "Cache-Control": "private, max-age=0, must-revalidate",
        "Content-Type": contentTypeFor(key),
        "X-Content-Type-Options": "nosniff",
        // Uploaded HTML/SVG must never run script with this origin's cookies.
        "Content-Security-Policy": "default-src 'none'; sandbox",
      };
      if (matchesEtag(c.req.header("if-none-match"), etag)) return c.body(null, 304, headers);
      return c.body(bytes as unknown as ArrayBuffer, 200, headers);
    },
  );
}
