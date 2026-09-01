import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const sharedSource = readFileSync("src/features/settings/ModelSettingsUi.tsx", "utf8");
const chatSource = readFileSync("src/features/settings/SettingsPage.tsx", "utf8");
const semanticSource = readFileSync("src/features/settings/SemanticSearchSettings.tsx", "utf8");
const ragWorkspaceSource = readFileSync("src/features/rag/RagChatWorkspace.tsx", "utf8");
const serviceSource = readFileSync("src/services/embeddingService.ts", "utf8");
const rustSource = readFileSync("src-tauri/src/embedding.rs", "utf8");
const stylesSource = ["app.css", "settings.css", "rag.css"]
  .map((fileName) => readFileSync(`src/styles/${fileName}`, "utf8"))
  .join("\n");
const appShellSource = readFileSync("src/app/AppShell.tsx", "utf8");

describe("unified model settings UI", () => {
  it("shares one provider type selector across chat and semantic profiles", () => {
    assert.match(sharedSource, /export function ProviderTypeSelector/);
    assert.match(sharedSource, /role="radiogroup"/);
    assert.match(sharedSource, /role="radio"/);
    assert.match(sharedSource, /aria-checked=/);
    assert.match(chatSource, /<ProviderTypeSelector[\s\S]*options=\{providerPresets\}/);
    assert.match(semanticSource, /<ProviderTypeSelector[\s\S]*options=\{semanticProviderOptions\}/);
    for (const label of ["OpenAI", "Ollama", "LM Studio", "OpenAI-compatible"]) {
      assert.match(chatSource, new RegExp(label));
    }
    for (const label of ["Ollama", "OpenAI-compatible", "Свой API"]) {
      assert.match(semanticSource, new RegExp(label));
    }
  });

  it("uses the same section, card, empty-state and button structure", () => {
    assert.match(chatSource, /title="Модели для ИИ-помощника"/);
    assert.match(semanticSource, /title="Смысловой поиск \(RAG\)"/);
    assert.match(chatSource, /model-settings-card/);
    assert.match(semanticSource, /model-settings-card/);
    assert.match(chatSource, /model-profile-card/);
    assert.match(semanticSource, /model-profile-card/);
    assert.match(chatSource, /Модель ИИ пока не подключена/);
    assert.match(chatSource, /Подключите модель для работы ИИ-помощника и чата/);
    assert.match(semanticSource, /Смысловой поиск \(RAG\) пока не настроен/);
    assert.match(semanticSource, /Подключите локальную или облачную модель, чтобы искать заметки по смыслу/);
    for (const variant of ["primary-btn", "secondary-btn", "ghost-btn", "danger-btn"]) {
      assert.match(`${chatSource}\n${semanticSource}`, new RegExp(variant));
      assert.match(stylesSource, new RegExp(`\\.${variant}`));
    }
  });

  it("centers model buttons in normal, loading and disabled states without a leading spinner", () => {
    assert.match(stylesSource, /\.model-settings-page :is\(\.primary-btn, \.secondary-btn, \.ghost-btn, \.danger-btn\)[\s\S]*justify-content: center;[\s\S]*line-height: 1\.2;[\s\S]*text-align: center;/);
    assert.match(stylesSource, /\.model-settings-page \.loading-inline,[\s\S]*justify-content: center;[\s\S]*width: 100%;/);
    const loadingInline = chatSource.match(/function LoadingInline[\s\S]*?\n}/)?.[0] ?? "";
    assert.match(loadingInline, /className="loading-inline"/);
    assert.doesNotMatch(loadingInline, /button-spinner|::before|<Icon/);
    assert.doesNotMatch(semanticSource, /button-spinner/);
  });

  it("uses stable text-only status badges and operation rows", () => {
    assert.match(sharedSource, /export function ModelStatusBadge/);
    assert.match(sharedSource, /className=\{`status-pill model-status-badge \$\{tone\}`\}/);
    assert.doesNotMatch(sharedSource.match(/export function ModelStatusBadge[\s\S]*?\n}/)?.[0] ?? "", /<Icon|button-spinner/);
    assert.match(stylesSource, /\.model-status-badge::before,[\s\S]*content: none !important;/);
    assert.match(stylesSource, /\.model-card-operation\s*\{[\s\S]*min-height: 20px;[\s\S]*visibility: hidden;/);
    assert.match(stylesSource, /\.model-card-operation\.visible\s*\{[\s\S]*visibility: visible;/);
  });

  it("keeps frequent model actions visible and moves destructive actions into disclosure menus", () => {
    for (const label of ["Проверить подключение", "Изменить"]) {
      assert.match(chatSource, new RegExp(label));
      assert.match(semanticSource, new RegExp(label));
    }
    assert.match(chatSource, /llm-provider-card-actions model-profile-actions/);
    assert.match(semanticSource, /semantic-profile-actions model-profile-actions/);
    assert.match(chatSource, /<details className="model-card-more">[\s\S]*className="danger"[\s\S]*setProviderDeleteRequest/);
    assert.match(semanticSource, /<details className="semantic-more-actions model-card-more">[\s\S]*className="danger"[\s\S]*type: "delete"/);
  });

  it("groups semantic index maintenance and delete in one predictable disclosure menu", () => {
    const additionalActions = semanticSource.match(/<details className="semantic-more-actions model-card-more">[\s\S]*?<\/details>/)?.[0] ?? "";
    assert.match(additionalActions, /Пересоздать смысловой поиск \(RAG\)/);
    assert.match(additionalActions, /Удалить модель/);
    assert.doesNotMatch(additionalActions, /Изменить|Проверить подключение/);
  });

  it("uses the same Add model call to action in both sections", () => {
    assert.match(chatSource, /SettingsSectionHeader[\s\S]*?>\s*Добавить модель\s*<\/button>/);
    assert.match(semanticSource, /SettingsSectionHeader[\s\S]*?>\s*Добавить модель\s*<\/button>/);
    assert.doesNotMatch(chatSource, />Добавить подключение<\/button>/);
  });

  it("uses one modal shell for model forms, consent and confirmations", () => {
    assert.match(sharedSource, /export function SettingsModalShell/);
    assert.match(sharedSource, /<ModalShell/);
    assert.match(sharedSource, /bodyClassName="settings-modal-body"/);
    assert.match(sharedSource, /footerClassName="settings-modal-footer"/);
    assert.match(chatSource, /<SettingsModalShell[\s\S]*className="llm-provider-modal"/);
    assert.match(semanticSource, /<SettingsModalShell[\s\S]*className="semantic-profile-modal"/);
    assert.ok((semanticSource.match(/<SettingsModalShell/g) ?? []).length >= 3);
  });

  it("keeps semantic forms spacious and provider cards equal without title overlap", () => {
    assert.match(stylesSource, /\.semantic-profile-form\s*\{[\s\S]*gap: 16px 18px;/);
    assert.match(stylesSource, /\.provider-type-selector\s*\{[\s\S]*grid-auto-rows: 1fr;/);
    assert.match(stylesSource, /\.provider-type-option\s*\{[\s\S]*height: 100%;[\s\S]*min-height: 90px;/);
    assert.match(stylesSource, /\.provider-type-copy b,[\s\S]*overflow-wrap: break-word;[\s\S]*word-break: normal;/);
  });

  it("keeps modal scrolling, footer spacing and model loading responsive", () => {
    assert.match(stylesSource, /\.settings-modal-shell,[\s\S]*width: min\(clamp\(720px, 68vw, 820px\), calc\(100vw - 32px\)\);/);
    assert.match(stylesSource, /\.settings-modal-body\s*\{[\s\S]*overflow-x: hidden;[\s\S]*overflow-y: auto;/);
    assert.match(stylesSource, /\.settings-modal-footer\s*\{[\s\S]*border-top: 1px solid var\(--border\);/);
    assert.match(stylesSource, /@media \(max-width: 680px\)[\s\S]*\.settings-modal-shell[\s\S]*width: calc\(100vw - 24px\);/);
    assert.match(stylesSource, /@media \(max-width: 680px\)[\s\S]*\.provider-type-selector\s*\{[\s\S]*grid-template-columns: 1fr;/);
    assert.match(stylesSource, /@media \(max-width: 680px\)[\s\S]*\.model-load-control[\s\S]*flex-direction: column;/);
    assert.match(appShellSource, /"--app-viewport-height": `\$\{100 \/ zoomFactor\}vh`/);
    assert.match(stylesSource, /\.css-zoom-fallback \.settings-modal-shell\s*\{[\s\S]*max-height: calc\(var\(--app-viewport-height\) - 24px\);/);
  });

  it("keeps info popovers accessible by hover, focus, click, outside click and Escape", () => {
    assert.match(chatSource, /Эти модели создают текст: отвечают на вопросы, редактируют заметки, сокращают, объясняют/);
    assert.match(semanticSource, /Модель смыслового поиска не создаёт ответы\. Она находит связанные по смыслу фрагменты во всей базе заметок/);
    assert.match(semanticSource, /В RAG найденные фрагменты используются как источники для ответа ИИ/);
    assert.match(sharedSource, /aria-expanded=\{isOpen\}/);
    assert.match(sharedSource, /role="tooltip"/);
    assert.match(sharedSource, /setIsOpen\(\(current\) => !current\)/);
    assert.match(sharedSource, /window\.addEventListener\("pointerdown", handlePointerDown\)/);
    assert.match(sharedSource, /event\.key === "Escape"/);
    assert.match(sharedSource, /setIsDismissed\(true\)/);
    assert.match(sharedSource, /querySelector<HTMLButtonElement>\("button"\)\?\.blur\(\)/);
    assert.match(stylesSource, /\.settings-info-control:hover \.settings-info-popover/);
    assert.match(stylesSource, /\.settings-info-control:focus-within \.settings-info-popover/);
    assert.match(stylesSource, /\.settings-info-control\.dismissed \.settings-info-popover/);
  });

  it("keeps all model configuration in settings and only compact status in RAG chat", () => {
    assert.match(chatSource, /<SemanticSearchSettings onToast=\{onToast\}/);
    assert.match(chatSource, /Подключайте модели для генерации текста и смыслового поиска по базе заметок/);
    assert.doesNotMatch(ragWorkspaceSource, /<SemanticSearchSettings|ProviderTypeSelector|type="password"|API key|Base URL/);
    assert.match(ragWorkspaceSource, /aria-label="Настроить модели"/);
    assert.match(ragWorkspaceSource, /rag-model-summary/);
    assert.match(ragWorkspaceSource, /Смысловой поиск не настроен/);
    assert.doesNotMatch(ragWorkspaceSource, /rag-model-pill/);
  });

  it("loads semantic provider models with a typed command and preserves manual entry", () => {
    assert.match(serviceSource, /invoke<EmbeddingModelListResult>\("list_embedding_models"/);
    assert.match(semanticSource, /embeddingService\.listEmbeddingModels/);
    assert.match(semanticSource, /Загружаем модели…/);
    assert.match(semanticSource, /disabled=\{isLoadingModels\}/);
    assert.match(semanticSource, /modelListOperationIdRef\.current !== operationId/);
    assert.match(semanticSource, /Не удалось получить список моделей\. Укажите название вручную\./);
    assert.match(semanticSource, /placeholder="Укажите название модели"/);
    assert.match(rustSource, /"\/api\/tags"/);
    assert.match(rustSource, /"\/models"/);
    assert.match(rustSource, /timeout_seconds\.clamp\(5, 15\)/);
    assert.match(rustSource, /Эта модель не поддерживает смысловой поиск/);
  });

  it("uses RAG naming consistently and keeps technical terms out of primary labels", () => {
    assert.doesNotMatch(semanticSource, /Смысловой поиск(?! \(RAG\))/);
    assert.doesNotMatch(semanticSource, />\s*(?:embedding|vector|dimensions|cosine|BLOB|RRF)\s*</i);
  });

  it("prevents overlap at narrow layouts and high zoom", () => {
    assert.match(stylesSource, /\.model-settings-page\s*\{[\s\S]*min-width: 0/);
    assert.match(stylesSource, /\.model-profile-actions\s*\{[\s\S]*flex-wrap: wrap/);
    assert.match(stylesSource, /\.model-profile-actions button[\s\S]*white-space: normal/);
    assert.match(stylesSource, /grid-template-columns: repeat\(auto-fit, minmax\(min\(150px, 100%\), 1fr\)\)/);
    assert.match(stylesSource, /@media \(max-width: 680px\)[\s\S]*\.model-load-control[\s\S]*flex-direction: column/);
    assert.match(stylesSource, /overflow-wrap: anywhere/);
    assert.match(appShellSource, /"--app-page-padding-x"/);
    assert.match(appShellSource, /"--app-page-sidebar-max"/);
    assert.match(appShellSource, /zoomPercent > 100/);
  });
});
