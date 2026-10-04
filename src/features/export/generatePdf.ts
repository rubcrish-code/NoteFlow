import pdfMake from "pdfmake/build/pdfmake";
import vfs from "pdfmake/build/vfs_fonts";
import type { Content, ContentText, TDocumentDefinitions, TableCell } from "pdfmake/interfaces";
import type { EditorNode } from "../editor/markdownService";
import { projectTable } from "../editor/tableDocumentLayout";
import { color, inlineText, type ExportDocument } from "./exportDocument";
import { safeExternalLinkHref } from "../../shared/safeLinkHref";

// pdfmake 0.2.23 exports the VFS directly; older type declarations wrap it.
const fontFiles: Record<string, string> = {};
for (const [name, data] of Object.entries(vfs)) if (typeof data === "string") fontFiles[name] = data;
pdfMake.vfs = fontFiles;

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}

export async function generatePdf(input: ExportDocument): Promise<Uint8Array> {
  function runs(node: EditorNode): ContentText[] {
    if (node.type === "hardBreak") return [{ text: "\n" }];
    if (node.type !== "text") return node.content ? node.content.flatMap(runs) : [{ text: inlineText(node) }];
    const marks = node.marks ?? [];
    const has = (type: string) => marks.some((mark) => mark.type === type);
    const style = marks.find((mark) => mark.type === "textStyle")?.attrs;
    const href = marks.find((mark) => mark.type === "link")?.attrs?.href;
    return [{ text: node.text ?? "", bold: has("bold"), italics: has("italic"),
      decoration: [...(has("underline") ? ["underline" as const] : []), ...(has("strike") ? ["lineThrough" as const] : [])],
      color: color(style?.color), background: color(marks.find((mark) => mark.type === "highlight")?.attrs?.color),
      link: typeof href === "string" ? safeExternalLinkHref(href) : undefined }];
  }
  function blocks(nodes: EditorNode[]): Content[] {
    return nodes.flatMap((node): Content[] => {
      if (["bulletList", "orderedList", "taskList"].includes(node.type)) {
        const items = (node.content ?? []).map((item) => ({ stack: node.type === "taskList"
          ? [{ text: `${item.attrs?.checked ? "[x]" : "[ ]"} ${inlineText(item)}`, margin: [0, 2, 0, 4] as [number, number, number, number] }]
          : blocks(item.content ?? []) }));
        return node.type === "taskList" ? items : [node.type === "orderedList" ? { ol: items, start: Number(node.attrs?.start ?? 1), margin: [0, 0, 0, 8] } : { ul: items, margin: [0, 0, 0, 8] }];
      }
      if (node.type === "table") {
        const { grid } = projectTable(node);
        const body: TableCell[][] = grid.map((row) => row.map((cell): TableCell => !cell ? {} : {
          stack: blocks(cell.content ?? []), bold: cell.type === "tableHeader", fillColor: color(cell.attrs?.backgroundColor),
          colSpan: Number(cell.attrs?.colspan ?? 1), rowSpan: Number(cell.attrs?.rowspan ?? 1),
        }));
        return body.length ? [{ table: { body, widths: Array.from({ length: grid[0].length }, () => "*"), headerRows: node.content?.[0]?.content?.every((cell) => cell.type === "tableHeader") ? 1 : 0 },
          layout: { hLineWidth: () => node.attrs?.emphasizedBorders ? 1.5 : 0.5, vLineWidth: () => node.attrs?.emphasizedBorders ? 1.5 : 0.5,
            hLineColor: () => node.attrs?.emphasizedBorders ? "#000000" : "#b8b8b8", vLineColor: () => node.attrs?.emphasizedBorders ? "#000000" : "#b8b8b8" }, margin: [0, 4, 0, 12] }] : [];
      }
      if (node.type === "image") {
        const image = input.images.find((item) => item.uri === node.attrs?.src);
        return image ? [{ image: `data:${image.mime};base64,${base64(image.bytes)}`, fit: [Math.min(499, Number(node.attrs?.width) || image.width), 680],
          alignment: node.attrs?.alignment === "right" ? "right" : node.attrs?.alignment === "center" ? "center" : "left", margin: [0, 6, 0, 12] }]
          : [{ text: `[Изображение: ${node.attrs?.alt ?? ""}]`, margin: [0, 0, 0, 8] }];
      }
      if (node.type === "horizontalRule") return [{ canvas: [{ type: "line", x1: 0, y1: 0, x2: 499, y2: 0, lineWidth: 0.5, lineColor: "#b8b8b8" }], margin: [0, 8, 0, 12] }];
      if (["blockquote", "callout", "detailsBlock", "detailsContent", "listItem", "taskItem"].includes(node.type)) return [{ stack: blocks(node.content ?? []), margin: [node.type === "blockquote" || node.type === "callout" ? 12 : 0, 0, 0, 8] }];
      if (node.type === "fileAttachment") return [{ text: `[Файл: ${node.attrs?.name ?? "Вложение"}]` }];
      const level = Number(node.attrs?.level ?? 1);
      return [{ text: runs(node), bold: node.type === "heading" || node.type === "detailsSummary", fontSize: node.type === "heading" ? [20, 16, 13][Math.min(2, Math.max(0, level - 1))] : 11,
        alignment: node.attrs?.textAlign === "right" ? "right" : node.attrs?.textAlign === "center" ? "center" : "left",
        margin: [Math.min(6, Math.max(0, Number(node.attrs?.indent ?? 0))) * 18, node.type === "heading" ? 12 : 0, 0, 8] }];
    });
  }
  const definition: TDocumentDefinitions = { pageSize: "A4", pageMargins: [48, 48, 48, 48],
    info: { title: input.title, author: "NoteFlow" }, defaultStyle: { font: "Roboto", fontSize: 11, lineHeight: 1.25, color: "#202020" },
    content: [{ text: input.title, fontSize: 24, bold: true, margin: [0, 0, 0, 18] }, ...blocks(input.document.content ?? [])],
    footer: (page, count) => ({ text: `${page} / ${count}`, alignment: "center", fontSize: 9, color: "#666666" }),
  };
  return new Promise((resolve, reject) => {
    try { pdfMake.createPdf(definition).getBuffer((buffer) => resolve(new Uint8Array(buffer))); }
    catch { reject(new Error("Не удалось создать PDF.")); }
  });
}
