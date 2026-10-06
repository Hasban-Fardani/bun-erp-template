import { chromium } from "playwright-core";

const baseUrl = process.env.QA_BASE_URL ?? "http://localhost:5173";
const executablePath = process.env.CHROME_PATH ?? chromium.executablePath();
const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", "missing-user@example.test");
  await page.fill("#password", "invalid-password-for-browser-test");
  await page.click('button[type="submit"]');

  const toast = page.getByRole("alert");
  await toast.waitFor({ state: "visible", timeout: 10_000 });
  const message = (await toast.innerText()).trim();
  const alertsInsideForm = await page.locator("form [role='alert']").count();
  if (!message || alertsInsideForm !== 0) {
    throw new Error(
      `Expected a visible toast outside the login form (message=${Boolean(message)}, inline=${alertsInsideForm})`,
    );
  }

  console.log(`PASS login failure is announced as a toast: ${message}`);
} finally {
  await browser.close();
}
