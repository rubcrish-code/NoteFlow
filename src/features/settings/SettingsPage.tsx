import { useRef, useState } from "react";
import type { AppSection, SettingsPanel, ThemeMode } from "../../app/types";
import { PageShell } from "../navigation/PageShell";
import { APP_ZOOM_MAX, APP_ZOOM_MIN } from "../../shared/appZoom";

interface SettingsPageProps {
  appZoomPercent: number;
  theme: ThemeMode;
  onNavigate: (section: AppSection) => void;
  onNewNote: () => void;
  onBackupCreate: () => void;
  onExportCurrentNote: () => void;
  onExportCurrentProject: () => void;
  onImportBackup: (file: File) => void;
  onThemeChange: (theme: ThemeMode) => void;
  onToast: (message: string) => void;
  onZoomDecrease: () => void;
  onZoomIncrease: () => void;
  onZoomReset: () => void;
}

const settingsPanels: Array<{ id: SettingsPanel; label: string }> = [
  { id: "models", label: "Модели ИИ" },
  { id: "appearance", label: "Внешний вид" },
  { id: "language", label: "Язык" },
  { id: "data", label: "Данные и экспорт" },
  { id: "shortcuts", label: "Горячие клавиши" },
];

const providerPresets = [
  { id: "openai", label: "OpenAI-совместимый", detail: "Облачный или свой сервер", icon: "◎", url: "https://api.example.com/v1", model: "model-name" },
  { id: "ollama", label: "Ollama", detail: "Локально на компьютере", icon: "◉", url: "http://localhost:11434/v1", model: "qwen3:8b" },
  { id: "lmstudio", label: "LM Studio", detail: "Локальный OpenAI API", icon: "▣", url: "http://localhost:1234/v1", model: "local-model" },
  { id: "custom", label: "Свой API", detail: "Настраиваемые заголовки", icon: "</>", url: "http://localhost:8000/v1", model: "custom-model" },
] as const;

type ProviderPreset = (typeof providerPresets)[number];

export function SettingsPage({
  appZoomPercent,
  theme,
  onBackupCreate,
  onExportCurrentNote,
  onExportCurrentProject,
  onImportBackup,
  onNavigate,
  onNewNote,
  onThemeChange,
  onToast,
  onZoomDecrease,
  onZoomIncrease,
  onZoomReset,
}: SettingsPageProps) {
  const [activePanel, setActivePanel] = useState<SettingsPanel>("models");
  const [activeProvider, setActiveProvider] = useState<ProviderPreset>(providerPresets[0]);

  return (
    <PageShell activeSection="settings" onNavigate={onNavigate} onNewNote={onNewNote} onToast={onToast}>
      <div className="settings-layout-inner">
        <aside className="settings-nav-col">
          <div className="nav-sec">НАСТРОЙКИ</div>
          {settingsPanels.map((panel) => (
            <button className={`nav-i settings-nav ${activePanel === panel.id ? "on" : ""}`} key={panel.id} onClick={() => setActivePanel(panel.id)} type="button">
              <span>{panel.label}</span>
            </button>
          ))}
        </aside>

        <section className="settings-content">
          {activePanel === "models" ? (
            <ModelsSettings activeProvider={activeProvider} onProviderChange={setActiveProvider} onToast={onToast} />
          ) : null}
          {activePanel === "appearance" ? (
            <AppearanceSettings
              appZoomPercent={appZoomPercent}
              onThemeChange={onThemeChange}
              onToast={onToast}
              onZoomDecrease={onZoomDecrease}
              onZoomIncrease={onZoomIncrease}
              onZoomReset={onZoomReset}
              theme={theme}
            />
          ) : null}
          {activePanel === "language" ? <LanguageSettings onToast={onToast} /> : null}
          {activePanel === "data" ? (
            <DataSettings onBackupCreate={onBackupCreate} onExportCurrentNote={onExportCurrentNote} onExportCurrentProject={onExportCurrentProject} onImportBackup={onImportBackup} />
          ) : null}
          {activePanel === "shortcuts" ? <ShortcutsSettings /> : null}
        </section>
      </div>
    </PageShell>
  );
}

interface ModelsSettingsProps {
  activeProvider: ProviderPreset;
  onProviderChange: (provider: ProviderPreset) => void;
  onToast: (message: string) => void;
}

function ModelsSettings({ activeProvider, onProviderChange, onToast }: ModelsSettingsProps) {
  return (
    <div>
      <div className="settings-title">Модели ИИ</div>
      <div className="settings-subtitle">Подключите локальную или публичную модель. NoteFlow поддерживает OpenAI-совместимые API, Ollama, LM Studio и пользовательские HTTP-endpoint.</div>
      <div className="settings-card provider-card">
        <div className="settings-section-head">
          <div>
            <b>Подключение к LLM</b>
            <div className="field-help">На первом этапе это демонстрационная форма. API-ключи не сохраняются.</div>
          </div>
          <span className="status-pill">Не проверено</span>
        </div>
        <div className="provider-presets">
          {providerPresets.map((provider) => (
            <button
              className={`provider-preset ${activeProvider.id === provider.id ? "active" : ""}`}
              key={provider.id}
              onClick={() => {
                onProviderChange(provider);
                onToast(`Выбран провайдер: ${provider.label}`);
              }}
              type="button"
            >
              <span className="provider-icon">{provider.icon}</span>
              <b>{provider.label}</b>
              <small>{provider.detail}</small>
            </button>
          ))}
        </div>
        <div className="form-grid">
          <label className="field full">
            Название подключения
            <input defaultValue="Основная модель" placeholder="Например, Рабочий сервер" />
          </label>
          <label className="field full">
            Base URL
            <input value={activeProvider.url} readOnly />
            <span className="field-help">Для локальных моделей обычно используется localhost. Для OpenAI-совместимых сервисов укажите корневой URL API.</span>
          </label>
          <label className="field full">
            API key
            <div className="secret-wrap">
              <input placeholder="Введите ключ, если он требуется" type="password" />
              <button onClick={() => onToast("Показ ключа пока отключён в демо-форме")} type="button">
                Показать
              </button>
            </div>
            <span className="field-help">В production ключ будет храниться только в защищённом хранилище ОС. Здесь поле никуда не сохраняется.</span>
          </label>
          <label className="field">
            Модель чата
            <div className="input-action">
              <input value={activeProvider.model} readOnly />
              <button onClick={() => onToast("Получение моделей будет реализовано на этапе ИИ")} type="button">
                Получить модели
              </button>
            </div>
          </label>
          <label className="field">
            Embedding-модель
            <input placeholder="Необязательно, для RAG" />
          </label>
          <label className="field">
            Тайм-аут, сек.
            <input defaultValue="120" min="5" max="600" type="number" />
          </label>
          <label className="field">
            Контекст, токенов
            <input defaultValue="16384" min="1024" step="1024" type="number" />
          </label>
          <label className="field">
            Температура
            <input defaultValue="0.3" max="2" min="0" step="0.1" type="number" />
          </label>
          <label className="field switch-field">
            <span>
              <b>Потоковая выдача</b>
              <small>Показывать ответ по мере генерации</small>
            </span>
            <input defaultChecked type="checkbox" />
          </label>
        </div>
        <details className="advanced-settings">
          <summary>Дополнительные параметры</summary>
          <div className="form-grid advanced-grid">
            <label className="field full">
              Дополнительные HTTP-заголовки
              <textarea placeholder='{"X-Organization":"example"}' rows={3} />
            </label>
            <label className="field">
              Путь списка моделей
              <input defaultValue="/models" />
            </label>
            <label className="field">
              Путь чата
              <input defaultValue="/chat/completions" />
            </label>
          </div>
        </details>
        <div className="connection-actions">
          <button className="secondary-btn" onClick={() => onToast("Проверка подключения будет реализована на этапе ИИ")} type="button">
            Проверить подключение
          </button>
          <button className="primary-btn" onClick={() => onToast("Сохранение подключения пока демонстрационное")} type="button">
            Сохранить подключение
          </button>
        </div>
        <div className="connection-note">Chat-модель и embedding-модель можно будет подключать через разные соединения. Сейчас это только каркас настроек.</div>
      </div>
    </div>
  );
}

interface AppearanceSettingsProps {
  appZoomPercent: number;
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  onToast: (message: string) => void;
  onZoomDecrease: () => void;
  onZoomIncrease: () => void;
  onZoomReset: () => void;
}

function AppearanceSettings({ appZoomPercent, theme, onThemeChange, onToast, onZoomDecrease, onZoomIncrease, onZoomReset }: AppearanceSettingsProps) {
  const options: Array<{ id: ThemeMode; label: string }> = [
    { id: "light", label: "Светлая" },
    { id: "dark", label: "Тёмная" },
    { id: "system", label: "Как в системе" },
  ];

  return (
    <div>
      <div className="settings-title">Внешний вид</div>
      <div className="settings-subtitle">Тема приложения настраивается только в этом разделе.</div>
      <div className="settings-card">
        <div className="theme-options">
          {options.map((option) => (
            <button
              className={`theme-option ${theme === option.id ? "active" : ""}`}
              key={option.id}
              onClick={() => {
                onThemeChange(option.id);
                onToast(option.id === "dark" ? "Включена тёмная тема" : option.id === "system" ? "Тема синхронизирована с системой" : "Включена светлая тема");
              }}
              type="button"
            >
              <div className={`theme-preview preview-${option.id}`}>
                <div className="p-side" />
                <div className="p-main">
                  <div className="line" />
                  <div className="line short" />
                </div>
              </div>
              <b>{option.label}</b>
            </button>
          ))}
        </div>
      </div>
      <div className="settings-card zoom-settings-card">
        <div className="settings-section-head">
          <div>
            <b>Масштаб интерфейса</b>
          </div>
          <span className="zoom-current">{appZoomPercent}%</span>
        </div>
        <div className="zoom-settings-row">
          <button className="zoom-step-btn" data-tooltip="Уменьшить масштаб" disabled={appZoomPercent <= APP_ZOOM_MIN} onClick={onZoomDecrease} type="button">
            −
          </button>
          <button className="zoom-reset-btn" data-tooltip="Сбросить масштаб" onClick={onZoomReset} type="button">
            100%
          </button>
          <button className="zoom-step-btn" data-tooltip="Увеличить масштаб" disabled={appZoomPercent >= APP_ZOOM_MAX} onClick={onZoomIncrease} type="button">
            +
          </button>
        </div>
      </div>
    </div>
  );
}

function LanguageSettings({ onToast }: { onToast: (message: string) => void }) {
  return (
    <div>
      <div className="settings-title">Язык</div>
      <div className="settings-subtitle">Русский используется по умолчанию.</div>
      <div className="settings-card">
        <label className="field">
          Язык интерфейса
          <select onChange={() => onToast("Смена языка пока демонстрационная")} defaultValue="ru">
            <option value="ru">Русский</option>
            <option value="en">English</option>
          </select>
        </label>
      </div>
    </div>
  );
}

interface DataSettingsProps {
  onBackupCreate: () => void;
  onExportCurrentNote: () => void;
  onExportCurrentProject: () => void;
  onImportBackup: (file: File) => void;
}

function DataSettings({ onBackupCreate, onExportCurrentNote, onExportCurrentProject, onImportBackup }: DataSettingsProps) {
  const importInputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <div className="settings-title">Данные и экспорт</div>
      <div className="settings-subtitle">Выгрузите одну заметку, проект или всю базу.</div>
      <div className="settings-card export-card">
        <button className="tb wide" onClick={onExportCurrentNote} type="button">
          Экспорт текущей заметки
        </button>
        <button className="tb wide" onClick={onExportCurrentProject} type="button">
          Экспорт проекта
        </button>
        <button className="tb wide" onClick={onBackupCreate} type="button">
          Экспорт всей базы и вложений
        </button>
        <button className="tb wide" onClick={() => importInputRef.current?.click()} type="button">
          Импорт резервной копии
        </button>
        <input
          accept=".zip,application/zip"
          hidden
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) {
              onImportBackup(file);
            }
            event.currentTarget.value = "";
          }}
          ref={importInputRef}
          type="file"
        />
      </div>
    </div>
  );
}

function ShortcutsSettings() {
  const shortcuts = [
    ["Новая заметка", "Ctrl + N"],
    ["Поиск и команды", "Ctrl + K"],
    ["Свернуть сайдбар", "Ctrl + B"],
    ["Режим фокуса", "Ctrl + \\"],
  ] as const;

  return (
    <div>
      <div className="settings-title">Горячие клавиши</div>
      <div className="settings-subtitle">Основные сочетания для быстрой работы.</div>
      <div className="settings-card shortcuts-card">
        {shortcuts.map(([label, keys]) => (
          <div className="archive-row" key={label}>
            <span>{label}</span>
            <kbd>{keys}</kbd>
            <span />
          </div>
        ))}
      </div>
    </div>
  );
}
