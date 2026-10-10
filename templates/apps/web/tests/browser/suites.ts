/**
 * Browser QA suites for the web app.
 *
 * The `core` suite only touches what every install ships: login, the overview (Beranda), the
 * notifications inbox, sign-out, and the unauthenticated redirect. The `users`, `roles` and
 * `audit` suites run only when that catalog feature is installed, because their screens are
 * opt-in. Every check is isolated: a failure is recorded and the run continues, and a suite whose
 * prerequisite fails is reported as skipped instead of taking the rest of the run down with it.
 */

import type { Browser, Page } from "playwright-core";
import { STORAGE_KEYS } from "../../src/config/storage-keys.ts";
import { paceSignIn } from "./pacing.ts";

export type CheckOutcome = boolean | string | undefined;

export type QaContext = {
  page: Page;
  browser: Browser;
  baseUrl: string;
  email: string;
  password: string;
  /** Every API response >= 400 seen in this suite; the runner turns it into a failed check. */
  badResponses: string[];
  /** Every page error / console error seen in this suite; same treatment. */
  errors: string[];
  /** Set when a prerequisite failed; the runner reports the suite's remaining checks as skipped. */
  stopReason?: string;
};

export type QaCheck = {
  name: string;
  run: (ctx: QaContext) => CheckOutcome | Promise<CheckOutcome>;
};

export type QaSuite = {
  name: string;
  /** Directory under apps/web/src/features that must exist for the suite to run. */
  feature?: string;
  before?: (ctx: QaContext) => Promise<void>;
  checks: readonly QaCheck[];
};

/** The widths the table screens are verified at; mobile is below 768 CSS pixels. */
export const RESPONSIVE_WIDTHS = [320, 360, 390, 430, 767, 768, 1024, 1440] as const;

export async function signIn(page: Page, baseUrl: string, email: string, password: string): Promise<void> {
  await paceSignIn();
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  // Sign-in lands on the overview ("/"), not straight into an admin screen.
  await page.waitForURL((url) => url.pathname !== "/login", { timeout: 20_000 });
  await page.locator("main#main-content").waitFor({ state: "visible", timeout: 20_000 });
}

async function signInOrStop(ctx: QaContext): Promise<void> {
  try {
    await signIn(ctx.page, ctx.baseUrl, ctx.email, ctx.password);
  } catch (error) {
    ctx.stopReason = "sign-in failed";
    throw error;
  }
}

async function openTableScreen(ctx: QaContext, path: string): Promise<void> {
  try {
    await signInOrStop(ctx);
    await ctx.page.goto(`${ctx.baseUrl}${path}`, { waitUntil: "networkidle" });
    await ctx.page.getByTestId("table-search").waitFor({ state: "visible", timeout: 15_000 });
  } catch (error) {
    ctx.stopReason = `opening ${path} failed`;
    throw error;
  }
}

/** The query-shape guard from the original workflow: a rejected search must fail loudly. */
async function searchResponse(page: Page, path: string, term: string) {
  const response = page.waitForResponse((candidate) => {
    const url = new URL(candidate.url());
    return url.pathname.endsWith(path) && url.searchParams.get("search") === term;
  });
  await page.getByTestId("table-search").fill(term);
  return response;
}

async function collapsedSidebarCheck(ctx: QaContext): Promise<CheckOutcome> {
  const page = ctx.page;
  await page.goto(`${ctx.baseUrl}/notifications`, { waitUntil: "networkidle" });
  const toggle = page.getByTestId("sidebar-toggle");
  await toggle.waitFor({ state: "visible" });
  if ((await toggle.getAttribute("aria-expanded")) === "true") await toggle.click();
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
  await collapsedSidebar.screenshot({ path: ".data/qa/sidebar-collapsed.png" });
  return railIsAligned ? true : JSON.stringify(railMetrics);
}

/** The stored theme choice must survive a reload and be applied before paint. */
async function themeCheck(ctx: QaContext): Promise<CheckOutcome> {
  await ctx.page.evaluate((key) => localStorage.setItem(key, "dark"), STORAGE_KEYS.theme);
  await ctx.page.reload({ waitUntil: "networkidle" });
  const applied = await ctx.page.evaluate(() => document.documentElement.dataset.theme === "dark");
  await ctx.page.evaluate((key) => localStorage.setItem(key, "light"), STORAGE_KEYS.theme);
  await ctx.page.reload({ waitUntil: "networkidle" });
  return applied ? true : "dark preference did not apply after reload";
}

async function a11yCheck(ctx: QaContext): Promise<CheckOutcome> {
  const skipLinks = await ctx.page.locator('a[href="#main-content"]').count();
  const landmarks = await ctx.page.locator("main#main-content").count();
  return skipLinks === 1 && landmarks === 1 ? true : `skipLinks=${skipLinks} landmarks=${landmarks}`;
}

async function signOutCheck(ctx: QaContext): Promise<CheckOutcome> {
  const page = ctx.page;
  await page.goto(`${ctx.baseUrl}/notifications`, { waitUntil: "networkidle" });
  await page.getByTestId("user-menu-trigger").click();
  await page.getByTestId("user-menu-sign-out").click();
  await page.waitForURL((url) => url.pathname === "/login", { timeout: 20_000 });
  return true;
}

/** A fresh browser context has no session cookie, so the route guard must bounce to /login. */
function unauthenticatedCheck(path: string): QaCheck["run"] {
  return async ({ browser, baseUrl }) => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle" });
      await page.waitForURL((url) => url.pathname === "/login", { timeout: 20_000 });
      return true;
    } finally {
      await context.close();
    }
  };
}

async function mobileLoginCheck({ browser, baseUrl }: QaContext): Promise<CheckOutcome> {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
    return (await page.locator("#email").isVisible()) ? true : "email input is not visible";
  } finally {
    await page.close();
  }
}

async function mobileScrollCheck({ browser, baseUrl }: QaContext): Promise<CheckOutcome> {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
    const widths = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      win: window.innerWidth,
    }));
    return widths.doc <= widths.win + 1 ? true : JSON.stringify(widths);
  } finally {
    await page.close();
  }
}

export const coreSuite: QaSuite = {
  name: "core",
  checks: [
    {
      name: "login: form and recovery action render",
      run: async ({ page, baseUrl }) => {
        await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
        const email = await page.locator("#email").count();
        const password = await page.locator("#password").count();
        const submit = await page.locator('button[type="submit"]').count();
        const recovery = await page.getByTestId("login-recovery-action").count();
        return email === 1 && password === 1 && submit === 1 && recovery === 1
          ? true
          : `email=${email} password=${password} submit=${submit} recovery=${recovery}`;
      },
    },
    {
      name: "login: sign-in lands on the overview",
      run: async (ctx) => {
        await signInOrStop(ctx);
        const pathname = new URL(ctx.page.url()).pathname;
        return pathname === "/" ? true : `landed on ${pathname}`;
      },
    },
    {
      name: "overview: landing renders",
      run: async (ctx) => {
        await ctx.page.goto(`${ctx.baseUrl}/`, { waitUntil: "networkidle" });
        await ctx.page.locator("main#main-content h1").first().waitFor({ state: "visible", timeout: 15_000 });
        return true;
      },
    },
    {
      name: "notifications: inbox renders",
      run: async (ctx) => {
        await ctx.page.goto(`${ctx.baseUrl}/notifications`, { waitUntil: "networkidle" });
        await ctx.page.locator("main#main-content h1").first().waitFor({ state: "visible", timeout: 15_000 });
        return true;
      },
    },
    { name: "sidebar: collapses to an aligned icon rail", run: collapsedSidebarCheck },
    { name: "theme: stored dark preference applies on reload", run: themeCheck },
    { name: "a11y: skip link and main landmark", run: a11yCheck },
    { name: "sign-out: returns to the login screen", run: signOutCheck },
    { name: "auth: unauthenticated visit redirects to login", run: unauthenticatedCheck("/") },
    { name: "auth: unauthenticated notifications redirects to login", run: unauthenticatedCheck("/notifications") },
    { name: "mobile: login form is not clipped", run: mobileLoginCheck },
    { name: "mobile: login has no horizontal scroll", run: mobileScrollCheck },
  ],
};

function tableScreenChecks(label: string, apiPath: string, term: string): QaCheck[] {
  return [
    {
      name: `${label}: search filters via the API`,
      run: async (ctx) => {
        const response = await searchResponse(ctx.page, apiPath, term);
        return response.ok() ? true : `HTTP ${response.status()}`;
      },
    },
  ];
}

function responsiveChecks(): QaCheck[] {
  const checks: QaCheck[] = [];
  for (const width of RESPONSIVE_WIDTHS) {
    checks.push({
      name: `users: responsive ${width}px has no horizontal overflow`,
      run: async (ctx) => {
        const page = ctx.page;
        await page.setViewportSize({ width, height: 900 });
        if (width < 768) {
          await page.getByTestId("resource-table-mobile-row").first().waitFor({ state: "visible" });
        } else {
          await page.getByRole("table").waitFor({ state: "visible" });
        }
        const size = await page.evaluate(() => ({
          viewport: document.documentElement.clientWidth,
          document: document.documentElement.scrollWidth,
          body: document.body.scrollWidth,
        }));
        return size.document <= size.viewport + 1 && size.body <= size.viewport + 1 ? true : JSON.stringify(size);
      },
    });
    if (width >= 768) continue;
    checks.push({
      name: `users: responsive ${width}px aligns search and primary action`,
      run: async (ctx) => {
        const page = ctx.page;
        await page.setViewportSize({ width, height: 900 });
        await page.getByTestId("resource-table-mobile-row").first().waitFor({ state: "visible" });
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
        return toolbarAligned ? true : "search and primary action are not aligned";
      },
    });
    checks.push({
      name: `users: responsive ${width}px keeps cards aligned and touchable`,
      run: async (ctx) => {
        const page = ctx.page;
        await page.setViewportSize({ width, height: 900 });
        await page.getByTestId("resource-table-mobile-row").first().waitFor({ state: "visible" });
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
        if (alignedCards) return true;
        const failingRows = rowMetrics.filter(
          (row) =>
            !row.symmetricPadding ||
            !row.noOverflow ||
            !row.valuesAlign ||
            !row.contentInsideRow ||
            !row.touchTargetsMeetMinimum,
        );
        return JSON.stringify(failingRows);
      },
    });
  }
  return checks;
}

/** `/users` is a catalog web feature; the table checks only run when it is installed. */
export const usersSuite: QaSuite = {
  name: "users",
  feature: "users",
  before: (ctx) => openTableScreen(ctx, "/users"),
  checks: [
    ...tableScreenChecks("users", "/api/v1/users", "a"),
    {
      name: "users: clicking the email header sorts",
      run: async (ctx) => {
        const page = ctx.page;
        const sortResponse = page.waitForResponse((candidate) => {
          const url = new URL(candidate.url());
          return url.pathname.endsWith("/api/v1/users") && url.searchParams.get("sort") === "email";
        });
        await page.getByRole("button", { name: /email/i }).first().click();
        const sorted = await sortResponse;
        const emailSort = await page.getByRole("columnheader", { name: /email/i }).getAttribute("aria-sort");
        return sorted.ok() && (emailSort === "ascending" || emailSort === "descending")
          ? true
          : `HTTP ${sorted.status()} aria-sort=${emailSort}`;
      },
    },
    {
      name: "users: role combobox opens and filters",
      run: async (ctx) => {
        const page = ctx.page;
        await page.goto(`${ctx.baseUrl}/users`, { waitUntil: "networkidle" });
        await page.getByTestId("resource-table-primary-action").click();
        await page.locator('[data-testid="user-role"]').click();
        const roleItems = page.locator("[cmdk-item]");
        await roleItems.first().waitFor({ state: "visible" });
        const before = await roleItems.count();
        await page.locator("[cmdk-input]").fill("owner");
        await roleItems.filter({ hasText: /owner/i }).waitFor({ state: "visible" });
        const after = await roleItems.count();
        /** The first Escape closes only the popover; the second is swallowed until its exit animation ends. */
        await page.keyboard.press("Escape");
        await page.locator("[cmdk-input]").waitFor({ state: "detached" });
        await page.keyboard.press("Escape");
        await page.locator('[data-testid="user-role"]').waitFor({ state: "hidden" });
        return before > 1 && after === 1 ? true : `before=${before} after=${after}`;
      },
    },
    {
      name: "users: no inline alerts on the screen",
      run: async (ctx) => {
        const page = ctx.page;
        await page.goto(`${ctx.baseUrl}/users`, { waitUntil: "networkidle" });
        await page.getByTestId("table-search").waitFor({ state: "visible" });
        const inlineAlerts = await page.locator("main [role='alert']").count();
        return inlineAlerts === 0 ? true : `found ${inlineAlerts}`;
      },
    },
    ...responsiveChecks(),
  ],
};

/** `/roles` is a catalog web feature; its checks only run when it is installed. */
export const rolesSuite: QaSuite = {
  name: "roles",
  feature: "roles",
  before: (ctx) => openTableScreen(ctx, "/roles"),
  checks: tableScreenChecks("roles", "/api/v1/roles", "own"),
};

/** `/audit` is a catalog web feature; its checks only run when it is installed. */
export const auditSuite: QaSuite = {
  name: "audit",
  feature: "audit",
  before: (ctx) => openTableScreen(ctx, "/audit"),
  checks: tableScreenChecks("audit", "/api/v1/audit-logs", "role"),
};

/** Failed sign-in feedback; needs no account, so `bun loom qa --only=login` works against any deployment. */
export const loginSuite: QaSuite = {
  name: "login",
  checks: [
    {
      name: "login: a failed sign-in is announced as a toast outside the form",
      run: async ({ page, baseUrl }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await paceSignIn();
        await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
        await page.fill("#email", "missing-user@example.test");
        await page.fill("#password", "invalid-password-for-browser-test");
        await page.click('button[type="submit"]');
        const toast = page.getByRole("alert");
        await toast.waitFor({ state: "visible", timeout: 10_000 });
        const message = (await toast.innerText()).trim();
        const alertsInsideForm = await page.locator("form [role='alert']").count();
        return message && alertsInsideForm === 0
          ? true
          : `Expected a visible toast outside the login form (message=${Boolean(message)}, inline=${alertsInsideForm})`;
      },
    },
  ],
};

async function openAssistant(ctx: QaContext): Promise<void> {
  try {
    await signInOrStop(ctx);
    await ctx.page.getByTestId("assistant-trigger").click();
    await ctx.page.getByTestId("assistant-panel").waitFor({ state: "visible", timeout: 10_000 });
  } catch (error) {
    ctx.stopReason = "opening the assistant failed";
    throw error;
  }
}

/**
 * The built-in assistant. Run it against `AI_DRIVER=fake` locally; against a real provider it spends
 * one question of the account's daily AI limit.
 */
export const assistantSuite: QaSuite = {
  name: "assistant",
  feature: "assistant",
  before: openAssistant,
  checks: [
    {
      name: "assistant: empty panel offers suggestions",
      run: async ({ page }) => {
        const suggestions = await page.getByTestId("assistant-suggestion").count();
        return suggestions > 0 ? true : "no suggestions in the empty panel";
      },
    },
    {
      name: "assistant: a question streams an answer and updates the remaining count",
      run: async ({ page }) => {
        const before = (await page.getByTestId("assistant-remaining").innerText()).trim();
        await page.getByTestId("assistant-input").fill("Apa itu ERP?");
        await page.keyboard.press("Enter");
        const answer = page.locator('[data-role="assistant"]').last();
        await answer.waitFor({ state: "visible", timeout: 30_000 });
        await page.getByTestId("assistant-send").waitFor({ state: "visible", timeout: 60_000 });
        const text = (await answer.innerText()).trim();
        const after = (await page.getByTestId("assistant-remaining").innerText()).trim();
        if (text === "") return "the answer is empty";
        return after !== before ? true : `remaining count did not change (${before})`;
      },
    },
    {
      name: "assistant: Escape closes the panel and Ctrl+J reopens it",
      run: async ({ page }) => {
        await page.keyboard.press("Escape");
        await page.getByTestId("assistant-panel").waitFor({ state: "hidden", timeout: 5_000 });
        await page.keyboard.press("Control+j");
        await page.getByTestId("assistant-panel").waitFor({ state: "visible", timeout: 5_000 });
        const kept = await page.locator('[data-role="user"]').count();
        return kept > 0 ? true : "the conversation was lost when the panel closed";
      },
    },
    {
      name: "assistant: typing / opens the skill menu; arrows and Enter pick a skill shown as a chip",
      run: async ({ page }) => {
        await page.getByTestId("assistant-reset").click();
        await page.getByTestId("assistant-input").fill("/");
        await page.getByRole("listbox").waitFor({ state: "visible", timeout: 5_000 });
        const options = await page.getByTestId("assistant-skill-option").count();
        if (options < 3) return `expected 3 skills, saw ${options}`;
        await page.keyboard.press("ArrowDown");
        const active = await page.locator('[role="option"][aria-selected="true"]').innerText();
        await page.keyboard.press("Enter");
        const chip = page.getByTestId("assistant-composer-chip");
        await chip.waitFor({ state: "visible", timeout: 5_000 });
        const left = await page.getByRole("listbox").count();
        const chipText = (await chip.innerText()).trim();
        if (left > 0) return "the menu stayed open after choosing a skill";
        return active.toLowerCase().includes(chipText.toLowerCase().split(" ")[0] ?? "")
          ? true
          : `${active} vs ${chipText}`;
      },
    },
    {
      name: "assistant: Escape closes the skill menu first and the chip can be removed",
      run: async ({ page }) => {
        await page.getByTestId("assistant-skill-remove").click();
        await page.getByTestId("assistant-input").fill("/tr");
        await page.getByRole("listbox").waitFor({ state: "visible", timeout: 5_000 });
        await page.keyboard.press("Escape");
        await page.getByRole("listbox").waitFor({ state: "hidden", timeout: 5_000 });
        const stillOpen = await page.getByTestId("assistant-panel").isVisible();
        if (!stillOpen) return "Escape closed the whole panel instead of only the menu";
        await page.getByTestId("assistant-input").fill("");
        return true;
      },
    },
    {
      name: "assistant: a skill question shows the chip in the transcript",
      run: async ({ page }) => {
        await page.getByTestId("assistant-input").fill("/");
        await page.keyboard.press("Enter");
        await page.getByTestId("assistant-input").fill("Terjemahkan: selamat pagi");
        await page.keyboard.press("Enter");
        await page.getByTestId("assistant-skill-chip").first().waitFor({ state: "visible", timeout: 10_000 });
        await page.getByTestId("assistant-send").waitFor({ state: "visible", timeout: 60_000 });
        return true;
      },
    },
    {
      name: "assistant: a notification question shows a tool card",
      run: async ({ page }) => {
        await page.getByTestId("assistant-input").fill("Berapa notifikasi saya?");
        await page.keyboard.press("Enter");
        await page.getByTestId("assistant-send").waitFor({ state: "visible", timeout: 60_000 });
        const card = page.getByTestId("assistant-tool").last();
        await card.waitFor({ state: "visible", timeout: 10_000 });
        const status = await card.getAttribute("data-status");
        return status === "done" ? true : `tool card status ${status}`;
      },
    },
    {
      name: "assistant: answer actions copy, regenerate and edit are available",
      run: async ({ page }) => {
        const answer = page.locator('[data-role="assistant"]').last();
        await answer.hover();
        const copy = await answer.getByTestId("assistant-copy").count();
        const regenerate = await page.getByTestId("assistant-regenerate").count();
        const edit = await page.getByTestId("assistant-edit").count();
        return copy === 1 && regenerate === 1 && edit > 0
          ? true
          : `copy ${copy}, regenerate ${regenerate}, edit ${edit}`;
      },
    },
    {
      name: "assistant: regenerate replaces the last answer instead of adding one",
      run: async ({ page }) => {
        const before = await page.locator('[data-role="assistant"]').count();
        await page.getByTestId("assistant-regenerate").click({ force: true });
        await page.getByTestId("assistant-send").waitFor({ state: "visible", timeout: 60_000 });
        const after = await page.locator('[data-role="assistant"]').count();
        return after === before ? true : `answers ${before} -> ${after}`;
      },
    },
    {
      name: "assistant: edit & resend replaces the question and everything after it",
      run: async ({ page }) => {
        const questions = page.locator('[data-role="user"]');
        const total = await questions.count();
        await questions.nth(total - 1).hover();
        await page.getByTestId("assistant-edit").last().click({ force: true });
        await page.getByTestId("assistant-edit-input").fill("Berapa notifikasi yang belum dibaca?");
        await page.getByTestId("assistant-edit-save").click();
        await page.getByTestId("assistant-send").waitFor({ state: "visible", timeout: 60_000 });
        const last = (await page.locator('[data-role="user"]').last().innerText()).trim();
        const count = await page.locator('[data-role="user"]').count();
        return last.includes("belum dibaca") && count === total ? true : `${count} questions, last: ${last}`;
      },
    },
    {
      name: "assistant: open in full view continues the same conversation",
      run: async ({ page }) => {
        const before = await page.locator('[data-role="user"]').count();
        await page.getByTestId("assistant-open-full").click();
        await page.getByTestId("assistant-page").waitFor({ state: "visible", timeout: 10_000 });
        // The sheet animates out; counting turns while it is still mounted would count them twice.
        await page.getByTestId("assistant-panel").waitFor({ state: "detached", timeout: 10_000 });
        const url = new URL(page.url());
        if (url.pathname !== "/assistant" || !url.searchParams.get("c")) return `unexpected URL ${page.url()}`;
        await page.locator('[data-role="user"]').first().waitFor({ state: "visible", timeout: 10_000 });
        const after = await page.locator('[data-role="user"]').count();
        return after === before ? true : `questions ${before} -> ${after}`;
      },
    },
    {
      name: "assistant: the full page lists saved conversations and reloads one from the URL",
      run: async ({ page }) => {
        await page.getByTestId("conversation-item").first().waitFor({ state: "visible", timeout: 10_000 });
        await page.reload({ waitUntil: "networkidle" });
        await page.locator('[data-role="user"]').first().waitFor({ state: "visible", timeout: 15_000 });
        const active = await page.locator('[data-testid="conversation-item"][aria-current="true"]').count();
        return active === 1 ? true : `active conversations: ${active}`;
      },
    },
    {
      name: "assistant: a new conversation, rename and delete work from the list",
      run: async ({ page }) => {
        await page.getByTestId("conversation-new").click();
        await page.getByTestId("assistant-input").fill("Percakapan kedua");
        await page.keyboard.press("Enter");
        await page.getByTestId("assistant-send").waitFor({ state: "visible", timeout: 60_000 });
        await page.waitForFunction(() => document.querySelectorAll('[data-testid="conversation-item"]').length >= 2);
        const row = page.locator('[data-testid="conversation-item"][aria-current="true"]');
        await row.hover();
        await page.getByTestId("conversation-rename").first().click({ force: true });
        await page.getByTestId("conversation-rename-input").fill("Judul diganti");
        await page.keyboard.press("Enter");
        await page.getByText("Judul diganti").first().waitFor({ state: "visible", timeout: 10_000 });
        await page.getByTestId("conversation-delete").first().click({ force: true });
        await page.getByTestId("conversation-delete-confirm").click();
        await page.getByText("Judul diganti").waitFor({ state: "hidden", timeout: 10_000 });
        return true;
      },
    },
    {
      name: "assistant: the list collapses on desktop and the chat keeps a reading width",
      run: async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.getByTestId("assistant-list-toggle").click();
        await page.getByTestId("assistant-list").waitFor({ state: "hidden", timeout: 5_000 });
        await page.getByTestId("assistant-list-toggle").click();
        await page.getByTestId("assistant-list").waitFor({ state: "visible", timeout: 5_000 });
        await page.getByTestId("assistant-input").fill("Tampilkan tabel kecil");
        await page.keyboard.press("Enter");
        await page.getByTestId("assistant-send").waitFor({ state: "visible", timeout: 60_000 });
        const width = await page
          .locator("ol[aria-label]")
          .last()
          .evaluate((node) => node.getBoundingClientRect().width);
        return width <= 768 + 1 ? true : `transcript is ${width}px wide`;
      },
    },
    {
      name: "assistant: the full page has no horizontal scroll from 320 to 1440 px",
      run: async ({ page }) => {
        const bad: string[] = [];
        for (const width of [320, 390, 768, 1024, 1440]) {
          await page.setViewportSize({ width, height: 800 });
          const widths = await page.evaluate(() => ({
            doc: document.documentElement.scrollWidth,
            win: window.innerWidth,
          }));
          if (widths.doc > widths.win + 1) bad.push(`${width}: ${widths.doc}`);
        }
        return bad.length === 0 ? true : `horizontal scroll at ${bad.join(", ")}`;
      },
    },
    {
      name: "assistant: on a phone the conversation list opens as a drawer",
      run: async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.getByTestId("assistant-list-toggle-mobile").click();
        await page.getByTestId("assistant-list-drawer").waitFor({ state: "visible", timeout: 5_000 });
        await page.getByTestId("conversation-item").last().click();
        await page.getByTestId("assistant-list-drawer").waitFor({ state: "hidden", timeout: 5_000 });
        const inputBox = await page.getByTestId("assistant-input").boundingBox();
        return inputBox && inputBox.y + inputBox.height <= 844 ? true : `composer at ${JSON.stringify(inputBox)}`;
      },
    },
    {
      name: "assistant: mobile panel fits the screen without horizontal scroll",
      run: async ({ page, baseUrl }) => {
        await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.getByTestId("assistant-trigger").click();
        await page.getByTestId("assistant-panel").waitFor({ state: "visible", timeout: 10_000 });
        const box = await page.getByTestId("assistant-panel").boundingBox();
        const widths = await page.evaluate(() => ({
          doc: document.documentElement.scrollWidth,
          win: window.innerWidth,
        }));
        if (!box || box.width > 391) return `panel width ${box?.width}`;
        return widths.doc <= widths.win + 1 ? true : JSON.stringify(widths);
      },
    },
  ],
};

export const SUITES: readonly QaSuite[] = [coreSuite, loginSuite, assistantSuite, usersSuite, rolesSuite, auditSuite];
