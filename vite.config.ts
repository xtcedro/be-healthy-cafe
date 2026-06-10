import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

// Single source of truth for the displayed build version: package.json.
const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };

// The renderer lives in ./renderer and builds to ./dist-renderer.
// base: "./" keeps asset paths relative so they resolve when Electron
// loads the built index.html from disk via file://.
export default defineConfig({
  root: "renderer",
  base: "./",
  plugins: [react()],
  // Injected at build time so the UI can display the current build version.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "../dist-renderer",
    emptyOutDir: true,
  },
});
