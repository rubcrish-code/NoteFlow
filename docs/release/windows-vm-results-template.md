# NoteFlow Windows installer QA results (blank)

Tester: _not run_  
Date: _not run_  
VM snapshot IDs: _not run_  
Windows 11 edition/build and WebView2 Runtime: _not run_  
Windows 10 edition/build and WebView2 Runtime: _not run_  
Bundle checksum verification: _not run_  
Primary public installer family decision: _pending VM evidence_

Use **PASS**, **FAIL** or **NOT RUN**. For FAIL, describe the exact step and preserve a safe screenshot/log. Do not include API keys, note text, backup contents or real profile paths.

| TEST | PASS / FAIL / NOT RUN | NOTES (observed result, snapshot, evidence) |
| --- | --- | --- |
| Windows 11: bundle hashes match manifest | NOT RUN | |
| NSIS clean install, shortcuts and uninstall entry | NOT RUN | |
| NSIS first-run, QA dataset and restart persistence | NOT RUN | |
| NSIS same-version reinstall preserves data/settings | NOT RUN | |
| NSIS uninstall without data deletion, then reinstall | NOT RUN | |
| MSI en-US clean install, QA dataset and restart | NOT RUN | |
| MSI same-version reinstall preserves data/settings | NOT RUN | |
| MSI uninstall then reinstall preserves data | NOT RUN | |
| MSI ru-RU clean language/install smoke | NOT RUN | |
| Historical 0.8.0 NSIS to 0.9.0 NSIS upgrade | NOT RUN | |
| Historical 0.8.0 MSI to 0.9.0 MSI upgrade | NOT RUN | |
| MSI then NSIS: paths, entries, shortcuts, executable and shared data | NOT RUN | |
| NSIS then MSI: paths, entries, shortcuts, executable and shared data | NOT RUN | |
| Single instance: second launch focuses existing window | NOT RUN | |
| NSIS installer while app is running | NOT RUN | |
| MSI installer while app is running | NOT RUN | |
| Backup export and fresh-profile restore after restart | NOT RUN | |
| Restored AI/RAG chats and sources, if QA dataset includes them | NOT RUN | |
| Backup excludes API keys and credential values | NOT RUN | |
| QA credential persists with real connection test | NOT RUN | |
| Credential Manager entry metadata only (no secret read) | NOT RUN | |
| Start Menu, shortcut, unrelated working directory | NOT RUN | |
| Offline launch/edit/autosave/search/import/backup and AI error | NOT RUN | |
| Visual smoke at 100% and 160%, light/dark | NOT RUN | |
| Windows 10 x64: primary-family clean install and WebView2 | NOT RUN | |
| Windows 10 x64: note persistence and external backup | NOT RUN | |
| Windows 10 x64: uninstall/reinstall, offline launch, basic UI | NOT RUN | |

Release blockers and follow-up owner: _pending_  
Primary public installer recommendation: _pending_  
Second installer family policy: _pending_  
Final VM QA verdict: **NOT RUN**
