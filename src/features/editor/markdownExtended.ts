import { translate } from "../../shared/i18n";
import { Mark, Node, type JSONContent } from "@tiptap/core";
import type { EditorMark, EditorNode } from "./markdownService";
import { projectTable, readTableLayouts, restoreTableLayout } from "./tableDocumentLayout";

export const EXTENDED_MARK_TYPES = new Set(["underline", "textStyle", "fontFormat", "highlight", "superscript", "subscript"]);
const MAX_HEADER = 2048;
const MAX_NESTING = 32;
const MAX_OBJECT_HEADER = 262_144;
const MAX_TABLE_CELLS = 20_000;
const color = (value: unknown) => typeof value === "string" && /^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.test(value);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

function readStyle(value: unknown): EditorMark[] | undefined {
  if (!record(value) || !Object.keys(value).length || Object.keys(value).some(key => !["color", "fontFamily", "fontSize", "highlight", "script", "bold", "italic", "strike", "code"].includes(key))) return;
  if (["bold", "italic", "strike", "code"].some(key => value[key] !== undefined && value[key] !== true)) return;
  if (value.color !== undefined && !color(value.color) || value.highlight !== undefined && value.highlight !== true && !color(value.highlight)) return;
  if (value.fontFamily !== undefined && (typeof value.fontFamily !== "string" || !/^[\w\s,'"-]{1,160}$/.test(value.fontFamily))) return;
  if (value.fontSize !== undefined && (typeof value.fontSize !== "string" || !/^\d{1,3}(?:\.\d{1,2})?(?:px|pt|em|rem|%)$/.test(value.fontSize))) return;
  if (value.script !== undefined && value.script !== "sup" && value.script !== "sub") return;
  return [
    ...["bold", "italic", "strike", "code"].flatMap(type => value[type] === true ? [{ type }] : []),
    ...(value.color === undefined ? [] : [{ type: "textStyle", attrs: { color: value.color } }]),
    ...(value.fontFamily === undefined && value.fontSize === undefined ? [] : [{ type: "fontFormat", attrs: { ...(value.fontFamily === undefined ? {} : { fontFamily: value.fontFamily }), ...(value.fontSize === undefined ? {} : { fontSize: value.fontSize }) } }]),
    ...(value.highlight === undefined ? [] : [{ type: "highlight", attrs: { color: value.highlight === true ? null : value.highlight } }]),
    ...(value.script === undefined ? [] : [{ type: value.script === "sup" ? "superscript" : "subscript" }]),
  ];
}

// JSON is bounded and scanned structurally, including quoted/escaped braces.
function jsonHeader(source: string, start: number, limit = MAX_HEADER) {
  if (source[start] !== "{") return;
  let depth = 0, quoted = false;
  for (let index = start; index < Math.min(source.length, start + limit); index++) {
    const char = source[index];
    if (quoted && char === "\\") { index++; continue; }
    if (char === '"') quoted = !quoted;
    if (quoted) continue;
    if (char === "{") depth++;
    if (depth > MAX_NESTING) return;
    if (char === "}" && --depth === 0) {
      try { return { value: JSON.parse(source.slice(start, index + 1)) as unknown, end: index + 1 }; } catch { return; }
    }
  }
}

function closingInline(source: string, start: number, delimiter: "++" | "{{/nf}}") {
  let code = "", brackets = 0, nested = 0;
  for (let index = start; index < source.length; index++) {
    if (source[index] === "\\") { index++; continue; }
    if (source[index] === "`") {
      const run = /^`+/.exec(source.slice(index))![0];
      if (!code) code = run; else if (code === run) code = "";
      index += run.length - 1; continue;
    }
    if (code) continue;
    if (delimiter === "{{/nf}}") {
      if (source.startsWith("{{nf:", index)) { if (++nested > MAX_NESTING) return -1; }
      if (source.startsWith(delimiter, index)) { if (!nested) return index; nested--; }
    } else {
      if (source[index] === "[") brackets++;
      if (source[index] === "]") brackets = Math.max(0, brackets - 1);
      if (!brackets && source.startsWith(delimiter, index) && !/\s/.test(source[index - 1]) && source[index + 2] !== "+") return index;
    }
  }
  return -1;
}

function attachMarks(nodes: JSONContent[], marks: EditorMark[]): JSONContent[] {
  return nodes.map(node => ({ ...node, ...(node.content ? { content: attachMarks(node.content, marks) } : {}),
    ...(!node.content ? { marks: [...(node.marks ?? []).filter(mark => !marks.some(next => next.type === mark.type)), ...marks] } : {}) }));
}

const underline = Mark.create({ name: "underline", markdownTokenName: "nfUnderline",
  markdownOptions: { htmlReopen: { open: "++", close: "++" } },
  markdownTokenizer: { name: "nfUnderline", level: "inline", start: source => source.indexOf("++"),
    tokenize(source, _tokens, lexer) {
      if (!source.startsWith("++") || !source[2] || /[+\s]/.test(source[2])) return;
      const end = closingInline(source, 2, "++");
      if (end < 3) return;
      return { type: "nfUnderline", raw: source.slice(0, end + 2), tokens: lexer.inlineTokens(source.slice(2, end)) };
    } },
  parseMarkdown: (token, h) => h.applyMark("underline", h.parseInline(token.tokens ?? [])),
  renderMarkdown: (node, h) => `++${h.renderChildren(node)}++`,
});

const style = Mark.create({ name: "nfStyle", markdownTokenName: "nfStyle",
  markdownTokenizer: { name: "nfStyle", level: "inline", start: source => source.indexOf("{{nf:"),
    tokenize(source, _tokens, lexer) {
      if (!source.startsWith("{{nf:")) return;
      const header = jsonHeader(source, 5);
      if (!header || !readStyle(header.value) || !source.startsWith("}}", header.end)) return;
      const start = header.end + 2, end = closingInline(source, start, "{{/nf}}");
      if (end <= start) return;
      return { type: "nfStyle", raw: source.slice(0, end + 7), style: header.value, tokens: lexer.inlineTokens(source.slice(start, end)) };
    } },
  parseMarkdown: (token, h) => attachMarks(h.parseInline(token.tokens ?? []), readStyle(token.style) ?? []),
});

function styleMark(name: string, attributes: (attrs: Record<string, unknown>) => Record<string, unknown>) {
  return Mark.create({ name, renderMarkdown(node, h) {
    const value = Object.fromEntries(Object.entries(attributes(node.attrs ?? {})).filter(([, value]) => value != null));
    if (!Object.keys(value).length) return h.renderChildren(node);
    if (!readStyle(value)) throw new Error(translate("ui.3b2ab8fd8390"));
    return `{{nf:${JSON.stringify(value)}}}${h.renderChildren(node)}{{/nf}}`;
  } });
}

export function blockMarkdownAttributes(node: EditorNode) {
  const attrs = node.attrs ?? {};
  return { ...(["left", "center", "right", "justify"].includes(String(attrs.textAlign)) && attrs.textAlign !== "left" ? { textAlign: attrs.textAlign } : {}),
    ...(Number.isInteger(attrs.indent) && Number(attrs.indent) > 0 && Number(attrs.indent) <= 12 ? { indent: attrs.indent } : {}) };
}

export function wrapMarkdownBlock(markdown: string, node: EditorNode) {
  const attrs = blockMarkdownAttributes(node);
  return Object.keys(attrs).length ? `:::nf-block ${JSON.stringify(attrs)}\n${markdown}\n:::` : markdown;
}

const block = Node.create({ name: "nfBlock", group: "block", content: "block+", markdownTokenName: "nfBlock",
  markdownTokenizer: { name: "nfBlock", level: "block", start: source => { const index = source.indexOf("\n:::nf-block "); return index < 0 ? -1 : index + 1; },
    tokenize(source, _tokens, lexer) {
      if (!source.startsWith(":::nf-block ")) return;
      const firstEnd = source.indexOf("\n"), header = jsonHeader(source, 12);
      if (!header || header.end !== firstEnd || !record(header.value) || Object.keys(header.value).some(key => !["textAlign", "indent"].includes(key))) return;
      const { textAlign, indent } = header.value;
      if (textAlign !== undefined && !["left", "center", "right", "justify"].includes(String(textAlign)) || indent !== undefined && (!Number.isInteger(indent) || Number(indent) < 0 || Number(indent) > 12)) return;
      const lines = source.split("\n"); let depth = 1, fence = "";
      for (let end = 1; end < lines.length; end++) {
        const code = /^\s*(`{3,}|~{3,})/.exec(lines[end]);
        if (code) { if (!fence) fence = code[1]; else if (code[1][0] === fence[0] && code[1].length >= fence.length) fence = ""; }
        if (fence) continue;
        if (/^:::(?:nf-block|nf-table|nf-image|info|tip|warning|important|details)(?:\s|$)/.test(lines[end]) && ++depth > MAX_NESTING) return;
        if (/^:::\s*$/.test(lines[end]) && --depth === 0) return { type: "nfBlock", raw: lines.slice(0, end + 1).join("\n"), attributes: header.value, tokens: lexer.blockTokens(lines.slice(1, end).join("\n")) };
      }
    } },
  parseMarkdown(token, h) {
    const children = h.parseChildren(token.tokens ?? []);
    return children.length === 1 && ["paragraph", "heading"].includes(String(children[0].type)) ? [{ ...children[0], attrs: { ...children[0].attrs, ...(token.attributes as Record<string, unknown>) } }] : children;
  },
});

const tableKeys = ["emphasizedBorders", "headerAxesManaged", "headerRow", "headerColumn"];
function tableMetadata(node: EditorNode) {
  if ((node.content ?? []).some(row => (row.content ?? []).some(cell => (cell.content?.length ?? 0) !== 1 || cell.content?.[0].type !== "paragraph" || cell.content[0].content?.some(child => child.type !== "text")))) {
    throw new Error(translate("ui.cca87d45f5b8"));
  }
  const attrs = Object.fromEntries(Object.entries(node.attrs ?? {}).filter(([key, value]) => tableKeys.includes(key) && typeof value === "boolean"));
  const cells = (node.content ?? []).flatMap((row, r) => (row.content ?? []).flatMap((cell, c) => {
    const appearance = Object.fromEntries(Object.entries(cell.attrs ?? {}).filter(([key, value]) => key === "backgroundColor" && color(value) || key === "colwidth" && Array.isArray(value) && value.every(width => Number.isInteger(width) && width > 0 && width <= 10_000)));
    const blocks = (cell.content ?? []).map(blockMarkdownAttributes);
    return Object.keys(appearance).length || blocks.some(block => Object.keys(block).length) ? [{ row: r, cell: c, attrs: appearance, blocks }] : [];
  }));
  const { layout } = projectTable(node);
  const needsLayout = layout.rows.some((row, r) => row.some(cell => cell.colspan !== 1 || cell.rowspan !== 1 || cell.type !== (r === 0 ? "tableHeader" : "tableCell")));
  return { ...(Object.keys(attrs).length ? { attrs } : {}), ...(cells.length ? { cells } : {}), ...(needsLayout ? { layout } : {}) };
}

function wrapObject(kind: "table" | "image", body: string, metadata: Record<string, unknown>) {
  if (!Object.keys(metadata).length) return body;
  const json = JSON.stringify(metadata);
  if (json.length > MAX_OBJECT_HEADER) throw new Error(translate("ui.46d4dad88d2e"));
  return `:::nf-${kind} ${json}\n${body}\n:::`;
}
export const wrapMarkdownTable = (markdown: string, node: EditorNode) => wrapObject("table", markdown, tableMetadata(node));
export function wrapMarkdownImage(markdown: string, node: EditorNode) {
  const attrs = node.attrs ?? {};
  return wrapObject("image", markdown, {
    ...(Number(attrs.width) > 0 && Number(attrs.width) <= 10_000 ? { width: Number(attrs.width) } : {}),
    ...(Number(attrs.height) > 0 && Number(attrs.height) <= 10_000 ? { height: Number(attrs.height) } : {}),
    ...(["left", "center", "right"].includes(String(attrs.alignment)) ? { alignment: attrs.alignment } : {}),
  });
}

function validBlockAttrs(value: unknown) {
  return record(value) && Object.keys(value).every(key => key === "textAlign" && ["left", "center", "right", "justify"].includes(String(value[key])) || key === "indent" && Number.isInteger(value[key]) && Number(value[key]) >= 0 && Number(value[key]) <= 12);
}
function validObject(kind: "table" | "image", value: unknown): value is Record<string, unknown> {
  if (!record(value)) return false;
  if (kind === "image") return Object.entries(value).every(([key, value]) => key === "alignment" ? ["left", "center", "right"].includes(String(value)) : ["width", "height"].includes(key) && typeof value === "number" && value > 0 && value <= 10_000);
  if (Object.keys(value).some(key => !["attrs", "cells", "layout"].includes(key))) return false;
  if (value.attrs !== undefined && (!record(value.attrs) || Object.entries(value.attrs).some(([key, value]) => !tableKeys.includes(key) || typeof value !== "boolean"))) return false;
  if (value.layout !== undefined) {
    const layouts = readTableLayouts([{ index: 0, layout: value.layout }]);
    if (layouts.length !== 1 || layouts[0].layout.width * layouts[0].layout.rows.length > MAX_TABLE_CELLS) return false;
    if (layouts[0].layout.rows.some((row, index) => row.some(cell => cell.rowspan > layouts[0].layout.rows.length - index))) return false;
  }
  return value.cells === undefined || Array.isArray(value.cells) && value.cells.length <= MAX_TABLE_CELLS && value.cells.every(cell => record(cell)
    && Number.isInteger(cell.row) && Number(cell.row) >= 0 && Number.isInteger(cell.cell) && Number(cell.cell) >= 0 && record(cell.attrs)
    && Object.entries(cell.attrs).every(([key, value]) => key === "backgroundColor" ? color(value) : key === "colwidth" && Array.isArray(value) && value.length <= 1000 && value.every(width => Number.isInteger(width) && width > 0 && width <= 10_000))
    && Array.isArray(cell.blocks) && cell.blocks.length <= 1000 && cell.blocks.every(validBlockAttrs));
}
function objectBlock(kind: "table" | "image") {
  const name = kind === "table" ? "nfTable" : "nfImage", prefix = `:::nf-${kind} `;
  return Node.create({ name, group: "block", content: "block+", markdownTokenName: name,
    markdownTokenizer: { name, level: "block", start: source => { const index = source.indexOf(`\n${prefix}`); return index < 0 ? -1 : index + 1; },
      tokenize(source, _tokens, lexer) {
        if (!source.startsWith(prefix)) return;
        const header = jsonHeader(source, prefix.length, MAX_OBJECT_HEADER);
        if (!header || source[header.end] !== "\n" || !validObject(kind, header.value)) return;
        const end = source.indexOf("\n:::", header.end);
        if (end < 0 || !/^\n:::(?:\n|$)/.test(source.slice(end))) return;
        return { type: name, raw: source.slice(0, end + 4), metadata: header.value, tokens: lexer.blockTokens(source.slice(header.end + 1, end)) };
      } },
    parseMarkdown(token, h) {
      const children = h.parseChildren(token.tokens ?? []), metadata = token.metadata;
      if (children.length !== 1 || children[0].type !== kind || !validObject(kind, metadata)) return children;
      const node = children[0] as EditorNode;
      if (kind === "image") node.attrs = { ...node.attrs, ...metadata };
      else {
        if (metadata.layout) {
          const layout = readTableLayouts([{ index: 0, layout: metadata.layout }])[0]?.layout;
          if (!layout || !restoreTableLayout(node, layout)) return children;
        }
        node.attrs = { ...node.attrs, ...(record(metadata.attrs) ? metadata.attrs : {}) };
        for (const cell of Array.isArray(metadata.cells) ? metadata.cells : []) {
          if (!record(cell)) continue;
          const target = node.content?.[Number(cell.row)]?.content?.[Number(cell.cell)];
          if (!target || !record(cell.attrs) || !Array.isArray(cell.blocks)) continue;
          target.attrs = { ...target.attrs, ...cell.attrs };
          const blocks = cell.blocks;
          target.content?.forEach((block, index) => { if (validBlockAttrs(blocks[index])) block.attrs = { ...block.attrs, ...blocks[index] }; });
        }
      }
      return children;
    },
  });
}

export const extendedMarkdownExtensions = [underline, style, block, objectBlock("table"), objectBlock("image"),
  styleMark("nfExactEmphasis", attrs => attrs),
  styleMark("textStyle", attrs => ({ color: attrs.color })),
  styleMark("fontFormat", attrs => Object.fromEntries(Object.entries(attrs).filter(([key, value]) => ["fontFamily", "fontSize"].includes(key) && value != null))),
  styleMark("highlight", attrs => ({ highlight: attrs.color ?? true })),
  styleMark("superscript", () => ({ script: "sup" })), styleMark("subscript", () => ({ script: "sub" })),
];
