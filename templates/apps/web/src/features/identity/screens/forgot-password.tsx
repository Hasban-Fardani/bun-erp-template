import { useI18n } from "@loom/i18n/react";
import { Link } from "@tanstack/react-router";
import { ApiError } from "@web/lib/api.ts";
import { type ForgotPasswordState, ForgotPasswordView } from "../components/forgot-password-view.tsx";
import { useRequestPasswordReset } from "../hooks/index.ts";

/** Better Auth answers this code when the server has no `sendResetPassword` (mail not installed). */
const RESET_DISABLED = "RESET_PASSWORD_DISABLED";

export function ForgotPasswordScreen() {
  const { t } = useI18n();
  const request = useRequestPasswordReset();

  let state: ForgotPasswordState = "idle";
  if (request.isPending) state = "pending";
  else if (request.isSuccess) state = "sent";
  else if (request.error instanceof ApiError && request.error.code === RESET_DISABLED) state = "unavailable";
  else if (request.isError) state = "failed";

  return (
    <ForgotPasswordView
      state={state}
      onSubmit={(email) => request.mutate({ email, redirectTo: `${window.location.origin}/reset-password` })}
      signInLink={
        <Link to="/login" className="font-medium text-accent underline-offset-4 hover:underline">
          {t("auth.backToSignIn")}
        </Link>
      }
    />
  );
}
