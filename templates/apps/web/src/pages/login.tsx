import { createFileRoute, redirect } from "@tanstack/react-router";
import { authOptionsQuery, sessionQuery } from "../features/identity/api/queries.ts";
import { LoginScreen } from "../features/identity/screens/login.tsx";
import { safeRedirectTarget } from "../lib/redirect.ts";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string; error?: string } => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  beforeLoad: async ({ context, search }) => {
    const session = await context.queryClient.fetchQuery(sessionQuery);
    if (!session.authenticated) return;
    // A signed-in visitor has nothing to do on /login; honor a preserved destination when it is safe.
    const target = safeRedirectTarget(search.redirect);
    throw target ? redirect({ href: target }) : redirect({ to: "/" });
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(authOptionsQuery),
  component: LoginScreen,
});
