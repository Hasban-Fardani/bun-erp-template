import { LocaleSwitcher, useI18n } from "@bun-erp/i18n/react";
import { Button } from "@bun-erp/ui/atoms/button.tsx";
import { Input } from "@bun-erp/ui/atoms/input.tsx";
import { FormErrors, FormFieldError } from "@bun-erp/ui/molecules/form-errors.tsx";
import { useForm } from "@tanstack/react-form";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { shippedFeatures } from "@web/config/navigation.ts";
import { uiConfig } from "@web/config/ui.ts";
import { safeRedirectTarget } from "@web/lib/redirect.ts";
import { Eye, EyeOff, Loader2, Users as UsersIcon } from "lucide-react";
import { useState } from "react";
import { useLogin } from "../hooks/index.ts";

const routeApi = getRouteApi("/login");

/**
 * The app's single entry gate; the Better Auth cookie owns the session after it.
 *
 * A two-column entry screen rather than one centred card: ui.shadcn.com/blocks/login ships five
 * variants and two of them are two-column with a cover, so the single card is one option among
 * several, not the standard.
 *
 * The left panel has to argue something or it is a stock slab. It lists the modules this build
 * actually ships, read from the same navigation config source the sidebar uses. A template has no
 * customers to name, and inventing logos or uptime numbers would be fabrication; naming its own
 * modules is the honest version of that device.
 *
 * The form column carries the measured density recorded in the login design spec: 44px
 * inputs with 16px text. The 16px is load-bearing, not taste — below it, mobile Safari zooms the
 * viewport on focus, and the recovery link sits on the password label row the way comparable
 * products place it.
 */
export function LoginScreen() {
  const { t } = useI18n();
  const login = useLogin();
  const navigate = useNavigate();
  const { redirect } = routeApi.useSearch();
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm({
    defaultValues: { email: "", password: "" },
    validators: {
      onSubmit: ({ value }) => {
        const fields: Record<string, string> = {};
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) fields.email = t("auth.emailInvalid");
        if (!value.password) fields.password = t("auth.passwordRequired");
        return Object.keys(fields).length ? { fields } : undefined;
      },
    },
    onSubmit: ({ value }) =>
      login.mutate(value, {
        onSuccess: () => {
          const target = safeRedirectTarget(redirect);
          if (target) void navigate({ href: target });
          else void navigate({ to: "/" });
        },
      }),
  });

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* Hidden below lg: on a phone the panel would push the form off the first screen. */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-inverse-surface p-12 text-inverse-muted lg:flex">
        <div className="enter-soft flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-ink">
            <UsersIcon className="size-5" aria-hidden="true" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-inverse-foreground">{uiConfig.appName}</span>
        </div>

        <div className="enter-soft max-w-sm">
          <p className="text-[26px] leading-snug font-semibold tracking-tight text-inverse-foreground">
            {t("auth.accessSummary")}
          </p>

          <p className="mt-8 text-[12px] font-medium tracking-wider text-inverse-subtle uppercase">
            {t("auth.featureHeading")}
          </p>
          <ul className="mt-3 space-y-3">
            {shippedFeatures.map((item) => (
              <li key={item.titleKey} className="flex items-center gap-3 text-[14.5px] text-inverse-muted">
                <item.icon size={16} className="shrink-0 text-accent-soft" aria-hidden="true" />
                {t(item.titleKey)}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-[12.5px] text-inverse-subtle">{t("auth.accessByRole")}</p>
      </aside>

      <div className="flex flex-col items-center justify-center px-4 py-10">
        {/* slop-ok: the brand lockup repeats for the mobile and desktop layouts on purpose. */}
        <div className="enter-soft mb-6 flex items-center gap-2.5 lg:hidden">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-ink">
            <UsersIcon className="size-5" aria-hidden="true" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">{uiConfig.appName}</span>
        </div>

        <div className="mb-4 flex w-full max-w-[23rem] justify-end">
          <LocaleSwitcher className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-ink" />
        </div>

        <form
          className="enter-soft mx-auto w-full max-w-[23rem]"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
          noValidate
          aria-label={t("auth.formLabel")}
        >
          <h1 className="text-[22px] font-semibold tracking-tight">{t("auth.welcomeBack")}</h1>

          <form.Field name="email">
            {(field) => {
              const errors = field.state.meta.errors;
              return (
                <>
                  <label htmlFor="email" className="mt-6 block text-[13px] font-medium text-ink-soft">
                    {t("common.email")}
                  </label>
                  <Input
                    id="email"
                    className="mt-1.5 h-11 rounded-lg px-3 text-base"
                    type="email"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                    autoComplete="username"
                    placeholder={t("auth.emailPlaceholder")}
                    aria-invalid={errors.length > 0}
                    aria-describedby={errors.length > 0 ? "email-error" : undefined}
                    autoFocus
                  />
                  <FormFieldError id="email-error" errors={errors} />
                </>
              );
            }}
          </form.Field>

          <form.Field name="password">
            {(field) => {
              const errors = field.state.meta.errors;
              return (
                <>
                  <div className="mt-4 flex items-baseline justify-between">
                    <label htmlFor="password" className="text-[13px] font-medium text-ink-soft">
                      {t("common.password")}
                    </label>
                    <Link
                      to="/forgot-password"
                      data-testid="login-recovery-action"
                      className="rounded text-[12.5px] font-medium text-accent outline-none underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      {t("auth.forgotPassword")}
                    </Link>
                  </div>
                  <div className="relative mt-1.5">
                    <Input
                      id="password"
                      className="h-11 w-full rounded-lg pr-12 text-base"
                      type={showPassword ? "text" : "password"}
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={field.handleBlur}
                      autoComplete="current-password"
                      aria-invalid={errors.length > 0}
                      aria-describedby={errors.length > 0 ? "password-error" : undefined}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-pressed={showPassword}
                      aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                      className="absolute top-1/2 right-1.5 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-ink-muted outline-none hover:bg-background hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      {showPassword ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                    </button>
                  </div>
                  <FormFieldError id="password-error" errors={errors} />
                </>
              );
            }}
          </form.Field>

          <form.Subscribe selector={(state) => state.errors}>
            {(errors) => <FormErrors errors={errors} />}
          </form.Subscribe>
          <Button
            className="mt-6 h-11 w-full justify-center rounded-lg text-[15px]"
            type="submit"
            disabled={login.isPending}
          >
            {login.isPending ? (
              <>
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                {t("auth.checking")}
              </>
            ) : (
              t("auth.signIn")
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
