import { parseMarkdownInline, readMarkdownList, convertMarkdownList, readMarkdownTable } from "./markdownInline";
import { projectTable } from "./tableDocumentLayout";
import { formatDisplayDate } from "../../shared/displayDate";
import { sanitizeMarkdownLinkHref } from "../../shared/safeLinkHref";

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
  /^#{1,3}\s+\S/m,
  /^\s{0,3}>\s+\S/m,
  /^\s{0,3}(?:[-*+]\s+|\d+\.\s+)\S/m,
  /^\s{0,3}[-*+]\s+\[[ xX]\]\s+\S/m,
  /```[\s\S]*?```/,
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

function isHorizontalRule(line: string) {
  return /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line);
}

function getHeading(line: string) {
  const match = /^(#{1,3})\s+(.+)$/.exec(line);
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
    line.startsWith("```") ||
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

  return markdownSignals.some((signal) => signal.test(trimmedText));
}

export function markdownToTiptapDoc(markdown: string): EditorDocument {
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
        content: markdownToTiptapDoc(calloutLines.join("\n")).content,
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
          { type: "detailsSummary", content: parseInlineMarkdown(detailsMatch[1]?.trim() || "Заголовок блока") },
          { type: "detailsContent", content: markdownToTiptapDoc(detailsLines.join("\n")).content },
        ],
      });
      continue;
    }

    const codeFence = /^(`{3,}|~{3,})(.*)$/.exec(line);
    if (codeFence) {
      const language = codeFence[2].trim();
      const closingFence = new RegExp(`^${codeFence[1][0]}{${codeFence[1].length},}\\s*$`);
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
        content.push(...convertMarkdownList(list, (source) => markdownToTiptapDoc(source).content ?? []));
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
      content.push({ type: "blockquote", content: deeplyNested ? [paragraph(source)] : markdownToTiptapDoc(source).content });
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

function inlineToMarkdown(nodes: EditorNode[] | undefined, standard = false) {
  const projection = projectInlineMarkdown(nodes ?? [], standard);
  return projection.markdown;
}

// Markdown cannot express every ProseMirror range (for example emphasis on intraword punctuation).
// Only those ranges use the existing appearance sidecar; their text still comes from Markdown.
export function inlineNeedsFormattingSidecar(nodes: EditorNode[]) {
  return projectInlineMarkdown(nodes).needsSidecar;
}

function projectInlineMarkdown(nodes: EditorNode[], standard = false) {
  if (standard) nodes = portableEmphasisWhitespace(nodes);
  const markdown = renderInlineMarkdown(nodes, standard);
  if (nodes.some((node) => node.type !== "text" && node.type !== "hardBreak")) return { markdown, needsSidecar: false };
  const canonicalRuns = (content: EditorNode[]) => {
    const runs: Array<{ text: string; marks: string }> = [];
    for (const node of content) {
      const text = node.type === "hardBreak" ? "\n" : node.text ?? "";
      const marks = (node.marks ?? []).filter((mark) => ["bold", "italic", "strike", "highlight", "code", "link", "underline"].includes(mark.type));
      const key = marks.map((mark) => mark.type === "link" ? `link:${String(mark.attrs?.href ?? "")}` : mark.type === "highlight" && mark.attrs?.color ? `highlight:${String(mark.attrs.color)}` : mark.type).sort().join("|");
      const last = runs[runs.length - 1];
      if (last?.marks === key) last.text += text;
      else if (text) runs.push({ text, marks: key });
    }
    return runs;
  };
  const parsed = parseInlineMarkdown(markdown);
  const original = canonicalRuns(nodes);
  if (JSON.stringify(original) === JSON.stringify(canonicalRuns(parsed))) return { markdown, needsSidecar: false };
  if (standard) {
    // Isolate unrepresentable ranges instead of turning unrelated Markdown into HTML.
    const groups: EditorNode[][] = [];
    for (const node of nodes) {
      const last = groups[groups.length - 1];
      if (last && Boolean(last[0].marks?.length) === Boolean(node.marks?.length)) last.push(node);
      else groups.push([node]);
    }
    const pieces = groups.map((group, index) => {
      const before = groups[index - 1]?.map((node) => node.text ?? "").join("").slice(-8) ?? "";
      const after = groups[index + 1]?.map((node) => node.text ?? "").join("").slice(0, 8) ?? "";
      const candidate = renderInlineMarkdown(group, true, false);
      const context = [{ type: "text", text: before }, ...group, { type: "text", text: after }];
      return JSON.stringify(canonicalRuns(parseInlineMarkdown(escapeInlineText(before) + candidate + escapeInlineText(after)))) === JSON.stringify(canonicalRuns(context))
        ? candidate : safeInlineHtml(group);
    });
    const projected = pieces.join("");
    if (JSON.stringify(original) === JSON.stringify(canonicalRuns(parseInlineMarkdown(projected)))) return { markdown: projected, needsSidecar: true };
  }
  return { markdown: safeInlineHtml(nodes), needsSidecar: true };
}

// A mouse selection often includes edge spaces. Their emphasis is invisible, but
// lossless storage compares it exactly; portable files put those spaces outside delimiters.
function portableEmphasisWhitespace(nodes: EditorNode[]): EditorNode[] {
  const runs = nodes.flatMap((node) => node.type === "text" && !node.marks?.some((mark) => mark.type === "code")
    ? (node.text?.match(/\s+|\S+/gu) ?? []).map((text) => ({ ...node, text })) : [node]);
  return runs.map((node, index) => {
    if (node.type !== "text" || node.marks?.some((mark) => mark.type === "code") || !/^\s+$/u.test(node.text ?? "")) return node;
    const marks = node.marks?.filter((mark) => !["bold", "italic", "strike"].includes(mark.type)
      || (runs[index - 1]?.marks?.some((other) => sameInlineMark(mark, other))
        && runs[index + 1]?.marks?.some((other) => sameInlineMark(mark, other))));
    return { ...node, marks };
  });
}

// This allowlisted fallback preserves ranges that Markdown delimiters cannot represent.
// Appearance beyond these marks remains in the existing sidecar, not hidden export metadata.
function safeInlineHtml(nodes: EditorNode[]) {
  return nodes.map((node) => {
    if (node.type === "hardBreak") return "<br>";
    let text = escapeHtml(node.text ?? "");
    for (const mark of [...(node.marks ?? [])].sort((first, second) => Number(second.type === "code") - Number(first.type === "code"))) {
      const tag = ({ bold: "strong", italic: "em", strike: "s", underline: "u", code: "code" } as Record<string, string>)[mark.type];
      if (tag) text = `<${tag}>${text}</${tag}>`;
      else if (mark.type === "highlight") {
        const color = String(mark.attrs?.color ?? "");
        text = /^#[\da-f]{6}$/i.test(color) ? `<mark style="background-color: ${color}">${text}</mark>` : `<mark>${text}</mark>`;
      } else if (mark.type === "link") {
        const href = sanitizeMarkdownLinkHref(String(mark.attrs?.href ?? ""));
        if (href) text = `<a href="${escapeHtmlAttribute(href)}">${text}</a>`;
      }
    }
    return text;
  }).join("");
}

function renderInlineMarkdown(nodes: EditorNode[], standard = false, encodeEdges = true) {
  const order = ["link", "italic", "bold", "strike", "highlight", "underline", "code"];
  const runs: Array<{ text: string; marks: EditorMark[]; atom?: EditorNode }> = [];
  for (const node of nodes ?? []) {
    if (node.type !== "text") {
      runs.push({ text: "", marks: [], atom: node });
      continue;
    }
    if (!node.text) continue;
    const marks = !standard && node.marks?.some((mark) => mark.type === "code") ? [{ type: "code" }]
      : (node.marks ?? []).filter((mark) => order.includes(mark.type)).sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
    const last = runs[runs.length - 1];
    // Sidecar-only marks must not interrupt a shared Markdown span.
    if (last && !last.atom && sameInlineMarks(last.marks, marks)) last.text += node.text;
    else runs.push({ text: node.text, marks });
  }
  let active: EditorMark[] = [];
  let output = "";
  const delimiter = (mark: EditorMark, opening: boolean) => {
    if (mark.type === "link") return opening ? "[" : `](${String(mark.attrs?.href ?? "").replace(/[\\()]/g, "\\$&")})`;
    if (mark.type === "underline") return opening ? "<u>" : "</u>";
    if (standard && mark.type === "highlight") return opening
      ? /^#[\da-f]{6}$/i.test(String(mark.attrs?.color ?? "")) ? `<mark style="background-color: ${mark.attrs!.color}">` : "<mark>"
      : "</mark>";
    return mark.type === "bold" ? "**" : mark.type === "italic" ? "*" : mark.type === "strike" ? "~~" : "==";
  };
  const transition = (marks: EditorMark[]) => {
    // Retain shared outer marks even when ranges cross in ProseMirror.
    const next = [...active.filter((mark) => marks.some((item) => sameInlineMark(mark, item))),
      ...marks.filter((mark) => !active.some((item) => sameInlineMark(mark, item)))];
    let keep = 0;
    while (keep < Math.min(active.length, next.length) && sameInlineMark(active[keep], next[keep])) keep++;
    for (let index = active.length - 1; index >= keep; index--) output += delimiter(active[index], false);
    for (let index = keep; index < next.length; index++) output += delimiter(next[index], true);
    active = next;
  };
  for (const [runIndex, run] of runs.entries()) {
    if (run.atom) {
      transition([]);
      output += run.atom.type === "hardBreak" ? (run === runs[runs.length - 1] ? "<br>" : "  \n")
        : tiptapJsonToMarkdown({ type: "doc", content: [run.atom] }).trim();
    } else if (run.marks.some((mark) => mark.type === "code")) {
      transition(standard ? run.marks.filter((mark) => mark.type !== "code") : []);
      const fence = "`".repeat(Math.max(1, ...Array.from(run.text.matchAll(/`+/g), (match) => match[0].length + 1)));
      const padding = run.text.startsWith("`") || run.text.endsWith("`") || (/^ | $/.test(run.text) && /\S/.test(run.text)) ? " " : "";
      output += `${fence}${padding}${run.text}${padding}${fence}`;
    } else {
      const [, leading, text, trailing] = /^(\s*)([\s\S]*?)(\s*)$/.exec(run.text)!;
      if (leading) {
        transition(standard ? active.filter((mark) => run.marks.some((item) => sameInlineMark(mark, item))) : []);
        output += escapeInlineText(leading);
      }
      if (text) { transition(run.marks); output += escapeInlineText(text, !standard || !output.trim()); }
      if (trailing) {
        const next = runs[runIndex + 1];
        transition(standard ? active.filter((mark) => next?.marks.some((item) => sameInlineMark(mark, item))) : []);
        output += escapeInlineText(trailing);
      }
    }
  }
  transition([]);
  // Encode edge whitespace so block parsing cannot treat it as indentation or discard it.
  return encodeEdges ? output.replace(/^\s+|\s+$/g, (space) => [...space].map((char) => `&#${char.charCodeAt(0)};`).join("")) : output;
}

function sameInlineMark(a: EditorMark, b: EditorMark) {
  return a.type === b.type && (a.type !== "link" || a.attrs?.href === b.attrs?.href);
}

function sameInlineMarks(a: EditorMark[], b: EditorMark[]) {
  return a.length === b.length && a.every((mark, index) => sameInlineMark(mark, b[index]));
}

function escapeInlineText(text: string, blockStart = true) {
  const escaped = text.replace(/[\\`*_{}\[\]<>~=&]/g, "\\$&");
  return blockStart ? escaped
    .replace(/^([#+-])(?=\s|$)|^(-)(?=--+$)/, "\\$&")
    .replace(/^(\d+)([.)])(?=\s)/, "$1\\$2") : escaped;
}

function nodeText(node: EditorNode | undefined): string {
  if (!node) {
    return "";
  }
  if (node.type === "text") {
    return node.text ?? "";
  }
  if (node.type === "fileAttachment") {
    return String(node.attrs?.name ?? "Файл");
  }
  if (node.type === "noteMention") {
    return `@${String(node.attrs?.label ?? "Заметка")}`;
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

function listToMarkdown(node: EditorNode, standard = false): string {
  return (node.content ?? []).map((item, index) => {
    const prefix = node.type === "orderedList" ? `${Number(node.attrs?.start ?? 1) + index}. `
      : node.type === "taskList" ? `- [${item.attrs?.checked ? "x" : " "}] ` : "- ";
    const [first, ...remaining] = item.content ?? [];
    const firstText = first?.type === "paragraph" ? inlineToMarkdown(first.content, standard) : "";
    const nested = (first?.type === "paragraph" ? remaining : item.content ?? [])
      .map((child) => {
        const separator = ["bulletList", "orderedList", "taskList"].includes(child.type) ? "\n" : "\n\n";
        const markdown = tiptapJsonToMarkdown({ type: "doc", content: [child] }, standard);
        return separator + markdown.split("\n").map((line) => " ".repeat(node.type === "taskList" ? 2 : prefix.length) + line).join("\n");
      });
    return prefix + firstText + nested.join("");
  }).join("\n");
}

function tableToMarkdown(node: EditorNode, standard = false) {
  const { grid } = projectTable(node);
  if (!grid.length) return "";
  const rows = grid.map((row) => row.map((cell) => cell ? inlineToMarkdown(cell.content?.flatMap((block) => block.content ?? []), standard).replace(/  \n/g, "<br>").replace(/\|/g, "\\|") : ""));
  const alignments = grid[0].map((cell) => {
    const alignment = cell?.content?.[0]?.attrs?.textAlign ?? cell?.attrs?.align;
    return alignment === "left" ? ":---" : alignment === "center" ? ":---:" : alignment === "right" ? "---:" : "---";
  });
  return [`| ${rows[0].join(" | ")} |`, `| ${alignments.join(" | ")} |`, ...rows.slice(1).map((row) => `| ${row.join(" | ")} |`)].join("\n");
}

export function tiptapJsonToStandardMarkdown(document: EditorDocument): string {
  return tiptapJsonToMarkdown(document, true);
}

export function tiptapJsonToMarkdown(document: EditorDocument, standard = false): string {
  return (document.content ?? [])
    .map((node, index) => {
      if (node.type === "paragraph") {
        return node.content?.length ? inlineToMarkdown(node.content, standard) : standard || index === (document.content?.length ?? 0) - 1 ? "" : "<p></p>";
      }
      if (node.type === "heading") {
        const level = Number(node.attrs?.level ?? 1);
        return `${"#".repeat(Math.min(3, Math.max(1, level)))} ${inlineToMarkdown(node.content, standard)}`;
      }
      if (node.type === "horizontalRule") {
        return "---";
      }
      if (node.type === "blockquote") {
        if (standard) return tiptapJsonToMarkdown({ type: "doc", content: node.content ?? [] }, true).split("\n").map((line) => `> ${line}`).join("\n");
        return (node.content ?? []).map((child) => `> ${inlineToMarkdown(child.content, standard)}`).join("\n");
      }
      if (node.type === "codeBlock") {
        const language = String(node.attrs?.language ?? "");
        const fence = "`".repeat(standard ? Math.max(3, ...Array.from(nodeText(node).matchAll(/`+/g), (match) => match[0].length + 1)) : 3);
        return `${fence}${language}\n${nodeText(node)}\n${fence}`;
      }
      if (node.type === "bulletList") {
        return listToMarkdown(node, standard);
      }
      if (node.type === "orderedList") {
        return listToMarkdown(node, standard);
      }
      if (node.type === "taskList") {
        return listToMarkdown(node, standard);
      }
      if (node.type === "table") {
        return tableToMarkdown(node, standard);
      }
      if (node.type === "image") {
        const alt = String(node.attrs?.alt ?? "");
        const src = String(node.attrs?.src ?? "");
        return `![${alt}](${src})`;
      }
      if (node.type === "noteMention") {
        return `@[[${String(node.attrs?.label ?? "Заметка")}]]`;
      }
      if (node.type === "inlineDate") {
        return `{{date:${String(node.attrs?.value ?? "")}}}`;
      }
      if (node.type === "callout") {
        const variant = String(node.attrs?.variant ?? "info");
        return `:::${variant}\n${tiptapJsonToMarkdown({ type: "doc", content: node.content ?? [] }, standard)}\n:::`;
      }
      if (node.type === "detailsBlock") {
        const summary = node.content?.find((child) => child.type === "detailsSummary");
        const detailsContent = node.content?.find((child) => child.type === "detailsContent");
        return `:::details ${inlineToMarkdown(summary?.content, standard) || "Заголовок блока"}\n${tiptapJsonToMarkdown({ type: "doc", content: detailsContent?.content ?? [] }, standard)}\n:::`;
      }
      if (node.type === "fileAttachment") {
        return `[file:${String(node.attrs?.name ?? "Файл")}](noteflow-file://${String(node.attrs?.storageId ?? "")})`;
      }

      return index === 0 ? "" : nodeText(node);
    })
    .filter((block) => block.length > 0)
    .join("\n\n");
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
    const level = Math.min(3, Math.max(1, Number(node.attrs?.level ?? 1)));
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
    return `<div data-type="file-attachment" data-storage-id="${escapeHtml(String(node.attrs?.storageId ?? ""))}"><span>${escapeHtml(String(node.attrs?.name ?? "Файл"))}</span><small>${escapeHtml(String(node.attrs?.size ?? ""))}</small></div>`;
  }
  if (node.type === "noteMention") {
    return `<span data-type="note-mention" data-note-id="${escapeHtml(String(node.attrs?.noteId ?? ""))}">@${escapeHtml(String(node.attrs?.label ?? "Заметка"))}</span>`;
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
