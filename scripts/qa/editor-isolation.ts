// Isolated diagnostic entry; never included in the shipping Vite input.
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Schema } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { EditorView } from "@tiptap/pm/view";
import { createEditorExtensions } from "../../src/features/editor/EditorArea";
import { noteSearchKey } from "../../src/features/editor/noteSearch";
import "../../src/styles/tokens.css";
import "../../src/styles/foundation.css";
import "../../src/styles/editor.css";

const texts = Array.from({ length: 1000 }, (_, i) => `Синтетический абзац ${i}. Жирный фрагмент.`);
const content = { type: "doc", content: texts.map(text => ({ type: "paragraph", content: [{ type: "text", text }] })) };
let current: { destroy(): void } | undefined;
const surface = document.getElementById("surface")!;
surface.style.cssText = "width:940px;max-width:calc(100% - 64px);margin:32px auto;";
document.body.style.cssText = "margin:0;height:100vh;overflow:auto;background:var(--panel);color:var(--text);";
const nav = document.getElementById("modes")!;
nav.style.cssText = "position:sticky;top:0;z-index:5;background:var(--panel);padding:12px;display:flex;gap:8px;";
function select(mode: string) {
  current?.destroy(); surface.replaceChildren();
  if (mode === "minimal") {
    const schema = new Schema({ nodes: { doc: { content: "paragraph+" }, paragraph: { content: "text*", group: "block", toDOM: () => ["p", 0] }, text: { group: "inline" } } });
    const view = new EditorView(surface, { state: EditorState.create({ schema, doc: schema.nodeFromJSON(content) }), attributes: { class: "tiptap", role: "textbox" } });
    Object.assign(view.dom, { editor: { view, get state() { return view.state; } } });
    current = view;
  } else {
    const editor = new Editor({ element: surface, extensions: mode === "basic" ? [StarterKit] : createEditorExtensions({ onEditImage() {}, onToast() {}, onOpenAttachment: async () => {}, onRevealAttachment: async () => {} }), content });
    if (mode === "search") editor.view.dispatch(editor.state.tr.setMeta(noteSearchKey, { query: "абзац" }));
    current = editor;
  }
  document.body.dataset.mode = mode;
}
for (const [mode, label] of [["minimal", "Минимальный ProseMirror"], ["basic", "Базовый TipTap"], ["full", "Полные расширения"], ["search", "Полные + 1000 совпадений"]]) {
  const button = document.createElement("button"); button.textContent = label; button.type = "button"; button.addEventListener("click", () => select(mode)); nav.append(button);
}
select("minimal");
