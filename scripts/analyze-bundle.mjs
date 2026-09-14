import { execFileSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { build } from "vite";
import react from "@vitejs/plugin-react";

// Build in memory. --baseline compares committed HEAD without touching the worktree or dist.
const baseline = process.argv.includes("--baseline");
const root = process.cwd().replaceAll("\\", "/");
const started = performance.now();
const result = await build({
  ...(baseline ? {
    configFile: false,
    plugins: [{
      name: "committed-source-analysis",
      enforce: "pre",
      load(id) {
        const path = id.replaceAll("\\", "/").split("?")[0];
        if (!path.startsWith(`${root}/src/`)) return null;
        return execFileSync("git", ["show", `HEAD:${path.slice(root.length + 1)}`], { encoding: "utf8" });
      },
    }, react()],
  } : {}),
  logLevel: "error",
  build: { write: false },
});
const output = (Array.isArray(result) ? result : [result]).flatMap((bundle) => bundle.output);
const chunks = output.filter((item) => item.type === "chunk");
const entry = chunks.find((chunk) => chunk.isEntry);
const initial = new Set();
function visit(name) {
  if (initial.has(name)) return;
  initial.add(name);
  chunks.find((chunk) => chunk.fileName === name)?.imports.forEach(visit);
}
visit(entry.fileName);
const owners = new Map();
const modules = [];
for (const chunk of chunks) {
  for (const [id, data] of Object.entries(chunk.modules)) {
    const name = id.replaceAll("\\", "/").replace(`${root}/`, "");
    owners.set(name, [...(owners.get(name) ?? []), chunk.fileName]);
    modules.push({ name, chunk: chunk.fileName, renderedBytes: data.renderedLength });
  }
}
const sum = (items, value) => items.reduce((total, item) => total + value(item), 0);
console.log(JSON.stringify({
  baseline, head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  buildSeconds: (performance.now() - started) / 1000,
  totalJsBytes: sum(chunks, (chunk) => Buffer.byteLength(chunk.code)),
  totalGzipBytes: sum(chunks, (chunk) => gzipSync(chunk.code).length),
  initialJsBytes: sum(chunks.filter((chunk) => initial.has(chunk.fileName)), (chunk) => Buffer.byteLength(chunk.code)),
  initialGzipBytes: sum(chunks.filter((chunk) => initial.has(chunk.fileName)), (chunk) => gzipSync(chunk.code).length),
  cssBytes: sum(output.filter((item) => item.type === "asset" && item.fileName.endsWith(".css")), (asset) => Buffer.byteLength(asset.source)),
  chunks: chunks.map((chunk) => ({ name: chunk.fileName, initial: initial.has(chunk.fileName), bytes: Buffer.byteLength(chunk.code), gzipBytes: gzipSync(chunk.code).length, imports: chunk.imports, dynamicImports: chunk.dynamicImports })),
  duplicateModules: [...owners].filter(([, files]) => files.length > 1),
  modules: modules.sort((a, b) => b.renderedBytes - a.renderedBytes),
}, null, 2));
