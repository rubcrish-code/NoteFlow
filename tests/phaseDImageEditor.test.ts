import assert from "node:assert/strict";
import { after, afterEach, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement as h } from "react";
import type { Root } from "react-dom/client";
import { Editor } from "@tiptap/core";
import type { EditorDocument } from "../src/app/types";
import { serializeEditorDocumentForStorage, buildEditorDocumentFromStoredNoteContent } from "../src/features/editor/editorContentSerializer";
import { blankDrawingSize, cropPixels, drawAnnotation, fullImageCrop, intrinsicPoint, renderImageDocument, type ImageAnnotation } from "../src/features/imageEditor/imageEditorDocument";
import { dataUrlToFile } from "../src/features/imageEditor/imageEditService";
import { attachmentErrorMessage, attachmentLimitLabel, imageFormatsLabel, validateAttachmentBytes } from "../src/services/attachmentPolicy";
import { annotationBounds, hitTestAnnotation, translateAnnotation } from "../src/features/imageEditor/annotationGeometry";

const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost", pretendToBeVisual: true });
const globals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement, HTMLInputElement: dom.window.HTMLInputElement, HTMLSelectElement: dom.window.HTMLSelectElement,
  Element: dom.window.Element, Node: dom.window.Node, ResizeObserver: class { observe() {} disconnect() {} },
  DOMParser: dom.window.DOMParser, MutationObserver: dom.window.MutationObserver,
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window), requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
  cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true,
})) { globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); }
Object.defineProperty(dom.window, "matchMedia", { value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
const { createRoot } = await import("react-dom/client");
const { ImageEditorModal } = await import("../src/features/imageEditor/ImageEditorModal");
const { ImageAnnotationCanvas } = await import("../src/features/imageEditor/ImageAnnotationCanvas");
const { DatePicker } = await import("../src/shared/DatePicker");
const { BlockInsertMenu } = await import("../src/features/editor/BlockInsertMenu");
const { NewNoteModal } = await import("../src/features/notes/NewNoteModal");
const { createEditorExtensions } = await import("../src/features/editor/EditorArea");
const editors: Editor[] = [];
dom.window.HTMLElement.prototype.scrollIntoView = () => {};
dom.window.Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
dom.window.Range.prototype.getBoundingClientRect = () => new dom.window.DOMRect();
const calls: Array<[string, ...unknown[]]> = [];
const context = new Proxy({} as CanvasRenderingContext2D, { get: (_target, key) => key === "measureText" ? (text: string) => ({ width: text.length * 12 }) : (...args: unknown[]) => calls.push([String(key), ...args]), set: (_target, key, value) => { calls.push([String(key), value]); return true; } });
dom.window.HTMLCanvasElement.prototype.getContext = (() => context) as typeof dom.window.HTMLCanvasElement.prototype.getContext;
let encodes = 0;
dom.window.HTMLCanvasElement.prototype.toDataURL = () => { encodes++; return "data:image/png;base64,iVBORw0KGgo="; };
dom.window.HTMLCanvasElement.prototype.getBoundingClientRect = () => new dom.window.DOMRect(100, 100, 600, 400);
dom.window.HTMLElement.prototype.setPointerCapture = () => {};
dom.window.HTMLElement.prototype.hasPointerCapture = () => false;
let root: Root | undefined;
afterEach(async () => { if (root) { await act(async () => root!.unmount()); root = undefined; } editors.splice(0).forEach((editor) => editor.destroy()); document.body.replaceChildren(); calls.length = 0; encodes = 0; });
after(() => { dom.window.close(); for (const [key, descriptor] of globals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } });
async function mount(component: ReturnType<typeof h>) { const element = document.createElement("div"); document.body.append(element); root = createRoot(element); await act(async () => root!.render(component)); }
async function click(label: string) { const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent === label || item.getAttribute("aria-label") === label); assert.ok(button, label); await act(async () => button.click()); return button; }
async function settlePopoverFocus() {
  for (let frame = 0; frame < 2; frame++) await act(async () => new Promise<void>((resolve) => dom.window.requestAnimationFrame(() => resolve())));
}
async function pointer(canvas: HTMLCanvasElement, type: string, x: number, y: number) { await act(async () => { const event = new dom.window.MouseEvent(type, { clientX: x, clientY: y, bubbles: true, button: 0 }); Object.defineProperty(event, "pointerId", { value: 1 }); canvas.dispatchEvent(event); }); }
async function inputValue(input: HTMLInputElement, value: string) { await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new dom.window.Event("input", { bubbles: true })); }); }
function editorFor() {
  const element = document.createElement("div"); document.body.append(element);
  const editor = new Editor({ element, content: "<p>Начало конец</p>", extensions: createEditorExtensions({ onEditImage() {}, onToast() {}, onOpenAttachment: async () => {}, onRevealAttachment: async () => {} }) });
  editors.push(editor); editor.commands.setTextSelection(8); return editor;
}

describe("Phase D intrinsic image document", () => {
  it("RC4 transfers the current processed bitmap to native clipboard and native Save As", async () => {
    const { mockIPC, clearMocks } = await import("@tauri-apps/api/mocks");
    const { copyImage, saveImage } = await import("../src/services/imageTransferService");
    const descriptors = new Map(["Image", "isTauri"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    const originalToBlob = dom.window.HTMLCanvasElement.prototype.toBlob;
    const sources: string[] = []; const requests: Array<{ command: string; args: Record<string, unknown> }> = [];
    Object.defineProperty(globalThis, "isTauri", { configurable: true, value: true });
    Object.defineProperty(globalThis, "Image", { configurable: true, value: class {
      naturalWidth = 120; naturalHeight = 80; listeners = new Map<string, () => void>();
      addEventListener(name: string, callback: () => void) { this.listeners.set(name, callback); }
      set src(value: string) { sources.push(value); queueMicrotask(() => this.listeners.get("load")?.()); }
    } });
    dom.window.HTMLCanvasElement.prototype.toBlob = (callback) => callback(new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }));
    let cancel = false;
    mockIPC((command, args) => {
      requests.push({ command, args: args as Record<string, unknown> });
      return command === "plugin:dialog|save" ? cancel ? null : "C:\\QA\\image.png" : undefined;
    });
    try {
      await copyImage("data:image/png;base64,processed");
      assert.equal(requests[0].command, "copy_image_clipboard");
      assert.deepEqual(requests[0].args.bytes, [137, 80, 78, 71]);
      assert.equal(await saveImage("data:image/png;base64,processed", "Фото.webp"), true);
      assert.equal(requests[1].command, "plugin:dialog|save");
      assert.equal((requests[1].args.options as { defaultPath: string }).defaultPath, "Фото.png");
      assert.equal(requests[2].command, "write_image_file");
      assert.deepEqual(sources, ["data:image/png;base64,processed", "data:image/png;base64,processed"]);
      cancel = true; assert.equal(await saveImage("unused-original", "Фото"), false);
      assert.equal(requests.length, 4); assert.equal(sources.length, 2);
      mockIPC(() => { throw new Error("Clipboard busy"); });
      await assert.rejects(copyImage("data:image/png;base64,processed"));
    } finally {
      clearMocks(); dom.window.HTMLCanvasElement.prototype.toBlob = originalToBlob;
      for (const [key, descriptor] of descriptors) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
    }
  });
  for (const scale of [0.5, 1, 1.6, 2]) it(`maps the pointer independently of display zoom ${scale}`, () => {
    assert.deepEqual(intrinsicPoint({ x: 10 + 600 * scale, y: 20 + 400 * scale }, { x: 10, y: 20, width: 1200 * scale, height: 800 * scale }, blankDrawingSize, fullImageCrop), { x: 600, y: 400 });
  });
  it("maps drawing after crop into original coordinates", () => {
    assert.deepEqual(intrinsicPoint({ x: 400, y: 300 }, { x: 100, y: 100, width: 600, height: 400 }, blankDrawingSize, { x: 0.25, y: 0.25, width: 0.5, height: 0.5 }), { x: 600, y: 400 });
  });
  it("rounds crop to real bitmap bounds without spilling", () => {
    assert.deepEqual(cropPixels({ width: 101, height: 51 }, { x: 0.5, y: 0.5, width: 0.5, height: 0.5 }), { x: 51, y: 26, width: 50, height: 25 });
  });
  it("rasterizes negative rectangle drags correctly", () => {
    drawAnnotation(context, { tool: "rect", points: [{ x: 90, y: 80 }, { x: 10, y: 20 }], color: "#000", width: 4 });
    assert.ok(calls.some((call) => JSON.stringify(call) === JSON.stringify(["strokeRect", 10, 20, 80, 60])));
  });
  it("uses top baseline for text placed at the clicked point", () => {
    drawAnnotation(context, { tool: "text", points: [{ x: 22, y: 40 }], text: "Русский 🙂", color: "#000", width: 4 });
    assert.ok(calls.some((call) => call[0] === "textBaseline" && call[1] === "top"));
    assert.ok(calls.some((call) => call[0] === "fillText" && call[2] === 22 && call[3] === 40));
  });
  it("scales text and arrow heads with intrinsic stroke width even for small bitmaps", () => {
    drawAnnotation(context, { tool: "text", points: [{ x: 4, y: 4 }], text: "Текст", color: "#000", width: 0.4 });
    assert.ok(calls.some((call) => call[0] === "font" && call[1] === "2px system-ui, sans-serif"));
    calls.length = 0;
    drawAnnotation(context, { tool: "arrow", points: [{ x: 4, y: 4 }, { x: 24, y: 4 }], color: "#000", width: 0.4 });
    const headStart = calls.filter((call) => call[0] === "moveTo").at(-1)!;
    assert.ok(Number(headStart[1]) > 22 && Number(headStart[1]) < 24);
  });
  it("projects crop and annotations together into the output bitmap", () => {
    const canvas = document.createElement("canvas");
    renderImageDocument(canvas, null, blankDrawingSize, { x: 0.25, y: 0.25, width: 0.5, height: 0.5 }, []);
    assert.equal(canvas.width, 600); assert.equal(canvas.height, 400);
    assert.ok(calls.some((call) => call[0] === "translate" && call[1] === -300 && call[2] === -200));
  });
  it("decodes PNG locally without fetch or CSP network access", async () => {
    const file = await dataUrlToFile("data:image/png;base64,iVBORw0KGgo=", "Рисунок.png");
    assert.equal(file.name, "Рисунок.png"); assert.equal(file.type, "image/png"); assert.deepEqual([...new Uint8Array(await file.arrayBuffer())], [137, 80, 78, 71, 13, 10, 26, 10]);
    await assert.rejects(dataUrlToFile("https://example.test/private", "x.png"));
  });
});

describe("Phase D real mounted editor interactions (canvas rendering is mocked)", () => {
  for (const tool of ["rect", "arrow", "line", "text", "pen", "marker"] as const) it(`moves existing ${tool} without creating or changing its style`, async () => {
    const original: ImageAnnotation = { tool, points: tool === "text" ? [{ x: 300, y: 250 }] : [{ x: 200, y: 200 }, { x: 400, y: 300 }], text: tool === "text" ? "Подпись" : undefined, color: "#228844", width: 4 };
    const updates: ImageAnnotation[] = []; let created = 0;
    await mount(h(ImageAnnotationCanvas, { image: null, size: blankDrawingSize, crop: fullImageCrop, annotations: [original], onCommit: () => created++, onUpdate: (index, annotation) => { assert.equal(index, 0); updates.push(annotation); }, onBusyChange() {} }));
    await click("Перемещение");
    const canvas = document.querySelector("canvas")!;
    await pointer(canvas, "pointerdown", 250, 225); assert.equal(canvas.dataset.selected, "true");
    await pointer(canvas, "pointermove", 200, 175); assert.equal(canvas.dataset.dragging, "true");
    await pointer(canvas, "pointerup", 200, 175);
    assert.equal(created, 0); assert.equal(updates.length, 1); assert.equal(encodes, 0);
    assert.deepEqual(updates[0], translateAnnotation(original, { x: -100, y: -100 }));
    assert.equal(canvas.dataset.dragging, "false");
  });
  it("selects the topmost object, rejects empty space and tests paths rather than their entire bounding box", () => {
    const line: ImageAnnotation = { tool: "line", points: [{ x: 10, y: 10 }, { x: 100, y: 100 }], color: "#000", width: 2 };
    assert.equal(hitTestAnnotation([line, line], { x: 50, y: 50 }, 3, context), 1);
    assert.equal(hitTestAnnotation([line], { x: 10, y: 100 }, 3, context), null);
    const text: ImageAnnotation = { ...line, tool: "text", points: [{ x: 20, y: 30 }], text: "Текст" };
    assert.equal(annotationBounds(text, context).width, 60);
    assert.equal(hitTestAnnotation([text], { x: 75, y: 32 }, 3, context), 0);
  });
  it("empty clicks and tool switches create nothing; pointer cancellation discards a move", async () => {
    const original: ImageAnnotation = { tool: "rect", points: [{ x: 200, y: 200 }, { x: 400, y: 400 }], color: "#000", width: 4 };
    let updates = 0, creates = 0;
    await mount(h(ImageAnnotationCanvas, { image: null, size: blankDrawingSize, crop: fullImageCrop, annotations: [original], onCommit: () => creates++, onUpdate: () => updates++, onBusyChange() {} }));
    await click("Перемещение"); const canvas = document.querySelector("canvas")!;
    await pointer(canvas, "pointerdown", 250, 250); await pointer(canvas, "pointermove", 350, 300); await pointer(canvas, "pointercancel", 350, 300);
    await pointer(canvas, "pointerdown", 650, 450); assert.equal(canvas.dataset.selected, "false");
    for (const tool of ["Стрелка", "Перемещение", "Прямоугольник", "Перемещение", "Текст"]) await click(tool);
    assert.equal(updates, 0); assert.equal(creates, 0);
  });
  it("first Escape clears selection; second Escape closes the image editor", async () => {
    let closed = 0;
    await mount(h(ImageEditorModal, { mode: "draw", src: "", title: "", onApply() {}, onClose: () => closed++ }));
    const canvas = document.querySelector("canvas")!;
    await click("Прямоугольник"); await pointer(canvas, "pointerdown", 200, 200); await pointer(canvas, "pointerup", 300, 300);
    await click("Перемещение"); await pointer(canvas, "pointerdown", 250, 250); await pointer(canvas, "pointerup", 250, 250);
    await act(async () => canvas.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    assert.equal(canvas.dataset.selected, "false"); assert.equal(closed, 0);
    await act(async () => canvas.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 150)));
    assert.equal(closed, 1);
  });
  for (const action of ["Применить", "Отмена", "Сбросить"] as const) it(`${action} respects moved document state and keeps selection out of the result`, async () => {
    let applies = 0;
    await mount(h(ImageEditorModal, { mode: "draw", src: "", title: "", onApply: () => applies++, onClose() {} }));
    const canvas = document.querySelector("canvas")!;
    await click("Прямоугольник"); await pointer(canvas, "pointerdown", 200, 200); await pointer(canvas, "pointerup", 300, 300);
    await click("Перемещение"); await pointer(canvas, "pointerdown", 250, 250); await pointer(canvas, "pointerup", 350, 275);
    if (action === "Сбросить") await click("Сбросить изменения");
    calls.length = 0;
    await click(action);
    if (action === "Применить") {
      assert.equal(applies, 1);
      assert.deepEqual(calls.filter((call) => call[0] === "strokeRect"), [["strokeRect", 400, 250, 200, 200]]);
      assert.equal(calls.some((call) => call[0] === "setLineDash"), false);
    } else {
      assert.equal(applies, 0); assert.equal(encodes, 0);
      if (action === "Сбросить") { assert.equal((await click("Сбросить изменения")).disabled, true); assert.equal((await click("Отменить штрих")).disabled, true); }
    }
  });
  it("move is one undoable operation, not a new object", async () => {
    await mount(h(ImageEditorModal, { mode: "draw", src: "", title: "", onApply() {}, onClose() {} }));
    const canvas = document.querySelector("canvas")!;
    await click("Прямоугольник"); await pointer(canvas, "pointerdown", 200, 200); await pointer(canvas, "pointerup", 300, 300);
    await click("Перемещение"); await pointer(canvas, "pointerdown", 250, 250); await pointer(canvas, "pointerup", 350, 275);
    calls.length = 0; await click("Отменить штрих");
    assert.ok(calls.some((call) => JSON.stringify(call) === JSON.stringify(["strokeRect", 200, 200, 200, 200])));
    calls.length = 0; await click("Повторить штрих");
    assert.ok(calls.some((call) => JSON.stringify(call) === JSON.stringify(["strokeRect", 400, 250, 200, 200])));
  });
  for (const color of ["#228844", "#dd2233"]) it(`shows current drawing color ${color} and numeric thickness`, async () => {
    await mount(h(ImageEditorModal, { mode: "draw", src: "", title: "", onApply() {}, onClose() {} }));
    await inputValue(document.querySelector<HTMLInputElement>('[type="color"]')!, color);
    assert.equal((document.querySelector(".drawing-stroke-range") as HTMLElement).style.getPropertyValue("--drawing-color"), color);
    assert.equal(document.querySelector("output")?.textContent, "4");
    assert.equal(document.documentElement.style.getPropertyValue("--accent"), "");
  });
  it("cancel creates no output; reset is disabled for a clean blank drawing", async () => {
    let applied = 0, closed = 0;
    await mount(h(ImageEditorModal, { mode: "draw", src: "", title: "", onApply: () => { applied++; }, onClose: () => { closed++; } }));
    assert.equal((await click("Сбросить изменения")).disabled, true);
    await click("Отмена"); assert.equal(closed, 1); assert.equal(applied, 0); assert.equal(encodes, 0);
  });
  it("draws without encoding on pointermove and confirms/reset restores initial state", async () => {
    await mount(h(ImageEditorModal, { mode: "draw", src: "", title: "", onApply() {}, onClose() {} }));
    const canvas = document.querySelector("canvas")!;
    await pointer(canvas, "pointerdown", 200, 200); await pointer(canvas, "pointermove", 300, 300); await pointer(canvas, "pointerup", 300, 300);
    assert.equal(encodes, 0);
    await click("Сбросить изменения"); assert.ok(document.body.textContent?.includes("Все изменения изображения"));
    const cancel = [...document.querySelectorAll<HTMLButtonElement>("button")].filter((button) => button.textContent === "Отмена").at(-1)!;
    await act(async () => cancel.click()); await act(async () => new Promise((resolve) => setTimeout(resolve, 150)));
    assert.equal((await click("Сбросить изменения")).disabled, false);
    await click("Сбросить");
    assert.equal((await click("Сбросить изменения")).disabled, true);
  });
  it("awaits persistence, prevents duplicate apply and keeps a failed draft open", async () => {
    let reject!: (error: Error) => void; let attempts = 0, closes = 0;
    await mount(h(ImageEditorModal, { mode: "draw", src: "", title: "", onApply: () => { attempts++; return new Promise<void>((_resolve, failure) => { reject = failure; }); }, onClose: () => { closes++; } }));
    await click("Применить"); assert.equal((await click("Сохраняем…")).disabled, true); assert.equal(attempts, 1);
    await act(async () => reject(new Error("C:\\private\\secret")));
    assert.ok(document.querySelector('[role="alert"]')?.textContent?.includes("Изменения остались"));
    assert.equal(document.body.textContent?.includes("private"), false); assert.equal(closes, 0);
  });
  it("opens a text input at the clicked canvas point and commits only on confirmation", async () => {
    const annotations: ImageAnnotation[] = [];
    await mount(h(ImageAnnotationCanvas, { image: null, size: blankDrawingSize, crop: fullImageCrop, annotations: [], onCommit: (annotation) => annotations.push(annotation), onUpdate() {}, onBusyChange() {} }));
    await click("Текст"); await pointer(document.querySelector("canvas")!, "pointerdown", 400, 300);
    const input = document.querySelector<HTMLInputElement>('[aria-label="Текст на изображении"]')!; assert.ok(input); assert.equal(annotations.length, 0);
    await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(input, "Подпись"); input.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
    // Position belongs to the original bitmap even though the displayed canvas is half size.
    assert.ok(document.querySelector("form")?.getAttribute("style")?.includes("50%"));
    await click("Добавить текст");
    assert.equal(annotations.length, 1);
    assert.equal(annotations[0].text, "Подпись");
    assert.deepEqual(annotations[0].points, [{ x: 600, y: 400 }]);
  });
  it("keeps the exact text anchor near the canvas edge while keeping its input inside", async () => {
    const annotations: ImageAnnotation[] = [];
    await mount(h(ImageAnnotationCanvas, { image: null, size: blankDrawingSize, crop: fullImageCrop, annotations: [], onCommit: (annotation) => annotations.push(annotation), onUpdate() {}, onBusyChange() {} }));
    await click("Текст"); await pointer(document.querySelector("canvas")!, "pointerdown", 670, 460);
    await inputValue(document.querySelector<HTMLInputElement>('[aria-label="Текст на изображении"]')!, "Край");
    await click("Добавить текст"); assert.deepEqual(annotations[0].points, [{ x: 1140, y: 720 }]);
  });
  it("discards cancelled pointer strokes without encoding or committing", async () => {
    const annotations: ImageAnnotation[] = [];
    await mount(h(ImageAnnotationCanvas, { image: null, size: blankDrawingSize, crop: fullImageCrop, annotations: [], onCommit: (annotation) => annotations.push(annotation), onUpdate() {}, onBusyChange() {} }));
    const canvas = document.querySelector("canvas")!; await pointer(canvas, "pointerdown", 200, 200); await pointer(canvas, "pointermove", 400, 300); await pointer(canvas, "pointercancel", 400, 300);
    assert.equal(annotations.length, 0); assert.equal(encodes, 0);
  });
});

describe("Phase D authoritative upload policy", () => {
  const policy = { maxImageBytes: 25 * 1024 * 1024, maxFileBytes: 512 * 1024 * 1024, imageMimeTypes: ["image/png", "image/jpeg", "image/webp"] };
  it("displays the actual backend limits and formats", () => { assert.equal(attachmentLimitLabel(policy.maxImageBytes), "25 МБ"); assert.equal(attachmentLimitLabel(policy.maxFileBytes), "512 МБ"); assert.equal(imageFormatsLabel(policy), "PNG, JPG / JPEG, WebP"); });
  it("validates signatures instead of trusting extensions/MIME", () => { validateAttachmentBytes(8, new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), "image", policy); assert.throws(() => validateAttachmentBytes(8, new Uint8Array(8), "image", policy)); });
  it("allows any generic extension but rejects empty and oversized files", () => { validateAttachmentBytes(1, new Uint8Array([0]), "file", policy); assert.throws(() => validateAttachmentBytes(0, new Uint8Array(), "file", policy)); assert.throws(() => validateAttachmentBytes(policy.maxImageBytes + 1, new Uint8Array(), "image", policy)); });
  it("never exposes raw paths or backend details", () => { assert.equal(attachmentErrorMessage(new Error("C:\\private SQL"), "file", policy), "Не удалось сохранить файл. Попробуйте снова."); });
});

describe("Phase D shared date picker", () => {
  for (const label of ["Месяц", "Год"]) it(`uses the shared aligned caption structure for ${label}`, async () => {
    await mount(h(DatePicker, { isOpen: true, value: "2026-10-22", onChange() {}, onOpenChange() {} }));
    const trigger = document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
    assert.ok(trigger.classList.contains("date-picker-caption-trigger"));
    assert.equal(trigger.children.length, 2);
    assert.equal(trigger.children[0].className, "date-picker-caption-label");
    assert.equal(trigger.children[0].textContent, label === "Месяц" ? "Октябрь" : "2026");
    assert.equal(trigger.children[1].tagName.toLowerCase(), "svg");
    await act(async () => trigger.click());
    assert.equal(trigger.getAttribute("aria-expanded"), "true");
    assert.equal(trigger.children[0].textContent, label === "Месяц" ? "Октябрь" : "2026");
  });
  for (const [month, year, date] of [["Март", "2022", "22.03.2022"], ["Декабрь", "2030", "22.12.2030"]]) it(`uses styled month/year popovers for ${date}`, async () => {
    let selected = "";
    await mount(h(DatePicker, { isOpen: true, value: "2026-09-22", onChange: (value) => selected = value, onOpenChange() {} }));
    await click("Месяц"); assert.ok(document.querySelector('[aria-label="Выбор месяца"]')); await click(month);
    assert.equal(document.querySelector('[aria-label="Выбор месяца"]'), null);
    await click("Год"); await click(year); await click(date);
    assert.equal(selected, year + (month === "Март" ? "-03-22" : "-12-22"));
  });
  it("year search preserves the existing wide year range without a native spinner", async () => {
    await mount(h(DatePicker, { isOpen: true, value: "2026-09-22", onChange() {}, onOpenChange() {} }));
    await click("Год"); await inputValue(document.querySelector<HTMLInputElement>('[aria-label="Перейти к году"]')!, "2400");
    await click("Выбрать год"); assert.equal(document.querySelector('[aria-label="Год"]')?.textContent, "2400");
    assert.equal(document.querySelector('[type="number"]'), null);
  });
  it("nested Escape closes year picker, then calendar, then the new-note modal", async () => {
    let closes = 0;
    await mount(h(NewNoteModal, { isOpen: true, onClose: () => closes++, onCreate() {} }));
    await act(async () => document.querySelector<HTMLButtonElement>(".date-picker-trigger")!.click());
    await click("Год");
    await act(async () => document.querySelector('[aria-label="Перейти к году"]')!.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    assert.equal(document.querySelector('[aria-label="Выбор года"]'), null); assert.ok(document.querySelector('[aria-label="Выбор даты"]')); assert.equal(closes, 0);
    await act(async () => document.activeElement!.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    assert.equal(document.querySelector('[aria-label="Выбор даты"]'), null); assert.equal(closes, 0);
    await act(async () => document.activeElement!.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 150)));
    assert.equal(closes, 1);
  });
  it("month grid supports arrows and Escape without changing the date", async () => {
    let changes = 0, closes = 0;
    await mount(h(DatePicker, { isOpen: true, value: "2026-09-22", onChange: () => changes++, onOpenChange: () => closes++ }));
    await click("Месяц"); await settlePopoverFocus();
    assert.equal(document.activeElement?.textContent, "Сентябрь");
    await act(async () => document.activeElement!.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })));
    assert.equal(document.activeElement?.textContent, "Август");
    await act(async () => document.activeElement!.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    assert.equal(document.activeElement?.getAttribute("aria-label"), "Месяц"); assert.equal(changes, 0); assert.equal(closes, 0);
  });
  it("selects month/year directly and keeps display dates Russian", async () => {
    let selected = "";
    await mount(h(DatePicker, { isOpen: true, value: "2026-09-22", onChange: (value) => { selected = value; }, onOpenChange() {} }));
    await click("Месяц"); await click("Январь");
    assert.equal(document.querySelector("select"), null);
    assert.ok(document.querySelector('[data-date="2026-01-05"]'));
    await click("05.01.2026"); assert.equal(selected, "2026-01-05");
    assert.ok(document.body.textContent?.includes("ПнВтСрЧтПтСбВс"));
    assert.ok(document.querySelector('[aria-label="Год"]'));
  });
  for (const year of ["2022", "2030"]) it(`selects year ${year} in one grid click`, async () => {
    let selected = "";
    await mount(h(DatePicker, { isOpen: true, value: "2026-09-22", onChange: (value) => { selected = value; }, onOpenChange() {} }));
    await click("Год"); await click(year);
    await click(`22.09.${year}`); assert.equal(selected, `${year}-09-22`);
  });
  it("closes on Escape and outside pointer without changing the selected date", async () => {
    const closed: boolean[] = []; let changed = false;
    await mount(h(DatePicker, { isOpen: true, value: "2026-09-22", onChange: () => { changed = true; }, onOpenChange: (open) => closed.push(open) }));
    await act(async () => document.querySelector('[data-date="2026-09-22"]')!.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    await act(async () => document.body.dispatchEvent(new dom.window.MouseEvent("pointerdown", { bubbles: true })));
    assert.deepEqual(closed, [false, false]); assert.equal(changed, false);
  });
  it("keeps month/year keyboard navigation inside the calendar and closes only when leaving it", async () => {
    const closed: boolean[] = [];
    await mount(h(DatePicker, { isOpen: true, value: "2026-09-22", onChange() {}, onOpenChange: (open) => closed.push(open) }));
    // Let the initial selected-day focus settle before exercising manual Tab navigation.
    await settlePopoverFocus();
    assert.equal(document.activeElement?.getAttribute("data-date"), "2026-09-22");
    const month = document.querySelector<HTMLButtonElement>('[aria-label="Месяц"]')!;
    const year = document.querySelector<HTMLButtonElement>('[aria-label="Год"]')!;
    await act(async () => month.focus());
    await act(async () => month.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })));
    assert.equal(document.activeElement?.getAttribute("aria-label"), "Год"); assert.deepEqual(closed, []);
    await act(async () => year.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true })));
    assert.equal(document.activeElement?.getAttribute("aria-label"), "Месяц"); assert.deepEqual(closed, []);
    const first = document.querySelector<HTMLButtonElement>('[aria-label="Предыдущий месяц"]')!;
    await act(async () => first.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true })));
    assert.deepEqual(closed, [false]);
    assert.equal(document.activeElement?.classList.contains("date-picker-trigger"), true);
  });
});

describe("Phase D real TipTap insertion and sidecar roundtrip", () => {
  it("focuses the positioned callout tile before keyboard selection", async () => {
    const editor = editorFor();
    await mount(h(BlockInsertMenu, { editor, editTarget: null, selection: { from: 8, to: 8 }, onClose() {}, onToast() {}, onPickAndStoreAttachment: async () => null }));
    await act(async () => document.querySelector<HTMLButtonElement>(".block-menu-grid button:nth-child(2)")!.click());
    await settlePopoverFocus();
    assert.equal((document.querySelector(".callout-color-palette") as HTMLElement).style.visibility, "visible");
    assert.equal(document.activeElement?.getAttribute("aria-label"), "Синяя выноска");
    await act(async () => document.activeElement!.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true })));
    assert.equal(document.activeElement?.getAttribute("aria-label"), "Зелёная выноска");
    await act(async () => (document.activeElement as HTMLButtonElement).click());
    const variants: string[] = []; editor.state.doc.descendants((node) => { if (node.type.name === "callout") variants.push(node.attrs.variant); });
    assert.deepEqual(variants, ["tip"]);
  });
  it("callout palette is labelled, defaults to blue, and Escape/outside click close only the palette", async () => {
    const editor = editorFor(); let closes = 0;
    await mount(h(BlockInsertMenu, { editor, editTarget: null, selection: { from: 8, to: 8 }, onClose: () => closes++, onToast() {}, onPickAndStoreAttachment: async () => null }));
    const trigger = document.querySelector<HTMLButtonElement>(".block-menu-grid button:nth-child(2)")!;
    await act(async () => trigger.click());
    assert.equal(document.querySelector('[aria-label="Синяя выноска"]')?.getAttribute("aria-checked"), "true");
    assert.equal(document.querySelectorAll(".callout-preview").length, 4);
    assert.equal(document.querySelector(".callout-color-swatch"), null);
    await act(async () => document.querySelector('[aria-label="Синяя выноска"]')!.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    assert.equal(document.querySelector(".callout-color-palette"), null); assert.equal(closes, 0);
    await act(async () => trigger.click()); await act(async () => document.querySelector(".block-menu-head")!.dispatchEvent(new dom.window.MouseEvent("pointerdown", { bubbles: true })));
    assert.equal(document.querySelector(".callout-color-palette"), null); assert.equal(closes, 0);
  });
  it("uses one callout action, recolors in place, and preserves text through Markdown/sidecar reload", async () => {
    const editor = editorFor();
    await mount(h(BlockInsertMenu, { editor, editTarget: null, selection: { from: 8, to: 8 }, onClose() {}, onToast() {}, onPickAndStoreAttachment: async () => null }));
    assert.equal([...document.querySelectorAll("b")].filter((element) => element.textContent === "Выноска").length, 1);
    await act(async () => document.querySelector<HTMLButtonElement>(".block-menu-grid button:nth-child(2)")!.click());
    await click("Зелёная выноска");
    let calloutPosition = 0; editor.state.doc.descendants((node, position) => { if (node.type.name === "callout") { calloutPosition = position; assert.equal(node.attrs.variant, "tip"); } });
    editor.commands.setTextSelection(calloutPosition + 2);
    await act(async () => root!.render(h(BlockInsertMenu, { key: "recolor", editor, editTarget: null, selection: { from: calloutPosition + 2, to: calloutPosition + 2 }, onClose() {}, onToast() {}, onPickAndStoreAttachment: async () => null })));
    await act(async () => document.querySelector<HTMLButtonElement>(".block-menu-grid button:nth-child(2)")!.click());
    const text = editor.getText(); await click("Красная выноска"); assert.equal(editor.getAttributes("callout").variant, "important"); assert.equal(editor.getText(), text);
    const stored = serializeEditorDocumentForStorage(editor.getJSON() as EditorDocument);
    const loaded = buildEditorDocumentFromStoredNoteContent({ contentMarkdown: stored.contentMarkdown, plainText: stored.plainText, contentJson: { type: "doc", content: [] }, contentSidecars: stored.contentSidecars.map((sidecar) => ({ ...sidecar, createdAt: "", updatedAt: "" })) }, { warn: () => assert.fail("must load canonical content") });
    editor.commands.setContent(loaded.editorDocument); editor.commands.setTextSelection(2);
    assert.equal(editor.view.dom.querySelector('.callout-important') !== null, true);
    assert.equal(editor.getText(), text);
  });
  it("inserts the selected calendar date at the captured cursor, not at the document end", async () => {
    const editor = editorFor();
    await mount(h(BlockInsertMenu, { editor, editTarget: null, selection: { from: 8, to: 8 }, onClose() {}, onToast() {}, onPickAndStoreAttachment: async () => null }));
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>(".block-menu-tools button")].find((button) => button.querySelector("b")?.textContent === "Вставить дату")!.click());
    await act(async () => document.querySelector<HTMLButtonElement>(".date-picker-trigger")!.click());
    await click("Год"); await click("2030");
    const date = document.querySelector<HTMLButtonElement>('[data-date="2030-10-05"]') ?? document.querySelector<HTMLButtonElement>('[data-date^="2030-"][data-date$="-05"]')!;
    const value = date.getAttribute("data-date"); await act(async () => date.click()); await click("Вставить");
    const content = editor.getJSON().content![0].content!;
    assert.equal(content[1].type, "inlineDate"); assert.equal(content[1].attrs?.value, value); assert.equal(content[2].text, " конец");
  });
});
