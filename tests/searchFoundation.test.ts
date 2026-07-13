import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { getNextSearchResultIndex, getSearchTerms, splitSearchText } from "../src/features/notes/searchText.ts";

const appShellSource = readFileSync("src/app/AppShell.tsx", "utf8");
const noteListSource = readFileSync("src/features/notes/NoteListPanel.tsx", "utf8");
const searchServiceSource = readFileSync("src/services/searchService.ts", "utf8");
const appCssSource = readFileSync("src/styles/app.css", "utf8");
const rustSearchSource = readFileSync("src-tauri/src/search.rs", "utf8");
const forbiddenSearchServicePersistencePattern = /\blocalStorage\b|\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\s+FROM\b/i;

describe("search foundation", () => {
  it("uses typed Tauri search and knowledge-document contracts without localStorage or SQL", () => {
    assert.match(searchServiceSource, /invoke<SearchNoteResult\[]>\("search_notes"/);
    assert.match(searchServiceSource, /invoke<RebuildSearchIndexResult>\("rebuild_search_index"/);
    assert.match(searchServiceSource, /invoke<KnowledgeDocument\[]>\("get_knowledge_documents"/);
    assert.match(searchServiceSource, /invoke<KnowledgeDocument>\("get_knowledge_document_by_note_id"/);
    assert.doesNotMatch(searchServiceSource, forbiddenSearchServicePersistencePattern);
    assert.doesNotMatch("updatedAt updateSomething selected", forbiddenSearchServicePersistencePattern);
  });

  it("debounces inline search and ignores stale asynchronous results", () => {
    assert.match(appShellSource, /window\.setTimeout\([\s\S]*?searchService[\s\S]*?180\)/);
    assert.match(appShellSource, /searchRequestIdRef\.current !== requestId/);
    assert.match(appShellSource, /searchRequestIdRef\.current === requestId/);
    assert.doesNotMatch(appShellSource, /setNotes\(results\)/);
  });

  it("exposes idle, loading, results, no-results and error states with an archive filter", () => {
    for (const state of ["idle", "searching", "results", "empty", "error"]) {
      assert.match(noteListSource, new RegExp(`"${state}"`));
    }
    assert.match(noteListSource, /includeArchivedSearch/);
    assert.match(noteListSource, /Ничего не найдено/);
    assert.match(noteListSource, /Не удалось выполнить поиск/);
    assert.match(noteListSource, /Поиск…/);
  });

  it("supports wraparound keyboard navigation and Enter/Escape actions", () => {
    assert.equal(getNextSearchResultIndex(0, 3, "ArrowDown"), 1);
    assert.equal(getNextSearchResultIndex(2, 3, "ArrowDown"), 0);
    assert.equal(getNextSearchResultIndex(0, 3, "ArrowUp"), 2);
    assert.equal(getNextSearchResultIndex(0, 0, "ArrowDown"), -1);
    assert.match(noteListSource, /event\.key === "Enter"/);
    assert.match(noteListSource, /event\.key === "Escape"/);
    assert.match(noteListSource, /onQueryChange\(""\)/);
  });

  it("highlights Russian and English query terms without rendering search HTML", () => {
    assert.deepEqual(getSearchTerms("  База: Search-* 😀  "), ["база", "search"]);
    assert.deepEqual(splitSearchText("База Knowledge Search", "база search"), [
      { highlighted: true, text: "База" },
      { highlighted: false, text: " Knowledge " },
      { highlighted: true, text: "Search" },
    ]);
    assert.doesNotMatch(noteListSource, /dangerouslySetInnerHTML/);
    assert.match(noteListSource, /<mark/);
  });

  it("keeps snippets compact and usable in themes and narrow note lists", () => {
    assert.match(appCssSource, /\.search-result-snippet[\s\S]*-webkit-line-clamp: 2/);
    assert.match(appCssSource, /overflow-wrap: anywhere/);
    assert.match(appCssSource, /color-mix\(in srgb, var\(--accent\) 18%/);
    assert.match(appCssSource, /\.note-search-filter\.on/);
  });

  it("builds a derived FTS5 index with safe parameters and weighted bm25", () => {
    assert.match(rustSearchSource, /CREATE VIRTUAL TABLE IF NOT EXISTS note_search_fts USING fts5/);
    assert.match(rustSearchSource, /tokenize = 'unicode61 remove_diacritics 2'/);
    assert.match(rustSearchSource, /bm25\(note_search_fts, 0\.0, 12\.0, 1\.0, 5\.0, 3\.0\)/);
    assert.match(rustSearchSource, /note_search_fts MATCH \?1/);
    assert.match(rustSearchSource, /SEARCH_QUERY_MAX_CHARS: usize = 256/);
    assert.doesNotMatch(rustSearchSource, /format!\("SELECT|format!\(".*MATCH/);
  });
});
