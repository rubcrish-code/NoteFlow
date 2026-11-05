# Contributing

[Documentation](docs/en/README.md)

NoteFlow is a pre-stable Tauri/Rust/React application. Read the current [product requirements](docs/specifications/product-spec.md), approved [design reference](docs/reference/NoteFlow_готовый_макет.html), relevant source modules and task reports before changing behavior. Historical stage reports are not a current feature specification.

## Scope and data safety

- Keep changes focused. Do not replace working editor, persistence or AI modules merely to change UI text.
- Preserve existing uncommitted work. Never use destructive Git cleanup without explicit authorization.
- Use isolated profiles and synthetic data for destructive tests. Do not include credentials or personal notes in fixtures, screenshots or reports.
- Do not bypass optimistic concurrency, Markdown-first persistence, save coordination, reference-aware assets or staged restore.
- Keep user-visible copy in the bilingual catalogs. Do not translate note/project/tag names, stored chat content, model responses, URLs, paths or identifiers.

## Verification

Run the checks in [Development](docs/en/development.md). Add behavioral tests for changed user flows, integration/fault tests for persistence risks, and browser geometry coverage where layout is affected. Report skipped, failed and unvalidated checks honestly; do not reuse an older build’s pass as new evidence.

Keep dependencies justified and comments focused. Maintain TypeScript strictness and Rust lint gates. Do not change the version, create a commit/tag, push, merge or publish a release as part of a corrective task unless the maintainer explicitly authorizes it.

## Licensing

There is currently no project license file. Do not assume an open-source license grant or add license claims without the owner’s decision.
