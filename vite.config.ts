import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { chmodSync, existsSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";

const ensureReadableBrandAssets = {
  name: "ensure-readable-brand-assets",
  closeBundle() {
    const imagePath = path.resolve(
      import.meta.dirname,
      "dist/brand/wasla-astraeus-metal.png",
    );
    if (existsSync(imagePath)) chmodSync(imagePath, 0o644);
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss(), ensureReadableBrandAssets],
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
