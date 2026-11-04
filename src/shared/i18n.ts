import { useSyncExternalStore } from "react";
import type { AppLanguage } from "../app/types";
import ru from "./i18n/ru.json";
import en from "./i18n/en.json";

export type MessageKey = keyof typeof ru;
export type MessageParameters = Readonly<Record<string, string | number>>;
export const interfaceCatalogs: Record<AppLanguage, Record<MessageKey, string>> = { ru, en };
let language: AppLanguage = "ru";
const listeners = new Set<() => void>();
const systemMessageKeys = new Map<string, MessageKey>();
const renderedMessages = new Map<string, { key: MessageKey; parameters: MessageParameters }>();
for (const key of Object.keys(ru) as MessageKey[]) {
  systemMessageKeys.set(ru[key], key);
  systemMessageKeys.set(en[key], key);
}

export function getInterfaceLanguage(): AppLanguage { return language; }
export function getInterfaceLocale(): string { return language === "ru" ? "ru-RU" : "en-GB"; }
export function subscribeInterfaceLanguage(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function setInterfaceLanguage(value: AppLanguage): void {
  if (language === value) return;
  language = value;
  if (typeof document !== "undefined") document.documentElement.lang = value;
  for (const listener of listeners) listener();
}
export function useInterfaceLanguage(): AppLanguage {
  return useSyncExternalStore(subscribeInterfaceLanguage, getInterfaceLanguage, () => "ru");
}
export function translate(key: MessageKey, parameters: MessageParameters = {}, locale: AppLanguage = language): string {
  const template = interfaceCatalogs[locale]?.[key] ?? ru[key];
  const result = template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.prototype.hasOwnProperty.call(parameters, name) ? String(parameters[name]) : placeholder);
  if (Object.keys(parameters).length) {
    if (renderedMessages.size >= 256) renderedMessages.delete(renderedMessages.keys().next().value!);
    renderedMessages.set(result, { key, parameters: { ...parameters } });
  }
  return result;
}

// Only call for application-owned status/error text, never note titles or model answers.
export function localizeSystemMessage(value: string, locale: AppLanguage = language): string {
  const key = systemMessageKeys.get(value);
  if (key) return translate(key, {}, locale);
  const rendered = renderedMessages.get(value);
  return rendered ? translate(rendered.key, rendered.parameters, locale) : value;
}
