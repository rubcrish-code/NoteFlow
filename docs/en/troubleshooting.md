# Troubleshooting

[Documentation](README.md)

| Symptom | Safe next steps |
| --- | --- |
| Note is not saved | Keep the window open. Use Retry, check free disk space and profile-directory access. Do not delete database files. |
| Note has changed / stale-write conflict | Keep or inspect the newer authoritative version. Do not bypass the content-version check to force an old snapshot over it. |
| New note is not found | Wait for autosave. Check search scope and archive filters. Inspect knowledge status for semantic search. |
| Semantic search is unavailable | Configure an embedding model, test it, inspect consent/index status and retry failed processing. FTS works without embeddings. |
| No default model | Open Settings → AI models and choose a default generative connection. |
| Local model is unreachable | Start Ollama or LM Studio and check the address, port and installed model. |
| Model list is unavailable | Check the documented server endpoint. Use manual model ID as fallback and test it; discovery is not a hardcoded catalog. |
| Authorization failure | Re-enter the key through the secure API-key field and confirm access with the provider. Never paste the key into a report. |
| Request times out | Check server/model availability and configured timeout. Retry without discarding a saved note. |
| Attachment is unavailable | Check that the managed file is present; do not blindly rewrite paths or remove shared assets. Restore from a known backup if appropriate. |
| Markdown looks different in another editor | Review NoteFlow extensions. Use a full backup for exact sidecars/history; standard Markdown cannot represent every rich-text feature. |
| Layout does not fit at high zoom | Increase the window width or adjust panels. The one-row toolbar and right-hand chat have physical minimum-width requirements. |
| Backup restore fails | Check that the archive is valid and inspect the app’s recovery message. Preserve the current profile before retrying or changing files. |

## Useful diagnostics

Record the dynamic version from About, OS version, app zoom, theme, language and exact steps. Distinguish a development/QA build from an installed release. Attach only synthetic examples when possible. Native Windows, browser mocks and macOS results are different evidence categories.

If a generated response seems wrong, inspect its sources. UI language does not translate stored answers or guarantee the model’s response language. Unsent chat drafts currently survive navigation, not application shutdown.
