import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { uiConfig } from "./config/ui.ts";
import { routeTree } from "./routes/route-tree.tsx";
import { ToastProvider } from "./shared/ui/toast.tsx";
import "./styles/globals.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000 } },
});

const router = createRouter({ routeTree, defaultPreload: "intent" });

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
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);

document.title = uiConfig.appName;

// The palette is chosen at build time; applying it as an attribute lets globals.css hold both
// token sets. Set on <html> so the background is correct before React paints anything.
if (uiConfig.theme === "tinta-gelap") document.documentElement.dataset.theme = "tinta-gelap";
