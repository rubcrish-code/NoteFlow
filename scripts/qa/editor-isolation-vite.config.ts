import { defineConfig, mergeConfig } from "vite";
import baseConfig from "../../vite.config";
export default defineConfig(async () => mergeConfig(await baseConfig(), {
  build: { outDir: "releases/qa/editor-isolation-dist", emptyOutDir: false, rollupOptions: { input: "scripts/qa/editor-isolation.html" } },
}));
