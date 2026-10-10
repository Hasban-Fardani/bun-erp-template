import { useI18n } from "@loom/i18n/react";
import { Button } from "@loom/ui/atoms/button.tsx";
import { Loader2 } from "lucide-react";
import { useGoogleLogin } from "../hooks/index.ts";

/** Google's multicolour "G"; the brand mark is required on a Google sign-in button. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.77.43 3.45 1.18 4.94l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

/**
 * Google sign-in. Better Auth returns the consent URL and the browser leaves the app; it comes back
 * to `redirect` (or the home screen) signed in, or to `/login?error=<code>` (Better Auth adds the code) when Google or the
 * account check refused it — an unknown account is refused while self sign-up is off.
 */
export function GoogleSignIn({
  redirect,
  failed,
  withDivider,
}: {
  redirect: string | undefined;
  failed: boolean;
  withDivider: boolean;
}) {
  const { t } = useI18n();
  const google = useGoogleLogin();

  return (
    <div className="mt-6">
      <Button
        type="button"
        variant="ghost"
        data-testid="login-google"
        className="h-11 w-full justify-center gap-2.5 rounded-lg border border-border bg-surface text-[15px] text-ink hover:bg-background"
        disabled={google.isPending}
        onClick={() => google.mutate(`${window.location.origin}${redirect ?? "/"}`)}
      >
        {google.isPending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <GoogleMark />}
        {t("auth.continueWithGoogle")}
      </Button>
      {failed || google.isError ? (
        <p role="alert" data-testid="login-google-failed" className="mt-3 text-[13.5px] text-danger">
          {t("auth.googleFailed")}
        </p>
      ) : null}
      {withDivider ? (
        <div className="mt-6 flex items-center gap-3 text-[12.5px] text-ink-muted">
          <span className="h-px flex-1 bg-border" />
          {t("auth.orWithEmail")}
          <span className="h-px flex-1 bg-border" />
        </div>
      ) : null}
    </div>
  );
}
