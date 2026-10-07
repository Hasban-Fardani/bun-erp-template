import path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const API_PORT = process.env.API_PORT ?? "3000";
const workerExportGuard: Plugin = {
  name: "bun-erp-worker-export-guard",
  generateBundle: {
    order: "post",
    handler(_options, bundle) {
      const entry = Object.values(bundle).find((output) => output.type === "chunk" && output.isEntry);
      if (entry?.type !== "chunk") throw new Error("Cloudflare build must emit one Worker entry chunk");

      const declaration = /export\s*\{([^}]*)\}\s*;?\s*$/.exec(entry.code);
      const specifiers = declaration?.[1]?.split(",").map((specifier) => specifier.trim()) ?? [];
      const defaultExport = specifiers.find((specifier) => specifier.split(/\s+as\s+/).at(-1) === "default");
      if (!declaration || !defaultExport) throw new Error("Cloudflare Worker entry must export a default handler");

      // The virtual Worker entry leaks dependency exports; only this app's default handler is public.
      entry.code = entry.code.replace(declaration[0], `export{${defaultExport}}`);
    },
  },
};

export default defineConfig(({ mode }) => {
  const cloudflareMode = mode === "cloudflare";
  const proxy = { "/api": { target: `http://localhost:${API_PORT}`, changeOrigin: true } };
  return {
    ...(cloudflareMode
      ? {
          environments: {
            bun_erp_template: {
              build: {
                rolldownOptions: {
                  preserveEntrySignatures: "strict",
                  output: { codeSplitting: false },
                  plugins: [workerExportGuard],
                },
              },
            },
          },
        }
      : {}),
    plugins: [
      tanstackRouter({ target: "react", routesDirectory: "./src/pages", autoCodeSplitting: true }),
      react(),
      tailwindcss(),
      ...(cloudflareMode ? [cloudflare({ configPath: "../../wrangler.jsonc" })] : []),
    ],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname ?? ".", "src"),
        "@web": path.resolve(import.meta.dirname ?? ".", "src"),
      },
    },
    build: { minify: true, sourcemap: false, target: "es2022" },
    preview: { port: 4173, ...(cloudflareMode ? {} : { proxy }) },
    server: { port: 5173, ...(cloudflareMode ? {} : { proxy }) },
  };
});
