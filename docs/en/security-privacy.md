# Security and privacy

[Documentation](README.md)

## Local-first, not automatically encrypted

Ordinary note editing is local and works offline. A local database is not a claim that all note content is encrypted at rest. Protect the OS account, disk and backup locations appropriately.

## Credentials

API keys use OS secure storage: Windows Credential Manager, or the implemented macOS Keychain integration. macOS native and production behavior still need validation. SQLite keeps nonsecret connection metadata and references, not plaintext keys. Saved keys are not returned to the frontend form, written to browser storage or included in backups.

Never put secrets in source code, issue reports, custom-header JSON, screenshots, logs or chat messages. Do not publish a real profile or backup as a test fixture. Provider URLs and model identifiers are not translated or rewritten by localization.

## External processing

External AI requests send the selected note context or retrieved excerpts to the configured provider after the relevant consent. Cloud embeddings can send note chunks. Local processing is local only when the selected server really runs on this device. Review the provider’s own privacy and retention policy.

## Untrusted content

Markdown, links, imported archives and attachment paths are untrusted input. Existing URL checks, rendering sanitization, managed-path validation, archive limits and staged restore must not be bypassed. Public errors should provide useful recovery advice without SQL, absolute paths, note/chat contents or raw provider responses.

## Reporting

Before sharing a report, remove keys, authorization headers, personal note text and private paths. Describe the app version, platform, reproduction steps and sanitized error code. For a potential vulnerability, do not post an exploit containing live credentials or personal data in a public issue. No dedicated security contact or private reporting channel is claimed here.

## Release limitations

The current Windows RC is unsigned; SmartScreen warnings are possible. macOS signing/notarization and native QA are pending. A zero-vulnerability npm audit is a dependency check at a point in time, not a guarantee that the application has no security issues.
