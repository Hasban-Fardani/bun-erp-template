import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const API_PORT = process.env.API_PORT ?? "3000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname ?? ".", "src") },
  },
  preview: { port: 4173, proxy: { "/api": { target: `http://localhost:${API_PORT}`, changeOrigin: true } } },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: `http://localhost:${API_PORT}`, changeOrigin: true },
    },
  },
});
