import { I18nProvider } from "@loom/i18n/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { applyInitialTheme, ThemeProvider } from "./lib/theme.tsx";
import { HomeScreen } from "./screens/home.tsx";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

// Apply the palette before the first paint so a dark device does not flash light.
applyInitialTheme();

createRoot(root).render(
  <StrictMode>
    <I18nProvider>
      <ThemeProvider>
        <HomeScreen />
      </ThemeProvider>
    </I18nProvider>
  </StrictMode>,
);
