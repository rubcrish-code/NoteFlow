import { translate, getInterfaceLanguage } from "../shared/i18n";
import { invoke as tauriInvoke, type InvokeArgs } from "@tauri-apps/api/core";
import { localizeUiMessage } from "../shared/uiMessages";
import { publicErrorMessage } from "../shared/i18n/publicErrors";

export class PublicCommandError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable: boolean) {
    super(message);
    this.name = "PublicCommandError";
    this.code = code;
    this.retryable = retryable;
  }
}

function isPublicError(value: unknown): value is { code: string; message: string; retryable?: boolean } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.code === "string"
    && /^[a-zA-Z_]{2,48}$/.test(candidate.code)
    && typeof candidate.message === "string"
    && candidate.message.length <= 300;
}

export async function invoke<T>(command: string, args?: InvokeArgs): Promise<T> {
  try {
    return await tauriInvoke<T>(command, args);
  } catch (error) {
    if (isPublicError(error)) {
      throw new PublicCommandError(error.code, getInterfaceLanguage() === "en" ? publicErrorMessage(error.code, "en") ?? localizeUiMessage("en", error.message) : localizeUiMessage("ru", error.message), error.retryable === true);
    }
    throw new PublicCommandError("IPC_FAILED", translate("ui.6be11e608acc"), true);
  }
}
