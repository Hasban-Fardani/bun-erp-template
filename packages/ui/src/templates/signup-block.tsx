import { Button } from "@bun-erp/ui/atoms/button-primitives";
import { Input } from "@bun-erp/ui/atoms/input-primitives";
import { Label } from "@bun-erp/ui/atoms/label";
import type { FormEvent, ReactNode } from "react";

export function SignupBlock({
  onSubmit,
  title = "Create an account",
  description = "Enter your details to get started.",
  footer,
}: {
  onSubmit: (credentials: { name: string; email: string; password: string }) => void;
  title?: string;
  description?: string;
  footer?: ReactNode;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSubmit({
      name: String(data.get("name") ?? ""),
      email: String(data.get("email") ?? ""),
      password: String(data.get("password") ?? ""),
    });
  };

  return (
    <section className="mx-auto grid w-full max-w-sm gap-6 rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
      <header className="grid gap-1 text-center">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </header>
      <form className="grid gap-4" onSubmit={submit}>
        <div className="grid gap-2">
          <Label htmlFor="signup-name">Name</Label>
          <Input id="signup-name" name="name" autoComplete="name" required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="signup-email">Email</Label>
          <Input id="signup-email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="signup-password">Password</Label>
          <Input
            id="signup-password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
        <Button type="submit" className="w-full">
          Create account
        </Button>
      </form>
      {footer ? <div className="text-center text-sm text-muted-foreground">{footer}</div> : null}
    </section>
  );
}
