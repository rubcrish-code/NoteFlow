# Documentation

[English README](../../README.md) | [Русский README](../../README.ru.md)

These guides describe the current `1.0.0-rc.6` source code and post-RC6 corrections. They distinguish implemented behavior from published installers, requirements and unvalidated platform claims.

| Guide | Purpose |
| --- | --- |
| [Installation and builds](installation.md) | Windows packages and local macOS builds |
| [Development](development.md) | Prerequisites, commands and tests |
| [User guide](user-guide.md) | Everyday notes, projects, tags, search and chats |
| [Markdown](markdown.md) | Supported syntax, extensions and portability |
| [AI configuration](ai-configuration.md) | Generative models, embeddings and consent |
| [Architecture](architecture.md) | Frontend, IPC, Rust, persistence and background work |
| [Data and backups](data-backups.md) | Storage, restore policy and recovery |
| [Security and privacy](security-privacy.md) | Secrets, external requests and reporting |
| [Troubleshooting](troubleshooting.md) | Safe diagnosis and common failures |
| [Contributing](../../CONTRIBUTING.md) | Change scope, checks and evidence |
| [Release process](release-process.md) | Windows packaging and validation gates |
| [Localization](localization.md) | Catalogs, language switching and content boundaries |
| [Product specification](product-spec.md) | English rendering of functional requirements, distinguished from current implementation |

## Documentation inventory

- The Russian [product specification](../specifications/product-spec.md) remains the functional requirements source. A requirement is not a claim that every feature has shipped.
- The approved [HTML reference](../reference/NoteFlow_готовый_макет.html) remains the design source. It is not an application screenshot.
- The original [technical specification](../specifications/NoteFlow_Техническое_задание.docx) and [user guide](../user-guide/NoteFlow_Руководство_пользователя.docx) are preserved source documents. Use the current guides here for the implemented RC behavior.
- `docs/CURRENT_STATE.md`, `docs/NEXT_FIXES.md` and the old Russian AI connection guide contain historical stage-specific information. They are retained, not silently rewritten as new release evidence.
- `docs/tasks/` and versioned `docs/release/` records are historical evidence. They are not all translated or relabeled as current passes.
- The existing [Windows release checklist](../release/windows-release-checklist.md) is already in English; its versioned examples may describe an earlier RC. Always read the actual Tauri configuration for the current MSI mapping.

## What is not claimed

There is no validated public macOS production release, no automatic updater, and no guarantee that a new Windows installer inherits an older build’s lifecycle results. No project license file currently exists. Native QA and automated tests must be reported separately.
