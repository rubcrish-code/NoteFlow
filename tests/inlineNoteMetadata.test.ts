import assert from "node:assert/strict";
import { after, afterEach, beforeEach, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement as h } from "react";
import type { Root } from "react-dom/client";
import type { NoteTag, TagRow } from "../src/app/types";

const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost", pretendToBeVisual: true });
const globals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  HTMLHeadingElement: dom.window.HTMLHeadingElement,
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
const { InlineNoteTitle } = await import("../src/features/editor/InlineNoteTitle");
const { NoteTagsInline } = await import("../src/features/editor/NoteTagsInline");
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

describe("inline note metadata", () => {
  it("edits title in place with Enter, ignores unchanged blur, and rejects an empty rename", async () => {
    const saves: string[] = [];
    let title = "Старая заметка";
    const onRename = async (_noteId: string, nextTitle: string) => { saves.push(nextTitle); title = nextTitle; };
    const render = async () => act(async () => root.render(h(InlineNoteTitle, { noteId: "note-1", onRename, title })));
    await render();
    const heading = () => container.querySelector<HTMLHeadingElement>('h1[aria-label="Название заметки"]')!;

    await act(async () => { heading().focus(); heading().blur(); });
    assert.deepEqual(saves, []);
    await act(async () => {
      heading().focus();
      heading().textContent = "  Новое имя  ";
      heading().dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    await render();
    assert.deepEqual(saves, ["Новое имя"]);
    assert.equal(heading().textContent, "Новое имя");

    await act(async () => { heading().focus(); heading().textContent = "   "; heading().blur(); });
    await render();
    assert.deepEqual(saves, ["Новое имя"]);
    assert.match(container.textContent ?? "", /Введите название/);
  });

  it("cancels an inline rename with Escape", async () => {
    const saves: string[] = [];
    await act(async () => root.render(h(InlineNoteTitle, {
      noteId: "note-1", title: "Оригинал", onRename: async (_id: string, value: string) => { saves.push(value); },
    })));
    const heading = container.querySelector<HTMLHeadingElement>("h1")!;
    await act(async () => {
      heading.focus();
      heading.textContent = "Черновик";
      heading.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    assert.equal(heading.textContent, "Оригинал");
    assert.deepEqual(saves, []);
  });

  it("adds and removes a tag only on the current note", async () => {
    const options: TagRow[] = [{ id: "tag-1", name: "Важное", color: "blue", count: 0 }];
    let tags: NoteTag[] = [];
    const operations: Array<[string, string, boolean]> = [];
    const onSetTag = async (noteId: string, tagId: string, assigned: boolean) => {
      operations.push([noteId, tagId, assigned]);
      tags = assigned ? [{ id: tagId, name: "Важное", color: "blue" }] : [];
    };
    const render = async () => act(async () => root.render(h(NoteTagsInline, {
      noteId: "note-1", tags, options, onSetTag, onMakePrimary: async () => {}, onCreateTag: async () => {},
    })));
    await render();
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Добавить тег к заметке"]')!.click());
    await act(async () => document.querySelector<HTMLButtonElement>('.ed-tag-options button')!.click());
    await render();
    assert.deepEqual(operations, [["note-1", "tag-1", true]]);
    assert.match(container.textContent ?? "", /Важное/);
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Убрать тег «Важное» с этой заметки"]')!.click());
    await render();
    assert.deepEqual(operations, [["note-1", "tag-1", true], ["note-1", "tag-1", false]]);
    assert.equal(options.length, 1);
  });

  it("opens the existing tag-creation form from the note and supports cancel", async () => {
    const created: string[] = [];
    await act(async () => root.render(h(NoteTagsInline, {
      noteId: "note-1", tags: [], options: [], onSetTag: async () => {},
      onMakePrimary: async () => {},
      onCreateTag: async (_noteId: string, value: { name: string }) => { created.push(value.name); },
    })));
    const openCreate = async () => {
      await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Добавить тег к заметке"]')!.click());
      await act(async () => document.querySelector<HTMLButtonElement>(".ed-tag-create")!.click());
      assert.ok(document.querySelector('.tag-editor-dialog[role="dialog"]'));
    };
    await openCreate();
    await act(async () => {
      const input = document.querySelector<HTMLInputElement>(".tag-editor-form input")!;
      const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "Черновик");
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
      document.querySelector<HTMLButtonElement>(".tag-editor-dialog .secondary-btn")!.click();
    });
    assert.deepEqual(created, []);
    await openCreate();
    await act(async () => {
      const input = document.querySelector<HTMLInputElement>(".tag-editor-form input")!;
      const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "Новый тег");
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    await act(async () => document.querySelector<HTMLFormElement>(".tag-editor-form")!.requestSubmit());
    assert.deepEqual(created, ["Новый тег"]);
  });
});
