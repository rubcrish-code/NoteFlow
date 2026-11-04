# Development

[Documentation](README.md)

## Setup

The stack is Tauri 2, Rust, React, strict TypeScript, Vite, TipTap/ProseMirror and SQLite FTS5. Use the committed npm and Cargo lockfiles. No external AI service is required for ordinary note development.

```sh
git clone https://github.com/rubcrish-code/NoteFlow.git
cd NoteFlow
npm ci
npm run tauri dev
```

Install the platform’s [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) first. `npm run dev` starts the web frontend alone; native commands need Tauri or an explicit mock fixture.

## Checks

From the repository root:

```sh
npm run typecheck
npm run test
npm run build
npm run test:browser
npm audit --omit=dev --offline=false
git diff --check
```

There is no `lint` script in the current package manifest. Do not report a lint pass without adding and running a real lint gate.

The source-validation workflow uses Node.js 24 and pins Rust 1.96.0, matching the validated local Rust toolchain. It runs both formatting and Clippy without warning suppression. This is a reproducible CI toolchain selection, not a new claim about the application's minimum supported Rust version.

From `src-tauri`:

```sh
cargo fmt --check
cargo check
cargo test
cargo clippy --all-targets --all-features -- -D warnings
```

Return to the root for `npm run tauri build`. Ignored Rust benchmarks are separate checks; do not silently count them as passed tests.

## Browser and native QA

Browser fixtures and runners live in `scripts/qa/`. Install the browser once with `npx playwright install msedge`, then run `npm run test:browser` after `npm run build`. Playwright is a development-only dependency. The coordinator starts its own localhost servers, builds current production fixtures and an actual RC.6-tagged comparison baseline, runs the regression suites sequentially, and closes its servers. Keep the RC.6 tag available (CI checks out full history).

Results and isolated logs go under ignored `releases/qa/regression-*`. The suites use synthetic data and mock IPC; they do not prove native IPC, WebView2 or installer behavior. Native observation probes and hardware-sensitive performance measurements are separate from browser E2E. See each runner's setup before running it independently.

Run `npm run test:browser -- --performance-only` separately, without competing builds or browser suites, to collect the loading, typing and search-decoration performance probes. Do not compare browser measurements directly with native Windows input latency.

Performance comparison shares the current synthetic IPC fixture and its input generator with the tagged baseline, while retaining the tag's application source and lockfile. Both sides must return the same 10,000-note DTO payload (including fixed synthetic tags); the loading probe verifies its SHA-256. The ordinary functional/visual baseline retains the tag's original fixture.

Use an isolated Tauri product identifier for destructive native tests. Never copy a real profile, API keys or personal notes into a fixture or report. QA builds should record the exact source fingerprint and EXE hash.

## Change discipline

Preserve Markdown-first storage, optimistic content versions, autosave coordination and staged restore. Keep UI copy in localization resources. Do not translate persisted titles, note content, model responses, URLs or identifiers. Keep changes scoped, add behavioral tests for the affected contract, and distinguish automated, browser and native evidence.
