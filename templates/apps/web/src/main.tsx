import { I18nProvider, useI18n } from "@bun-erp/i18n/react";
import { PageLoading } from "@bun-erp/ui/molecules/table-states.tsx";
import { ToastProvider } from "@bun-erp/ui/organisms/toast.tsx";
import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { uiConfig } from "./config/ui.ts";
import { MutationErrorToaster, reportMutationError } from "./lib/mutation-feedback.ts";
import { createQueryClient } from "./lib/query-client.ts";
import { applyInitialTheme, ThemeProvider } from "./lib/theme.tsx";
import { routeTree } from "./routeTree.gen.ts";
import "./styles/globals.css";

const queryClient = createQueryClient(() => {
  const location = router.state.location;
  if (location.pathname === "/login") return;
  void router.navigate({ to: "/login", search: { redirect: location.href } });
}, reportMutationError);

function LocalizedPageLoading() {
  const { t } = useI18n();
  return <PageLoading label={t("common.loading")} />;
}

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  defaultPendingComponent: LocalizedPageLoading,
  defaultPendingMinMs: 150,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing #root element");

// The palette is a runtime preference now; apply it before the first paint so a dark deployment
// does not flash light. The provider reconciles the same value once React mounts.
applyInitialTheme();

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <I18nProvider>
          <ThemeProvider>
            <MutationErrorToaster />
            <RouterProvider router={router} />
          </ThemeProvider>
        </I18nProvider>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);

document.title = uiConfig.appName;
