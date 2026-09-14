import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { getNextSearchResultIndex, splitSearchText } from "../src/features/notes/searchText.ts";

const embeddingServiceSource = readFileSync("src/services/embeddingService.ts", "utf8");
const ragChatServiceSource = readFileSync("src/services/ragChatService.ts", "utf8");
const semanticSettingsSource = readFileSync("src/features/settings/SemanticSearchSettings.tsx", "utf8");
const settingsPageSource = readFileSync("src/features/settings/SettingsPage.tsx", "utf8");
const noteListSource = readFileSync("src/features/notes/NoteListPanel.tsx", "utf8");
const ragPageSource = readFileSync("src/features/rag/RagChatPage.tsx", "utf8");
const workspaceSource = readFileSync("src/features/rag/RagChatWorkspace.tsx", "utf8");
const appShellSource = readFileSync("src/app/AppShell.tsx", "utf8");
const editorSource = readFileSync("src/features/editor/EditorArea.tsx", "utf8");
const blockMenuSource = readFileSync("src/features/editor/BlockInsertMenu.tsx", "utf8");
const customExtensionsSource = readFileSync("src/features/editor/customExtensions.ts", "utf8");
const sidebarSource = readFileSync("src/features/navigation/MainSidebar.tsx", "utf8");
const menuPopoverSource = readFileSync("src/shared/MenuPopover.tsx", "utf8");
const floatingPositionSource = readFileSync("src/shared/useFloatingPopoverPosition.ts", "utf8");
const stylesSource = ["app.css", "pages.css", "settings.css", "rag.css"]
  .map((fileName) => readFileSync(`src/styles/${fileName}`, "utf8"))
  .join("\n");
const rustEmbeddingSource = readFileSync("src-tauri/src/embedding.rs", "utf8");
const rustDataSource = readFileSync("src-tauri/src/data.rs", "utf8");
const rustLibSource = readFileSync("src-tauri/src/lib.rs", "utf8");

describe("semantic retrieval placement and RAG chat contracts", () => {
  it("keeps typed embedding Tauri contracts without direct SQL or localStorage", () => {
    for (const command of [
      "list_embedding_profiles",
      "save_embedding_profile",
      "delete_embedding_profile",
      "accept_embedding_cloud_consent",
      "test_embedding_provider",
      "list_embedding_models",
      "get_embedding_index_status",
      "update_embedding_index",
      "rebuild_embedding_index",
      "cancel_embedding_indexing",
      "semantic_search",
      "hybrid_search",
    ]) {
      assert.match(embeddingServiceSource, new RegExp(`invoke<[^;]+>\\("${command}"`));
    }
    assert.doesNotMatch(embeddingServiceSource, /\blocalStorage\b|\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\s+FROM\b/i);
  });

  it("uses typed RAG chat commands without frontend SQL or localStorage", () => {
    for (const command of [
      "list_rag_chats",
      "create_rag_chat",
      "rename_rag_chat",
      "delete_rag_chat",
      "list_rag_chat_messages",
      "save_rag_chat_message",
    ]) {
      assert.match(ragChatServiceSource, new RegExp(`"${command}"`));
      assert.match(rustLibSource, new RegExp(`data::${command}`));
    }
    assert.doesNotMatch(ragChatServiceSource, /\blocalStorage\b|\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\s+FROM\b/i);
  });

  it("keeps the note list on the existing FTS flow only", () => {
    assert.match(noteListSource, /searchResults\.map/);
    assert.match(noteListSource, /getNextSearchResultIndex/);
    assert.match(noteListSource, /includeArchivedSearch/);
    assert.doesNotMatch(noteListSource, /SemanticSearchResult|EmbeddingProfile|semanticSearch|hybridSearch|searchMode|По смыслу|Модель смыслового поиска/);
    assert.match(appShellSource, /searchService[\s\S]*searchNotes/);
  });

  it("places both model types in Models AI settings", () => {
    assert.match(settingsPageSource, /title="Модели для ИИ-помощника"/);
    assert.match(settingsPageSource, /<SemanticSearchSettings onToast=\{onToast\}/);
    assert.match(semanticSettingsSource, /title="Смысловой поиск \(RAG\)"/);
    assert.match(settingsPageSource, /id="semantic-search-settings"/);
  });

  it("keeps provider configuration forms out of the RAG chat", () => {
    assert.doesNotMatch(workspaceSource, /SemanticSearchSettings|ProviderTypeSelector|SettingsSectionHeader|>\s*API key\s*<|>\s*Base URL\s*<|batch size/i);
    assert.match(workspaceSource, /Настроить модели/);
    assert.match(appShellSource, /setSettingsTarget\("semantic-search"\)/);
    assert.match(settingsPageSource, /getElementById\("semantic-search-settings"\)/);
  });

  it("restores a full RAG chat shell with new chat, history, composer and sources", () => {
    assert.match(ragPageSource, /<RagChatWorkspace/);
    assert.match(workspaceSource, /Новый чат/);
    assert.match(workspaceSource, /aria-label="История диалогов"/);
    assert.match(workspaceSource, /rag-chat-scroll/);
    assert.match(workspaceSource, /rag-input-wrap/);
    assert.match(workspaceSource, /aria-label="Источники ответа"/);
  });

  it("creates and switches independent persisted chats", () => {
    assert.match(workspaceSource, /ragChatService\.createRagChat/);
    assert.match(workspaceSource, /ragChatService\.listRagChats/);
    assert.match(workspaceSource, /setActiveChatId\(chat\.id\)/);
    assert.match(workspaceSource, /chat\.id === activeChatId/);
  });

  it("supports rename and delete through predictable dialogs", () => {
    assert.match(workspaceSource, /ragChatService\.renameRagChat/);
    assert.match(workspaceSource, /ragChatService\.deleteRagChat/);
    assert.match(workspaceSource, /Переименовать чат/);
    assert.match(workspaceSource, /Удалить чат\?/);
    assert.match(workspaceSource, /<SettingsModalShell/);
  });

  it("restores messages and source state when a chat is selected or reloaded", () => {
    assert.match(workspaceSource, /ragChatService\.listRagChatMessages\(activeChatId\)/);
    assert.match(workspaceSource, /setMessages\(history\)/);
    assert.match(workspaceSource, /setActiveSources\(latestSources\(history\)\)/);
    assert.match(workspaceSource, /useEffect\(\(\) => \{[\s\S]*activeChatId/);
  });

  it("performs real hybrid retrieval and persists user, assistant and sources", () => {
    assert.match(workspaceSource, /embeddingService\.hybridSearch/);
    assert.match(workspaceSource, /includeNeighbors: true/);
    assert.match(workspaceSource, /saveRagChatMessage\(chat\.id, "user", question\)/);
    assert.match(workspaceSource, /saveRagChatMessage\([\s\S]*"assistant"[\s\S]*results/);
    assert.match(ragChatServiceSource, /sources: SemanticSearchResult\[\]/);
  });

  it("does not fake a generated RAG answer before 06D", () => {
    assert.match(workspaceSource, /NoteFlow найдёт релевантные фрагменты и покажет источники для проверки/);
    assert.match(workspaceSource, /Генерация ответа на основе найденных фрагментов будет подключена на следующем этапе/);
    assert.doesNotMatch(workspaceSource, />[^<]*06D[^<]*</);
    assert.doesNotMatch(workspaceSource, /runNoteAi|run_note_ai|rerank →|vector search/);
  });

  it("keeps generator, semantic model and index state in one compact status line", () => {
    assert.match(workspaceSource, /aria-label="Состояние моделей и базы"/);
    assert.match(workspaceSource, /rag-model-summary/);
    assert.match(workspaceSource, /Модель ответа не подключена/);
    assert.match(workspaceSource, /Смысловой поиск/);
    assert.match(workspaceSource, /generatorStatus\?\.hasProvider/);
    assert.match(workspaceSource, /Смысловой поиск не настроен/);
    assert.match(workspaceSource, /indexStatusLabel\(indexStatus\)/);
    assert.doesNotMatch(workspaceSource, /rag-model-pill/);
  });

  it("loads an existing embedding profile automatically without reconfiguration", () => {
    assert.match(workspaceSource, /listEmbeddingProfiles/);
    assert.match(workspaceSource, /enabledProfiles\[0\]\?\.id/);
    assert.match(workspaceSource, /selectedProfileId/);
    assert.doesNotMatch(workspaceSource, /saveEmbeddingProfile/);
  });

  it("keeps index maintenance compact and routes cloud consent to settings", () => {
    assert.match(workspaceSource, /rag-index-compact/);
    assert.match(workspaceSource, /isUpdatingIndex \? "Обновляем…" : "Обновить"/);
    assert.match(workspaceSource, /hasCloudConsent/);
    assert.match(workspaceSource, /onOpenModelSettings\(\)/);
    assert.match(semanticSettingsSource, /acceptEmbeddingCloudConsent/);
    assert.match(semanticSettingsSource, /Пересоздать смысловой поиск \(RAG\)/);
  });

  it("uses the shared ai_chats and ai_messages tables with scope rag", () => {
    assert.match(rustDataSource, /WHERE scope = 'rag'/);
    assert.match(rustDataSource, /INSERT INTO ai_chats[\s\S]*'rag'/);
    assert.match(rustDataSource, /INSERT INTO ai_messages/);
    assert.doesNotMatch(rustDataSource, /CREATE TABLE IF NOT EXISTS rag_/);
    assert.match(rustDataSource, /rag_chat_crud_history_and_sources_persist_without_parallel_tables/);
  });

  it("opens and closes the resizable source panel and opens exact note fragments", () => {
    assert.match(workspaceSource, /onSourcesCollapsedChange\(false\)/);
    assert.match(workspaceSource, /onSourcesCollapsedChange\(true\)/);
    assert.match(workspaceSource, /onOpenResult\(source\)/);
    assert.match(workspaceSource, /<ResizeHandle[\s\S]*onResize=\{onSourcesResize\}/);
    assert.match(appShellSource, /await openNote\(result\.noteId, result\.archived\)/);
    assert.match(appShellSource, /setSemanticOpenTarget\(result\)/);
    assert.match(editorSource, /classList\.add\("semantic-search-target"\)/);
  });

  it("renders source metadata and assistant Markdown safely", () => {
    assert.match(workspaceSource, /<ChatMarkdown content=\{message\.content\}/);
    assert.match(workspaceSource, /source\.headingPath\.join/);
    assert.match(workspaceSource, /source\.project/);
    assert.match(workspaceSource, /matchLabel\(source\.matchType\)/);
    assert.doesNotMatch(workspaceSource, /dangerouslySetInnerHTML/);
  });

  it("retains safe highlight and keyboard search helpers", () => {
    assert.deepEqual(splitSearchText("Проект **NoteFlow** и смысл", "noteflow смысл"), [
      { highlighted: false, text: "Проект **" },
      { highlighted: true, text: "NoteFlow" },
      { highlighted: false, text: "** и " },
      { highlighted: true, text: "смысл" },
    ]);
    assert.equal(getNextSearchResultIndex(2, 3, "ArrowDown"), 0);
    assert.equal(getNextSearchResultIndex(0, 3, "ArrowUp"), 2);
  });

  it("keeps the profile popover portal, sidebar actions and editor mention extension intact", () => {
    assert.match(sidebarSource, /<MenuPopover/);
    assert.match(menuPopoverSource, /createPortal/);
    assert.match(menuPopoverSource, /document\.body/);
    assert.match(menuPopoverSource, /useFloatingPopoverPosition/);
    assert.match(floatingPositionSource, /getBoundingClientRect/);
    assert.match(stylesSource, /\.profile-pop\s*\{[\s\S]*position: fixed;[\s\S]*z-index: 1200;/);
    assert.match(sidebarSource, /collapsed \? "forward" : "back"/);
    assert.doesNotMatch(blockMenuSource, /block-menu-mentions|insertMention|notes\.slice/);
    assert.match(customExtensionsSource, /noteMention/);
  });

  it("retains cloud consent, cancellation and migration-backed vector storage", () => {
    assert.match(rustEmbeddingSource, /cloud_consent_at/);
    assert.match(rustEmbeddingSource, /hybrid_search/);
    assert.match(embeddingServiceSource, /cancel_embedding_indexing/);
    assert.match(rustEmbeddingSource, /embedding_profiles/);
    assert.match(rustEmbeddingSource, /knowledge_chunk_embeddings/);
  });
});
