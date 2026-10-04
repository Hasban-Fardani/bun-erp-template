import { I18nProvider } from "@bun-erp/i18n/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HomeScreen } from "./pages/home.tsx";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing root element");
createRoot(root).render(
  <StrictMode>
    <I18nProvider>
      <HomeScreen />
    </I18nProvider>
  </StrictMode>,
);
