import { useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Loader2, Users as UsersIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { uiConfig } from "../config/ui.ts";
import { useLogin } from "../features/users/api.ts";
import { Button, Input } from "../shared/ui/primitives.tsx";
import { SystemStatusStrip } from "../shared/ui/system-status-strip.tsx";

/**
 * The app's single entry gate. The session after it is managed by the Better Auth cookie.
 *
 * Scale follows measurement, not taste: eight comparable entry screens sit at 40–53px inputs
 * with 16–18px text while this page used 32px/13px — a table's density applied to a form. The
 * 16px text is also load-bearing: below it, mobile Safari zooms the viewport on focus.
 */
export function LoginPage() {
  const login = useLogin();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate({ email, password }, { onSuccess: () => void navigate({ to: "/" }) });
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-4 py-10">
      <div className="enter-soft flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-white">
          <UsersIcon className="size-5" aria-hidden="true" />
        </span>
        <span className="text-[15px] font-semibold tracking-tight">{uiConfig.appName}</span>
      </div>

      <form
        className="enter-soft w-full max-w-[26rem] rounded-xl border border-border bg-surface p-7 shadow-sm"
        onSubmit={submit}
        aria-label="Form masuk"
      >
        <h1 className="text-xl font-semibold tracking-tight">Masuk ke {uiConfig.appName}</h1>

        <SystemStatusStrip />

        <label htmlFor="email" className="mt-5 block text-[13px] font-medium text-ink-soft">
          Email
        </label>
        <Input
          id="email"
          className="mt-1.5 h-11 rounded-lg px-3 text-base"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          placeholder="nama@organisasi.id"
          autoFocus
        />

        <label htmlFor="password" className="mt-4 block text-[13px] font-medium text-ink-soft">
          Sandi
        </label>
        <div className="relative mt-1.5">
          <Input
            id="password"
            className="h-11 w-full rounded-lg pr-12 text-base"
            type={showPassword ? "text" : "password"}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-pressed={showPassword}
            aria-label={showPassword ? "Sembunyikan sandi" : "Tampilkan sandi"}
            className="absolute top-1/2 right-1.5 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-ink-muted outline-none hover:bg-background hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
          >
            {showPassword ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
          </button>
        </div>

        {login.isError ? (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger"
          >
            {(login.error as Error).message}
          </p>
        ) : null}

        <Button
          className="mt-6 h-11 w-full justify-center rounded-lg text-[15px]"
          type="submit"
          disabled={login.isPending}
        >
          {login.isPending ? (
            <>
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              Memeriksa…
            </>
          ) : (
            "Masuk"
          )}
        </Button>
      </form>

      <p className="text-xs text-ink-soft">
        Kehilangan akses? Minta owner menjalankan{" "}
        <code className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[11.5px]">
          bun erp user:passwd
        </code>
      </p>
    </div>
  );
}
