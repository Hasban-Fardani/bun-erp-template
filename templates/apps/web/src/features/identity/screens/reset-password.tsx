import { useI18n } from "@bun-erp/i18n/react";
import { getRouteApi, Link } from "@tanstack/react-router";
import { ApiError } from "@web/lib/api.ts";
import { type ResetPasswordState, ResetPasswordView } from "../components/reset-password-view.tsx";
import { useResetPassword } from "../hooks/index.ts";

const routeApi = getRouteApi("/reset-password");
const INVALID_TOKEN = "INVALID_TOKEN";

/**
 * The reset link lands here through Better Auth, which redirects with `?token=` for a live token
 * and `?error=INVALID_TOKEN` for an expired or unknown one. A missing token is treated the same.
 */
export function ResetPasswordScreen() {
  const { t } = useI18n();
  const { token, error } = routeApi.useSearch();
  const reset = useResetPassword();

  let state: ResetPasswordState = "form";
  if (reset.isPending) state = "pending";
  else if (reset.isSuccess) state = "done";
  else if (reset.error instanceof ApiError && reset.error.code === INVALID_TOKEN) state = "expired";
  else if (reset.isError) state = "failed";
  else if (!token || error) state = "expired";

  const linkClass = "font-medium text-accent underline-offset-4 hover:underline";
  return (
    <ResetPasswordView
      state={state}
      onSubmit={(newPassword) => {
        if (token) reset.mutate({ token, newPassword });
      }}
      signInLink={
        <Link to="/login" className={linkClass}>
          {t("auth.backToSignIn")}
        </Link>
      }
      requestLink={
        <Link to="/forgot-password" className={linkClass}>
          {t("auth.reset.requestNew")}
        </Link>
      }
    />
  );
}
