import { invoke as tauriInvoke, type InvokeArgs } from "@tauri-apps/api/core";

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
      throw new PublicCommandError(error.code, error.message, error.retryable === true);
    }
    throw new PublicCommandError("IPC_FAILED", "Не удалось выполнить операцию. Попробуйте ещё раз.", true);
  }
}
