import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { it } from "node:test";
import { marked } from "marked";

const paths = ["README.md", "README.ru.md", "CONTRIBUTING.md", ...readdirSync("docs/en").filter(name => name.endsWith(".md")).map(name => `docs/en/${name}`)];
it("keeps the bilingual README entry points and all maintained documentation links resolvable", () => {
  for (const path of paths) {
    const source = readFileSync(path, "utf8");
    marked.walkTokens(marked.lexer(source), token => {
      if (token.type !== "link" && token.type !== "image") return;
      const href = token.href;
      if (/^(https?:|mailto:|#)/.test(href)) return;
      const target = decodeURIComponent(href.split("#")[0]);
      assert.ok(existsSync(resolve(dirname(path), target)), `${path}: ${href}`);
    });
  }
  assert.match(readFileSync("README.md", "utf8"), /\[Русский\]\(README\.ru\.md\)/);
  assert.match(readFileSync("README.ru.md", "utf8"), /\[English\]\(README\.md\)/);
});
it("documents actual scripts, current version and unvalidated platforms without inventing a license", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string; scripts: Record<string, string> };
  for (const path of paths.filter(path => path !== "README.ru.md")) {
    const source = readFileSync(path, "utf8");
    const prose = source.replace(/\[[^\]]*\]\([^)]*\)/g, "").replaceAll("Русский", "");
    assert.doesNotMatch(prose, /[А-Яа-яЁё]/, path);
    for (const [, script] of source.matchAll(/npm run ([a-z][a-z0-9:-]*)/g)) assert.ok(pkg.scripts[script], `${path}: ${script}`);
    assert.doesNotMatch(source, /sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{20,}/);
  }
  const readme = readFileSync("README.md", "utf8");
  assert.ok(readme.includes(pkg.version)); assert.match(readme, /No project license file|no project license file/);
  assert.match(readme, /not.*final|not.*production-stable/); assert.match(readme, /macOS.*|native QA/s);
});
