import { afterAll, beforeAll, expect, test } from "bun:test";
import { createHostFetch } from "../../http/host.ts";
import { createWebAssetsApp } from "../../http/web-assets.ts";

const webRoot = `${Bun.env.TMPDIR ?? "/tmp"}/bun-erp-web-assets-${crypto.randomUUID()}`;
const web = createWebAssetsApp(webRoot);
const apiPaths: string[] = [];
const fetch = createHostFetch((request) => {
  apiPaths.push(new URL(request.url).pathname);
  return Response.json({ source: "api" });
}, web.fetch);

beforeAll(async () => {
  await Bun.write(`${webRoot}/index.html`, "<!doctype html><html><body>web entry</body></html>");
  await Bun.write(`${webRoot}/assets/app-abcdef0123456789.js`, "export const app = true;");
});

afterAll(async () => {
  await Bun.$`rm -rf ${webRoot}`.quiet();
});

test("the root serves the built app with security headers and revalidation caching", async () => {
  const response = await fetch(new Request("https://example.test/"));

  expect(response.status).toBe(200);
  expect(await response.text()).toContain("web entry");
  expect(response.headers.get("cache-control")).toBe("no-cache");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("x-frame-options")).toBe("DENY");
  expect(response.headers.get("strict-transport-security")).toBeNull();
});

test("production web responses enable HSTS without including sibling subdomains", async () => {
  const productionWeb = createWebAssetsApp(webRoot, true);
  const response = await productionWeb.request("https://example.test/");

  expect(response.headers.get("strict-transport-security")).toBe("max-age=15552000");
});

test("HTML navigations use the SPA entry while missing files stay 404", async () => {
  const page = await fetch(new Request("https://example.test/users/42", { headers: { accept: "text/html" } }));
  const missingAsset = await fetch(
    new Request("https://example.test/assets/missing.js", { headers: { accept: "*/*" } }),
  );

  expect(page.status).toBe(200);
  expect(page.headers.get("cache-control")).toBe("no-cache");
  expect(await page.text()).toContain("web entry");
  expect(missingAsset.status).toBe(404);
});

test("hashed Vite assets are immutable and API paths never enter the web app", async () => {
  const asset = await fetch(
    new Request("https://example.test/assets/app-abcdef0123456789.js", {
      headers: { accept: "application/javascript" },
    }),
  );
  const response = await fetch(new Request("https://example.test/api/v1/health"));

  expect(asset.status).toBe(200);
  expect(asset.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  expect(await asset.text()).toContain("app = true");
  expect(await response.json()).toEqual({ source: "api" });
  expect(apiPaths).toEqual(["/api/v1/health"]);
});
