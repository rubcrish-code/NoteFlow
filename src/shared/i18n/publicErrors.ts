import type { AppLanguage } from "../../app/types";

export const PUBLIC_ERROR_MESSAGES = {
  OPERATION_INTERRUPTED: { ru: "Операция была прервана. Попробуйте ещё раз.", en: "The operation was interrupted. Please try again." },
  DATABASE_FAILED: { ru: "Не удалось получить доступ к данным. Попробуйте ещё раз.", en: "Could not access your data. Please try again." },
  FILE_ACCESS_FAILED: { ru: "Не удалось обработать файл. Проверьте доступ и повторите попытку.", en: "Could not process the file. Check access permissions and try again." },
  SERIALIZATION_FAILED: { ru: "Не удалось обработать данные.", en: "Could not process the data." },
  NOT_FOUND: { ru: "Запрошенные данные больше не доступны.", en: "The requested data is no longer available." },
  STALE_WRITE: { ru: "Заметка уже была изменена. Загружена более новая версия.", en: "This note has changed. The newer version has been loaded." },
  REVISION_FAILED: { ru: "Не удалось сохранить историю изменений заметки.", en: "Could not save the note’s revision history." },
  SIDECAR_FAILED: { ru: "Не удалось сохранить расширенное оформление заметки.", en: "Could not save the note’s extended formatting." },
  DATABASE_WRITE_FAILED: { ru: "Не удалось сохранить изменения. Попробуйте ещё раз.", en: "Could not save changes. Please try again." },
  RESTORE_APPLIED: { ru: "Данные восстановлены. Перезапустите NoteFlow для обновления интерфейса.", en: "Data restored. Restart NoteFlow to refresh the interface." },
  OPERATION_UNAVAILABLE: { ru: "Операция временно недоступна. Попробуйте ещё раз.", en: "This operation is temporarily unavailable. Please try again." },
  PROJECT_TITLE_EXISTS: { ru: "Проект с таким названием уже существует.", en: "A project with this name already exists." },
  TITLE_TOO_LONG: { ru: "Название не должно превышать 25 символов.", en: "The name must not exceed 25 characters." },
  ATTACHMENT_EMPTY: { ru: "Файл пустой. Выберите непустой файл.", en: "This file is empty. Choose a nonempty file." },
  ATTACHMENT_TOO_LARGE: { ru: "Файл превышает допустимый размер.", en: "This file exceeds the size limit." },
  IMAGE_FORMAT_UNSUPPORTED: { ru: "Формат изображения не поддерживается. Выберите PNG, JPEG или WebP.", en: "Image format is not supported. Choose PNG, JPEG or WebP." },
  PROVIDER_TIMEOUT: { ru: "Модель не ответила вовремя. Повторите запрос.", en: "The model did not respond in time. Try again." },
  PROVIDER_UNAUTHORIZED: { ru: "Проверьте API-ключ и настройки модели.", en: "Check your API key and model settings." },
  PROVIDER_RATE_LIMITED: { ru: "Провайдер ограничил число запросов. Повторите позже.", en: "The provider’s request limit was reached. Try again later." },
  PROVIDER_UNAVAILABLE: { ru: "ИИ-модель или адрес API недоступны.", en: "The AI model or API address is unavailable." },
  INVALID_PROVIDER_RESPONSE: { ru: "Модель вернула некорректный ответ.", en: "The model returned an invalid response." },
  NETWORK_UNAVAILABLE: { ru: "Нет соединения с моделью. Проверьте её доступность.", en: "Could not connect to the model. Check that it is available." },
  INVALID_CONFIGURATION: { ru: "Проверьте введённые данные и повторите попытку.", en: "Check the settings you entered and try again." },
  IMPORT_FAILED: { ru: "Не удалось восстановить резервную копию. Текущие данные не изменены.", en: "Could not restore the backup. Your current data has not been changed." },
  BACKUP_FAILED: { ru: "Не удалось обработать резервную копию. Проверьте файл и повторите попытку.", en: "Could not process the backup. Check the file and try again." },
} satisfies Record<string, Record<AppLanguage, string>>;

export function publicErrorMessage(code: string, language: AppLanguage): string | undefined {
  return Object.prototype.hasOwnProperty.call(PUBLIC_ERROR_MESSAGES, code) ? PUBLIC_ERROR_MESSAGES[code as keyof typeof PUBLIC_ERROR_MESSAGES][language] : undefined;
}
