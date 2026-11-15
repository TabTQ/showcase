import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The editor app. The rich text editor (TipTap) and Mermaid are lazy chunks.
export default defineConfig({
  root: "src/editor",
  plugins: [react()],
  build: { outDir: "../../dist/editor", emptyOutDir: true, sourcemap: false, target: "es2022", chunkSizeWarningLimit: 1500 },
  server: { proxy: { "/api": "http://localhost:3020", "/docs-preview": "http://localhost:3020" } },
});
