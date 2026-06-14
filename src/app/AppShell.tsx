import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type { AppSection, Note, ThemeMode } from "./types";
import { mockNotes } from "../data/mockData";
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
import { Icon } from "../shared/Icon";
import { ResizeHandle } from "../shared/ResizeHandle";
import { Toast } from "../shared/Toast";
import { usePersistentNumber, usePersistentString } from "../shared/usePersistentState";

const themeModes = ["light", "dark", "system"] as const;

type WorkspaceStyle = CSSProperties & {
  "--sbw": string;
  "--listw": string;
  "--chatw": string;
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
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [theme, setTheme] = usePersistentString<ThemeMode>("noteflow.theme", "light", themeModes);
  const [sidebarWidth, setSidebarWidth] = usePersistentNumber("noteflow.sidebarWidth", 250, 190, 360);
  const [listWidth, setListWidth] = usePersistentNumber("noteflow.listWidth", 376, 260, 560);
  const [chatWidth, setChatWidth] = usePersistentNumber("noteflow.chatWidth", 380, 300, 620);

  const activeNote = notes.find((note) => note.id === activeNoteId) ?? notes[0];

  const filteredNotes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return notes;
    }

    return notes.filter((note) => {
      const searchableText = [note.title, note.summary, note.project, ...note.tags.map((tag) => tag.name)].join(" ").toLowerCase();
      return searchableText.includes(normalizedQuery);
    });
  }, [notes, query]);

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
      title,
      summary: "Начните писать новую заметку…",
      dateLabel: formatNoteDate(noteDate),
      noteDate: formatNoteDate(noteDate),
      project: "Входящие",
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

  if (activeSection === "projects") {
    return <AppFrame footer={<SharedOverlays isNewNoteModalOpen={isNewNoteModalOpen} onCloseNewNote={() => setIsNewNoteModalOpen(false)} onCreateNote={createNote} toastMessage={toastMessage} />}>
      <ProjectsPage onNavigate={navigate} onNewNote={openNewNoteModal} onToast={showToast} />
    </AppFrame>;
  }

  if (activeSection === "rag") {
    return <AppFrame footer={<SharedOverlays isNewNoteModalOpen={isNewNoteModalOpen} onCloseNewNote={() => setIsNewNoteModalOpen(false)} onCreateNote={createNote} toastMessage={toastMessage} />}>
      <RagChatPage onNavigate={navigate} onNewNote={openNewNoteModal} onToast={showToast} />
    </AppFrame>;
  }

  if (activeSection === "tags") {
    return <AppFrame footer={<SharedOverlays isNewNoteModalOpen={isNewNoteModalOpen} onCloseNewNote={() => setIsNewNoteModalOpen(false)} onCreateNote={createNote} toastMessage={toastMessage} />}>
      <TagsPage onNavigate={navigate} onNewNote={openNewNoteModal} onToast={showToast} />
    </AppFrame>;
  }

  if (activeSection === "archive") {
    return <AppFrame footer={<SharedOverlays isNewNoteModalOpen={isNewNoteModalOpen} onCloseNewNote={() => setIsNewNoteModalOpen(false)} onCreateNote={createNote} toastMessage={toastMessage} />}>
      <ArchivePage onNavigate={navigate} onNewNote={openNewNoteModal} onToast={showToast} />
    </AppFrame>;
  }

  if (activeSection === "settings") {
    return <AppFrame footer={<SharedOverlays isNewNoteModalOpen={isNewNoteModalOpen} onCloseNewNote={() => setIsNewNoteModalOpen(false)} onCreateNote={createNote} toastMessage={toastMessage} />}>
      <SettingsPage onNavigate={navigate} onNewNote={openNewNoteModal} onThemeChange={setTheme} onToast={showToast} theme={theme} />
    </AppFrame>;
  }

  return (
    <AppFrame
      footer={<SharedOverlays isNewNoteModalOpen={isNewNoteModalOpen} onCloseNewNote={() => setIsNewNoteModalOpen(false)} onCreateNote={createNote} toastMessage={toastMessage} />}
    >
      <button className={`focus-exit ${isFocusMode ? "show" : ""}`} data-tooltip="Выйти из режима фокуса" onClick={() => setIsFocusMode(false)} type="button">
        <Icon name="focus" />
        <span>Выйти из режима фокуса</span>
        <kbd>Esc</kbd>
      </button>
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

        <EditorArea note={activeNote} onOpenChat={() => setIsChatOpen(true)} onToast={showToast} onToggleFocus={toggleFocusMode} />

        {isChatOpen && !isFocusMode ? (
          <NoteChatPanel
            note={activeNote}
            onClose={() => setIsChatOpen(false)}
            onResetWidth={() => setChatWidth(380)}
            onResize={(deltaX) => setChatWidth((currentWidth) => clamp(currentWidth + deltaX, 300, 620))}
          />
        ) : null}
      </div>
    </AppFrame>
  );
}

interface AppFrameProps {
  children: ReactNode;
  footer: ReactNode;
}

function AppFrame({ children, footer }: AppFrameProps) {
  return (
    <>
      {children}
      {footer}
    </>
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
    </>
  );
}
