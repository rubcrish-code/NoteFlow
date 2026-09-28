# NoteFlow 0.9.0: Windows installer VM matrix

This is a manual QA procedure, not evidence that an installer test passed. Run it only in disposable Windows VMs. Never install these builds on the maintainer's host or reuse its NoteFlow profile or credentials.

## Package and safety preflight

1. Copy the entire `NoteFlow-Windows-RC-Matrix` directory to the VM. In PowerShell, run `Get-FileHash -Algorithm SHA256` on each installer and compare it with `checksums/SHA256SUMS.txt` (paths in the manifest are relative to the bundle root). Stop if any value differs.
2. Record Windows edition/build, x64 architecture, WebView2 Runtime version, VM snapshot ID, installer name, tester and date in the results form. Use a **clean Windows 11 x64 snapshot** before each independent installer-family or cross-family scenario. Use a separate clean Windows 10 x64 snapshot for its checklist.
3. Treat NSIS and MSI as different installation families: NSIS is per-user, MSI is per-machine. Do not assume one replaces the other. Do not point any VM at real user data. Never copy a real API key into the VM.
4. These QA artifacts may be unsigned. Record Windows SmartScreen/UAC behaviour; do not interpret clicking through a warning as a signing pass. The standalone EXE is for package inspection only, not an installer substitute.
5. Keep one external QA backup and test attachment **outside** NoteFlow's application data directory. Take a VM snapshot before destructive restore and uninstall tests. Do not select any optional user-data deletion during the preservation tests.

## QA dataset

Use the unique marker `NOTEFLOW-RC-QA-7319` in the title and body of a note, and record its exact last line. Add a Markdown heading, **bold**, *italic*, and a checked and unchecked task. Create a project and tag using the marker; assign them to the note. Create a second note, archive it, and confirm it remains in Archive. Add a small test image and file attachment, then open/reveal the managed file. Make a revision by editing and waiting for autosave; if the build exposes revision history, verify the earlier content. Pin a note if supported. Import a small `.md` containing the marker. Export a backup ZIP to the external QA directory. After every restart/upgrade/reinstall, verify the marker by search and inspect each item, not just the note count. Record unavailable historical features as **NOT RUN**, never as PASS.

## Windows 11 sequence

Use `windows-vm-results-template.md` for every row. A failed step stops its dependent branch; preserve a VM snapshot and logs that contain no secrets.

### A. NSIS 0.9.0 clean install and persistence

1. Revert to the clean Windows 11 snapshot. Run `current/NoteFlow_0.9.0_x64-setup.exe` as a normal QA user. Record selected language, UAC behaviour, target path, Start Menu and desktop shortcuts, and the Add/Remove Programs entry. Do not install another NoteFlow first.
2. Launch from Start Menu. Confirm first-run appears exactly once, the main window opens maximized but is resizable, and no missing assets/console/error page appear. Create the QA dataset. Close with X; confirm the process exits. Relaunch and verify the full dataset, theme, panel widths and no repeated first-run.
3. Launch from a shortcut and from PowerShell with an unrelated working directory, e.g. `Set-Location C:\Windows\Temp; & '<installed NoteFlow.exe path>'`. Verify the same profile opens and no runtime dependency on source `dist`, `src-tauri`, or `target` exists.

### B. NSIS same-version reinstall

With the app closed, run the same 0.9.0 NSIS installer again. Record whether it repairs/replaces or offers an uninstall prompt. Launch and verify all dataset items, assets, settings, first-run state, and a single expected Add/Remove Programs entry.

### C. NSIS uninstall then reinstall

Uninstall 0.9.0 without selecting optional data removal. Verify program files, shortcuts and uninstall entry disappear, while the VM's NoteFlow app-data directory remains. Reinstall NSIS 0.9.0 and verify the prior dataset, attachments, search and settings return. If the uninstaller removed app data despite this choice, stop and record FAIL.

### D. MSI 0.9.0 on a separate clean snapshot

Revert to the **clean** snapshot (not the post-NSIS state). Run `current/NoteFlow_0.9.0_x64_en-US.msi`; repeat the language/first-run/dataset/close/restart/working-directory checks from A. Reinstall the same MSI and verify data/settings remain. Uninstall via Windows, check binaries/shortcuts/entry removed but profile data preserved, then reinstall and verify the dataset. On a further clean snapshot, smoke the separate `current/NoteFlow_0.9.0_x64_ru-RU.msi` language, install and launch; do not install en-US and ru-RU MSI simultaneously as the language test.

### E. Historical 0.8.0 to 0.9.0 upgrade

On a new clean snapshot install `historical/NoteFlow_0.8.0_x64-setup.exe`. Create the historical QA dataset and close the process. Install current **NSIS** over it without deleting user data. Launch, let migrations finish, and verify exact marker/content, project/tag, archive, image/file, revision where available, search, and no repeated first-run. Restart again and verify persistence. Capture the exact installer prompts and Add/Remove Programs entries.

On another new clean snapshot, repeat with historical en-US MSI followed by current en-US MSI. Use the same installer family and language. A failed migration or missing data is FAIL, not a reason to reset the profile and retry as a pass. NSIS is the provisional public-installer candidate; the final family choice depends on these VM results.

### F. MSI and NSIS coexistence

Use two **independent clean snapshots**. First install current MSI, create marker data, then attempt current NSIS; inspect both install paths, uninstall entries, shortcuts, launched executable version, and whether both see the same app-data profile. Do not uninstall either until findings are recorded. Repeat in the opposite order (NSIS then MSI). If coexistence or switching family can silently select the wrong executable or mutate shared data, mark FAIL and recommend a single public installer family plus explicit policy for the other. Do not claim an automatic migration between families.

### G. Single instance and installer while running

On a current 0.9.0 installation, open NoteFlow, then launch the **same installed executable** again. Confirm one working window/process and that the first window gains focus. With a fully saved QA note open, run the same-family 0.9.0 installer. Record whether it asks to close the app, blocks, or exits safely. Do not force-kill it; after completion check note integrity and that normal close/relaunch works. Repeat the running-app attempt separately for MSI and NSIS snapshots.

### H. Backup disaster recovery and credentials

Export the QA backup ZIP to an external VM folder. On a separate clean QA profile/snapshot, restore it, close and relaunch. Verify notes, project, tag, archive, managed assets, revisions and search. If the QA environment includes note AI/RAG chats, messages and sources, verify those too; otherwise mark that part NOT RUN. Inspect backup contents without printing note text or secrets; API keys and credential values must be absent. Never assume provider credentials are backed up.

If a disposable QA credential exists, save it via the app, close/restart, reinstall or same-family upgrade, and perform a connection test. If none exists, check only that the appropriate Windows Credential Manager entry exists by name/metadata; **do not read or print the secret** and mark end-to-end credential persistence NOT RUN.

### I. Offline and visual smoke

Disconnect the VM network. Launch, create/edit/autosave a note, restart, search with FTS, use project/tag, import `.md`, and export a backup. The AI network call should fail clearly without freezing the app. Reconnect only after the result is recorded.

On the installed production build, inspect 100% and 160% zoom in light and dark themes: sidebar, list, editor, toolbar, AI button, Settings, note chat, RAG history and sources. Record overlap, clipping, horizontal overflow, unreadable text and keyboard focus problems with screenshots. This is verification, not a redesign task.

## Windows 10 x64 minimum gate

On a separate clean Windows 10 x64 VM snapshot, record build and WebView2 Runtime presence/version. Install the selected primary public family, launch, create/save/reopen the marker note, export external backup, uninstall without data deletion, reinstall and confirm persistence. Repeat launch with network disabled and inspect the main UI at 100% and 160%. Record missing-runtime bootstrap behaviour and any SmartScreen/UAC prompt. Do not mark Windows 10 support passed from a Windows 11 result.

## Evidence and decision

For each row, record PASS, FAIL or NOT RUN, the observed behaviour, screenshot/log filename (without user content or secrets), snapshot ID, and remediation owner. A release is not approved by this document: failing migrations, lost app data, broken restore, unsafe cross-family interaction, or a hanging installer/app are blockers. Unsigned installers additionally require an explicit signing and publisher decision before public distribution.
