import assert from "node:assert/strict";
import { after, afterEach, beforeEach, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement as h } from "react";
import type { Root } from "react-dom/client";
import {
  markdownImportTitle,
  prepareMarkdownFiles,
  prepareMarkdownText,
} from "../src/features/settings/markdownImport";

describe("Markdown import preparation", () => {
  it("keeps Russian Markdown and handles an empty file", async () => {
    const notes = await prepareMarkdownFiles([
      new File(["# Заголовок\n\nПривет 😊"], "Русская заметка.md", { type: "text/markdown" }),
      new File([""], "Пустая.md"),
    ]);
    assert.deepEqual(notes.map((note) => note.title), ["Русская заметка", "Пустая"]);
    assert.equal(notes[0].contentJson.content?.[0]?.type, "heading");
    assert.match(notes[0].contentMarkdown, /# Заголовок/);
    assert.match(notes[0].plainText, /Привет 😊/);
    assert.equal(notes[1].contentMarkdown, "");
  });

  it("keeps duplicate filenames as separate import candidates", async () => {
    const notes = await prepareMarkdownFiles([
      new File(["Первый"], "same.md"), new File(["Второй"], "same.md"),
    ]);
    assert.equal(notes.length, 2);
    assert.deepEqual(notes.map((note) => note.title), ["same", "same"]);
    assert.notEqual(notes[0].contentMarkdown, notes[1].contentMarkdown);
  });

  it("rejects invalid names and malformed UTF-8", async () => {
    assert.throws(() => markdownImportTitle("notes.txt"), /\.md/);
    await assert.rejects(
      prepareMarkdownFiles([new File([new Uint8Array([0xc3, 0x28])], "broken.md")]),
      /UTF-8/,
    );
    await assert.rejects(
      prepareMarkdownFiles([new File([new Uint8Array([0xff, 0xfe, 0x23, 0x00])], "utf16.md")]),
      /UTF-8/,
    );
    await assert.rejects(
      prepareMarkdownFiles([new File([new Uint8Array([0x23, 0x00, 0x41, 0x00])], "utf16-no-bom.md")]),
      /UTF-8/,
    );
  });

  it("removes unmanaged image and file references with a visible warning count", () => {
    const note = prepareMarkdownText("assets.md", "![Схема](./images/map.png)\n\n[файл](../docs/a.pdf)\n\n[сайт](https://example.org)");
    assert.equal(note.skippedReferences, 2);
    assert.doesNotMatch(note.contentMarkdown, /\.\/images\/|\.\.\/docs\//);
    assert.match(note.contentMarkdown, /Схема \(файл не импортирован\)/);
    assert.match(note.contentMarkdown, /\[сайт\]\(https:\/\/example\.org\)/);
  });

  it("enforces batch and size limits before reading", async () => {
    await assert.rejects(prepareMarkdownFiles([]), /от 1 до 32/);
    await assert.rejects(prepareMarkdownFiles(Array.from({ length: 33 }, (_, index) => new File([""], `${index}.md`))), /от 1 до 32/);
    await assert.rejects(prepareMarkdownFiles([new File([new Uint8Array(8 * 1024 * 1024 + 1)], "large.md")]), /слишком большие/);
  });
});

const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost", pretendToBeVisual: true });
const globals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
  window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement, HTMLInputElement: dom.window.HTMLInputElement,
  Element: dom.window.Element, Node: dom.window.Node, Event: dom.window.Event,
  KeyboardEvent: dom.window.KeyboardEvent, IS_REACT_ACT_ENVIRONMENT: true,
})) {
  globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { createRoot } = await import("react-dom/client");
const { FirstRunModal } = await import("../src/features/notes/FirstRunModal");
let root: Root;
let container: HTMLDivElement;

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

describe("first-run dialog", () => {
  it("explains local storage and validates the name before creating a note", async () => {
    let created = 0;
    await act(async () => root.render(h(FirstRunModal, {
      open: true, onClose: () => {}, onCreate: async () => { created += 1; },
    })));
    assert.match(document.body.textContent ?? "", /хранятся на этом устройстве/);
    assert.match(document.body.textContent ?? "", /Создать первую заметку/);
    await act(async () => document.querySelector<HTMLFormElement>("#first-run-form")!.requestSubmit());
    assert.equal(created, 0);
    assert.match(document.body.textContent ?? "", /Введите имя локального профиля/);
  });
});
