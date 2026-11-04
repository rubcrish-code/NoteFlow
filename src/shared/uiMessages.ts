import type { AppLanguage } from "../app/types";
import { localizeSystemMessage } from "./i18n";
import { PUBLIC_ERROR_MESSAGES } from "./i18n/publicErrors";

export const UI_MESSAGES = {
  interfaceLanguage: { ru: "Язык интерфейса", en: "Interface language" },
  modelResponseReceived: { ru: "Ответ модели получен", en: "Model response received" },
  embeddingConnectionWorks: { ru: "Подключение к модели смыслового поиска (RAG) работает", en: "The semantic search model (RAG) connection is working" },
  modelDiscoveryUnavailable: { ru: "Не удалось получить список моделей. Введите название модели вручную.", en: "Could not retrieve models. Enter the model name manually." },
  chatUnavailable: { ru: "Чат или исходное сообщение больше недоступны.", en: "The chat or original message is no longer available." },
  invalidCitations: { ru: "Модель не смогла корректно связать ответ с источниками. Повторите запрос.", en: "The model could not link its answer to the sources correctly. Try again." },
  answerModelNotReady: { ru: "Модель ответа не готова. Проверьте подключение в настройках.", en: "The answer model is not ready. Check its connection in Settings." },
  ragConsentRequired: { ru: "Перед отправкой фрагментов заметок подтвердите обработку выбранной моделью.", en: "Confirm processing by the selected model before sending note excerpts." },
  answerModelTimeout: { ru: "Модель не ответила вовремя. Проверьте подключение и повторите запрос.", en: "The model did not respond in time. Check the connection and try again." },
  providerForbidden: { ru: "Провайдер отклонил запрос. Проверьте доступ и настройки подключения.", en: "The provider rejected the request. Check access and connection settings." },
  groundedAnswerFailed: { ru: "Не удалось подготовить ответ с источниками.", en: "Could not prepare an answer with sources.", legacy: ["Не удалось подготовить grounded-ответ."] },
  ragProviderUnavailable: { ru: "Провайдер недоступен. Повторите запрос позже.", en: "The provider is unavailable. Try again later." },
  ragPersistenceFailed: { ru: "Ответ получен, но его не удалось безопасно сохранить.", en: "The answer was received but could not be saved safely." },
  noModelConfigured: { ru: "Модель не настроена", en: "No model configured", legacy: ["Не настроено"] },
  connectionVerified: { ru: "Подключение успешно проверено", en: "Connection verified successfully" },
  embeddingUnsupported: { ru: "Эта модель не поддерживает смысловой поиск", en: "This model does not support semantic search" },
  embeddingDisabled: { ru: "Модель смыслового поиска (RAG) отключена", en: "The semantic search model (RAG) is disabled" },
  embeddingLocalAddress: { ru: "Для локальной обработки используйте локальный или частный сетевой адрес", en: "Use a local or private network address for local processing" },
  localModelAddress: { ru: "Локальная модель должна использовать адрес localhost, 127.0.0.1 или ::1", en: "A local model must use localhost, 127.0.0.1 or ::1" },
  embeddingFormatUnsupported: { ru: "Модель вернула ответ в неподдерживаемом формате", en: "The model returned an unsupported response format" },
  embeddingEndpointUnsupported: { ru: "Сервер не поддерживает совместимый API смыслового поиска", en: "The server does not support OpenAI-compatible embeddings", legacy: ["Endpoint не поддерживает OpenAI-compatible embeddings"] },
  embeddingVectorMissing: { ru: "Модель вернула ответ без числового вектора", en: "The model response did not contain a numeric vector" },
  embeddingVectorInvalid: { ru: "Модель вернула некорректный числовой вектор", en: "The model returned an invalid numeric vector" },
  embeddingValuesInvalid: { ru: "Модель вернула некорректные значения вектора", en: "The model returned invalid vector values" },
  embeddingCountMismatch: { ru: "Количество полученных векторов не совпадает с количеством фрагментов", en: "The number of returned vectors does not match the number of excerpts" },
  embeddingDimensionsInvalid: { ru: "Модель вернула векторы с несовпадающей или некорректной размерностью", en: "The model returned vectors with inconsistent or invalid dimensions" },
  embeddingDimensionsChanged: { ru: "Размерность модели изменилась. Пересоздайте смысловой индекс", en: "The model’s dimensions have changed. Rebuild the semantic index" },
  credentialStoreUnavailable: { ru: "Безопасное хранилище ключей недоступно", en: "Secure credential storage is unavailable" },
  embeddingRequestTimeout: { ru: "Время ожидания ответа модели истекло", en: "The model request timed out" },
  modelServerUnavailable: { ru: "Сервер модели недоступен", en: "The model server is unavailable" },
  modelServerTemporary: { ru: "Сервер модели временно недоступен", en: "The model server is temporarily unavailable" },
  embeddingRateLimited: { ru: "Провайдер временно ограничил частоту запросов", en: "The provider has temporarily limited the request rate" },
  embeddingRequestFailed: { ru: "Провайдер не выполнил запрос смыслового поиска (RAG)", en: "The provider could not complete the semantic search request (RAG)" },
  modelsReceived: { ru: "Получено моделей: {count}", en: "Models received: {count}" },
  noteChatChooseDefaultProvider: {
    ru: "Выберите провайдера ИИ-модели по умолчанию в настройках, чтобы задавать вопросы по текущей заметке.",
    en: "Choose a default provider in Settings to ask questions about the current note.",
  },
  defaultProviderNotSelected: {
    ru: "Провайдер ИИ-модели по умолчанию не выбран",
    en: "No default AI model provider selected",
    legacy: ["Default LLM provider не выбран"],
  },
  chooseDefaultProvider: {
    ru: "Сначала выберите провайдера ИИ-модели по умолчанию в настройках моделей",
    en: "First choose a default AI model provider in model settings",
    legacy: ["Выберите default LLM provider в настройках моделей.", "Сначала выберите default LLM provider в настройках моделей"],
  },
  chatModelRequired: {
    ru: "Выберите или введите ИИ-модель для чата.", en: "Select or enter an AI model for chat.",
    legacy: ["Выберите или введите chat model.", "Для чата не выбрана модель"],
  },
  externalProviderKeyRequired: {
    ru: "Для внешнего провайдера ИИ-модели нужен API-ключ.", en: "An API key is required for an external AI model provider.",
    legacy: ["Для внешнего provider нужен API key.", "Для внешнего провайдера нужен API key", "API key missing: для внешнего LLM provider нужен сохранённый ключ"],
  },
  confirmAiPrivacy: {
    ru: "Перед отправкой текста подтвердите предупреждение о передаче данных.", en: "Confirm the data-sharing notice before sending text.",
    legacy: ["Перед первым AI-запросом подтвердите предупреждение о передаче текста", "Перед отправкой текста подтвердите предупреждение AI privacy", "Подтвердите предупреждение AI privacy перед отправкой текста"],
  },
  noteAiReady: { ru: "ИИ-модель готова к работе с текущей заметкой", en: "The AI model is ready to work with this note", legacy: ["AI по текущей заметке готов"] },
  localAiModel: { ru: "Локальная модель", en: "Local model" },
  externalAiProvider: { ru: "Внешний провайдер ИИ-модели", en: "External AI model provider", legacy: ["Внешний AI provider"] },
  aiModelLabel: { ru: "ИИ-модель", en: "AI model" },
  aiModelNotConnected: { ru: "ИИ-модель не подключена", en: "AI model not connected" },
  aiPrivacySaveFailed: { ru: "Не удалось сохранить подтверждение передачи данных. Попробуйте ещё раз.", en: "Could not save the data-sharing confirmation. Please try again." },
  localProviderPrivacy: {
    ru: "Локальная модель: данные остаются на устройстве, если сервер действительно запущен локально.",
    en: "Local model: data stays on this device if the server is actually running locally.",
    legacy: ["Локальный endpoint: данные остаются на устройстве, если сервер действительно запущен локально."],
  },
  externalProviderPrivacy: {
    ru: "Внешняя модель: выбранный контекст будет отправлен провайдеру.", en: "External model: the selected context will be sent to the provider.",
    legacy: ["Внешний endpoint: при использовании модели выбранный контекст будет отправлен провайдеру."],
  },
  invalidModelsResponse: { ru: "Провайдер ИИ-модели вернул некорректный список моделей.", en: "The AI model provider returned an invalid model list.", legacy: ["LLM provider returned an unexpected models DTO."] },
  invalidConnectionResponse: { ru: "Провайдер ИИ-модели вернул некорректный результат проверки подключения.", en: "The AI model provider returned an invalid connection-test result.", legacy: ["LLM provider returned an unexpected connection-test DTO."] },
  modelsListTimeout: { ru: "Не удалось получить список моделей вовремя. Проверьте адрес API и доступность сервера.", en: "The model list request timed out. Check the API address and server availability.", legacy: ["Timeout: список моделей не был получен вовремя. Проверьте Base URL, endpoint и состояние локального сервера."] },
  modelsListTimeout15s: { ru: "Не удалось получить список моделей за 15 секунд. Проверьте адрес API и доступность сервера.", en: "Could not retrieve the model list within 15 seconds. Check the API address and server availability.", legacy: ["Timeout: список моделей не был получен за 15 секунд. Проверьте Base URL, endpoint и состояние локального сервера."] },
  connectionTestTimeout: { ru: "Проверка подключения не завершилась вовремя. Проверьте доступность модели и адрес API.", en: "The connection test timed out. Check model availability and the API address.", legacy: ["Timeout: проверка подключения не завершилась вовремя. Проверьте, запущена ли локальная модель и доступен ли endpoint."] },
  connectionTestTimeout10s: { ru: "Проверка подключения не завершилась за 10 секунд. Проверьте доступность модели и адрес API.", en: "The connection test did not finish within 10 seconds. Check model availability and the API address.", legacy: ["Timeout: проверка подключения не завершилась за 10 секунд. Проверьте, запущена ли локальная модель и доступен ли endpoint."] },
  noteAiTimeout45s: { ru: "ИИ-модель не ответила по текущей заметке за 45 секунд. Проверьте её доступность.", en: "The AI model did not answer about this note within 45 seconds. Check its availability.", legacy: ["Timeout: AI-запрос по текущей заметке не завершился за 45 секунд. Проверьте, доступна ли модель."] },
  modelListEmpty: { ru: "Сервер доступен, но список моделей пуст", en: "The server is reachable, but the model list is empty", legacy: ["Endpoint доступен, но список моделей пуст"] },
  apiKeyLabel: { ru: "API-ключ", en: "API key" },
  apiKeyDeleting: { ru: "Удаляем API-ключ…", en: "Deleting API key…" },
  providerConnectionsLoadFailed: { ru: "Не удалось загрузить подключения ИИ-моделей", en: "Could not load AI model connections" },
  providerSavedWithKey: { ru: "Подключение сохранено. API-ключ находится в защищённом хранилище ОС.", en: "Connection saved. The API key is stored securely by the operating system." },
  providerSavedWithoutKey: { ru: "Подключение сохранено без API-ключа.", en: "Connection saved without an API key." },
  providerConnectionSaved: { ru: "Подключение ИИ-модели сохранено", en: "AI model connection saved" },
  providerConnectionDeleted: { ru: "Подключение ИИ-модели удалено", en: "AI model connection deleted" },
  apiKeyDeletedSecurely: { ru: "API-ключ удалён из защищённого хранилища.", en: "The API key was deleted from secure storage." },
  apiKeyDeleted: { ru: "API-ключ удалён", en: "API key deleted" },
  apiKeyDeleteFailed: { ru: "Не удалось удалить API-ключ", en: "Could not delete the API key" },
  generativeModelsInfo: { ru: "Эти модели создают текст: отвечают на вопросы, редактируют заметки, сокращают, объясняют и выполняют другие действия ИИ-помощника. API-ключ хранится только в защищённом хранилище операционной системы.", en: "These models generate text: answer questions, edit, shorten and explain notes, and perform other AI assistant actions. The API key is stored only in the operating system's secure storage." },
  defaultEndpointHelp: { ru: "Стандартный адрес API OpenAI обычно не нужно менять.", en: "The default OpenAI API address usually does not need to be changed." },
  secretHeadersHelp: { ru: "Секретные заголовки вроде Authorization или X-API-Key запрещены. Используйте поле «API-ключ».", en: "Secret headers such as Authorization or X-API-Key are not allowed. Use the API key field." },
  deletedKeyInfo: { ru: "Сохранённый API-ключ будет удалён из защищённого хранилища операционной системы.", en: "The saved API key will be deleted from the operating system's secure storage." },
  customProviderDetail: { ru: "Локальный или внешний адрес сервера", en: "Local or external server address" },
  externalRequestsConfirmation: { ru: "Подтверждение сохранится для внешних запросов ИИ этого локального профиля.", en: "The confirmation will be saved for external AI requests from this local profile." },
  providerUnavailable: { ru: "ИИ-модель или адрес API недоступны.", en: "The AI model or API address is unavailable.", legacy: ["Модель или endpoint недоступны."] },
  providerEmptyResponse: { ru: "Провайдер ИИ-модели вернул пустой или неподдерживаемый ответ", en: "The AI model provider returned an empty or unsupported response", legacy: ["LLM provider вернул пустой или неподдерживаемый ответ"] },
  providerNetworkTimeout: { ru: "Провайдер ИИ-модели не ответил вовремя", en: "The AI model provider did not respond in time", legacy: ["Timeout: провайдер не ответил вовремя"] },
  localProviderUnavailable: { ru: "Локальный сервер модели недоступен или соединение отклонено", en: "The local model server is unavailable or refused the connection", legacy: ["Локальный endpoint недоступен или соединение отклонено"] },
  modelListNotFound: { ru: "Сервер доступен, но модели не найдены", en: "The server is reachable, but no models were found", legacy: ["Endpoint доступен, но модели не найдены"] },
  selectedModelNotListed: { ru: "Сервер доступен, но выбранная модель не найдена в списке", en: "The server is reachable, but the selected model is not listed", legacy: ["Endpoint доступен, но выбранная модель не найдена в списке"] },
  modelListReceived: { ru: "Сервер доступен, список моделей получен", en: "The server is reachable and the model list was retrieved", legacy: ["Endpoint доступен, список моделей получен"] },
  chatVerifiedModelNotListed: { ru: "Чат доступен. Выбранная модель проверена запросом, но не найдена в списке моделей.", en: "Chat is available. The selected model passed a request test but is not in the model list.", legacy: ["Chat endpoint доступен. Выбранная модель проверена запросом, но не найдена в /models."] },
  chatVerifiedManualModel: { ru: "Подключение проверено запросом к чату. Список моделей недоступен; введите название модели вручную.", en: "The connection passed a chat request test. The model list is unavailable; enter the model name manually.", legacy: ["Подключение успешно проверено через chat completions. Список моделей недоступен; используйте ручной ввод модели."] },
  cloudModelKeyRequired: { ru: "Для облачной ИИ-модели нужен API-ключ", en: "An API key is required for a cloud AI model", legacy: ["Для облачной модели нужен API key"] },
  embeddingResponseMissing: { ru: "Сервер не вернул данные для смыслового поиска. Проверьте модель и адрес подключения", en: "The server returned no embeddings. Check the model and connection address", legacy: ["Endpoint не вернул embeddings. Проверьте модель и адрес подключения"] },
  apiKeyRejected: { ru: "Провайдер не принял API-ключ", en: "The provider rejected the API key", legacy: ["API key не принят провайдером"] },
  embeddingModelUnavailable: { ru: "Модель не найдена или сервер не поддерживает смысловой поиск", en: "The model was not found or the server does not support embeddings", legacy: ["Модель не найдена или endpoint embeddings не поддерживается"] },
  providerAuthorizationFailed: { ru: "Провайдер отклонил авторизацию. Проверьте API-ключ.", en: "The provider rejected authorization. Check the API key.", legacy: ["Провайдер отклонил авторизацию. Проверьте API key."] },
} satisfies Record<string, Record<AppLanguage, string> & { legacy?: readonly string[] }>;

export function uiMessage(language: AppLanguage, key: keyof typeof UI_MESSAGES, parameters: Readonly<Record<string, string | number>> = {}): string {
  return UI_MESSAGES[key][language].replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.prototype.hasOwnProperty.call(parameters, name) ? String(parameters[name]) : placeholder);
}

// Compatibility at the presentation boundary, not replacements in model/user text.
export function localizeUiMessage(language: AppLanguage, message: string): string {
  // Legacy model-discovery DTOs return an application-owned count string.
  const modelCount = /^(?:(?:Получено|Найдено) моделей|Models received): (\d+)$/.exec(message);
  if (modelCount) return uiMessage(language, "modelsReceived", { count: modelCount[1] });
  for (const entry of Object.values(UI_MESSAGES)) {
    if (message === entry.ru || message === entry.en || ("legacy" in entry && entry.legacy.includes(message))) return entry[language];
  }
  for (const entry of Object.values(PUBLIC_ERROR_MESSAGES)) {
    if (message === entry.ru || message === entry.en) return entry[language];
  }
  return localizeSystemMessage(message, language);
}
