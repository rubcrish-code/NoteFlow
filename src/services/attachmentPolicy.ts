import { invoke } from "./safeInvoke";

export interface AttachmentPolicy {
  maxImageBytes: number;
  maxFileBytes: number;
  imageMimeTypes: string[];
}
export function getAttachmentPolicy() {
  return invoke<AttachmentPolicy>("get_attachment_policy");
}
export function attachmentLimitLabel(bytes: number) {
  return `${Math.round(bytes / 1024 / 1024)} МБ`;
}
export function imageFormatsLabel(policy: AttachmentPolicy) {
  const names: Record<string, string> = { "image/png": "PNG", "image/jpeg": "JPG / JPEG", "image/webp": "WebP" };
  return policy.imageMimeTypes.map((mime) => names[mime] ?? mime).join(", ");
}

export function validateAttachmentSize(size: number, kind: "image" | "file", policy: AttachmentPolicy) {
  if (size === 0) throw new Error("Файл пустой");
  if (size > (kind === "image" ? policy.maxImageBytes : policy.maxFileBytes)) throw new Error("Файл превышает допустимый размер");
}
export function validateAttachmentBytes(size: number, signature: Uint8Array, kind: "image" | "file", policy: AttachmentPolicy) {
  validateAttachmentSize(size, kind, policy);
  if (kind === "file") return;
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => signature[index] === value);
  const jpeg = signature[0] === 255 && signature[1] === 216 && signature[2] === 255;
  const webp = signature.length >= 12 && String.fromCharCode(...signature.slice(0, 4)) === "RIFF" && String.fromCharCode(...signature.slice(8, 12)) === "WEBP";
  const mime = png ? "image/png" : jpeg ? "image/jpeg" : webp ? "image/webp" : "";
  if (!policy.imageMimeTypes.includes(mime)) throw new Error("Формат изображения не поддерживается");
}
export function attachmentErrorMessage(error: unknown, kind: "image" | "file", policy: AttachmentPolicy | null) {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (/Файл пустой/.test(message)) return "Пустой файл нельзя добавить.";
  if (/превышает допустимый размер/.test(message) && policy) return `${kind === "image" ? "Изображение" : "Файл"} превышает допустимый размер ${attachmentLimitLabel(kind === "image" ? policy.maxImageBytes : policy.maxFileBytes)}.`;
  if (/формат|поддержива|сигнатур/i.test(message) && kind === "image") return "Формат изображения не поддерживается. Выберите PNG, JPG или WebP.";
  return `Не удалось сохранить ${kind === "image" ? "изображение" : "файл"}. Попробуйте снова.`;
}
