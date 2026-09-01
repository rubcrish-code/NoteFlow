import { useEditorState, type Editor } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import type { NoteAiActionId, NoteAiStatus } from "../../services/noteAiService";
import { Icon, type IconName } from "../../shared/Icon";
import { MenuPopover } from "../../shared/MenuPopover";
import { useFloatingPopoverPosition } from "../../shared/useFloatingPopoverPosition";
import { EditorCommandPopover, type EditorCommandPopoverMode, type EditorCommandSubmit } from "./EditorCommandPopover";
import { FontFormatPopover, type FontFormatDraft } from "./FontFormatPopover";
import { findFontFamilyValue, formatFontSize, normalizeFontSizeValue } from "./fontFormatOptions";

type ToolId =
  | "ai"
  | "align-center"
  | "align-left"
  | "align-right"
  | "bold"
  | "clear"
  | "code-block"
  | "color"
  | "h1"
  | "h2"
  | "h3"
  | "highlight"
  | "inline-code"
  | "italic"
  | "link"
  | "ol"
  | "p"
  | "quote"
  | "redo"
  | "strike"
  | "sub"
  | "sup"
  | "task"
  | "ul"
  | "underline"
  | "undo";

interface ToolbarTool {
  groupAfter?: boolean;
  icon?: IconName;
  id: ToolId;
  label?: string;
  tip: string;
}

interface FormattingToolbarProps {
  aiStatus: NoteAiStatus | null;
  editor: Editor | null;
  onAiAction: (actionId: NoteAiActionId) => void;
  onOpenAiSettings: () => void;
  onToast: (message: string) => void;
  pendingAiActionId?: NoteAiActionId;
}

const toolbarTools: ToolbarTool[] = [
  { id: "undo", tip: "Отменить (Ctrl+Z)", icon: "undo" },
  { id: "redo", tip: "Повторить (Ctrl+Y)", icon: "redo", groupAfter: true },
  { id: "h1", tip: "Заголовок 1", label: "H1" },
  { id: "h2", tip: "Заголовок 2", label: "H2" },
  { id: "h3", tip: "Заголовок 3", label: "H3" },
  { id: "p", tip: "Обычный текст", label: "¶", groupAfter: true },
  { id: "bold", tip: "Жирный (Ctrl+B)", icon: "bold" },
  { id: "italic", tip: "Курсив (Ctrl+I)", icon: "italic" },
  { id: "underline", tip: "Подчёркнутый (Ctrl+U)", icon: "underline" },
  { id: "strike", tip: "Зачёркнутый", icon: "strike" },
  { id: "inline-code", tip: "Моноширинный код", icon: "code" },
  { id: "highlight", tip: "Выделение", icon: "highlight" },
  { id: "color", tip: "Цвет текста", icon: "color" },
  { id: "sup", tip: "Надстрочный", icon: "sup" },
  { id: "sub", tip: "Подстрочный", icon: "sub", groupAfter: true },
  { id: "ul", tip: "Маркированный список", icon: "ul" },
  { id: "ol", tip: "Нумерованный список", icon: "ol" },
  { id: "task", tip: "Чек-лист", icon: "task" },
  { id: "quote", tip: "Цитата", icon: "quote" },
  { id: "code-block", tip: "Блок кода", icon: "codeBlock", groupAfter: true },
  { id: "align-left", tip: "По левому краю", icon: "alignLeft" },
  { id: "align-center", tip: "По центру", icon: "alignCenter" },
  { id: "align-right", tip: "По правому краю", icon: "alignRight", groupAfter: true },
  { id: "link", tip: "Ссылка", icon: "link" },
  { id: "clear", tip: "Очистить форматирование", icon: "clear" },
  { id: "ai", tip: "ИИ-помощник", label: "AI" },
];

const deferredTools = new Set<ToolId>();
const adaptiveToolbarTools = new Set<ToolId>([
  "strike",
  "inline-code",
  "highlight",
  "color",
  "sup",
  "sub",
  "quote",
  "code-block",
  "align-left",
  "align-center",
  "align-right",
  "link",
  "clear",
]);
const narrowToolbarTools = new Set<ToolId>(["redo", "h2", "h3", "italic", "underline", "ol", "task"]);

interface AiActionItem {
  id: NoteAiActionId;
  label: string;
}

const aiActionGroups: Array<{ id: string; items: AiActionItem[] }> = [
  {
    id: "rewrite",
    items: [
      { id: "improve", label: "Улучшить текст" },
      { id: "fix", label: "Исправить ошибки" },
      { id: "shorten", label: "Сократить" },
      { id: "expand", label: "Развернуть подробнее" },
    ],
  },
  {
    id: "transform",
    items: [
      { id: "tone", label: "Изменить тон" },
      { id: "tasks", label: "Сделать список задач" },
      { id: "translate", label: "Перевести" },
      { id: "explain", label: "Объяснить простыми словами" },
    ],
  },
  {
    id: "knowledge",
    items: [{ id: "ask", label: "Спросить по этому тексту" }],
  },
];

interface ToolbarRuntimeState {
  active: Partial<Record<ToolId, boolean>>;
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

export function FormattingToolbar({ aiStatus, editor, onAiAction, onOpenAiSettings, onToast, pendingAiActionId }: FormattingToolbarProps) {
  const [isAiMenuOpen, setIsAiMenuOpen] = useState(false);
  const [isFontMenuOpen, setIsFontMenuOpen] = useState(false);
  const [isOverflowMenuOpen, setIsOverflowMenuOpen] = useState(false);
  const [fontDraft, setFontDraft] = useState<FontFormatDraft>({ fontFamily: "", fontSize: "" });
  const [popoverMode, setPopoverMode] = useState<EditorCommandPopoverMode | null>(null);
  const aiButtonRef = useRef<HTMLButtonElement>(null);
  const aiMenuRef = useRef<HTMLDivElement>(null);
  const aiActionWasPendingRef = useRef(false);
  const fontMenuRef = useRef<HTMLSpanElement>(null);
  const overflowButtonRef = useRef<HTMLButtonElement>(null);
  const toolbarWrapRef = useRef<HTMLDivElement>(null);
  const mouseCommandRef = useRef(false);
  const [isNarrowToolbar, setIsNarrowToolbar] = useState(false);
  const aiMenuStyle = useFloatingPopoverPosition({
    anchorRef: aiButtonRef,
    isOpen: isAiMenuOpen,
    maxHeight: 560,
    popoverRef: aiMenuRef,
    preferredWidth: 348,
  });
  const toolbarState =
    useEditorState({
      editor,
      selector: ({ editor: currentEditor }) => buildToolbarState(currentEditor),
    }) ?? emptyToolbarState;

  const activeFontFamily = findFontFamilyValue(toolbarState.fontFamily);
  const activeFontSize = formatFontSize(toolbarState.fontSize);

  useEffect(() => {
    const toolbarWrap = toolbarWrapRef.current;
    if (!toolbarWrap || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      setIsNarrowToolbar(entry.contentRect.width <= 560);
    });
    observer.observe(toolbarWrap);
    return () => observer.disconnect();
  }, []);

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
      if (target instanceof Node && isFontMenuOpen && fontMenuRef.current && !fontMenuRef.current.contains(target)) {
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

  function runCommand(toolId: ToolId) {
    if (toolId === "ai") {
      setIsFontMenuOpen(false);
      setPopoverMode(null);
      setIsAiMenuOpen((value) => !value);
      return;
    }

    if (deferredTools.has(toolId)) {
      onToast("Используйте нижнее меню + для вставки этого блока");
      return;
    }

    if (!editor) {
      return;
    }

    if (toolId === "link" || toolId === "color" || toolId === "highlight") {
      setIsFontMenuOpen(false);
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
    <div className="toolbar-wrap" ref={toolbarWrapRef}>
      <div aria-label="Лента форматирования" className="toolbar" role="toolbar">
        {toolbarTools.map((tool) => {
          const disabled = isToolDisabled(tool.id, editor, toolbarState);
          return (
            <span className={`toolbar-slot ${adaptiveToolbarTools.has(tool.id) ? "toolbar-slot-adaptive" : ""} ${narrowToolbarTools.has(tool.id) ? "toolbar-slot-narrow" : ""}`} key={tool.id}>
              <button
                aria-label={tool.tip}
                aria-pressed={toolbarState.active[tool.id] === undefined ? undefined : toolbarState.active[tool.id]}
                className={`tb ${toolbarState.active[tool.id] ? "active" : ""} ${tool.id === "ai" ? "ai" : ""}`}
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
              {tool.groupAfter ? <span className="tb-sep" /> : null}
              {tool.id === "p" ? (
                <>
                  <span className="font-menu-anchor" data-toolbar-font-controls ref={fontMenuRef}>
                    <button
                      aria-expanded={isFontMenuOpen}
                      aria-label="Шрифт и размер"
                      className={`tb font-trigger ${isFontMenuOpen || activeFontFamily || activeFontSize ? "active" : ""}`}
                      data-toolbar-font-trigger
                      data-tooltip="Шрифт и размер"
                      disabled={!editor}
                      onClick={() => {
                        if (mouseCommandRef.current) {
                          mouseCommandRef.current = false;
                          return;
                        }
                        toggleFontMenu();
                      }}
                      onMouseDown={(event) => {
                        if (event.button !== 0) {
                          return;
                        }
                        event.preventDefault();
                        mouseCommandRef.current = true;
                        toggleFontMenu();
                      }}
                      type="button"
                    >
                      <span className="lbl font-trigger-label">Aa</span>
                    </button>
                    {isFontMenuOpen ? (
                      <FontFormatPopover
                        draft={fontDraft}
                        onApply={applyFontDraft}
                        onCancel={() => setIsFontMenuOpen(false)}
                        onChange={setFontDraft}
                        onReset={resetFontFormat}
                      />
                    ) : null}
                  </span>
                  <span className="tb-sep" />
                </>
              ) : null}
            </span>
          );
        })}
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
            ref={overflowButtonRef}
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
            {toolbarTools.filter((tool) => adaptiveToolbarTools.has(tool.id) || (isNarrowToolbar && narrowToolbarTools.has(tool.id))).map((tool) => (
              <button
                aria-checked={toolbarState.active[tool.id] ?? false}
                disabled={isToolDisabled(tool.id, editor, toolbarState)}
                key={tool.id}
                onClick={() => runCommand(tool.id)}
                role="menuitemcheckbox"
                type="button"
              >
                {tool.icon ? <Icon name={tool.icon} /> : null}
                <span>{toolbarMenuLabel(tool.tip)}</span>
                {toolbarState.active[tool.id] ? <Icon className="toolbar-menu-check" name="check" /> : null}
              </button>
            ))}
          </MenuPopover>
        </span>
      </div>

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
            {aiActionGroups.map((group) => (
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

function toPopoverMode(toolId: ToolId): EditorCommandPopoverMode {
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

function isToolDisabled(toolId: ToolId, editor: Editor | null, toolbarState: ToolbarRuntimeState) {
  if (deferredTools.has(toolId)) {
    return false;
  }
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
