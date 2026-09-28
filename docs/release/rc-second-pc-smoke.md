# NoteFlow 1.0.0-rc.1 — second-PC smoke

Closed RC only. Use a separate Windows PC or disposable VM and a **new QA profile**. Do not install over a real NoteFlow profile. Recommended installer: NSIS setup. Record Windows build, installer filename, SHA-256, WebView2 version and each result as PASS / FAIL / NOT RUN. Do not treat untested steps as passed. This short smoke does not replace the deferred full VM installer matrix.

1. Download the NSIS setup from the intended GitHub RC release when it is published.
2. Optionally compare its SHA-256 with `SHA256SUMS.txt` using `Get-FileHash -Algorithm SHA256`.
3. Install it. Record SmartScreen/UAC prompts; the RC is unsigned. Do not disable Windows protection.
4. Launch and complete first-run using only QA data.
5. Create a note with a unique marker, e.g. `NOTEFLOW-RC-QA-7319`.
6. Close with X, confirm the process exits, relaunch.
7. Confirm the note and last edit persisted without repeating first-run.
8. Create a project and tag; assign both to the note.
9. Insert a small QA image and verify it after relaunch.
10. Import a small QA Markdown file and inspect formatting.
11. Export an external backup ZIP outside app data; record the location.
12. Configure a disposable AI provider only if one is available; never use a real personal credential for this smoke.
13. Try a note AI action and record success, safe error or NOT RUN.
14. Try the right-hand note chat and record the response/history or NOT RUN.
15. Try global RAG with an indexed QA note and inspect the source citation or NOT RUN.
16. Try chronology/global knowledge against dated QA notes or record NOT RUN.
17. Launch a second instance and verify the existing window receives focus.
18. Disconnect the network; verify launch, note edit/autosave, search, project/tag and restart. AI may show a network error without freezing the app.
19. Uninstall without selecting optional user-data removal.
20. Reinstall the same NSIS build.
21. Confirm the marker note, project, tag and image are still present. Record any lost data as FAIL.

Record outcomes and screenshots without including note content or secrets. MSI is optional and **not** assumed interchangeable with NSIS; its cross-family lifecycle still requires separate VM testing. Before final public 1.0, complete the full clean/reinstall/upgrade/uninstall and backup-restore matrix, Start Menu/shortcut checks, SmartScreen and Windows 10 if claimed.
