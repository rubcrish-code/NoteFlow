import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createNotePreview } from "../src/features/notes/notePreview.ts";

describe("createNotePreview", () => {
  it("removes HTML tags and underline serialization", () => {
    const preview = createNotePreview("<p>Важный <u>подчёркнутый</u> текст</p>");

    assert.equal(preview, "Важный подчёркнутый текст");
    assert.doesNotMatch(preview, /<\/?u>/);
  });

  it("removes Markdown markers", () => {
    const preview = createNotePreview("## Заголовок\n\nТекст с **жирным**, _курсивом_ и `кодом`.");

    assert.equal(preview, "Заголовок Текст с жирным, курсивом и кодом.");
    assert.doesNotMatch(preview, /[#*_`]/);
  });

  it("cleans Markdown tables", () => {
    const preview = createNotePreview("| Имя | Статус |\n| --- | --- |\n| NoteFlow | готово |");

    assert.equal(preview, "Имя Статус NoteFlow готово");
    assert.doesNotMatch(preview, /\|/);
  });

  it("cleans lists and task list markers", () => {
    const preview = createNotePreview("- [x] Готово\n- Открыть\n1. Проверить");

    assert.equal(preview, "Готово Открыть Проверить");
    assert.doesNotMatch(preview, /\[[ xX]\]|^-/);
  });

  it("adds ellipsis after a word boundary", () => {
    const preview = createNotePreview("Раз два три четыре пять шесть", 16);

    assert.equal(preview, "Раз два три…");
  });
});
