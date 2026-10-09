import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { JSDOM } from "jsdom";
import { serializeEditorDocumentForStorage, buildEditorDocumentFromStoredNoteContent } from "../../src/features/editor/editorContentSerializer";
import type { EditorDocument, NoteContentSidecar } from "../../src/app/types";

const dom = new JSDOM("<!doctype html><body></body>", { pretendToBeVisual: true });
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver,
  DOMParser: dom.window.DOMParser, getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
})) Object.defineProperty(globalThis, key, { configurable: true, value });
const { Editor } = await import("@tiptap/core");
const { createEditorExtensions } = await import("../../src/features/editor/EditorArea");
const editor = new Editor({ element: document.body.appendChild(document.createElement("div")),
  extensions: createEditorExtensions({ onEditImage() {}, onToast() {}, onOpenAttachment: async () => {}, onRevealAttachment: async () => {} }),
  content: { type: "doc", content: [{ type: "orderedList", attrs: { start: 1 }, content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Стоимость следующая -" }] }] }] }] },
});
try {
  let start = 0;
  editor.state.doc.descendants((node, pos) => { if (node.isText) start = pos; });
  editor.commands.setTextSelection({ from: start, to: start + 19 }); editor.commands.setBold();
  editor.commands.setTextSelection({ from: start, to: start + 18 }); editor.commands.setUnderline();
  const original = editor.getJSON();
  const text = editor.getText();
  const snapshots = [];
  for (let cycle = 0; cycle < 10; cycle++) {
    const saved = serializeEditorDocumentForStorage(editor.getJSON() as EditorDocument);
    snapshots.push({ noteId: "assigned-by-test", expectedContentVersion: cycle, contentJson: saved.editorDocument,
      contentMarkdown: saved.contentMarkdown, contentHtml: saved.contentHtml, plainText: saved.plainText, contentSidecars: saved.contentSidecars });
    editor.commands.setContent(buildEditorDocumentFromStoredNoteContent({ contentJson: { type: "doc", content: [] },
      contentMarkdown: saved.contentMarkdown, plainText: saved.plainText,
      contentSidecars: saved.contentSidecars.map((sidecar) => ({ ...sidecar, createdAt: "", updatedAt: "" })),
    }, { warn: () => assert.fail("Canonical load must not fall back") }).editorDocument);
    assert.deepEqual(editor.getJSON(), original);
  }
  const directory = await mkdtemp(join(tmpdir(), "noteflow-rc4-formatting-"));
  await writeFile(join(directory, "serializer-inputs.json"), JSON.stringify(snapshots));
  const run = spawnSync("cargo", ["test", "rc4_formatting_sqlite_bridge", "--", "--ignored", "--nocapture"], {
    cwd: join(process.cwd(), "src-tauri"), env: { ...process.env, NOTEFLOW_RC4_FORMATTING_QA_DIR: directory },
    encoding: "utf8", timeout: 300_000, maxBuffer: 8 * 1024 * 1024,
  });
  assert.ifError(run.error);
  if (run.status !== 0) throw new Error(`Synthetic SQLite bridge failed: ${run.stderr}\n${run.stdout}`);
  const line = run.stdout.split("\n").find((item) => item.startsWith("RC4_SQLITE_RESULTS:"));
  assert.ok(line, "Rust test must return persisted snapshots");
  const notes = JSON.parse(line.slice("RC4_SQLITE_RESULTS:".length)) as Array<{
    contentJson: EditorDocument; contentMarkdown: string; plainText: string; contentSidecars: NoteContentSidecar[]; contentVersion: number;
  }>;
  assert.equal(notes.length, 10);
  notes.forEach((note, index) => {
    const loaded = buildEditorDocumentFromStoredNoteContent({ ...note, contentJson: { type: "doc", content: [] } }, {
      warn: () => assert.fail("Persisted Markdown must load without JSON fallback"),
    });
    assert.equal(loaded.source, "markdown"); assert.equal(loaded.usedFallback, false);
    editor.commands.setContent(loaded.editorDocument);
    assert.equal(editor.getText(), text); assert.deepEqual(editor.getJSON(), original);
    assert.equal(note.contentVersion, index + 1);
    assert.equal(note.contentMarkdown, snapshots[index].contentMarkdown);
  });
  console.log(JSON.stringify({ status: "PASS", cycles: 10, casConflictsRejected: 10, qaProfile: directory,
    canonicalMarkdown: notes[0].contentMarkdown, nativeQA: "NOT TESTED" }));
} finally { editor.destroy(); dom.window.close(); }
