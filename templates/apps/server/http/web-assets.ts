import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { secureHeaders } from "hono/secure-headers";

const HASHED_ASSET = /^\/assets\/[^/]+-[\w-]{8,}\.[^.]+$/;

/** Serve a Vite build with SPA navigation fallback and content-hash-aware caching. */
export function createWebAssetsApp(root: string, isProduction = false) {
  const app = new Hono();
  app.use(
    "*",
    secureHeaders({
      referrerPolicy: "strict-origin-when-cross-origin",
      strictTransportSecurity: isProduction ? "max-age=15552000" : false,
      xFrameOptions: "DENY",
    }),
  );
  app.use("*", async (c, next) => {
    await next();
    if (c.res.status >= 400) return;

    const path = c.req.path;
    const contentType = c.res.headers.get("content-type") ?? "";
    if (path === "/" || path === "/index.html" || contentType.startsWith("text/html")) {
      c.header("Cache-Control", "no-cache");
    } else if (HASHED_ASSET.test(path)) {
      c.header("Cache-Control", "public, max-age=31536000, immutable");
    }
  });

  app.get("*", serveStatic({ root }));
  app.get("*", async (c) => {
    const path = c.req.path;
    const acceptsHtml = (c.req.header("accept") ?? "").toLowerCase().includes("text/html");
    const isFilePath = path.startsWith("/assets/") || path.slice(path.lastIndexOf("/") + 1).includes(".");
    if (!acceptsHtml || isFilePath) return c.notFound();

    return c.html(await Bun.file(`${root}/index.html`).text(), 200, { "Cache-Control": "no-cache" });
  });

  return app;
}
