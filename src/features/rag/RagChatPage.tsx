import { useState } from "react";
import type { AppSection } from "../../app/types";
import { ragHistory } from "../../data/mockData";
import { Icon } from "../../shared/Icon";
import { PageShell } from "../navigation/PageShell";

interface RagChatPageProps {
  onNavigate: (section: AppSection) => void;
  onNewNote: () => void;
  onToast: (message: string) => void;
}

export function RagChatPage({ onNavigate, onNewNote, onToast }: RagChatPageProps) {
  const [draft, setDraft] = useState("");
  const [activeDialogIndex, setActiveDialogIndex] = useState(0);

  function sendRagQuestion() {
    const trimmedDraft = draft.trim();
    if (!trimmedDraft) {
      return;
    }
    onToast(`Запрос отправлен в мок RAG: ${trimmedDraft.slice(0, 40)}`);
    setDraft("");
  }

  return (
    <PageShell activeSection="rag" contentClassName="rag-simple-page" onNavigate={onNavigate} onNewNote={onNewNote} onToast={onToast}>
      <div className="rag-page">
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

        <section className="rag-main-chat">
          <div className="ed-top rag-chat-top">
            <div className="crumb">
              <Icon name="chat" />
              <span className="crumb-strong">ИИ-чат по базе</span>
            </div>
            <button className="ibtn ai" onClick={() => onNavigate("notes")} type="button">
              <Icon name="doc" />
              <span>К заметкам</span>
            </button>
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
      </div>
    </PageShell>
  );
}
