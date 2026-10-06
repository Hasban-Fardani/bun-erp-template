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

const WEB = process.env.QA_BASE_URL ?? "http://localhost:4173";
const CHROME = process.env.CHROME_PATH ?? chromium.executablePath();
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

await Bun.$`mkdir -p .data/qa`.quiet();
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
  // Sign-in now lands on the overview ("/"), not straight into the user list.
  await p.waitForURL((url) => url.pathname !== "/login", { timeout: 20_000 });
}

async function searchResponse(p: Page, path: string, term: string) {
  const response = p.waitForResponse((candidate) => {
    const url = new URL(candidate.url());
    return url.pathname.endsWith(path) && url.searchParams.get("search") === term;
  });
  await p.getByTestId("table-search").fill(term);
  return response;
}

try {
  await page.goto(`${WEB}/login`, { waitUntil: "networkidle" });
  check("login: form tampil", (await page.locator("#email").count()) === 1);
  check("login: ada recovery action", (await page.getByTestId("login-recovery-action").count()) === 1);
  await login(page);
  check("login: masuk berhasil", !page.url().includes("/login"));

  await page.goto(`${WEB}/users`, { waitUntil: "networkidle" });
  const userSearch = await searchResponse(page, "/api/v1/users", "a");
  check("pengguna: pencarian bekerja", userSearch.ok(), `HTTP ${userSearch.status()}`);

  const sortResponse = page.waitForResponse((candidate) => {
    const url = new URL(candidate.url());
    return url.pathname.endsWith("/api/v1/users") && url.searchParams.get("sort") === "email";
  });
  await page.getByRole("button", { name: /email/i }).first().click();
  const sortedUsers = await sortResponse;
  const emailSort = await page.getByRole("columnheader", { name: /email/i }).getAttribute("aria-sort");
  check(
    "pengguna: klik header mengurutkan",
    sortedUsers.ok() && (emailSort === "ascending" || emailSort === "descending"),
  );

  for (const [label, path, apiPath, term] of [
    ["peran", "/roles", "/api/v1/roles", "own"],
    ["audit", "/audit", "/api/v1/audit-logs", "role"],
  ] as const) {
    await page.goto(`${WEB}${path}`, { waitUntil: "networkidle" });
    const response = await searchResponse(page, apiPath, term);
    check(`${label}: pencarian bekerja`, response.ok(), `HTTP ${response.status()}`);
  }

  // The role picker is a Combobox inside a Sheet: it opens, accepts typing and filters. This
  // broke once (focus was pulled back to the Sheet's scope) and shipped, so it is checked here.
  await page.goto(`${WEB}/users`, { waitUntil: "networkidle" });
  await page.getByTestId("resource-table-primary-action").click();
  await page.locator('[data-testid="user-role"]').click();
  const roleItems = page.locator("[cmdk-item]");
  await roleItems.first().waitFor({ state: "visible" });
  const before = await page.locator("[cmdk-item]").count();
  await page.locator("[cmdk-input]").fill("owner");
  await roleItems.filter({ hasText: /owner/i }).waitFor({ state: "visible" });
  const after = await page.locator("[cmdk-item]").count();
  check("combobox peran: terbuka dan menyaring", before > 1 && after === 1);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.locator('[data-testid="user-role"]').waitFor({ state: "hidden" });

  await page.goto(`${WEB}/users`, { waitUntil: "networkidle" });
  await page.getByTestId("table-search").waitFor({ state: "visible" });
  const inlineAlerts = await page.locator("main [role='alert']").count();
  check("tidak ada alert inline di halaman", inlineAlerts === 0, `ditemukan ${inlineAlerts}`);

  const responsiveWidths = [320, 360, 390, 430, 767, 768, 1024, 1440];
  for (const width of responsiveWidths) {
    await page.setViewportSize({ width, height: 900 });
    const isMobileLayout = width < 768;
    if (isMobileLayout) {
      await page.getByTestId("resource-table-mobile-row").first().waitFor({ state: "visible" });
    } else {
      await page.getByRole("table").waitFor({ state: "visible" });
    }

    const pageSize = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    check(
      `responsive ${width}px: no horizontal overflow`,
      pageSize.document <= pageSize.viewport + 1 && pageSize.body <= pageSize.viewport + 1,
      JSON.stringify(pageSize),
    );

    if (isMobileLayout) {
      const toolbar = await page.getByTestId("resource-table-toolbar").boundingBox();
      const search = await page.getByTestId("table-search").boundingBox();
      const addAction = await page.getByTestId("resource-table-primary-action").boundingBox();
      const toolbarAligned = Boolean(
        toolbar &&
          search &&
          addAction &&
          Math.abs(search.x - addAction.x) <= 1 &&
          Math.abs(search.width - addAction.width) <= 1 &&
          search.x >= toolbar.x &&
          addAction.x + addAction.width <= toolbar.x + toolbar.width,
      );
      check(`responsive ${width}px: search and primary action align`, toolbarAligned);

      const rowMetrics = await page.getByTestId("resource-table-mobile-row").evaluateAll((rows) =>
        rows.map((row, rowIndex) => {
          const style = getComputedStyle(row);
          const title = row.querySelector('[data-testid="resource-table-mobile-title"]');
          const actions = row.querySelector('[data-testid="resource-table-mobile-actions"]');
          const rowBox = row.getBoundingClientRect();
          const titleBox = title?.getBoundingClientRect();
          const actionsBox = actions?.getBoundingClientRect();
          const values = Array.from(row.querySelectorAll('[data-testid="resource-table-mobile-value"]'));
          const valueLefts = values.map((value) => value.getBoundingClientRect().left);
          const buttons = Array.from(actions?.querySelectorAll("button") ?? []).map((button) => {
            const box = button.getBoundingClientRect();
            return { width: box.width, height: box.height };
          });
          return {
            rowIndex,
            symmetricPadding:
              Math.abs(Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight)) <= 1,
            noOverflow: row.scrollWidth <= row.clientWidth + 1,
            valuesAlign: valueLefts.length < 2 || Math.max(...valueLefts) - Math.min(...valueLefts) <= 1,
            contentInsideRow:
              (!titleBox || titleBox.left >= rowBox.left + Number.parseFloat(style.paddingLeft) - 1) &&
              (!actionsBox || actionsBox.right <= rowBox.right - Number.parseFloat(style.paddingRight) + 1),
            touchTargetsMeetMinimum: buttons.every((button) => button.width >= 43.9 && button.height >= 43.9),
            buttonTargets: buttons,
          };
        }),
      );
      const alignedCards =
        rowMetrics.length > 0 &&
        rowMetrics.every(
          (row) =>
            row.symmetricPadding &&
            row.noOverflow &&
            row.valuesAlign &&
            row.contentInsideRow &&
            row.touchTargetsMeetMinimum,
        );
      const failingRows = rowMetrics.filter(
        (row) =>
          !row.symmetricPadding ||
          !row.noOverflow ||
          !row.valuesAlign ||
          !row.contentInsideRow ||
          !row.touchTargetsMeetMinimum,
      );
      check(
        `responsive ${width}px: cards stay aligned and touchable`,
        alignedCards,
        alignedCards ? "" : JSON.stringify(failingRows),
      );
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto(`${WEB}/users`, { waitUntil: "networkidle" });
  const sidebarToggle = page.getByTestId("sidebar-toggle");
  await sidebarToggle.waitFor({ state: "visible" });
  if ((await sidebarToggle.getAttribute("aria-expanded")) === "true") await sidebarToggle.click();
  const collapsedSidebar = page.locator('aside[data-sidebar-collapsed="true"]');
  await collapsedSidebar.waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const sidebar = document.querySelector<HTMLElement>('aside[data-sidebar-collapsed="true"]');
    const active = sidebar?.querySelector<HTMLAnchorElement>('a[data-nav-item][aria-current="page"]');
    const indicator = active?.closest("ul")?.parentElement?.querySelector<HTMLElement>("[data-nav-indicator]");
    const sidebarWidth = sidebar?.getBoundingClientRect().width;
    const activeBox = active?.getBoundingClientRect();
    const indicatorBox = indicator?.getBoundingClientRect();
    return Boolean(
      sidebarWidth &&
        Math.abs(sidebarWidth - 64) <= 1 &&
        activeBox &&
        indicatorBox &&
        Math.abs(activeBox.top - indicatorBox.top) <= 1 &&
        Math.abs(activeBox.width - indicatorBox.width) <= 1 &&
        Math.abs(activeBox.height - indicatorBox.height) <= 1,
    );
  });
  const railMetrics = await collapsedSidebar.evaluate((sidebar) => {
    const sidebarBox = sidebar.getBoundingClientRect();
    const items = Array.from(sidebar.querySelectorAll<HTMLAnchorElement>("a[data-nav-item]")).map((item) => {
      const itemBox = item.getBoundingClientRect();
      const iconBox = item.querySelector("svg")?.getBoundingClientRect();
      return {
        width: itemBox.width,
        height: itemBox.height,
        iconCenterOffset: iconBox
          ? Math.abs(iconBox.left + iconBox.width / 2 - (itemBox.left + itemBox.width / 2))
          : null,
      };
    });
    const active = sidebar.querySelector<HTMLAnchorElement>('a[data-nav-item][aria-current="page"]');
    const activeGroup = active?.closest("ul")?.parentElement;
    const indicator = activeGroup?.querySelector<HTMLElement>("[data-nav-indicator]");
    const activeBox = active?.getBoundingClientRect();
    const indicatorBox = indicator?.getBoundingClientRect();
    const activeHighlightAligned = Boolean(
      activeBox &&
        indicatorBox &&
        Math.abs(activeBox.top - indicatorBox.top) <= 1 &&
        Math.abs(activeBox.width - indicatorBox.width) <= 1 &&
        Math.abs(activeBox.height - indicatorBox.height) <= 1,
    );
    return { width: sidebarBox.width, items, activeHighlightAligned };
  });
  const railIsAligned =
    railMetrics.items.length > 0 &&
    railMetrics.activeHighlightAligned &&
    railMetrics.items.every(
      (item) =>
        item.width >= railMetrics.width - 20 &&
        item.height >= 40 &&
        item.iconCenterOffset !== null &&
        item.iconCenterOffset <= 1,
    );
  check(
    "sidebar collapsed: centered targets and active highlight stay aligned",
    railIsAligned,
    railIsAligned ? "" : JSON.stringify(railMetrics),
  );
  await collapsedSidebar.screenshot({ path: ".data/qa/sidebar-collapsed.png" });

  // Theme is a runtime preference now: the stored choice must survive a reload and be applied
  // before paint. Reset afterwards so the rest of the run uses the default palette.
  await page.evaluate(() => localStorage.setItem("erp.theme", "dark"));
  await page.reload({ waitUntil: "networkidle" });
  check(
    "theme: dark preference persists and applies",
    await page.evaluate(() => document.documentElement.dataset.theme === "dark"),
  );
  await page.evaluate(() => localStorage.setItem("erp.theme", "light"));
  await page.reload({ waitUntil: "networkidle" });

  check("a11y: skip-to-content link exists", (await page.locator('a[href="#main-content"]').count()) === 1);
  check("a11y: main landmark is present", (await page.locator("main#main-content").count()) === 1);

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(`${WEB}/login`, { waitUntil: "networkidle" });
  check("mobile: form tidak terpotong", await mobile.locator("#email").isVisible());
  const widths = await mobile.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
  check("mobile: tidak ada scroll horizontal", widths.doc <= widths.win + 1, JSON.stringify(widths));
} catch (err) {
  check("browser run", false, err instanceof Error ? err.message : String(err));
  await page.screenshot({ path: ".data/qa/failure.png", fullPage: true });
}
const failed = results.filter((r) => !r.ok);
console.log("\n--- ringkasan ---");
console.log(`gagal: ${failed.length} dari ${results.length}`);
console.log(`respons API >=400: ${badResponses.length}`);
for (const b of badResponses.slice(0, 8)) console.log("  ", b);
console.log(`error JS: ${errors.length}`);
for (const e of errors.slice(0, 5)) console.log("  ", e);

const commit = (await Bun.$`git rev-parse HEAD`.text()).trim();
await Bun.write(
  ".data/qa/qa-report.json",
  JSON.stringify(
    {
      commit,
      time: new Date().toISOString(),
      bun: Bun.version,
      browser: browser.version(),
      results,
      badResponses,
      errors,
    },
    null,
    2,
  ),
);
if (failed.length || badResponses.length || errors.length)
  await page.screenshot({ path: ".data/qa/failure.png", fullPage: true });
await browser.close();
process.exit(failed.length + badResponses.length + errors.length > 0 ? 1 : 0);
