import assert from "node:assert/strict";
import { after, afterEach, it } from "node:test";
import { act, createElement as h } from "react";
import { JSDOM } from "jsdom";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import { Editor } from "@tiptap/core";
import { fragmentNavigationKey } from "../src/features/editor/fragmentNavigation";
import { internalNoteHref } from "../src/shared/internalNoteLink";
import { createHash } from "node:crypto";
import { captureFragmentAnchor } from "../src/features/editor/fragmentNavigation";
import { noteSearchKey } from "../src/features/editor/noteSearch";
import { markdownToTiptapDoc } from "../src/features/editor/markdownService";
import { serializeEditorDocumentForStorage } from "../src/features/editor/editorContentSerializer";

const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost", pretendToBeVisual: true });
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, HTMLInputElement: dom.window.HTMLInputElement, Element: dom.window.Element, Node: dom.window.Node, DOMParser: dom.window.DOMParser, MouseEvent: dom.window.MouseEvent, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle.bind(dom.window), requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true })) {
  previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
dom.window.HTMLElement.prototype.scrollIntoView = () => {};
previous.set("ResizeObserver", Object.getOwnPropertyDescriptor(globalThis, "ResizeObserver"));
Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, writable: true, value: class { observe() {} disconnect() {} } });
dom.window.Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
dom.window.Range.prototype.getBoundingClientRect = () => new dom.window.DOMRect();
const { createRoot } = await import("react-dom/client");
const { FirstRunModal } = await import("../src/features/notes/FirstRunModal");
const { NewNoteModal } = await import("../src/features/notes/NewNoteModal");
const { TagEditorModal } = await import("../src/features/tags/TagEditorModal");
const { NoteLinkPicker } = await import("../src/features/editor/NoteLinkPicker");
const { FormattingToolbar } = await import("../src/features/editor/FormattingToolbar");
const { resolveEditorToolbarActions } = await import("../src/features/editor/editorToolbarLayout");
const { createEditorExtensions } = await import("../src/features/editor/EditorArea");
const { handleEditorLinkClick } = await import("../src/features/editor/editorLinkClick");
let root: ReturnType<typeof createRoot> | undefined;
const editors: Editor[] = [];
async function mount(element: ReturnType<typeof h>) { const host = document.createElement("div"); document.body.append(host); root = createRoot(host); await act(async () => root!.render(element)); }
async function input(element: HTMLInputElement, text: string) { await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(element, text); element.dispatchEvent(new dom.window.Event("input", { bubbles: true })); }); }
async function click(text: string) { const button = [...document.querySelectorAll("button")].find((node) => node.textContent?.trim() === text); assert.ok(button, text); await act(async () => button.click()); return button; }
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; for (const editor of editors.splice(0)) editor.destroy(); clearMocks(); document.body.replaceChildren(); });
after(() => { dom.window.close(); for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } });

it("first run requires a nonblank name before showing any tutorial navigation", async () => {
  const saved: string[] = [];
  await mount(h(FirstRunModal, { open: true, onClose: () => assert.fail("cannot skip unnamed profile"), onCreate: async () => {}, onSaveProfile: async (name) => { saved.push(name); } }));
  assert.equal(document.querySelector(".onboarding-steps"), null);
  assert.equal([...document.querySelectorAll("button")].find((node) => node.textContent === "Продолжить")?.disabled, true);
  const field = document.querySelector<HTMLInputElement>('input[autocomplete="name"]')!;
  assert.equal(field.value, ""); await input(field, "   "); assert.equal((await click("Продолжить")).disabled, true);
  await input(field, "  Анна   👩🏽‍💻 "); await click("Продолжить");
  assert.deepEqual(saved, ["Анна 👩🏽‍💻"]); assert.equal(document.querySelectorAll(".onboarding-steps button").length, 6);
});
it("profile persistence failure cannot advance onboarding", async () => {
  await mount(h(FirstRunModal, { open: true, onClose() {}, onCreate: async () => {}, onSaveProfile: async () => { throw new Error("synthetic"); } }));
  await input(document.querySelector<HTMLInputElement>("input")!, "Имя"); await click("Продолжить");
  assert.equal(document.querySelector(".onboarding-steps"), null); assert.match(document.querySelector('[role="alert"]')?.textContent ?? "", /Не удалось сохранить/);
});
it("completed step icons remain completed after back navigation; future steps stay disabled", async () => {
  await mount(h(FirstRunModal, { open: true, replay: true, onClose() {}, onCreate: async () => assert.fail() }));
  assert.equal(document.querySelectorAll('.onboarding-steps button:disabled').length, 5);
  await click("Далее"); await click("Далее"); await click("Назад");
  assert.equal(document.querySelectorAll('.onboarding-steps .completed').length, 2);
  assert.equal(document.querySelectorAll('[aria-current="step"]').length, 1);
  assert.match(document.querySelector('[aria-current="step"]')?.getAttribute('aria-label') ?? "", /текущий/);
});
it("cold restart between profile and tutorial restores the saved name without reentering it", async () => {
  let completedName = "";
  await mount(h(FirstRunModal, { open: true, needsProfileName: false, initialName: "Сохранённое имя", onClose() {}, onCreate: async (name) => { completedName = name; } }));
  assert.equal(document.querySelector('input[autocomplete="name"]'), null);
  await click("Пропустить"); assert.equal(completedName, "Сохранённое имя");
});
it("new-note date has one selected display and timestamps are not edited", async () => {
  await mount(h(NewNoteModal, { isOpen: true, onClose() {}, onCreate() {} }));
  assert.equal(document.querySelector('.date-picker-readable'), null);
  assert.equal(document.querySelectorAll('.date-picker-trigger').length, 1);
});
it("tag create counts graphemes, shows red overflow and never truncates pasted text", async () => {
  const names: string[] = [];
  await mount(h(TagEditorModal, { mode: "create", open: true, tags: [], onClose() {}, onSubmit: async (value) => { names.push(value.name); } }));
  const field = document.querySelector<HTMLInputElement>('input')!;
  await input(field, "👩🏽‍💻".repeat(26));
  assert.equal(field.value, "👩🏽‍💻".repeat(26)); assert.ok(document.querySelector('.entity-name-counter.exceeded'));
  assert.equal((await click("Создать тег")).disabled, true); assert.deepEqual(names, []);
  await input(field, "👩🏽‍💻".repeat(25)); await click("Создать тег"); assert.equal(names.length, 1);
});
it("note picker supports typed search, keyboard selection, archived targets and Escape", async () => {
  const opened: string[] = []; let closed = 0;
  mockIPC((command, args) => command === "search_notes" ? [{ noteId: "note-a", title: "Архивная", archived: true }, { noteId: "note-b", title: "Другая", archived: false }].filter((note) => note.title.toLowerCase().includes((args?.request as { query: string }).query.toLowerCase())) : null);
  await mount(h(NoteLinkPicker, { onClose: () => { closed++; }, onChoose: (id) => opened.push(id) }));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 210)); });
  assert.match(document.body.textContent ?? "", /В архиве/);
  const field = document.querySelector<HTMLInputElement>('input[role="combobox"]')!;
  await act(async () => { field.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })); });
  await act(async () => { field.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
  assert.deepEqual(opened, ["note-b"]);
  await input(field, "Архив"); await act(async () => { await new Promise((resolve) => setTimeout(resolve, 210)); });
  assert.equal(document.querySelectorAll('[role="option"]').length, 1);
  await act(async () => { field.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 160)); });
  assert.equal(closed, 1);
});
it("internal link DOM clicks never dispatch external navigation", () => {
  let internal = ""; const anchor = document.createElement("a"); anchor.href = internalNoteHref({ noteId: "target" }); document.body.append(anchor);
  anchor.addEventListener("click", (event) => handleEditorLinkClick(event, () => assert.fail("external opener"), undefined, (link) => { internal = link.noteId; }));
  const event = new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }); anchor.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true); assert.equal(internal, "target");
});

const settlePicker = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 210)); });
for (const count of [10, 100, 1_000, 10_000]) {
  it(`picker immediately browses ${count} notes using bounded metadata pages; clearing restores list`, async () => {
    const records = Array.from({ length: count }, (_, index) => ({ noteId: `note-${index}`, title: `Заметка ${index}`, projectId: "project", project: "Работа", archived: false }));
    const requests: Array<{ query: string; offset: number; limit: number; titleOnly: boolean }> = [];
    mockIPC((command, args) => {
      assert.equal(command, "search_notes"); const request = args?.request as typeof requests[number]; requests.push(request);
      return records.filter((note) => note.title.includes(request.query)).slice(request.offset, request.offset + request.limit);
    });
    await mount(h(NoteLinkPicker, { onClose() {}, onChoose() {} })); await settlePicker();
    assert.equal(document.querySelectorAll('[role="option"]').length, Math.min(80, count));
    assert.equal(requests[0].query, ""); assert.equal(requests[0].titleOnly, true); assert.equal(requests[0].limit, 81);
    const field = document.querySelector<HTMLInputElement>('[role="combobox"]')!;
    assert.ok(field.classList.contains("nf-input")); assert.equal(document.activeElement, field);
    await input(field, `Заметка ${count - 1}`); await settlePicker();
    assert.equal(document.querySelectorAll('[role="option"]').length, 1);
    assert.match(document.querySelector('[role="option"]')!.textContent!, /Работа/);
    await input(field, ""); await settlePicker(); assert.equal(document.querySelectorAll('[role="option"]').length, Math.min(80, count));
    if (count > 80) {
      await click("Далее"); await settlePicker(); assert.equal(requests.at(-1)?.offset, 80); assert.ok(document.querySelector('[role="option"]')!.textContent!.includes("Заметка 80"));
      await click("Назад"); await settlePicker(); assert.equal(requests.at(-1)?.offset, 0);
    }
  });
}
it("picker distinguishes empty database, empty search and a safe retryable failure", async () => {
  let failure = false;
  mockIPC(() => { if (failure) throw new Error("SQL /private/profile/secret"); return []; });
  await mount(h(NoteLinkPicker, { onClose() {}, onChoose() {} })); await settlePicker();
  assert.match(document.body.textContent!, /Заметок пока нет/);
  const field = document.querySelector<HTMLInputElement>('[role="combobox"]')!;
  await input(field, "нет совпадения"); await settlePicker(); assert.match(document.body.textContent!, /Заметки не найдены/);
  failure = true; await input(field, "ошибка"); await settlePicker(); assert.match(document.body.textContent!, /Не удалось загрузить/); assert.doesNotMatch(document.body.textContent!, /SQL|private|secret/);
  failure = false; await click("Повторить"); await settlePicker(); assert.match(document.body.textContent!, /Заметки не найдены/);
});
it("stale picker responses cannot replace newer query results", async () => {
  let completeOld: ((notes: unknown[]) => void) | undefined;
  mockIPC((_command, args) => (args?.request as { query: string }).query === "старый" ? new Promise((resolve) => { completeOld = resolve; }) : [{ noteId: "new", title: "Новая заметка" }]);
  await mount(h(NoteLinkPicker, { onClose() {}, onChoose() {} })); await settlePicker();
  const field = document.querySelector<HTMLInputElement>('[role="combobox"]')!;
  await input(field, "старый"); await settlePicker(); await input(field, "новый"); await settlePicker();
  await act(async () => completeOld?.([{ noteId: "old", title: "Старый результат" }]));
  assert.doesNotMatch(document.querySelector('[role="listbox"]')!.textContent!, /Старый результат/);
});
it("toolbar dispatches shared note/fragment actions with unchanged ProseMirror selection and no saves", async () => {
  const element = document.createElement("div"); document.body.append(element); let updates = 0;
  const editor = new Editor({ element, extensions: createEditorExtensions({ onEditImage() {}, onToast() {}, onOpenAttachment: async () => {}, onRevealAttachment: async () => {} }), content: '<p>Выделенный фрагмент</p>', onUpdate: () => { updates++; } }); editors.push(editor);
  editor.commands.setTextSelection({ from: 1, to: 11 }); const before = JSON.stringify(editor.getJSON());
  const calls: string[] = [];
  await mount(h(FormattingToolbar, { editor, aiStatus: null, onAiAction() {}, onOpenAiSettings() {}, onToast() {}, onChooseNote() { calls.push("note"); }, onCopyFragment() { assert.equal(editor.state.selection.from, 1); assert.equal(editor.state.selection.to, 11); calls.push("fragment"); } }));
  const more = document.querySelector<HTMLButtonElement>('[aria-label="Дополнительные инструменты форматирования"]')!;
  await act(async () => more.click());
  const fragment = document.querySelector<HTMLButtonElement>('[data-toolbar-overflow-action="fragment-link"]')!;
  assert.equal(fragment.disabled, false); assert.equal(fragment.textContent, "Ссылка на фрагмент"); await act(async () => fragment.click());
  await act(async () => more.click()); await act(async () => document.querySelector<HTMLButtonElement>('[data-toolbar-overflow-action="note-link"]')!.click());
  assert.deepEqual(calls, ["fragment", "note"]); assert.equal(JSON.stringify(editor.getJSON()), before); assert.equal(updates, 0);
  await act(async () => editor.commands.setTextSelection(1)); await act(async () => more.click());
  const disabled = document.querySelector<HTMLButtonElement>('[data-toolbar-overflow-action="fragment-link"]')!;
  assert.equal(disabled.disabled, true); assert.match(disabled.getAttribute("aria-description")!, /выделите/);
  await act(async () => editor.commands.setTextSelection({ from: 1, to: 11 }));
  assert.equal(document.querySelector<HTMLButtonElement>('[data-toolbar-overflow-action="fragment-link"]')!.disabled, false, "selection-only changes update enabled state even with identical marks");
  assert.equal(updates, 0);
});
for (const width of [240, 360, 560, 800, 980, 1_400]) {
  it(`both link actions remain available across toolbar widths: ${width}`, () => {
    const result = resolveEditorToolbarActions(width), actions = [...result.visibleActions, ...result.overflowActions];
    assert.equal(actions.filter((item) => ["note-link", "fragment-link"].includes(item.id)).length, 2);
    if (width >= 800) assert.ok(result.visibleActions.some((item) => item.id === "note-link") && result.visibleActions.some((item) => item.id === "fragment-link"));
  });
}
it("real TipTap persists internal link attributes through Markdown, and decorations never change JSON or autosave", () => {
  let updates = 0;
  const element = document.createElement("div"); document.body.append(element);
  const editor = new Editor({ element, extensions: createEditorExtensions({ onEditImage() {}, onToast() {}, onOpenAttachment: async () => {}, onRevealAttachment: async () => {} }), content: '<p>Целевой текст</p>', onUpdate: () => { updates++; } }); editors.push(editor);
  const before = JSON.stringify(editor.getJSON());
  editor.view.dispatch(editor.state.tr.setMeta(fragmentNavigationKey, { from: 1, to: 8 }));
  assert.ok(editor.view.dom.querySelector('.note-fragment-target'));
  assert.equal(JSON.stringify(editor.getJSON()), before); assert.equal(updates, 0);
  editor.view.dispatch(editor.state.tr.setMeta(fragmentNavigationKey, null));
  assert.equal(editor.view.dom.querySelector('.note-fragment-target'), null); assert.equal(updates, 0);
  editor.chain().setTextSelection({ from: 1, to: 8 }).setLink({ href: internalNoteHref({ noteId: "id-after-rename" }) }).run();
  assert.ok(editor.view.dom.querySelector('a[data-note-link="true"]'));
});
it("fragment creation uses the local Rust SHA-256 contract when WebCrypto is unavailable", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  let calls = 0;
  mockIPC((command, args) => { assert.equal(command, "fingerprint_fragment_context"); const context = (args as { context: string }).context; assert.ok(Buffer.byteLength(context) <= 256); calls++; return createHash("sha256").update(context).digest("hex"); });
  try {
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: undefined });
    const element = document.createElement("div"); document.body.append(element);
    const editor = new Editor({ element, extensions: createEditorExtensions({ onEditImage() {}, onToast() {}, onOpenAttachment: async () => {}, onRevealAttachment: async () => {} }), content: '<p>До фрагмента после</p>' }); editors.push(editor);
    const fragment = await captureFragmentAnchor(editor.state.doc, 4, 13);
    assert.ok(fragment); assert.equal(calls, 2); assert.equal(fragment.before.length, 64);
  } finally { if (original) Object.defineProperty(globalThis, "crypto", original); else Reflect.deleteProperty(globalThis, "crypto"); }
});

it("upstream trailing-node control reproduces an unintended content update on a search-only transaction", () => {
  const element = document.createElement("div"); document.body.append(element);
  let saves = 0;
  const editor = new Editor({ element, extensions: createEditorExtensions({ onEditImage() {}, onToast() {}, onOpenAttachment: async () => {}, onRevealAttachment: async () => {} }).filter((extension) => extension.name !== "passiveEditorTransactions"), content: markdownToTiptapDoc("# Заголовок"), onUpdate: () => { saves++; } }); editors.push(editor);
  editor.view.dispatch(editor.state.tr.setMeta(noteSearchKey, { query: "" }));
  assert.equal(editor.state.doc.lastChild?.type.name, "paragraph");
  assert.equal(saves, 1);
});

for (const [ending, markdown] of [
  ["heading", "# Заголовок"],
  ["table", "| Поле | Значение |\n| --- | --- |\n| CAS | **Проверка** |"],
  ["checklist", "- [ ] Проверка\n- [x] Готово"],
  ["blockquote", "> Проверяем источник"],
  ["code block", "```ts\nconst value = 1;\n```"],
] as const) {
  it(`opening/searching/highlighting a note ending in ${ending} does not modify content or schedule autosave`, () => {
    const element = document.createElement("div"); document.body.append(element);
    let saves = 0;
    const editor = new Editor({ element, extensions: createEditorExtensions({ onEditImage() {}, onToast() {}, onOpenAttachment: async () => {}, onRevealAttachment: async () => {} }), content: markdownToTiptapDoc(markdown), onUpdate: () => { saves++; } }); editors.push(editor);
    const before = editor.getJSON();
    const persisted = serializeEditorDocumentForStorage(before, editor.getHTML());
    for (const query of ["", "Провер", ""]) editor.view.dispatch(editor.state.tr.setMeta(noteSearchKey, { query }));
    editor.view.dispatch(editor.state.tr.setMeta(fragmentNavigationKey, { from: 1, to: 3 }).setMeta("addToHistory", false));
    editor.view.dispatch(editor.state.tr.setMeta(fragmentNavigationKey, null).setMeta("addToHistory", false));
    editor.view.dispatch(editor.state.tr.setMeta("focus", { event: new dom.window.FocusEvent("focus") }));
    editor.commands.setTextSelection(1);
    assert.deepEqual(editor.getJSON(), before);
    assert.deepEqual(serializeEditorDocumentForStorage(editor.getJSON(), editor.getHTML()), persisted);
    assert.equal(saves, 0);
  });
}

it("genuine edits still append an editable paragraph and persist table sidecar changes", () => {
  const element = document.createElement("div"); document.body.append(element);
  let saves = 0;
  const editor = new Editor({ element, extensions: createEditorExtensions({ onEditImage() {}, onToast() {}, onOpenAttachment: async () => {}, onRevealAttachment: async () => {} }), content: markdownToTiptapDoc("| Поле | Значение |\n| --- | --- |\n| CAS | Проверка |"), onUpdate: () => { saves++; } }); editors.push(editor);
  const before = serializeEditorDocumentForStorage(editor.getJSON());
  let cellTextPosition = 0;
  editor.state.doc.descendants((node, position) => { if (!cellTextPosition && node.isTextblock) cellTextPosition = position + 1; });
  editor.commands.setTextSelection(cellTextPosition);
  assert.equal(editor.commands.setCellAttribute("backgroundColor", "#abcdef"), true);
  assert.equal(editor.state.doc.lastChild?.type.name, "paragraph");
  const after = serializeEditorDocumentForStorage(editor.getJSON());
  assert.notDeepEqual(after.contentSidecars, before.contentSidecars);
  assert.equal(after.contentMarkdown, before.contentMarkdown);
  assert.equal(saves, 1);
  editor.commands.insertContent("Изменение");
  assert.ok(saves > 1);
  assert.match(serializeEditorDocumentForStorage(editor.getJSON()).contentMarkdown, /Изменение/);
});
