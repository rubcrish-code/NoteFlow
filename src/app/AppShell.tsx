import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { AppSection, ArchiveItem, EditorContentSidecarInput, EditorDocument, Note, ProjectCard, SaveStatus, TagColor, TagRow } from "./types";
import * as dataService from "../services/dataService";
import * as searchService from "../services/searchService";
import type { SearchNoteResult } from "../services/searchService";
import type { SemanticSearchResult } from "../services/embeddingService";
import { ArchivePage } from "../features/archive/ArchivePage";
import { EditorArea } from "../features/editor/EditorArea";
import { MainSidebar } from "../features/navigation/MainSidebar";
import { NewNoteModal } from "../features/notes/NewNoteModal";
import { NoteListPanel, type NoteSearchStatus } from "../features/notes/NoteListPanel";
import { NoteChatPanel } from "../features/note-chat/NoteChatPanel";
import { ProjectsPage } from "../features/projects/ProjectsPage";
import { RagChatPage } from "../features/rag/RagChatPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { TagsPage } from "../features/tags/TagsPage";
import { createNotePreview } from "../features/notes/notePreview";
import { ResizeHandle } from "../shared/ResizeHandle";
import { Toast, type ToastAction } from "../shared/Toast";
import { TooltipPortal } from "../shared/TooltipPortal";
import { useAppZoom } from "../shared/useAppZoom";
import { clearLegacyUiSettings, migrateLegacyUiSettings } from "../services/legacyUiSettingsMigration";
import { DEFAULT_UI_SETTINGS, getUiSettings, normalizeUiSettings, updateUiSettings as persistUiSettings, type UiSettings } from "../services/uiSettingsService";
import { advancePendingSaveVersion, hasNewerPendingSave, shouldRestoreFailedSave } from "./noteAutosaveCoordinator";
import { restoreWorkspaceBackup } from "./backupImportCoordinator";

const closeFlushTimeoutMs = 3500;

type WorkspaceStyle = CSSProperties & {
  "--sbw": string;
  "--listw": string;
  "--chatw": string;
};

type AppZoomStyle = CSSProperties & {
  "--app-zoom": string;
  "--app-viewport-height": string;
  "--app-page-padding-x": string;
  "--app-page-padding-y": string;
  "--app-page-sidebar-max": string;
};

interface PendingNoteSave {
  contentHtml: string;
  contentMarkdown: string;
  contentSidecars: EditorContentSidecarInput[];
  editorDocument: EditorDocument;
  expectedContentVersion: number;
  noteId: string;
  plainText: string;
  sequence: number;
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

function noteSortTimestamp(value: string | undefined) {
  if (!value) {
    return 0;
  }
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function sortNotesForDisplay(notes: Note[]) {
  return [...notes].sort((firstNote, secondNote) => {
    const firstPinned = firstNote.pinned ? 1 : 0;
    const secondPinned = secondNote.pinned ? 1 : 0;
    if (firstPinned !== secondPinned) {
      return secondPinned - firstPinned;
    }

    const firstTimestamp = firstNote.pinned ? noteSortTimestamp(firstNote.pinnedAt ?? firstNote.updatedAt) : noteSortTimestamp(firstNote.updatedAt);
    const secondTimestamp = secondNote.pinned ? noteSortTimestamp(secondNote.pinnedAt ?? secondNote.updatedAt) : noteSortTimestamp(secondNote.updatedAt);
    return secondTimestamp - firstTimestamp;
  });
}

export function AppShell() {
  const [activeSection, setActiveSection] = useState<AppSection>("notes");
  const [notes, setNotes] = useState<Note[]>([]);
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  const [tags, setTags] = useState<TagRow[]>([]);
  const [archiveItems, setArchiveItems] = useState<ArchiveItem[]>([]);
  const [activeNoteId, setActiveNoteId] = useState("");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchNoteResult[]>([]);
  const [semanticOpenTarget, setSemanticOpenTarget] = useState<SemanticSearchResult | null>(null);
  const [searchStatus, setSearchStatus] = useState<NoteSearchStatus>("idle");
  const [includeArchivedSearch, setIncludeArchivedSearch] = useState(false);
  const [searchRevision, setSearchRevision] = useState(0);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [editorSelectionText, setEditorSelectionText] = useState("");
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isNewNoteModalOpen, setIsNewNoteModalOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [editorReloadGeneration, setEditorReloadGeneration] = useState(0);
  const [workspaceReloadGeneration, setWorkspaceReloadGeneration] = useState(0);
  const [toastAction, setToastAction] = useState<ToastAction | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [uiSettings, setUiSettings] = useState<UiSettings>(DEFAULT_UI_SETTINGS);
  const saveTimeoutRef = useRef<number | null>(null);
  const pendingSaveRef = useRef<PendingNoteSave | null>(null);
  const saveInFlightRef = useRef<Promise<void> | null>(null);
  const saveSequenceRef = useRef(0);
  const noteContentVersionsRef = useRef(new Map<string, number>());
  const isClosingRef = useRef(false);
  const settingsHydratedRef = useRef(false);
  const settingsSaveTimeoutRef = useRef<number | null>(null);
  const settingsSaveInFlightRef = useRef<Promise<void> | null>(null);
  const uiSettingsRef = useRef<UiSettings>(DEFAULT_UI_SETTINGS);
  const searchRequestIdRef = useRef(0);
  const openedArchivedNoteIdRef = useRef<string | null>(null);
  const appZoom = useAppZoom({
    onZoomChange: showToast,
    onZoomPercentChange: (appZoomPercent) => updateUiSettings({ appZoomPercent }),
    zoomPercent: uiSettings.appZoomPercent,
  });
  const theme = uiSettings.theme;
  const sidebarWidth = uiSettings.sidebarWidth;
  const listWidth = uiSettings.listWidth;
  const chatWidth = uiSettings.chatWidth;
  const isSidebarCollapsed = uiSettings.sidebarCollapsed;

  const activeNote = notes.find((note) => note.id === activeNoteId) ?? notes[0] ?? null;

  useEffect(() => {
    notes.forEach((note) => noteContentVersionsRef.current.set(note.id, note.contentVersion));
  }, [notes]);

  const projectOptions = useMemo(() => {
    const projectNames = new Set<string>(projects.map((project) => project.title));
    notes.forEach((note) => projectNames.add(note.project));
    projectNames.add("Входящие");
    return Array.from(projectNames);
  }, [notes, projects]);

  useEffect(() => {
    let isCancelled = false;

    async function loadUiSettings() {
      try {
        const storedSettings = await getUiSettings();
        const migration = migrateLegacyUiSettings(storedSettings);
        if (isCancelled) {
          return;
        }

        const nextSettings = normalizeUiSettings(migration.settings);
        settingsHydratedRef.current = true;
        uiSettingsRef.current = nextSettings;
        setUiSettings(nextSettings);
        setActiveSection(nextSettings.lastSection);

        if (migration.migrated) {
          await persistUiSettings(nextSettings);
          clearLegacyUiSettings();
        }
      } catch (error) {
        if (!isCancelled) {
          settingsHydratedRef.current = true;
          showToast(`Не удалось открыть настройки интерфейса: ${String(error)}`);
        }
      }
    }

    void loadUiSettings();
    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    uiSettingsRef.current = uiSettings;
    if (!settingsHydratedRef.current) {
      return;
    }

    scheduleUiSettingsSave(uiSettings);
  }, [uiSettings]);

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

    const trimmedQuery = query.trim();
    const requestId = searchRequestIdRef.current + 1;
    searchRequestIdRef.current = requestId;
    if (!trimmedQuery) {
      setSearchResults([]);
      setSearchStatus("idle");
      if (openedArchivedNoteIdRef.current) {
        openedArchivedNoteIdRef.current = null;
        void dataService
          .listNotes("")
          .then((loadedNotes) => {
            setNotes(loadedNotes);
            setActiveNoteId((currentId) => (loadedNotes.some((note) => note.id === currentId) ? currentId : loadedNotes[0]?.id ?? ""));
          })
          .catch(() => setSearchStatus("error"));
      }
      return;
    }

    setSearchResults([]);
    setSearchStatus("searching");
    const timeoutId = window.setTimeout(() => {
      void searchService
        .searchNotes({ includeArchived: includeArchivedSearch, query: trimmedQuery })
        .then((results) => {
          if (searchRequestIdRef.current !== requestId) {
            return;
          }
          setSearchResults(results);
          setSearchStatus(results.length > 0 ? "results" : "empty");
        })
        .catch(() => {
          if (searchRequestIdRef.current === requestId) {
            setSearchResults([]);
            setSearchStatus("error");
          }
        });
    }, 180);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [includeArchivedSearch, isDataLoading, query, searchRevision]);

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

    const timeoutId = window.setTimeout(
      () => {
        setToastMessage(null);
        setToastAction(null);
      },
      toastAction ? 6500 : 1900,
    );
    return () => window.clearTimeout(timeoutId);
  }, [toastAction, toastMessage]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
      }
      if (settingsSaveTimeoutRef.current !== null) {
        window.clearTimeout(settingsSaveTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let appWindow: ReturnType<typeof getCurrentWindow>;
    try {
      appWindow = getCurrentWindow();
    } catch {
      return undefined;
    }

    let detachCloseListener: (() => void) | undefined;

    void appWindow
      .onCloseRequested(async (event) => {
        if (isClosingRef.current) {
          return;
        }

        event.preventDefault();
        void closeWindowAfterSafeFlush(appWindow);
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
        activateSection("notes");
        window.setTimeout(() => document.getElementById("note-search")?.focus(), 0);
      }

      if ((key === "b" || key === "и") && !isTextInputTarget(event.target)) {
        event.preventDefault();
        updateUiSettings((currentSettings) => ({
          sidebarCollapsed: !currentSettings.sidebarCollapsed,
        }));
      }

      if (event.key === "\\") {
        event.preventDefault();
        toggleFocusMode();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isChatOpen, isFocusMode, isNewNoteModalOpen]);

  function showToast(message: string, action?: ToastAction | null) {
    setToastMessage(message);
    setToastAction(action ?? null);
  }

  function updateUiSettings(patch: Partial<UiSettings> | ((currentSettings: UiSettings) => Partial<UiSettings>)) {
    setUiSettings((currentSettings) => {
      const nextPatch = typeof patch === "function" ? patch(currentSettings) : patch;
      const nextSettings = normalizeUiSettings({
        ...currentSettings,
        ...nextPatch,
      });
      uiSettingsRef.current = nextSettings;
      return nextSettings;
    });
  }

  function activateSection(section: AppSection) {
    setActiveSection(section);
    updateUiSettings({ lastSection: section });
  }

  function scheduleUiSettingsSave(settings: UiSettings) {
    if (settingsSaveTimeoutRef.current !== null) {
      window.clearTimeout(settingsSaveTimeoutRef.current);
    }

    settingsSaveTimeoutRef.current = window.setTimeout(() => {
      settingsSaveTimeoutRef.current = null;
      void saveUiSettingsNow(settings);
    }, 250);
  }

  async function saveUiSettingsNow(settings: UiSettings) {
    const normalizedSettings = normalizeUiSettings(settings);
    const savePromise = persistUiSettings(normalizedSettings)
      .then((savedSettings) => {
        uiSettingsRef.current = savedSettings;
      })
      .catch((error) => {
        showToast(`Не удалось сохранить настройки интерфейса: ${String(error)}`);
      })
      .finally(() => {
        if (settingsSaveInFlightRef.current === savePromise) {
          settingsSaveInFlightRef.current = null;
        }
      });

    settingsSaveInFlightRef.current = savePromise;
    await savePromise;
  }

  async function flushUiSettings() {
    if (!settingsHydratedRef.current) {
      return;
    }

    if (settingsSaveTimeoutRef.current !== null) {
      window.clearTimeout(settingsSaveTimeoutRef.current);
      settingsSaveTimeoutRef.current = null;
    }

    if (settingsSaveInFlightRef.current) {
      await settingsSaveInFlightRef.current;
    }

    await saveUiSettingsNow(uiSettingsRef.current);
  }

  function applyWorkspaceSnapshot(snapshot: dataService.WorkspaceSnapshot, reloadActiveEditor = false) {
    if (reloadActiveEditor) {
      setEditorReloadGeneration((generation) => generation + 1);
    }
    noteContentVersionsRef.current = new Map(snapshot.notes.map((note) => [note.id, note.contentVersion]));
    setNotes(snapshot.notes);
    setProjects(snapshot.projects);
    setTags(snapshot.tags);
    setArchiveItems(snapshot.archiveItems);
    setActiveNoteId((currentId) => (snapshot.notes.some((note) => note.id === currentId) ? currentId : snapshot.notes[0]?.id ?? ""));
    setSearchRevision((revision) => revision + 1);
  }

  function replaceNote(updatedNote: Note) {
    noteContentVersionsRef.current.set(updatedNote.id, updatedNote.contentVersion);
    setNotes((currentNotes) => sortNotesForDisplay(currentNotes.map((note) => (note.id === updatedNote.id ? updatedNote : note))));
    setSearchRevision((revision) => revision + 1);
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

    if (saveInFlightRef.current) {
      await saveInFlightRef.current;
    }

    const pendingSave = pendingSaveRef.current;
    if (!pendingSave) {
      return;
    }

    pendingSaveRef.current = null;
    setSaveStatus("saving");
    let savePromise: Promise<void>;
    savePromise = dataService
      .updateNoteContent({
        contentHtml: pendingSave.contentHtml,
        contentMarkdown: pendingSave.contentMarkdown,
        contentSidecars: pendingSave.contentSidecars,
        editorDocument: pendingSave.editorDocument,
        expectedContentVersion: pendingSave.expectedContentVersion,
        id: pendingSave.noteId,
        plainText: pendingSave.plainText,
      })
      .then((savedNote) => {
        const hasNewerSave = hasNewerPendingSave(
          pendingSaveRef.current,
          pendingSave.noteId,
          pendingSave.sequence,
        );
        pendingSaveRef.current = advancePendingSaveVersion(
          pendingSaveRef.current,
          pendingSave.noteId,
          pendingSave.sequence,
          savedNote.contentVersion,
        );
        noteContentVersionsRef.current.set(savedNote.id, savedNote.contentVersion);
        if (hasNewerSave) {
          setNotes((currentNotes) =>
            currentNotes.map((note) =>
              note.id === savedNote.id
                ? { ...note, contentVersion: savedNote.contentVersion }
                : note,
            ),
          );
          setSearchRevision((revision) => revision + 1);
          setSaveStatus("saving");
        } else {
          replaceNote(savedNote);
          setSaveStatus("saved");
        }
      })
      .catch(async (error) => {
        if (error instanceof dataService.NotePersistenceError && error.code === "stale_write") {
          pendingSaveRef.current = null;
          setSaveStatus("error");
          try {
            replaceNote(await dataService.getNote(pendingSave.noteId));
          } catch {
            // The persistence error is already safe and actionable for the user.
          }
          showToast(error.message);
          return;
        }
        if (shouldRestoreFailedSave(pendingSaveRef.current, pendingSave)) {
          pendingSaveRef.current = pendingSave;
        }
        setSaveStatus("error");
        showToast(error instanceof dataService.NotePersistenceError ? error.message : "Не удалось сохранить заметку");
      })
      .finally(() => {
        if (saveInFlightRef.current === savePromise) {
          saveInFlightRef.current = null;
        }
      });
    saveInFlightRef.current = savePromise;
    await savePromise;
  }

  async function closeWindowAfterSafeFlush(appWindow: ReturnType<typeof getCurrentWindow>) {
    if (isClosingRef.current) {
      return;
    }

    isClosingRef.current = true;
    const flushResult = await waitForCloseFlush();
    if (flushResult === "timeout") {
      setSaveStatus("error");
    }

    requestNativeAppQuit(appWindow);
  }

  function requestNativeAppQuit(appWindow: ReturnType<typeof getCurrentWindow>) {
    const fallbackTimeoutId = window.setTimeout(() => closeWindowFallback(appWindow), 1200);
    void dataService.quitApp().catch(() => {
      window.clearTimeout(fallbackTimeoutId);
      closeWindowFallback(appWindow);
    });
  }

  function closeWindowFallback(appWindow: ReturnType<typeof getCurrentWindow>) {
    void appWindow.destroy().catch(() => {
      void appWindow.close().catch(() => undefined);
    });
  }

  function waitForCloseFlush(): Promise<"completed" | "timeout"> {
    return new Promise((resolve) => {
      const timeoutId = window.setTimeout(() => resolve("timeout"), closeFlushTimeoutMs);
      void Promise.all([flushPendingSave(), flushUiSettings()]).then(
        () => {
          window.clearTimeout(timeoutId);
          resolve("completed");
        },
        () => {
          window.clearTimeout(timeoutId);
          resolve("completed");
        },
      );
    });
  }

  function updateNoteEditor(
    noteId: string,
    editorDocument: EditorDocument,
    contentHtml: string,
    contentMarkdown: string,
    plainText: string,
    wordCount: number,
    contentSidecars: EditorContentSidecarInput[],
  ) {
    const currentNote = notes.find((note) => note.id === noteId);
    const shouldPreserveFallbackContent = Boolean(
      currentNote?.editorLoadFallbackReason && !contentMarkdown.trim() && !plainText.trim() && currentNote.contentMarkdown.trim(),
    );
    const safeContentHtml = shouldPreserveFallbackContent && currentNote ? currentNote.contentHtml : contentHtml;
    const safeContentMarkdown = shouldPreserveFallbackContent && currentNote ? currentNote.contentMarkdown : contentMarkdown;
    const safeEditorDocument = shouldPreserveFallbackContent && currentNote ? currentNote.editorDocument : editorDocument;
    const safePlainText = shouldPreserveFallbackContent && currentNote ? currentNote.plainText : plainText;
    const safeWordCount = shouldPreserveFallbackContent && currentNote ? currentNote.wordCount : wordCount;
    const sequence = saveSequenceRef.current + 1;
    saveSequenceRef.current = sequence;
    pendingSaveRef.current = {
      contentHtml: safeContentHtml,
      contentMarkdown: safeContentMarkdown,
      contentSidecars,
      editorDocument: safeEditorDocument,
      expectedContentVersion: noteContentVersionsRef.current.get(noteId) ?? currentNote?.contentVersion ?? 0,
      noteId,
      plainText: safePlainText,
      sequence,
      wordCount: safeWordCount,
    };

    setNotes((currentNotes) =>
      currentNotes.map((note) =>
        note.id === noteId
          ? {
              ...note,
              contentHtml: safeContentHtml,
              contentMarkdown: safeContentMarkdown,
              contentSidecars: mergeRuntimeSidecars(note.contentSidecars, contentSidecars),
              editorDocument: safeEditorDocument,
              editorLoadFallbackReason: undefined,
              editorLoadSource: "markdown",
              isNew: false,
              plainText: safePlainText,
              summary: createNotePreview(safePlainText),
              updatedAt: new Date().toISOString(),
              wordCount: safeWordCount,
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

  function mergeRuntimeSidecars(currentSidecars: Note["contentSidecars"], nextSidecars: EditorContentSidecarInput[]): Note["contentSidecars"] {
    const now = new Date().toISOString();
    const nextSidecarMap = new Map(nextSidecars.map((sidecar) => [sidecar.kind, sidecar]));
    const preservedSidecars = currentSidecars.filter((sidecar) => !nextSidecarMap.has(sidecar.kind));
    return [
      ...preservedSidecars,
      ...nextSidecars.map((sidecar) => {
        const currentSidecar = currentSidecars.find((item) => item.kind === sidecar.kind);
        return {
          createdAt: currentSidecar?.createdAt ?? now,
          kind: sidecar.kind,
          payloadJson: sidecar.payloadJson,
          schemaVersion: sidecar.schemaVersion,
          updatedAt: now,
        };
      }),
    ];
  }

  function navigate(section: AppSection) {
    void (async () => {
      await flushPendingSave();
      activateSection(section);
      if (section !== "notes") {
        setIsFocusMode(false);
        setIsChatOpen(false);
      }
    })();
  }

  function openNewNoteModal() {
    void (async () => {
      await flushPendingSave();
      activateSection("notes");
      setIsFocusMode(false);
      setIsChatOpen(false);
      setIsNewNoteModalOpen(true);
    })();
  }

  async function createNote(title: string, noteDate: string) {
    try {
      await flushPendingSave();
      const newNote = await dataService.createNote(title, noteDate);
      setNotes((currentNotes) => sortNotesForDisplay([newNote, ...currentNotes.filter((note) => note.id !== newNote.id)]));
      setActiveNoteId(newNote.id);
      setQuery("");
      setIsNewNoteModalOpen(false);
      await refreshSecondaryData();
      showToast("Заметка создана");
    } catch (error) {
      showToast(`Не удалось создать заметку: ${String(error)}`);
    }
  }

  async function openNote(noteId: string, archivedHint?: boolean) {
    await flushPendingSave();
    const archivedResult = archivedHint ?? searchResults.find((result) => result.noteId === noteId)?.archived;
    openedArchivedNoteIdRef.current = archivedResult ? noteId : null;
    if (!notes.some((note) => note.id === noteId)) {
      try {
        const loadedNote = await dataService.getNote(noteId);
        setNotes((currentNotes) => sortNotesForDisplay([loadedNote, ...currentNotes.filter((note) => note.id !== noteId)]));
      } catch (error) {
        showToast(`Не удалось открыть заметку: ${String(error)}`);
        return;
      }
    }
    activateSection("notes");
    setActiveNoteId(noteId);
    setIsFocusMode(false);
  }

  async function openSemanticResult(result: SemanticSearchResult) {
    setQuery("");
    await openNote(result.noteId, result.archived);
    setSemanticOpenTarget(result);
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
        setNotes((currentNotes) => sortNotesForDisplay([duplicatedNote, ...currentNotes.filter((note) => note.id !== duplicatedNote.id)]));
        setActiveNoteId(duplicatedNote.id);
        setSearchRevision((revision) => revision + 1);
        showToast("Заметка дублирована");
      })
      .catch((error) => showToast(`Не удалось дублировать заметку: ${String(error)}`));
  }

  function toggleNotePin(noteId: string) {
    void dataService
      .toggleNotePin(noteId)
      .then((updatedNote) => {
        replaceNote(updatedNote);
        showToast(updatedNote.pinned ? "Заметка закреплена" : "Заметка откреплена");
      })
      .catch((error) => showToast(`Не удалось обновить закрепление: ${String(error)}`));
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
        const loadedNotes = await dataService.listNotes("");
        setNotes(loadedNotes);
        if (activeNoteId === noteId) {
          setActiveNoteId(loadedNotes[0]?.id ?? "");
        }
        await refreshSecondaryData();
        setSearchRevision((revision) => revision + 1);
        showToast(mode === "archive" ? "Заметка архивирована" : "Заметка удалена");
      })
      .catch((error) => showToast(`Не удалось обновить заметку: ${String(error)}`));
  }

  function exportNoteMarkdown(noteId: string) {
    void flushPendingSave()
      .then(() => dataService.exportNoteMarkdown(noteId))
      .then((result) =>
        showToast(`Markdown экспортирован: ${result.path}`, {
          label: "Показать в проводнике",
          onClick: () => {
            void dataService
              .revealExportedItem(result.path)
              .then(() => showToast(`Открыт экспорт: ${result.relativePath}`))
              .catch((error) => showToast(`Не удалось открыть папку экспорта: ${String(error)}`));
          },
        }),
      )
      .catch((error) => showToast(`Не удалось экспортировать Markdown: ${String(error)}`));
  }

  function storeAttachment(file: File, kind: "file" | "image", options: dataService.StoreAttachmentOptions = {}) {
    if (!activeNote) {
      return Promise.reject(new Error("Нет активной заметки"));
    }
    return dataService.storeAttachment(activeNote.id, file, kind, options).then(async (result) => {
      setNotes((currentNotes) =>
        currentNotes.map((note) => (note.id === activeNote.id ? { ...note, attachments: [...note.attachments, result.attachment] } : note)),
      );
      await refreshSecondaryData();
      return result;
    });
  }

  function pickAndStoreAttachment(kind: "file" | "image") {
    if (!activeNote) {
      return Promise.reject(new Error("Нет активной заметки"));
    }
    return dataService.pickAndStoreAttachment(activeNote.id, kind).then(async (result) => {
      if (!result) {
        return null;
      }
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
      .then((nextTags) => {
        setTags(nextTags);
        setSearchRevision((revision) => revision + 1);
      })
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
      .then((nextTags) => {
        setTags(nextTags);
        setSearchRevision((revision) => revision + 1);
      })
      .then(() => showToast("Тег удалён"))
      .catch((error) => showToast(`Не удалось удалить тег: ${String(error)}`));
  }

  function mergeTags(sourceTagId: string, targetTagId: string) {
    void dataService
      .mergeTags(sourceTagId, targetTagId)
      .then((nextTags) => {
        setTags(nextTags);
        setSearchRevision((revision) => revision + 1);
      })
      .then(() => showToast("Теги объединены"))
      .catch((error) => showToast(`Не удалось объединить теги: ${String(error)}`));
  }

  function openTagNotes(tagName: string) {
    void (async () => {
      await flushPendingSave();
      activateSection("notes");
      setQuery(tagName);
      showToast(`Открыты заметки с тегом «${tagName}»`);
    })();
  }

  function openProjectNotes(projectTitle: string) {
    void (async () => {
      await flushPendingSave();
      activateSection("notes");
      setQuery(projectTitle);
      showToast(`Открыт проект «${projectTitle}»`);
    })();
  }

  function restoreArchiveItem(item: ArchiveItem) {
    void dataService
      .restoreArchiveItem(item)
      .then(async () => {
        setArchiveItems(await dataService.listArchive());
        setNotes(await dataService.listNotes(""));
        setSearchRevision((revision) => revision + 1);
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

  function previewBackup(file: File) {
    return dataService.previewBackup(file);
  }

  async function importBackup(file: File) {
    const result = await restoreWorkspaceBackup<dataService.WorkspaceSnapshot, dataService.ImportBackupResult>({
      applyWorkspace: (workspace) => applyWorkspaceSnapshot(workspace, true),
      file,
      flushPendingSave,
      importBackup: dataService.importBackup,
      invalidatePendingSaves: () => {
        pendingSaveRef.current = null;
        saveSequenceRef.current += 1;
      },
      refreshExternalViews: () => setWorkspaceReloadGeneration((generation) => generation + 1),
    });
    showToast("Резервная копия восстановлена");
    return result;
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
      toastAction={toastAction}
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
        dataReloadGeneration={workspaceReloadGeneration}
        onNavigate={navigate}
        onNewNote={openNewNoteModal}
        onOpenModelSettings={() => {
          navigate("settings");
          window.setTimeout(() => {
            document.getElementById("semantic-search-settings")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 80);
        }}
        onOpenSemanticResult={(result) => void openSemanticResult(result)}
        onRagConversationReset={() => updateUiSettings({ ragConversationWidth: 280 })}
        onRagConversationResize={(deltaX) =>
          updateUiSettings((currentSettings) => ({
            ragConversationWidth: clamp(currentSettings.ragConversationWidth + deltaX, 220, 380),
          }))
        }
        onRagSourcesCollapsedChange={(ragSourcesCollapsed) => updateUiSettings({ ragSourcesCollapsed })}
        onRagSourcesReset={() => updateUiSettings({ ragSourcesWidth: 320 })}
        onRagSourcesResize={(deltaX) =>
          updateUiSettings((currentSettings) => ({
            ragSourcesWidth: clamp(currentSettings.ragSourcesWidth - deltaX, 260, 460),
          }))
        }
        onSidebarReset={() => updateUiSettings({ sidebarWidth: 250 })}
        onSidebarResize={(deltaX) =>
          updateUiSettings((currentSettings) => ({
            sidebarWidth: clamp(currentSettings.sidebarWidth + deltaX, 190, 360),
          }))
        }
        onToggleSidebarCollapse={() =>
          updateUiSettings((currentSettings) => ({
            sidebarCollapsed: !currentSettings.sidebarCollapsed,
          }))
        }
        onToast={showToast}
        ragConversationWidth={uiSettings.ragConversationWidth}
        ragSourcesCollapsed={uiSettings.ragSourcesCollapsed}
        ragSourcesWidth={uiSettings.ragSourcesWidth}
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
        onBackupPreview={previewBackup}
        onExportCurrentNote={exportCurrentNoteZip}
        onExportCurrentProject={exportCurrentProjectZip}
        onImportBackup={importBackup}
        language={uiSettings.language}
        onLanguageChange={(language) => updateUiSettings({ language })}
        onThemeChange={(nextTheme) => updateUiSettings({ theme: nextTheme })}
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
              onToggleCollapse={() =>
                updateUiSettings((currentSettings) => ({
                  sidebarCollapsed: !currentSettings.sidebarCollapsed,
                }))
              }
            />
            {!isSidebarCollapsed ? (
              <ResizeHandle
                className="resize-sb"
                label="Изменить ширину сайдбара"
                onReset={() => updateUiSettings({ sidebarWidth: 250 })}
                onResize={(deltaX) =>
                  updateUiSettings((currentSettings) => ({
                    sidebarWidth: clamp(currentSettings.sidebarWidth + deltaX, 190, 360),
                  }))
                }
              />
            ) : null}
            <NoteListPanel
              activeNoteId={activeNote?.id ?? ""}
              includeArchivedSearch={includeArchivedSearch}
              notes={notes}
              onQueryChange={setQuery}
              onSelectNote={(noteId) => void openNote(noteId)}
              onToggleArchivedSearch={() => setIncludeArchivedSearch((includeArchived) => !includeArchived)}
              onTogglePin={toggleNotePin}
              projects={projects}
              query={query}
              searchResults={searchResults}
              searchStatus={searchStatus}
            />
            <ResizeHandle
              className="resize-list"
              label="Изменить ширину списка заметок"
              onReset={() => updateUiSettings({ listWidth: 376 })}
              onResize={(deltaX) =>
                updateUiSettings((currentSettings) => ({
                  listWidth: clamp(currentSettings.listWidth + deltaX, 260, 560),
                }))
              }
            />
          </>
        ) : null}

        {activeNote ? (
          <EditorArea
            documentReloadGeneration={editorReloadGeneration}
            isFocusMode={isFocusMode}
            note={activeNote}
            semanticOpenTarget={semanticOpenTarget}
            onArchiveNote={(noteId) => removeNote(noteId, "archive")}
            onDeleteNote={(noteId) => removeNote(noteId, "delete")}
            onDuplicateNote={duplicateNote}
            onEditorChange={updateNoteEditor}
            editorContentOffset={uiSettings.editorContentOffset}
            editorContentWidth={uiSettings.editorContentWidth}
            onExitFocus={() => setIsFocusMode(false)}
            onExportMarkdown={exportNoteMarkdown}
            onEditorPageLayoutChange={(layout) => updateUiSettings(layout)}
            onEditorPageLayoutReset={() =>
              updateUiSettings({
                editorContentOffset: DEFAULT_UI_SETTINGS.editorContentOffset,
                editorContentWidth: DEFAULT_UI_SETTINGS.editorContentWidth,
              })
            }
            onMoveNote={moveNote}
            onOpenChat={() => setIsChatOpen(true)}
            onOpenAttachment={dataService.openAttachment}
            onOpenNote={(noteId) => void openNote(noteId)}
            onOpenSettingsModels={() => {
              setIsFocusMode(false);
              setIsChatOpen(false);
              activateSection("settings");
            }}
            onPickAndStoreAttachment={pickAndStoreAttachment}
            onRenameNote={renameNote}
            onRevealAttachment={dataService.revealAttachment}
            onSelectionTextChange={setEditorSelectionText}
            onStoreAttachment={storeAttachment}
            onTogglePin={toggleNotePin}
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
            onOpenAiSettings={() => {
              setIsChatOpen(false);
              activateSection("settings");
            }}
            onResetWidth={() => updateUiSettings({ chatWidth: 380 })}
            onResize={(deltaX) =>
              updateUiSettings((currentSettings) => ({
                chatWidth: clamp(currentSettings.chatWidth + deltaX, 300, 620),
              }))
            }
            selectedText={editorSelectionText}
            onToast={showToast}
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
  const zoomFactor = zoomPercent / 100;
  const zoomStyle: AppZoomStyle = {
    "--app-zoom": String(zoomFactor),
    "--app-viewport-height": `${100 / zoomFactor}vh`,
    "--app-page-padding-x": `${36 / zoomFactor}px`,
    "--app-page-padding-y": `${28 / zoomFactor}px`,
    "--app-page-sidebar-max": zoomPercent > 100 ? `${250 / zoomFactor}px` : "10000px",
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
  toastAction: ToastAction | null;
  toastMessage: string | null;
  onCloseNewNote: () => void;
  onCreateNote: (title: string, noteDate: string) => void;
}

function SharedOverlays({ isNewNoteModalOpen, toastAction, toastMessage, onCloseNewNote, onCreateNote }: SharedOverlaysProps) {
  return (
    <>
      <NewNoteModal isOpen={isNewNoteModalOpen} onClose={onCloseNewNote} onCreate={onCreateNote} />
      <Toast action={toastAction} message={toastMessage} />
      <TooltipPortal />
    </>
  );
}
