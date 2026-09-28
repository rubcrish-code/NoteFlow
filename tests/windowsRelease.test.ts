import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
const lock = JSON.parse(readFileSync("package-lock.json", "utf8")) as {
  version: string;
  packages: { "": { version: string } };
};
const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")) as {
  productName: string;
  identifier: string;
  version: string;
  bundle: { windows: { wix: { language: string[] }; nsis: { languages: string[] } } };
};

describe("Windows release configuration", () => {
  it("keeps app identity and supports Russian without removing English MSI upgrades", () => {
    assert.equal(packageJson.version, lock.version);
    assert.equal(packageJson.version, lock.packages[""].version);
    assert.equal(config.version, packageJson.version);
    assert.equal(config.productName, "NoteFlow");
    assert.equal(config.identifier, "com.noteflow.desktop");
    assert.deepEqual(config.bundle.windows.wix.language, ["en-US", "ru-RU"]);
    assert.deepEqual(config.bundle.windows.nsis.languages, ["English", "Russian"]);
  });

  it("stages the exact release artifacts and writes verifiable SHA-256 hashes", { skip: process.platform !== "win32" }, () => {
    const root = mkdtempSync(join(tmpdir(), "noteflow-release-test-"));
    try {
      const bundleRoot = join(root, "bundle-root");
      const outputRoot = join(root, "output");
      mkdirSync(join(bundleRoot, "bundle", "msi"), { recursive: true });
      mkdirSync(join(bundleRoot, "bundle", "nsis"), { recursive: true });
      const names = [
        `NoteFlow_${packageJson.version}_x64_en-US.msi`,
        `NoteFlow_${packageJson.version}_x64_ru-RU.msi`,
        `NoteFlow_${packageJson.version}_x64-setup.exe`,
        `NoteFlow_${packageJson.version}_x64-standalone.exe`,
      ];
      names.forEach((name, index) => {
        const source = name.endsWith(".msi") ? join(bundleRoot, "bundle", "msi", name)
          : name.endsWith("-setup.exe") ? join(bundleRoot, "bundle", "nsis", name)
            : join(bundleRoot, "noteflow.exe");
        writeFileSync(source, `fixture-${index}`);
      });
      execFileSync("powershell.exe", [
        "-NoProfile", "-File", "scripts/stage-windows-artifacts.ps1",
        "-Version", packageJson.version, "-BundleRoot", bundleRoot, "-OutputRoot", outputRoot,
      ], { timeout: 30_000 });
      const lines = readFileSync(join(outputRoot, "SHA256SUMS.txt"), "utf8").trim().split("\n");
      assert.equal(lines.length, names.length);
      names.forEach((name, index) => {
        const expected = createHash("sha256").update(`fixture-${index}`).digest("hex");
        assert.ok(lines.includes(`${expected}  ${name}`), name);
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses an incomplete artifact set without publishing a release directory", { skip: process.platform !== "win32" }, () => {
    const root = mkdtempSync(join(tmpdir(), "noteflow-release-incomplete-"));
    try {
      const outputRoot = join(root, "output");
      assert.throws(() => execFileSync("powershell.exe", [
        "-NoProfile", "-File", "scripts/stage-windows-artifacts.ps1",
        "-Version", packageJson.version, "-BundleRoot", root, "-OutputRoot", outputRoot,
      ], { timeout: 30_000, stdio: "pipe" }));
      assert.equal(existsSync(outputRoot), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
