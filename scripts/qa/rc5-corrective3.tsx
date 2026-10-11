// Isolated renderer fixtures: synthetic content only, no real Tauri backend or credentials.
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { useEditor, EditorContent } from "@tiptap/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import { createEditorExtensions } from "../../src/features/editor/EditorArea";
import { NoteSearchBar } from "../../src/features/editor/NoteSearchBar";
import { TableToolsPopover } from "../../src/features/editor/TableToolsPopover";
import { BlockInsertMenu } from "../../src/features/editor/BlockInsertMenu";
import { NoteMenuPopover } from "../../src/features/editor/NoteMenuPopover";
import { RagChatWorkspace } from "../../src/features/rag/RagChatWorkspace";
import { getRagLayoutMode } from "../../src/features/rag/ragResponsiveLayout";
import { ModalShell } from "../../src/shared/ModalShell";
import { InfoHint } from "../../src/shared/InfoHint";
import { TooltipPortal } from "../../src/shared/TooltipPortal";
import { Icon } from "../../src/shared/Icon";
import type { Editor } from "@tiptap/core";
import type { Note } from "../../src/app/types";
import "../../src/styles/tokens.css";
import "../../src/styles/app.css";
import "../../src/styles/foundation.css";
import "../../src/styles/pages.css";
import "../../src/styles/settings.css";
import "../../src/styles/editor.css";
import "../../src/styles/chat.css";
import "../../src/styles/rag.css";
import "./rc5-corrective3.css";

const timestamp = "2026-10-10T12:00:00Z";
const noop = () => {};
const chat = { id: "qa-chat", title: "QA чат", scope: "rag", noteId: null, projectIds: null, includeStandalone: false, createdAt: timestamp, updatedAt: timestamp };
mockIPC((command) => {
  if (command === "list_rag_chats" || command === "create_rag_chat") return command === "create_rag_chat" ? chat : [chat];
  if (command === "list_rag_chat_messages" || command === "list_embedding_profiles" || command === "list_projects") return [];
  if (command === "get_note_ai_status") return { hasProvider: false, canUse: false, privacyAccepted: false, isLocal: true, privacyScope: "local", message: "Не настроено" };
  throw new Error(`Unexpected QA command: ${command}`);
});

interface Fixture { scene: string; scale: number; theme: "light" | "dark"; count?: number; sidebar?: boolean }
declare global { interface Window { qaRender: (fixture: Fixture) => void; qaEditor: Editor | null; qaUpdates: number } }

function EditorFixture({ scene, count = 20, sidebar }: Fixture) {
  const content = scene.startsWith("table")
    ? `<div></div><p>Начало</p>${"<p>Синтетический текст</p>".repeat(scene === "table-top" ? 0 : scene === "table-middle" ? 5 : 13)}<table><tbody><tr><td><p>Ячейка</p></td><td><p>Вторая</p></td></tr><tr><td><p>Третья</p></td><td><p>Четвёртая</p></td></tr></tbody></table><p>Конец</p>`
    : Array.from({ length: count }, (_, index) => {
      const text = `${index + 1}. ${"Длинный синтетический абзац для переноса строк. ".repeat(4)}совпадение ${"текст после слова. ".repeat(4)}`;
      if (scene !== "search-mixed") return `<p>${text}</p>`;
      return index % 3 === 0 ? `<h2>${text}</h2>` : index % 3 === 1 ? `<ul><li><p>${text}</p></li></ul>` : `<table><tbody><tr><td><p>${text}</p></td></tr></tbody></table>`;
    }).join("");
  const editor = useEditor({ extensions: createEditorExtensions({ onEditImage: noop, onToast: noop, onOpenAttachment: async () => {}, onRevealAttachment: async () => {} }), content, onUpdate: () => { window.qaUpdates++; } });
  useEffect(() => { window.qaEditor = editor; window.qaUpdates = 0; if (scene.startsWith("table") && editor) { editor.state.doc.descendants((node, position) => { if (node.type.name === "table" && !editor.isActive("table")) editor.commands.setTextSelection(position + 3); }); } return () => { window.qaEditor = null; }; }, [editor, scene]);
  return <div className={`qa-editor editor-col ${sidebar ? "editor-surface-compact" : ""}`} style={sidebar ? { width: "65%" } : undefined}>
    <div className="editor-writing-viewport"><div className="ed-scroll"><EditorContent editor={editor} className="ed-body" /></div><NoteSearchBar editor={editor} initialQuery="совпадение" /></div>
    <div className="ed-bottom">{scene === "blocks" ? <BlockInsertMenu editTarget={null} editor={editor} onClose={noop} onCreateDrawing={noop} onPickAndStoreAttachment={async () => null} onToast={noop} selection={null} /> : null}</div>
    <TableToolsPopover editor={editor} onToast={noop} />
  </div>;
}

function Harness() {
  const [fixture, setFixture] = useState<Fixture>({ scene: "search", scale: 1, theme: "light" });
  window.qaRender = setFixture;
  document.documentElement.dataset.theme = fixture.theme;
  document.documentElement.style.setProperty("--qa-zoom", String(fixture.scale));
  document.documentElement.style.setProperty("--app-zoom", String(fixture.scale));
  const note = { id: "qa-note", title: "QA заметка", pinned: false, projectId: "qa-project", project: "QA проект" } as Note;
  return <><div className="qa-workspace" style={{ zoom: fixture.scale, height: `${100 / fixture.scale}vh`, width: `${100 / fixture.scale}vw` }}>
    {fixture.scene === "help" || fixture.scene === "delete" ? <ModalShell key={fixture.scene} open className="note-delete-dialog" title={fixture.scene === "delete" ? "Удалить заметку «QA»?" : "Подключение модели"} size="compact" onClose={noop} description={fixture.scene === "delete" ? "После удаления заметку не получится восстановить." : undefined}>
      <label><span className="field-label">API-ключ<InfoHint text="Ключ хранится в системном хранилище и не попадает в резервную копию." /></span><input aria-label="API-ключ" /></label>
    </ModalShell> : fixture.scene === "copy" ? <div className="qa-page"><div className="page-subtitle">Управляйте тегами и открывайте связанные заметки.</div><div className="page-subtitle">Архивные заметки можно восстановить в любой момент.</div></div>
    : fixture.scene === "menu" ? <div className="qa-note-menu"><NoteMenuPopover note={note} onArchive={noop} onClose={noop} onDelete={noop} onDuplicate={noop} onExportMarkdown={noop} onImportMarkdown={noop} onMove={async () => {}} onCreateProject={noop} onRemoveFromProject={async () => {}} onTogglePin={noop} projectOptions={[]} /></div>
    : fixture.scene === "rag" ? <RagChatWorkspace conversationWidth={280} dataReloadGeneration={0} layoutMode={getRagLayoutMode(window.innerWidth, { conversationWidth: 280, sourcesWidth: 320, sourcesCollapsed: false }, fixture.scale * 100)} onConversationReset={noop} onConversationResize={noop} onOpenModelSettings={noop} onOpenResult={noop} onSourcesCollapsedChange={noop} onSourcesReset={noop} onSourcesResize={noop} onToast={noop} preferredSourcesCollapsed={false} sourcesWidth={320} />
    : <EditorFixture key={`${fixture.scene}-${fixture.count}-${fixture.scale}-${fixture.theme}-${fixture.sidebar}`} {...fixture} />}
    <button aria-label="QA clear icon" hidden><Icon name="clear" /></button>
  </div><TooltipPortal /></>;
}
createRoot(document.getElementById("root")!).render(<Harness />);
