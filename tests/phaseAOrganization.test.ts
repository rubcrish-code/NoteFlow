import assert from "node:assert/strict";
import { after, afterEach, beforeEach, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement as h } from "react";
import type { Root } from "react-dom/client";
import type { ArchiveItem, Note, ProjectCard } from "../src/app/types";

const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost", pretendToBeVisual: true });
const globals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  HTMLButtonElement: dom.window.HTMLButtonElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
  KeyboardEvent: dom.window.KeyboardEvent,
  PointerEvent: dom.window.PointerEvent,
  ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
  IS_REACT_ACT_ENVIRONMENT: true,
})) {
  globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}

const { createRoot } = await import("react-dom/client");
const { ArchivePage } = await import("../src/features/archive/ArchivePage");
const { NoteMenuPopover } = await import("../src/features/editor/NoteMenuPopover");
const { NoteListPanel } = await import("../src/features/notes/NoteListPanel");
let root: Root;
let container: HTMLDivElement;

const note: Note = {
  attachments: [], contentHtml: "", contentMarkdown: "", contentVersion: 1, contentSidecars: [],
  createdAt: "2026-09-30", updatedAt: "2026-09-30", dateLabel: "30.09.2026", editorDocument: { type: "doc", content: [{ type: "paragraph" }] },
  id: "note-1", noteDate: "2026-09-30", pinned: true, plainText: "", project: "Работа", projectId: "project-1",
  summary: "Описание", tags: [{ id: "red", name: "Важно", color: "pink" }, { id: "blue", name: "Работа", color: "blue" }],
  title: "План", wordCount: 0,
};
const activeProject: ProjectCard = { id: "project-1", title: "Работа", description: "", color: "blue", notes: 1, tasks: 0 };
const archivedProject: ProjectCard = { ...activeProject, id: "project-2", title: "Старый", archivedAt: "2026-09-01" };

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container, { onCaughtError() {} });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

after(() => {
  dom.window.close();
  for (const [key, descriptor] of globals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

function buttonByText(text: string, scope: ParentNode = document) {
  const button = Array.from(scope.querySelectorAll<HTMLButtonElement>("button")).find((candidate) => candidate.textContent?.trim() === text);
  assert.ok(button, `button ${text} is visible`);
  return button;
}

describe("Phase A organization UI", () => {
  it("keeps the note card compact, shows a real project and first-tag accent, and clears project scope", async () => {
    let cleared = false;
    const render = async (shownNote: Note, scope: { id: string; title: string } | null) => act(async () => root.render(h(NoteListPanel, {
      activeNoteId: shownNote.id, notes: [shownNote], projects: [activeProject], query: "", searchResults: [], searchStatus: "idle",
      includeArchivedSearch: false, onQueryChange() {}, onToggleArchivedSearch() {}, onSelectNote() {}, onTogglePin() {},
      projectScope: scope, onClearProjectScope() { cleared = true; },
    })));
    await render(note, { id: activeProject.id, title: activeProject.title });
    const card = container.querySelector<HTMLElement>(".card")!;
    assert.ok(card.classList.contains("on"));
    assert.equal(card.style.getPropertyValue("--note-accent"), "#E05272");
    assert.equal(card.querySelector(".card-project")?.textContent, "Работа");
    assert.ok(card.querySelector(".card-project"));
    assert.equal(card.querySelector(".card-icon"), null);
    assert.ok(card.querySelector('.pin-action[aria-label="Открепить заметку"]'));
    assert.equal(container.querySelector<HTMLInputElement>("#note-search")?.value, "");
    await act(async () => container.querySelector<HTMLButtonElement>(".note-project-scope button")!.click());
    assert.equal(cleared, true);
    await render({ ...note, projectId: undefined, project: "", tags: [] }, null);
    assert.equal(container.querySelector(".card-project"), null);
    assert.doesNotMatch(container.textContent ?? "", /без тега|без проекта/i);
    assert.equal(container.querySelector<HTMLElement>(".card")!.style.getPropertyValue("--note-accent"), "");
  });

  it("offers only active projects, allows creation and removal, and routes delete through confirmation", async () => {
    const calls: string[] = [];
    await act(async () => root.render(h(NoteMenuPopover, {
      note, onArchive() {}, onClose() { calls.push("close"); }, onDelete() { calls.push("delete-confirmation"); },
      onDuplicate() {}, onExportMarkdown() {}, onImportMarkdown() { calls.push("import"); },
      onMove: async (_id: string, project: string) => { calls.push(`move:${project}`); },
      onCreateProject() { calls.push("create-project"); },
      onRemoveFromProject: async () => { calls.push("remove-project"); }, onTogglePin() {},
      projectOptions: [activeProject.title],
    })));
    await act(async () => buttonByText("Добавить в проект", container).click());
    assert.match(container.textContent ?? "", /Работа/);
    assert.doesNotMatch(container.textContent ?? "", /Старый/);
    await act(async () => buttonByText("Создать новый проект", container).click());
    assert.deepEqual(calls, ["create-project", "close"]);
    await act(async () => buttonByText("Назад", container).click());
    await act(async () => buttonByText("Убрать из проекта", container).click());
    assert.ok(calls.includes("remove-project"));
    await act(async () => buttonByText("Импортировать Markdown", container).click());
    assert.ok(calls.includes("import"));
    await act(async () => buttonByText("Удалить", container).click());
    assert.ok(calls.includes("delete-confirmation"));
  });

  it("filters archive entries and requires an exact project name before permanent deletion", async () => {
    const items: ArchiveItem[] = [
      { id: "project-2", kind: "Проект", title: "Старый", archivedAt: "2026-09-30T11:00:00", noteCount: 2 },
      { id: "note-2", kind: "Заметка", title: "Черновик", archivedAt: "2026-09-29T11:00:00", tagColor: "pink" },
    ];
    const deleted: string[] = [];
    await act(async () => root.render(h(ArchivePage, {
      archiveItems: items, onDeleteItem: async (item: ArchiveItem) => { deleted.push(item.id); }, onNavigate() {},
      onNewNote() {}, onRestoreItem: async () => {}, onToast() {},
    })));
    assert.equal(container.querySelectorAll(".archive-row").length, 2);
    assert.match(container.textContent ?? "", /2 заметки/);
    assert.match(container.textContent ?? "", /Архивировано 30\.09\.2026/);
    assert.equal(container.querySelector(".archive-row-main")?.tagName, "BUTTON");
    await act(async () => buttonByText("Проекты", container.querySelector(".archive-filters")!).click());
    assert.equal(container.querySelectorAll(".archive-row").length, 1);
    assert.match(container.querySelector(".archive-row")?.textContent ?? "", /Старый/);
    await act(async () => root.render(h(ArchivePage, {
      archiveItems: items.slice(1), onDeleteItem: async () => {}, onNavigate() {}, onNewNote() {},
      onRestoreItem: async () => {}, onToast() {},
    })));
    assert.match(container.textContent ?? "", /Архивных проектов нет/);
    await act(async () => root.render(h(ArchivePage, {
      archiveItems: items, onDeleteItem: async (item: ArchiveItem) => { deleted.push(item.id); }, onNavigate() {},
      onNewNote() {}, onRestoreItem: async () => {}, onToast() {},
    })));
    await act(async () => buttonByText("Заметки", container.querySelector(".archive-filters")!).click());
    assert.equal(container.querySelectorAll(".archive-row").length, 1);
    assert.equal(container.querySelector<HTMLElement>(".archive-row")?.style.getPropertyValue("--note-accent"), "#E05272");
    await act(async () => buttonByText("Все", container.querySelector(".archive-filters")!).click());
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Действия с «Старый»"]')!.click());
    await act(async () => buttonByText("Удалить", document.querySelector(".row-actions-menu")!).click());
    const confirm = buttonByText("Удалить", document.querySelector(".confirm-dialog")!);
    assert.match(document.querySelector(".confirm-dialog")?.textContent ?? "", /Старый/);
    assert.match(document.querySelector(".confirm-dialog")?.textContent ?? "", /все заметки внутри него: 2 заметки/);
    assert.doesNotMatch(document.body.textContent ?? "", /Удалить окончательно/);
    assert.equal(confirm.disabled, true);
    const input = document.querySelector<HTMLInputElement>(".archive-delete-name input")!;
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!;
    await act(async () => { setter.call(input, "старый"); input.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
    assert.equal(confirm.disabled, true);
    await act(async () => { setter.call(input, "Старый"); input.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
    assert.equal(confirm.disabled, false);
    await act(async () => buttonByText("Отмена", document).click());
    assert.deepEqual(deleted, []);
  });

  it("explains empty-project deletion without a zero-note warning", async () => {
    await act(async () => root.render(h(ArchivePage, {
      archiveItems: [{ id: "empty", kind: "Проект", title: "Пустой", archivedAt: "2026-09-30T11:00:00", noteCount: 0 }],
      onDeleteItem: async () => {}, onNavigate() {}, onNewNote() {}, onRestoreItem: async () => {}, onToast() {},
    })));
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Действия с «Пустой»"]')!.click());
    await act(async () => buttonByText("Удалить", document.querySelector(".row-actions-menu")!).click());
    const dialogText = document.querySelector(".confirm-dialog")?.textContent ?? "";
    assert.match(dialogText, /Проект не содержит заметок/);
    assert.doesNotMatch(dialogText, /0 заметок|0 заметки/);
    assert.equal(buttonByText("Удалить", document.querySelector(".confirm-dialog")!).disabled, true);
  });
});
