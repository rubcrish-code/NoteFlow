import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getEditorSurfaceLayoutMode, getEditorToolbarLayoutMode } from "../src/features/editor/editorToolbarLayout";
import { getRagLayoutMode } from "../src/features/rag/ragResponsiveLayout";
import { getSettingsLayoutMode } from "../src/features/settings/settingsResponsive";
import { ChatComposer } from "../src/shared/ChatComposer";
import { getChatComposerState, shouldSubmitChatComposerKey } from "../src/shared/chatComposerState";
import { getPageLayoutMode, shouldTemporarilyHideNoteList, toPhysicalLayoutPixels } from "../src/shared/physicalLayout";

const supportedZoomLevels = [80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130, 135, 140, 145, 150, 155, 160] as const;
const appShellSource = readFileSync("src/app/AppShell.tsx", "utf8");
const noteChatSource = readFileSync("src/features/note-chat/NoteChatPanel.tsx", "utf8");
const ragChatSource = readFileSync("src/features/rag/RagChatWorkspace.tsx", "utf8");
const chatCss = readFileSync("src/styles/chat.css", "utf8");

function renderComposer(value: string, isSubmitting = false) {
  return renderToStaticMarkup(
    createElement(ChatComposer, {
      ariaLabel: "Сообщение",
      isSubmitting,
      onChange: () => undefined,
      onSubmit: () => undefined,
      placeholder: "Введите сообщение",
      value,
    }),
  );
}

describe("P1.3 physical zoom and shared composer policy", () => {
  it("normalizes every supported zoom level back to the same physical viewport", () => {
    for (const physicalWidth of [1100, 1280, 1440, 1920]) {
      for (const zoomPercent of supportedZoomLevels) {
        const cssWidth = physicalWidth / (zoomPercent / 100);
        assert.ok(Math.abs(toPhysicalLayoutPixels(cssWidth, zoomPercent) - physicalWidth) < 0.001);
      }
    }
  });

  it("selects identical page, Settings, RAG and editor modes at the same physical width", () => {
    for (const physicalWidth of [500, 600, 800, 1100, 1440]) {
      const expected = {
        editor: getEditorSurfaceLayoutMode(physicalWidth),
        page: getPageLayoutMode(physicalWidth),
        rag: getRagLayoutMode(physicalWidth),
        settings: getSettingsLayoutMode(physicalWidth),
        toolbar: getEditorToolbarLayoutMode(physicalWidth),
      };

      for (const zoomPercent of supportedZoomLevels) {
        const normalizedWidth = toPhysicalLayoutPixels(physicalWidth / (zoomPercent / 100), zoomPercent);
        assert.deepEqual(
          {
            editor: getEditorSurfaceLayoutMode(normalizedWidth),
            page: getPageLayoutMode(normalizedWidth),
            rag: getRagLayoutMode(normalizedWidth),
            settings: getSettingsLayoutMode(normalizedWidth),
            toolbar: getEditorToolbarLayoutMode(normalizedWidth),
          },
          expected,
        );
      }
    }
  });

  it("hides the note list for an open chat only from physical space policy", () => {
    const common = {
      chatOpen: true,
      chatWidth: 380,
      listWidth: 376,
      sidebarCollapsed: false,
      sidebarWidth: 250,
    };
    assert.equal(shouldTemporarilyHideNoteList({ ...common, physicalWidth: 1440 }), false);
    assert.equal(shouldTemporarilyHideNoteList({ ...common, physicalWidth: 1100 }), true);
    assert.equal(shouldTemporarilyHideNoteList({ ...common, chatOpen: false, physicalWidth: 900 }), false);
    assert.match(appShellSource, /usePhysicalViewportWidth\(appZoom\.zoomPercent\)/);
    assert.doesNotMatch(appShellSource, /app-zoom-(?:elevated|high)/);
  });

  it("uses one composer in note and RAG chat with textarea before a right-side Send button", () => {
    assert.match(noteChatSource, /<ChatComposer/);
    assert.match(ragChatSource, /<ChatComposer/);
    const markup = renderComposer("Ответ");
    assert.ok(markup.indexOf("<textarea") < markup.indexOf("chat-composer-send"));
    assert.match(chatCss, /\.chat-composer\s*\{[\s\S]*display: grid;[\s\S]*grid-template-columns: minmax\(0, 1fr\) 32px;/);
    assert.match(chatCss, /\.chat-composer-send\s*\{[\s\S]*width: 32px;/);
  });

  it("keeps Send disabled for empty text and enabled for meaningful text", () => {
    assert.deepEqual(getChatComposerState({ value: "   " }), {
      canSubmit: false,
      inputDisabled: false,
      submitLabel: "Отправить",
    });
    assert.equal(getChatComposerState({ value: "Сообщение" }).canSubmit, true);
    assert.match(renderComposer(""), /chat-composer-send[^>]*disabled/);
    assert.doesNotMatch(renderComposer("Сообщение"), /chat-composer-send[^>]*disabled/);
  });

  it("keeps loading geometry stable and exposes an explicit loading label", () => {
    const state = getChatComposerState({ isSubmitting: true, value: "Сообщение" });
    assert.equal(state.canSubmit, false);
    assert.equal(state.submitLabel, "Отправляем…");
    const markup = renderComposer("Сообщение", true);
    assert.match(markup, /aria-label="Отправляем…"/);
    assert.match(markup, /button-spinner/);
    assert.match(markup, /chat-composer-send[^>]*disabled/);
  });

  it("submits with Enter but preserves multiline and IME input", () => {
    assert.equal(shouldSubmitChatComposerKey({ isComposing: false, key: "Enter", shiftKey: false }, true), true);
    assert.equal(shouldSubmitChatComposerKey({ isComposing: false, key: "Enter", shiftKey: true }, true), false);
    assert.equal(shouldSubmitChatComposerKey({ isComposing: true, key: "Enter", shiftKey: false }, true), false);
    assert.equal(shouldSubmitChatComposerKey({ isComposing: false, key: "Enter", shiftKey: false }, false), false);
  });
});
