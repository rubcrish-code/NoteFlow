import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EditorDocument } from "../src/app/types.ts";
import {
  advancePendingSaveVersion,
  hasNewerPendingSave,
  shouldRestoreFailedSave,
} from "../src/app/noteAutosaveCoordinator.ts";
import {
  shouldReloadEditorDocument,
  type EditorDocumentLoadToken,
} from "../src/features/editor/editorDocumentReload.ts";

function documentWithText(text: string): EditorDocument {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

function token(
  contentVersion: number,
  noteId = "note-one",
  reloadGeneration = 0,
): EditorDocumentLoadToken {
  return { contentVersion, noteId, reloadGeneration };
}

describe("note persistence frontend coordination", () => {
  it("reloads an active note after restore even when the note id is unchanged", () => {
    assert.equal(
      shouldReloadEditorDocument({
        currentDocument: documentWithText("Текущая версия"),
        nextDocument: documentWithText("Восстановленная версия"),
        nextToken: token(3, "note-one", 1),
        previousToken: token(2),
      }),
      true,
    );
  });

  it("does not reload or remount the editor after an ordinary autosave", () => {
    const currentDocument = documentWithText("Последнее введённое состояние");
    assert.equal(
      shouldReloadEditorDocument({
        currentDocument,
        nextDocument: structuredClone(currentDocument),
        nextToken: token(8),
        previousToken: token(7),
      }),
      false,
    );
  });

  it("keeps repeated autosave UX independent from backend revision cadence", () => {
    const document = documentWithText("Часто сохраняемое текущее состояние");
    for (const contentVersion of [11, 12, 13]) {
      assert.equal(
        shouldReloadEditorDocument({
          currentDocument: document,
          nextDocument: structuredClone(document),
          nextToken: token(contentVersion),
          previousToken: token(contentVersion - 1),
        }),
        false,
      );
    }
    const pending = {
      expectedContentVersion: 12,
      noteId: "note-one",
      sequence: 31,
      text: "Последнее введённое состояние",
    };
    assert.deepEqual(advancePendingSaveVersion(pending, "note-one", 30, 13), {
      ...pending,
      expectedContentVersion: 13,
    });
  });

  it("reloads when switching to another note", () => {
    assert.equal(
      shouldReloadEditorDocument({
        currentDocument: documentWithText("Первая"),
        nextDocument: documentWithText("Вторая"),
        nextToken: token(0, "note-two"),
        previousToken: token(4, "note-one"),
      }),
      true,
    );
  });

  it("forces a reload after external workspace replacement even with an equal version", () => {
    assert.equal(
      shouldReloadEditorDocument({
        currentDocument: documentWithText("До import"),
        nextDocument: documentWithText("После import"),
        nextToken: token(2, "note-one", 5),
        previousToken: token(2, "note-one", 4),
      }),
      true,
    );
  });

  it("advances a newer pending save to the version committed by the preceding save", () => {
    const pending = {
      expectedContentVersion: 4,
      noteId: "note-one",
      sequence: 12,
      text: "Save B",
    };
    assert.equal(hasNewerPendingSave(pending, "note-one", 11), true);
    assert.deepEqual(advancePendingSaveVersion(pending, "note-one", 11, 5), {
      ...pending,
      expectedContentVersion: 5,
    });
  });

  it("never replaces a newer pending save with an older failed save", () => {
    const failed = { expectedContentVersion: 3, noteId: "note-one", sequence: 20 };
    const newer = { expectedContentVersion: 3, noteId: "note-one", sequence: 21 };
    assert.equal(shouldRestoreFailedSave(newer, failed), false);
  });

  it("keeps reload policy independent from chat and side-panel state", () => {
    const shellState = { chatOpen: true, focusMode: false, sourcesOpen: true };
    shouldReloadEditorDocument({
      currentDocument: documentWithText("До restore"),
      nextDocument: documentWithText("После restore"),
      nextToken: token(6),
      previousToken: token(5),
    });
    assert.deepEqual(shellState, { chatOpen: true, focusMode: false, sourcesOpen: true });
  });
});
