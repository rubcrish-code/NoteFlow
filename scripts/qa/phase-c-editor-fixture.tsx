import { useState, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import { EditorArea } from "../../src/features/editor/EditorArea";
import { markdownToTiptapDoc } from "../../src/features/editor/markdownService";
import { AppZoomProvider } from "../../src/shared/AppZoomContext";
import { TooltipPortal } from "../../src/shared/TooltipPortal";
import "../../src/styles/tokens.css";
import "../../src/styles/app.css";
import "../../src/styles/foundation.css";
import "../../src/styles/editor.css";
import "../../src/styles/pages.css";
import "../../src/styles/settings.css";

const params = new URLSearchParams(location.search);
const long = "Длинноенеразрывноеслово".repeat(40);
const markdown = `# Phase C\n\n${long}\n\n\`${long}\`\n\n[Длинная ссылка](https://example.com/${"long-path".repeat(80)})\n\n:::details Проверка сворачивания\nСкрываемый текст\n:::\n\n---\n\n\`\`\`\n${long}\n\`\`\``;
mockIPC(() => ({ available: false, privacyAccepted: false, reason: "no_provider" }));
document.documentElement.dataset.theme = params.get("theme") ?? "light";
function Fixture() {
  const [note, setNote] = useState<ComponentProps<typeof EditorArea>["note"]>({
    id: "geometry-qa", title: "Phase C", contentMarkdown: markdown, plainText: long, editorDocument: markdownToTiptapDoc(markdown),
    contentHtml: "", contentVersion: 1, contentSidecars: [], attachments: [], createdAt: "2026-10-01T12:00:00Z", updatedAt: "2026-10-01T12:00:00Z",
    summary: "", dateLabel: "01.10.2026", noteDate: "2026-10-01", project: "", tags: [], wordCount: 1,
  });
  const noop = () => {}; const asyncNoop = async () => {};
  return <AppZoomProvider zoomPercent={Number(params.get("zoom") ?? 100)}><div className="main-area" style={{ height: "100vh" }}>
    <EditorArea note={note} documentReloadGeneration={0} editorContentWidth={840} editorContentOffset={0} isFocusMode={false}
      onEditorChange={(_id, editorDocument, contentHtml, contentMarkdown, plainText, wordCount, contentSidecars) => {
        // Simulate a save acknowledgement re-parsed by the existing data-service pipeline.
        setTimeout(() => setNote((current) => ({ ...current, editorDocument: markdownToTiptapDoc(contentMarkdown), contentVersion: current.contentVersion + 1,
          contentHtml, contentMarkdown, plainText, wordCount, contentSidecars: contentSidecars.map((sidecar) => ({ ...sidecar, createdAt: "", updatedAt: "" })) })), 150);
      }}
      onArchiveNote={noop} onDeleteNote={noop} onDuplicateNote={noop} onEditorPageLayoutChange={noop} onEditorPageLayoutReset={noop} onExitFocus={noop}
      onExportMarkdown={noop} onMoveNote={asyncNoop} onCreateProjectForNote={asyncNoop} onRemoveNoteFromProject={asyncNoop} onMakeNoteTagPrimary={asyncNoop}
      onImportMarkdown={async () => 0} onOpenChat={noop} onOpenAttachment={asyncNoop} onOpenNote={noop} onOpenSettingsModels={noop} onCreateNoteTag={asyncNoop}
      onPickAndStoreAttachment={async () => null} onRenameNote={asyncNoop} onRetrySave={noop} onSetNoteTag={asyncNoop} onRevealAttachment={asyncNoop}
      onSelectionTextChange={noop} onStoreAttachment={async () => { throw new Error("Not used"); }} onTogglePin={noop} onToggleFocus={noop} onToast={noop}
      projectOptions={[]} saveStatus="saved" semanticOpenTarget={null} tagOptions={[]} />
    <TooltipPortal />
  </div></AppZoomProvider>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
