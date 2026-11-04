import assert from "node:assert/strict";
import { after, afterEach, it } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { act, createElement as h } from "react";
import ts from "typescript";
import { JSDOM } from "jsdom";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { interfaceCatalogs, translate, setInterfaceLanguage, getInterfaceLanguage, useInterfaceLanguage, localizeSystemMessage } from "../src/shared/i18n";
import { InterfaceLanguageControl } from "../src/features/settings/InterfaceLanguageControl";
import { UI_MESSAGES, uiMessage, localizeUiMessage } from "../src/shared/uiMessages";
import { PUBLIC_ERROR_MESSAGES } from "../src/shared/i18n/publicErrors";
import { DEFAULT_UI_SETTINGS, getUiSettings, updateUiSettings } from "../src/services/uiSettingsService";
import { formatDisplayDate, formatDisplayDateTime } from "../src/shared/displayDate";
import { formatRussianCount, NOTE_COUNT_FORMS, WORD_COUNT_FORMS } from "../src/shared/russianPlural";
import { wasBackupRestoreApplied } from "../src/features/settings/backupImportFlow";
import { PublicCommandError } from "../src/services/safeInvoke";

const parameters = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
it("has complete paired catalogs and identical interpolation parameters", () => {
  assert.deepEqual(Object.keys(interfaceCatalogs.ru).sort(), Object.keys(interfaceCatalogs.en).sort());
  for (const [key, ru] of Object.entries(interfaceCatalogs.ru)) {
    const en = interfaceCatalogs.en[key as keyof typeof interfaceCatalogs.en];
    assert.ok(ru.trim() && en.trim(), key);
    assert.doesNotMatch(en, /[А-Яа-яЁё]/, key);
    assert.deepEqual(parameters(ru), parameters(en), key);
  }
  for (const resource of [...Object.values(UI_MESSAGES), ...Object.values(PUBLIC_ERROR_MESSAGES)]) {
    assert.ok(resource.en && resource.ru); assert.doesNotMatch(resource.en, /[А-Яа-яЁё]/);
  }
});

it("resolves all actual frontend translation references and their required parameters", () => {
  const failures: string[] = [];
  function scan(directory: string) {
    for (const file of readdirSync(directory, { withFileTypes: true })) {
      const path = `${directory}/${file.name}`;
      if (file.isDirectory()) scan(path);
      else if (/\.tsx?$/.test(path)) {
        const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
        function visit(node: ts.Node) {
          if (ts.isCallExpression(node) && node.expression.getText(source) === "translate") {
            const key = node.arguments[0];
            if (key && ts.isStringLiteral(key)) {
              if (!Object.hasOwn(interfaceCatalogs.ru, key.text)) failures.push(`${path}: ${key.text}`);
              else {
                const required = parameters(interfaceCatalogs.ru[key.text as keyof typeof interfaceCatalogs.ru]);
                const args = node.arguments[1];
                const actual = args && ts.isObjectLiteralExpression(args) ? args.properties.map(property => property.name?.getText(source)) : [];
                for (const name of required) if (!actual.includes(name)) failures.push(`${path}: ${key.text}.${name}`);
              }
            }
          }
          ts.forEachChild(node, visit);
        }
        visit(source);
      }
    }
  }
  scan("src"); assert.deepEqual(failures, []);
});

it("interpolates values once without evaluating nested placeholders or changing user text", () => {
  const key = Object.entries(interfaceCatalogs.ru).find(([, value]) => value === "Заметка добавлена в «{p0}»")![0] as keyof typeof interfaceCatalogs.ru;
  assert.equal(translate(key, { p0: "{p1} **Мой проект**" }, "en"), "Note added to “{p1} **Мой проект**”");
  const russian = translate(key, { p0: "Мой проект" }, "ru");
  assert.equal(localizeSystemMessage(russian, "en"), "Note added to “Мой проект”");
  assert.equal(localizeSystemMessage("Произвольный ответ модели **без изменений**", "en"), "Произвольный ответ модели **без изменений**");
});

it("formats dates and plural counts by interface locale without changing ISO values", () => {
  const iso = "2026-09-22", timestamp = new Date(2026, 8, 22, 15, 14);
  setInterfaceLanguage("ru"); assert.equal(formatDisplayDate(iso), "22.09.2026");
  assert.equal(formatDisplayDateTime(timestamp), "22.09.2026, 15:14");
  assert.deepEqual([1, 2, 5, 21].map(count => formatRussianCount(count, NOTE_COUNT_FORMS)), ["1 заметка", "2 заметки", "5 заметок", "21 заметка"]);
  assert.deepEqual([1, 2, 5, 21].map(count => formatRussianCount(count, WORD_COUNT_FORMS)), ["1 слово", "2 слова", "5 слов", "21 слово"]);
  setInterfaceLanguage("en"); assert.equal(formatDisplayDate(iso), "22/09/2026");
  assert.equal(formatDisplayDateTime(timestamp), "22/09/2026, 15:14");
  assert.deepEqual([1, 2, 21].map(count => formatRussianCount(count, NOTE_COUNT_FORMS)), ["1 note", "2 notes", "21 notes"]);
  assert.deepEqual([1, 2, 21].map(count => formatRussianCount(count, WORD_COUNT_FORMS)), ["1 word", "2 words", "21 words"]);
  assert.equal(iso, "2026-09-22");
});

it("persists only UI settings and restores the manual language selection", async () => {
  let stored = { ...DEFAULT_UI_SETTINGS, sidebarWidth: 312, chatWidth: 402, localProfileName: "Не переводить" };
  const commands: string[] = [];
  mockIPC((command, args) => {
    commands.push(command);
    if (command === "get_ui_settings") return stored;
    assert.equal(command, "update_ui_settings");
    stored = args?.request as typeof stored; return stored;
  });
  await updateUiSettings({ ...await getUiSettings(), language: "en" });
  assert.equal((await getUiSettings()).language, "en");
  assert.equal(stored.sidebarWidth, 312); assert.equal(stored.chatWidth, 402); assert.equal(stored.localProfileName, "Не переводить");
  assert.ok(commands.every(command => command.endsWith("ui_settings")));
});

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost", pretendToBeVisual: true });
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement, HTMLInputElement: dom.window.HTMLInputElement, Element: dom.window.Element, Node: dom.window.Node,
  DOMParser: dom.window.DOMParser, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
  ResizeObserver: class { observe() {} disconnect() {} }, IS_REACT_ACT_ENVIRONMENT: true })) {
  previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
dom.window.HTMLElement.prototype.scrollIntoView = () => {};
dom.window.Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
dom.window.Range.prototype.getBoundingClientRect = () => new dom.window.DOMRect();
const { createRoot } = await import("react-dom/client");
const { Editor } = await import("@tiptap/core");
const { createEditorExtensions } = await import("../src/features/editor/EditorArea");
const { FormattingToolbar } = await import("../src/features/editor/FormattingToolbar");
const { NewNoteModal } = await import("../src/features/notes/NewNoteModal");
const { MainSidebar } = await import("../src/features/navigation/MainSidebar");
const { NoteLinkPicker } = await import("../src/features/editor/NoteLinkPicker");
let root: ReturnType<typeof createRoot> | undefined;
let editor: InstanceType<typeof Editor> | undefined;
async function mount(element: ReturnType<typeof h>) { root = createRoot(document.body.appendChild(document.createElement("div"))); await act(async () => root!.render(element)); }
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; editor?.destroy(); editor = undefined; clearMocks(); document.body.replaceChildren(); setInterfaceLanguage("ru"); });
after(() => { dom.window.close(); for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } });

it("selects either language immediately through the existing store without replacing the control", async () => {
  setInterfaceLanguage("ru");
  const changes: string[] = [];
  function Harness() {
    const language = useInterfaceLanguage();
    return h("div", null, h("span", { id: "language-label" }, "Interface language"), h(InterfaceLanguageControl, {
      language, labelledBy: "language-label", onChange(next) { changes.push(next); setInterfaceLanguage(next); },
    }));
  }
  await mount(h(Harness));
  const group = document.querySelector('[role="radiogroup"]')!;
  const ru = group.querySelector<HTMLInputElement>('input[value="ru"]')!;
  const en = group.querySelector<HTMLInputElement>('input[value="en"]')!;
  assert.equal(group.getAttribute("aria-labelledby"), "language-label");
  assert.equal(ru.checked, true); assert.equal(en.checked, false);
  assert.equal(ru.name, en.name); assert.ok(ru.name);
  assert.deepEqual([...group.querySelectorAll("span")].map(node => node.textContent), ["Русский", "English"]);
  await act(async () => { en.focus(); en.click(); });
  assert.equal(getInterfaceLanguage(), "en"); assert.equal(en.checked, true); assert.equal(ru.checked, false);
  assert.equal(document.activeElement, en); assert.equal(group.getAttribute("data-language"), "en");
  assert.equal(document.querySelector('[role="radiogroup"]'), group);
  await act(async () => en.click());
  assert.deepEqual(changes, ["en"]);
  await act(async () => ru.click());
  assert.deepEqual(changes, ["en", "ru"]); assert.equal(getInterfaceLanguage(), "ru");
});

it("reflects a restored language without a spurious persistence callback", async () => {
  let writes = 0;
  await mount(h(InterfaceLanguageControl, { language: "en", labelledBy: "restored-language", onChange() { writes++; } }));
  assert.equal(document.querySelector<HTMLInputElement>('input[value="en"]')!.checked, true);
  assert.equal(writes, 0);
  assert.equal(document.querySelector("select"), null);
});

it("updates toolbar instantly without replacing controls, selection, document or history", async () => {
  setInterfaceLanguage("ru");
  editor = new Editor({ element: document.body.appendChild(document.createElement("div")), extensions: createEditorExtensions({}), content: "<p>**Пользовательский текст**</p>" });
  editor.commands.setTextSelection({ from: 1, to: 7 });
  const before = JSON.stringify(editor.getJSON()), selection = editor.state.selection.toJSON(); let updates = 0;
  editor.on("update", () => { updates++; });
  await mount(h(FormattingToolbar, { editor, aiStatus: null, onAiAction() {}, onOpenAiSettings() {} }));
  const button = document.querySelector<HTMLButtonElement>('[data-toolbar-action="bold"]')!;
  assert.equal(button.getAttribute("data-tooltip"), "Жирный (Ctrl+B)");
  await act(async () => setInterfaceLanguage("en"));
  assert.equal(button, document.querySelector('[data-toolbar-action="bold"]'));
  assert.equal(button.getAttribute("data-tooltip"), "Bold (Ctrl+B)");
  assert.equal(document.querySelectorAll(".toolbar [data-toolbar-action]").length, 31);
  assert.equal(JSON.stringify(editor.getJSON()), before); assert.deepEqual(editor.state.selection.toJSON(), selection); assert.equal(updates, 0);
  assert.equal(document.documentElement.lang, "en");
});

it("updates a mounted form and validation without losing input or focus", async () => {
  setInterfaceLanguage("ru"); await mount(h(NewNoteModal, { isOpen: true, onClose() {}, onCreate() {} }));
  const input = document.querySelector<HTMLInputElement>('input:not([type="date"])')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(input, "👩🏽‍💻".repeat(26));
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true })); input.focus();
  });
  await act(async () => setInterfaceLanguage("en"));
  assert.equal(document.activeElement, input); assert.equal(input.value, "👩🏽‍💻".repeat(26));
  assert.match(document.body.textContent!, /Maximum 25 characters/);
  assert.match(document.body.textContent!, /Create note/);
});

it("refreshes static navigation labels without translating a Russian profile name", async () => {
  setInterfaceLanguage("ru"); await mount(h(MainSidebar, { activeSection: "notes", localProfileName: "Все заметки", onEditLocalProfile() {}, onNavigate() {}, onNewNote() {}, onToast() {} }));
  await act(async () => setInterfaceLanguage("en"));
  assert.ok(document.querySelector('[aria-label="All notes"]')); assert.ok(document.querySelector('[aria-label="Knowledge chat"]'));
  assert.equal(document.querySelector(".sb-user .nm")?.textContent, "Все заметки");
});

it("localizes picker states but keeps note/project titles and query unchanged", async () => {
  const titles = [{ noteId: "qa", title: "Заметка пользователя", projectId: "project-qa", project: "Проект пользователя", archived: true }];
  mockIPC(command => { assert.equal(command, "search_notes"); return titles; });
  await mount(h(NoteLinkPicker, { onClose() {}, onChoose() {} }));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 230)); });
  await act(async () => setInterfaceLanguage("en"));
  assert.match(document.body.textContent!, /Link to note/); assert.match(document.body.textContent!, /Archived/);
  assert.match(document.body.textContent!, /Заметка пользователя/); assert.match(document.body.textContent!, /Проект пользователя/);
});

it("localizes date node views without emitting document changes or changing persisted attributes", async () => {
  setInterfaceLanguage("ru");
  editor = new Editor({ element: document.body.appendChild(document.createElement("div")), extensions: createEditorExtensions({}), content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "inlineDate", attrs: { value: "2026-09-22" } }] }] } });
  const before = JSON.stringify(editor.getJSON()); let updates = 0; editor.on("update", () => { updates++; });
  assert.match(editor.view.dom.textContent!, /22\.09\.2026/);
  await act(async () => setInterfaceLanguage("en"));
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.match(editor.view.dom.textContent!, /22\/09\/2026/);
  assert.equal(JSON.stringify(editor.getJSON()), before); assert.equal(updates, 0);
});

it("preserves named AI localization and technical identifiers in both languages", () => {
  assert.equal(uiMessage("ru", "defaultProviderNotSelected"), "Провайдер ИИ-модели по умолчанию не выбран");
  assert.equal(uiMessage("en", "defaultProviderNotSelected"), "No default AI model provider selected");
  assert.equal(getInterfaceLanguage(), "ru");
});

it("localizes backend discovery counts and embedding failure details in both directions", () => {
  assert.equal(localizeUiMessage("en", "Найдено моделей: 4"), "Models received: 4");
  assert.equal(localizeUiMessage("ru", "Models received: 4"), "Получено моделей: 4");
  for (const key of ["embeddingUnsupported", "embeddingCountMismatch", "embeddingDimensionsInvalid", "credentialStoreUnavailable", "embeddingRateLimited"] as const) {
    assert.equal(localizeUiMessage("en", UI_MESSAGES[key].ru), UI_MESSAGES[key].en);
    assert.equal(localizeUiMessage("ru", UI_MESSAGES[key].en), UI_MESSAGES[key].ru);
  }
});

it("classifies an already-applied restore by code, never by the localized error wording", () => {
  for (const locale of ["ru", "en"] as const) {
    const message = PUBLIC_ERROR_MESSAGES.RESTORE_APPLIED[locale];
    assert.equal(wasBackupRestoreApplied(new PublicCommandError("RESTORE_APPLIED", message, false)), true);
    assert.equal(wasBackupRestoreApplied(new PublicCommandError("IMPORT_FAILED", PUBLIC_ERROR_MESSAGES.IMPORT_FAILED[locale], true)), false);
  }
  assert.equal(wasBackupRestoreApplied(new Error("Unrelated failure")), false);
});
