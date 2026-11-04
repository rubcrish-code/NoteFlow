# Markdown support and limitations

[Documentation](README.md)

## Editor, storage and export are separate boundaries

TipTap/ProseMirror provides the visual document. NoteFlow stores canonical Markdown plus caches and sidecars for features that cannot be represented by standard Markdown alone. Export does not rewrite the note or replace it with plain text.

The single **Markdown (.md)** option creates one file. CommonMark/GFM syntax is used where supported:

| Feature | Example |
| --- | --- |
| Headings | `# Heading`, `## Heading` |
| Bold / italic | `**bold**`, `*italic*`, `***bold italic***` |
| Strikethrough | `~~deleted~~` |
| Inline code | `` `print()` `` |
| Bullet / ordered lists | `- item`, `1. item` |
| Tasks | `- [x] done`, `- [ ] open` |
| Quote | `> quote` |
| Link | `[label](https://example.com)` |
| Image | `![description](https://example.com/image.png)` |
| Code block | Fenced code, with an optional language |
| Simple tables | GFM pipe-table syntax |

Partial and mixed marks are preserved. The title supplies the filename; it is not automatically added as a second H1. Importing content into an existing note does not rename it.

## Extended formatting

Markdown has no standard syntax for every rich-text property. NoteFlow can use `++underline++` and typed extensions/directives for formatting such as text color, font and alignment. External viewers may display these differently or show the source syntax. Extended export uses no HTML fallback. Complex unsupported structures must be rejected safely rather than silently simplified.

The existing lossless export can also use `{{nf:...}}...{{/nf}}` for inline mark boundaries that are not represented exactly by ordinary delimiters, for example a bold range including a trailing space. This behavior predates localization and is retained here. It means an export is not guaranteed to contain only standard GFM markers, even when most of the document uses them.

Backups remain the reliable format for complete metadata, revisions, attachment ownership and complex editor sidecars. Project ZIP and internal canonical persistence are not identical to the portable single-note export boundary.

## Internal links

Note and excerpt links use `noteflow://note/...`. They refer to records in a local profile, not public web pages. A receiver without the matching profile cannot resolve them. Existing historical exports remain importable through the compatibility paths; opening a note does not automatically migrate or rewrite its Markdown.

## Clipboard and Telegram

Markdown paste, rich-text clipboard formats and an exported `.md` are different mechanisms. Copying formatted text can provide `text/html` and `text/plain` where supported by the OS/client, but a client decides which representation to use. Telegram Desktop paste, Telegram Bot API MarkdownV2 and CommonMark/GFM are not interchangeable. No Telegram API integration or guaranteed automatic formatting of raw Markdown is provided.

## Language boundary

Changing interface language translates controls and display dates, not Markdown syntax, code, text, link targets, exported user titles or existing document attributes. Stored timestamps and calendar values remain in their existing formats.
