import { createFileRoute, redirect } from "@tanstack/react-router";
import { sessionQuery } from "../../features/identity/api/queries.ts";
import { AuthenticatedLayout } from "../../templates/authenticated-layout.tsx";
export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.fetchQuery(sessionQuery);
    if (!session.authenticated) throw redirect({ to: "/login" });
  },
  component: AuthenticatedLayout,
});
