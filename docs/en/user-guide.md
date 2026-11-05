# User guide

[Documentation](README.md)

## Local profile and language

NoteFlow uses a local profile, not an online account. On first launch, enter a profile name and follow or skip the introduction. The name is visible only on this device.

Choose **Settings → General → Interface language** to select **Русский** or **English**. The change applies without restarting and is saved locally. Existing profiles default to Russian when no language setting exists. Switching the interface language does not translate your notes, names or chat history.

## Notes

1. Select **New note** in the sidebar.
2. Enter a title and choose a note date.
3. Select **Create note** and write in the editor.
4. Check the save indicator before closing or starting a destructive operation.

Changes are saved automatically. A failed save is not a successful save: use Retry and keep the app open until the problem is resolved. Note titles use the existing 25-grapheme limit; an emoji sequence can count as one grapheme.

Use the single-row formatting toolbar for headings, marks, lists, tables, links, alignment and AI. Use the insertion controls for images, files, dates, callouts and other supported blocks. Focus mode hides navigation panels but keeps formatting available. At high zoom, the full toolbar and right-hand chat have a minimum width requirement; enlarge the window when necessary.

## Projects, tags and archive

- A note belongs to at most one project. Moving it to another project changes that assignment.
- Tags can be created, edited, colored and merged. Deleting a tag does not delete its notes. The first ordered tag supplies the note’s color accent.
- Archive is for notes and projects you may need later. Archived items can be viewed and restored.
- **Deleting a project deletes its notes as well.** The confirmation shows the note count and requires the exact project name. Back up important data first.
- **Delete all notes** is a separate destructive action with two confirmations. Read its list of deleted and retained data carefully.

## Search and internal links

The note list includes full-text search over titles, text and metadata. You can search inside the current note using the editor’s find control. An outline follows note headings.

**Link to note** immediately lists available note metadata, with search and bounded pages for large profiles. Select a note to insert a `noteflow://note/...` link. **Link to excerpt** copies a link to selected text. Excerpt links need a valid selection and the matching local note. If an excerpt changes or becomes ambiguous, NoteFlow opens the note and explains that it could not locate the exact text.

## AI

AI is optional. Configure a generative model in **Settings → AI models** for assistant actions and chats. Note chat uses the current note; knowledge chat searches across the selected scope and shows sources. A separate embedding model enables semantic search. Read [AI configuration](ai-configuration.md) before using external providers.

Model-generated text and saved history are not automatically translated when you change the interface language. Prompt the model in your preferred language. Important answers should be checked against their sources.

## Export and backup

Use a note’s export action for Markdown, TXT, DOCX or PDF. Project export creates a ZIP. Importing `.md` can create new notes or insert content into the current note, depending on the selected flow.

For complete recovery, use **Settings → Data and export → Create backup**. Preview a backup before restoring: restore replaces supported profile data. Keep an external copy and remember that API keys are not included. See [Data and backups](data-backups.md).
