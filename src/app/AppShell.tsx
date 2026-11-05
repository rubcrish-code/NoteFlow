import { translate, useInterfaceLanguage, setInterfaceLanguage } from "../shared/i18n";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "@tauri-apps/api/core";
import type { AppSection, ArchiveItem, EditorContentSidecarInput, EditorDocument, Note, ProjectCard, SaveStatus, TagRow } from "./types";
import * as dataService from "../services/dataService";
import * as noteExportService from "../services/noteExportService";
import { noteChatJobs, noteChatDrafts, forgetNoteChat } from "../services/noteChatBackground";
import { ragJobs } from "../services/ragBackground";
import type { NoteExportFormat } from "../features/export/exportDocument";
import { exportAfterFlush } from "../features/export/savedExportFlow";
import * as searchService from "../services/searchService";
import type { SearchNoteResult } from "../services/searchService";
import type { SemanticSearchResult } from "../services/embeddingService";
import type { InternalNoteLink } from "../shared/internalNoteLink";
import { EditorArea } from "../features/editor/EditorArea";
import { EDITOR_TOOLBAR_MIN_WIDTH } from "../features/editor/editorToolbarLayout";
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
import { SidebarPanel } from "../shared/SidebarPanel";
import { Toast, type ToastAction } from "../shared/Toast";
import { TooltipPortal } from "../shared/TooltipPortal";
import { AppZoomProvider } from "../shared/AppZoomContext";
import { LocalProfileModal } from "../shared/LocalProfileModal";
import { APP_SHORTCUTS, matchesAppShortcut } from "../shared/appShortcuts";
import { useAppZoom } from "../shared/useAppZoom";
import { minimumCompactEditorWindowWidth, resolveEditorWorkspacePresentation, type EditorWorkspaceWidths } from "../shared/editorWorkspaceWidth";
import { panelPointerScale, useWorkspacePanelResize } from "../shared/useWorkspacePanelResize";
import { useEditorWindowMinimum } from "../shared/useEditorWindowMinimum";
import { usePhysicalViewportWidth } from "../shared/usePhysicalViewportWidth";
import { clearLegacyUiSettings, migrateLegacyUiSettings } from "../services/legacyUiSettingsMigration";
import { DEFAULT_UI_SETTINGS, getUiSettings, normalizeUiSettings, updateUiSettings as persistUiSettings, type UiSettings } from "../services/uiSettingsService";
import { PendingNoteSaves } from "./noteAutosaveCoordinator";
import { flushPreparedEditorSaves, type EditorSavePreparationControl } from "../features/editor/editorSavePreparation";
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
  useInterfaceLanguage();
  const [activeSection, setActiveSection] = useState<AppSection>("notes");
  const [settingsTarget, setSettingsTarget] = useState<"semantic-search" | undefined>();
  const [notes, setNotes] = useState<Note[]>([]);
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  const [tags, setTags] = useState<TagRow[]>([]);
  const [archiveItems, setArchiveItems] = useState<ArchiveItem[]>([]);
  const [activeNoteId, setActiveNoteId] = useState("");
  const [query, setQuery] = useState("");
  const [searchTagId, setSearchTagId] = useState<string | null>(null);
  const [projectScope, setProjectScope] = useState<{ id: string; title: string } | null>(null);
  const [searchResults, setSearchResults] = useState<SearchNoteResult[]>([]);
  const [semanticOpenTarget, setSemanticOpenTarget] = useState<SemanticSearchResult | null>(null);
  const [internalOpenTarget, setInternalOpenTarget] = useState<(InternalNoteLink & { navigationId: number }) | undefined>();
  const navigationSequenceRef = useRef(0);
  const [searchStatus, setSearchStatus] = useState<NoteSearchStatus>("idle");
  const [includeArchivedSearch, setIncludeArchivedSearch] = useState(true);
  const [searchRevision, setSearchRevision] = useState(0);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [isSettingsLoading, setIsSettingsLoading] = useState(true);
  const [firstRunRequired, setFirstRunRequired] = useState(false);
  const [needsProfileName, setNeedsProfileName] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const chatRequestRef = useRef({ generation: 0, open: false });
  const [editorSelectionText, setEditorSelectionText] = useState("");
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isNewNoteModalOpen, setIsNewNoteModalOpen] = useState(false);
  const [isProfileNameModalOpen, setIsProfileNameModalOpen] = useState(false);
  const [isTrainingOpen, setIsTrainingOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [editorReloadGeneration, setEditorReloadGeneration] = useState(0);
  const [workspaceReloadGeneration, setWorkspaceReloadGeneration] = useState(0);
  const [toastAction, setToastAction] = useState<ToastAction | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [uiSettings, setUiSettings] = useState<UiSettings>(DEFAULT_UI_SETTINGS);
  const saveTimeoutRef = useRef<number | null>(null);
  const pendingSavesRef = useRef(new PendingNoteSaves<PendingNoteSave>());
  const editorPreparationRef = useRef<EditorSavePreparationControl | null>(null);
  const unpreparedNoteIdRef = useRef<string | null>(null);
  const saveSequenceRef = useRef(0);
  const bulkDeleteInProgressRef = useRef(false);
  const notesGenerationRef = useRef(0);
  const noteContentVersionsRef = useRef(new Map<string, number>());
  const isClosingRef = useRef(false);
  const settingsHydratedRef = useRef(false);
  const settingsSaveTimeoutRef = useRef<number | null>(null);
  const settingsSaveInFlightRef = useRef<Promise<void> | null>(null);
  const settingsDragRef = useRef(false);
  const uiSettingsRef = useRef<UiSettings>(DEFAULT_UI_SETTINGS);
  const searchRequestIdRef = useRef(0);
  const secondaryDataRequestRef = useRef(0);
  const projectCountsRequestRef = useRef(0);
  const openedArchivedNoteIdRef = useRef<string | null>(null);
  const appZoom = useAppZoom({
    onZoomChange: showToast,
    onZoomPercentChange: (appZoomPercent) => {
      if (!canApplyEditorLayout({ zoomPercent: appZoomPercent })) return false;
      updateUiSettings({ appZoomPercent }); return true;
    },
    zoomPercent: uiSettings.appZoomPercent,
  });
  const theme = uiSettings.theme;
  const sidebarWidth = uiSettings.sidebarWidth;
  const listWidth = uiSettings.listWidth;
  const chatWidth = uiSettings.chatWidth;
  const isSidebarCollapsed = uiSettings.sidebarCollapsed;
  const physicalViewportWidth = usePhysicalViewportWidth(appZoom.zoomPercent, appZoom.useCssZoomFallback);

  const scopedNotes = notes.filter((note) => !note.archivedAt && (!projectScope || note.projectId === projectScope.id));
  const activeNote = notes.find((note) => note.id === activeNoteId && (!projectScope || note.projectId === projectScope.id)) ?? scopedNotes[0] ?? null;
  const editorLayout: EditorWorkspaceWidths = { sidebarWidth, listWidth, chatWidth, sidebarCollapsed: isSidebarCollapsed, chatOpen: isChatOpen, focus: isFocusMode, zoomPercent: appZoom.zoomPercent };
  const editorLayoutActive = activeSection === "notes" && Boolean(activeNote);
  const editorMinimumWidth = editorLayoutActive ? Math.max(900, minimumCompactEditorWindowWidth(editorLayout)) : 900;
  const editorWindow = useEditorWindowMinimum(editorMinimumWidth, () => showToast(translate("ui.d5e7c6ee949e")));
  const editorPresentation = resolveEditorWorkspacePresentation(editorLayout, physicalViewportWidth);
  const hideNoteListForChat = editorLayoutActive && editorPresentation.hideList;
  const editorSidebarCollapsed = editorLayoutActive ? editorPresentation.sidebarCollapsed : isSidebarCollapsed;
  const fittedEditorWidths = activeNote ? editorPresentation.widths
    : { sidebarWidth: isSidebarCollapsed ? 74 : sidebarWidth, listWidth, chatWidth: isChatOpen ? chatWidth : 0 };

  function canApplyEditorLayout(patch: Partial<EditorWorkspaceWidths>) {
    if (!editorLayoutActive || resolveEditorWorkspacePresentation({ ...editorLayout, ...patch }, physicalViewportWidth).ribbonFits) return true;
    showToast(translate("ui.45216521a7b3"));
    return false;
  }

  async function openEditorChat() {
    if (uiSettingsRef.current.lastSection !== "notes") return;
    const request = { generation: chatRequestRef.current.generation + 1, open: !chatRequestRef.current.open };
    chatRequestRef.current = request;
    if (!request.open) { setIsChatOpen(false); return; }
    try {
      const minimum = Math.max(900, minimumCompactEditorWindowWidth({ ...editorLayout, chatOpen: true, focus: false }));
      if (!isTauri() && minimum > physicalViewportWidth) throw new Error("Unsupported editor width");
      await editorWindow.prepareWidth(minimum, () => chatRequestRef.current === request);
      if (chatRequestRef.current === request && uiSettingsRef.current.lastSection === "notes") { setIsFocusMode(false); setIsChatOpen(true); }
    } catch {
      if (chatRequestRef.current !== request) return;
      chatRequestRef.current = { ...request, open: false };
      showToast(translate("ui.be470076e7ac"));
    }
  }

  function dismissEditorChat() {
    chatRequestRef.current = { generation: chatRequestRef.current.generation + 1, open: false };
    setIsChatOpen(false);
  }

  async function revealNoteList() {
    dismissEditorChat();
    try {
      await editorWindow.prepareWidth(Math.max(900, Math.ceil(EDITOR_TOOLBAR_MIN_WIDTH * appZoom.zoomPercent / 100 + 74 + 260)));
      setIsFocusMode(false);
    } catch { showToast(translate("ui.c8f93ef06f78")); }
  }

  function exitEditorFocus() {
    setIsFocusMode(false);
  }

  const panelResize = useWorkspacePanelResize({
    configuration: (key, page) => {
      const limits = { sidebarWidth: [190, 360], listWidth: [260, 560], chatWidth: [300, 620] } as const;
      const [minimum, maximum] = limits[key];
      const otherPanels = Object.entries(fittedEditorWidths).reduce((sum, [name, width]) => sum + (name === key ? 0 : width), 0);
      const room = physicalViewportWidth - otherPanels - EDITOR_TOOLBAR_MIN_WIDTH * appZoom.zoomPercent / 100;
      return { value: page ? uiSettingsRef.current[key] : fittedEditorWidths[key], minimum, maximum: page ? maximum : Math.max(minimum, Math.min(maximum, room)), zoom: panelPointerScale(appZoom.zoomPercent, appZoom.useCssZoomFallback) };
    },
    onBegin: () => { settingsDragRef.current = true; if (settingsSaveTimeoutRef.current !== null) { window.clearTimeout(settingsSaveTimeoutRef.current); settingsSaveTimeoutRef.current = null; } },
    onFinish: () => { settingsDragRef.current = false; scheduleUiSettingsSave(uiSettingsRef.current); },
    onCommit: (key, value) => updateUiSettings({ [key]: value }),
  });

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
        setInterfaceLanguage(nextSettings.language);
        setUiSettings(nextSettings);
        setActiveSection(nextSettings.lastSection);

        if (migration.migrated) {
          await persistUiSettings(nextSettings);
          clearLegacyUiSettings();
        }
      } catch (error) {
        if (!isCancelled) {
          settingsHydratedRef.current = true;
          showToast(translate("ui.e26e3de104c3", { p0: String(error) }));
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
        setNeedsProfileName(firstRun.needsProfileName ?? firstRun.required);
      } catch (error) {
        showToast(translate("ui.acb336a784b5", { p0: String(error) }));
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
      setSearchTagId(null);
      setSearchResults([]);
      setSearchStatus("idle");
      if (openedArchivedNoteIdRef.current) {
        openedArchivedNoteIdRef.current = null;
        void dataService
          .listNotes("")
          .then((loadedNotes) => {
            if (searchRequestIdRef.current !== requestId) return;
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
        .searchNotes({ includeArchived: includeArchivedSearch, projectId: projectScope?.id, tagId: searchTagId ?? undefined, query: trimmedQuery })
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
  }, [includeArchivedSearch, isDataLoading, projectScope?.id, query, searchRevision, searchTagId]);

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
      if (document.querySelector(".bulk-delete-modal") && APP_SHORTCUTS.some((shortcut) => matchesAppShortcut(event, shortcut.id))) {
        event.preventDefault();
        return;
      }

      if (event.key === "Escape") {
        if (isNewNoteModalOpen) {
          setIsNewNoteModalOpen(false);
          return;
        }
        if (isFocusMode) {
          void exitEditorFocus();
          return;
        }
        if (isChatOpen) {
          dismissEditorChat();
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
        if (hideNoteListForChat) void revealNoteList();
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
  }, [isChatOpen, isFocusMode, isNewNoteModalOpen, hideNoteListForChat]);

  function showToast(message: string, action?: ToastAction | null) {
    setToastMessage(message);
    setToastAction(action ?? null);
  }

  function updateUiSettings(patch: Partial<UiSettings> | ((currentSettings: UiSettings) => Partial<UiSettings>)) {
    const previous = uiSettingsRef.current;
    const requested = typeof patch === "function" ? patch(previous) : patch;
    const nextSettings = normalizeUiSettings({ ...previous, ...requested });
    const candidateLayout = { ...editorLayout, sidebarCollapsed: nextSettings.sidebarCollapsed, zoomPercent: nextSettings.appZoomPercent };
    if (nextSettings.appZoomPercent !== previous.appZoomPercent && !canApplyEditorLayout(candidateLayout)) return;
    uiSettingsRef.current = nextSettings;
    setInterfaceLanguage(nextSettings.language);
    setUiSettings(nextSettings);
  }

  function activateSection(section: AppSection) {
    setActiveSection(section);
    updateUiSettings({ lastSection: section });
  }

  function scheduleUiSettingsSave(settings: UiSettings) {
    if (settingsDragRef.current) return;
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
        if (uiSettingsRef.current === settings) uiSettingsRef.current = savedSettings;
      })
      .catch((error) => {
        showToast(translate("ui.f04c4bb97b8e", { p0: String(error) }));
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
      editorPreparationRef.current?.discard();
      unpreparedNoteIdRef.current = null;
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
    const requestId = ++secondaryDataRequestRef.current;
    ++projectCountsRequestRef.current;
    const generation = notesGenerationRef.current;
    const [loadedProjects, loadedTags, loadedArchiveItems] = await Promise.all([dataService.listProjects(), dataService.listTags(), dataService.listArchive()]);
    if (generation !== notesGenerationRef.current || requestId !== secondaryDataRequestRef.current) return;
    setProjects(loadedProjects);
    setTags(loadedTags);
    setArchiveItems(loadedArchiveItems);
  }

  async function refreshProjectCounts() {
    const requestId = ++projectCountsRequestRef.current;
    const generation = notesGenerationRef.current;
    const loadedProjects = await dataService.listProjects();
    if (generation !== notesGenerationRef.current || requestId !== projectCountsRequestRef.current) return;
    setProjects((current) => current.map((project) => {
      const loaded = loadedProjects.find((candidate) => candidate.id === project.id);
      return loaded ? { ...project, notes: loaded.notes, files: loaded.files } : project;
    }));
  }

  async function flushPendingSave() {
    if (bulkDeleteInProgressRef.current) throw new Error(translate("ui.c052fe56fb04"));
    await flushPreparedEditorSaves(() => editorPreparationRef.current, flushNoteWrites, () => pendingSavesRef.current.hasPending());
  }

  async function flushNoteWrites() {
    if (bulkDeleteInProgressRef.current) throw new Error(translate("ui.c052fe56fb04"));
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
            error instanceof dataService.NotePersistenceError ? error.message : translate("ui.344ef700939b"),
            { label: translate("ui.5189135a6110"), onClick: () => { void flushPendingSave().catch(() => undefined); } },
          );
          throw error;
        }
      },
      (_pendingSave, savedNote, hasNewerSave) => {
        noteContentVersionsRef.current.set(savedNote.id, savedNote.contentVersion);
        const preparingNewerSave = unpreparedNoteIdRef.current === savedNote.id && editorPreparationRef.current?.hasPending();
        if (hasNewerSave || preparingNewerSave) {
          setNotes((currentNotes) => currentNotes.map((note) =>
            note.id === savedNote.id ? { ...note, contentVersion: savedNote.contentVersion } : note,
          ));
          setSearchRevision((revision) => revision + 1);
          setSaveStatus(editorPreparationRef.current?.getStatus() === "error" ? "error" : "saving");
        } else {
          replaceNote(savedNote);
          setSaveStatus("saved");
          if (savedNote.projectId) void refreshProjectCounts().catch(() => undefined);
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
          ? translate("ui.7ab7ee45805a")
          : translate("ui.1ddc60b2d404"),
        { label: translate("ui.5189135a6110"), onClick: () => { void flushPendingSave().catch(() => undefined); } },
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
    if (bulkDeleteInProgressRef.current || !notes.some((note) => note.id === noteId)) return;
    if (unpreparedNoteIdRef.current === noteId) unpreparedNoteIdRef.current = null;
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
    if (saveTimeoutRef.current === null) scheduleAutosave();
  }

  function scheduleAutosave() {
    if (saveTimeoutRef.current !== null) window.clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = window.setTimeout(() => { void flushPendingSave().catch(() => undefined); }, 850);
  }

  function markEditorDirty(noteId: string) {
    if (bulkDeleteInProgressRef.current || !notes.some((note) => note.id === noteId)) return false;
    unpreparedNoteIdRef.current = noteId;
    setSaveStatus("saving");
    scheduleAutosave();
    return true;
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
      if (section === "notes") {
        setProjectScope(null);
        if (resolveEditorWorkspacePresentation({ ...editorLayout, focus: false }, physicalViewportWidth).hideList) await revealNoteList();
      }
      if (section !== "notes") {
        setIsFocusMode(false);
        dismissEditorChat();
      }
    })();
  }

  function openNewNoteModal() {
    void (async () => {
      if (!await tryFlushPendingSave()) return;
      activateSection("notes");
      setProjectScope(null);
      setIsFocusMode(false);
      dismissEditorChat();
      setIsNewNoteModalOpen(true);
    })();
  }

  async function createNote(title: string, noteDate: string) {
    if (!await tryFlushPendingSave()) return;
    const generation = notesGenerationRef.current;
    try {
      const newNote = await dataService.createNote(title, noteDate);
      if (generation !== notesGenerationRef.current) return;
      setNotes((currentNotes) => sortNotesForDisplay([newNote, ...currentNotes.filter((note) => note.id !== newNote.id)]));
      setActiveNoteId(newNote.id);
      setQuery("");
      setIsNewNoteModalOpen(false);
      await refreshSecondaryData();
      showToast(translate("ui.93b548bec9b8"));
    } catch (error) {
      showToast(translate("ui.262f7f5c9526", { p0: String(error) }));
    }
  }

  async function completeFirstRun(name: string) {
    await flushUiSettings();
    const completion = await dataService.completeFirstRun(name);
    updateUiSettings({ localProfileName: completion.localProfileName });
    setNotes((currentNotes) => sortNotesForDisplay([completion.note, ...currentNotes]));
    setActiveNoteId(completion.note.id);
    setFirstRunRequired(false);
    void refreshSecondaryData().catch(() => showToast(translate("ui.bb24cfe51c59")));
    showToast(translate("ui.d771cf8c37df"));
  }

  async function openNote(noteId: string, archivedHint?: boolean, failureMessage?: string) {
    const navigationId = ++navigationSequenceRef.current;
    if (!await tryFlushPendingSave() || navigationId !== navigationSequenceRef.current) return false;
    setSemanticOpenTarget(null);
    setInternalOpenTarget(undefined);
    const generation = notesGenerationRef.current;
    const archivedResult = archivedHint ?? searchResults.find((result) => result.noteId === noteId)?.archived;
    openedArchivedNoteIdRef.current = archivedResult ? noteId : null;
    if (!notes.some((note) => note.id === noteId)) {
      try {
        const loadedNote = await dataService.getNote(noteId);
        if (loadedNote.archivedAt) openedArchivedNoteIdRef.current = noteId;
        if (generation !== notesGenerationRef.current || bulkDeleteInProgressRef.current || navigationId !== navigationSequenceRef.current) return false;
        setNotes((currentNotes) => sortNotesForDisplay([loadedNote, ...currentNotes.filter((note) => note.id !== noteId)]));
      } catch (error) {
        if (navigationId !== navigationSequenceRef.current) return false;
        showToast(failureMessage ?? translate("ui.02bdd9ddf8eb", { p0: String(error) }));
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
      translate("ui.dba7bddb64af"),
    );
    if (opened) {
      setSemanticOpenTarget({ ...result });
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
      showToast(translate("ui.a1b79b9781c1", { p0: String(error) }));
      throw error;
    }
  }

  function duplicateNote(noteId: string) {
    const generation = notesGenerationRef.current;
    void flushPendingSave()
      .then(() => dataService.duplicateNote(noteId))
      .then((duplicatedNote) => {
        if (generation !== notesGenerationRef.current) return;
        setNotes((currentNotes) => sortNotesForDisplay([duplicatedNote, ...currentNotes.filter((note) => note.id !== duplicatedNote.id)]));
        setActiveNoteId(duplicatedNote.id);
        setSearchRevision((revision) => revision + 1);
        showToast(translate("ui.8688c7ea76e4"));
      })
      .catch((error) => showToast(translate("ui.f3436dcf123b", { p0: String(error) })));
  }

  function toggleNotePin(noteId: string) {
    void dataService
      .toggleNotePin(noteId)
      .then((updatedNote) => {
        replaceNote(updatedNote);
        showToast(updatedNote.pinned ? translate("ui.3a8bbb0cae2d") : translate("ui.31b00f51be5a"));
      })
      .catch((error) => showToast(translate("ui.bb36783c8da5", { p0: String(error) })));
  }

  async function moveNote(noteId: string, project: string) {
    const updatedNote = await dataService.moveNoteToProject(noteId, project);
    replaceNote(updatedNote);
    await refreshSecondaryData();
    showToast(translate("ui.69ef2ce7599f", { p0: project }));
  }

  async function createProjectForNote(noteId: string, title: string) {
    const project = await createProject(title, "");
    try {
      await moveNote(noteId, project.title);
    } catch {
      showToast(translate("ui.372af5f8869c"));
      throw new Error(translate("ui.372af5f8869c"));
    }
  }

  async function removeNoteFromProject(noteId: string) {
    const updatedNote = await dataService.removeNoteFromProject(noteId);
    replaceNote(updatedNote);
    await refreshSecondaryData();
    showToast(translate("ui.f95e929dceda"));
  }

  function removeNote(noteId: string, mode: "archive" | "delete") {
    const generation = notesGenerationRef.current;
    void flushPendingSave()
      .then(() => (mode === "archive" ? dataService.archiveNote(noteId) : dataService.deleteNote(noteId)))
      .then(async () => {
        if (mode === "delete") forgetNoteChat(noteId);
        const loadedNotes = await dataService.listNotes("");
        if (generation !== notesGenerationRef.current) return;
        setNotes(loadedNotes);
        if (activeNoteId === noteId) {
          setActiveNoteId(loadedNotes[0]?.id ?? "");
        }
        await refreshSecondaryData();
        setSearchRevision((revision) => revision + 1);
        showToast(mode === "archive" ? translate("ui.ed4ea3dc416e") : translate("ui.894f97c52af9"));
      })
      .catch(() => showToast(mode === "archive" ? translate("ui.3f60c459b7e2") : translate("ui.37bfcf9a1de7")));
  }

  function showExportSuccess(result: dataService.ExportResult, message: string) {
    showToast(message, { label: translate("ui.75c6f3f481c5"), onClick: () => {
      void dataService.revealExportedItem(result.path).catch(() => showToast(translate("ui.30b7fa486aea")));
    } });
  }

  async function exportNote(noteId: string, format: NoteExportFormat) {
    const result = await exportAfterFlush(flushPendingSave, () => noteExportService.exportNote(noteId, format));
    if (result) { updateUiSettings({ lastNoteExportFormat: format }); showExportSuccess(result, translate("ui.79fc5c3f4512")); }
  }

  async function exportProject(project: ProjectCard) {
    const result = await exportAfterFlush(flushPendingSave, () => noteExportService.exportProject(project.id, project.title));
    if (result) showExportSuccess(result, translate("ui.8964c58dc99d"));
  }

  function storeAttachment(file: File, kind: "file" | "image", options: dataService.StoreAttachmentOptions = {}) {
    if (!activeNote) {
      return Promise.reject(new Error(translate("ui.bcd79dc36f4e")));
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
      return Promise.reject(new Error(translate("ui.bcd79dc36f4e")));
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
      showToast(translate("ui.65599191b39e"));
      return project;
    });
  }

  function updateProject(projectId: string, title: string, description: string) {
    return dataService.updateProject(projectId, title, description).then((project) => {
      setProjects((currentProjects) => currentProjects.map((item) => item.id === project.id ? project : item));
      setProjectScope((current) => current?.id === project.id ? { id: project.id, title: project.title } : current);
      setNotes((currentNotes) => currentNotes.map((note) => note.projectId === project.id ? { ...note, project: project.title } : note));
      setSearchRevision((revision) => revision + 1);
      showToast(translate("ui.a33792a44a8c"));
      return project;
    });
  }

  async function archiveProject(projectId: string) {
    if (!await tryFlushPendingSave()) throw new Error(translate("ui.344ef700939b"));
    await dataService.archiveProject(projectId);
    const loadedNotes = await dataService.listNotes("");
    setNotes(loadedNotes);
    setProjectScope((current) => current?.id === projectId ? null : current);
    setActiveNoteId((currentId) => loadedNotes.some((note) => note.id === currentId) ? currentId : loadedNotes[0]?.id ?? "");
    await refreshSecondaryData();
    setSearchRevision((revision) => revision + 1);
    showToast(translate("ui.7754c777ead2"));
  }

  async function persistTag(value: TagEditorValue) {
    try {
      const tag = await dataService.createTag(value.name, value.color, value.customColor);
      setTags((currentTags) => [...currentTags, tag].sort((first, second) => first.name.localeCompare(second.name, "ru-RU")));
      setSearchRevision((revision) => revision + 1);
      showToast(translate("ui.adb55b60b418"));
      return tag;
    } catch (error) {
      showToast(translate("ui.73ce18a9a488", { p0: String(error) }));
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
      showToast(translate("ui.976a3033eb5c", { p0: String(error) }));
      throw error;
    }
  }

  async function makeNoteTagPrimary(noteId: string, tagId: string) {
    try {
      replaceNote(await dataService.makeNoteTagPrimary(noteId, tagId));
    } catch {
      showToast(translate("ui.0b6df95078ed"));
      throw new Error(translate("ui.0b6df95078ed"));
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
      if (updatedTag && searchTagId === tagId) setQuery(updatedTag.name);
      setSearchRevision((revision) => revision + 1);
      showToast(translate("ui.1d9efa9c4d98"));
    } catch (error) {
      showToast(translate("ui.df20b07eeaf9", { p0: String(error) }));
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
      .then(() => showToast(translate("ui.1d3848e2b2aa")))
      .catch((error) => showToast(translate("ui.d40cbfc0662f", { p0: String(error) })));
  }

  async function mergeTags(sourceTagId: string, targetTagId: string) {
    try {
      const nextTags = await dataService.mergeTags(sourceTagId, targetTagId);
      const targetTag = nextTags.find((tag) => tag.id === targetTagId);
      setTags(nextTags);
      if (targetTag) setNotes((currentNotes) => mergeTagInNotes(currentNotes, sourceTagId, targetTag));
      setSearchRevision((revision) => revision + 1);
      showToast(translate("ui.cd7c4f57e08b"));
    } catch (error) {
      showToast(translate("ui.9444abe5d02f", { p0: String(error) }));
      throw error;
    }
  }

  function openTagNotes(tagId: string) {
    void (async () => {
      if (!await tryFlushPendingSave()) return;
      const tag = tags.find((item) => item.id === tagId);
      if (!tag) return;
      activateSection("notes");
      setProjectScope(null);
      setSearchTagId(tag.id);
      setQuery(tag.name);
      showToast(translate("ui.a8a3fe7cbf27", { p0: tag.name }));
    })();
  }

  function openProjectNotes(projectId: string) {
    void (async () => {
      if (!await tryFlushPendingSave()) return;
      const project = projects.find((item) => item.id === projectId);
      if (!project) return;
      activateSection("notes");
      setProjectScope({ id: project.id, title: project.title });
      setSearchTagId(null);
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
    showToast(item.kind === "Проект" ? translate("ui.24c163213d90") : translate("ui.c96faa8dad87"));
  }

  async function deleteArchiveItem(item: ArchiveItem) {
    const deletedNoteIds = item.kind === "Проект"
      ? (await dataService.listArchivedProjectNotes(item.id)).map((note) => note.id) : [item.id];
    await dataService.deleteArchiveItem(item);
    deletedNoteIds.forEach(forgetNoteChat);
    const loadedNotes = await dataService.listNotes("");
    setNotes(loadedNotes);
    setActiveNoteId((currentId) => loadedNotes.some((note) => note.id === currentId) ? currentId : loadedNotes[0]?.id ?? "");
    await refreshSecondaryData();
    setSearchRevision((revision) => revision + 1);
    showToast(item.kind === "Проект" ? translate("ui.4ccfdb7fc920") : translate("ui.894f97c52af9"));
  }

  async function deleteProject(projectId: string) {
    if (!await tryFlushPendingSave()) throw new Error(translate("ui.ec91c6cbc5a9"));
    const affected = notes.filter((note) => note.projectId === projectId).map((note) => note.id);
    await pendingSavesRef.current.deleteAfterInFlight(() => dataService.deleteProject(projectId), affected);
    affected.forEach(forgetNoteChat);
    const loadedNotes = await dataService.listNotes("");
    setNotes(loadedNotes);
    setActiveNoteId((id) => loadedNotes.some((note) => note.id === id) ? id : loadedNotes[0]?.id ?? "");
    if (projectScope?.id === projectId) setProjectScope(null);
    await refreshSecondaryData();
    setSearchRevision((revision) => revision + 1);
    showToast(translate("ui.4ccfdb7fc920"));
  }

  async function createBackup() {
    await flushPendingSave();
    return dataService.createBackup();
  }

  function previewBackup(file: File) {
    return dataService.previewBackup(file);
  }

  async function importBackup(file: File) {
    await Promise.all([noteChatJobs.stopAllAndWait(), ragJobs.stopAllAndWait()]);
    try {
      const result = await restoreWorkspaceBackup<dataService.WorkspaceSnapshot, dataService.ImportBackupResult>({
        applyWorkspace: (workspace) => { noteChatDrafts.reset(); applyWorkspaceSnapshot(workspace, true); },
        file,
        flushPendingSave,
        importBackup: dataService.importBackup,
        invalidatePendingSaves: () => {
          editorPreparationRef.current?.discard();
          unpreparedNoteIdRef.current = null;
          pendingSavesRef.current.clear();
          saveSequenceRef.current += 1;
        },
        refreshExternalViews: () => setWorkspaceReloadGeneration((generation) => generation + 1),
      });
      showToast(translate("ui.05d9a7026a3c"));
      return result;
    } finally {
      noteChatJobs.resume();
      ragJobs.resume();
    }
  }

  async function deleteAllNotes() {
    if (bulkDeleteInProgressRef.current) throw new Error(translate("ui.c052fe56fb04"));
    bulkDeleteInProgressRef.current = true;
    const preparation = editorPreparationRef.current;
    preparation?.suspend();
    if (saveTimeoutRef.current !== null) {
      window.clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    try {
      const result = await pendingSavesRef.current.deleteAfterInFlight(dataService.deleteAllNotes);
      preparation?.discard();
      unpreparedNoteIdRef.current = null;
      noteChatJobs.reset();
      noteChatDrafts.reset();
      notesGenerationRef.current += 1;
      searchRequestIdRef.current += 1;
      saveSequenceRef.current += 1;
      noteContentVersionsRef.current.clear();
      openedArchivedNoteIdRef.current = null;
      setNotes([]);
      setActiveNoteId("");
      setProjects((items) => items.map((project) => ({ ...project, notes: 0, files: undefined })));
      setTags((items) => items.map((tag) => ({ ...tag, count: 0 })));
      setArchiveItems((items) => items.filter((item) => item.kind === "Проект").map((item) => ({ ...item, noteCount: 0 })));
      setQuery("");
      setProjectScope(null);
      setSearchResults([]);
      setSearchStatus("idle");
      setSemanticOpenTarget(null);
      setEditorSelectionText("");
      dismissEditorChat();
      setSaveStatus("saved");
      setEditorReloadGeneration((generation) => generation + 1);
      setWorkspaceReloadGeneration((generation) => generation + 1);
      setSearchRevision((revision) => revision + 1);
      void refreshSecondaryData().catch(() => showToast(translate("ui.7fce9f660059")));
      return result;
    } finally {
      bulkDeleteInProgressRef.current = false;
      preparation?.resume();
      // A failed transaction retains drafts and resumes the usual autosave.
      if (pendingSavesRef.current.hasPending() || preparation?.hasPending()) {
        saveTimeoutRef.current = window.setTimeout(() => { void flushPendingSave().catch(() => undefined); }, 850);
      }
    }
  }

  async function importMarkdown(notesToImport: Parameters<typeof dataService.importMarkdown>[0]) {
    if (!await tryFlushPendingSave()) throw new Error(translate("ui.21039e268694"));
    const importedNotes = await dataService.importMarkdown(notesToImport);
    setNotes((currentNotes) => sortNotesForDisplay([...importedNotes, ...currentNotes]));
    setActiveNoteId(importedNotes[0]?.id ?? activeNoteId);
    setProjectScope(null);
    setQuery("");
    activateSection("notes");
    void refreshSecondaryData().catch(() => showToast(translate("ui.44ea7e805f93")));
    setSearchRevision((revision) => revision + 1);
    showToast(translate("ui.31be0c866c30", { p0: importedNotes.length }));
    return importedNotes.length;
  }

  function toggleFocusMode() {
    if (isFocusMode) { void exitEditorFocus(); return; }
    setIsFocusMode((currentValue) => {
      const nextValue = !currentValue;
      if (nextValue) {
        dismissEditorChat();
      }
      return nextValue;
    });
  }

  const workspaceStyle: WorkspaceStyle = {
    "--sbw": `${fittedEditorWidths.sidebarWidth}px`,
    "--listw": `${fittedEditorWidths.listWidth}px`,
    "--chatw": `${fittedEditorWidths.chatWidth}px`,
  };
  const sharedFooter = (
    <SharedOverlays
      isNewNoteModalOpen={isNewNoteModalOpen}
      isFirstRunOpen={(firstRunRequired || isTrainingOpen) && !isDataLoading && !isSettingsLoading}
      replayTraining={isTrainingOpen}
      isProfileNameModalOpen={isProfileNameModalOpen}
      localProfileName={uiSettings.localProfileName}
      onCloseNewNote={() => setIsNewNoteModalOpen(false)}
      onCloseProfileName={() => setIsProfileNameModalOpen(false)}
      onCreateNote={createNote}
      onCompleteFirstRun={completeFirstRun}
      needsProfileName={needsProfileName}
      onSaveFirstRunProfile={async (name) => {
        await flushUiSettings();
        const saved = await dataService.saveFirstRunProfile(name);
        updateUiSettings({ localProfileName: saved.localProfileName });
        await flushUiSettings();
        setNeedsProfileName(false);
      }}
      onDismissFirstRun={async () => {
        if (isTrainingOpen) { setIsTrainingOpen(false); return; }
        await dataService.dismissFirstRun(); setFirstRunRequired(false);
      }}
      onSaveProfileName={(localProfileName) => {
        updateUiSettings({ localProfileName });
        setIsProfileNameModalOpen(false);
        showToast(translate("ui.8b4a972f733a"));
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
    onResize: panelResize.move,
    onResizeStart: (handle) => panelResize.begin("sidebarWidth", handle),
    onResizeEnd: panelResize.end,
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
      translate("ui.587175da7db8"),
      <LazyProjectsPage onArchiveProject={archiveProject} onDeleteProject={deleteProject} onExportProject={exportProject} onCreateProject={createProject} onNavigate={navigate} onNewNote={openNewNoteModal} onOpenProject={openProjectNotes} onToast={showToast} onUpdateProject={updateProject} projects={projects} sidebar={sharedPageSidebar} />,
    );
  }

  if (activeSection === "rag") {
    return renderLazyFeaturePage(
      "rag",
      translate("ui.ea00b57395d6"),
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
      translate("ui.10fea873df71"),
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
      translate("ui.0d2913c148e2"),
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
      translate("ui.f121faf421c8"),
      <LazySettingsPage
        language={uiSettings.language}
        onLanguageChange={(language) => updateUiSettings({ language })}
        initialTarget={settingsTarget}
        appZoomPercent={appZoom.zoomPercent}
        onApplyZoom={appZoom.setZoom}
        onReplayTraining={() => setIsTrainingOpen(true)}
        localProfileName={uiSettings.localProfileName}
        onNavigate={navigate}
        onNewNote={openNewNoteModal}
        onBackupCreate={createBackup}
        onBackupPreview={previewBackup}
        onImportBackup={importBackup}
        onImportMarkdown={importMarkdown}
        onDeleteAllNotes={deleteAllNotes}
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
        className={`workspace ${editorSidebarCollapsed ? "collapse-sb" : ""} ${isFocusMode ? "focus" : ""} ${isChatOpen ? "chat-open" : ""} ${hideNoteListForChat ? "workspace-hide-list-for-chat" : ""}`}
        data-panel-layout="editor"
        style={workspaceStyle}
      >
        <SidebarPanel className="workspace-sidebar-panel" collapsed={editorSidebarCollapsed} open={!isFocusMode} restoreFocusSelector='[data-note-control="focus-exit"], [data-note-control="chat"]'>
            <MainSidebar
              activeSection="notes"
              collapsed={editorSidebarCollapsed}
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
        </SidebarPanel>
            {!editorSidebarCollapsed && !isFocusMode ? (
              <ResizeHandle
                className="resize-sb"
                label={translate("ui.edfdc72b827b")}
                onReset={() => updateUiSettings({ sidebarWidth: 250 })}
                onResize={panelResize.move}
                onResizeStart={(handle) => panelResize.begin("sidebarWidth", handle)}
                onResizeEnd={panelResize.end}
              />
            ) : null}
        <SidebarPanel className="workspace-list-panel" open={!isFocusMode && !hideNoteListForChat} restoreFocusSelector='[data-note-control="focus-exit"], [data-note-control="chat"]'>
            <NoteListPanel
              activeNoteId={activeNote?.id ?? ""}
              includeArchivedSearch={includeArchivedSearch}
              notes={scopedNotes}
              onQueryChange={(value) => { setSearchTagId(null); setQuery(value); }}
              onSelectNote={(noteId) => { void openNote(noteId); }}
              onToggleArchivedSearch={() => setIncludeArchivedSearch((includeArchived) => !includeArchived)}
              onTogglePin={toggleNotePin}
              onDuplicateNote={duplicateNote}
              onArchiveNote={(id) => removeNote(id, "archive")}
              onDeleteNote={(id) => removeNote(id, "delete")}
              onExportNote={exportNote}
              exportFormat={uiSettings.lastNoteExportFormat}
              onRestoreNote={(id) => { void dataService.restoreNote(id).then(async () => { setNotes(await dataService.listNotes("")); await refreshSecondaryData(); setSearchRevision((revision) => revision + 1); showToast(translate("ui.c96faa8dad87")); }).catch(() => showToast(translate("ui.06912082a96c"))); }}
              projects={projects}
              projectScope={projectScope}
              onClearProjectScope={() => setProjectScope(null)}
              query={query}
              searchResults={searchResults}
              searchStatus={searchStatus}
            />
        </SidebarPanel>
            {!isFocusMode && !hideNoteListForChat ? <ResizeHandle
              className="resize-list"
              label={translate("ui.8a268dbeaa7a")}
              onReset={() => updateUiSettings({ listWidth: 376 })}
              onResize={panelResize.move}
              onResizeStart={(handle) => panelResize.begin("listWidth", handle)}
              onResizeEnd={panelResize.end}
            /> : null}

        {activeNote ? (
          <EditorArea
            language={uiSettings.language}
            savePreparationRef={editorPreparationRef}
            onEditorDirty={markEditorDirty}
            onPreparationError={() => setSaveStatus("error")}
            documentReloadGeneration={editorReloadGeneration}
            isFocusMode={isFocusMode}
            note={activeNote}
            searchQuery={query}
            semanticOpenTarget={semanticOpenTarget}
            internalOpenTarget={internalOpenTarget}
            onArchiveNote={(noteId) => removeNote(noteId, "archive")}
            onDeleteNote={(noteId) => removeNote(noteId, "delete")}
            onDuplicateNote={duplicateNote}
            onEditorChange={updateNoteEditor}
            editorContentOffset={uiSettings.editorContentOffset}
            editorContentWidth={uiSettings.editorContentWidth}
            onExitFocus={() => { void exitEditorFocus(); }}
            onExportNote={exportNote}
            exportFormat={uiSettings.lastNoteExportFormat}
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
            onOpenChat={() => { void openEditorChat(); }}
            onOpenAttachment={dataService.openAttachment}
            onOpenNote={(noteId, fragment) => { void openNote(noteId, undefined, translate("ui.fc675519d3e3")).then((opened) => { if (opened) setInternalOpenTarget({ noteId, fragment, navigationId: navigationSequenceRef.current }); }); }}
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
              <b>{isDataLoading ? translate("ui.01fd5059cd3a") : translate("ui.03dffa60ca10")}</b>
              <span>{isDataLoading ? translate("ui.76fd25744d15") : translate("ui.38aa4fc4c087")}</span>
            </div>
          </section>
        )}

        <SidebarPanel className="workspace-chat-panel" keepMounted open={isChatOpen && !isFocusMode && Boolean(activeNote)} restoreFocusSelector='[data-note-control="focus-exit"], [data-note-control="chat"]'>
        {activeNote ? (
          <NoteChatPanel
            language={uiSettings.language}
            note={activeNote}
            onClose={dismissEditorChat}
            onOpenAiSettings={() => {
              navigate("settings");
            }}
            onResetWidth={() => updateUiSettings({ chatWidth: 380 })}
            onResize={panelResize.move}
            onResizeStart={(handle) => panelResize.begin("chatWidth", handle)}
            onResizeEnd={panelResize.end}
            selectedText={editorSelectionText}
            onToast={showToast}
          />
        ) : null}
        </SidebarPanel>
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
  useInterfaceLanguage();
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
  needsProfileName: boolean;
  onSaveFirstRunProfile: (name: string) => Promise<void>;
  isFirstRunOpen: boolean;
  replayTraining: boolean;
  isNewNoteModalOpen: boolean;
  isProfileNameModalOpen: boolean;
  localProfileName: string;
  toastAction: ToastAction | null;
  toastMessage: string | null;
  onCloseNewNote: () => void;
  onCloseProfileName: () => void;
  onCreateNote: (title: string, noteDate: string) => void;
  onCompleteFirstRun: (name: string) => Promise<void>;
  onDismissFirstRun: () => Promise<void>;
  onSaveProfileName: (name: string) => void;
}

function SharedOverlays({ needsProfileName, onSaveFirstRunProfile, isFirstRunOpen, replayTraining, isNewNoteModalOpen, isProfileNameModalOpen, localProfileName, toastAction, toastMessage, onCloseNewNote, onCloseProfileName, onCreateNote, onCompleteFirstRun, onDismissFirstRun, onSaveProfileName }: SharedOverlaysProps) {
  useInterfaceLanguage();
  return (
    <>
      {isFirstRunOpen ? <FirstRunModal onClose={onDismissFirstRun} onCreate={onCompleteFirstRun} onSaveProfile={onSaveFirstRunProfile} needsProfileName={needsProfileName} initialName={localProfileName} open replay={replayTraining} /> : null}
      <NewNoteModal isOpen={isNewNoteModalOpen} onClose={onCloseNewNote} onCreate={onCreateNote} />
      <LocalProfileModal name={localProfileName} onClose={onCloseProfileName} onSave={onSaveProfileName} open={isProfileNameModalOpen} />
      <Toast action={toastAction} message={toastMessage} />
      <TooltipPortal />
    </>
  );
}
