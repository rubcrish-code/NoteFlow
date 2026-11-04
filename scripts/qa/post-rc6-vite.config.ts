import { defineConfig, mergeConfig } from "vite";
import baseConfig from "../../vite.config";

export default defineConfig(async () => mergeConfig(await baseConfig(), {
  resolve: process.env.NOTEFLOW_QA_REACT_PROFILE === "1" ? { alias: [{ find: /^react-dom\/client$/, replacement: "react-dom/profiling" }] } : {},
  build: {
    minify: process.env.NOTEFLOW_QA_REACT_PROFILE === "1" ? false : "esbuild",
    outDir: process.env.NOTEFLOW_PERF_DIST ?? "releases/qa/post-rc6-production",
    emptyOutDir: false,
    rollupOptions: { input: "scripts/qa/final-ux-fixture.html" },
  },
}));
