import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The viewer: the page shown on GitHub Pages. It is read-only. It must never contain the editor, Mermaid or any admin code,
// so it has its own entry and imports nothing from src/editor (checked by scripts/check-viewer-bundle.mjs after the build).
// base "./" makes every asset URL relative, so the same files work in any folder of the site.
export default defineConfig({
  root: "src/viewer",
  base: "./",
  plugins: [react()],
  build: { outDir: "../../dist/viewer", emptyOutDir: true, sourcemap: false, target: "es2022" },
});
