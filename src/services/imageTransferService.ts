import { translate } from "../shared/i18n";
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
    timer = setTimeout(() => reject(new Error(translate("ui.35d5c667c91b"))), 15_000);
  })]).finally(() => { clearTimeout(timer); });
  if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > MAX_TRANSFER_PIXELS) {
    throw new Error(translate("ui.ca89d14fcadc"));
  }
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  getCanvasContext(canvas).drawImage(image, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error(translate("ui.d66176cfd54b"))), "image/png"));
  if (blob.size > MAX_TRANSFER_BYTES) throw new Error(translate("ui.ca89d14fcadc"));
  return blob;
}

export async function copyImage(src: string) {
  const blob = await currentImagePng(src);
  if (isTauri()) await invoke<void>("copy_image_clipboard", { bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) });
  else if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  else throw new Error(translate("ui.b08c23a46c36"));
}

export async function saveImage(src: string, title: string): Promise<boolean> {
  const path = await save({ title: translate("ui.dde3a7558e18"), defaultPath: exportFilename(title.replace(/\.(png|jpe?g|webp)$/i, "") || translate("ui.e5f534734c36"), "png"), filters: [{ name: "PNG", extensions: ["png"] }] });
  if (!path) return false;
  const blob = await currentImagePng(src);
  await invoke<void>("write_image_file", { path, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) });
  return true;
}
