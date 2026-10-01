import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { AppSection, ArchiveItem, EditorContentSidecarInput, EditorDocument, Note, ProjectCard, SaveStatus, TagRow } from "./types";
import * as dataService from "../services/dataService";
import * as searchService from "../services/searchService";
import type { SearchNoteResult } from "../services/searchService";
import type { SemanticSearchResult } from "../services/embeddingService";
import { EditorArea } from "../features/editor/EditorArea";
import { MainSidebar } from "../features/navigation/MainSidebar";
import type { PageShellSidebarProps } from "../features/navigation/PageShell";
import { NewNoteModal } from "../features/notes/NewNoteModal";
import { FirstRunModal } from "../features/notes/FirstRunModal";
import { NoteListPanel, type NoteSearchStatus } from "../features/notes/NoteListPanel";
import { NoteChatPanel } from "../features/note-chat/NoteChatPanel";
import type { TagEditorValue } from "../features/tags/TagEditorModal";
import { mergeTagInNotes, removeTagFromNotes, replaceTagInNotes } from "../features/tags/tagState";
import { createNotePreview } from "../features/notes/notePreview";
import { ResizeHandle } from "../shared/ResizeHandle";
import { Toast, type ToastAction } from "../shared/Toast";
import { TooltipPortal } from "../shared/TooltipPortal";
import { AppZoomProvider } from "../shared/AppZoomContext";
import { LocalProfileModal } from "../shared/LocalProfileModal";
import { matchesAppShortcut } from "../shared/appShortcuts";
import { useAppZoom } from "../shared/useAppZoom";
import { shouldTemporarilyHideNoteList } from "../shared/physicalLayout";
import { usePhysicalViewportWidth } from "../shared/usePhysicalViewportWidth";
import { clearLegacyUiSettings, migrateLegacyUiSettings } from "../services/legacyUiSettingsMigration";
import { DEFAULT_UI_SETTINGS, getUiSettings, normalizeUiSettings, updateUiSettings as persistUiSettings, type UiSettings } from "../services/uiSettingsService";
import { PendingNoteSaves } from "./noteAutosaveCoordinator";
import { interceptCloseRequest, waitForCloseFlush } from "./closeFlush";
import { restoreWorkspaceBackup } from "./backupImportCoordinator";
import { LazyArchivePage, LazyProjectsPage, LazyRagChatPage, LazySettingsPage, LazyTagsPage } from "./lazyFeatures";
import { PageShell } from "../features/navigation/PageShell";
import { FeatureLoadState, LazyFeatureBoundary } from "../shared/LazyFeatureBoundary";

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
  const [settingsTarget, setSettingsTarget] = useState<"semantic-search" | undefined>();
  const [notes, setNotes] = useState<Note[]>([]);
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  const [tags, setTags] = useState<TagRow[]>([]);
  const [archiveItems, setArchiveItems] = useState<ArchiveItem[]>([]);
  const [activeNoteId, setActiveNoteId] = useState("");
  const [query, setQuery] = useState("");
  const [projectScope, setProjectScope] = useState<{ id: string; title: string } | null>(null);
  const [searchResults, setSearchResults] = useState<SearchNoteResult[]>([]);
  const [semanticOpenTarget, setSemanticOpenTarget] = useState<SemanticSearchResult | null>(null);
  const [searchStatus, setSearchStatus] = useState<NoteSearchStatus>("idle");
  const [includeArchivedSearch, setIncludeArchivedSearch] = useState(false);
  const [searchRevision, setSearchRevision] = useState(0);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [isSettingsLoading, setIsSettingsLoading] = useState(true);
  const [firstRunRequired, setFirstRunRequired] = useState(false);
  const [firstRunDismissed, setFirstRunDismissed] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [editorSelectionText, setEditorSelectionText] = useState("");
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isNewNoteModalOpen, setIsNewNoteModalOpen] = useState(false);
  const [isProfileNameModalOpen, setIsProfileNameModalOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [editorReloadGeneration, setEditorReloadGeneration] = useState(0);
  const [workspaceReloadGeneration, setWorkspaceReloadGeneration] = useState(0);
  const [toastAction, setToastAction] = useState<ToastAction | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [uiSettings, setUiSettings] = useState<UiSettings>(DEFAULT_UI_SETTINGS);
  const saveTimeoutRef = useRef<number | null>(null);
  const pendingSavesRef = useRef(new PendingNoteSaves<PendingNoteSave>());
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
  const physicalViewportWidth = usePhysicalViewportWidth(appZoom.zoomPercent);
  const hideNoteListForChat = shouldTemporarilyHideNoteList({
    chatOpen: isChatOpen,
    chatWidth,
    listWidth,
    physicalWidth: physicalViewportWidth,
    sidebarCollapsed: isSidebarCollapsed,
    sidebarWidth,
  });

  const scopedNotes = projectScope ? notes.filter((note) => note.projectId === projectScope.id) : notes;
  const activeNote = scopedNotes.find((note) => note.id === activeNoteId) ?? scopedNotes[0] ?? null;

  useEffect(() => {
    notes.forEach((note) => noteContentVersionsRef.current.set(note.id, note.contentVersion));
  }, [notes]);

  const projectOptions = useMemo(() => {
    return projects.filter((project) => !project.archivedAt).map((project) => project.title);
  }, [projects]);

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
      } finally {
        if (!isCancelled) setIsSettingsLoading(false);
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
        const [snapshot, firstRun] = await Promise.all([dataService.loadWorkspace(), dataService.getFirstRunState()]);
        if (isCancelled) {
          return;
        }
        applyWorkspaceSnapshot(snapshot);
        setFirstRunRequired(firstRun.required);
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
        .searchNotes({ includeArchived: includeArchivedSearch, projectId: projectScope?.id, query: trimmedQuery })
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
  }, [includeArchivedSearch, isDataLoading, projectScope?.id, query, searchRevision]);

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
        interceptCloseRequest(event, isClosingRef.current, () => {
          void closeWindowAfterSafeFlush(appWindow);
        });
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

      if (matchesAppShortcut(event, "newNote")) {
        event.preventDefault();
        openNewNoteModal();
      }

      if (matchesAppShortcut(event, "search")) {
        event.preventDefault();
        activateSection("notes");
        window.setTimeout(() => document.getElementById("note-search")?.focus(), 0);
      }

      if (matchesAppShortcut(event, "sidebar") && !isTextInputTarget(event.target)) {
        event.preventDefault();
        updateUiSettings((currentSettings) => ({
          sidebarCollapsed: !currentSettings.sidebarCollapsed,
        }));
      }

      if (matchesAppShortcut(event, "focus")) {
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

    const pendingSaves = pendingSavesRef.current;
    if (!pendingSaves.hasPending()) {
      return;
    }

    setSaveStatus("saving");
    await pendingSaves.flush(
      async (pendingSave) => {
        try {
          const savedNote = await dataService.updateNoteContent({
            contentHtml: pendingSave.contentHtml,
            contentMarkdown: pendingSave.contentMarkdown,
            contentSidecars: pendingSave.contentSidecars,
            editorDocument: pendingSave.editorDocument,
            expectedContentVersion: pendingSave.expectedContentVersion,
            id: pendingSave.noteId,
            plainText: pendingSave.plainText,
          });
          return savedNote;
        } catch (error) {
          setSaveStatus("error");
          showToast(
            error instanceof dataService.NotePersistenceError ? error.message : "Не удалось сохранить заметку",
            { label: "Повторить", onClick: () => { void flushPendingSave().catch(() => undefined); } },
          );
          throw error;
        }
      },
      (_pendingSave, savedNote, hasNewerSave) => {
        noteContentVersionsRef.current.set(savedNote.id, savedNote.contentVersion);
        if (hasNewerSave) {
          setNotes((currentNotes) => currentNotes.map((note) =>
            note.id === savedNote.id ? { ...note, contentVersion: savedNote.contentVersion } : note,
          ));
          setSearchRevision((revision) => revision + 1);
          setSaveStatus("saving");
        } else {
          replaceNote(savedNote);
          setSaveStatus("saved");
        }
      },
    );
  }

  async function tryFlushPendingSave() {
    try {
      await flushPendingSave();
      return true;
    } catch {
      return false;
    }
  }

  async function closeWindowAfterSafeFlush(appWindow: ReturnType<typeof getCurrentWindow>) {
    if (isClosingRef.current) {
      return;
    }

    isClosingRef.current = true;
    const flushResult = await waitForCloseFlush(async () => {
      await Promise.all([flushPendingSave(), flushUiSettings()]);
    }, closeFlushTimeoutMs);
    if (flushResult !== "completed") {
      setSaveStatus("error");
      showToast(
        flushResult === "timeout"
          ? "Сохранение не завершилось. Окно оставлено открытым, чтобы не потерять изменения"
          : "Не удалось сохранить заметку. Окно оставлено открытым, чтобы не потерять изменения",
        { label: "Повторить", onClick: () => { void flushPendingSave().catch(() => undefined); } },
      );
      isClosingRef.current = false;
      return;
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
    pendingSavesRef.current.enqueue({
      contentHtml: safeContentHtml,
      contentMarkdown: safeContentMarkdown,
      contentSidecars,
      editorDocument: safeEditorDocument,
      expectedContentVersion: noteContentVersionsRef.current.get(noteId) ?? currentNote?.contentVersion ?? 0,
      noteId,
      plainText: safePlainText,
      sequence,
      wordCount: safeWordCount,
    });

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
      void flushPendingSave().catch(() => undefined);
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

  function navigate(section: AppSection, target?: "semantic-search") {
    void (async () => {
      if (!await tryFlushPendingSave()) return;
      if (target === "semantic-search") {
        setSettingsTarget("semantic-search");
      } else {
        setSettingsTarget(undefined);
      }
      activateSection(section);
      if (section === "notes") setProjectScope(null);
      if (section !== "notes") {
        setIsFocusMode(false);
        setIsChatOpen(false);
      }
    })();
  }

  function openNewNoteModal() {
    void (async () => {
      if (!await tryFlushPendingSave()) return;
      activateSection("notes");
      setProjectScope(null);
      setIsFocusMode(false);
      setIsChatOpen(false);
      setIsNewNoteModalOpen(true);
    })();
  }

  async function createNote(title: string, noteDate: string) {
    if (!await tryFlushPendingSave()) return;
    try {
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

  async function completeFirstRun(name: string) {
    await flushUiSettings();
    const completion = await dataService.completeFirstRun(name);
    updateUiSettings({ localProfileName: completion.localProfileName });
    setNotes((currentNotes) => sortNotesForDisplay([completion.note, ...currentNotes]));
    setActiveNoteId(completion.note.id);
    setFirstRunRequired(false);
    void refreshSecondaryData().catch(() => showToast("Заметка создана, но список проектов обновится после перезапуска"));
    showToast("Первая заметка создана");
  }

  async function openNote(noteId: string, archivedHint?: boolean, failureMessage?: string) {
    if (!await tryFlushPendingSave()) return false;
    const archivedResult = archivedHint ?? searchResults.find((result) => result.noteId === noteId)?.archived;
    openedArchivedNoteIdRef.current = archivedResult ? noteId : null;
    if (!notes.some((note) => note.id === noteId)) {
      try {
        const loadedNote = await dataService.getNote(noteId);
        setNotes((currentNotes) => sortNotesForDisplay([loadedNote, ...currentNotes.filter((note) => note.id !== noteId)]));
      } catch (error) {
        showToast(failureMessage ?? `Не удалось открыть заметку: ${String(error)}`);
        return false;
      }
    }
    if (projectScope && notes.find((note) => note.id === noteId)?.projectId !== projectScope.id) setProjectScope(null);
    activateSection("notes");
    setActiveNoteId(noteId);
    setIsFocusMode(false);
    return true;
  }

  async function openSemanticResult(result: SemanticSearchResult) {
    setQuery("");
    const opened = await openNote(
      result.noteId,
      result.archived,
      "Заметка больше недоступна. Сохранённый фрагмент остаётся в источниках.",
    );
    if (opened) {
      setSemanticOpenTarget(result);
    }
  }

  async function renameNote(noteId: string, title: string) {
    try {
      const updatedNote = await dataService.renameNote(noteId, title);
      setNotes((currentNotes) => sortNotesForDisplay(currentNotes.map((note) => note.id === noteId
        ? { ...note, title: updatedNote.title, updatedAt: updatedNote.updatedAt, dateLabel: updatedNote.dateLabel }
        : note)));
      setSearchRevision((revision) => revision + 1);
    } catch (error) {
      showToast(`Не удалось переименовать заметку: ${String(error)}`);
      throw error;
    }
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

  async function moveNote(noteId: string, project: string) {
    const updatedNote = await dataService.moveNoteToProject(noteId, project);
    replaceNote(updatedNote);
    await refreshSecondaryData();
    showToast(`Заметка добавлена в «${project}»`);
  }

  async function createProjectForNote(noteId: string, title: string) {
    const project = await createProject(title, "");
    try {
      await moveNote(noteId, project.title);
    } catch {
      showToast("Проект создан, но заметка не добавлена. Повторите добавление.");
      throw new Error("Проект создан, но заметка не добавлена. Повторите добавление.");
    }
  }

  async function removeNoteFromProject(noteId: string) {
    const updatedNote = await dataService.removeNoteFromProject(noteId);
    replaceNote(updatedNote);
    await refreshSecondaryData();
    showToast("Заметка убрана из проекта");
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
      .catch(() => showToast(mode === "archive" ? "Не удалось архивировать заметку." : "Не удалось удалить заметку."));
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
    return dataService.createProject(title, description).then((project) => {
      setProjects((currentProjects) => [...currentProjects, project]);
      showToast("Проект создан");
      return project;
    });
  }

  function updateProject(projectId: string, title: string, description: string) {
    return dataService.updateProject(projectId, title, description).then((project) => {
      setProjects((currentProjects) => currentProjects.map((item) => item.id === project.id ? project : item));
      setProjectScope((current) => current?.id === project.id ? { id: project.id, title: project.title } : current);
      setNotes((currentNotes) => currentNotes.map((note) => note.projectId === project.id ? { ...note, project: project.title } : note));
      setSearchRevision((revision) => revision + 1);
      showToast("Проект обновлён");
      return project;
    });
  }

  async function archiveProject(projectId: string) {
    if (!await tryFlushPendingSave()) throw new Error("Не удалось сохранить заметку");
    await dataService.archiveProject(projectId);
    const loadedNotes = await dataService.listNotes("");
    setNotes(loadedNotes);
    setProjectScope((current) => current?.id === projectId ? null : current);
    setActiveNoteId((currentId) => loadedNotes.some((note) => note.id === currentId) ? currentId : loadedNotes[0]?.id ?? "");
    await refreshSecondaryData();
    setSearchRevision((revision) => revision + 1);
    showToast("Проект и его активные заметки архивированы");
  }

  async function persistTag(value: TagEditorValue) {
    try {
      const tag = await dataService.createTag(value.name, value.color, value.customColor);
      setTags((currentTags) => [...currentTags, tag].sort((first, second) => first.name.localeCompare(second.name, "ru-RU")));
      setSearchRevision((revision) => revision + 1);
      showToast("Тег создан");
      return tag;
    } catch (error) {
      showToast(`Не удалось создать тег: ${String(error)}`);
      throw error;
    }
  }

  async function createTag(value: TagEditorValue) {
    await persistTag(value);
  }

  async function setNoteTag(noteId: string, tagId: string, assigned: boolean) {
    try {
      const updatedNote = await dataService.setNoteTag(noteId, tagId, assigned);
      setNotes((currentNotes) => currentNotes.map((note) => note.id === noteId
        ? { ...note, tags: updatedNote.tags, updatedAt: updatedNote.updatedAt, dateLabel: updatedNote.dateLabel }
        : note));
      setTags(await dataService.listTags());
      setSearchRevision((revision) => revision + 1);
    } catch (error) {
      showToast(`Не удалось изменить теги заметки: ${String(error)}`);
      throw error;
    }
  }

  async function makeNoteTagPrimary(noteId: string, tagId: string) {
    try {
      replaceNote(await dataService.makeNoteTagPrimary(noteId, tagId));
    } catch {
      showToast("Не удалось изменить порядок тегов.");
      throw new Error("Не удалось изменить порядок тегов.");
    }
  }

  async function createNoteTag(noteId: string, value: TagEditorValue) {
    const tag = await persistTag(value);
    await setNoteTag(noteId, tag.id, true);
  }

  async function updateTag(tagId: string, value: TagEditorValue) {
    try {
      const nextTags = await dataService.updateTag(tagId, value.name, value.color, value.customColor);
      const updatedTag = nextTags.find((tag) => tag.id === tagId);
      setTags(nextTags);
      if (updatedTag) setNotes((currentNotes) => replaceTagInNotes(currentNotes, updatedTag));
      setSearchRevision((revision) => revision + 1);
      showToast("Тег обновлён");
    } catch (error) {
      showToast(`Не удалось обновить тег: ${String(error)}`);
      throw error;
    }
  }

  function deleteTag(tagId: string) {
    void dataService
      .deleteTag(tagId)
      .then((nextTags) => {
        setTags(nextTags);
        setNotes((currentNotes) => removeTagFromNotes(currentNotes, tagId));
        setSearchRevision((revision) => revision + 1);
      })
      .then(() => showToast("Тег удалён"))
      .catch((error) => showToast(`Не удалось удалить тег: ${String(error)}`));
  }

  async function mergeTags(sourceTagId: string, targetTagId: string) {
    try {
      const nextTags = await dataService.mergeTags(sourceTagId, targetTagId);
      const targetTag = nextTags.find((tag) => tag.id === targetTagId);
      setTags(nextTags);
      if (targetTag) setNotes((currentNotes) => mergeTagInNotes(currentNotes, sourceTagId, targetTag));
      setSearchRevision((revision) => revision + 1);
      showToast("Теги объединены");
    } catch (error) {
      showToast(`Не удалось объединить теги: ${String(error)}`);
      throw error;
    }
  }

  function openTagNotes(tagName: string) {
    void (async () => {
      if (!await tryFlushPendingSave()) return;
      activateSection("notes");
      setProjectScope(null);
      setQuery(tagName);
      showToast(`Открыты заметки с тегом «${tagName}»`);
    })();
  }

  function openProjectNotes(projectId: string) {
    void (async () => {
      if (!await tryFlushPendingSave()) return;
      const project = projects.find((item) => item.id === projectId);
      if (!project) return;
      activateSection("notes");
      setProjectScope({ id: project.id, title: project.title });
      setActiveNoteId(notes.find((note) => note.projectId === project.id)?.id ?? "");
      setQuery("");
    })();
  }

  async function restoreArchiveItem(item: ArchiveItem) {
    await dataService.restoreArchiveItem(item);
    const loadedNotes = await dataService.listNotes("");
    setNotes(loadedNotes);
    setActiveNoteId((currentId) => loadedNotes.some((note) => note.id === currentId) ? currentId : loadedNotes[0]?.id ?? "");
    await refreshSecondaryData();
    setSearchRevision((revision) => revision + 1);
    showToast(item.kind === "Проект" ? "Проект восстановлен" : "Заметка восстановлена");
  }

  async function deleteArchiveItem(item: ArchiveItem) {
    await dataService.deleteArchiveItem(item);
    const loadedNotes = await dataService.listNotes("");
    setNotes(loadedNotes);
    setActiveNoteId((currentId) => loadedNotes.some((note) => note.id === currentId) ? currentId : loadedNotes[0]?.id ?? "");
    await refreshSecondaryData();
    setSearchRevision((revision) => revision + 1);
    showToast(item.kind === "Проект" ? "Проект и его заметки удалены" : "Заметка удалена");
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

  async function createBackup() {
    await flushPendingSave();
    return dataService.createBackup();
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
        pendingSavesRef.current.clear();
        saveSequenceRef.current += 1;
      },
      refreshExternalViews: () => setWorkspaceReloadGeneration((generation) => generation + 1),
    });
    showToast("Резервная копия восстановлена");
    return result;
  }

  async function importMarkdown(notesToImport: Parameters<typeof dataService.importMarkdown>[0]) {
    if (!await tryFlushPendingSave()) throw new Error("Сначала сохраните текущую заметку");
    const importedNotes = await dataService.importMarkdown(notesToImport);
    setNotes((currentNotes) => sortNotesForDisplay([...importedNotes, ...currentNotes]));
    setActiveNoteId(importedNotes[0]?.id ?? activeNoteId);
    setProjectScope(null);
    setQuery("");
    activateSection("notes");
    void refreshSecondaryData().catch(() => showToast("Импорт завершён, но список проектов обновится после перезапуска"));
    setSearchRevision((revision) => revision + 1);
    showToast(`Импортировано заметок: ${importedNotes.length}`);
    return importedNotes.length;
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
    "--listw": `${isFocusMode || hideNoteListForChat ? 0 : listWidth}px`,
    "--chatw": `${isFocusMode || !isChatOpen ? 0 : chatWidth}px`,
  };
  const sharedFooter = (
    <SharedOverlays
      isNewNoteModalOpen={isNewNoteModalOpen}
      isFirstRunOpen={firstRunRequired && !firstRunDismissed && !isDataLoading && !isSettingsLoading}
      isProfileNameModalOpen={isProfileNameModalOpen}
      localProfileName={uiSettings.localProfileName}
      onCloseNewNote={() => setIsNewNoteModalOpen(false)}
      onCloseProfileName={() => setIsProfileNameModalOpen(false)}
      onCreateNote={createNote}
      onCompleteFirstRun={completeFirstRun}
      onDismissFirstRun={() => setFirstRunDismissed(true)}
      onSaveProfileName={(localProfileName) => {
        updateUiSettings({ localProfileName });
        setIsProfileNameModalOpen(false);
        showToast("Имя локального профиля обновлено");
      }}
      toastAction={toastAction}
      toastMessage={toastMessage}
    />
  );
  const sharedPageSidebar: PageShellSidebarProps = {
    collapsed: isSidebarCollapsed,
    localProfileName: uiSettings.localProfileName,
    onEditLocalProfile: () => setIsProfileNameModalOpen(true),
    onReset: () => updateUiSettings({ sidebarWidth: 250 }),
    onResize: (deltaX) =>
      updateUiSettings((currentSettings) => ({
        sidebarWidth: clamp(currentSettings.sidebarWidth + deltaX, 190, 360),
      })),
    onToggleCollapse: () =>
      updateUiSettings((currentSettings) => ({
        sidebarCollapsed: !currentSettings.sidebarCollapsed,
      })),
    width: sidebarWidth,
  };

  function renderAppFrame(children: ReactNode) {
    return (
      <AppFrame footer={sharedFooter} useCssZoomFallback={appZoom.useCssZoomFallback} zoomPercent={appZoom.zoomPercent}>
        {children}
      </AppFrame>
    );
  }

  function renderFeatureLoadState(section: Exclude<AppSection, "notes">, label: string, kind: "error" | "loading") {
    return (
      <PageShell activeSection={section} onNavigate={navigate} onNewNote={openNewNoteModal} onToast={showToast} sidebar={sharedPageSidebar}>
        <FeatureLoadState kind={kind} label={label} />
      </PageShell>
    );
  }

  function renderLazyFeaturePage(section: Exclude<AppSection, "notes">, label: string, children: ReactNode) {
    return renderAppFrame(
      <LazyFeatureBoundary
        key={section}
        errorFallback={renderFeatureLoadState(section, label, "error")}
        loadingFallback={renderFeatureLoadState(section, label, "loading")}
      >
        {children}
      </LazyFeatureBoundary>,
    );
  }

  if (activeSection === "projects") {
    return renderLazyFeaturePage(
      "projects",
      "проекты",
      <LazyProjectsPage onArchiveProject={archiveProject} onCreateProject={createProject} onNavigate={navigate} onNewNote={openNewNoteModal} onOpenProject={openProjectNotes} onToast={showToast} onUpdateProject={updateProject} projects={projects} sidebar={sharedPageSidebar} />,
    );
  }

  if (activeSection === "rag") {
    return renderLazyFeaturePage(
      "rag",
      "ИИ-чат по базе",
      <LazyRagChatPage
        dataReloadGeneration={workspaceReloadGeneration}
        onNavigate={navigate}
        onNewNote={openNewNoteModal}
        onOpenModelSettings={() => {
          navigate("settings", "semantic-search");
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
        onToast={showToast}
        ragConversationWidth={uiSettings.ragConversationWidth}
        ragSourcesCollapsed={uiSettings.ragSourcesCollapsed}
        ragSourcesWidth={uiSettings.ragSourcesWidth}
        sidebar={sharedPageSidebar}
      />,
    );
  }

  if (activeSection === "tags") {
    return renderLazyFeaturePage(
      "tags",
      "теги",
      <LazyTagsPage
        onCreateTag={createTag}
        onDeleteTag={deleteTag}
        onMergeTags={mergeTags}
        onNavigate={navigate}
        onNewNote={openNewNoteModal}
        onOpenTag={openTagNotes}
        onToast={showToast}
        onUpdateTag={updateTag}
        sidebar={sharedPageSidebar}
        tags={tags}
      />,
    );
  }

  if (activeSection === "archive") {
    return renderLazyFeaturePage(
      "archive",
      "архив",
      <LazyArchivePage
        archiveItems={archiveItems}
        onDeleteItem={deleteArchiveItem}
        onNavigate={navigate}
        onNewNote={openNewNoteModal}
        onRestoreItem={restoreArchiveItem}
        onToast={showToast}
        sidebar={sharedPageSidebar}
      />,
    );
  }

  if (activeSection === "settings") {
    return renderLazyFeaturePage(
      "settings",
      "настройки",
      <LazySettingsPage
        initialTarget={settingsTarget}
        appZoomPercent={appZoom.zoomPercent}
        localProfileName={uiSettings.localProfileName}
        onNavigate={navigate}
        onNewNote={openNewNoteModal}
        onBackupCreate={createBackup}
        onBackupPreview={previewBackup}
        onExportCurrentNote={exportCurrentNoteZip}
        onExportCurrentProject={exportCurrentProjectZip}
        onImportBackup={importBackup}
        onImportMarkdown={importMarkdown}
        onEditLocalProfile={() => setIsProfileNameModalOpen(true)}
        onThemeChange={(nextTheme) => updateUiSettings({ theme: nextTheme })}
        onToast={showToast}
        onZoomDecrease={appZoom.decreaseZoom}
        onZoomIncrease={appZoom.increaseZoom}
        onZoomReset={appZoom.resetZoom}
        sidebar={sharedPageSidebar}
        theme={theme}
      />,
    );
  }

  return renderAppFrame(
      <div
        className={`workspace ${isSidebarCollapsed ? "collapse-sb" : ""} ${isFocusMode ? "focus" : ""} ${isChatOpen ? "chat-open" : ""} ${hideNoteListForChat ? "workspace-hide-list-for-chat" : ""}`}
        style={workspaceStyle}
      >
        {!isFocusMode ? (
          <>
            <MainSidebar
              activeSection="notes"
              collapsed={isSidebarCollapsed}
              localProfileName={uiSettings.localProfileName}
              onEditLocalProfile={() => setIsProfileNameModalOpen(true)}
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
              notes={scopedNotes}
              onQueryChange={setQuery}
              onSelectNote={(noteId) => void openNote(noteId)}
              onToggleArchivedSearch={() => setIncludeArchivedSearch((includeArchived) => !includeArchived)}
              onTogglePin={toggleNotePin}
              projects={projects}
              projectScope={projectScope}
              onClearProjectScope={() => setProjectScope(null)}
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
            onCreateProjectForNote={createProjectForNote}
            onRemoveNoteFromProject={removeNoteFromProject}
            onMakeNoteTagPrimary={makeNoteTagPrimary}
            onImportMarkdown={importMarkdown}
            onOpenChat={() => setIsChatOpen(true)}
            onOpenAttachment={dataService.openAttachment}
            onOpenNote={(noteId) => void openNote(noteId)}
            onOpenSettingsModels={() => {
              navigate("settings");
            }}
            onPickAndStoreAttachment={pickAndStoreAttachment}
            onRenameNote={renameNote}
            onRetrySave={() => { void flushPendingSave().catch(() => undefined); }}
            onSetNoteTag={setNoteTag}
            onCreateNoteTag={createNoteTag}
            onRevealAttachment={dataService.revealAttachment}
            onSelectionTextChange={setEditorSelectionText}
            onStoreAttachment={storeAttachment}
            onTogglePin={toggleNotePin}
            onToast={showToast}
            onToggleFocus={toggleFocusMode}
            projectOptions={projectOptions}
            tagOptions={tags}
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
              navigate("settings");
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
  };

  return (
    <AppZoomProvider zoomPercent={zoomPercent}>
      <div className={`app-zoom-root ${useCssZoomFallback ? "css-zoom-fallback" : ""}`} data-zoom-percent={zoomPercent} style={zoomStyle}>
        {children}
        {footer}
      </div>
    </AppZoomProvider>
  );
}

interface SharedOverlaysProps {
  isFirstRunOpen: boolean;
  isNewNoteModalOpen: boolean;
  isProfileNameModalOpen: boolean;
  localProfileName: string;
  toastAction: ToastAction | null;
  toastMessage: string | null;
  onCloseNewNote: () => void;
  onCloseProfileName: () => void;
  onCreateNote: (title: string, noteDate: string) => void;
  onCompleteFirstRun: (name: string) => Promise<void>;
  onDismissFirstRun: () => void;
  onSaveProfileName: (name: string) => void;
}

function SharedOverlays({ isFirstRunOpen, isNewNoteModalOpen, isProfileNameModalOpen, localProfileName, toastAction, toastMessage, onCloseNewNote, onCloseProfileName, onCreateNote, onCompleteFirstRun, onDismissFirstRun, onSaveProfileName }: SharedOverlaysProps) {
  return (
    <>
      <FirstRunModal onClose={onDismissFirstRun} onCreate={onCompleteFirstRun} open={isFirstRunOpen} />
      <NewNoteModal isOpen={isNewNoteModalOpen} onClose={onCloseNewNote} onCreate={onCreateNote} />
      <LocalProfileModal name={localProfileName} onClose={onCloseProfileName} onSave={onSaveProfileName} open={isProfileNameModalOpen} />
      <Toast action={toastAction} message={toastMessage} />
      <TooltipPortal />
    </>
  );
}
