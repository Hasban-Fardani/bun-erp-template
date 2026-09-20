import { createRootRoute, createRoute, Navigate, Outlet } from "@tanstack/react-router";
import { AuthenticatedLayout } from "../components/layout/authenticated-layout.tsx";
import { LoginPage } from "../pages/login-page.tsx";
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

const indexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/",
  component: () => <Navigate to="/users" replace />,
});

const routeTree = rootRoute.addChildren([loginRoute, appRoute.addChildren([indexRoute, usersRoute])]);

export { routeTree };
