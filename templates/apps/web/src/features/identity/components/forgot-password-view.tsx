import { useI18n } from "@bun-erp/i18n/react";
import { Button } from "@bun-erp/ui/atoms/button.tsx";
import { Input } from "@bun-erp/ui/atoms/input.tsx";
import { FormErrors, FormFieldError } from "@bun-erp/ui/molecules/form-errors.tsx";
import { useForm } from "@tanstack/react-form";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { AuthCard } from "./auth-card.tsx";

/**
 * idle: the form. pending: the request is in flight. sent: shown for known and unknown addresses
 * alike, so the screen never reveals whether an account exists. failed: transport or server error.
 * unavailable: the server has no mail sender, so reset is a manual administrator task.
 */
export type ForgotPasswordState = "idle" | "pending" | "sent" | "failed" | "unavailable";

type Props = {
  state: ForgotPasswordState;
  onSubmit: (email: string) => void;
  /** The sign-in link is injected so the view renders without a router (tests, previews). */
  signInLink: ReactNode;
};

export function ForgotPasswordView({ state, onSubmit, signInLink }: Props) {
  const { t } = useI18n();
  const form = useForm({
    defaultValues: { email: "" },
    validators: {
      onSubmit: ({ value }) =>
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email) ? undefined : { fields: { email: t("auth.emailInvalid") } },
    },
    onSubmit: ({ value }) => onSubmit(value.email.trim()),
  });

  if (state === "sent") {
    return (
      <AuthCard>
        <h1 className="text-[22px] font-semibold tracking-tight">{t("auth.forgot.sentTitle")}</h1>
        <p role="status" data-testid="forgot-password-sent" className="mt-3 text-[14.5px] text-ink-soft">
          {t("auth.forgot.sentBody")}
        </p>
        <div className="mt-6 text-[13.5px]">{signInLink}</div>
      </AuthCard>
    );
  }

  if (state === "unavailable") {
    return (
      <AuthCard>
        <h1 className="text-[22px] font-semibold tracking-tight">{t("auth.recovery.title")}</h1>
        <p data-testid="forgot-password-unavailable" className="mt-3 text-[14.5px] text-ink-soft">
          {t("auth.recovery.bodyOne")}
        </p>
        <p className="mt-3 text-[14.5px] text-ink-soft">{t("auth.recovery.bodyTwo")}</p>
        <div className="mt-6 text-[13.5px]">{signInLink}</div>
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
        aria-label={t("auth.forgot.title")}
      >
        <h1 className="text-[22px] font-semibold tracking-tight">{t("auth.forgot.title")}</h1>
        <p className="mt-2 text-[14.5px] text-ink-soft">{t("auth.forgot.intro")}</p>

        <form.Field name="email">
          {(field) => {
            const errors = field.state.meta.errors;
            return (
              <>
                <label htmlFor="forgot-email" className="mt-6 block text-[13px] font-medium text-ink-soft">
                  {t("common.email")}
                </label>
                <Input
                  id="forgot-email"
                  className="mt-1.5 h-11 rounded-lg px-3 text-base"
                  type="email"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  autoComplete="email"
                  placeholder={t("auth.emailPlaceholder")}
                  aria-invalid={errors.length > 0}
                  aria-describedby={errors.length > 0 ? "forgot-email-error" : undefined}
                  autoFocus
                />
                <FormFieldError id="forgot-email-error" errors={errors} />
              </>
            );
          }}
        </form.Field>

        <form.Subscribe selector={(formState) => formState.errors}>
          {(errors) => <FormErrors errors={errors} />}
        </form.Subscribe>
        {state === "failed" ? (
          <p role="alert" data-testid="forgot-password-failed" className="mt-4 text-[13.5px] text-danger">
            {t("auth.forgot.failed")}
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
              {t("auth.forgot.sending")}
            </>
          ) : (
            t("auth.forgot.submit")
          )}
        </Button>
        <div className="mt-6 text-[13.5px]">{signInLink}</div>
      </form>
    </AuthCard>
  );
}
