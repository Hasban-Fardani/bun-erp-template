import { useI18n } from "@bun-erp/i18n/react";
import { Button } from "@bun-erp/ui/atoms/button.tsx";
import { Input } from "@bun-erp/ui/atoms/input.tsx";
import { FormErrors, FormFieldError } from "@bun-erp/ui/molecules/form-errors.tsx";
import { useForm } from "@tanstack/react-form";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { AuthCard } from "./auth-card.tsx";

/** Matches `minPasswordLength` in the server's Better Auth config. */
export const MIN_PASSWORD_LENGTH = 10;

/**
 * form: choose a new password. pending: saving. done: password changed. expired: the link is
 * missing, used, or past its one-hour life (Better Auth redirects with `error=INVALID_TOKEN`).
 * failed: any other error, with the form kept so the person can retry.
 */
export type ResetPasswordState = "form" | "pending" | "done" | "expired" | "failed";

type Props = {
  state: ResetPasswordState;
  onSubmit: (newPassword: string) => void;
  signInLink: ReactNode;
  requestLink: ReactNode;
};

export function ResetPasswordView({ state, onSubmit, signInLink, requestLink }: Props) {
  const { t } = useI18n();
  const form = useForm({
    defaultValues: { password: "", confirm: "" },
    validators: {
      onSubmit: ({ value }) => {
        const fields: Record<string, string> = {};
        if (value.password.length < MIN_PASSWORD_LENGTH) fields.password = t("auth.reset.passwordTooShort");
        else if (value.confirm !== value.password) fields.confirm = t("auth.reset.passwordMismatch");
        return Object.keys(fields).length ? { fields } : undefined;
      },
    },
    onSubmit: ({ value }) => onSubmit(value.password),
  });

  if (state === "done") {
    return (
      <AuthCard>
        <h1 className="text-[22px] font-semibold tracking-tight">{t("auth.reset.doneTitle")}</h1>
        <p role="status" data-testid="reset-password-done" className="mt-3 text-[14.5px] text-ink-soft">
          {t("auth.reset.doneBody")}
        </p>
        <div className="mt-6 text-[13.5px]">{signInLink}</div>
      </AuthCard>
    );
  }

  if (state === "expired") {
    return (
      <AuthCard>
        <h1 className="text-[22px] font-semibold tracking-tight">{t("auth.reset.expiredTitle")}</h1>
        <p role="alert" data-testid="reset-password-expired" className="mt-3 text-[14.5px] text-ink-soft">
          {t("auth.reset.expiredBody")}
        </p>
        <div className="mt-6 flex flex-col gap-3 text-[13.5px]">
          {requestLink}
          {signInLink}
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
        noValidate
        aria-label={t("auth.reset.title")}
      >
        <h1 className="text-[22px] font-semibold tracking-tight">{t("auth.reset.title")}</h1>
        <p className="mt-2 text-[14.5px] text-ink-soft">{t("auth.reset.intro")}</p>

        <form.Field name="password">
          {(field) => {
            const errors = field.state.meta.errors;
            return (
              <>
                <label htmlFor="new-password" className="mt-6 block text-[13px] font-medium text-ink-soft">
                  {t("auth.reset.newPassword")}
                </label>
                <Input
                  id="new-password"
                  className="mt-1.5 h-11 rounded-lg px-3 text-base"
                  type="password"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  autoComplete="new-password"
                  aria-invalid={errors.length > 0}
                  aria-describedby={errors.length > 0 ? "new-password-error" : undefined}
                  autoFocus
                />
                <FormFieldError id="new-password-error" errors={errors} />
              </>
            );
          }}
        </form.Field>

        <form.Field name="confirm">
          {(field) => {
            const errors = field.state.meta.errors;
            return (
              <>
                <label htmlFor="confirm-password" className="mt-4 block text-[13px] font-medium text-ink-soft">
                  {t("auth.reset.confirmPassword")}
                </label>
                <Input
                  id="confirm-password"
                  className="mt-1.5 h-11 rounded-lg px-3 text-base"
                  type="password"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  autoComplete="new-password"
                  aria-invalid={errors.length > 0}
                  aria-describedby={errors.length > 0 ? "confirm-password-error" : undefined}
                />
                <FormFieldError id="confirm-password-error" errors={errors} />
              </>
            );
          }}
        </form.Field>

        <form.Subscribe selector={(formState) => formState.errors}>
          {(errors) => <FormErrors errors={errors} />}
        </form.Subscribe>
        {state === "failed" ? (
          <p role="alert" data-testid="reset-password-failed" className="mt-4 text-[13.5px] text-danger">
            {t("auth.reset.failed")}
          </p>
        ) : null}
        <Button
          className="mt-6 h-11 w-full justify-center rounded-lg text-[15px]"
          type="submit"
          disabled={state === "pending"}
        >
          {state === "pending" ? (
            <>
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              {t("auth.reset.saving")}
            </>
          ) : (
            t("auth.reset.submit")
          )}
        </Button>
        <div className="mt-6 text-[13.5px]">{signInLink}</div>
      </form>
    </AuthCard>
  );
}
