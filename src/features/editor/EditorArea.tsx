import { useEffect, useRef, useState } from "react";
import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { EditorDocument, Note, SaveStatus } from "../../app/types";
import { Icon } from "../../shared/Icon";
import { BlockInsertMenu } from "./BlockInsertMenu";
import { FormattingToolbar } from "./FormattingToolbar";
import { NoteMenuPopover } from "./NoteMenuPopover";
import { Callout, DetailsBlock, DetailsContent, DetailsSummary, FileAttachment, FontFormat, FormulaBlock, FormulaInline, InlineDate, NoteMention } from "./customExtensions";
import { isMarkdownLike, markdownToTiptapDoc, tiptapJsonToMarkdown } from "./markdownService";

interface EditorAreaProps {
  isFocusMode: boolean;
  note: Note;
  notes: Note[];
  onEditorChange: (noteId: string, editorDocument: EditorDocument, contentHtml: string, contentMarkdown: string, plainText: string, wordCount: number) => void;
  onArchiveNote: (noteId: string) => void;
  onDeleteNote: (noteId: string) => void;
  onDuplicateNote: (noteId: string) => void;
  onExitFocus: () => void;
  onExportMarkdown: (noteId: string) => void;
  onMoveNote: (noteId: string, project: string) => void;
  onOpenChat: () => void;
  onOpenNote: (noteId: string) => void;
  onOpenSettingsModels: () => void;
  onRenameNote: (noteId: string, title: string) => void;
  onStoreAttachment: (file: File, kind: "file" | "image") => Promise<{ attachment: { id: string }; sizeLabel: string }>;
  onToggleFavorite: (noteId: string) => void;
  onToggleFocus: () => void;
  onToast: (message: string) => void;
  projectOptions: string[];
  saveStatus: SaveStatus;
}

const editorExtensions = [
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
  TaskItem.configure({ nested: true }),
  Table.configure({ resizable: true }),
  TableRow,
  TableHeader,
  TableCell,
  TextAlign.configure({
    types: ["heading", "paragraph"],
  }),
  Link.configure({
    autolink: true,
    linkOnPaste: true,
    openOnClick: false,
  }),
  Image.configure({
    inline: false,
  }),
  Callout,
  DetailsBlock,
  DetailsSummary,
  DetailsContent,
  FileAttachment,
  NoteMention,
  InlineDate,
  FormulaInline,
  FormulaBlock,
];

export function EditorArea({
  isFocusMode,
  note,
  notes,
  onArchiveNote,
  onDeleteNote,
  onDuplicateNote,
  onEditorChange,
  onExitFocus,
  onExportMarkdown,
  onMoveNote,
  onOpenChat,
  onOpenNote,
  onOpenSettingsModels,
  onRenameNote,
  onStoreAttachment,
  onToggleFavorite,
  onToggleFocus,
  onToast,
  projectOptions,
  saveStatus,
}: EditorAreaProps) {
  const [isBlockMenuOpen, setIsBlockMenuOpen] = useState(false);
  const [isNoteMenuOpen, setIsNoteMenuOpen] = useState(false);
  const editorRef = useRef<Editor | null>(null);
  const loadedNoteIdRef = useRef<string | null>(null);
  const noteIdRef = useRef(note.id);
  const onOpenNoteRef = useRef(onOpenNote);

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
        currentEditor.commands.insertContent(markdownToTiptapDoc(text).content ?? []);
        return true;
      },
    },
    extensions: editorExtensions,
    onUpdate: ({ editor: currentEditor }) => {
      const editorDocument = currentEditor.getJSON() as EditorDocument;
      const contentMarkdown = tiptapJsonToMarkdown(editorDocument);
      const plainText = currentEditor.getText();
      onEditorChange(noteIdRef.current, editorDocument, currentEditor.getHTML(), contentMarkdown, plainText, countWords(plainText));
    },
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    onOpenNoteRef.current = onOpenNote;
  }, [onOpenNote]);

  useEffect(() => {
    noteIdRef.current = note.id;

    if (!editor || loadedNoteIdRef.current === note.id) {
      return;
    }

    editor.commands.setContent(note.editorDocument, { emitUpdate: false });
    loadedNoteIdRef.current = note.id;
  }, [editor, note.editorDocument, note.id]);

  const isEmptyNote = note.contentMarkdown.trim().length === 0;

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
                onToggleFavorite={onToggleFavorite}
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

      <FormattingToolbar editor={editor} onOpenAiSettings={onOpenSettingsModels} onToast={onToast} />

      <div className="ed-scroll">
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
            <EditorContent editor={editor} />
            {isEmptyNote ? <NewNoteHelper /> : null}
          </div>
        </div>
      </div>

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

function countWords(text: string) {
  const normalizedText = text.replace(/\s+/g, " ").trim();
  return normalizedText.length > 0 ? normalizedText.split(" ").length : 0;
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
