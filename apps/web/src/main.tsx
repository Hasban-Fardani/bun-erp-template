import { I18nProvider, useI18n } from "@bun-erp/i18n/react";
import { PageLoading } from "@bun-erp/ui/molecules/table-states.tsx";
import { ToastProvider } from "@bun-erp/ui/organisms/toast.tsx";
import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { uiConfig } from "./config/ui.ts";
import { createQueryClient } from "./lib/query-client.ts";
import { routeTree } from "./routeTree.gen.ts";
import "./styles/globals.css";

const queryClient = createQueryClient(() => {
  if (router.state.location.pathname !== "/login") void router.navigate({ to: "/login" });
});

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
if (!rootElement) throw new Error("element #root tidak ditemukan");
createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <I18nProvider>
          <RouterProvider router={router} />
        </I18nProvider>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);

document.title = uiConfig.appName;

// The palette is chosen at build time; applying it as an attribute lets globals.css hold both
// token sets. Set on <html> so the background is correct before React paints anything.
if (uiConfig.theme === "dark") document.documentElement.dataset.theme = "dark";
