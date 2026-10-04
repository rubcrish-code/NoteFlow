import { AlignmentType, BorderStyle, Document, ExternalHyperlink, HeadingLevel, ImageRun, LevelFormat, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType, type INumberingOptions, type ParagraphChild } from "docx";
import type { EditorNode } from "../editor/markdownService";
import { color, inlineText, type ExportDocument } from "./exportDocument";
import { sanitizeMarkdownLinkHref } from "../../shared/safeLinkHref";

export async function generateDocx(input: ExportDocument): Promise<Uint8Array> {
  const numbering: Array<INumberingOptions["config"][number]> = [];
  function listReference(node: EditorNode, depth: number): string {
    const reference = `list-${numbering.length}`;
    numbering.push({ reference, levels: Array.from({ length: 9 }, (_, level) => ({ level,
      start: level === depth ? Math.max(1, Number(node.attrs?.start ?? 1)) : 1,
      format: node.type === "bulletList" ? LevelFormat.BULLET : LevelFormat.DECIMAL,
      text: node.type === "bulletList" ? "•" : `%${level + 1}.`, alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 360 * (level + 1), hanging: 180 } } },
    })) });
    return reference;
  }
  function runs(node: EditorNode): ParagraphChild[] {
    if (node.type === "hardBreak") return [new TextRun({ break: 1 })];
    if (node.type !== "text") return node.content ? node.content.flatMap(runs) : [new TextRun(inlineText(node))];
    const marks = node.marks ?? [];
    const has = (type: string) => marks.some((mark) => mark.type === type);
    const style = marks.find((mark) => mark.type === "textStyle")?.attrs;
    const highlight = color(marks.find((mark) => mark.type === "highlight")?.attrs?.color);
    const text = new TextRun({ text: node.text ?? "", bold: has("bold"), italics: has("italic"), underline: has("underline") ? {} : undefined,
      strike: has("strike"), superScript: has("superscript"), subScript: has("subscript"), font: has("code") ? "Consolas" : undefined,
      color: color(style?.color)?.slice(1), shading: highlight ? { fill: highlight.slice(1) } : undefined });
    const href = marks.find((mark) => mark.type === "link")?.attrs?.href;
    return typeof href === "string" && !href.startsWith("#") && sanitizeMarkdownLinkHref(href)?.startsWith("http")
      ? [new ExternalHyperlink({ link: href, children: [text] })] : [text];
  }
  function paragraph(node: EditorNode, prefix?: string, list?: { reference: string; level: number }): Paragraph {
    const alignment = node.attrs?.textAlign ?? node.attrs?.alignment;
    return new Paragraph({ children: [...(prefix ? [new TextRun(prefix)] : []), ...runs(node)],
      heading: node.type === "heading" ? [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][Math.min(2, Math.max(0, Number(node.attrs?.level ?? 1) - 1))] : undefined,
      alignment: alignment === "center" ? AlignmentType.CENTER : alignment === "right" ? AlignmentType.RIGHT : AlignmentType.LEFT,
      indent: { left: Math.min(6, Math.max(0, Number(node.attrs?.indent ?? 0))) * 360 },
      spacing: { after: 120 }, numbering: list,
    });
  }
  function blocks(nodes: EditorNode[], depth = 0): Array<Paragraph | Table> {
    return nodes.flatMap((node): Array<Paragraph | Table> => {
      if (["bulletList", "orderedList", "taskList"].includes(node.type)) {
        const reference = node.type === "taskList" ? undefined : listReference(node, Math.min(depth, 8));
        return (node.content ?? []).flatMap((item) => {
        const content = item.content ?? [];
        const first = content[0] ?? { type: "paragraph" };
        return [paragraph(first, node.type === "taskList" ? item.attrs?.checked ? "[x] " : "[ ] " : undefined,
          reference ? { reference, level: Math.min(depth, 8) } : undefined), ...blocks(content.slice(1), depth + 1)];
      });
      }
      if (node.type === "table") return [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: Object.fromEntries(["top", "bottom", "left", "right", "insideHorizontal", "insideVertical"].map((edge) => [edge, { style: BorderStyle.SINGLE, size: node.attrs?.emphasizedBorders ? 12 : 4, color: node.attrs?.emphasizedBorders ? "000000" : "B0B0B0" }])), rows: (node.content ?? []).map((row) => new TableRow({ children: (row.content ?? []).map((cell) => new TableCell({
        children: cell.content?.length ? blocks(cell.content) : [new Paragraph("")],
        columnSpan: Number(cell.attrs?.colspan ?? 1), rowSpan: Number(cell.attrs?.rowspan ?? 1),
        shading: color(cell.attrs?.backgroundColor) ? { fill: color(cell.attrs?.backgroundColor)!.slice(1) } : undefined,
      })) })) })];
      if (node.type === "image") {
        const image = input.images.find((item) => item.uri === node.attrs?.src);
        if (!image) return [new Paragraph(`[Изображение: ${node.attrs?.alt ?? ""}]`)];
        const width = Math.min(600, Number(node.attrs?.width) || image.width);
        return [new Paragraph({ alignment: node.attrs?.alignment === "center" ? AlignmentType.CENTER : node.attrs?.alignment === "right" ? AlignmentType.RIGHT : AlignmentType.LEFT,
          children: [new ImageRun({ type: image.mime === "image/jpeg" ? "jpg" : "png", data: image.bytes, transformation: { width, height: width * image.height / image.width }, altText: { title: String(node.attrs?.alt ?? "Изображение"), description: "", name: "Изображение" } })] })];
      }
      if (node.type === "horizontalRule") return [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "B0B0B0" } } })];
      if (["blockquote", "callout", "detailsBlock", "detailsContent", "listItem", "taskItem"].includes(node.type)) return blocks(node.content ?? [], depth);
      if (node.type === "fileAttachment") return [new Paragraph(`[Файл: ${node.attrs?.fileName ?? node.attrs?.name ?? "Вложение"}]`)];
      return [paragraph(node)];
    });
  }
  const children = [new Paragraph({ text: input.title, heading: HeadingLevel.TITLE }), ...blocks(input.document.content ?? [])];
  const doc = new Document({ creator: "NoteFlow", title: input.title,
    styles: { default: { document: { run: { font: "Arial", size: 22 }, paragraph: { spacing: { line: 300 } } } } },
    numbering: { config: numbering },
    sections: [{ properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } }, children }],
  });
  return new Uint8Array(await Packer.toArrayBuffer(doc));
}
