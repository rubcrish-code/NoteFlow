import { translate } from "../shared/i18n";
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
  return translate("ui.fb360df45f73", { p0: Math.round(bytes / 1024 / 1024) });
}
export function imageFormatsLabel(policy: AttachmentPolicy) {
  const names: Record<string, string> = { "image/png": "PNG", "image/jpeg": "JPG / JPEG", "image/webp": "WebP" };
  return policy.imageMimeTypes.map((mime) => names[mime] ?? mime).join(", ");
}

export function validateAttachmentSize(size: number, kind: "image" | "file", policy: AttachmentPolicy) {
  if (size === 0) throw new Error(translate("ui.47c9062c300d"));
  if (size > (kind === "image" ? policy.maxImageBytes : policy.maxFileBytes)) throw new Error(translate("ui.144344eb1209"));
}
export function validateAttachmentBytes(size: number, signature: Uint8Array, kind: "image" | "file", policy: AttachmentPolicy) {
  validateAttachmentSize(size, kind, policy);
  if (kind === "file") return;
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => signature[index] === value);
  const jpeg = signature[0] === 255 && signature[1] === 216 && signature[2] === 255;
  const webp = signature.length >= 12 && String.fromCharCode(...signature.slice(0, 4)) === "RIFF" && String.fromCharCode(...signature.slice(8, 12)) === "WEBP";
  const mime = png ? "image/png" : jpeg ? "image/jpeg" : webp ? "image/webp" : "";
  if (!policy.imageMimeTypes.includes(mime)) throw new Error(translate("ui.7cf140ea412a"));
}
export function attachmentErrorMessage(error: unknown, kind: "image" | "file", policy: AttachmentPolicy | null) {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (/Файл пустой/.test(message)) return translate("ui.0893298c30ff");
  if (/превышает допустимый размер/.test(message) && policy) return translate("ui.0b1a2fc4f28a", { p0: kind === "image" ? "Изображение" : "Файл", p1: attachmentLimitLabel(kind === "image" ? policy.maxImageBytes : policy.maxFileBytes) });
  if (/формат|поддержива|сигнатур/i.test(message) && kind === "image") return translate("ui.fd888bf07292");
  return translate("ui.c06784655b3f", { p0: kind === "image" ? "изображение" : "файл" });
}
