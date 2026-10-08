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

/** Failed sign-in feedback; needs no account, so `bun erp qa --only=login` works against any deployment. */
export const loginSuite: QaSuite = {
  name: "login",
  checks: [
    {
      name: "login: a failed sign-in is announced as a toast outside the form",
      run: async ({ page, baseUrl }) => {
        await page.setViewportSize({ width: 390, height: 844 });
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

export const SUITES: readonly QaSuite[] = [coreSuite, loginSuite, usersSuite, rolesSuite, auditSuite];
