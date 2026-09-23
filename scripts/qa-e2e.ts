/**
 * End-to-end QA of every function a user can reach, against a running deployment.
 *
 * Usage:
 *   bun run qa                        # against http://localhost:3000
 *   QA_BASE_URL=https://erp.example bun run qa
 *   CHROME_PATH=/usr/bin/chromium bun run qa
 *
 * This exists because unit tests cannot see a 422 that only happens when the UI sends a query
 * shape the API rejects. `/roles` and `/audit-logs` shipped that way: the search box was on
 * screen and every keystroke failed. Any response >= 400 during the run fails the script.
 *
 * Exits non-zero on any failure, so CI can gate on it.
 */
import { chromium, type Page } from "playwright-core";

const WEB = process.env.QA_BASE_URL ?? "http://localhost:3000";
const CHROME = process.env.CHROME_PATH ?? "/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome";
const EMAIL = process.env.QA_EMAIL ?? "admin@erp.local";
const PASSWORD = process.env.QA_PASSWORD ?? "";

const results: { name: string; ok: boolean; note: string }[] = [];
const check = (name: string, ok: boolean, note = "") => {
  results.push({ name, ok, note });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${note ? ` — ${note}` : ""}`);
};

if (!PASSWORD) {
  console.error("QA_PASSWORD is required (the owner account's password)");
  process.exit(2);
}

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const errors: string[] = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("favicon")) errors.push(m.text());
});

/** Tracking every non-2xx is how a rejected query shape gets caught instead of shrugged at. */
const badResponses: string[] = [];
page.on("response", (res) => {
  if (res.url().includes("/api/") && res.status() >= 400)
    badResponses.push(`${res.status()} ${res.url().slice(0, 110)}`);
});

async function login(p: Page) {
  await p.goto(`${WEB}/login`, { waitUntil: "networkidle" });
  await p.fill("#email", EMAIL);
  await p.fill("#password", PASSWORD);
  await p.click('button[type="submit"]');
  await p.waitForURL(/\/users/, { timeout: 20_000 });
}

await page.goto(`${WEB}/login`, { waitUntil: "networkidle" });
check("login: form tampil", (await page.locator("#email").count()) === 1);
check("login: ada jalur lupa sandi", (await page.getByText("Lupa sandi?").count()) > 0);
await login(page);
check("login: masuk berhasil", page.url().includes("/users"));

await page.fill('[data-testid="table-search"]', "a");
await page.waitForTimeout(1200);
check("pengguna: pencarian bekerja", /\/ \d+/.test(await page.locator('[data-testid="table-info"]').innerText()));
await page.fill('[data-testid="table-search"]', "");
await page.waitForTimeout(1200);

await page.getByRole("button", { name: /email/i }).first().click();
await page.waitForTimeout(600);
check(
  "pengguna: klik header mengurutkan",
  (await page.locator("th[aria-sort='ascending'], th[aria-sort='descending']").count()) > 0,
);

for (const [label, path, term] of [
  ["peran", "/roles", "own"],
  ["audit", "/audit", "role"],
] as const) {
  await page.goto(`${WEB}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.fill('[data-testid="table-search"]', term);
  await page.waitForTimeout(1300);
  check(`${label}: pencarian bekerja`, /\/ \d+/.test(await page.locator('[data-testid="table-info"]').innerText()));
}

// The role picker is a Combobox inside a Sheet: it opens, accepts typing and filters. This
// broke once (focus was pulled back to the Sheet's scope) and shipped, so it is checked here.
await page.goto(`${WEB}/users`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
await page.getByRole("button", { name: "Tambah" }).click();
await page.waitForTimeout(700);
await page.locator('[data-testid="user-role"]').click();
await page.waitForTimeout(500);
const before = await page.locator("[cmdk-item]").count();
await page.locator("[cmdk-input]").fill("owner");
await page.waitForTimeout(500);
const after = await page.locator("[cmdk-item]").count();
check("combobox peran: terbuka dan menyaring", before > 1 && after === 1);
await page.keyboard.press("Escape");
await page.keyboard.press("Escape");
await page.waitForTimeout(400);

await page.goto(`${WEB}/users`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
const inlineAlerts = await page.locator("main [role='alert']").count();
check("tidak ada alert inline di halaman", inlineAlerts === 0, `ditemukan ${inlineAlerts}`);

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await mobile.goto(`${WEB}/login`, { waitUntil: "networkidle" });
check("mobile: form tidak terpotong", await mobile.locator("#email").isVisible());
const widths = await mobile.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
check("mobile: tidak ada scroll horizontal", widths.doc <= widths.win + 1, JSON.stringify(widths));

const failed = results.filter((r) => !r.ok);
console.log("\n--- ringkasan ---");
console.log(`gagal: ${failed.length} dari ${results.length}`);
console.log(`respons API >=400: ${badResponses.length}`);
for (const b of badResponses.slice(0, 8)) console.log("  ", b);
console.log(`error JS: ${errors.length}`);
for (const e of errors.slice(0, 5)) console.log("  ", e);

await browser.close();
process.exit(failed.length + badResponses.length + errors.length > 0 ? 1 : 0);
