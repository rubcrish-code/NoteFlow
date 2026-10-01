import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { formatKnowledgeCheckedAt, getKnowledgeStatusLabel } from "../src/features/settings/SettingsPage.tsx";

const serviceSource = readFileSync(new URL("../src/services/knowledgeService.ts", import.meta.url), "utf8");
const settingsSource = readFileSync(new URL("../src/features/settings/SettingsPage.tsx", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../src/styles/app.css", import.meta.url), "utf8");
const settingsStylesSource = readFileSync(new URL("../src/styles/settings.css", import.meta.url), "utf8");

describe("knowledge chunking frontend", () => {
  it("uses typed Tauri contracts without localStorage or direct SQL", () => {
    for (const command of [
      "get_knowledge_index_status",
      "sync_knowledge_chunks_for_note",
      "get_knowledge_chunks_by_note_id",
      "get_knowledge_chunks_by_note_ids",
      "get_neighbor_knowledge_chunks",
      "get_knowledge_chunk_state",
      "reconcile_knowledge_chunks",
      "rebuild_knowledge_chunks",
    ]) {
      assert.match(serviceSource, new RegExp(`invoke<[^>]+(?:\\[\\])?>\\(\"${command}\"`));
    }
    assert.doesNotMatch(serviceSource, /\blocalStorage\b|\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\s+FROM\b/i);
  });

  it("maps all knowledge index statuses to clear Russian labels", () => {
    assert.equal(getKnowledgeStatusLabel("current"), "Актуальна");
    assert.equal(getKnowledgeStatusLabel("pending"), "Обновляется");
    assert.equal(getKnowledgeStatusLabel("needs_update"), "Ожидает обработки");
    assert.equal(getKnowledgeStatusLabel("failed"), "Требует внимания");
  });

  it("formats the persisted check time in the user's local Russian format", () => {
    const now = new Date(2026, 6, 13, 22, 30);
    const checkedAt = new Date(2026, 6, 13, 22, 15).toISOString();

    assert.match(formatKnowledgeCheckedAt(checkedAt, now), /^сегодня, 22:15$/);
    assert.equal(formatKnowledgeCheckedAt(null, now), "Ещё не проверялась");
  });

  it("shows loading, success, failure and retry-safe controls", () => {
    assert.match(settingsSource, /knowledgeOperation !== null/);
    assert.match(settingsSource, /disabled=\{knowledgeOperation !== null\}/);
    assert.match(settingsSource, /Проверяем…/);
    assert.match(settingsSource, /Заново обрабатываем все заметки…/);
    assert.match(settingsSource, /Не удалось обновить базу знаний\. Попробуйте ещё раз/);
    assert.match(settingsSource, /finally\(\(\) =>|finally\s*\{/);
  });

  it("polls automatic status and retains recovery without an everyday update action", () => {
    assert.match(serviceSource, /lastCheckedAt\?: string \| null/);
    assert.match(serviceSource, /lastIndexedAt\?: string \| null/);
    assert.match(settingsSource, /runKnowledgeIndexOperation\(operation\)[\s\S]*getKnowledgeIndexStatus\(\)/);
    assert.doesNotMatch(settingsSource, /updateKnowledgeIndex\("reconcile"\)/);
    assert.match(settingsSource, /Новые и изменённые заметки добавляются автоматически/);
    assert.match(settingsSource, /Восстановление индекса/);
    assert.match(settingsSource, /Пересоздать базу знаний/);
    assert.match(settingsSource, /Пересоздать базу знаний\?/);
    assert.match(settingsSource, /Сами заметки и их форматирование не изменятся/);
    assert.match(settingsSource, /Всё уже актуально · изменений не найдено/);
  });

  it("keeps technical hashes, paths and embedding terminology out of the settings UI", () => {
    const dataSettings = settingsSource.slice(settingsSource.indexOf("function DataSettings"), settingsSource.indexOf("function ShortcutsSettings"));
    assert.doesNotMatch(dataSettings, /contentHash|sourceHash|chunkerVersion|system path|системн\w+ пут|embeddings?/i);
    assert.match(dataSettings, /База знаний/);
    assert.match(dataSettings, /Фрагменты заметок для ИИ-поиска/i);
  });

  it("uses the shared NoteFlow pill action styling and responsive metrics", () => {
    assert.match(settingsSource, /className="export-action primary"/);
    assert.match(settingsSource, /className="export-action secondary"/);
    assert.match(stylesSource, /\.knowledge-index-more summary[\s\S]*border-radius: var\(--button-radius\)/);
    assert.match(stylesSource, /\.knowledge-index-metrics[\s\S]*grid-template-columns: repeat\(3/);
    assert.match(settingsStylesSource, /\.settings-layout-narrow :is\(\.knowledge-index-metrics, \.provider-presets\)\s*\{\s*grid-template-columns: minmax\(0, 1fr\)/);
  });

  it("leaves the existing full-text search service available", () => {
    const searchSource = readFileSync(new URL("../src/services/searchService.ts", import.meta.url), "utf8");
    assert.match(searchSource, /invoke<SearchNoteResult\[]>\("search_notes"/);
    assert.match(searchSource, /invoke<KnowledgeDocument\[]>\("get_knowledge_documents"/);
  });
});
