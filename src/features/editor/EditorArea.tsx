import { translate, useInterfaceLanguage, getInterfaceLanguage } from "../../shared/i18n";
import { formatRussianCount, WORD_COUNT_FORMS } from "../../shared/russianPlural";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { getHTMLFromFragment } from "@tiptap/core";
import { Color } from "@tiptap/extension-color";
import Code from "@tiptap/extension-code";
import Highlight from "@tiptap/extension-highlight";
import { openUrl } from "@tauri-apps/plugin-opener";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import TableRow from "@tiptap/extension-table-row";
import TaskList from "@tiptap/extension-task-list";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import type { AppLanguage, EditorContentSidecarInput, EditorDocument, Note, NoteAttachment, SaveStatus, TagRow } from "../../app/types";
import { localizeUiMessage, uiMessage } from "../../shared/uiMessages";
import { acceptNoteAiPrivacy, createNoteAiContext, getNoteAiStatus, runNoteAi, type NoteAiActionId, type NoteAiScope, type NoteAiStatus } from "../../services/noteAiService";
import { Icon } from "../../shared/Icon";
import { sanitizeMarkdownLinkHref } from "../../shared/safeLinkHref";
import { EditableImage, type EditableImageTarget } from "../imageEditor/ImageNodeView";
import { createEditedImageFileName, dataUrlToFile, type ImageEditMode, type ImageEditMetadata } from "../imageEditor/imageEditService";
import { BlockInsertMenu, type EditorInsertSelection, type EditorInsertTarget } from "./BlockInsertMenu";
import { runtimeAssetUrl } from "./assetUri";
import { InteractiveFileAttachment } from "./FileAttachmentNodeView";
import { FormattingToolbar } from "./FormattingToolbar";
import { EditorContextMenu } from "./EditorContextMenu";
import { NoteMenuPopover } from "./NoteMenuPopover";
import { InlineNoteTitle } from "./InlineNoteTitle";
import { NoteTagsInline } from "./NoteTagsInline";
import type { TagEditorValue } from "../tags/TagEditorModal";
import { TableToolsPopover } from "./TableToolsPopover";
import { Callout, DetailsBlock, DetailsContent, DetailsSummary, FontFormat, InlineDate, NoteMention } from "./customExtensions";
import { serializeEditorDocumentForStorage } from "./editorContentSerializer";
import { EditorSavePreparation, scheduleEditorPreparation, type EditorSavePreparationControl } from "./editorSavePreparation";
import { createEditorSerializationClient } from "./editorSerializationClient";
import type { EditorSerializationSnapshot } from "./editorSerializationProtocol";
import { shouldReloadEditorDocument, type EditorDocumentLoadToken } from "./editorDocumentReload";
import { handleEditorLinkClick } from "./editorLinkClick";
import { EditorIndent, NoteFlowLink, PassiveEditorTransactions } from "./editorInteractions";
import { CodeBlockRestoration } from "./codeBlockRestoration";
import { editorClipboardMarkdown } from "./editorClipboardMarkdown";
import { markdownToTiptapDoc } from "./markdownService";
import { withMarkdownCodec } from "./markdownCodec";
import { isTauri } from "@tauri-apps/api/core";
import { readEditorClipboard, importClipboardFiles, type EditorClipboardContent } from "../../services/clipboardService";
import { filterClipboardHtml, pasteClipboardIntoEditor, handleEditorPasteEvent } from "./editorPaste";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { storeAttachmentFromPath } from "../../services/dataService";
import { insertNativeDrop, nativeDropPoint } from "./editorNativeDrop";
import { NoteFlowTable, NoteFlowTableCell, NoteFlowTableHeader, NoteFlowTableView, TableToolsAnchor } from "./tableExtensions";
import { NoteFlowTaskItem } from "./taskExtensions";
import { useEditorPageLayout } from "./useEditorPageLayout";
import type { EditorPageLayoutSettings } from "../../shared/editorPageLayout";
import type { SemanticSearchResult } from "../../services/embeddingService";
import { LazyImageEditorModal } from "../../app/lazyFeatures";
import { FeatureLoadState, LazyFeatureBoundary } from "../../shared/LazyFeatureBoundary";
import { ModalShell } from "../../shared/ModalShell";
import { useObservedPhysicalElementWidth } from "../../shared/useObservedPhysicalElementWidth";
import { getEditorSurfaceLayoutMode } from "./editorToolbarLayout";
import { MarkdownImportControl, type MarkdownImportControlHandle } from "../settings/MarkdownImportControl";
import type { PreparedMarkdownNote } from "../settings/markdownImport";
import { HeadingAnchors, scrollToNoteHeading } from "./headingAnchors";
import { NoteOutline } from "./NoteOutline";
import { NoteExportDialog } from "../export/NoteExportDialog";
import type { NoteExportFormat } from "../export/exportDocument";
import { validateEntityName } from "../../shared/entityName";
import { EntityNameCounter } from "../../shared/EntityNameCounter";
import { PublicCommandError } from "../../services/safeInvoke";
import { NoteSearch } from "./noteSearch";
import { NoteSearchBar } from "./NoteSearchBar";
import { captureMarkdownImportSelection, insertImportedMarkdown, type MarkdownImportSelection } from "./insertImportedMarkdown";
import { internalNoteHref, type InternalNoteLink, type FragmentAnchor } from "../../shared/internalNoteLink";
import { captureFragmentAnchor, FragmentNavigation, fragmentNavigationKey, resolveDocumentFragment, sourceSnapshotIsCurrent } from "./fragmentNavigation";
import { scrollToSearchMatch } from "./scrollToSearchMatch";
import { tiptapJsonToPlainText } from "./markdownService";
import { NoteLinkPicker } from "./NoteLinkPicker";
import { writeEditorClipboard } from "../../services/clipboardService";

interface EditorAreaProps {
  language?: AppLanguage;
  savePreparationRef?: RefObject<EditorSavePreparationControl | null>;
  onEditorDirty?: (noteId: string) => boolean;
  onPreparationError?: () => void;
  internalOpenTarget?: InternalNoteLink & { navigationId: number };
  searchQuery?: string;
  documentReloadGeneration: number;
  editorContentOffset: number;
  editorContentWidth: number;
  isFocusMode: boolean;
  note: Note;
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
  onExportNote: (noteId: string, format: NoteExportFormat) => Promise<void>;
  exportFormat?: NoteExportFormat;
  onMoveNote: (noteId: string, project: string) => Promise<void>;
  onCreateProjectForNote: (noteId: string, title: string) => Promise<void>;
  onRemoveNoteFromProject: (noteId: string) => Promise<void>;
  onMakeNoteTagPrimary: (noteId: string, tagId: string) => Promise<void>;
  onImportMarkdown: (notes: readonly PreparedMarkdownNote[]) => Promise<number>;
  onOpenChat: () => void;
  onOpenAttachment: (attachmentId: string) => Promise<void>;
  onOpenNote: (noteId: string, fragment?: FragmentAnchor) => void;
  onOpenSettingsModels: () => void;
  onCreateNoteTag: (noteId: string, value: TagEditorValue) => Promise<void>;
  onPickAndStoreAttachment: (kind: "file" | "image") => Promise<{ attachment: NoteAttachment; sizeLabel: string } | null>;
  onRenameNote: (noteId: string, title: string) => Promise<void>;
  onRetrySave: () => void;
  onSetNoteTag: (noteId: string, tagId: string, assigned: boolean) => Promise<void>;
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
  semanticOpenTarget: SemanticSearchResult | null;
  tagOptions: TagRow[];
}

interface AiSelectionSnapshot {
  from: number;
  noteId: string;
  text: string;
  to: number;
}

export function clearImageNodeSelection(editor: Editor) {
  const selection = editor.state.selection;
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== "image") {
    return false;
  }

  const position = Math.min(selection.to, editor.state.doc.content.size);
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(position))));
  return true;
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
  get ask() { return translate("ui.a507630d53f8"); },
  get expand() { return translate("ui.59f82b81874d"); },
  get explain() { return translate("ui.c4710bcb6e10"); },
  get fix() { return translate("ui.5bd8cfde875a"); },
  get improve() { return translate("ui.89a537789de8"); },
  get shorten() { return translate("ui.f747d976b67f"); },
  get tasks() { return translate("ui.20bb5c3b3ae1"); },
  get tone() { return translate("ui.dc65da6126ed"); },
  get translate() { return translate("ui.4ac45591613f"); },
};

export function createEditorExtensions(options: {
  onEditImage: (target: EditableImageTarget) => void;
  onOpenAttachment: (attachmentId: string) => Promise<void>;
  onRevealAttachment: (attachmentId: string) => Promise<void>;
  onToast: (message: string) => void;
}) {
  return withMarkdownCodec([
    StarterKit.configure({
      link: false,
      underline: false,
      code: false,
      heading: {
        levels: [1, 2, 3, 4, 5, 6],
      },
    }),
    Underline,
    Code.extend({ excludes: "" }),
    TextStyle,
    FontFormat,
    EditorIndent,
    PassiveEditorTransactions,
    CodeBlockRestoration,
    HeadingAnchors,
    NoteSearch,
    FragmentNavigation,
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
    NoteFlowLink.configure({
      protocols: ["noteflow"],
      autolink: true,
      linkOnPaste: true,
      openOnClick: false,
      isAllowedUri: (url) => Boolean(sanitizeMarkdownLinkHref(url)),
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
  ]);
}

export function EditorArea({
  language = getInterfaceLanguage(),
  searchQuery = "",
  documentReloadGeneration,
  editorContentOffset,
  editorContentWidth,
  isFocusMode,
  note,
  onArchiveNote,
  onDeleteNote,
  onDuplicateNote,
  onEditorChange,
  onEditorDirty,
  onPreparationError,
  savePreparationRef,
  onEditorPageLayoutChange,
  onEditorPageLayoutReset,
  onExitFocus,
  onExportNote,
  exportFormat,
  onMoveNote,
  onCreateProjectForNote,
  onRemoveNoteFromProject,
  onMakeNoteTagPrimary,
  onOpenChat,
  onOpenAttachment,
  onOpenNote,
  onOpenSettingsModels,
  onCreateNoteTag,
  onPickAndStoreAttachment,
  onRenameNote,
  onRetrySave,
  onSetNoteTag,
  onRevealAttachment,
  onSelectionTextChange,
  onStoreAttachment,
  onTogglePin,
  onToggleFocus,
  onToast,
  projectOptions,
  saveStatus,
  semanticOpenTarget,
  internalOpenTarget,
  tagOptions,
}: EditorAreaProps) {
  useInterfaceLanguage();
  const [isBlockMenuOpen, setIsBlockMenuOpen] = useState(false);
  const [isNoteLinkPickerOpen, setIsNoteLinkPickerOpen] = useState(false);
  const noteLinkSelectionRef = useRef<{ noteId: string; from: number; to: number; document: Editor["state"]["doc"] } | null>(null);
  const [blockInsertSelection, setBlockInsertSelection] = useState<EditorInsertSelection | null>(null);
  const [blockInsertTarget, setBlockInsertTarget] = useState<EditorInsertTarget | null>(null);
  const [isNoteMenuOpen, setIsNoteMenuOpen] = useState(false);
  const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [projectCreateBusy, setProjectCreateBusy] = useState(false);
  const [projectCreateError, setProjectCreateError] = useState("");
  const importControlRef = useRef<MarkdownImportControlHandle>(null);
  const importSelectionRef = useRef<MarkdownImportSelection | null>(null);
  const [imageEditTarget, setImageEditTarget] = useState<EditableImageTarget | null>(null);
  const [drawingSelection, setDrawingSelection] = useState<EditorInsertSelection | null>(null);
  const [aiStatus, setAiStatus] = useState<NoteAiStatus | null>(null);
  const [aiScopeChoice, setAiScopeChoice] = useState<AiPendingAction | null>(null);
  const [aiPrivacyAction, setAiPrivacyAction] = useState<AiPendingAction | null>(null);
  const [aiPreview, setAiPreview] = useState<AiPreviewState | null>(null);
  const [pendingAiActionId, setPendingAiActionId] = useState<NoteAiActionId | undefined>();
  const [isAiPrivacyAccepting, setIsAiPrivacyAccepting] = useState(false);
  const editorRef = useRef<Editor | null>(null);
  const preparationRef = useRef<EditorSavePreparation<EditorSerializationSnapshot, ReturnType<typeof serializeEditorDocumentForStorage>> | null>(null);
  const saveCallbacks = useRef({ onEditorChange, onEditorDirty, onPreparationError, onToast });
  saveCallbacks.current = { onEditorChange, onEditorDirty, onPreparationError, onToast };
  const [exportNoteId, setExportNoteId] = useState<string | null>(null);
  const aiRequestIdRef = useRef(0);
  const clipboardPasteIdRef = useRef(0);
  const clipboardBusyRef = useRef(false);
  const nativeDropBusyRef = useRef(false);
  const isMountedRef = useRef(false);
  const loadedDocumentTokenRef = useRef<EditorDocumentLoadToken | null>(null);
  const noteIdRef = useRef(note.id);
  const editorSurfaceRef = useRef<HTMLElement>(null);
  const onOpenNoteRef = useRef(onOpenNote);
  const editorSurfaceLayoutMode = getEditorSurfaceLayoutMode(useObservedPhysicalElementWidth(editorSurfaceRef));
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
    shouldRerenderOnTransaction: false,
    content: note.editorDocument,
    editorProps: {
      clipboardTextSerializer: editorClipboardMarkdown,
      transformPastedHTML: filterClipboardHtml,
      handleKeyDown: (_view, event) => {
        if (!isTauri() || event.key.toLowerCase() !== "v" || !(event.ctrlKey || event.metaKey) || event.altKey) return false;
        const currentEditor = editorRef.current;
        if (!currentEditor) return false;
        event.preventDefault();
        if (!event.repeat) void pasteClipboard(event.shiftKey, true);
        return true;
      },
      handleDOMEvents: {
        click: (view, event) => handleEditorLinkClick(event, (url) => {
          void openUrl(url).catch(() => onToast(translate("ui.106eb9493d09")));
        }, (anchor) => {
          if (!scrollToNoteHeading(view, anchor)) onToast(translate("ui.f88fa3cd2102"));
        }, (link) => onOpenNoteRef.current(link.noteId, link.fragment)),
      },
      handleClickOn: (_view, _pos, node, _nodePos, event, direct) => {
        if (!direct) {
          return false;
        }

        if (node.type.name === "inlineDate") {
          event.preventDefault();
          setBlockInsertSelection(null);
          setBlockInsertTarget({ kind: "date", position: _nodePos, value: String(node.attrs.value ?? "") });
          setIsBlockMenuOpen(true);
          return true;
        }

        if (node.type.name !== "noteMention") {
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
        const currentEditor = editorRef.current;

        const files = Array.from(event.clipboardData?.files ?? []);
        if (currentEditor && files.length) {
          event.preventDefault();
          void pasteClipboard(false, true, isTauri() ? undefined : () => importClipboardFiles(noteIdRef.current, files));
          return true;
        }

        return currentEditor ? handleEditorPasteEvent(currentEditor, event, () => onToast(translate("ui.caa6213e70bd"))) : false;
      },
    },
    extensions: editorExtensions,
    onUpdate: ({ editor: currentEditor }) => {
      const preparation = preparationRef.current;
      if (preparation) {
        const noteId = noteIdRef.current;
        if (saveCallbacks.current.onEditorDirty?.(noteId) === false) return;
        const document = currentEditor.state.doc;
        preparation.enqueue(() => ({ noteId, document: document.toJSON() as EditorDocument,
          contentHtml: document === currentEditor.state.doc ? currentEditor.getHTML() : getHTMLFromFragment(document.content, currentEditor.schema) }));
        return;
      }
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
    if (!editor || !savePreparationRef) return;
    const client = createEditorSerializationClient();
    // Main-thread fallback waits for the existing autosave/close flush, not each key.
    const schedule = (run: () => void) => client.usesMainThreadFallback() ? () => undefined : scheduleEditorPreparation(run);
    const preparation = new EditorSavePreparation(client.prepare, (content, snapshot) => {
      saveCallbacks.current.onEditorChange(snapshot.noteId, content.editorDocument, content.contentHtml, content.contentMarkdown, content.plainText, content.wordCount, content.contentSidecars);
    }, () => { saveCallbacks.current.onPreparationError?.(); saveCallbacks.current.onToast(translate("ui.f8d78486eb77")); }, schedule);
    preparationRef.current = preparation;
    savePreparationRef.current = preparation;
    return () => {
      preparation.discard(); client.dispose();
      if (preparationRef.current === preparation) preparationRef.current = null;
      if (savePreparationRef.current === preparation) savePreparationRef.current = null;
    };
  }, [editor, savePreparationRef]);

  async function pasteClipboard(plainTextOnly = false, requireFocus = false, read?: () => Promise<EditorClipboardContent>, asMarkdown = false) {
    const currentEditor = editorRef.current;
    if (!currentEditor || clipboardBusyRef.current || (requireFocus && !currentEditor.view.hasFocus())) return false;
    clipboardBusyRef.current = true;
    const requestId = ++clipboardPasteIdRef.current;
    const noteId = noteIdRef.current;
    const generation = loadedDocumentTokenRef.current?.reloadGeneration;
    try {
      return await pasteClipboardIntoEditor(currentEditor, read ?? (() => readEditorClipboard(noteId, plainTextOnly || asMarkdown)),
        () => isMountedRef.current && requestId === clipboardPasteIdRef.current && noteId === noteIdRef.current && generation === loadedDocumentTokenRef.current?.reloadGeneration && (!requireFocus || currentEditor.view.hasFocus()), onToast, plainTextOnly, asMarkdown);
    } catch { onToast(translate("ui.e3061b42f3a7")); return false; }
    finally { clipboardBusyRef.current = false; }
  }

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    if (!editor || !isTauri()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWebview().onDragDropEvent((event) => {
      if (disposed || event.payload.type !== "drop" || nativeDropBusyRef.current || editor.isDestroyed) return;
      const dropSurface = editor.view.dom.closest<HTMLElement>(".ed-scroll") ?? editor.view.dom;
      const point = nativeDropPoint(event.payload.position, window.devicePixelRatio, dropSurface.getBoundingClientRect());
      if (!point) return;
      const target = document.elementFromPoint(point.left, point.top);
      if (!target || !dropSurface.contains(target) || target.closest("button, input, .image-action-panel, .table-tools-popover")) return;
      const contentRect = editor.view.dom.getBoundingClientRect();
      const contentPoint = { left: Math.max(contentRect.left + 1, Math.min(contentRect.right - 1, point.left)), top: Math.max(contentRect.top + 1, Math.min(contentRect.bottom - 1, point.top)) };
      const position = editor.view.posAtCoords(contentPoint)?.pos ?? editor.state.doc.content.size;
      const noteId = noteIdRef.current;
      const generation = loadedDocumentTokenRef.current?.reloadGeneration;
      nativeDropBusyRef.current = true;
      void insertNativeDrop(editor, event.payload.paths, position,
        (path, kind) => storeAttachmentFromPath(noteId, path, kind),
        () => !disposed && noteId === noteIdRef.current && generation === loadedDocumentTokenRef.current?.reloadGeneration,
      ).then((inserted) => { if (inserted) onToast(translate("ui.2033cf0c9cac")); })
        .catch(() => onToast(translate("ui.7860b76e12f0")))
        .finally(() => { nativeDropBusyRef.current = false; });
    }).then((stop) => { if (disposed) stop(); else unlisten = stop; })
      .catch(() => { if (!disposed) onToast(translate("ui.ace667ca50b9")); });
    return () => { disposed = true; unlisten?.(); };
  }, [editor, onToast]);

  useEffect(() => {
    if (!editor) return undefined;

    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (event.key !== "Escape" || (target instanceof Element && target.closest("[role='dialog']"))) return;
      if (clearImageNodeSelection(editor)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".note-image-node.selected, .nf-popover, .nf-modal-shell")) return;
      clearImageNodeSelection(editor);
    }

    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
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

    if (!editor) {
      return;
    }

    const nextToken: EditorDocumentLoadToken = {
      contentVersion: note.contentVersion,
      noteId: note.id,
      reloadGeneration: documentReloadGeneration,
    };
    const shouldReload = shouldReloadEditorDocument({
      currentDocument: editor.getJSON() as EditorDocument,
      nextDocument: note.editorDocument,
      nextToken,
      previousToken: loadedDocumentTokenRef.current,
    });
    loadedDocumentTokenRef.current = nextToken;
    if (shouldReload) {
      preparationRef.current?.discard();
      setImageEditTarget(null);
      setDrawingSelection(null);
      clearImageNodeSelection(editor);
      editor.commands.setContent(note.editorDocument, { emitUpdate: false });
    }
  }, [documentReloadGeneration, editor, note.contentVersion, note.editorDocument, note.id]);

  useEffect(() => {
    setIsNoteLinkPickerOpen(false); noteLinkSelectionRef.current = null;
  }, [note.id, documentReloadGeneration]);

  useEffect(() => {
    if (!editor || loadedDocumentTokenRef.current?.noteId !== note.id) return;
    let cancelled = false;
    let timer: number | undefined;
    const anchor = internalOpenTarget?.noteId === note.id ? internalOpenTarget.fragment : undefined;
    const source = semanticOpenTarget?.noteId === note.id ? semanticOpenTarget : null;
    const quote = anchor?.quote ?? (source ? tiptapJsonToPlainText(markdownToTiptapDoc(source.snippet.replace(/^…\s*|\s*…$/gu, ""))) : "");
    editor.view.dispatch(editor.state.tr.setMeta(fragmentNavigationKey, null).setMeta("addToHistory", false));
    if (!quote) return;
    const document = editor.state.doc;
    const rangePromise = source && !sourceSnapshotIsCurrent(source.updatedAt, note.updatedAt) ? Promise.resolve(null) : resolveDocumentFragment(document, quote, anchor);
    void rangePromise.then((range) => {
      if (cancelled || editor.isDestroyed || !document.eq(editor.state.doc)) return;
      if (!range) { onToast(translate("ui.7ff753e07fb3")); return; }
      editor.view.dispatch(editor.state.tr.setMeta(fragmentNavigationKey, range).setMeta("addToHistory", false));
      scrollToSearchMatch(editor.view, range, null);
      timer = window.setTimeout(() => { if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(fragmentNavigationKey, null).setMeta("addToHistory", false)); }, 4000);
    }).catch(() => { if (!cancelled) onToast(translate("ui.2398ee55641f")); });
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [editor, note.id, documentReloadGeneration, semanticOpenTarget, internalOpenTarget]);

  function chooseNoteLink() {
    if (!editor) return;
    if (editor.isActive("link") && editor.state.selection.empty) editor.commands.extendMarkRange("link");
    noteLinkSelectionRef.current = { noteId: note.id, from: editor.state.selection.from, to: editor.state.selection.to, document: editor.state.doc };
    editor.view.focus();
    setIsNoteLinkPickerOpen(true);
  }

  function insertNoteLink(noteId: string, title: string) {
    const selected = noteLinkSelectionRef.current;
    setIsNoteLinkPickerOpen(false);
    if (!editor || !selected || selected.noteId !== note.id || !selected.document.eq(editor.state.doc)) { onToast(translate("ui.4e42baaa0e49")); return; }
    const href = internalNoteHref({ noteId });
    if (selected.from !== selected.to) editor.chain().focus().setTextSelection(selected).setLink({ href }).run();
    else editor.chain().focus().insertContentAt(selected.from, { type: "text", text: title, marks: [{ type: "link", attrs: { href } }] }).run();
  }

  async function copyFragmentLink() {
    if (!editor || editor.state.selection.empty) { onToast(translate("ui.9efa59841ef2")); return; }
    const { from, to } = editor.state.selection;
    const document = editor.state.doc;
    const noteId = note.id;
    try {
      const fragment = await captureFragmentAnchor(document, from, to);
      if (!fragment) { onToast(translate("ui.7a40dd937f19")); return; }
      const label = fragment.quote.replace(/[\\[\]]/g, "\\$&");
      await writeEditorClipboard(`[${label}](${internalNoteHref({ noteId, fragment })})`);
      onToast(translate("ui.bb67fa3d1a70"));
    } catch { onToast(translate("ui.61eee4e32ab1")); }
  }

  async function refreshAiStatus() {
    try {
      const status = await getNoteAiStatus(language);
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
          message: localizeUiMessage(language, error instanceof Error ? error.message : uiMessage(language, "providerConnectionsLoadFailed")),
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
      onToast(uiMessage(language, "chooseDefaultProvider"));
      onOpenSettingsModels();
      return;
    }
    if (!status.privacyAccepted) {
      setAiPrivacyAction(action);
      return;
    }
    if (!status.canUse) {
      onToast(localizeUiMessage(language, status.message));
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
      const acceptedStatus = await acceptNoteAiPrivacy(status.privacyScope, language);
      if (!isMountedRef.current) {
        return;
      }
      setAiStatus(acceptedStatus);
      setAiPrivacyAction(null);
      await runAiAction(action);
    } catch {
      onToast(uiMessage(language, "aiPrivacySaveFailed"));
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
        onToast(translate("ui.7816ae35d5c9", { p0: String(error) }));
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
        () => onToast(translate("ui.e05e6f4fe691")),
        () => onToast(translate("ui.19578295fd0e")),
      );
      return;
    }

    const content = markdownToTiptapDoc(preview.result).content ?? [];
    if (mode === "replace-selection") {
      if (preview.scope !== "selection" || preview.isStale) {
        onToast(translate("ui.efe1fd061566"));
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
    if ((!target && !drawingSelection) || !editor) {
      return;
    }

    const metadata: ImageEditMetadata = {
      appliedAt: new Date().toISOString(),
      mode,
    };
    const originalAttachmentId = target?.attrs.originalAttachmentId ?? target?.attrs.attachmentId ?? undefined;
    const fileName = createEditedImageFileName(mode, target?.attrs.title ?? target?.attrs.alt ?? translate("ui.6c5aedae811e"));

    const noteId = note.id;
    const documentToken = loadedDocumentTokenRef.current;
    try {
      if (target && !target.isCurrent()) throw new Error(translate("ui.b676004097b2"));
      const editedFile = await dataUrlToFile(dataUrl, fileName);
      const stored = await onStoreAttachment(editedFile, "image", {
        editMetadata: metadata,
        originalAttachmentId,
      });
      if (!stored.attachment.assetUri) {
        throw new Error(translate("ui.af9d2b9487ef"));
      }
      if (noteIdRef.current !== noteId || loadedDocumentTokenRef.current?.reloadGeneration !== documentToken?.reloadGeneration) {
        throw new Error(translate("ui.26d458fe00e9"));
      }
      if (target && !target.isCurrent()) throw new Error(translate("ui.b676004097b2"));
      if (!target && drawingSelection) {
        const imageAttrs = {
          attachmentId: stored.attachment.id, originalAttachmentId: stored.attachment.id,
          originalSrc: stored.attachment.assetUri, src: stored.attachment.assetUri, alt: translate("ui.6c5aedae811e"), title: translate("ui.6c5aedae811e"),
        };
        const inserted = editor.chain().focus().setTextSelection(drawingSelection).setImage(imageAttrs).run();
        if (!inserted) throw new Error(translate("ui.44c24ee8e255"));
        setDrawingSelection(null);
        onToast(translate("ui.0015c78d2ad0"));
        return;
      }
      target?.updateAttributes({
        attachmentId: stored.attachment.id,
        editedAttachmentId: stored.attachment.id,
        editMetadata: metadata,
        originalAttachmentId: originalAttachmentId ?? target?.attrs.originalAttachmentId ?? null,
        originalSrc: target?.attrs.originalSrc ?? target?.attrs.src,
        src: stored.attachment.assetUri,
        height: null,
      });
      setImageEditTarget(null);
      onToast(mode === "crop" ? translate("ui.c58f9c576764") : translate("ui.b3db4d3e4caf"));
    } catch {
      throw new Error(translate("ui.fa52cbcdd62e"));
    }
  }

  return (
    <section className={`editor-col editor-surface-${editorSurfaceLayoutMode}`} data-layout={editorSurfaceLayoutMode} ref={editorSurfaceRef}>
      {!isFocusMode ? (
        <div className="ed-top">
          <div className="ed-act">
            {saveStatus === "error" ? (
              <button
                aria-label={translate("ui.c5069affc4ac")}
                className="saved saved-retry error"
                data-tooltip={translate("ui.3c320d7fe3f0")}
                onClick={onRetrySave}
                type="button"
              >
                <Icon name="redo" />
                <span>{translate("ui.f734ccd6774b")}</span>
              </button>
            ) : (
              <div
                aria-label={saveStatus === "saving" ? translate("ui.a77d5c4eccaa") : translate("ui.2fe8f2fd7243")}
                className={`saved ${saveStatus === "saving" ? "saving" : ""}`}
                data-tooltip={saveStatus === "saving" ? translate("ui.bd97450c8556") : translate("ui.2fe8f2fd7243")}
                role="status"
              >
                <Icon name="check" />
                <span>{saveStatus === "saving" ? translate("ui.bd97450c8556") : translate("ui.2fe8f2fd7243")}</span>
              </div>
            )}
            <button data-note-control="chat" className="ibtn ai" data-tooltip={translate("ui.38ac0283cd7c")} onClick={onOpenChat} type="button">
              <Icon name="chat" />
              <span>{translate("ui.38ac0283cd7c")}</span>
            </button>
            <button className="ibtn" data-tooltip={translate("ui.6935bc91ce5a")} onClick={onToggleFocus} type="button">
              <Icon name="focus" />
            </button>
            <NoteOutline editor={editor} />
            <button className="ibtn" data-tooltip={translate("ui.4df18676e13b")} onClick={() => setIsNoteMenuOpen((value) => !value)} type="button">
              <Icon name="dots" />
            </button>
            {isNoteMenuOpen ? (
              <NoteMenuPopover
                note={note}
                onArchive={onArchiveNote}
                onClose={() => setIsNoteMenuOpen(false)}
                onDelete={() => setIsDeleteConfirmationOpen(true)}
                onDuplicate={onDuplicateNote}
                onExportMarkdown={(noteId) => setExportNoteId(noteId)}
                onImportMarkdown={() => {
                  importSelectionRef.current = editor ? captureMarkdownImportSelection(editor) : null;
                  importControlRef.current?.open();
                }}
                onMove={onMoveNote}
                onCreateProject={() => { setNewProjectTitle(""); setProjectCreateError(""); setIsCreateProjectOpen(true); }}
                onRemoveFromProject={onRemoveNoteFromProject}
                onTogglePin={onTogglePin}
                projectOptions={projectOptions}
              />
            ) : null}
          </div>
        </div>
      ) : (
        <div className="focus-strip">
          <NoteOutline editor={editor} />
          <button data-note-control="focus-exit" className="focus-exit" data-tooltip={translate("ui.d9c7e1c93350")} onClick={onExitFocus} type="button">
            <Icon name="focus" />
            <span>{translate("ui.d9c7e1c93350")}</span>
            <kbd>Esc</kbd>
          </button>
        </div>
      )}

      <FormattingToolbar
        language={language}
        onChooseNote={chooseNoteLink}
        onCopyFragment={() => void copyFragmentLink()}
        aiStatus={aiStatus}
        editor={editor}
        onAiAction={handleAiAction}
        onOpenAiSettings={onOpenSettingsModels}
        onToast={onToast}
        pendingAiActionId={pendingAiActionId}
      />
      {isNoteLinkPickerOpen ? <NoteLinkPicker onClose={() => setIsNoteLinkPickerOpen(false)} onChoose={insertNoteLink} /> : null}
      {exportNoteId ? <NoteExportDialog initialFormat={exportFormat} document={editor?.getJSON() as EditorDocument ?? note.editorDocument} onClose={() => setExportNoteId(null)} onExport={(format) => onExportNote(exportNoteId, format)} /> : null}

      <div className="editor-writing-viewport">
      <NoteSearchBar key={note.id} editor={editor} initialQuery={searchQuery} />
      <div className="ed-scroll" ref={editorPageLayout.viewportRef}>
        <div className={`ed-page-frame ${editorPageLayout.isResizing ? "resizing" : ""}`} ref={editorPageLayout.pageRef} style={editorPageLayout.pageStyle}>
          <button {...editorPageLayout.leftHandleProps} />
          <div className="ed-inner">
            <InlineNoteTitle key={note.id} noteId={note.id} onRename={onRenameNote} title={note.title} />
            <NoteTagsInline
              noteDate={note.isNew ? note.noteDate : undefined}
              noteId={note.id}
              onCreateTag={onCreateNoteTag}
              onSetTag={onSetNoteTag}
              onMakePrimary={onMakeNoteTagPrimary}
              options={tagOptions}
              tags={note.tags}
            />
            <div className={`ed-body ${isEmptyNote ? "empty-note" : ""}`}>
              {!isBlockMenuOpen ? <TableToolsPopover editor={editor} onToast={onToast} /> : null}
              <EditorContent editor={editor} />
              <EditorContextMenu key={`${note.id}:${documentReloadGeneration}`} editor={editor} onToast={onToast} onPaste={(asMarkdown) => pasteClipboard(false, false, undefined, asMarkdown)} onChooseNote={chooseNoteLink} onCopyFragment={() => void copyFragmentLink()} />
              {isEmptyNote ? <NewNoteHelper /> : null}
            </div>
          </div>
          <button {...editorPageLayout.rightHandleProps} />
        </div>
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
          language={language}
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

      {imageEditTarget || drawingSelection ? (
        <LazyFeatureBoundary
          errorFallback={<ImageEditorLoadState kind="error" onClose={() => { setImageEditTarget(null); setDrawingSelection(null); }} />}
          loadingFallback={<ImageEditorLoadState kind="loading" onClose={() => { setImageEditTarget(null); setDrawingSelection(null); }} />}
        >
          <LazyImageEditorModal
            mode={imageEditTarget?.mode ?? "draw"}
            onApply={applyImageEdit}
            onClose={() => { setImageEditTarget(null); setDrawingSelection(null); }}
            src={imageEditTarget ? runtimeAssetUrl(imageEditTarget.attrs.src) : ""}
            title={imageEditTarget?.attrs.title ?? imageEditTarget?.attrs.alt ?? ""}
          />
        </LazyFeatureBoundary>
      ) : null}

      <div className="ed-bottom">
        <button
          className="ibtn"
          data-tooltip={translate("ui.08bf11b3a0e2")}
          onClick={() => {
            if (isBlockMenuOpen) {
              setIsBlockMenuOpen(false);
              setBlockInsertTarget(null);
              return;
            }
            const selection = editor?.state.selection;
            setBlockInsertSelection(selection ? { from: selection.from, to: selection.to } : null);
            setBlockInsertTarget(null);
            setIsBlockMenuOpen(true);
          }}
          type="button"
        >
          <Icon name="plus" />
        </button>
        {isBlockMenuOpen ? (
          <BlockInsertMenu
            editTarget={blockInsertTarget}
            editor={editor}
            onClose={() => {
              setIsBlockMenuOpen(false);
              setBlockInsertTarget(null);
            }}
            onPickAndStoreAttachment={onPickAndStoreAttachment}
            onCreateDrawing={() => {
              if (!editor) return;
              setDrawingSelection(blockInsertSelection ?? { from: editor.state.selection.from, to: editor.state.selection.to });
              setIsBlockMenuOpen(false);
            }}
            onToast={onToast}
            selection={blockInsertSelection}
          />
        ) : null}
        <span className="words">{formatRussianCount(note.wordCount, WORD_COUNT_FORMS)}</span>
      </div>
      <MarkdownImportControl key={`${note.id}:${documentReloadGeneration}`} targetNoteTitle={note.title} onImport={async (notes) => {
        if (!editor) throw new Error("Editor unavailable");
        insertImportedMarkdown(editor, notes, importSelectionRef.current);
        onToast(translate("ui.00330f66f66a"));
        return notes.length;
      }} ref={importControlRef} showTrigger={false} />
      {isDeleteConfirmationOpen ? (
        <ModalShell
          className="note-delete-dialog"
          description={translate("ui.2c9af9829beb")}
          dismissOnBackdrop={false}
          footer={<div className="new-note-actions"><button className="secondary-btn" onClick={() => setIsDeleteConfirmationOpen(false)} type="button">{translate("ui.8fbe9b75cbdf")}</button><button className="danger-btn" onClick={() => { setIsDeleteConfirmationOpen(false); onDeleteNote(note.id); }} type="button">{translate("ui.be99b1361201")}</button></div>}
          onClose={() => setIsDeleteConfirmationOpen(false)}
          open size="compact" title={translate("ui.55390b546ba2", { p0: note.title })}
        ><div className="settings-confirm-note">{translate("ui.8399775a078a")}</div></ModalShell>
      ) : null}
      {isCreateProjectOpen ? (
        <ModalShell
          closeDisabled={projectCreateBusy}
          description={translate("ui.1a3cc488a05c")}
          footer={<div className="new-note-actions"><button className="secondary-btn" disabled={projectCreateBusy} onClick={() => setIsCreateProjectOpen(false)} type="button">{translate("ui.8fbe9b75cbdf")}</button><button className="primary-btn" disabled={Boolean(validateEntityName(newProjectTitle)) || projectCreateBusy} form="create-note-project-form" type="submit">{projectCreateBusy ? translate("ui.c2f23e83210c") : translate("ui.49ed84ac6492")}</button></div>}
          onClose={() => setIsCreateProjectOpen(false)} open size="compact" title={translate("ui.15d568b010da")}
        >
          <form className="new-note-form" id="create-note-project-form" onSubmit={(event) => {
            event.preventDefault();
            if (!newProjectTitle.trim() || projectCreateBusy) return;
            const validation = validateEntityName(newProjectTitle);
            if (validation) { setProjectCreateError(validation); return; }
            setProjectCreateBusy(true);
            setProjectCreateError("");
            void onCreateProjectForNote(note.id, newProjectTitle.trim()).then(() => setIsCreateProjectOpen(false)).catch((error: unknown) => setProjectCreateError(error instanceof PublicCommandError && error.code === "PROJECT_TITLE_EXISTS" ? error.message : error instanceof Error && error.message.startsWith("Проект создан,") ? error.message : translate("ui.d906caefb24a"))).finally(() => setProjectCreateBusy(false));
          }}>
            <label>{translate("ui.720a7014d17b")}<input autoFocus aria-invalid={Boolean(projectCreateError)} onChange={(event) => { setNewProjectTitle(event.currentTarget.value); setProjectCreateError(""); }} value={newProjectTitle} /><EntityNameCounter value={newProjectTitle} error={projectCreateError} /></label>
          </form>
        </ModalShell>
      ) : null}
    </section>
  );
}

function ImageEditorLoadState({ kind, onClose }: { kind: "error" | "loading"; onClose: () => void }) {
  useInterfaceLanguage();
  const [visible, setVisible] = useState(kind === "error");
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 150);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <ModalShell open onClose={onClose} title={translate("ui.37935b84a3d1")}>
      <FeatureLoadState kind={kind} label={translate("ui.20a6a85f8124")} />
    </ModalShell>
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
  useInterfaceLanguage();
  return (
    <div className="ai-editor-panel ai-scope-panel">
      <div className="ai-editor-panel-head">
        <b>{actionLabel}</b>
        <button aria-label={translate("ui.a7a4033657e8")} className="editor-popover-close" onClick={onClose} type="button">
          <Icon name="x" />
        </button>
      </div>
      <p>{translate("ui.97d0dd19ff25")}</p>
      <div className="ai-editor-panel-actions">
        <button className="secondary-btn" onClick={onClose} type="button">
          {translate("ui.8d73b2083380")}</button>
        <button className="primary-btn" onClick={onApplyToNote} type="button">
          {translate("ui.bf44a9c7802d")}</button>
      </div>
    </div>
  );
}

function AiPrivacyPanel({
  language,
  isAccepting,
  isLocal,
  notice,
  onAccept,
  onClose,
}: {
  language: AppLanguage;
  isAccepting: boolean;
  isLocal: boolean;
  notice: string;
  onAccept: () => void;
  onClose: () => void;
}) {
  useInterfaceLanguage();
  return (
    <div className="ai-editor-panel ai-privacy-panel">
      <div className="ai-editor-panel-head">
        <b>{uiMessage(language, isLocal ? "localAiModel" : "externalAiProvider")}</b>
        <button aria-label={translate("ui.a7a4033657e8")} className="editor-popover-close" onClick={onClose} type="button">
          <Icon name="x" />
        </button>
      </div>
      <p>{localizeUiMessage(language, notice)}</p>
      <div className="ai-editor-panel-actions">
        <button className="secondary-btn" onClick={onClose} type="button">
          {translate("ui.8fbe9b75cbdf")}</button>
        <button className="primary-btn" disabled={isAccepting} onClick={onAccept} type="button">
          {isAccepting ? <span className="button-spinner" /> : null}
          {translate("ui.27bca309f5f8")}</button>
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
  useInterfaceLanguage();
  return (
    <div className="ai-editor-panel ai-preview-panel">
      <div className="ai-editor-panel-head">
        <b>{preview.actionLabel}</b>
        <button aria-label={translate("ui.a7a4033657e8")} className="editor-popover-close" onClick={onCancel} type="button">
          <Icon name="x" />
        </button>
      </div>
      {preview.isStale ? <div className="ai-preview-warning">{translate("ui.0ddd796e5b4f")}</div> : null}
      <div className="ai-preview-result">{preview.result}</div>
      <div className="ai-editor-panel-actions wrap">
        <button className="secondary-btn" disabled={preview.scope !== "selection" || preview.isStale} onClick={onReplaceSelection} type="button">
          {translate("ui.11a449a77267")}</button>
        <button className="secondary-btn" onClick={onInsertBelow} type="button">
          {translate("ui.921d0d045f63")}</button>
        {preview.scope === "note" ? (
          <button className="danger-btn" onClick={onReplaceNote} type="button">
            {translate("ui.03b838287c6a")}</button>
        ) : null}
        <button className="secondary-btn" onClick={onCopy} type="button">
          {translate("ui.f02956c16588")}</button>
        <button className="secondary-btn" onClick={onCancel} type="button">
          {translate("ui.8fbe9b75cbdf")}</button>
      </div>
    </div>
  );
}

function NewNoteHelper() {
  useInterfaceLanguage();
  return (
    <div className="new-note-helper">
      <b>{translate("ui.1665819d419b")}</b>
      <br />
      {translate("ui.9d40d2ac5344")}</div>
  );
}
