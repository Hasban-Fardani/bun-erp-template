import { createFileRoute, redirect } from "@tanstack/react-router";
import { sessionQuery } from "../../features/identity/api/queries.ts";
import { AuthenticatedLayout } from "../../templates/authenticated-layout.tsx";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ context, location }) => {
    const session = await context.queryClient.fetchQuery(sessionQuery);
    // Keep the destination so signing in returns the operator where they were going.
    if (!session.authenticated) throw redirect({ to: "/login", search: { redirect: location.href } });
  },
  component: AuthenticatedLayout,
});
