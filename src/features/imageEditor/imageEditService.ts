export type ImageEditMode = "crop" | "draw";

export interface ImageEditMetadata extends Record<string, unknown> {
  mode: ImageEditMode;
  appliedAt: string;
}

export function clampImageWidth(width: number, minWidth: number, maxWidth: number) {
  return Math.round(Math.min(maxWidth, Math.max(minWidth, width)));
}

export function getCanvasContext(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas недоступен для редактирования изображения");
  }
  return context;
}

export function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", () => reject(new Error("Изображение не удалось загрузить")), { once: true });
    image.src = src;
  });
}

export async function dataUrlToFile(dataUrl: string, fileName: string, fallbackMimeType = "image/png") {
  const match = /^data:(image\/png);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error("Не удалось подготовить изображение");
  const bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0));
  return new File([bytes], fileName, { type: match[1] || fallbackMimeType });
}

export function createEditedImageFileName(mode: ImageEditMode, sourceName: string) {
  const baseName = sourceName.trim().replace(/\.[^.]+$/, "") || "image";
  return `${baseName}-${mode}-${Date.now()}.png`;
}

export function canvasToPngDataUrl(canvas: HTMLCanvasElement) {
  return canvas.toDataURL("image/png");
}
