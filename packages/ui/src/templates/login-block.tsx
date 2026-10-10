import { Button } from "@loom/ui/atoms/button-primitives";
import { Input } from "@loom/ui/atoms/input-primitives";
import { Label } from "@loom/ui/atoms/label";
import type { FormEvent, ReactNode } from "react";

export function LoginBlock({
  onSubmit,
  title = "Welcome back",
  description = "Enter your email below to sign in to your account.",
  footer,
}: {
  onSubmit: (credentials: { email: string; password: string }) => void;
  title?: string;
  description?: string;
  footer?: ReactNode;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSubmit({ email: String(data.get("email") ?? ""), password: String(data.get("password") ?? "") });
  };

  return (
    <section className="mx-auto grid w-full max-w-sm gap-6 rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
      <header className="grid gap-1 text-center">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </header>
      <form className="grid gap-4" onSubmit={submit}>
        <div className="grid gap-2">
          <Label htmlFor="login-email">Email</Label>
          <Input id="login-email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="login-password">Password</Label>
          <Input id="login-password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <Button type="submit" className="w-full">
          Sign in
        </Button>
      </form>
      {footer ? <div className="text-center text-sm text-muted-foreground">{footer}</div> : null}
    </section>
  );
}
