import { createRootRoute, createRoute, Navigate, Outlet } from "@tanstack/react-router";
import { LoginPage } from "../pages/login-page.tsx";
import { UsersPage } from "../pages/users-page.tsx";

const RootRoute = createRootRoute({
  component: () => (
    <main className="min-h-dvh">
      <Outlet />
    </main>
  ),
});

const IndexRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/",
  component: () => <Navigate to="/users" />,
});

const LoginRoute = createRoute({ getParentRoute: () => RootRoute, path: "/login", component: LoginPage });

const UsersRoute = createRoute({ getParentRoute: () => RootRoute, path: "/users", component: UsersPage });

export const routeTree = RootRoute.addChildren([IndexRoute, LoginRoute, UsersRoute]);
