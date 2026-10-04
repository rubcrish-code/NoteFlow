import { useEffect, useRef, useState } from "react";
import { getDeleteAllNotesSummary, type DeleteAllNotesResult, type DeleteAllNotesSummary } from "../../services/dataService";
import { Icon } from "../../shared/Icon";
import { formatRussianCount, NOTE_COUNT_FORMS } from "../../shared/russianPlural";
import { SettingsModalShell } from "./ModelSettingsUi";

const CONFIRMATION = "УДАЛИТЬ ВСЕ ЗАМЕТКИ";

interface Props {
  disabled?: boolean;
  getSummary?: () => Promise<DeleteAllNotesSummary>;
  onDelete: () => Promise<DeleteAllNotesResult>;
  onToast: (message: string) => void;
}

export function DeleteAllNotesControl({ disabled = false, getSummary = getDeleteAllNotesSummary, onDelete, onToast }: Props) {
  const [summary, setSummary] = useState<DeleteAllNotesSummary | null>(null);
  const [phase, setPhase] = useState<"closed" | "review" | "confirm" | "deleting">("closed");
  const [phrase, setPhrase] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);
  const requestId = useRef(0);

  useEffect(() => {
    let active = true;
    let timer: number;
    function poll() {
      if (busy.current) { timer = window.setTimeout(poll, 3000); return; }
      const id = ++requestId.current;
      void getSummary().then((value) => {
        if (active && requestId.current === id) setSummary(value);
      }).catch(() => {
        if (active && requestId.current === id) setError("Не удалось получить количество заметок.");
      }).finally(() => { if (active) timer = window.setTimeout(poll, 3000); });
    }
    poll();
    return () => { active = false; requestId.current++; window.clearTimeout(timer); };
  }, [disabled, getSummary]);

  async function review() {
    if (busy.current) return;
    busy.current = true;
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const value = await getSummary();
      if (requestId.current !== id) return;
      setSummary(value);
      if (value.notes > 0) setPhase("review");
    } catch {
      if (requestId.current === id) setError("Не удалось получить количество заметок. Попробуйте ещё раз.");
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  function close() {
    if (busy.current) return;
    setPhase("closed");
    setPhrase("");
    setError("");
  }

  async function remove() {
    if (busy.current || phase !== "confirm" || phrase.trim() !== CONFIRMATION) return;
    busy.current = true;
    setPhase("deleting");
    setError("");
    try {
      const result = await onDelete();
      requestId.current++;
      setSummary({ notes: 0, archivedNotes: 0, revisions: 0, noteChats: 0, ragChats: 0 });
      setPhrase("");
      setPhase("closed");
      onToast(result.cleanupPending
        ? "Все заметки удалены. Очистка неиспользуемых вложений будет повторена при следующем запуске."
        : "Все заметки удалены.");
    } catch {
      setPhase("confirm");
      setError("Не удалось удалить заметки. Попробуйте ещё раз.");
    } finally {
      busy.current = false;
    }
  }

  const confirming = phase === "confirm" || phase === "deleting";
  return (
    <section className="settings-card bulk-delete-zone" aria-labelledby="bulk-delete-heading">
      <div className="settings-section-head">
        <div>
          <b id="bulk-delete-heading">Удаление заметок</b>
          <span>Удаляет все заметки, историю ИИ по базе и связанные данные. Проекты, теги, настройки и подключённые модели останутся.</span>
        </div>
      </div>
      <button className="danger-btn" disabled={disabled || loading || summary?.notes === 0} onClick={() => void review()} type="button">
        {loading ? <span aria-hidden="true" className="button-spinner" /> : <Icon name="x" />}
        Удалить все заметки
      </button>
      {summary?.notes === 0 ? <p className="bulk-delete-hint">Заметок пока нет.</p> : null}
      {error && phase === "closed" ? <p role="alert">{error}</p> : null}
      {phase !== "closed" ? <SettingsModalShell
        className="bulk-delete-modal"
        titleId="bulk-delete-title"
        closeDisabled={phase === "deleting"}
        onClose={close}
        title={confirming ? "Подтвердите удаление" : "Удалить все заметки?"}
        footer={(
          <div className="settings-modal-footer-actions">
            <button className="secondary-btn" disabled={phase === "deleting"} onClick={close} type="button">Отмена</button>
            {confirming ? (
              <button className="danger-btn" disabled={phase === "deleting" || phrase.trim() !== CONFIRMATION} onClick={() => void remove()} type="button">
                {phase === "deleting" ? <span aria-hidden="true" className="button-spinner" /> : null}
                {phase === "deleting" ? "Удаляем…" : "Удалить"}
              </button>
            ) : <button className="secondary-btn" onClick={() => { setPhrase(""); setPhase("confirm"); }} type="button">Продолжить</button>}
          </div>
        )}
      >
        {confirming ? (
          <label className="field full bulk-delete-confirmation">
            <span>Для подтверждения введите: <b>{CONFIRMATION}</b></span>
            <input aria-label="Подтверждение удаления всех заметок" autoComplete="off" disabled={phase === "deleting"} onChange={(event) => setPhrase(event.target.value)} value={phrase} />
          </label>
        ) : (
          <div>
            <b>Будут удалены:</b>
            <ul>
              <li>{formatRussianCount(summary?.notes ?? 0, NOTE_COUNT_FORMS)} (в архиве: {summary?.archivedNotes ?? 0});</li>
              <li>история ИИ по заметкам и базе (чатов: {(summary?.noteChats ?? 0) + (summary?.ragChats ?? 0)});</li>
              <li>версии заметок ({summary?.revisions ?? 0}) и поисковый индекс;</li>
              <li>вложения, которые больше нигде не используются.</li>
            </ul>
            <b>Останутся:</b>
            <ul><li>проекты и теги;</li><li>настройки и подключённые модели;</li><li>внешние резервные копии.</li></ul>
            <p>Все заметки будут удалены независимо от несохранённых изменений.</p>
            <p>Это действие нельзя отменить без резервной копии. Перед удалением рекомендуется создать резервную копию.</p>
          </div>
        )}
        {error ? <p role="alert">{error}</p> : null}
      </SettingsModalShell> : null}
    </section>
  );
}
