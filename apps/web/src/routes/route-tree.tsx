import { createRootRoute, createRoute, Navigate, Outlet } from "@tanstack/react-router";
import { AuthenticatedLayout } from "../components/layout/authenticated-layout.tsx";
import { AuditPage } from "../pages/audit-page.tsx";
import { LoginPage } from "../pages/login-page.tsx";
import { RolesPage } from "../pages/roles-page.tsx";
import { UsersPage } from "../pages/users-page.tsx";

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
});

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  component: AuthenticatedLayout,
});

const usersRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/users",
  component: UsersPage,
});

const rolesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/roles",
  component: RolesPage,
});

const auditRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/audit",
  component: AuditPage,
});

const indexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/",
  component: () => <Navigate to="/users" replace />,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([indexRoute, usersRoute, rolesRoute, auditRoute]),
]);

/**
 * Paths derived from the router itself, not a hand-kept list.
 *
 * The list used to be written by hand, which meant a new nav entry plus one line in that array
 * was enough to satisfy the nav test while the route did not exist — the gate could be edited
 * into agreeing with the bug. Reading the tree removes that move entirely.
 */
function collectPaths(node: unknown, out: string[] = []): string[] {
  const branch = node as { options?: { path?: string }; children?: unknown[] };
  if (branch?.options?.path) out.push(branch.options.path);
  for (const child of branch?.children ?? []) collectPaths(child, out);
  return out;
}

export const registeredPaths: readonly string[] = [...new Set(collectPaths(routeTree))].sort();

export { routeTree };
