import { useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { uiConfig } from "../config/ui.ts";
import { useLogin } from "../features/users/api.ts";
import { Button, Input } from "../shared/ui/primitives.tsx";

/** Gerbang tunggal masuk aplikasi; sesi setelahnya dikelola cookie Better Auth. */
export function LoginPage() {
  const login = useLogin();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <form
        className="w-full max-w-sm rounded-lg border border-border bg-surface p-6"
        onSubmit={(e) => {
          e.preventDefault();
          login.mutate({ email, password }, { onSuccess: () => void navigate({ to: "/" }) });
        }}
      >
        <h1 className="text-lg font-semibold tracking-tight">Masuk</h1>
        <p className="mt-0.5 text-[13px] text-ink-muted">{uiConfig.appName} — organisasi Anda</p>
        <label htmlFor="email" className="mt-5 block text-[13px] font-medium text-ink-soft">
          Email
        </label>
        <Input
          id="email"
          className="mt-1"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <label htmlFor="password" className="mt-3 block text-[13px] font-medium text-ink-soft">
          Sandi
        </label>
        <div className="relative mt-1">
          <Input
            id="password"
            className="w-full pr-16"
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
            className="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center rounded p-1.5 text-ink-muted hover:bg-background hover:text-ink"
          >
            {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        {login.isError ? <p className="mt-3 text-[13px] text-red-700">{(login.error as Error).message}</p> : null}
        <Button className="mt-5 w-full justify-center" type="submit" disabled={login.isPending}>
          {login.isPending ? "Memproses…" : "Masuk"}
        </Button>
      </form>
    </div>
  );
}
