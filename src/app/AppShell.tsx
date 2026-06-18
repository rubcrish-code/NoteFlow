import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { AppSection, ArchiveItem, EditorDocument, Note, ProjectCard, SaveStatus, TagColor, TagRow, ThemeMode } from "./types";
import * as dataService from "../services/dataService";
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

interface PendingNoteSave {
  contentHtml: string;
  contentMarkdown: string;
  editorDocument: EditorDocument;
  noteId: string;
  plainText: string;
  wordCount: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isTextInputTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

export function AppShell() {
  const [activeSection, setActiveSection] = useState<AppSection>("notes");
  const [notes, setNotes] = useState<Note[]>([]);
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  const [tags, setTags] = useState<TagRow[]>([]);
  const [archiveItems, setArchiveItems] = useState<ArchiveItem[]>([]);
  const [activeNoteId, setActiveNoteId] = useState("");
  const [query, setQuery] = useState("");
  const [isDataLoading, setIsDataLoading] = useState(true);
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
  const pendingSaveRef = useRef<PendingNoteSave | null>(null);
  const isClosingRef = useRef(false);
  const appZoom = useAppZoom(showToast);

  const activeNote = notes.find((note) => note.id === activeNoteId) ?? notes[0] ?? null;

  const projectOptions = useMemo(() => {
    const projectNames = new Set<string>(projects.map((project) => project.title));
    notes.forEach((note) => projectNames.add(note.project));
    projectNames.add("Входящие");
    return Array.from(projectNames);
  }, [notes, projects]);

  useEffect(() => {
    let isCancelled = false;

    async function loadInitialWorkspace() {
      try {
        const snapshot = await dataService.loadWorkspace();
        if (isCancelled) {
          return;
        }
        applyWorkspaceSnapshot(snapshot);
      } catch (error) {
        showToast(`Не удалось открыть локальную базу: ${String(error)}`);
      } finally {
        if (!isCancelled) {
          setIsDataLoading(false);
        }
      }
    }

    void loadInitialWorkspace();
    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isDataLoading) {
      return;
    }

    let isCancelled = false;
    const timeoutId = window.setTimeout(() => {
      void dataService
        .listNotes(query)
        .then((loadedNotes) => {
          if (isCancelled) {
            return;
          }
          setNotes(loadedNotes);
          if (loadedNotes.length > 0 && !loadedNotes.some((note) => note.id === activeNoteId)) {
            setActiveNoteId(loadedNotes[0].id);
          }
        })
        .catch((error) => showToast(`Поиск не выполнен: ${String(error)}`));
    }, 180);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [activeNoteId, isDataLoading, query]);

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
    const appWindow = getCurrentWindow();
    let detachCloseListener: (() => void) | undefined;

    void appWindow
      .onCloseRequested(async (event) => {
        if (isClosingRef.current || pendingSaveRef.current === null) {
          return;
        }

        event.preventDefault();
        await flushPendingSave();
        isClosingRef.current = true;
        await appWindow.close();
      })
      .then((unlisten) => {
        detachCloseListener = unlisten;
      })
      .catch(() => {
        detachCloseListener = undefined;
      });

    return () => {
      detachCloseListener?.();
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

  function applyWorkspaceSnapshot(snapshot: dataService.WorkspaceSnapshot) {
    setNotes(snapshot.notes);
    setProjects(snapshot.projects);
    setTags(snapshot.tags);
    setArchiveItems(snapshot.archiveItems);
    setActiveNoteId((currentId) => (snapshot.notes.some((note) => note.id === currentId) ? currentId : snapshot.notes[0]?.id ?? ""));
  }

  function replaceNote(updatedNote: Note) {
    setNotes((currentNotes) => currentNotes.map((note) => (note.id === updatedNote.id ? updatedNote : note)));
  }

  async function refreshSecondaryData() {
    const [loadedProjects, loadedTags, loadedArchiveItems] = await Promise.all([dataService.listProjects(), dataService.listTags(), dataService.listArchive()]);
    setProjects(loadedProjects);
    setTags(loadedTags);
    setArchiveItems(loadedArchiveItems);
  }

  async function flushPendingSave() {
    if (saveTimeoutRef.current !== null) {
      window.clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    const pendingSave = pendingSaveRef.current;
    if (!pendingSave) {
      return;
    }

    pendingSaveRef.current = null;
    setSaveStatus("saving");
    try {
      const savedNote = await dataService.updateNoteContent({
        contentHtml: pendingSave.contentHtml,
        contentMarkdown: pendingSave.contentMarkdown,
        editorDocument: pendingSave.editorDocument,
        id: pendingSave.noteId,
        plainText: pendingSave.plainText,
      });
      replaceNote(savedNote);
      setSaveStatus("saved");
    } catch (error) {
      pendingSaveRef.current = pendingSave;
      setSaveStatus("error");
      showToast(`Ошибка сохранения: ${String(error)}`);
    }
  }

  function updateNoteEditor(noteId: string, editorDocument: EditorDocument, contentHtml: string, contentMarkdown: string, plainText: string, wordCount: number) {
    pendingSaveRef.current = {
      contentHtml,
      contentMarkdown,
      editorDocument,
      noteId,
      plainText,
      wordCount,
    };

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
              updatedAt: new Date().toISOString(),
              wordCount,
            }
          : note,
      ),
    );

    setSaveStatus("saving");
    if (saveTimeoutRef.current !== null) {
      window.clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = window.setTimeout(() => {
      void flushPendingSave();
    }, 850);
  }

  function navigate(section: AppSection) {
    void (async () => {
      await flushPendingSave();
      setActiveSection(section);
      if (section !== "notes") {
        setIsFocusMode(false);
        setIsChatOpen(false);
      }
    })();
  }

  function openNewNoteModal() {
    void (async () => {
      await flushPendingSave();
      setActiveSection("notes");
      setIsFocusMode(false);
      setIsChatOpen(false);
      setIsNewNoteModalOpen(true);
    })();
  }

  async function createNote(title: string, noteDate: string) {
    try {
      await flushPendingSave();
      const newNote = await dataService.createNote(title, noteDate);
      setNotes((currentNotes) => [newNote, ...currentNotes.filter((note) => note.id !== newNote.id)]);
      setActiveNoteId(newNote.id);
      setQuery("");
      setIsNewNoteModalOpen(false);
      await refreshSecondaryData();
      showToast("Заметка создана");
    } catch (error) {
      showToast(`Не удалось создать заметку: ${String(error)}`);
    }
  }

  async function openNote(noteId: string) {
    await flushPendingSave();
    if (!notes.some((note) => note.id === noteId)) {
      try {
        const loadedNotes = await dataService.listNotes("");
        setNotes(loadedNotes);
        if (!loadedNotes.some((note) => note.id === noteId)) {
          showToast("Связанная заметка не найдена");
          return;
        }
      } catch (error) {
        showToast(`Не удалось открыть заметку: ${String(error)}`);
        return;
      }
    }
    setActiveSection("notes");
    setActiveNoteId(noteId);
    setIsFocusMode(false);
  }

  function renameNote(noteId: string, title: string) {
    void dataService
      .renameNote(noteId, title)
      .then((updatedNote) => {
        replaceNote(updatedNote);
        showToast("Название заметки изменено");
      })
      .catch((error) => showToast(`Не удалось переименовать заметку: ${String(error)}`));
  }

  function duplicateNote(noteId: string) {
    void flushPendingSave()
      .then(() => dataService.duplicateNote(noteId))
      .then((duplicatedNote) => {
        setNotes((currentNotes) => [duplicatedNote, ...currentNotes.filter((note) => note.id !== duplicatedNote.id)]);
        setActiveNoteId(duplicatedNote.id);
        showToast("Заметка дублирована");
      })
      .catch((error) => showToast(`Не удалось дублировать заметку: ${String(error)}`));
  }

  function toggleFavoriteNote(noteId: string) {
    void dataService
      .toggleFavoriteNote(noteId)
      .then((updatedNote) => {
        replaceNote(updatedNote);
        showToast("Избранное обновлено");
      })
      .catch((error) => showToast(`Не удалось обновить избранное: ${String(error)}`));
  }

  function moveNote(noteId: string, project: string) {
    void dataService
      .moveNoteToProject(noteId, project)
      .then(async (updatedNote) => {
        replaceNote(updatedNote);
        await refreshSecondaryData();
        showToast(`Заметка перемещена в «${project}»`);
      })
      .catch((error) => showToast(`Не удалось переместить заметку: ${String(error)}`));
  }

  function removeNote(noteId: string, mode: "archive" | "delete") {
    void flushPendingSave()
      .then(() => (mode === "archive" ? dataService.archiveNote(noteId) : dataService.deleteNote(noteId)))
      .then(async () => {
        const loadedNotes = await dataService.listNotes(query);
        setNotes(loadedNotes);
        if (activeNoteId === noteId) {
          setActiveNoteId(loadedNotes[0]?.id ?? "");
        }
        await refreshSecondaryData();
        showToast(mode === "archive" ? "Заметка архивирована" : "Заметка удалена");
      })
      .catch((error) => showToast(`Не удалось обновить заметку: ${String(error)}`));
  }

  function exportNoteMarkdown(noteId: string) {
    void flushPendingSave()
      .then(() => dataService.exportNoteMarkdown(noteId))
      .then((result) => showToast(`${result.message}: ${result.relativePath}`))
      .catch((error) => showToast(`Не удалось экспортировать Markdown: ${String(error)}`));
  }

  function storeAttachment(file: File, kind: "file" | "image") {
    if (!activeNote) {
      return Promise.reject(new Error("Нет активной заметки"));
    }
    return dataService.storeAttachment(activeNote.id, file, kind).then(async (result) => {
      setNotes((currentNotes) =>
        currentNotes.map((note) => (note.id === activeNote.id ? { ...note, attachments: [...note.attachments, result.attachment] } : note)),
      );
      await refreshSecondaryData();
      return result;
    });
  }

  function createProject(title: string, description: string) {
    void dataService
      .createProject(title, description)
      .then((project) => {
        setProjects((currentProjects) => [...currentProjects, project]);
        showToast("Проект создан");
      })
      .catch((error) => showToast(`Не удалось создать проект: ${String(error)}`));
  }

  function createTag() {
    const nextNumber = tags.length + 1;
    void dataService
      .createTag(`новый тег ${nextNumber}`, "blue")
      .then((tag) => {
        setTags((currentTags) => [...currentTags, tag]);
        showToast("Тег создан");
      })
      .catch((error) => showToast(`Не удалось создать тег: ${String(error)}`));
  }

  function renameTag(tagId: string, name: string) {
    void dataService
      .renameTag(tagId, name)
      .then(setTags)
      .then(() => showToast("Тег переименован"))
      .catch((error) => showToast(`Не удалось переименовать тег: ${String(error)}`));
  }

  function updateTagColor(tagId: string, color: TagColor, customColor?: string) {
    void dataService
      .updateTagColor(tagId, color, customColor)
      .then(setTags)
      .then(() => showToast("Цвет тега изменён"))
      .catch((error) => showToast(`Не удалось изменить цвет тега: ${String(error)}`));
  }

  function deleteTag(tagId: string) {
    void dataService
      .deleteTag(tagId)
      .then(setTags)
      .then(() => showToast("Тег удалён"))
      .catch((error) => showToast(`Не удалось удалить тег: ${String(error)}`));
  }

  function mergeTags(sourceTagId: string, targetTagId: string) {
    void dataService
      .mergeTags(sourceTagId, targetTagId)
      .then(setTags)
      .then(() => showToast("Теги объединены"))
      .catch((error) => showToast(`Не удалось объединить теги: ${String(error)}`));
  }

  function openTagNotes(tagName: string) {
    void (async () => {
      await flushPendingSave();
      setActiveSection("notes");
      setQuery(tagName);
      showToast(`Открыты заметки с тегом «${tagName}»`);
    })();
  }

  function openProjectNotes(projectTitle: string) {
    void (async () => {
      await flushPendingSave();
      setActiveSection("notes");
      setQuery(projectTitle);
      showToast(`Открыт проект «${projectTitle}»`);
    })();
  }

  function restoreArchiveItem(item: ArchiveItem) {
    void dataService
      .restoreArchiveItem(item)
      .then(async () => {
        setArchiveItems(await dataService.listArchive());
        setNotes(await dataService.listNotes(query));
        await refreshSecondaryData();
        showToast(item.kind === "Проект" ? "Проект восстановлен" : "Заметка восстановлена");
      })
      .catch((error) => showToast(`Не удалось восстановить элемент: ${String(error)}`));
  }

  function deleteArchiveItem(item: ArchiveItem) {
    void dataService
      .deleteArchiveItem(item)
      .then(async () => {
        setArchiveItems(await dataService.listArchive());
        await refreshSecondaryData();
        showToast(item.kind === "Проект" ? "Проект удалён" : "Заметка удалена окончательно");
      })
      .catch((error) => showToast(`Не удалось удалить элемент: ${String(error)}`));
  }

  function exportCurrentNoteZip() {
    if (!activeNote) {
      showToast("Нет активной заметки для экспорта");
      return;
    }
    void flushPendingSave()
      .then(() => dataService.exportNoteZip(activeNote.id))
      .then((result) => showToast(`${result.message}: ${result.relativePath}`))
      .catch((error) => showToast(`Не удалось экспортировать заметку: ${String(error)}`));
  }

  function exportCurrentProjectZip() {
    if (!activeNote?.projectId) {
      showToast("У текущей заметки нет проекта для экспорта");
      return;
    }
    void flushPendingSave()
      .then(() => dataService.exportProjectZip(activeNote.projectId ?? ""))
      .then((result) => showToast(`${result.message}: ${result.relativePath}`))
      .catch((error) => showToast(`Не удалось экспортировать проект: ${String(error)}`));
  }

  function createBackup() {
    void flushPendingSave()
      .then(() => dataService.createBackup())
      .then((result) => showToast(`${result.message}: ${result.relativePath}`))
      .catch((error) => showToast(`Не удалось создать резервную копию: ${String(error)}`));
  }

  function importBackup(file: File) {
    void dataService
      .importBackup(file)
      .then((snapshot) => {
        applyWorkspaceSnapshot(snapshot);
        showToast("Резервная копия импортирована");
      })
      .catch((error) => showToast(`Не удалось импортировать резервную копию: ${String(error)}`));
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
    return renderAppFrame(
      <ProjectsPage onCreateProject={createProject} onNavigate={navigate} onNewNote={openNewNoteModal} onOpenProject={openProjectNotes} onToast={showToast} projects={projects} />,
    );
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
    return renderAppFrame(
      <TagsPage
        onCreateTag={createTag}
        onDeleteTag={deleteTag}
        onMergeTags={mergeTags}
        onNavigate={navigate}
        onNewNote={openNewNoteModal}
        onOpenTag={openTagNotes}
        onRenameTag={renameTag}
        onToast={showToast}
        onUpdateTagColor={updateTagColor}
        tags={tags}
      />,
    );
  }

  if (activeSection === "archive") {
    return renderAppFrame(
      <ArchivePage
        archiveItems={archiveItems}
        onDeleteItem={deleteArchiveItem}
        onNavigate={navigate}
        onNewNote={openNewNoteModal}
        onRestoreItem={restoreArchiveItem}
        onToast={showToast}
      />,
    );
  }

  if (activeSection === "settings") {
    return renderAppFrame(
      <SettingsPage
        appZoomPercent={appZoom.zoomPercent}
        onNavigate={navigate}
        onNewNote={openNewNoteModal}
        onBackupCreate={createBackup}
        onExportCurrentNote={exportCurrentNoteZip}
        onExportCurrentProject={exportCurrentProjectZip}
        onImportBackup={importBackup}
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
            <NoteListPanel activeNoteId={activeNote?.id ?? ""} notes={notes} onQueryChange={setQuery} onSelectNote={(noteId) => void openNote(noteId)} query={query} />
            <ResizeHandle
              className="resize-list"
              label="Изменить ширину списка заметок"
              onReset={() => setListWidth(376)}
              onResize={(deltaX) => setListWidth((currentWidth) => clamp(currentWidth + deltaX, 260, 560))}
            />
          </>
        ) : null}

        {activeNote ? (
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
            onOpenNote={(noteId) => void openNote(noteId)}
            onOpenSettingsModels={() => {
              setIsFocusMode(false);
              setIsChatOpen(false);
              setActiveSection("settings");
            }}
            onRenameNote={renameNote}
            onStoreAttachment={storeAttachment}
            onToggleFavorite={toggleFavoriteNote}
            onToast={showToast}
            onToggleFocus={toggleFocusMode}
            projectOptions={projectOptions}
            saveStatus={saveStatus}
          />
        ) : (
          <section className="editor-col empty-editor-state">
            <div className="empty-state-card">
              <b>{isDataLoading ? "Открываем локальную базу…" : "Заметок не найдено"}</b>
              <span>{isDataLoading ? "SQLite готовит рабочее пространство NoteFlow." : "Создайте новую заметку или очистите поиск."}</span>
            </div>
          </section>
        )}

        {isChatOpen && !isFocusMode && activeNote ? (
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
