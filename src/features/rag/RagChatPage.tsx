import { useState } from "react";
import type { AppSection } from "../../app/types";
import { ragHistory } from "../../data/mockData";
import { Icon } from "../../shared/Icon";

interface RagChatPageProps {
  onNavigate: (section: AppSection) => void;
  onNewNote: () => void;
  onToast: (message: string) => void;
}

export function RagChatPage({ onNavigate, onNewNote, onToast }: RagChatPageProps) {
  const [draft, setDraft] = useState("");

  function sendRagQuestion() {
    const trimmedDraft = draft.trim();
    if (!trimmedDraft) {
      return;
    }
    onToast(`Запрос отправлен в мок RAG: ${trimmedDraft.slice(0, 40)}`);
    setDraft("");
  }

  return (
    <div className="rag-layout">
      <aside className="sb">
        <div className="sb-brand">
          <div className="mark">
            <Icon name="logo" />
          </div>
          <span className="nm">NoteFlow</span>
          <button className="col" data-tooltip="К заметкам" onClick={() => onNavigate("notes")} type="button">
            <Icon name="back" />
          </button>
        </div>
        <button className="new-btn" onClick={() => onToast("Новый чат по базе создан в памяти")} type="button">
          <Icon name="plus" />
          <span>Новый чат по базе</span>
        </button>
        <div className="nav-sec">ИСТОРИЯ ДИАЛОГОВ</div>
        <div className="rag-history">
          {ragHistory.map((item, index) => (
            <button className={`sw-row ${index === 0 ? "sel" : ""}`} key={item} onClick={() => onToast(`Открыт диалог: ${item}`)} type="button">
              <span className="rt">{item}</span>
            </button>
          ))}
        </div>
        <div className="spacer" />
        <button className="nav-i" onClick={onNewNote} type="button">
          <Icon name="doc" />
          <span>Новая заметка</span>
        </button>
        <button className="nav-i" onClick={() => onNavigate("notes")} type="button">
          <Icon name="back" />
          <span>Вернуться к заметкам</span>
        </button>
      </aside>

      <section className="editor-col">
        <div className="ed-top">
          <div className="crumb">
            <Icon name="chat" />
            <span className="crumb-strong">ИИ-чат по базе</span>
          </div>
        </div>
        <div className="ed-scroll rag-body">
          <div className="rag-thread">
            <div className="bub-u rag-user">Что я записывал про RAG и реранкер?</div>
            <div className="rag-answer">
              <div className="rag-answer-head">
                <Icon name="logo" />
                <b>Нашёл 2 заметки по теме</b>
              </div>
              <div>
                RAG описан как пайплайн: эмбеддер строит вектора заметок, поиск достаёт кандидатов, реранкер переупорядочивает их по релевантности, и только top-5 идут
                в модель. Реранкер отмечен как ключевой шаг для точности.
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
  );
}
