import { useEditorState, type Editor } from "@tiptap/react";
import { Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { NoteAiActionId, NoteAiStatus } from "../../services/noteAiService";
import { useAppZoomPercent } from "../../shared/AppZoomContext";
import { Icon } from "../../shared/Icon";
import { MenuPopover } from "../../shared/MenuPopover";
import { toPhysicalLayoutPixels } from "../../shared/physicalLayout";
import { useFloatingPopoverPosition } from "../../shared/useFloatingPopoverPosition";
import { useObservedElementWidth } from "../../shared/useObservedElementWidth";
import { EDITOR_AI_ACTION_GROUPS } from "./editorAiActions";
import { EditorCommandPopover, type EditorCommandPopoverMode, type EditorCommandSubmit } from "./EditorCommandPopover";
import {
  getEditorToolbarLayoutMode,
  resolveEditorToolbarActions,
  type EditorToolbarActionId,
} from "./editorToolbarLayout";
import { FontFormatPopover, type FontFormatDraft } from "./FontFormatPopover";
import { findFontFamilyValue, formatFontSize, normalizeFontSizeValue } from "./fontFormatOptions";

interface FormattingToolbarProps {
  aiStatus: NoteAiStatus | null;
  editor: Editor | null;
  onAiAction: (actionId: NoteAiActionId) => void;
  onOpenAiSettings: () => void;
  onToast: (message: string) => void;
  pendingAiActionId?: NoteAiActionId;
}


interface ToolbarRuntimeState {
  active: Partial<Record<EditorToolbarActionId, boolean>>;
  canRedo: boolean;
  canUndo: boolean;
  fontFamily: string;
  fontSize: string;
}

const emptyToolbarState: ToolbarRuntimeState = {
  active: {},
  canRedo: false,
  canUndo: false,
  fontFamily: "",
  fontSize: "",
};

export function FormattingToolbar({ aiStatus, editor, onAiAction, onOpenAiSettings, pendingAiActionId }: FormattingToolbarProps) {
  const [isAiMenuOpen, setIsAiMenuOpen] = useState(false);
  const [isFontMenuOpen, setIsFontMenuOpen] = useState(false);
  const [isOverflowMenuOpen, setIsOverflowMenuOpen] = useState(false);
  const [fontDraft, setFontDraft] = useState<FontFormatDraft>({ fontFamily: "", fontSize: "" });
  const [popoverMode, setPopoverMode] = useState<EditorCommandPopoverMode | null>(null);
  const aiButtonRef = useRef<HTMLButtonElement>(null);
  const aiMenuRef = useRef<HTMLDivElement>(null);
  const aiActionWasPendingRef = useRef(false);
  const fontAnchorRef = useRef<HTMLButtonElement>(null);
  const fontMenuRef = useRef<HTMLDivElement>(null);
  const overflowButtonRef = useRef<HTMLButtonElement>(null);
  const toolbarWrapRef = useRef<HTMLDivElement>(null);
  const mouseCommandRef = useRef(false);
  const appZoomPercent = useAppZoomPercent();
  const toolbarCssWidth = useObservedElementWidth(toolbarWrapRef);
  const toolbarPhysicalWidth = toPhysicalLayoutPixels(toolbarCssWidth, appZoomPercent);
  const toolbarLayoutMode = getEditorToolbarLayoutMode(toolbarPhysicalWidth);
  const { overflowActions, visibleActions } = resolveEditorToolbarActions(toolbarCssWidth, undefined, toolbarLayoutMode);
  const aiMenuStyle = useFloatingPopoverPosition({
    anchorRef: aiButtonRef,
    isOpen: isAiMenuOpen,
    maxHeight: 560,
    popoverRef: aiMenuRef,
    preferredWidth: 348,
  });
  const fontMenuStyle = useFloatingPopoverPosition({
    anchorRef: fontAnchorRef,
    isOpen: isFontMenuOpen,
    maxHeight: 560,
    popoverRef: fontMenuRef,
    preferredWidth: 306,
  });
  const toolbarState =
    useEditorState({
      editor,
      selector: ({ editor: currentEditor }) => buildToolbarState(currentEditor),
    }) ?? emptyToolbarState;

  const activeFontFamily = findFontFamilyValue(toolbarState.fontFamily);
  const activeFontSize = formatFontSize(toolbarState.fontSize);

  useEffect(() => {
    if (!isAiMenuOpen && !isFontMenuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target;
      if (
        target instanceof Node &&
        isAiMenuOpen &&
        aiMenuRef.current &&
        !aiMenuRef.current.contains(target) &&
        !aiButtonRef.current?.contains(target)
      ) {
        setIsAiMenuOpen(false);
      }
      if (
        target instanceof Node && isFontMenuOpen &&
        !fontMenuRef.current?.contains(target) && !fontAnchorRef.current?.contains(target)
      ) {
        setIsFontMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        setIsAiMenuOpen(false);
        setIsFontMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isAiMenuOpen, isFontMenuOpen]);

  useEffect(() => {
    if (pendingAiActionId !== undefined) {
      aiActionWasPendingRef.current = true;
      return;
    }

    if (aiActionWasPendingRef.current) {
      aiActionWasPendingRef.current = false;
      setIsAiMenuOpen(false);
    }
  }, [pendingAiActionId]);

  useEffect(() => {
    if (overflowActions.length === 0) {
      setIsOverflowMenuOpen(false);
    }
  }, [overflowActions.length]);

  function runCommand(toolId: EditorToolbarActionId) {
    if (toolId === "ai") {
      setIsFontMenuOpen(false);
      setIsOverflowMenuOpen(false);
      setPopoverMode(null);
      setIsAiMenuOpen((value) => !value);
      return;
    }

    if (toolId === "font") {
      setIsOverflowMenuOpen(false);
      toggleFontMenu();
      return;
    }

    if (!editor) {
      return;
    }

    if (toolId === "link" || toolId === "color" || toolId === "highlight") {
      setIsFontMenuOpen(false);
      setIsOverflowMenuOpen(false);
      setPopoverMode(toPopoverMode(toolId));
      return;
    }

    setIsFontMenuOpen(false);
    setIsOverflowMenuOpen(false);
    setPopoverMode(null);

    if (toolId === "undo") {
      editor.chain().focus().undo().run();
      return;
    }
    if (toolId === "redo") {
      editor.chain().focus().redo().run();
      return;
    }
    if (toolId === "h1" || toolId === "h2" || toolId === "h3") {
      editor
        .chain()
        .focus()
        .toggleHeading({ level: Number(toolId.slice(1)) as 1 | 2 | 3 })
        .run();
      return;
    }
    if (toolId === "p") {
      editor.chain().focus().setParagraph().run();
      return;
    }
    if (toolId === "bold") {
      editor.chain().focus().toggleBold().run();
      return;
    }
    if (toolId === "italic") {
      editor.chain().focus().toggleItalic().run();
      return;
    }
    if (toolId === "underline") {
      editor.chain().focus().toggleUnderline().run();
      return;
    }
    if (toolId === "strike") {
      editor.chain().focus().toggleStrike().run();
      return;
    }
    if (toolId === "inline-code") {
      editor.chain().focus().toggleCode().run();
      return;
    }
    if (toolId === "sup") {
      editor.chain().focus().toggleSuperscript().run();
      return;
    }
    if (toolId === "sub") {
      editor.chain().focus().toggleSubscript().run();
      return;
    }
    if (toolId === "ul") {
      editor.chain().focus().toggleBulletList().run();
      return;
    }
    if (toolId === "ol") {
      editor.chain().focus().toggleOrderedList().run();
      return;
    }
    if (toolId === "task") {
      editor.chain().focus().toggleTaskList().run();
      return;
    }
    if (toolId === "quote") {
      editor.chain().focus().toggleBlockquote().run();
      return;
    }
    if (toolId === "code-block") {
      editor.chain().focus().toggleCodeBlock().run();
      return;
    }
    if (toolId === "align-left" || toolId === "align-center" || toolId === "align-right") {
      editor.chain().focus().setTextAlign(toolId.replace("align-", "")).run();
      return;
    }
    if (toolId === "clear") {
      editor.chain().focus().unsetAllMarks().clearNodes().run();
    }
  }

  function applyPopoverCommand(value: EditorCommandSubmit) {
    if (!editor) {
      return;
    }

    if (value.mode === "link") {
      if (value.text.length > 0) {
        editor
          .chain()
          .focus()
          .insertContent({ type: "text", text: value.text, marks: [{ type: "link", attrs: { href: value.href } }] })
          .run();
      } else {
        editor.chain().focus().extendMarkRange("link").setLink({ href: value.href }).run();
      }
    }

    if (value.mode === "color") {
      if (value.color) {
        editor.chain().focus().setColor(value.color).run();
      } else {
        editor.chain().focus().unsetColor().run();
      }
    }

    if (value.mode === "highlight") {
      if (value.color) {
        editor.chain().focus().toggleHighlight({ color: value.color }).run();
      } else {
        editor.chain().focus().unsetHighlight().run();
      }
    }

    setPopoverMode(null);
  }

  function toggleFontMenu() {
    if (!editor) {
      return;
    }

    setIsAiMenuOpen(false);
    setPopoverMode(null);
    setFontDraft({ fontFamily: activeFontFamily, fontSize: activeFontSize });
    setIsFontMenuOpen((value) => !value);
  }

  function applyFontDraft() {
    if (!editor) {
      return;
    }

    const nextFontSize = normalizeFontSizeValue(fontDraft.fontSize);
    if (fontDraft.fontFamily || nextFontSize) {
      editor
        .chain()
        .focus()
        .setMark("fontFormat", {
          fontFamily: fontDraft.fontFamily || null,
          fontSize: nextFontSize || null,
        })
        .run();
    } else {
      editor.chain().focus().unsetFontFormat().run();
    }
    setIsFontMenuOpen(false);
  }

  function resetFontFormat() {
    editor?.chain().focus().unsetFontFormat().run();
    setFontDraft({ fontFamily: "", fontSize: "" });
    setIsFontMenuOpen(false);
  }

  const selectedText = getSelectedText(editor);

  return (
    <div
      className={`toolbar-wrap toolbar-layout-${toolbarLayoutMode}`}
      data-layout={toolbarLayoutMode}
      data-overflow-action-count={overflowActions.length}
      data-visible-action-count={visibleActions.length}
      ref={toolbarWrapRef}
    >
      <div aria-label="Лента форматирования" className="toolbar" role="toolbar">
        {visibleActions.map((tool, index) => {
          const disabled = isToolDisabled(tool.id, editor, toolbarState);
          const nextTool = visibleActions[index + 1];
          const separatorAfter = nextTool !== undefined && nextTool.group !== tool.group;

          if (tool.id === "font") {
            return (
              <span className="toolbar-slot" key={tool.id}>
                <span className="font-menu-anchor" data-toolbar-font-controls>
                  <button
                    aria-expanded={isFontMenuOpen}
                    aria-label={tool.tip}
                    className={`tb font-trigger ${isFontMenuOpen || activeFontFamily || activeFontSize ? "active" : ""}`}
                    data-toolbar-action={tool.id}
                    data-toolbar-font-trigger
                    data-tooltip={tool.tip}
                    disabled={!editor}
                    onClick={toggleFontMenu}
                    onMouseDown={(event) => event.preventDefault()}
                    ref={fontAnchorRef}
                    type="button"
                  >
                    <span className="lbl font-trigger-label">{tool.label}</span>
                  </button>
                </span>
                {separatorAfter ? <span aria-hidden="true" className="tb-sep" /> : null}
              </span>
            );
          }

          return (
            <span className="toolbar-slot" key={tool.id}>
              <button
                aria-label={tool.tip}
                aria-pressed={toolbarState.active[tool.id] === undefined ? undefined : toolbarState.active[tool.id]}
                className={`tb ${toolbarState.active[tool.id] ? "active" : ""} ${tool.id === "ai" ? "ai" : ""}`}
                data-toolbar-action={tool.id}
                data-tooltip={tool.tip}
                disabled={disabled}
                ref={tool.id === "ai" ? aiButtonRef : undefined}
                onClick={() => {
                  if (mouseCommandRef.current) {
                    mouseCommandRef.current = false;
                    return;
                  }
                  runCommand(tool.id);
                }}
                onMouseDown={(event) => {
                  if (event.button !== 0) {
                    return;
                  }
                  event.preventDefault();
                  mouseCommandRef.current = true;
                  runCommand(tool.id);
                }}
                type="button"
              >
                {tool.icon ? <Icon name={tool.icon} /> : <span className="lbl">{tool.label}</span>}
              </button>
              {separatorAfter ? <span aria-hidden="true" className="tb-sep" /> : null}
            </span>
          );
        })}
        {overflowActions.length > 0 ? (
          <span className="toolbar-overflow-slot">
            <button
              aria-expanded={isOverflowMenuOpen}
              aria-haspopup="menu"
              aria-label="Дополнительные инструменты форматирования"
              className={`tb ${isOverflowMenuOpen ? "active" : ""}`}
              data-tooltip="Дополнительные инструменты"
              onClick={() => {
                setIsAiMenuOpen(false);
                setIsFontMenuOpen(false);
                setIsOverflowMenuOpen((current) => !current);
              }}
              onMouseDown={(event) => event.preventDefault()}
              ref={(node) => {
                overflowButtonRef.current = node;
                if (overflowActions.some((action) => action.id === "font")) {
                  fontAnchorRef.current = node;
                }
              }}
              type="button"
            >
              <Icon name="dots" />
            </button>
            <MenuPopover
              anchorRef={overflowButtonRef}
              ariaLabel="Дополнительные инструменты форматирования"
              className="toolbar-overflow-menu"
              isOpen={isOverflowMenuOpen}
              onClose={() => setIsOverflowMenuOpen(false)}
              preferredWidth={220}
            >
              {overflowActions.map((tool, index) => {
                const isToggle = toolbarState.active[tool.id] !== undefined;
                const previousTool = overflowActions[index - 1];
                return (
                  <Fragment key={tool.id}>
                    {previousTool && previousTool.group !== tool.group ? (
                      <span aria-hidden="true" className="toolbar-overflow-separator" role="separator" />
                    ) : null}
                    <button
                      aria-checked={isToggle ? toolbarState.active[tool.id] : undefined}
                      data-toolbar-overflow-action={tool.id}
                      disabled={isToolDisabled(tool.id, editor, toolbarState)}
                      onClick={() => runCommand(tool.id)}
                      onMouseDown={(event) => event.preventDefault()}
                      role={isToggle ? "menuitemcheckbox" : "menuitem"}
                      type="button"
                    >
                      {tool.icon ? <Icon name={tool.icon} /> : <span className="toolbar-menu-action-label">{tool.label}</span>}
                      <span>{toolbarMenuLabel(tool.tip)}</span>
                      {toolbarState.active[tool.id] ? <Icon className="toolbar-menu-check" name="check" /> : null}
                    </button>
                  </Fragment>
                );
              })}
            </MenuPopover>
          </span>
        ) : null}
      </div>

      {isFontMenuOpen ? createPortal(
        <FontFormatPopover
          draft={fontDraft}
          onApply={applyFontDraft}
          onCancel={() => setIsFontMenuOpen(false)}
          onChange={setFontDraft}
          onReset={resetFontFormat}
          popoverRef={fontMenuRef}
          style={{ ...fontMenuStyle, visibility: fontMenuStyle ? "visible" : "hidden" }}
        />,
        document.body,
      ) : null}

      {isAiMenuOpen ? (
        <div className="editor-ai-menu" ref={aiMenuRef} role="menu" style={aiMenuStyle ?? { visibility: "hidden" }}>
          <div className="editor-command-head">
            <b>ИИ-помощник</b>
            <button aria-label="Закрыть" className="editor-popover-close" onClick={() => setIsAiMenuOpen(false)} type="button">
              <Icon name="x" />
            </button>
          </div>
          <div className={`ai-disconnected-state ${aiStatus?.canUse ? "connected" : ""}`}>
            <b>{aiStatus?.canUse ? `${aiStatus.providerName ?? "LLM"} · ${aiStatus.model ?? "model"}` : "ИИ-модель не подключена"}</b>
            <span>
              {aiStatus?.canUse
                ? selectedText
                  ? "Действие будет применено к выделенному фрагменту."
                  : "Выделите фрагмент или примените действие ко всей заметке после подтверждения."
                : aiStatus?.message ?? "Подключите локальную или OpenAI-совместимую модель, чтобы использовать действия для выделения и текущей заметки."}
            </span>
          </div>
          <div className="ai-menu-groups">
            {EDITOR_AI_ACTION_GROUPS.map((group) => (
              <div className="ai-menu-group" key={group.id}>
                {group.items.map((item) => (
                  <button
                    className={`ai-action-item ${pendingAiActionId === item.id ? "pending" : ""}`}
                    disabled={pendingAiActionId !== undefined}
                    key={item.id}
                    onClick={() => {
                      if (!aiStatus?.hasProvider) {
                        setIsAiMenuOpen(false);
                        onOpenAiSettings();
                        return;
                      }
                      if (pendingAiActionId !== undefined) {
                        return;
                      }
                      onAiAction(item.id);
                    }}
                    role="menuitem"
                    type="button"
                  >
                    {pendingAiActionId === item.id ? <span className="button-spinner" /> : null}
                    {item.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
          {pendingAiActionId !== undefined ? (
            <div aria-live="polite" className="ai-menu-progress" role="status">
              <span className="button-spinner" />
              <span>ИИ обрабатывает запрос...</span>
            </div>
          ) : null}
          {aiStatus ? (
            <button
              className={`ai-settings-link ${aiStatus.hasProvider ? "model-settings" : ""}`}
              onClick={() => {
                setIsAiMenuOpen(false);
                onOpenAiSettings();
              }}
              type="button"
            >
              {aiStatus.hasProvider ? "Настройки моделей" : "Подключить модель"}
            </button>
          ) : null}
        </div>
      ) : null}

      {popoverMode ? (
        <EditorCommandPopover
          currentColor={getCurrentPopoverColor(editor, popoverMode)}
          initialText={selectedText}
          mode={popoverMode}
          onClose={() => setPopoverMode(null)}
          onSubmit={applyPopoverCommand}
        />
      ) : null}
    </div>
  );
}

function toolbarMenuLabel(tip: string) {
  return tip.replace(/\s*\([^)]*\)$/, "");
}

function toPopoverMode(toolId: EditorToolbarActionId): EditorCommandPopoverMode {
  if (toolId === "color") {
    return "color";
  }
  if (toolId === "highlight") {
    return "highlight";
  }
  return "link";
}

function getSelectedText(editor: Editor | null) {
  if (!editor || editor.state.selection.empty) {
    return "";
  }
  const { from, to } = editor.state.selection;
  return editor.state.doc.textBetween(from, to, " ").trim();
}

function getCurrentPopoverColor(editor: Editor | null, mode: EditorCommandPopoverMode) {
  if (!editor) {
    return undefined;
  }
  if (mode === "color") {
    const color = editor.getAttributes("textStyle").color;
    return typeof color === "string" ? color : undefined;
  }
  if (mode === "highlight") {
    const color = editor.getAttributes("highlight").color;
    return typeof color === "string" ? color : undefined;
  }
  return undefined;
}

function buildToolbarState(editor: Editor | null): ToolbarRuntimeState {
  if (!editor) {
    return emptyToolbarState;
  }

  const fontAttributes = editor.getAttributes("fontFormat");
  const fontFamily = typeof fontAttributes.fontFamily === "string" ? fontAttributes.fontFamily : "";
  const fontSize = typeof fontAttributes.fontSize === "string" ? fontAttributes.fontSize : "";

  return {
    active: {
      "align-center": editor.isActive({ textAlign: "center" }),
      "align-left": editor.isActive({ textAlign: "left" }),
      "align-right": editor.isActive({ textAlign: "right" }),
      bold: editor.isActive("bold"),
      color: typeof editor.getAttributes("textStyle").color === "string",
      "code-block": editor.isActive("codeBlock"),
      h1: editor.isActive("heading", { level: 1 }),
      h2: editor.isActive("heading", { level: 2 }),
      h3: editor.isActive("heading", { level: 3 }),
      highlight: editor.isActive("highlight"),
      "inline-code": editor.isActive("code"),
      italic: editor.isActive("italic"),
      link: editor.isActive("link"),
      ol: editor.isActive("orderedList"),
      p: editor.isActive("paragraph"),
      quote: editor.isActive("blockquote"),
      strike: editor.isActive("strike"),
      sub: editor.isActive("subscript"),
      sup: editor.isActive("superscript"),
      task: editor.isActive("taskList"),
      ul: editor.isActive("bulletList"),
      underline: editor.isActive("underline"),
    },
    canRedo: editor.can().redo(),
    canUndo: editor.can().undo(),
    fontFamily,
    fontSize,
  };
}

function isToolDisabled(toolId: EditorToolbarActionId, editor: Editor | null, toolbarState: ToolbarRuntimeState) {
  if (!editor) {
    return true;
  }
  if (toolId === "undo") {
    return !toolbarState.canUndo;
  }
  if (toolId === "redo") {
    return !toolbarState.canRedo;
  }
  return false;
}
