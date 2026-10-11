import assert from "node:assert/strict";
import { after, afterEach, it } from "node:test";
import { act, createElement as h } from "react";
import { File } from "node:buffer";
import { JSDOM } from "jsdom";
import type { Note, ProjectCard, TagRow } from "../src/app/types";
import type { SearchNoteResult } from "../src/services/searchService";
import type { PreparedMarkdownNote } from "../src/features/settings/markdownImport";

const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost", pretendToBeVisual: true });
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, HTMLButtonElement: dom.window.HTMLButtonElement, HTMLInputElement: dom.window.HTMLInputElement, Element: dom.window.Element, Node: dom.window.Node, Event: dom.window.Event, MouseEvent: dom.window.MouseEvent, KeyboardEvent: dom.window.KeyboardEvent, MutationObserver: dom.window.MutationObserver, ResizeObserver: class { observe() {} disconnect() {} }, IS_REACT_ACT_ENVIRONMENT: true })) {
  previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { createRoot } = await import("react-dom/client");
const { ProjectsPage } = await import("../src/features/projects/ProjectsPage");
const { ProjectDeleteDialog } = await import("../src/features/projects/ProjectDeleteDialog");
const { MarkdownImportControl } = await import("../src/features/settings/MarkdownImportControl");
const { TagsPage } = await import("../src/features/tags/TagsPage");
const { NoteListPanel } = await import("../src/features/notes/NoteListPanel");
const { ArchivePage } = await import("../src/features/archive/ArchivePage");
const { InlineNoteTitle } = await import("../src/features/editor/InlineNoteTitle");
const { NewNoteModal } = await import("../src/features/notes/NewNoteModal");
let root: ReturnType<typeof createRoot> | undefined;
async function mount(element: ReturnType<typeof h>) {
  if (!root) { const container = document.createElement("div"); document.body.append(container); root = createRoot(container); }
  await act(async () => root!.render(element));
}
async function click(label: string, scope: ParentNode = document) {
  const button = [...scope.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === label);
  assert.ok(button, label); await act(async () => button.click()); return button;
}
async function input(element: HTMLInputElement, value: string) {
  await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(element, value); element.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
}
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; document.body.replaceChildren(); });
after(() => { dom.window.close(); for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } });
const sidebar = { collapsed: false, localProfileName: "QA", width: 250, onEditLocalProfile() {}, onReset() {}, onResize() {}, onToggleCollapse() {} };
const project: ProjectCard = { id: "p", title: "Работа", description: "", color: "blue", notes: 3, tasks: 0 };

it("project creation rejects case/space duplicates and overlong names before persistence", async () => {
  let calls = 0;
  await mount(h(ProjectsPage, { projects: [project], sidebar, onCreateProject: async () => { calls++; return project; }, onUpdateProject: async () => project, onArchiveProject: async () => {}, onDeleteProject: async () => {}, onExportProject: async () => {}, onNavigate() {}, onNewNote() {}, onOpenProject() {}, onToast() {} }));
  await click("Новый проект"); const field = document.querySelector<HTMLInputElement>('#project-editor-form input')!;
  await input(field, "  рАбОтА  "); await click("Создать");
  assert.match(document.querySelector('[role="alert"]')?.textContent ?? "", /Проект с таким названием уже существует/); assert.equal(calls, 0);
  await input(field, "я".repeat(26)); await click("Создать"); assert.match(document.querySelector('[role="alert"]')?.textContent ?? "", /25 символов/); assert.equal(calls, 0);
});
it("shared project confirmation displays count and exact-name guard; cancel and Escape have no side effects", async () => {
  let deleted = 0; let closed = 0;
  await mount(h(ProjectDeleteDialog, { title: project.title, notes: 3, onDelete: async () => { deleted++; }, onClose: () => { closed++; } }));
  assert.match(document.body.textContent ?? "", /все заметки внутри него: 3 заметки/);
  const field = document.querySelector<HTMLInputElement>(".archive-delete-name input")!;
  assert.ok(field.classList.contains("nf-input"));
  const button = await click("Удалить проект"); assert.equal(button.disabled, true);
  await input(field, "работа"); assert.equal(button.disabled, true);
  await input(field, "Работа"); assert.equal(button.disabled, false);
  await click("Отмена"); assert.equal(deleted, 0); assert.equal(closed, 1);
  await mount(h(ProjectDeleteDialog, { key: "reopened", title: project.title, notes: 3, onDelete: async () => { deleted++; }, onClose: () => { closed++; } }));
  await act(async () => { document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 180)); });
  assert.equal(deleted, 0); assert.equal(closed, 2);
});
it("Markdown import edits every filename title, rejects overlength, and preserves Markdown", async () => {
  let imported: readonly PreparedMarkdownNote[] = [];
  await mount(h(MarkdownImportControl, { onImport: async (notes) => { imported = notes; return notes.length; } }));
  const picker = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(picker, "files", { configurable: true, value: [new File(["# Заголовок\n\n**Текст**"], "Первый.md"), new File(["- [ ] Задача"], "Второй.md")] });
  await act(async () => { picker.dispatchEvent(new dom.window.Event("change", { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 20)); });
  const fields = [...document.querySelectorAll<HTMLInputElement>(".markdown-import-preview input")]; assert.equal(fields.length, 2); assert.equal(fields[0].value, "Первый");
  await input(fields[0], "я".repeat(26)); await click("Импортировать"); assert.equal(imported.length, 0); assert.match(document.querySelector('[role="alert"]')?.textContent ?? "", /25/);
  await input(fields[0], "Мой заголовок"); await input(fields[1], "Задачи"); await click("Импортировать");
  assert.deepEqual(imported.map((note) => note.title), ["Мой заголовок", "Задачи"]); assert.match(imported[0].contentMarkdown, /# Заголовок/); assert.match(imported[0].contentMarkdown, /\*\*Текст\*\*/); assert.match(imported[1].contentMarkdown, /- \[ \] Задача/);
});
it("current-note Markdown import keeps the existing title, accepts long filenames and never offers new-note creation", async () => {
  let imported: readonly PreparedMarkdownNote[] = [];
  await mount(h(MarkdownImportControl, { targetNoteTitle: "Моя заметка", onImport: async (notes) => { imported = notes; return notes.length; } }));
  const picker = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(picker, "files", { configurable: true, value: [new File(["# Содержимое\n\n**Текст**"], "Очень длинное название импортируемого файла.md")] });
  await act(async () => { picker.dispatchEvent(new dom.window.Event("change", { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 20)); });
  assert.match(document.body.textContent ?? "", /Вставить в «Моя заметка»/);
  assert.doesNotMatch(document.querySelector(".markdown-import-preview")?.textContent ?? "", /Будет создан|Название заметки/);
  assert.equal(document.querySelector(".markdown-import-preview input"), null);
  await click("Импортировать"); assert.equal(imported.length, 1); assert.match(imported[0].contentMarkdown, /# Содержимое/);
});
it("current-note Markdown import cancellation never inserts content", async () => {
  let calls = 0;
  await mount(h(MarkdownImportControl, { targetNoteTitle: "Моя заметка", onImport: async () => { calls++; return 1; } }));
  const picker = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(picker, "files", { configurable: true, value: [new File(["Текст"], "test.md")] });
  await act(async () => { picker.dispatchEvent(new dom.window.Event("change", { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 20)); });
  await click("Отмена"); assert.equal(calls, 0);
});
it("tag search remains controlled across repeated queries, clearing and async count refresh", async () => {
  const tags: TagRow[] = [{ id: "t1", name: "РАБОТА", color: "blue", count: 1 }, { id: "t2", name: "Учёба", color: "green", count: 2 }];
  const props = { sidebar, onCreateTag: async () => {}, onDeleteTag() {}, onMergeTags: async () => {}, onUpdateTag: async () => {}, onNavigate() {}, onNewNote() {}, onOpenTag() {}, onToast() {} };
  await mount(h(TagsPage, { ...props, tags })); const field = document.querySelector<HTMLInputElement>('input[type="search"]')!;
  for (const query of ["работ", "нет", "УЧЁ", ""]) {
    await input(field, query); assert.equal(document.querySelectorAll(".tag-row").length, query === "нет" ? 0 : query ? 1 : 2); assert.equal(field.value, query);
  }
  await input(field, "работ"); await mount(h(TagsPage, { ...props, tags: tags.map((tag) => ({ ...tag, count: 8 })) }));
  assert.equal(field.value, "работ"); assert.equal(document.querySelectorAll(".tag-row").length, 1); assert.match(document.querySelector(".tag-row")?.textContent ?? "", /8 заметок/);
});
const note: Note = { id: "n", title: "Заметка", contentMarkdown: "", contentHtml: "", plainText: "", editorDocument: { type: "doc", content: [] }, contentVersion: 1, contentSidecars: [], attachments: [], createdAt: "", updatedAt: "", dateLabel: "09.10.2026", noteDate: "2026-10-09", project: "", tags: [], summary: "", wordCount: 0 };
const result = (id: string, archived: boolean): SearchNoteResult => ({ noteId: id, archived, title: id, favorite: false, matchSource: "title", project: "", relevanceScore: 1, snippet: "", tags: [], updatedAt: "2026-10-09" });
const listProps = { activeNoteId: "n", notes: [note], projects: [], query: "", searchResults: [], searchStatus: "idle" as const, includeArchivedSearch: true, onQueryChange() {}, onToggleArchivedSearch() {}, onSelectNote() {}, onTogglePin() {}, projectScope: null, onClearProjectScope() {} };
for (const count of [1, 2, 3, 12]) it(`all ${count} assigned tags remain visible in normal and search cards`, async () => {
  const tags = Array.from({ length: count }, (_, index) => ({ id: `t${index}`, name: `Тег ${index + 1}`, color: "blue" as const }));
  await mount(h(NoteListPanel, { ...listProps, notes: [{ ...note, tags }] }));
  assert.deepEqual([...document.querySelectorAll(".card .tag")].map((tag) => tag.textContent), tags.map((tag) => tag.name));
  await mount(h(NoteListPanel, { ...listProps, query: "Тег", searchStatus: "results", searchResults: [{ ...result("n", false), tags }] }));
  assert.deepEqual([...document.querySelectorAll(".search-result-card .tag")].map((tag) => tag.textContent), tags.map((tag) => tag.name));
});
it("tag navigation passes the actual relationship ID, not the display name", async () => {
  const opened: string[] = [];
  await mount(h(TagsPage, { tags: [{ id: "exact-id", name: "Работа", color: "blue", count: 2 }], sidebar, onCreateTag: async () => {}, onDeleteTag() {}, onMergeTags: async () => {}, onUpdateTag: async () => {}, onNavigate() {}, onNewNote() {}, onOpenTag: (id) => opened.push(id), onToast() {} }));
  assert.equal(document.querySelector(".page-subtitle")?.textContent, "Управляйте тегами и открывайте связанные заметки");
  await act(async () => document.querySelector<HTMLButtonElement>(".tag-row-main")!.click());
  assert.deepEqual(opened, ["exact-id"]);
});
it("search separates archived matches and keyboard Enter follows displayed group ordering", async () => {
  const selected: string[] = [];
  await mount(h(NoteListPanel, { ...listProps, query: "Q", searchStatus: "results", searchResults: [result("archived", true), result("active", false)], onSelectNote: (id) => { selected.push(id); } }));
  assert.deepEqual([...document.querySelectorAll(".note-search-group")].map((group) => group.textContent), ["Заметки", "Архив"]);
  const field = document.querySelector<HTMLInputElement>("#note-search")!;
  await act(async () => field.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  await act(async () => field.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
  await act(async () => field.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  assert.deepEqual(selected, ["active", "archived"]);
});
it("right-click actions target the clicked note rather than the selected note; delete cancellation is inert", async () => {
  const duplicated: string[] = []; const deleted: string[] = [];
  await mount(h(NoteListPanel, { ...listProps, notes: [note, { ...note, id: "other", title: "Другая" }], onDuplicateNote: (id) => { duplicated.push(id); }, onDeleteNote: (id) => { deleted.push(id); } }));
  const card = document.querySelectorAll(".card")[1];
  const open = async () => act(async () => card.dispatchEvent(new dom.window.MouseEvent("contextmenu", { bubbles: true, clientX: 30, clientY: 30 })));
  await open(); await click("Дублировать"); assert.deepEqual(duplicated, ["other"]);
  await open(); await click("Удалить", document.querySelector('.row-actions-menu')!); assert.match(document.body.textContent ?? "", /После удаления заметку не получится восстановить/); await click("Отмена"); assert.deepEqual(deleted, []);
});
it("archive restore is available in overflow only and restores the correct entry", async () => {
  const restored: string[] = [];
  await mount(h(ArchivePage, { archiveItems: [{ id: "a", kind: "Заметка", title: "Архивная", archivedAt: "2026-10-09" }], onDeleteItem: async () => {}, onRestoreItem: async (item) => { restored.push(item.id); }, onNavigate() {}, onNewNote() {}, onToast() {} }));
  assert.equal(document.querySelector(".page-subtitle")?.textContent, "Архивные заметки можно восстановить в любой момент");
  assert.ok(![...document.querySelectorAll("button")].some((button) => button.textContent === "Восстановить"));
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Действия с «Архивная»"]')!.click());
  await click("Восстановить"); assert.deepEqual(restored, ["a"]);
});
it("new-note title validation reports 26 characters without silently truncating", async () => {
  const created: string[] = [];
  await mount(h(NewNoteModal, { isOpen: true, onClose() {}, onCreate: (title) => { created.push(title); } }));
  const field = document.querySelector<HTMLInputElement>('#new-note-form input[type="text"]')!;
  await input(field, "я".repeat(26)); await click("Создать заметку");
  assert.deepEqual(created, []); assert.equal(field.value.length, 26); assert.match(document.querySelector('[role="alert"]')?.textContent ?? "", /25 символов/);
  await input(field, "😀".repeat(25)); await click("Создать заметку"); assert.deepEqual(created, ["😀".repeat(25)]);
});
it("inline note rename shows a counter, protects long legacy titles, and rejects invalid edits", async () => {
  const legacy = "Старый длинный заголовок не должен теряться";
  const renamed: string[] = [];
  await mount(h(InlineNoteTitle, { noteId: "legacy", title: legacy, onRename: async (_id, title) => { renamed.push(title); } }));
  const title = document.querySelector<HTMLHeadingElement>('[aria-label="Название заметки"]')!;
  await act(async () => title.focus()); assert.ok(document.querySelector(".entity-name-counter"));
  await act(async () => title.blur()); assert.deepEqual(renamed, []); assert.equal(title.textContent, legacy);
  await act(async () => { title.focus(); title.textContent = "я".repeat(26); title.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
  assert.equal(document.querySelector(".entity-name-counter")?.textContent, "26/25");
  await act(async () => title.blur()); assert.deepEqual(renamed, []); assert.equal(title.textContent, legacy); assert.match(document.querySelector('[role="alert"]')?.textContent ?? "", /25 символов/);
});
