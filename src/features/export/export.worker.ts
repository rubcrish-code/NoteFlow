import { generateTxt, type ExportDocument } from "./exportDocument";

interface WorkerRequest { format: "txt" | "docx" | "pdf"; input: ExportDocument }

async function normalizeImages(input: ExportDocument) {
  for (const image of input.images) {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(image.bytes)], { type: image.mime }));
    image.width = bitmap.width;
    image.height = bitmap.height;
    if (bitmap.width * bitmap.height > 64_000_000) { bitmap.close(); throw new Error("Изображение слишком большое"); }
    if (image.mime !== "image/png" && image.mime !== "image/jpeg") {
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext("2d");
      if (!context) { bitmap.close(); throw new Error("Изображение недоступно"); }
      context.drawImage(bitmap, 0, 0);
      image.bytes = new Uint8Array(await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer());
      image.mime = "image/png";
    }
    bitmap.close();
  }
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  try {
    const { format, input } = event.data;
    if (format !== "txt") await normalizeImages(input);
    const bytes = format === "txt" ? generateTxt(input) : format === "docx" ? await (await import("./generateDocx")).generateDocx(input) : await (await import("./generatePdf")).generatePdf(input);
    self.postMessage({ bytes }, { transfer: [bytes.buffer] });
  } catch { self.postMessage({ error: true }); }
};
