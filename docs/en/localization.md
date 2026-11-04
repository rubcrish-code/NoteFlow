# Localization architecture

[Documentation](README.md)

## Resources

- `src/shared/i18n/ru.json` and `en.json`: paired UI catalogs, with stable `ui.<digest>` keys generated once from the extracted source messages. Do not regenerate keys when editing copy; update existing entries instead.
- `src/shared/uiMessages.ts`: existing named AI/status resources, English/Russian aliases for legacy backend presentation messages, and the compatibility boundary.
- `src/shared/i18n/publicErrors.ts`: public IPC error-code translations. Rust error codes and retry flags stay unchanged.
- `src/shared/i18n.ts`: typed key lookup, interpolation, Russian fallback, an observable language value and a React `useSyncExternalStore` subscription.

`translate(key, parameters)` only handles application-owned resources. It does not inspect or translate DOM text. Unknown user/model text is never passed through a whole-document translation mechanism.

## Switching and persistence

The language lives in the existing `UiSettings.language` setting. AppShell updates the language store and persists the existing settings object. Components subscribe without locale-dependent keys or window reloads. Static UI descriptors use lazy labels so imported navigation/tool definitions do not freeze the startup language.

Existing profiles retain Russian as fallback. No OS-locale auto-detection is required by the current implementation. A manual choice is restored from local settings and does not alter notes or other preferences.

## Formatting and boundaries

Display dates use Russian `DD.MM.YYYY` or English (British) `DD/MM/YYYY`, with 24-hour time. Calendar-only ISO values are parsed as local calendar dates, not UTC midnight. Stored ISO timestamps, sorting, note dates and content versions are unchanged. Count helpers select Russian or English plural forms and use locale-aware number formatting.

System message relocalization is restricted to explicit status/error channels. Known parameterized transient messages retain bounded in-memory descriptors, so changing language can update them without replacing form inputs. Model answers and historical chat messages remain in their original language.

Native node-view accessibility/date labels subscribe separately without dispatching editor document transactions. These subscriptions must be removed when node views are destroyed.

## Adding or editing a message

1. Choose a stable key and add both Russian and English text.
2. Keep parameter names identical in both locales.
3. Use interpolation instead of joining translated fragments whenever grammar differs.
4. Reuse the established terms: note, project, tag, focus mode, AI assistant, AI model provider and backup.
5. Add/update behavioral and catalog tests; check long English text and errors in both themes/zoom modes.
6. Never translate API payloads, credential values, paths, model/provider IDs or stored user content.

Historical source-contract tests can resolve referenced catalog entries through a Russian source view. This checks the referenced resources rather than requiring hardcoded Russian JSX. Runtime language-switching and content-integrity tests are separate; source contracts do not prove localization UX.
