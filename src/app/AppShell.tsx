import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { AppSection, EditorDocument, Note, SaveStatus, ThemeMode } from "./types";
import { createEditorStateFromMarkdown, mockNotes, mockProjects } from "../data/mockData";
import { ArchivePage } from "../features/archive/ArchivePage";
import { EditorArea } from "../features/editor/EditorArea";
import { MainSidebar } from "../features/navigation/MainSidebar";
import { NewNoteModal } from "../features/notes/NewNoteModal";
import { NoteListPanel } from "../features/notes/NoteListPanel";
import { NoteChatPanel } from "../features/note-chat/NoteChatPanel";
import { ProjectsPage } from "../features/projects/ProjectsPage";
import { RagChatPage } from "../features/rag/RagChatPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { TagsPage } from "../features/tags/TagsPage";
import { createNotePreview } from "../features/notes/notePreview";
import { ResizeHandle } from "../shared/ResizeHandle";
import { Toast } from "../shared/Toast";
import { TooltipPortal } from "../shared/TooltipPortal";
import { useAppZoom } from "../shared/useAppZoom";
import { usePersistentNumber, usePersistentString } from "../shared/usePersistentState";

const themeModes = ["light", "dark", "system"] as const;

type WorkspaceStyle = CSSProperties & {
  "--sbw": string;
  "--listw": string;
  "--chatw": string;
};

type AppZoomStyle = CSSProperties & {
  "--app-zoom": string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isTextInputTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

function formatNoteDate(noteDate: string) {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${noteDate}T00:00:00`));
}

export function AppShell() {
  const [activeSection, setActiveSection] = useState<AppSection>("notes");
  const [notes, setNotes] = useState<Note[]>(mockNotes);
  const [activeNoteId, setActiveNoteId] = useState(mockNotes[0].id);
  const [query, setQuery] = useState("");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isNewNoteModalOpen, setIsNewNoteModalOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [theme, setTheme] = usePersistentString<ThemeMode>("noteflow.theme", "light", themeModes);
  const [sidebarWidth, setSidebarWidth] = usePersistentNumber("noteflow.sidebarWidth", 250, 190, 360);
  const [listWidth, setListWidth] = usePersistentNumber("noteflow.listWidth", 376, 260, 560);
  const [chatWidth, setChatWidth] = usePersistentNumber("noteflow.chatWidth", 380, 300, 620);
  const saveTimeoutRef = useRef<number | null>(null);
  const appZoom = useAppZoom(showToast);

  const activeNote = notes.find((note) => note.id === activeNoteId) ?? notes[0];

  const filteredNotes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return notes;
    }

    return notes.filter((note) => {
      const searchableText = [note.title, note.plainText, note.project, ...note.tags.map((tag) => tag.name)].join(" ").toLowerCase();
      return searchableText.includes(normalizedQuery);
    });
  }, [notes, query]);

  const projectOptions = useMemo(() => {
    const projectNames = new Set<string>(mockProjects.map((project) => project.title));
    notes.forEach((note) => projectNames.add(note.project));
    projectNames.add("Входящие");
    return Array.from(projectNames);
  }, [notes]);

  useEffect(() => {
    const root = document.documentElement;

    function applyResolvedTheme() {
      const resolvedTheme = theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : theme;
      if (resolvedTheme === "dark") {
        root.setAttribute("data-theme", "dark");
      } else {
        root.removeAttribute("data-theme");
      }
    }

    applyResolvedTheme();
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", applyResolvedTheme);
    return () => mediaQuery.removeEventListener("change", applyResolvedTheme);
  }, [theme]);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => setToastMessage(null), 1900);
    return () => window.clearTimeout(timeoutId);
  }, [toastMessage]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isCommand = event.ctrlKey || event.metaKey;

      if (event.key === "Escape") {
        if (isNewNoteModalOpen) {
          setIsNewNoteModalOpen(false);
          return;
        }
        if (isFocusMode) {
          setIsFocusMode(false);
          return;
        }
        if (isChatOpen) {
          setIsChatOpen(false);
        }
      }

      if (!isCommand) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "n" || key === "т") {
        event.preventDefault();
        openNewNoteModal();
      }

      if (key === "k" || key === "л") {
        event.preventDefault();
        setActiveSection("notes");
        window.setTimeout(() => document.getElementById("note-search")?.focus(), 0);
      }

      if ((key === "b" || key === "и") && !isTextInputTarget(event.target)) {
        event.preventDefault();
        setIsSidebarCollapsed((value) => !value);
      }

      if (event.key === "\\") {
        event.preventDefault();
        toggleFocusMode();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isChatOpen, isFocusMode, isNewNoteModalOpen]);

  function showToast(message: string) {
    setToastMessage(message);
  }

  function updateNoteEditor(noteId: string, editorDocument: EditorDocument, contentHtml: string, contentMarkdown: string, plainText: string, wordCount: number) {
    setNotes((currentNotes) =>
      currentNotes.map((note) =>
        note.id === noteId
          ? {
              ...note,
              contentHtml,
              contentMarkdown,
              editorDocument,
              isNew: false,
              plainText,
              summary: createNotePreview(plainText),
              wordCount,
            }
          : note,
      ),
    );

    setSaveStatus("saving");
    if (saveTimeoutRef.current !== null) {
      window.clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = window.setTimeout(() => setSaveStatus("saved"), 700);
  }

  function navigate(section: AppSection) {
    setActiveSection(section);
    if (section !== "notes") {
      setIsFocusMode(false);
      setIsChatOpen(false);
    }
  }

  function openNewNoteModal() {
    setActiveSection("notes");
    setIsFocusMode(false);
    setIsChatOpen(false);
    setIsNewNoteModalOpen(true);
  }

  function createNote(title: string, noteDate: string) {
    const noteId = `note-${Date.now()}`;
    const newNote: Note = {
      id: noteId,
      ...createEditorStateFromMarkdown(""),
      title,
      summary: "Начните писать новую заметку…",
      dateLabel: formatNoteDate(noteDate),
      noteDate: formatNoteDate(noteDate),
      project: "Входящие",
      plainText: "",
      icon: "doc",
      tags: [{ name: "новая", color: "blue" }],
      wordCount: 0,
      isNew: true,
    };

    setNotes((currentNotes) => [newNote, ...currentNotes]);
    setActiveNoteId(noteId);
    setQuery("");
    setIsNewNoteModalOpen(false);
    showToast("Заметка создана в памяти");
  }

  function openNote(noteId: string) {
    if (!notes.some((note) => note.id === noteId)) {
      showToast("Связанная заметка не найдена");
      return;
    }
    setActiveSection("notes");
    setActiveNoteId(noteId);
    setIsFocusMode(false);
  }

  function renameNote(noteId: string, title: string) {
    setNotes((currentNotes) => currentNotes.map((note) => (note.id === noteId ? { ...note, title } : note)));
    showToast("Название заметки изменено в памяти");
  }

  function duplicateNote(noteId: string) {
    const noteToCopy = notes.find((note) => note.id === noteId);
    if (!noteToCopy) {
      return;
    }

    const nextNoteId = `note-${Date.now()}`;
    const duplicatedNote: Note = {
      ...noteToCopy,
      id: nextNoteId,
      isNew: false,
      pinned: false,
      title: `${noteToCopy.title} - копия`,
    };

    setNotes((currentNotes) => [duplicatedNote, ...currentNotes]);
    setActiveNoteId(nextNoteId);
    showToast("Заметка дублирована в памяти");
  }

  function toggleFavoriteNote(noteId: string) {
    setNotes((currentNotes) => currentNotes.map((note) => (note.id === noteId ? { ...note, pinned: !note.pinned } : note)));
    showToast("Избранное обновлено");
  }

  function moveNote(noteId: string, project: string) {
    setNotes((currentNotes) => currentNotes.map((note) => (note.id === noteId ? { ...note, project } : note)));
    showToast(`Заметка перемещена в «${project}»`);
  }

  function removeNote(noteId: string, mode: "archive" | "delete") {
    if (notes.length <= 1) {
      showToast("Нельзя убрать последнюю заметку из мок-списка");
      return;
    }

    const remainingNotes = notes.filter((note) => note.id !== noteId);
    setNotes(remainingNotes);
    if (activeNoteId === noteId) {
      setActiveNoteId(remainingNotes[0].id);
    }
    showToast(mode === "archive" ? "Заметка архивирована в памяти" : "Заметка удалена из памяти");
  }

  function exportNoteMarkdown(noteId: string) {
    const noteToExport = notes.find((note) => note.id === noteId);
    if (!noteToExport) {
      return;
    }

    if (!navigator.clipboard) {
      showToast("Markdown готов, но буфер обмена недоступен");
      return;
    }

    void navigator.clipboard
      .writeText(noteToExport.contentMarkdown)
      .then(() => showToast("Markdown скопирован в буфер обмена"))
      .catch(() => showToast("Не удалось скопировать Markdown"));
  }

  function toggleFocusMode() {
    setIsFocusMode((currentValue) => {
      const nextValue = !currentValue;
      if (nextValue) {
        setIsChatOpen(false);
      }
      return nextValue;
    });
  }

  const workspaceStyle: WorkspaceStyle = {
    "--sbw": `${isFocusMode ? 0 : isSidebarCollapsed ? 74 : sidebarWidth}px`,
    "--listw": `${isFocusMode ? 0 : listWidth}px`,
    "--chatw": `${isFocusMode || !isChatOpen ? 0 : chatWidth}px`,
  };
  const sharedFooter = (
    <SharedOverlays
      isNewNoteModalOpen={isNewNoteModalOpen}
      onCloseNewNote={() => setIsNewNoteModalOpen(false)}
      onCreateNote={createNote}
      toastMessage={toastMessage}
    />
  );

  function renderAppFrame(children: ReactNode) {
    return (
      <AppFrame footer={sharedFooter} useCssZoomFallback={appZoom.useCssZoomFallback} zoomPercent={appZoom.zoomPercent}>
        {children}
      </AppFrame>
    );
  }

  if (activeSection === "projects") {
    return renderAppFrame(<ProjectsPage onNavigate={navigate} onNewNote={openNewNoteModal} onToast={showToast} />);
  }

  if (activeSection === "rag") {
    return renderAppFrame(
      <RagChatPage
        onNavigate={navigate}
        onNewNote={openNewNoteModal}
        onSidebarReset={() => setSidebarWidth(250)}
        onSidebarResize={(deltaX) => setSidebarWidth((currentWidth) => clamp(currentWidth + deltaX, 190, 360))}
        onToggleSidebarCollapse={() => setIsSidebarCollapsed((value) => !value)}
        onToast={showToast}
        sidebarCollapsed={isSidebarCollapsed}
        sidebarWidth={sidebarWidth}
      />,
    );
  }

  if (activeSection === "tags") {
    return renderAppFrame(<TagsPage onNavigate={navigate} onNewNote={openNewNoteModal} onToast={showToast} />);
  }

  if (activeSection === "archive") {
    return renderAppFrame(<ArchivePage onNavigate={navigate} onNewNote={openNewNoteModal} onToast={showToast} />);
  }

  if (activeSection === "settings") {
    return renderAppFrame(
      <SettingsPage
        appZoomPercent={appZoom.zoomPercent}
        onNavigate={navigate}
        onNewNote={openNewNoteModal}
        onThemeChange={setTheme}
        onToast={showToast}
        onZoomDecrease={appZoom.decreaseZoom}
        onZoomIncrease={appZoom.increaseZoom}
        onZoomReset={appZoom.resetZoom}
        theme={theme}
      />,
    );
  }

  return renderAppFrame(
      <div className={`workspace ${isSidebarCollapsed ? "collapse-sb" : ""} ${isFocusMode ? "focus" : ""} ${isChatOpen ? "chat-open" : ""}`} style={workspaceStyle}>
        {!isFocusMode ? (
          <>
            <MainSidebar
              activeSection="notes"
              collapsed={isSidebarCollapsed}
              onNavigate={navigate}
              onNewNote={openNewNoteModal}
              onToast={showToast}
              onToggleCollapse={() => setIsSidebarCollapsed((value) => !value)}
            />
            {!isSidebarCollapsed ? (
              <ResizeHandle
                className="resize-sb"
                label="Изменить ширину сайдбара"
                onReset={() => setSidebarWidth(250)}
                onResize={(deltaX) => setSidebarWidth((currentWidth) => clamp(currentWidth + deltaX, 190, 360))}
              />
            ) : null}
            <NoteListPanel activeNoteId={activeNote.id} notes={filteredNotes} onQueryChange={setQuery} onSelectNote={setActiveNoteId} query={query} />
            <ResizeHandle
              className="resize-list"
              label="Изменить ширину списка заметок"
              onReset={() => setListWidth(376)}
              onResize={(deltaX) => setListWidth((currentWidth) => clamp(currentWidth + deltaX, 260, 560))}
            />
          </>
        ) : null}

        <EditorArea
          isFocusMode={isFocusMode}
          note={activeNote}
          notes={notes}
          onArchiveNote={(noteId) => removeNote(noteId, "archive")}
          onDeleteNote={(noteId) => removeNote(noteId, "delete")}
          onDuplicateNote={duplicateNote}
          onEditorChange={updateNoteEditor}
          onExitFocus={() => setIsFocusMode(false)}
          onExportMarkdown={exportNoteMarkdown}
          onMoveNote={moveNote}
          onOpenChat={() => setIsChatOpen(true)}
          onOpenNote={openNote}
          onOpenSettingsModels={() => {
            setIsFocusMode(false);
            setIsChatOpen(false);
            setActiveSection("settings");
          }}
          onRenameNote={renameNote}
          onToggleFavorite={toggleFavoriteNote}
          onToast={showToast}
          onToggleFocus={toggleFocusMode}
          projectOptions={projectOptions}
          saveStatus={saveStatus}
        />

        {isChatOpen && !isFocusMode ? (
          <NoteChatPanel
            note={activeNote}
            onClose={() => setIsChatOpen(false)}
            onResetWidth={() => setChatWidth(380)}
            onResize={(deltaX) => setChatWidth((currentWidth) => clamp(currentWidth + deltaX, 300, 620))}
          />
        ) : null}
      </div>
  );
}

interface AppFrameProps {
  children: ReactNode;
  footer: ReactNode;
  useCssZoomFallback: boolean;
  zoomPercent: number;
}

function AppFrame({ children, footer, useCssZoomFallback, zoomPercent }: AppFrameProps) {
  const zoomStyle: AppZoomStyle = {
    "--app-zoom": String(zoomPercent / 100),
  };

  return (
    <div className={`app-zoom-root ${useCssZoomFallback ? "css-zoom-fallback" : ""}`} style={zoomStyle}>
      {children}
      {footer}
    </div>
  );
}

interface SharedOverlaysProps {
  isNewNoteModalOpen: boolean;
  toastMessage: string | null;
  onCloseNewNote: () => void;
  onCreateNote: (title: string, noteDate: string) => void;
}

function SharedOverlays({ isNewNoteModalOpen, toastMessage, onCloseNewNote, onCreateNote }: SharedOverlaysProps) {
  return (
    <>
      <NewNoteModal isOpen={isNewNoteModalOpen} onClose={onCloseNewNote} onCreate={onCreateNote} />
      <Toast message={toastMessage} />
      <TooltipPortal />
    </>
  );
}
