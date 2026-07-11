import { useEffect, useMemo, useRef, useState } from "react";
import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import TableRow from "@tiptap/extension-table-row";
import TaskList from "@tiptap/extension-task-list";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { EditorContentSidecarInput, EditorDocument, Note, NoteAttachment, SaveStatus } from "../../app/types";
import { acceptNoteAiPrivacy, createNoteAiContext, getNoteAiStatus, runNoteAi, type NoteAiActionId, type NoteAiScope, type NoteAiStatus } from "../../services/noteAiService";
import { Icon } from "../../shared/Icon";
import { EditableImage, type EditableImageTarget } from "../imageEditor/ImageNodeView";
import { ImageEditorModal } from "../imageEditor/ImageEditorModal";
import { createEditedImageFileName, dataUrlToFile, type ImageEditMode, type ImageEditMetadata } from "../imageEditor/imageEditService";
import { BlockInsertMenu } from "./BlockInsertMenu";
import { InteractiveFileAttachment } from "./FileAttachmentNodeView";
import { FormattingToolbar } from "./FormattingToolbar";
import { NoteMenuPopover } from "./NoteMenuPopover";
import { TableToolsPopover } from "./TableToolsPopover";
import { Callout, DetailsBlock, DetailsContent, DetailsSummary, FontFormat, FormulaBlock, FormulaInline, InlineDate, NoteMention } from "./customExtensions";
import { serializeEditorDocumentForStorage } from "./editorContentSerializer";
import { isMarkdownLike, markdownToTiptapDoc } from "./markdownService";
import { NoteFlowTable, NoteFlowTableCell, NoteFlowTableHeader, NoteFlowTableView, TableToolsAnchor } from "./tableExtensions";
import { NoteFlowTaskItem } from "./taskExtensions";
import { useEditorPageLayout } from "./useEditorPageLayout";
import type { EditorPageLayoutSettings } from "../../shared/editorPageLayout";

interface EditorAreaProps {
  editorContentOffset: number;
  editorContentWidth: number;
  isFocusMode: boolean;
  note: Note;
  notes: Note[];
  onEditorChange: (
    noteId: string,
    editorDocument: EditorDocument,
    contentHtml: string,
    contentMarkdown: string,
    plainText: string,
    wordCount: number,
    contentSidecars: EditorContentSidecarInput[],
  ) => void;
  onArchiveNote: (noteId: string) => void;
  onDeleteNote: (noteId: string) => void;
  onDuplicateNote: (noteId: string) => void;
  onEditorPageLayoutChange: (layout: EditorPageLayoutSettings) => void;
  onEditorPageLayoutReset: () => void;
  onExitFocus: () => void;
  onExportMarkdown: (noteId: string) => void;
  onMoveNote: (noteId: string, project: string) => void;
  onOpenChat: () => void;
  onOpenAttachment: (attachmentId: string) => Promise<void>;
  onOpenNote: (noteId: string) => void;
  onOpenSettingsModels: () => void;
  onRenameNote: (noteId: string, title: string) => void;
  onRevealAttachment: (attachmentId: string) => Promise<void>;
  onSelectionTextChange: (text: string) => void;
  onStoreAttachment: (
    file: File,
    kind: "file" | "image",
    options?: { editMetadata?: Record<string, unknown>; originalAttachmentId?: string },
  ) => Promise<{ attachment: NoteAttachment; sizeLabel: string }>;
  onTogglePin: (noteId: string) => void;
  onToggleFocus: () => void;
  onToast: (message: string) => void;
  projectOptions: string[];
  saveStatus: SaveStatus;
}

interface AiSelectionSnapshot {
  from: number;
  noteId: string;
  text: string;
  to: number;
}

interface AiPreviewState {
  actionId: NoteAiActionId;
  actionLabel: string;
  id: number;
  isStale: boolean;
  result: string;
  scope: NoteAiScope;
  selection: AiSelectionSnapshot;
}

interface AiPendingAction {
  actionId: NoteAiActionId;
  scope: NoteAiScope;
  selection: AiSelectionSnapshot;
}

const aiActionLabels: Record<NoteAiActionId, string> = {
  ask: "Спросить по этому тексту",
  expand: "Развернуть подробнее",
  explain: "Объяснить простыми словами",
  fix: "Исправить ошибки",
  improve: "Улучшить текст",
  shorten: "Сократить",
  tasks: "Сделать список задач",
  tone: "Изменить тон",
  translate: "Перевести",
};

function createEditorExtensions(options: {
  onEditImage: (target: EditableImageTarget) => void;
  onOpenAttachment: (attachmentId: string) => Promise<void>;
  onRevealAttachment: (attachmentId: string) => Promise<void>;
  onToast: (message: string) => void;
}) {
  return [
    StarterKit.configure({
      heading: {
        levels: [1, 2, 3],
      },
    }),
    Underline,
    TextStyle,
    FontFormat,
    Color,
    Highlight.configure({ multicolor: true }),
    Superscript,
    Subscript,
    TaskList,
    NoteFlowTaskItem.configure({ nested: true }),
    NoteFlowTable.configure({ resizable: true, View: NoteFlowTableView }),
    TableRow,
    NoteFlowTableHeader,
    NoteFlowTableCell,
    TableToolsAnchor,
    TextAlign.configure({
      types: ["heading", "paragraph"],
    }),
    Link.configure({
      autolink: true,
      linkOnPaste: true,
      openOnClick: false,
    }),
    EditableImage.configure({
      inline: false,
      onEditImage: options.onEditImage,
      onToast: options.onToast,
    }),
    Callout,
    DetailsBlock,
    DetailsSummary,
    DetailsContent,
    InteractiveFileAttachment.configure({
      onOpenAttachment: options.onOpenAttachment,
      onRevealAttachment: options.onRevealAttachment,
      onToast: options.onToast,
    }),
    NoteMention,
    InlineDate,
    FormulaInline,
    FormulaBlock,
  ];
}

export function EditorArea({
  editorContentOffset,
  editorContentWidth,
  isFocusMode,
  note,
  notes,
  onArchiveNote,
  onDeleteNote,
  onDuplicateNote,
  onEditorChange,
  onEditorPageLayoutChange,
  onEditorPageLayoutReset,
  onExitFocus,
  onExportMarkdown,
  onMoveNote,
  onOpenChat,
  onOpenAttachment,
  onOpenNote,
  onOpenSettingsModels,
  onRenameNote,
  onRevealAttachment,
  onSelectionTextChange,
  onStoreAttachment,
  onTogglePin,
  onToggleFocus,
  onToast,
  projectOptions,
  saveStatus,
}: EditorAreaProps) {
  const [isBlockMenuOpen, setIsBlockMenuOpen] = useState(false);
  const [isNoteMenuOpen, setIsNoteMenuOpen] = useState(false);
  const [imageEditTarget, setImageEditTarget] = useState<EditableImageTarget | null>(null);
  const [aiStatus, setAiStatus] = useState<NoteAiStatus | null>(null);
  const [aiScopeChoice, setAiScopeChoice] = useState<AiPendingAction | null>(null);
  const [aiPrivacyAction, setAiPrivacyAction] = useState<AiPendingAction | null>(null);
  const [aiPreview, setAiPreview] = useState<AiPreviewState | null>(null);
  const [pendingAiActionId, setPendingAiActionId] = useState<NoteAiActionId | undefined>();
  const [isAiPrivacyAccepting, setIsAiPrivacyAccepting] = useState(false);
  const editorRef = useRef<Editor | null>(null);
  const aiRequestIdRef = useRef(0);
  const isMountedRef = useRef(false);
  const loadedNoteIdRef = useRef<string | null>(null);
  const noteIdRef = useRef(note.id);
  const onOpenNoteRef = useRef(onOpenNote);
  const editorExtensions = useMemo(
    () =>
      createEditorExtensions({
        onEditImage: setImageEditTarget,
        onOpenAttachment,
        onRevealAttachment,
        onToast,
      }),
    [onOpenAttachment, onRevealAttachment, onToast],
  );
  const editorPageLayout = useEditorPageLayout({
    editorContentOffset,
    editorContentWidth,
    onLayoutChange: onEditorPageLayoutChange,
    onReset: onEditorPageLayoutReset,
  });

  const editor = useEditor({
    content: note.editorDocument,
    editorProps: {
      handleClickOn: (_view, _pos, node, _nodePos, event, direct) => {
        if (!direct || node.type.name !== "noteMention") {
          return false;
        }

        const noteId = node.attrs.noteId;
        if (typeof noteId !== "string") {
          return false;
        }

        event.preventDefault();
        onOpenNoteRef.current(noteId);
        return true;
      },
      handlePaste: (_view, event) => {
        const text = event.clipboardData?.getData("text/plain") ?? "";
        const currentEditor = editorRef.current;

        if (!currentEditor || !isMarkdownLike(text)) {
          return false;
        }

        event.preventDefault();
        currentEditor.chain().focus().insertContentAt(currentEditor.state.selection, markdownToTiptapDoc(text).content ?? []).run();
        return true;
      },
    },
    extensions: editorExtensions,
    onUpdate: ({ editor: currentEditor }) => {
      const editorDocument = currentEditor.getJSON() as EditorDocument;
      const serializedContent = serializeEditorDocumentForStorage(editorDocument, currentEditor.getHTML());
      onEditorChange(
        noteIdRef.current,
        serializedContent.editorDocument,
        serializedContent.contentHtml,
        serializedContent.contentMarkdown,
        serializedContent.plainText,
        serializedContent.wordCount,
        serializedContent.contentSidecars,
      );
    },
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    onOpenNoteRef.current = onOpenNote;
  }, [onOpenNote]);

  useEffect(() => {
    void refreshAiStatus();
  }, [note.id]);

  useEffect(() => {
    if (!editor) {
      onSelectionTextChange("");
      return;
    }

    function updateSelectionText() {
      onSelectionTextChange(createAiSelectionSnapshot(editor, note.id).text);
    }

    editor.on("selectionUpdate", updateSelectionText);
    updateSelectionText();
    return () => {
      editor.off("selectionUpdate", updateSelectionText);
    };
  }, [editor, note.id, onSelectionTextChange]);

  useEffect(() => {
    noteIdRef.current = note.id;

    if (!editor || loadedNoteIdRef.current === note.id) {
      return;
    }

    editor.commands.setContent(note.editorDocument, { emitUpdate: false });
    loadedNoteIdRef.current = note.id;
  }, [editor, note.editorDocument, note.id]);

  async function refreshAiStatus() {
    try {
      const status = await getNoteAiStatus();
      if (isMountedRef.current) {
        setAiStatus(status);
      }
      return status;
    } catch (error) {
      if (isMountedRef.current) {
        setAiStatus({
          hasProvider: false,
          isLocal: true,
          privacyScope: "local",
          privacyAccepted: false,
          privacyNotice: "",
          canUse: false,
          message: String(error),
        });
      }
      return null;
    }
  }

  function handleAiAction(actionId: NoteAiActionId) {
    const selection = createAiSelectionSnapshot(editor, note.id);
    if (!selection.text) {
      setAiScopeChoice({ actionId, scope: "note", selection });
      return;
    }
    void startAiAction({ actionId, scope: "selection", selection });
  }

  async function startAiAction(action: AiPendingAction) {
    const status = aiStatus ?? (await refreshAiStatus());
    if (!status?.hasProvider) {
      onToast("Сначала выберите default LLM provider в настройках моделей");
      onOpenSettingsModels();
      return;
    }
    if (!status.privacyAccepted) {
      setAiPrivacyAction(action);
      return;
    }
    if (!status.canUse) {
      onToast(status.message);
      return;
    }
    await runAiAction(action);
  }

  async function acceptPrivacyAndContinue() {
    const action = aiPrivacyAction;
    const status = aiStatus;
    if (!action || !status) {
      return;
    }

    setIsAiPrivacyAccepting(true);
    try {
      const acceptedStatus = await acceptNoteAiPrivacy(status.privacyScope);
      if (!isMountedRef.current) {
        return;
      }
      setAiStatus(acceptedStatus);
      setAiPrivacyAction(null);
      await runAiAction(action);
    } catch (error) {
      onToast(`Не удалось сохранить подтверждение AI privacy: ${String(error)}`);
    } finally {
      if (isMountedRef.current) {
        setIsAiPrivacyAccepting(false);
      }
    }
  }

  async function runAiAction(action: AiPendingAction) {
    if (!editor) {
      return;
    }

    const requestId = ++aiRequestIdRef.current;
    setPendingAiActionId(action.actionId);
    setAiPreview(null);

    try {
      const result = await runNoteAi({
        kind: "action",
        actionId: action.actionId,
        scope: action.scope,
        context: createNoteAiContext(note, action.scope === "selection" ? action.selection.text : undefined),
      });
      if (!isMountedRef.current || requestId !== aiRequestIdRef.current || noteIdRef.current !== action.selection.noteId) {
        return;
      }
      setAiPreview({
        actionId: action.actionId,
        actionLabel: aiActionLabels[action.actionId],
        id: requestId,
        isStale: action.scope === "selection" && !selectionStillMatches(editor, action.selection),
        result: result.response,
        scope: action.scope,
        selection: action.selection,
      });
    } catch (error) {
      if (isMountedRef.current && requestId === aiRequestIdRef.current) {
        onToast(`AI-действие не выполнено: ${String(error)}`);
      }
    } finally {
      if (isMountedRef.current && requestId === aiRequestIdRef.current) {
        setPendingAiActionId(undefined);
      }
    }
  }

  function applyAiPreview(mode: "copy" | "insert-below" | "replace-note" | "replace-selection") {
    const currentEditor = editor;
    const preview = aiPreview;
    if (!currentEditor || !preview) {
      return;
    }

    if (mode === "copy") {
      void navigator.clipboard.writeText(preview.result).then(
        () => onToast("Ответ AI скопирован"),
        () => onToast("Не удалось скопировать ответ AI"),
      );
      return;
    }

    const content = markdownToTiptapDoc(preview.result).content ?? [];
    if (mode === "replace-selection") {
      if (preview.scope !== "selection" || preview.isStale) {
        onToast("Выделение изменилось. Вставьте результат ниже или в позицию курсора.");
        return;
      }
      currentEditor.chain().focus().insertContentAt({ from: preview.selection.from, to: preview.selection.to }, content).run();
      setAiPreview(null);
      return;
    }

    if (mode === "replace-note") {
      currentEditor.commands.setContent(markdownToTiptapDoc(preview.result), { emitUpdate: true });
      setAiPreview(null);
      return;
    }

    if (mode === "insert-below") {
      const insertAt = preview.scope === "selection" ? Math.min(preview.selection.to, currentEditor.state.doc.content.size) : currentEditor.state.doc.content.size;
      currentEditor.chain().focus().insertContentAt(insertAt, content).run();
      setAiPreview(null);
      return;
    }

  }

  const isEmptyNote = note.contentMarkdown.trim().length === 0;

  async function applyImageEdit(dataUrl: string, mode: ImageEditMode) {
    const target = imageEditTarget;
    if (!target) {
      return;
    }

    const metadata: ImageEditMetadata = {
      appliedAt: new Date().toISOString(),
      mode,
    };
    const originalAttachmentId = target.attrs.originalAttachmentId ?? target.attrs.attachmentId ?? undefined;
    const fileName = createEditedImageFileName(mode, target.attrs.title ?? target.attrs.alt ?? "image");

    try {
      const editedFile = await dataUrlToFile(dataUrl, fileName);
      const stored = await onStoreAttachment(editedFile, "image", {
        editMetadata: metadata,
        originalAttachmentId,
      });
      target.updateAttributes({
        attachmentId: stored.attachment.id,
        editedAttachmentId: stored.attachment.id,
        editMetadata: metadata,
        originalAttachmentId: originalAttachmentId ?? target.attrs.originalAttachmentId ?? null,
        originalSrc: target.attrs.originalSrc ?? target.attrs.src,
        src: dataUrl,
      });
      setImageEditTarget(null);
      onToast(mode === "crop" ? "Изображение обрезано" : "Аннотации применены");
    } catch (error) {
      onToast(`Не удалось сохранить изображение: ${String(error)}`);
    }
  }

  return (
    <section className="editor-col">
      {!isFocusMode ? (
        <div className="ed-top">
          <div className="crumb">
            <Icon name="folder" />
            <span>Проекты</span>
            <span className="sep">/</span>
            <span>{note.project}</span>
          </div>
          <div className="ed-act">
            <div className={`saved ${saveStatus === "saving" ? "saving" : ""} ${saveStatus === "error" ? "error" : ""}`}>
              <Icon name="check" />
              <span>{saveStatus === "saving" ? "Сохранение…" : saveStatus === "error" ? "Ошибка сохранения" : "Сохранено"}</span>
            </div>
            <button className="ibtn ai" onClick={onOpenChat} type="button">
              <Icon name="chat" />
              <span>Чат по заметке</span>
            </button>
            <button className="ibtn" data-tooltip="Фокус-режим (Ctrl+\)" onClick={onToggleFocus} type="button">
              <Icon name="focus" />
            </button>
            <button className="ibtn" data-tooltip="Меню заметки" onClick={() => setIsNoteMenuOpen((value) => !value)} type="button">
              <Icon name="dots" />
            </button>
            {isNoteMenuOpen ? (
              <NoteMenuPopover
                note={note}
                onArchive={onArchiveNote}
                onClose={() => setIsNoteMenuOpen(false)}
                onDelete={onDeleteNote}
                onDuplicate={onDuplicateNote}
                onExportMarkdown={onExportMarkdown}
                onMove={onMoveNote}
                onRename={onRenameNote}
                onTogglePin={onTogglePin}
                projectOptions={projectOptions}
              />
            ) : null}
          </div>
        </div>
      ) : (
        <div className="focus-strip">
          <button className="focus-exit" data-tooltip="Выйти из режима фокуса" onClick={onExitFocus} type="button">
            <Icon name="focus" />
            <span>Выйти из режима фокуса</span>
            <kbd>Esc</kbd>
          </button>
        </div>
      )}

      <FormattingToolbar
        aiStatus={aiStatus}
        editor={editor}
        onAiAction={handleAiAction}
        onOpenAiSettings={onOpenSettingsModels}
        onToast={onToast}
        pendingAiActionId={pendingAiActionId}
      />

      <div className="ed-scroll" ref={editorPageLayout.viewportRef}>
        <div className={`ed-page-frame ${editorPageLayout.isResizing ? "resizing" : ""}`} ref={editorPageLayout.pageRef} style={editorPageLayout.pageStyle}>
          <button {...editorPageLayout.leftHandleProps} />
          <div className="ed-inner">
            <h1 className="ed-title">{note.title}</h1>
            <div className="ed-tags">
              {note.tags.map((tag) => (
                <span className={`tag tag-${tag.color}`} key={tag.name}>
                  {tag.name}
                </span>
              ))}
              {note.isNew ? <span className="note-date-chip">{note.noteDate}</span> : null}
              <button className="add" data-tooltip="Добавить тег" onClick={() => onToast("Добавление тегов появится на следующем этапе данных")} type="button">
                +
              </button>
            </div>
            <div className={`ed-body ${isEmptyNote ? "empty-note" : ""}`}>
              <TableToolsPopover editor={editor} onToast={onToast} />
              <EditorContent editor={editor} />
              {isEmptyNote ? <NewNoteHelper /> : null}
            </div>
          </div>
          <button {...editorPageLayout.rightHandleProps} />
        </div>
      </div>

      {aiScopeChoice ? (
        <AiScopeChoicePanel
          actionLabel={aiActionLabels[aiScopeChoice.actionId]}
          onApplyToNote={() => {
            const action = { ...aiScopeChoice, scope: "note" as const };
            setAiScopeChoice(null);
            void startAiAction(action);
          }}
          onClose={() => setAiScopeChoice(null)}
        />
      ) : null}

      {aiPrivacyAction && aiStatus ? (
        <AiPrivacyPanel
          isAccepting={isAiPrivacyAccepting}
          isLocal={aiStatus.isLocal}
          notice={aiStatus.privacyNotice}
          onAccept={() => void acceptPrivacyAndContinue()}
          onClose={() => setAiPrivacyAction(null)}
        />
      ) : null}

      {aiPreview ? (
        <AiPreviewPanel
          preview={aiPreview}
          onCancel={() => setAiPreview(null)}
          onCopy={() => applyAiPreview("copy")}
          onInsertBelow={() => applyAiPreview("insert-below")}
          onReplaceNote={() => applyAiPreview("replace-note")}
          onReplaceSelection={() => applyAiPreview("replace-selection")}
        />
      ) : null}

      {imageEditTarget ? (
        <ImageEditorModal
          mode={imageEditTarget.mode}
          onApply={(dataUrl, mode) => void applyImageEdit(dataUrl, mode)}
          onClose={() => setImageEditTarget(null)}
          src={imageEditTarget.attrs.src}
          title={imageEditTarget.attrs.title ?? imageEditTarget.attrs.alt ?? "Изображение"}
        />
      ) : null}

      <div className="ed-bottom">
        <button className="ibtn" data-tooltip="Вставить сложный блок" onClick={() => setIsBlockMenuOpen((value) => !value)} type="button">
          <Icon name="plus" />
        </button>
        {isBlockMenuOpen ? <BlockInsertMenu editor={editor} notes={notes} onClose={() => setIsBlockMenuOpen(false)} onStoreAttachment={onStoreAttachment} onToast={onToast} /> : null}
        <span className="words">{note.wordCount} слов</span>
      </div>
    </section>
  );
}

function createAiSelectionSnapshot(editor: Editor | null, noteId: string): AiSelectionSnapshot {
  if (!editor || editor.state.selection.empty) {
    return {
      from: 0,
      noteId,
      text: "",
      to: 0,
    };
  }
  const { from, to } = editor.state.selection;
  return {
    from,
    noteId,
    text: editor.state.doc.textBetween(from, to, "\n").trim(),
    to,
  };
}

function selectionStillMatches(editor: Editor, selection: AiSelectionSnapshot) {
  if (!selection.text) {
    return false;
  }
  const docSize = editor.state.doc.content.size;
  if (selection.from < 0 || selection.to > docSize || selection.from >= selection.to) {
    return false;
  }
  return editor.state.doc.textBetween(selection.from, selection.to, "\n").trim() === selection.text;
}

function AiScopeChoicePanel({
  actionLabel,
  onApplyToNote,
  onClose,
}: {
  actionLabel: string;
  onApplyToNote: () => void;
  onClose: () => void;
}) {
  return (
    <div className="ai-editor-panel ai-scope-panel">
      <div className="ai-editor-panel-head">
        <b>{actionLabel}</b>
        <button aria-label="Закрыть" className="editor-popover-close" onClick={onClose} type="button">
          <Icon name="x" />
        </button>
      </div>
      <p>Фрагмент не выделен. Можно применить действие ко всей заметке или сначала выделить нужный текст.</p>
      <div className="ai-editor-panel-actions">
        <button className="secondary-btn" onClick={onClose} type="button">
          Сначала выделить
        </button>
        <button className="primary-btn" onClick={onApplyToNote} type="button">
          Ко всей заметке
        </button>
      </div>
    </div>
  );
}

function AiPrivacyPanel({
  isAccepting,
  isLocal,
  notice,
  onAccept,
  onClose,
}: {
  isAccepting: boolean;
  isLocal: boolean;
  notice: string;
  onAccept: () => void;
  onClose: () => void;
}) {
  return (
    <div className="ai-editor-panel ai-privacy-panel">
      <div className="ai-editor-panel-head">
        <b>{isLocal ? "Локальная модель" : "Внешний AI provider"}</b>
        <button aria-label="Закрыть" className="editor-popover-close" onClick={onClose} type="button">
          <Icon name="x" />
        </button>
      </div>
      <p>{notice}</p>
      <div className="ai-editor-panel-actions">
        <button className="secondary-btn" onClick={onClose} type="button">
          Отмена
        </button>
        <button className="primary-btn" disabled={isAccepting} onClick={onAccept} type="button">
          {isAccepting ? <span className="button-spinner" /> : null}
          Подтвердить
        </button>
      </div>
    </div>
  );
}

function AiPreviewPanel({
  onCancel,
  onCopy,
  onInsertBelow,
  onReplaceNote,
  onReplaceSelection,
  preview,
}: {
  onCancel: () => void;
  onCopy: () => void;
  onInsertBelow: () => void;
  onReplaceNote: () => void;
  onReplaceSelection: () => void;
  preview: AiPreviewState;
}) {
  return (
    <div className="ai-editor-panel ai-preview-panel">
      <div className="ai-editor-panel-head">
        <b>{preview.actionLabel}</b>
        <button aria-label="Закрыть" className="editor-popover-close" onClick={onCancel} type="button">
          <Icon name="x" />
        </button>
      </div>
      {preview.isStale ? <div className="ai-preview-warning">Выделение изменилось. Замена выделения отключена, но результат можно вставить или скопировать.</div> : null}
      <div className="ai-preview-result">{preview.result}</div>
      <div className="ai-editor-panel-actions wrap">
        <button className="secondary-btn" disabled={preview.scope !== "selection" || preview.isStale} onClick={onReplaceSelection} type="button">
          Заменить выделение
        </button>
        <button className="secondary-btn" onClick={onInsertBelow} type="button">
          Вставить ниже
        </button>
        {preview.scope === "note" ? (
          <button className="danger-btn" onClick={onReplaceNote} type="button">
            Заменить всю заметку
          </button>
        ) : null}
        <button className="secondary-btn" onClick={onCopy} type="button">
          Скопировать
        </button>
        <button className="secondary-btn" onClick={onCancel} type="button">
          Отмена
        </button>
      </div>
    </div>
  );
}

function NewNoteHelper() {
  return (
    <div className="new-note-helper">
      <b>Новая заметка создана.</b>
      <br />
      Начните писать здесь или вставьте Markdown. Изменения сохраняются автоматически в локальной базе.
    </div>
  );
}
