import { save } from "@tauri-apps/plugin-dialog";
import { isTauri } from "@tauri-apps/api/core";
import { invoke } from "./safeInvoke";
import { runtimeAssetUrl } from "../features/editor/assetUri";
import { getCanvasContext, loadImage } from "../features/imageEditor/imageEditService";
import { exportFilename } from "../features/export/exportDocument";

export const MAX_TRANSFER_PIXELS = 16 * 1024 * 1024;
export const MAX_TRANSFER_BYTES = 25 * 1024 * 1024;

export async function currentImagePng(src: string): Promise<Blob> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const image = await Promise.race([loadImage(runtimeAssetUrl(src)), new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Изображение не удалось загрузить")), 15_000);
  })]).finally(() => { clearTimeout(timer); });
  if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > MAX_TRANSFER_PIXELS) {
    throw new Error("Изображение слишком большое");
  }
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  getCanvasContext(canvas).drawImage(image, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Не удалось подготовить изображение")), "image/png"));
  if (blob.size > MAX_TRANSFER_BYTES) throw new Error("Изображение слишком большое");
  return blob;
}

export async function copyImage(src: string) {
  const blob = await currentImagePng(src);
  if (isTauri()) await invoke<void>("copy_image_clipboard", { bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) });
  else if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  else throw new Error("Копирование изображения недоступно");
}

export async function saveImage(src: string, title: string): Promise<boolean> {
  const path = await save({ title: "Сохранить изображение", defaultPath: exportFilename(title.replace(/\.(png|jpe?g|webp)$/i, "") || "Изображение", "png"), filters: [{ name: "PNG", extensions: ["png"] }] });
  if (!path) return false;
  const blob = await currentImagePng(src);
  await invoke<void>("write_image_file", { path, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) });
  return true;
}
