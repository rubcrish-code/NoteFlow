import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { EDITOR_AI_ACTION_GROUPS } from "../src/features/editor/editorAiActions";
import {
  EDITOR_TOOLBAR_ACTIONS,
  resolveEditorToolbarActions,
  type EditorToolbarActionId,
} from "../src/features/editor/editorToolbarLayout";

const formattingToolbarSource = readFileSync("src/features/editor/FormattingToolbar.tsx", "utf8");
const menuPopoverSource = readFileSync("src/shared/MenuPopover.tsx", "utf8");

describe("P1.3 final toolbar correction", () => {
  it("partitions every registered action into exactly one destination at every width", () => {
    const expectedIds = EDITOR_TOOLBAR_ACTIONS.map((action) => action.id);

    for (let width = 240; width <= 1800; width += 5) {
      const { overflowActions, visibleActions } = resolveEditorToolbarActions(width);
      const visibleIds = visibleActions.map((action) => action.id);
      const overflowIds = overflowActions.map((action) => action.id);
      const combinedIds = [...visibleIds, ...overflowIds];

      assert.equal(new Set(visibleIds).size, visibleIds.length, `duplicate visible action at ${width}px`);
      assert.equal(new Set(overflowIds).size, overflowIds.length, `duplicate overflow action at ${width}px`);
      assert.equal(combinedIds.length, expectedIds.length, `lost action at ${width}px`);
      assert.deepEqual(new Set(combinedIds), new Set(expectedIds), `wrong action partition at ${width}px`);
      assert.equal(visibleIds.some((id) => overflowIds.includes(id)), false, `overlapping action at ${width}px`);
      if (overflowActions.length === 0) {
        assert.equal(visibleActions.length, expectedIds.length);
      }
    }
  });

  it("keeps frequent actions direct and restores all actions when enough width returns", () => {
    const frequentIds: EditorToolbarActionId[] = ["undo", "p", "font", "bold", "ul", "ai"];
    const narrow = resolveEditorToolbarActions(280);
    const wide = resolveEditorToolbarActions(1800);

    for (const id of frequentIds) {
      assert.equal(narrow.visibleActions.some((action) => action.id === id), true, `${id} must stay direct`);
    }
    assert.deepEqual(wide.visibleActions.map((action) => action.id), EDITOR_TOOLBAR_ACTIONS.map((action) => action.id));
    assert.equal(wide.overflowActions.length, 0);
  });

  it("renders separators from adjacent action groups and keeps overflow selection-safe", () => {
    assert.match(formattingToolbarSource, /nextTool\.group !== tool\.group/);
    assert.match(formattingToolbarSource, /previousTool\.group !== tool\.group/);
    assert.match(formattingToolbarSource, /overflowActions\.length > 0/);
    assert.match(formattingToolbarSource, /onMouseDown=\{\(event\) => event\.preventDefault\(\)\}/);
    assert.match(menuPopoverSource, /menuitemcheckbox/);
    assert.match(menuPopoverSource, /menuitemradio/);
  });

  it("uses the final AI assistant labels without the removed ask action", () => {
    const actions = EDITOR_AI_ACTION_GROUPS.flatMap((group) => group.items);
    const labels = actions.map((action) => action.label);

    assert.equal(actions.length, 8);
    assert.equal(actions.some((action) => action.id === "expand" && action.label === "Расписать подробнее"), true);
    assert.equal(actions.some((action) => action.id === "ask"), false);
    assert.equal(labels.includes("Развернуть подробнее"), false);
    assert.equal(labels.includes("Спросить по этому тексту"), false);
    for (const label of [
      "Улучшить текст",
      "Исправить ошибки",
      "Сократить",
      "Изменить тон",
      "Сделать список задач",
      "Перевести",
      "Объяснить простыми словами",
    ]) {
      assert.equal(labels.includes(label), true);
    }
  });
});
