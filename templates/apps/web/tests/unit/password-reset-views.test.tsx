import { expect, test } from "bun:test";
import { I18nProvider } from "@loom/i18n/react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  type ForgotPasswordState,
  ForgotPasswordView,
} from "../../src/features/identity/components/forgot-password-view.tsx";
import {
  type ResetPasswordState,
  ResetPasswordView,
} from "../../src/features/identity/components/reset-password-view.tsx";

const link = <a href="/login">back</a>;

function forgot(state: ForgotPasswordState): string {
  return renderToStaticMarkup(
    <I18nProvider>
      <ForgotPasswordView state={state} onSubmit={() => {}} signInLink={link} />
    </I18nProvider>,
  );
}

function reset(state: ResetPasswordState): string {
  return renderToStaticMarkup(
    <I18nProvider>
      <ResetPasswordView
        state={state}
        onSubmit={() => {}}
        signInLink={link}
        requestLink={<a href="/forgot-password">again</a>}
      />
    </I18nProvider>,
  );
}

test("forgot-password idle renders an email field and an enabled submit", () => {
  const html = forgot("idle");
  expect(html).toContain('id="forgot-email"');
  expect(html).toContain('type="submit"');
  expect(html).not.toContain('disabled=""');
});

test("forgot-password pending disables the submit", () => {
  const html = forgot("pending");
  expect(html).toContain('disabled=""');
  expect(html).not.toContain("forgot-password-failed");
});

test("forgot-password sent shows the neutral confirmation and no form", () => {
  const html = forgot("sent");
  expect(html).toContain('data-testid="forgot-password-sent"');
  expect(html).not.toContain('id="forgot-email"');
});

test("forgot-password failed keeps the form and announces the error", () => {
  const html = forgot("failed");
  expect(html).toContain('data-testid="forgot-password-failed"');
  expect(html).toContain('role="alert"');
  expect(html).toContain('id="forgot-email"');
});

test("forgot-password unavailable explains the administrator path instead of a dead form", () => {
  const html = forgot("unavailable");
  expect(html).toContain('data-testid="forgot-password-unavailable"');
  expect(html).not.toContain('id="forgot-email"');
});

test("reset-password form asks for a new password twice with new-password autocomplete", () => {
  const html = reset("form");
  expect(html).toContain('id="new-password"');
  expect(html).toContain('id="confirm-password"');
  expect(html).toContain('autoComplete="new-password"');
});

test("reset-password pending disables the submit", () => {
  expect(reset("pending")).toContain('disabled=""');
});

test("reset-password done confirms the change and links to sign-in", () => {
  const html = reset("done");
  expect(html).toContain('data-testid="reset-password-done"');
  expect(html).toContain("/login");
});

test("reset-password expired offers a new request and hides the form", () => {
  const html = reset("expired");
  expect(html).toContain('data-testid="reset-password-expired"');
  expect(html).toContain("/forgot-password");
  expect(html).not.toContain('id="new-password"');
});

test("reset-password failed keeps the form with an alert", () => {
  const html = reset("failed");
  expect(html).toContain('data-testid="reset-password-failed"');
  expect(html).toContain('id="new-password"');
});
