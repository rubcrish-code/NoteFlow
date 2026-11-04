import { translate } from "../../shared/i18n";
import { parseMarkdownInline, readMarkdownList, convertMarkdownList, readMarkdownTable } from "./markdownInline";
import { formatDisplayDate } from "../../shared/displayDate";
import { codecInlineNeedsSidecar, parseCodecMarkdown, serializeCodecMarkdown } from "./markdownCodec";

export interface EditorMark {
  attrs?: Record<string, unknown>;
  type: string;
}

export interface EditorNode {
  attrs?: Record<string, unknown>;
  content?: EditorNode[];
  marks?: EditorMark[];
  text?: string;
  type: string;
}

export type EditorDocument = EditorNode & {
  type: "doc";
};

const MAX_QUOTE_NESTING = 64;

const markdownSignals = [
  /^#{1,6}\s+\S/m,
  /^\s{0,3}>\s+\S/m,
  /^\s{0,3}(?:[-*+]\s+|\d+\.\s+)\S/m,
  /^\s{0,3}[-*+]\s+\[[ xX]\]\s+\S/m,
  /^\s{0,3}(?:`{3,}|~{3,})/m,
  /\*\*[^*\n]+\*\*/,
  /==[^=\n]+==/,
  /~~[^~\n]+~~/,
  /`[^`\n]+`/,
  /\[[^\]\n]+\]\([^)]+\)/,
  /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/m,
];

function textNode(text: string, marks?: EditorMark[]): EditorNode {
  return marks && marks.length > 0 ? { type: "text", text, marks } : { type: "text", text };
}

function paragraph(text = ""): EditorNode {
  const content = parseInlineMarkdown(text);
  return content.length > 0 ? { type: "paragraph", content } : { type: "paragraph" };
}

function isBlank(line: string) {
  return line.trim().length === 0;
}

function getCodeFence(line: string) {
  return /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
}

function isHorizontalRule(line: string) {
  return /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line);
}

function getHeading(line: string) {
  const match = /^ {0,3}(#{1,6})\s+(.+)$/.exec(line);
  if (!match) {
    return null;
  }
  return { level: match[1].length, text: match[2].trim() };
}

function isTaskLine(line: string) {
  return /^\s{0,3}[-*+]\s+\[[ xX]\]\s+/.test(line);
}

function isBulletLine(line: string) {
  return /^\s{0,3}[-*+]\s+\S/.test(line) && !isTaskLine(line);
}

function isOrderedLine(line: string) {
  return /^\s{0,3}\d+\.\s+\S/.test(line);
}

function isQuoteLine(line: string) {
  return /^\s{0,3}>\s?/.test(line);
}

function hasTablePipe(line: string) {
  const trimmed = line.trim();
  return trimmed.includes("|") && !trimmed.startsWith("```");
}

function isTableSeparator(line: string) {
  return /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function isTableStart(lines: string[], index: number) {
  return Boolean(lines[index + 1] && hasTablePipe(lines[index]) && isTableSeparator(lines[index + 1]));
}

function getMarkdownImage(line: string): EditorNode | null {
  const match = /^!\[([^\]\n]*)\]\((\S+?)(?:\s+"([^"\n]+)")?\)\s*$/.exec(line.trim());
  if (!match) {
    return null;
  }
  return {
    type: "image",
    attrs: {
      alignment: "left",
      alt: match[1],
      src: match[2],
      title: match[3] ?? null,
    },
  };
}

function getHtmlImage(line: string): EditorNode | null {
  const trimmedLine = line.trim();
  if (!/^<img\s+[^>]*>\s*$/i.test(trimmedLine)) {
    return null;
  }
  const src = readHtmlAttribute(trimmedLine, "src");
  if (!src) {
    return null;
  }
  const width = parseImageDimension(readHtmlAttribute(trimmedLine, "data-image-width") ?? readHtmlAttribute(trimmedLine, "width"));
  const height = parseImageDimension(readHtmlAttribute(trimmedLine, "data-image-height") ?? readHtmlAttribute(trimmedLine, "height"));
  const alignment = readHtmlAttribute(trimmedLine, "data-image-align");
  return {
    type: "image",
    attrs: {
      alignment: alignment === "center" || alignment === "right" ? alignment : "left",
      alt: readHtmlAttribute(trimmedLine, "alt") ?? "",
      height,
      src,
      title: readHtmlAttribute(trimmedLine, "title") ?? null,
      width,
    },
  };
}

function getFileAttachment(line: string): EditorNode | null {
  const match = /^\[file:([^\]\n]+)\]\(noteflow-file:\/\/([^)]+)\)\s*$/.exec(line.trim());
  if (!match) {
    return null;
  }
  return {
    type: "fileAttachment",
    attrs: {
      name: match[1],
      size: "",
      storageId: match[2],
      type: "application/octet-stream",
    },
  };
}

function isSpecialBlockStart(lines: string[], index: number) {
  const line = lines[index];
  return (
    isBlank(line) ||
    getCodeFence(line) !== null ||
    getFileAttachment(line) !== null ||
    getHeading(line) !== null ||
    getHtmlImage(line) !== null ||
    getMarkdownImage(line) !== null ||
    isCalloutStart(line) ||
    isDetailsStart(line) ||
    isHorizontalRule(line) ||
    isTableStart(lines, index) ||
    isTaskLine(line) ||
    isBulletLine(line) ||
    isOrderedLine(line) ||
    isQuoteLine(line)
  );
}

function isCalloutStart(line: string) {
  return /^:::(info|tip|warning|important)\s*$/i.test(line.trim());
}

function isDetailsStart(line: string) {
  return /^:::details(?:\s+(.+))?$/i.test(line.trim());
}

export function isMarkdownLike(text: string) {
  const trimmedText = text.trim();
  if (trimmedText.length < 2 || trimmedText === "-" || /^https?:\/\/\S+$/i.test(trimmedText)) {
    return false;
  }

  if (isTableStart(trimmedText.split(/\r?\n/), 0)) {
    return true;
  }

  if (markdownSignals.some((signal) => signal.test(trimmedText))) return true;
  if (/\+\+(?=\S)[^\n]*?\S\+\+|\{\{nf:|^:::nf-block /m.test(trimmedText)) return true;
  return /[*_]/.test(trimmedText) && parseInlineMarkdown(trimmedText).some((node) =>
    node.marks?.some((mark) => mark.type === "bold" || mark.type === "italic"));
}

export function markdownToTiptapDoc(markdown: string): EditorDocument {
  if (/\+\+(?=\S)[^\n]*?\S\+\+|\{\{nf:|^:::nf-block /m.test(markdown)) return parseCodecMarkdown(markdown, true);
  // Existing NoteFlow HTML/== exports and pathological historical nesting keep
  // their bounded compatibility reader. All ordinary Markdown uses the codec.
  if (/<\/?(?:[a-z][a-z\d]*)(?:\s[^>]*|\s*\/?)>/i.test(markdown) || /==[^=\n]+==/.test(markdown) || /^(?:\s*>\s*){65}/m.test(markdown)) return legacyMarkdownToTiptapDoc(markdown);
  return parseCodecMarkdown(markdown, true);
}

export function legacyMarkdownToTiptapDoc(markdown: string): EditorDocument {
  const normalizedMarkdown = markdown.replace(/\r\n/g, "\n");
  const lines = normalizedMarkdown.split("\n");
  const content: EditorNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (line.trim() === "<p></p>") { content.push(paragraph()); index += 1; continue; }

    if (isBlank(line)) {
      index += 1;
      continue;
    }

    const imageNode = getMarkdownImage(line) ?? getHtmlImage(line);
    if (imageNode) {
      content.push(imageNode);
      index += 1;
      continue;
    }

    const fileAttachmentNode = getFileAttachment(line);
    if (fileAttachmentNode) {
      content.push(fileAttachmentNode);
      index += 1;
      continue;
    }

    const calloutMatch = /^:::(info|tip|warning|important)\s*$/i.exec(line.trim());
    if (calloutMatch) {
      const calloutLines: string[] = [];
      index += 1;
      while (index < lines.length && lines[index].trim() !== ":::") {
        calloutLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      content.push({
        type: "callout",
        attrs: { variant: calloutMatch[1].toLowerCase() },
        content: legacyMarkdownToTiptapDoc(calloutLines.join("\n")).content,
      });
      continue;
    }

    const detailsMatch = /^:::details(?:\s+(.+))?$/i.exec(line.trim());
    if (detailsMatch) {
      const detailsLines: string[] = [];
      index += 1;
      while (index < lines.length && lines[index].trim() !== ":::") {
        detailsLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      content.push({
        type: "detailsBlock",
        attrs: { open: true },
        content: [
          { type: "detailsSummary", content: parseInlineMarkdown(detailsMatch[1]?.trim() || translate("ui.b32883af0bd4")) },
          { type: "detailsContent", content: legacyMarkdownToTiptapDoc(detailsLines.join("\n")).content },
        ],
      });
      continue;
    }

    const codeFence = getCodeFence(line);
    if (codeFence) {
      const language = codeFence[2].trim();
      const closingFence = new RegExp(`^ {0,3}${codeFence[1][0]}{${codeFence[1].length},}\\s*$`);
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !closingFence.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      content.push({
        type: "codeBlock",
        attrs: language ? { language } : {},
        content: codeLines.length > 0 ? [textNode(codeLines.join("\n"))] : undefined,
      });
      continue;
    }

    const heading = getHeading(line);
    if (heading) {
      content.push({ type: "heading", attrs: { level: heading.level }, content: parseInlineMarkdown(heading.text) });
      index += 1;
      continue;
    }

    if (isHorizontalRule(line)) {
      content.push({ type: "horizontalRule" });
      index += 1;
      continue;
    }

    if (isTableStart(lines, index)) {
      let end = index + 2;
      while (end < lines.length && hasTablePipe(lines[end]) && !isBlank(lines[end])) end++;
      const table = readMarkdownTable(lines.slice(index, end).join("\n"));
      if (table) {
        content.push(table.node);
        index += table.lineCount;
        continue;
      }
    }

    if (isTaskLine(line) || isBulletLine(line) || isOrderedLine(line)) {
      const list = readMarkdownList(lines.slice(index).join("\n"));
      if (list) {
        content.push(...convertMarkdownList(list, (source) => legacyMarkdownToTiptapDoc(source).content ?? []));
        index += list.raw.trimEnd().split("\n").length;
        continue;
      }
    }

    if (isQuoteLine(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && isQuoteLine(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s{0,3}>\s?/, ""));
        index += 1;
      }
      const source = quoteLines.join("\n");
      const deeplyNested = new RegExp(`^\\s*(?:>\\s*){${MAX_QUOTE_NESTING}}`, "m").test(source);
      content.push({ type: "blockquote", content: deeplyNested ? [paragraph(source)] : legacyMarkdownToTiptapDoc(source).content });
      continue;
    }

    const paragraphLines = [line];
    index += 1;
    while (index < lines.length && !isSpecialBlockStart(lines, index)) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    content.push(paragraph(paragraphLines.join("\n").trim()));
  }

  return { type: "doc", content: content.length > 0 ? content : [paragraph()] };
}

export function parseInlineMarkdown(text: string): EditorNode[] {
  return parseMarkdownInline(text);
}

export type InlineProjectionCache = WeakMap<EditorNode[], { markdown: string; needsSidecar: boolean }>;

export function inlineNeedsFormattingSidecar(nodes: EditorNode[], cache?: InlineProjectionCache) {
  const known = cache?.get(nodes);
  if (known) return known.needsSidecar;
  const needsSidecar = codecInlineNeedsSidecar(nodes);
  cache?.set(nodes, { markdown: "", needsSidecar });
  return needsSidecar;
}

function nodeText(node: EditorNode | undefined): string {
  if (!node) {
    return "";
  }
  if (node.type === "text") {
    return node.text ?? "";
  }
  if (node.type === "fileAttachment") {
    return String(node.attrs?.name ?? translate("ui.f242456b2273"));
  }
  if (node.type === "noteMention") {
    return `@${String(node.attrs?.label ?? translate("ui.025e14681a4c"))}`;
  }
  if (node.type === "inlineDate") {
    return formatDate(String(node.attrs?.value ?? ""));
  }
  return (node.content ?? []).map(nodeText).join("");
}

export function tiptapJsonToPlainText(document: EditorDocument): string {
  return (document.content ?? [])
    .map(nodeText)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}


export function tiptapJsonToStandardMarkdown(document: EditorDocument): string {
  return serializeCodecMarkdown(document, true);
}

export function tiptapJsonToMarkdown(document: EditorDocument, standard = false, _cache?: InlineProjectionCache): string {
  return serializeCodecMarkdown(document, standard);
}


function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeHtmlAttribute(value: string) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function decodeHtmlAttribute(value: string) {
  return value.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function readHtmlAttribute(source: string, name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escapedName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(source);
  const value = match?.[1] ?? match?.[2] ?? match?.[3];
  return value ? decodeHtmlAttribute(value) : null;
}

function parseImageDimension(value: string | null) {
  if (!value) {
    return null;
  }
  const dimension = Number.parseInt(value, 10);
  return Number.isFinite(dimension) && dimension > 0 ? dimension : null;
}

function normalizeFontSize(fontSize: string) {
  const trimmedSize = fontSize.trim();
  return /^\d+$/.test(trimmedSize) ? `${trimmedSize}px` : trimmedSize;
}

function getFontFormatStyle(attrs: Record<string, unknown> | undefined) {
  const fontFamily = typeof attrs?.fontFamily === "string" ? attrs.fontFamily : "";
  const fontSize = typeof attrs?.fontSize === "string" ? normalizeFontSize(attrs.fontSize) : "";
  return [
    fontFamily ? `font-family: ${fontFamily}` : "",
    fontSize ? `font-size: ${fontSize}` : "",
  ]
    .filter(Boolean)
    .join("; ");
}

function formatDate(value: string) {
  return formatDisplayDate(value) || value;
}

function tableCellStyleAttributes(node: EditorNode) {
  const backgroundColor = typeof node.attrs?.backgroundColor === "string" && /^#[0-9a-fA-F]{6}$/.test(node.attrs.backgroundColor) ? node.attrs.backgroundColor : "";
  return backgroundColor ? ` data-cell-background="${backgroundColor}" style="background-color: ${backgroundColor}"` : "";
}

function inlineToHtml(nodes: EditorNode[] | undefined) {
  return (nodes ?? [])
    .map((node) => {
      if (node.type !== "text") {
        return nodeToHtml(node);
      }

      const htmlText = escapeHtml(node.text ?? "");
      return (node.marks ?? []).reduce((value, mark) => {
        if (mark.type === "bold") {
          return `<strong>${value}</strong>`;
        }
        if (mark.type === "italic") {
          return `<em>${value}</em>`;
        }
        if (mark.type === "strike") {
          return `<s>${value}</s>`;
        }
        if (mark.type === "code") {
          return `<code>${value}</code>`;
        }
        if (mark.type === "highlight") {
          const color = typeof mark.attrs?.color === "string" ? ` style="background-color: ${escapeHtml(mark.attrs.color)}"` : "";
          return `<mark${color}>${value}</mark>`;
        }
        if (mark.type === "underline") {
          return `<u>${value}</u>`;
        }
        if (mark.type === "superscript") {
          return `<sup>${value}</sup>`;
        }
        if (mark.type === "subscript") {
          return `<sub>${value}</sub>`;
        }
        if (mark.type === "textStyle") {
          const color = typeof mark.attrs?.color === "string" ? mark.attrs.color : "";
          return color ? `<span style="color: ${escapeHtml(color)}">${value}</span>` : value;
        }
        if (mark.type === "fontFormat") {
          const style = getFontFormatStyle(mark.attrs);
          return style ? `<span style="${escapeHtmlAttribute(style)}">${value}</span>` : value;
        }
        if (mark.type === "link") {
          return `<a href="${escapeHtml(String(mark.attrs?.href ?? ""))}">${value}</a>`;
        }
        return value;
      }, htmlText);
    })
    .join("");
}

function nodeToHtml(node: EditorNode): string {
  if (node.type === "paragraph") {
    return `<p>${inlineToHtml(node.content)}</p>`;
  }
  if (node.type === "heading") {
    const level = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 1)));
    return `<h${level}>${inlineToHtml(node.content)}</h${level}>`;
  }
  if (node.type === "blockquote") {
    return `<blockquote>${(node.content ?? []).map(nodeToHtml).join("")}</blockquote>`;
  }
  if (node.type === "codeBlock") {
    return `<pre><code>${escapeHtml(nodeText(node))}</code></pre>`;
  }
  if (node.type === "horizontalRule") {
    return "<hr>";
  }
  if (node.type === "bulletList") {
    return `<ul>${(node.content ?? []).map(nodeToHtml).join("")}</ul>`;
  }
  if (node.type === "orderedList") {
    return `<ol>${(node.content ?? []).map(nodeToHtml).join("")}</ol>`;
  }
  if (node.type === "taskList") {
    return `<ul data-type="taskList">${(node.content ?? []).map(nodeToHtml).join("")}</ul>`;
  }
  if (node.type === "listItem") {
    return `<li>${(node.content ?? []).map(nodeToHtml).join("")}</li>`;
  }
  if (node.type === "taskItem") {
    const checked = node.attrs?.checked ? " checked" : "";
    const checkedAttribute = node.attrs?.checked ? " data-checked=\"true\"" : " data-checked=\"false\"";
    return `<li data-type="taskItem"${checkedAttribute}><label><input type="checkbox"${checked}><span></span></label><div>${node.content?.map(nodeToHtml).join("") ?? ""}</div></li>`;
  }
  if (node.type === "table") {
    return `<table><tbody>${(node.content ?? []).map(nodeToHtml).join("")}</tbody></table>`;
  }
  if (node.type === "tableRow") {
    return `<tr>${(node.content ?? []).map(nodeToHtml).join("")}</tr>`;
  }
  if (node.type === "tableHeader") {
    return `<th${tableCellStyleAttributes(node)}>${(node.content ?? []).map(nodeToHtml).join("")}</th>`;
  }
  if (node.type === "tableCell") {
    return `<td${tableCellStyleAttributes(node)}>${(node.content ?? []).map(nodeToHtml).join("")}</td>`;
  }
  if (node.type === "image") {
    const height = typeof node.attrs?.height === "number" ? node.attrs.height : null;
    const width = typeof node.attrs?.width === "number" ? node.attrs.width : null;
    const title = String(node.attrs?.title ?? "");
    const alignment = node.attrs?.alignment === "center" || node.attrs?.alignment === "right" ? String(node.attrs.alignment) : "";
    const titleAttribute = title ? ` title="${escapeHtmlAttribute(title)}"` : "";
    const alignmentAttribute = alignment ? ` data-image-align="${alignment}"` : "";
    const dataWidthAttribute = width ? ` data-image-width="${width}"` : "";
    const dataHeightAttribute = height ? ` data-image-height="${height}"` : "";
    const style = [
      width ? `width: ${width}px` : null,
      height ? `height: ${height}px` : null,
      height ? "object-fit: fill" : null,
      "max-width: 100%",
    ]
      .filter(Boolean)
      .join("; ");
    return `<img src="${escapeHtmlAttribute(String(node.attrs?.src ?? ""))}" alt="${escapeHtmlAttribute(String(node.attrs?.alt ?? ""))}"${titleAttribute}${alignmentAttribute}${dataWidthAttribute}${dataHeightAttribute} style="${style}">`;
  }
  if (node.type === "callout") {
    const variant = escapeHtml(String(node.attrs?.variant ?? "info"));
    return `<div data-type="callout" data-variant="${variant}" class="callout callout-${variant}"><span class="callout-icon">${variant === "tip" ? "✓" : variant === "info" ? "i" : "!"}</span><div class="callout-content">${(node.content ?? []).map(nodeToHtml).join("")}</div></div>`;
  }
  if (node.type === "detailsBlock") {
    return `<details data-type="details-block"${node.attrs?.open ? " open" : ""}>${(node.content ?? []).map(nodeToHtml).join("")}</details>`;
  }
  if (node.type === "detailsSummary") {
    return `<summary>${inlineToHtml(node.content)}</summary>`;
  }
  if (node.type === "detailsContent") {
    return `<div data-type="details-content">${(node.content ?? []).map(nodeToHtml).join("")}</div>`;
  }
  if (node.type === "fileAttachment") {
    return `<div data-type="file-attachment" data-storage-id="${escapeHtml(String(node.attrs?.storageId ?? ""))}"><span>${escapeHtml(String(node.attrs?.name ?? translate("ui.f242456b2273")))}</span><small>${escapeHtml(String(node.attrs?.size ?? ""))}</small></div>`;
  }
  if (node.type === "noteMention") {
    return `<span data-type="note-mention" data-note-id="${escapeHtml(String(node.attrs?.noteId ?? ""))}">@${escapeHtml(String(node.attrs?.label ?? translate("ui.025e14681a4c")))}</span>`;
  }
  if (node.type === "inlineDate") {
    const value = String(node.attrs?.value ?? "");
    return `<time data-type="inline-date" datetime="${escapeHtml(value)}">${escapeHtml(formatDate(value))}</time>`;
  }

  return inlineToHtml(node.content);
}

export function tiptapJsonToHtml(document: EditorDocument): string {
  return (document.content ?? []).map(nodeToHtml).join("");
}

export function markdownToHtml(markdown: string) {
  return tiptapJsonToHtml(markdownToTiptapDoc(markdown));
}
