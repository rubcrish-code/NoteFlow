import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const prefix = process.argv[2] || 'repeat-native';
if (!/^[a-z0-9-]+$/.test(prefix)) throw new Error('Invalid QA build prefix');
const files = [...new Set(execFileSync('git', ['ls-files', '-co', '--exclude-standard', 'src', 'src-tauri/src', 'scripts/qa', 'tests', 'package.json', 'package-lock.json', 'src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock'], { encoding: 'utf8' }).trim().split('\n'))].sort();
const entries = [];
const hash = createHash('sha256');
for (const path of files) {
  const bytes = await readFile(path);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  hash.update(path + '\0' + sha256 + '\n'); entries.push({ path, sha256 });
}
const fingerprint = hash.digest('hex');
const buildId = `${prefix}-${fingerprint.slice(0, 12)}`;
const manifest = { buildId, fingerprint, createdAt: new Date().toISOString(), head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  branch: execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(), version: JSON.parse(await readFile('package.json', 'utf8')).version,
  profileIdentifier: 'com.noteflow.qa.repeatnative', files: entries };
await mkdir('releases/qa', { recursive: true });
await writeFile(`releases/qa/${prefix}-build.json`, JSON.stringify(manifest, null, 2));
await writeFile(`releases/qa/${prefix}-config.json`, JSON.stringify({ productName: 'NoteFlow QA Repeat Native', identifier: manifest.profileIdentifier,
  app: { windows: [{ title: `NoteFlow QA ${buildId}`, width: 1440, height: 900, minWidth: 900, minHeight: 700, maximized: false, resizable: true, zoomHotkeysEnabled: false }] } }, null, 2));
console.log(JSON.stringify({ buildId, fingerprint, version: manifest.version }));
