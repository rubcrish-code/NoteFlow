import { useState, type CSSProperties } from "react";
import type { AppSection } from "../../app/types";
import { ragHistory } from "../../data/mockData";
import { Icon } from "../../shared/Icon";
import { ResizeHandle } from "../../shared/ResizeHandle";
import { PageShell } from "../navigation/PageShell";

interface RagChatPageProps {
  onNavigate: (section: AppSection) => void;
  onNewNote: () => void;
  onRagConversationReset: () => void;
  onRagConversationResize: (deltaX: number) => void;
  onRagSourcesCollapsedChange: (collapsed: boolean) => void;
  onRagSourcesReset: () => void;
  onRagSourcesResize: (deltaX: number) => void;
  onSidebarReset: () => void;
  onSidebarResize: (deltaX: number) => void;
  onToggleSidebarCollapse: () => void;
  ragConversationWidth: number;
  ragSourcesCollapsed: boolean;
  ragSourcesWidth: number;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  onToast: (message: string) => void;
}

type RagPageStyle = CSSProperties & {
  "--ragcw": string;
  "--ragsw": string;
};

const ragSourceCount = 2;

export function RagChatPage({
  onNavigate,
  onNewNote,
  onRagConversationReset,
  onRagConversationResize,
  onRagSourcesCollapsedChange,
  onRagSourcesReset,
  onRagSourcesResize,
  onSidebarReset,
  onSidebarResize,
  onToggleSidebarCollapse,
  onToast,
  ragConversationWidth,
  ragSourcesCollapsed,
  ragSourcesWidth,
  sidebarCollapsed,
  sidebarWidth,
}: RagChatPageProps) {
  const [draft, setDraft] = useState("");
  const [activeDialogIndex, setActiveDialogIndex] = useState(0);
  const isSourcesCollapsed = ragSourcesCollapsed;
  const hasSources = ragSourceCount > 0;

  const ragPageStyle: RagPageStyle = {
    "--ragcw": `${ragConversationWidth}px`,
    "--ragsw": `${ragSourcesWidth}px`,
  };

  function sendRagQuestion() {
    const trimmedDraft = draft.trim();
    if (!trimmedDraft) {
      return;
    }
    onToast(`Запрос отправлен в мок RAG: ${trimmedDraft.slice(0, 40)}`);
    setDraft("");
  }

  return (
    <PageShell
      activeSection="rag"
      contentClassName="rag-simple-page"
      onNavigate={onNavigate}
      onNewNote={onNewNote}
      onSidebarReset={onSidebarReset}
      onSidebarResize={onSidebarResize}
      onToggleSidebarCollapse={onToggleSidebarCollapse}
      onToast={onToast}
      sidebarCollapsed={sidebarCollapsed}
      sidebarWidth={sidebarWidth}
    >
      <div className={`rag-page ${isSourcesCollapsed ? "sources-collapsed" : ""}`} style={ragPageStyle}>
        <aside className="rag-conversations" aria-label="История диалогов">
          <button className="new-btn rag-new-chat" onClick={() => onToast("Новый чат по базе создан в памяти")} type="button">
            <Icon name="plus" />
            <span>Новый чат по базе</span>
          </button>
          <div className="nav-sec">ИСТОРИЯ ДИАЛОГОВ</div>
          <div className="rag-history">
            {ragHistory.map((item, index) => (
              <button
                className={`sw-row ${index === activeDialogIndex ? "sel" : ""}`}
                key={item}
                onClick={() => {
                  setActiveDialogIndex(index);
                  onToast(`Открыт диалог: ${item}`);
                }}
                type="button"
              >
                <span className="rt">{item}</span>
                <small>мок-история</small>
              </button>
            ))}
          </div>
        </aside>
        <ResizeHandle
          className="rag-conversation-resize"
          label="Изменить ширину истории диалогов"
          onReset={onRagConversationReset}
          onResize={onRagConversationResize}
        />

        <section className="rag-main-chat">
          <div className="ed-top rag-chat-top">
            <div className="crumb">
              <Icon name="chat" />
              <span className="crumb-strong">ИИ-чат по базе</span>
            </div>
            <div className="rag-top-actions">
              {isSourcesCollapsed ? (
                <button
                  className="ibtn ai rag-sources-open"
                  disabled={!hasSources}
                  onClick={() => onRagSourcesCollapsedChange(false)}
                  title={hasSources ? "Показать источники" : "Источников пока нет"}
                  type="button"
                >
                  <Icon name="doc" />
                  <span>{hasSources ? "Источники" : "Источников пока нет"}</span>
                </button>
              ) : null}
              <button className="ibtn ai" onClick={() => onNavigate("notes")} type="button">
                <Icon name="doc" />
                <span>К заметкам</span>
              </button>
            </div>
          </div>

          <div className="rag-chat-scroll">
            <div className="rag-thread">
              <div className="bub-u rag-user">Что я записывал про RAG и реранкер?</div>
              <div className="rag-answer">
                <div className="rag-answer-head">
                  <Icon name="logo" />
                  <b>Нашёл 2 заметки по теме</b>
                </div>
                <div>
                  RAG описан как пайплайн: эмбеддер строит вектора заметок, поиск достаёт кандидатов, реранкер переупорядочивает их по релевантности, и только top-5
                  идут в модель. Реранкер отмечен как ключевой шаг для точности.
                </div>
                <div className="rag-sources-title">ИСТОЧНИКИ</div>
                <div className="rag-sources">
                  <button className="ibtn ai" onClick={() => onNavigate("notes")} type="button">
                    <Icon name="doc" />
                    <span>Идеи для RAG-вкладки</span>
                  </button>
                  <button className="ibtn ai" onClick={() => onNavigate("notes")} type="button">
                    <Icon name="doc" />
                    <span>Архитектура проекта</span>
                  </button>
                </div>
              </div>
              <div className="rag-pipeline">embed → vector search (20) → rerank → top 5 → generate</div>
            </div>
          </div>

          <div className="rag-input-wrap">
            <div className="rag-input">
              <input
                onChange={(event) => setDraft(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    sendRagQuestion();
                  }
                }}
                placeholder="Спросить по всем заметкам…"
                value={draft}
              />
              <button className="icon-send" onClick={sendRagQuestion} type="button">
                <Icon name="send" />
              </button>
            </div>
          </div>
        </section>
        {!isSourcesCollapsed ? (
          <>
            <ResizeHandle
              className="rag-sources-resize"
              label="Изменить ширину источников RAG"
              onReset={onRagSourcesReset}
              onResize={onRagSourcesResize}
            />
            <aside className="rag-sources-panel" aria-label="Источники ответа">
              <div className="rag-sources-panel-head">
                <span className="rag-sources-panel-title">
                  <b>Источники</b>
                  <span>мок-выдача</span>
                </span>
                <button aria-label="Скрыть источники" className="rag-sources-close" onClick={() => onRagSourcesCollapsedChange(true)} type="button">
                  <Icon name="x" />
                </button>
              </div>
              <button className="rag-source-card" onClick={() => onNavigate("notes")} type="button">
                <Icon name="doc" />
                <span>
                  <b>Идеи для RAG-вкладки</b>
                  <small>Фрагмент про vector search и rerank</small>
                </span>
              </button>
              <button className="rag-source-card" onClick={() => onNavigate("notes")} type="button">
                <Icon name="doc" />
                <span>
                  <b>Архитектура проекта</b>
                  <small>Модульная структура и локальное хранение</small>
                </span>
              </button>
              <div className="rag-source-meta">
                Источники пока статические. На этапе RAG здесь появятся реальные ссылки на заметки и цитаты из индекса.
              </div>
            </aside>
          </>
        ) : null}
      </div>
    </PageShell>
  );
}
