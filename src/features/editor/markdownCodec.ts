import { translate } from "../../shared/i18n";
import { Mark, Node, getExtensionField, type Extensions, type JSONContent, type MarkdownParseHelpers, type MarkdownRendererHelpers, type MarkdownToken, type RenderContext } from "@tiptap/core";
import { Markdown, MarkdownManager } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import Image from "@tiptap/extension-image";
import Paragraph from "@tiptap/extension-paragraph";
import Heading from "@tiptap/extension-heading";
import { Lexer, Marked, Tokenizer } from "marked";
import { preparePortableDocument } from "./portableMarkdown";
import { projectTable } from "./tableDocumentLayout";
import { sanitizeMarkdownLinkHref } from "../../shared/safeLinkHref";
import type { EditorDocument, EditorNode, EditorMark } from "./markdownService";
import { EXTENDED_MARK_TYPES, extendedMarkdownExtensions, wrapMarkdownBlock, wrapMarkdownTable, wrapMarkdownImage } from "./markdownExtended";

export const MARKDOWN_CODEC = "tiptap-markdown-v1";
const standardMarks = new Set(["bold", "italic", "strike", "code", "link"]);
const standardNodes = new Set(["doc", "text", "paragraph", "heading", "hardBreak", "horizontalRule", "codeBlock", "blockquote", "bulletList", "orderedList", "listItem", "taskList", "taskItem", "table", "tableRow", "tableCell", "tableHeader", "image"]);
const persistenceError = () => new Error(translate("ui.6ede6d87c22e"));
function boundedMarked() {
  const mayAutolink = (source: string) => /@|https?:\/\/|ftp:\/\/|www\.|mailto:|xmpp:/i.test(source);
  return new Marked({ gfm: true, tokenizer: {
    // GFM's email lookahead is quadratic on long URL-free runs. Delegate to
    // Marked's CommonMark text rule there, retaining GFM's tilde boundary.
    url(source) { return source.length > 4096 && !mayAutolink(source) ? undefined : false; },
    inlineText(source) {
      if (source.length <= 4096 || mayAutolink(source)) return false;
      const candidate = Lexer.rules.inline.normal.text.exec(source)?.[0];
      if (!candidate) return false;
      const tilde = candidate.indexOf("~");
      const raw = tilde < 0 ? candidate : candidate.slice(0, Math.max(1, tilde));
      return { type: "text", raw, text: raw };
    },
  } });
}
const listLexer = boundedMarked();

export function isLayoutOnlyParagraph(node: EditorNode) {
  return node.type === "paragraph" && (node.content ?? []).every(child => child.type === "hardBreak" || child.type === "text" && !(child.text ?? "").trim());
}

function renderListItem(node: JSONContent, h: MarkdownRendererHelpers, context: RenderContext) {
  const task = node.type === "taskItem";
  const parent = context.meta?.parentAttrs;
  const bullet = parent?.markdownBullet === "+" ? "+" : "-";
  const delimiter = parent?.markdownDelimiter === ")" ? ")" : ".";
  const prefix = task ? `${bullet} [${node.attrs?.checked ? "x" : " "}] ` : context.parentType === "orderedList"
    ? `${(Number(parent?.start) || 1) + context.index}${delimiter} ` : `${bullet} `;
  const [first, ...rest] = node.content ?? [];
  const firstBody = first?.type === "paragraph" ? h.renderChild ? h.renderChild(first, 0) : h.renderChildren([first]) : "";
  let result = prefix + firstBody.split("\n").map((line, index) => index ? " ".repeat(task ? 2 : prefix.length) + line : line).join("\n");
  for (const [index, child] of (first?.type === "paragraph" ? rest : node.content ?? []).entries()) {
    const separator = ["bulletList", "orderedList", "taskList"].includes(String(child.type)) ? "\n" : "\n\n";
    const nested = h.renderChild ? h.renderChild(child, index + 1) : h.renderChildren([child]);
    result += separator + nested.split("\n").map(line => " ".repeat(task ? 2 : prefix.length) + line).join("\n");
  }
  return result;
}

// A private Marked instance prevents one editor's extension tokenizers leaking
// into other editors or the serialization worker. The public lexer API is shared.
function markedInstance() {
  return boundedMarked() as unknown as NonNullable<ConstructorParameters<typeof MarkdownManager>[0]>["marked"];
}

function renderTable(node: JSONContent, helpers: MarkdownRendererHelpers) {
  const { grid } = projectTable(node as EditorNode);
  if (!grid.length) return "";
  const rows = grid.map(row => row.map(cell => (cell?.content ?? []).map(block => helpers.renderChildren(block.content ?? []))
    .join(" ").replace(/\s*\n\s*/g, " ").replace(/\|/g, "\\|")));
  const separators = grid[0].map(cell => {
    const align = cell?.content?.[0]?.attrs?.textAlign ?? cell?.attrs?.align;
    return align === "left" ? ":---" : align === "center" ? ":---:" : align === "right" ? "---:" : "---";
  });
  return [rows[0], separators, ...rows.slice(1)].map(row => `| ${row.join(" | ")} |`).join("\n");
}

function fencedBlock(name: "callout" | "detailsBlock") {
  return Node.create({
    name, group: "block", content: name === "callout" ? "block+" : "detailsSummary detailsContent",
    markdownTokenName: name,
    markdownTokenizer: {
      name, level: "block",
      start: source => { const index = source.indexOf(name === "callout" ? "\n:::" : "\n:::details"); return index < 0 ? -1 : index + 1; },
      tokenize(source, _tokens, lexer) {
        const lines = source.split("\n");
        const first = name === "callout" ? /^:::(info|tip|warning|important)\s*$/.exec(lines[0]) : /^:::details(?:\s+(.*))?$/.exec(lines[0]);
        if (!first) return undefined;
        let depth = 1, end = 1, fence = "";
        for (; end < lines.length; end++) {
          const code = /^\s*(`{3,}|~{3,})/.exec(lines[end]);
          if (code) { if (!fence) fence = code[1]; else if (code[1][0] === fence[0] && code[1].length >= fence.length) fence = ""; }
          if (fence) continue;
          if (/^:::(?:info|tip|warning|important|details|nf-block|nf-table|nf-image)(?:\s|$)/.test(lines[end])) depth++;
          if (/^:::\s*$/.test(lines[end]) && --depth === 0) break;
          if (depth > 64) return undefined;
        }
        return { type: name, raw: lines.slice(0, end + 1).join("\n"), value: first[1] ?? "", tokens: lexer.blockTokens(lines.slice(1, end).join("\n")), summary: lexer.inlineTokens(first[1] ?? "") };
      },
    },
    parseMarkdown(token, helpers) {
      const body = helpers.parseChildren(token.tokens ?? []);
      return name === "callout" ? helpers.createNode(name, { variant: token.value }, body)
        : helpers.createNode(name, {}, [helpers.createNode("detailsSummary", {}, helpers.parseInline(token.summary ?? [])), helpers.createNode("detailsContent", {}, body)]);
    },
    renderMarkdown(node, helpers) {
      if (name === "callout") return `:::${String(node.attrs?.variant ?? "info")}\n${helpers.renderChildren(node.content ?? [], "\n\n")}\n:::`;
      const summary = node.content?.find(child => child.type === "detailsSummary");
      const body = node.content?.find(child => child.type === "detailsContent");
      return `:::details ${helpers.renderChildren(summary?.content ?? [])}\n${helpers.renderChildren(body?.content ?? [], "\n\n")}\n:::`;
    },
  });
}

const customNodes = [
  Node.create({ name: "markdownLiteral", inline: true, group: "inline", atom: true,
    renderMarkdown: node => String(node.attrs?.encoded ?? "") }),
  fencedBlock("callout"), fencedBlock("detailsBlock"),
  Node.create({ name: "detailsSummary", content: "inline*", renderMarkdown: (node, h) => h.renderChildren(node.content ?? []) }),
  Node.create({ name: "detailsContent", content: "block+", renderMarkdown: (node, h) => h.renderChildren(node.content ?? [], "\n\n") }),
  Node.create({ name: "inlineDate", inline: true, group: "inline", atom: true,
    markdownTokenizer: { name: "inlineDate", level: "inline", start: source => source.indexOf("{{date:"), tokenize(source) {
      const match = /^\{\{date:([^}\n]+)\}\}/.exec(source);
      return match ? { type: "inlineDate", raw: match[0], value: match[1] } : undefined;
    } }, parseMarkdown: (token, h) => h.createNode("inlineDate", { value: token.value }),
    renderMarkdown: node => `{{date:${String(node.attrs?.value ?? "")}}}` }),
  Node.create({ name: "noteMention", inline: true, group: "inline", atom: true,
    markdownTokenizer: { name: "noteMention", level: "inline", start: source => source.indexOf("@[["), tokenize(source) {
      const match = /^@\[\[([^\]\n]+)\]\]/.exec(source);
      return match ? { type: "noteMention", raw: match[0], value: match[1] } : undefined;
    } }, parseMarkdown: (token, h) => h.createNode("noteMention", { label: token.value, noteId: token.value }),
    renderMarkdown: node => `@[[${String(node.attrs?.label ?? translate("ui.025e14681a4c"))}]]` }),
  Node.create({ name: "fileAttachment", group: "block", atom: true,
    markdownTokenizer: { name: "fileAttachment", level: "block", start: source => { const index = source.indexOf("\n[file:"); return index < 0 ? -1 : index + 1; }, tokenize(source, _tokens, lexer) {
      const line = source.split("\n")[0], token = lexer.inlineTokens(line)[0];
      return token?.type === "link" && String(token.href).startsWith("noteflow-file://") && String(token.text).startsWith("file:")
        ? { type: "fileAttachment", raw: line, label: String(token.text).slice(5), storageId: String(token.href).slice(16) } : undefined;
    } }, parseMarkdown: (token, h) => h.createNode("fileAttachment", { name: token.label, storageId: token.storageId, size: "", type: "application/octet-stream" }),
    renderMarkdown: (node, h) => `[${node.attrs?.portableExport ? "" : "file:"}${h.renderChildren({ type: "text", text: String(node.attrs?.name ?? translate("ui.f242456b2273")) })}](noteflow-file://${String(node.attrs?.storageId ?? "")})` }),
  Node.create({ name: "noteFlowLists", group: "block", content: "block*", markdownTokenName: "noteFlowLists",
    markdownTokenizer: { name: "noteFlowLists", level: "block", start: () => -1,
      tokenize(source, _tokens, lexer) {
        if (!/^ {0,3}(?:[-+*]|\d+[.)])\s/.test(source)) return undefined;
        const tokenizer = new Tokenizer({ gfm: true });
        new Lexer({ gfm: true, tokenizer });
        const raw = tokenizer.list(source)?.raw;
        const token = raw ? listLexer.lexer(raw)[0] as MarkdownToken | undefined : undefined;
        if (token?.type !== "list") return undefined;
        // Keep GFM's established task/nested-list boundaries. Only re-tokenize
        // inline text and explicit extension blocks with the active lexer.
        const visit = (item: MarkdownToken): MarkdownToken[] => {
          if (["text", "paragraph"].includes(String(item.type))) {
            if (/^:::(?:nf-block|nf-table|nf-image|info|tip|warning|important|details)(?:\s|$)/.test(String(item.raw))) return lexer.blockTokens(String(item.raw));
            const inlineSource = item.tokens?.filter(child => child.type !== "checkbox").map(child => child.raw ?? child.text ?? "").join("") ?? String(item.text ?? "");
            item.tokens = lexer.inlineTokens(inlineSource);
          } else {
            if (item.type === "list") item.type = "noteFlowLists";
            item.tokens = item.tokens?.flatMap(visit);
            item.items?.forEach(child => { child.tokens = child.tokens?.flatMap(visit); });
          }
          return [item];
        };
        visit(token);
        return token;
      } },
    parseMarkdown(token, h) {
      const groups: Array<{ task: boolean; items: MarkdownToken[] }> = [];
      for (const item of token.items ?? []) {
        const task = !token.ordered && item.task === true;
        const last = groups[groups.length - 1];
        if (last?.task === task) last.items.push(item); else groups.push({ task, items: [item] });
      }
      return groups.map(group => h.createNode(group.task ? "taskList" : token.ordered ? "orderedList" : "bulletList", token.ordered ? { start: Number(token.start) || 1 } : {}, group.items.map(item => {
        const content = (item.tokens ?? []).flatMap(child => {
          if (["space", "checkbox"].includes(String(child.type))) return [];
          if (["text", "paragraph"].includes(String(child.type))) {
            const inline = child.tokens ?? new Lexer({ gfm: true }).inlineTokens(String(child.text ?? "")) as MarkdownToken[];
            return [h.createNode("paragraph", {}, h.parseInline(inline.filter(part => part.type !== "checkbox")))];
          }
          return h.parseChildren([child]);
        });
        return h.createNode(group.task ? "taskItem" : "listItem", group.task ? { checked: Boolean(item.checked) } : {}, content.length ? content : [h.createNode("paragraph", {}, [])]);
      })));
    } }),
];

// Projection-only, already-escaped text. The public code-context flag prevents
// a second escaping pass while the official manager still owns mark boundaries.
const escapedText = Mark.create({ name: "markdownEscaped", code: true, renderMarkdown: (node, h) => h.renderChildren(node) });

const table = Table.extend({ renderMarkdown: renderTable });
const italic = Mark.create({ name: "italic", markdownTokenName: "em",
  parseMarkdown: (token, h) => h.applyMark("italic", h.parseInline(token.tokens ?? [])),
  markdownOptions: { htmlReopen: { open: "_", close: "_" } },
  renderMarkdown: (node, h) => `*${h.renderChildren(node)}*` });
const codeBlock = Node.create({ name: "codeBlock", group: "block", content: "text*", code: true, markdownTokenName: "code",
  parseMarkdown: (token, h) => h.createNode("codeBlock", { language: token.lang || null }, token.text ? [h.createTextNode(token.text)] : []),
  renderMarkdown(node) {
    const text = (node.content ?? []).map(child => child.text ?? "").join("");
    const fence = "`".repeat(Math.max(3, ...Array.from(text.matchAll(/`+/g), match => match[0].length + 1)));
    const language = String(node.attrs?.language ?? "").replace(/[^a-zA-Z0-9_+.#-]/g, "");
    return `${fence}${language}\n${text}\n${fence}`;
  } });
const code = Mark.create({ name: "code", code: true, markdownTokenName: "codespan",
  parseMarkdown: (token, h) => h.applyMark("code", [h.createTextNode(token.text ?? "")]),
  renderMarkdown: (node, h) => `${String(node.attrs?.markdownFence ?? "`")}${node.attrs?.markdownPadding ? " " : ""}${h.renderChildren(node)}${node.attrs?.markdownPadding ? " " : ""}${String(node.attrs?.markdownFence ?? "`")}` });
const taskList = TaskList.extend({ markdownTokenizer: { name: "unusedTaskList", level: "block", start: () => -1, tokenize: () => undefined } });
const listItem = Node.create({ name: "listItem", content: "paragraph block*", renderMarkdown: renderListItem });
const parseParagraph: (token: MarkdownToken, helpers: MarkdownParseHelpers) => JSONContent | JSONContent[] = getExtensionField(Paragraph, "parseMarkdown");
const paragraph = Paragraph.extend({ parseMarkdown(token, h) {
  const parsed = parseParagraph(token, h);
  return (Array.isArray(parsed) ? parsed : parsed ? [parsed] : []).flatMap(node => {
    if (node.type !== "paragraph" || !node.content?.some(child => child.type === "image")) return [node];
    const blocks: JSONContent[] = []; let inline: JSONContent[] = [];
    const flush = () => { if (inline.length) blocks.push({ ...node, content: inline }); inline = []; };
    for (const child of node.content) {
      if (child.type === "image") {
        // Block images cannot be children of an inline-only paragraph. Their
        // adjacent soft line separator becomes a block boundary, not text.
        const last = inline[inline.length - 1];
        if (last?.type === "text" && last.text?.endsWith("\n")) {
          inline[inline.length - 1] = { ...last, text: last.text.slice(0, -1) };
          if (!inline[inline.length - 1]?.text) inline.pop();
        }
        flush(); blocks.push(child);
      } else {
        const next = !inline.length && blocks[blocks.length - 1]?.type === "image" && child.type === "text" && child.text?.startsWith("\n") ? { ...child, text: child.text.slice(1) } : child;
        if (next.type !== "text" || next.text) inline.push(next);
      }
    }
    flush(); return blocks;
  });
} });
const starterOptions = { paragraph: false, italic: false, underline: false, code: false, codeBlock: false, listItem: false } as const;
const extensions = [StarterKit.configure(starterOptions), paragraph, italic, code, codeBlock, listItem, taskList, TaskItem.extend({ renderMarkdown: renderListItem }), table, TableRow, TableHeader, TableCell, Image, ...customNodes, escapedText];
const extendedParagraph = paragraph.extend({
  renderMarkdown: (node, h) => wrapMarkdownBlock(h.renderChildren(node.content ?? []), node as EditorNode) });
const extendedHeading = Heading.extend({
  renderMarkdown: (node, h) => wrapMarkdownBlock(`${"#".repeat(Math.max(1, Math.min(6, Number(node.attrs?.level) || 1)))} ${h.renderChildren(node.content ?? [])}`, node as EditorNode) });
const extendedTable = table.extend({ renderMarkdown: (node, h) => wrapMarkdownTable(renderTable(node, h), node as EditorNode) });
const renderImageMarkdown: (node: JSONContent, h: MarkdownRendererHelpers, context: RenderContext) => string = getExtensionField(Image, "renderMarkdown");
const extendedImage = Image.extend({ renderMarkdown: (node, h, context) => wrapMarkdownImage(renderImageMarkdown(node, h, context), node as EditorNode) });
const managers = new Map<boolean, MarkdownManager>();
function codec(extended = false) {
  let manager = managers.get(extended);
  if (!manager) {
    const selected = extended ? [StarterKit.configure({ ...starterOptions, heading: false }), ...extensions.slice(1).filter(extension => extension.name !== "paragraph").map(extension => extension.name === "table" ? extendedTable : extension.name === "image" ? extendedImage : extension), extendedParagraph, extendedHeading, ...extendedMarkdownExtensions] : extensions;
    manager = new MarkdownManager({ extensions: selected, marked: markedInstance() }); managers.set(extended, manager);
  }
  return manager;
}

export function withMarkdownCodec(actual: Extensions): Extensions {
  return [...actual, Markdown.extend({
    addStorage() { return { manager: codec(true) }; },
    onBeforeCreate() {
      this.editor.markdown = this.storage.manager;
      this.editor.getMarkdown = () => serializeCodecMarkdown(this.editor.getJSON() as EditorDocument, false, true);
      if (this.editor.options.contentType === "markdown") {
        if (typeof this.editor.options.content !== "string") throw persistenceError();
        this.editor.options.content = parseCodecMarkdown(this.editor.options.content, true);
      }
    },
  }).configure({ marked: markedInstance() })];
}

function clean(node: EditorNode, portable: boolean, writing = false, extended = false): EditorNode {
  if (!standardNodes.has(node.type) && !customNodes.some(extension => extension.name === node.type)) throw persistenceError();
  let content = node.content?.map(child => clean(child, portable, writing, extended));
  if (content) {
    const merged: EditorNode[] = [];
    for (const child of content) {
      const previous = merged[merged.length - 1];
      if (child.type === "text" && previous?.type === "text" && JSON.stringify(previous.marks ?? []) === JSON.stringify(child.marks ?? [])) previous.text = (previous.text ?? "") + (child.text ?? "");
      else merged.push(child);
    }
    content = merged;
  }
  // Invisible block-end breaks and emphasis on edge spaces are not portable.
  if (writing && content && ["paragraph", "heading"].includes(node.type)) {
    if (extended) content = content.map(child => {
      if (child.type !== "text") return child;
      const mixedCode = child.marks?.some(mark => mark.type === "code") && child.marks.length > 1;
      if (!mixedCode && (!/^\s|\s$/.test(child.text ?? "") || child.marks?.some(mark => mark.type === "code"))) return child;
      const exact = child.marks?.filter(mark => ["bold", "italic", "strike", ...(mixedCode ? ["code"] : [])].includes(mark.type)) ?? [];
      if (!exact.length) return child;
      return { ...child, marks: [...(child.marks ?? []).filter(mark => !exact.includes(mark)), { type: "nfExactEmphasis", attrs: Object.fromEntries(exact.map(mark => [mark.type, true])) }] };
    });
    while (content[content.length - 1]?.type === "hardBreak") content.pop();
  }
  if (writing && content && node.type === "doc") {
    while (content[content.length - 1]?.type === "paragraph" && !content[content.length - 1].content?.length) content.pop();
  }
  if (writing && content) {
    let previous: EditorNode | undefined;
    for (const child of content) {
      if (["bulletList", "orderedList", "taskList"].includes(child.type)) {
        const same = previous?.type === child.type;
        child.attrs = { ...child.attrs, markdownBullet: same && previous?.attrs?.markdownBullet === "-" ? "+" : "-",
          markdownDelimiter: same && previous?.attrs?.markdownDelimiter === "." ? ")" : "." };
        previous = child;
      } else if (!isLayoutOnlyParagraph(child)) previous = undefined;
    }
  }
  const marks = node.marks?.filter(mark => (standardMarks.has(mark.type) || extended && EXTENDED_MARK_TYPES.has(mark.type)) && (mark.type !== "link" || sanitizeMarkdownLinkHref(String(mark.attrs?.href ?? ""))))
    .map(mark => ({ ...mark, ...(mark.attrs ? { attrs: Object.fromEntries(Object.entries(mark.attrs).filter(([, value]) => value != null)) } : {}) }));
  if (portable && content) content = content.flatMap(child => {
    if (child.type !== "text" || !child.marks?.some(mark => ["bold", "italic", "strike"].includes(mark.type))) return [child];
    const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(child.text ?? "")!;
    const whitespaceMarks = child.marks.filter(mark => !["bold", "italic", "strike"].includes(mark.type));
    const parts: EditorNode[] = [];
    if (match[1]) parts.push({ ...child, text: match[1], marks: whitespaceMarks });
    if (match[2]) parts.push({ ...child, text: match[2] });
    if (match[3]) parts.push({ ...child, text: match[3], marks: whitespaceMarks });
    return parts;
  });
  if (writing && content && ["paragraph", "heading"].includes(node.type)) {
    if (extended || portable) content = content.map(child => {
      if (child.type !== "text" || child.marks?.some(mark => mark.type === "code")) return child;
      const text = child.text ?? "";
      if (!text.includes("++") && !text.includes("{{date:") && !text.includes("{{nf:") && !text.includes("{{/nf") && !(portable && text.includes("==")) && !(extended && child.marks?.length && /^\s|\s$/.test(text))) return child;
      const guard = "NFMARKDOWNLITERAL";
      const rendered = codec().serialize({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: guard + text + guard }] }] });
      let encoded = rendered.slice(guard.length, -guard.length).replace(/\+/g, "\\+").replace(/\{\{(?=date:|nf:|\/nf)/g, "\\{\\{");
      if (portable) encoded = encoded.replace(/={2,}/g, value => value.replace(/=/g, "\\="));
      if (extended && child.marks?.length) encoded = encoded.replace(/^\s+|\s+$/g, value => Array.from(value, char => `&#${char.charCodeAt(0)};`).join(""));
      return { ...child, text: encoded, marks: [...(child.marks ?? []), { type: "markdownEscaped", attrs: { sourceText: text } }] };
    });
    content = content.flatMap(child => child.type === "text" && !child.marks?.some(mark => mark.type === "code" || mark.type === "markdownEscaped") && (child.text?.includes("{{date:") || portable && child.text?.includes("=="))
      ? child.text.split(/(\{\{(?=date:)|={2,})/).filter(Boolean).map(part => part === "{{" || portable && /^=+$/.test(part)
        ? { type: "markdownLiteral", attrs: { encoded: part.replace(/[={]/g, "\\$&") }, marks: child.marks } : { ...child, text: part }) : [child]);
  }
  if (writing && content && ["paragraph", "heading"].includes(node.type)) {
    // Escape literal block prefixes in the AST, not by rewriting serialized Markdown.
    let lineStart = true;
    content = content.flatMap(child => {
      if (child.type === "hardBreak") { lineStart = true; return [child]; }
      const first = lineStart;
      lineStart = false;
      if (!first || child.type !== "text" || child.marks?.some(mark => mark.type !== "markdownEscaped")) return [child];
      const match = /^( {0,3})(#{1,6}(?=\s|$)|-{3,}(?=\s*$)|[-+](?=\s|$)|>(?=\s|$)|\d+[.)](?=\s|$)|:::(?=(?:info|tip|warning|important|details|nf-block|nf-table|nf-image)(?:\s|$)))/.exec(child.text ?? "");
      if (!match) return [child];
      const marker = match[2], escaped = /^\d/.test(marker) ? marker.slice(0, -1) + "\\" + marker.slice(-1) : "\\" + marker;
      const remainder = (child.text ?? "").slice(match[0].length);
      return [{ type: "markdownLiteral", attrs: { encoded: match[1] + escaped } }, ...(remainder ? [{ ...child, text: remainder }] : [])];
    });
    for (let start = 0; start < content.length; start++) {
      if (!content[start].marks?.some(mark => mark.type === "code")) continue;
      let end = start, text = "";
      while (end < content.length && content[end].type === "text" && content[end].marks?.some(mark => mark.type === "code")) text += content[end++].text ?? "";
      const fence = "`".repeat(Math.max(1, ...Array.from(text.matchAll(/`+/g), match => match[0].length + 1)));
      const padding = /^`|`$/.test(text) || /^ .* $/.test(text) && !/^ +$/.test(text);
      for (let index = start; index < end; index++) content[index].marks = content[index].marks?.map(mark => mark.type === "code" ? { ...mark, attrs: { markdownFence: fence, markdownPadding: padding } } : mark);
      start = end - 1;
    }
  }
  const attrs = { ...node.attrs };
  if (writing && node.type === "image") delete attrs.title;
  if (node.type === "fileAttachment") attrs.portableExport = portable;
  return { ...node, ...(node.attrs || node.type === "fileAttachment" ? { attrs } : {}), ...(content ? { content } : {}), ...(marks ? { marks } : {}) };
}

export function parseCodecMarkdown(markdown: string, extended = false): EditorDocument {
  const parsed = codec(extended).parse(markdown);
  if (parsed.type !== "doc") throw persistenceError();
  return { ...clean(parsed as EditorDocument, false, false, extended), type: "doc" };
}

export function serializeCodecMarkdown(document: EditorDocument, portable = false, extended = false): string {
  const projected = portable ? preparePortableDocument(document).document : document;
  const prepared = clean(projected, portable, true, extended);
  if (portable || extended) {
    const validate = (node: EditorNode) => {
      if (["paragraph", "heading"].includes(node.type) && node.content?.every(child => ["text", "hardBreak"].includes(child.type)) && node.content.some(child => child.marks?.length)) {
        const candidate = codec(extended).serialize({ type: "doc", content: [{ ...node, type: "paragraph" }] });
        const parsed = parseCodecMarkdown(candidate, extended).content?.[0]?.content ?? [];
        if (JSON.stringify(inlineSignature(node.content, extended)) !== JSON.stringify(inlineSignature(parsed, extended))) throw persistenceError();
      }
      node.content?.forEach(validate);
    };
    validate(prepared);
  }
  if (!portable && !extended) {
    const preserveText = (node: EditorNode) => {
      if (["paragraph", "heading"].includes(node.type) && node.content?.every(child => ["text", "hardBreak", "markdownLiteral"].includes(child.type)) && node.content.some(child => child.marks?.length)) {
        const candidate = codec().serialize({ type: "doc", content: [{ ...node, type: "paragraph" }] });
        const literal = (input: EditorNode): string => input.type === "text" ? input.text ?? "" : input.type === "hardBreak" ? "\n" : (input.content ?? []).map(literal).join("");
        let matches = false;
        try { matches = literal(codec().parse(candidate) as EditorNode) === literal(node); } catch { /* The sidecar retains unsupported canonical ranges. */ }
        if (!node.content.some(child => child.type === "markdownLiteral") && !matches) {
          node.content = clean({ ...node, content: node.content.map(child => ({ ...child, marks: [] })) }, false, true).content;
        }
      }
      node.content?.forEach(preserveText);
    };
    preserveText(prepared);
  }
  return codec(extended).serialize(prepared);
}

function inlineSignature(nodes: EditorNode[], extended = false) {
  return nodes.flatMap(node => Array.from(node.type === "hardBreak" ? "\n" : String(node.marks?.find(mark => mark.type === "markdownEscaped")?.attrs?.sourceText ?? node.text ?? ""), text => ({ text,
    marks: node.type === "hardBreak" ? [] : (node.marks ?? []).flatMap<EditorMark>(mark => mark.type === "nfExactEmphasis" ? Object.keys(mark.attrs ?? {}).map(type => ({ type })) : [mark]).filter(mark => standardMarks.has(mark.type) || extended && EXTENDED_MARK_TYPES.has(mark.type)).map(mark => {
      if (mark.type === "link") return `link:${mark.attrs?.href}`;
      if (!extended) return mark.type;
      const keys = mark.type === "fontFormat" ? ["fontFamily", "fontSize"] : ["textStyle", "highlight"].includes(mark.type) ? ["color"] : [];
      return `${mark.type}:${JSON.stringify(Object.fromEntries(Object.entries(mark.attrs ?? {}).filter(([key, value]) => keys.includes(key) && value != null).sort(([a], [b]) => a.localeCompare(b))))}`;
    }).sort() })));
}

export function codecInlineNeedsSidecar(content: EditorNode[]): boolean {
  if (!content.some(node => node.marks?.some(mark => standardMarks.has(mark.type)))) return false;
  if (content.some(node => !["text", "hardBreak"].includes(node.type))) return false;
  const doc: EditorDocument = { type: "doc", content: [{ type: "paragraph", content }] };
  const markdown = serializeCodecMarkdown(doc);
  let parsed: EditorNode[];
  try { parsed = parseCodecMarkdown(markdown).content?.[0]?.content ?? []; } catch { return true; }
  return JSON.stringify(inlineSignature(content)) !== JSON.stringify(inlineSignature(parsed));
}
