import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  server: {
    host: "0.0.0.0",
    port: 3001,
    strictPort: true,
    proxy: {
      "/directus": {
        target: "http://127.0.0.1:8055",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/directus/, ""),
      },
    },
  },
});
