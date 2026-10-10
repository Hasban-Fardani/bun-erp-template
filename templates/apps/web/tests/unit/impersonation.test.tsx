import { expect, test } from "bun:test";
import { I18nProvider } from "@loom/i18n/react";
import { renderToStaticMarkup } from "react-dom/server";
import { ImpersonationBannerView } from "../../src/features/identity/components/impersonation-banner.tsx";
import { canImpersonate } from "../../src/features/identity/lib/impersonation.ts";

const owner = { id: "o1", name: "Owner", email: "o@example.test" };
const target = { id: "u2", roles: [{ key: "staff" }], permissions: ["user.read"] };

test("the action shows only for a holder of user.impersonate on an eligible row", () => {
  expect(canImpersonate({ permissions: ["user.impersonate"], user: owner }, target)).toBe(true);
  expect(canImpersonate({ permissions: ["user.read"], user: owner }, target)).toBe(false);
});

test("the action is hidden for yourself, an owner row, an impersonator row and while impersonating", () => {
  const session = { permissions: ["user.impersonate"], user: owner };
  expect(canImpersonate(session, { ...target, id: "o1" })).toBe(false);
  expect(canImpersonate(session, { ...target, roles: [{ key: "owner" }] })).toBe(false);
  expect(canImpersonate(session, { ...target, permissions: ["user.impersonate"] })).toBe(false);
  expect(
    canImpersonate({ ...session, impersonation: { by: { name: "A", email: "a@x.test" }, expiresAt: "" } }, target),
  ).toBe(false);
});

test("the banner names the viewed user, offers Stop and has no dismiss control", () => {
  const html = renderToStaticMarkup(
    <I18nProvider>
      <ImpersonationBannerView name="Ayu" onStop={() => {}} />
    </I18nProvider>,
  );
  expect(html).toContain("Viewing as Ayu");
  expect(html).toContain("impersonation-stop");
  expect(html).toContain(">Stop<");
  expect(html).not.toMatch(/aria-label="(Close|Dismiss|Tutup)/i);
  expect(html.match(/<button/g)).toHaveLength(1);
});
