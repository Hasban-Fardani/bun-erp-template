import { useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Loader2, Users as UsersIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { uiConfig } from "../config/ui.ts";
import { useLogin } from "../features/users/api.ts";
import { Button, Input } from "../shared/ui/primitives.tsx";

/**
 * The app's single entry gate. The session after it is managed by the Better Auth cookie.
 *
 * Authored device: **destination headline**. The heading names where the user is going
 * (`Masuk ke <app>`) instead of pairing a neutral "Masuk" with a grey subtitle beneath it.
 * That pairing is a listed generic composition, and it also wastes the one line that can tell
 * someone they are on the right system. The brand mark above the card carries the rest of the
 * orientation without borrowing a second line of text.
 *
 * Scale follows measured logins rather than this repo's dense-table defaults: inputs are 40px
 * with 16px text. The font size is not cosmetic — anything under 16px makes mobile Safari zoom
 * the viewport on focus.
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
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">
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

        <label htmlFor="email" className="mt-6 block text-[13px] font-medium text-ink-soft">
          Email
        </label>
        <Input
          id="email"
          className="mt-1.5 h-10 rounded-lg px-3 text-base"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="nama@organisasi.id"
          autoFocus
        />

        <label htmlFor="password" className="mt-4 block text-[13px] font-medium text-ink-soft">
          Sandi
        </label>
        <div className="relative mt-1.5">
          <Input
            id="password"
            className="h-10 w-full rounded-lg pr-11 text-base"
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
            className="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-ink-muted outline-none hover:bg-background hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye aria-hidden="true" size={16} />}
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

        <Button className="mt-6 h-10 w-full justify-center rounded-lg text-sm" type="submit" disabled={login.isPending}>
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
