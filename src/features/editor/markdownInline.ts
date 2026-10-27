import { Lexer, Marked, type MarkedToken, type Token } from "marked";
import type { EditorMark, EditorNode } from "./markdownService";
import { sanitizeMarkdownLinkHref } from "../../shared/safeLinkHref";

interface NoteFlowToken { type: "noteFlowInline"; raw: string; kind: "date" | "mention" | "highlight"; value: string; tokens?: Token[] }

const parser = new Marked({ gfm: true, extensions: [{
  name: "noteFlowInline", level: "inline",
  start: (source) => source.search(/\{\{date:|@\[\[|==/),
  tokenizer(source) {
    const match = /^(?:\{\{date:([^}\n]+)\}\}|@\[\[([^\]\n]+)\]\]|==([^=\n]+)==)/.exec(source);
    if (!match) return undefined;
    const kind = match[1] ? "date" : match[2] ? "mention" : "highlight";
    const value = match[1] ?? match[2] ?? match[3];
    return { type: "noteFlowInline", raw: match[0], kind, value,
      tokens: kind === "highlight" ? this.lexer.inlineTokens(value) : undefined };
  },
}] });

export function parseMarkdownInline(source: string): EditorNode[] {
  // Avoid repeatedly scanning long ordinary text for extensions that are absent.
  const hasExtensions = source.includes("{{date:") || source.includes("@[[") || source.includes("==");
  return convertTokens(new Lexer(hasExtensions ? parser.defaults : { gfm: true }).inlineTokens(source));
}

function convertTokens(tokens: Token[], marks: EditorMark[] = []): EditorNode[] {
  const htmlMarks: Array<{ tag: string; mark: EditorMark }> = [];
  return tokens.flatMap((raw): EditorNode[] => {
    if (raw.type === "html") {
      const closing = /^<\/(strong|b|em|i|s|del|u|mark|code|a)>$/i.exec(raw.raw);
      if (closing && htmlMarks[htmlMarks.length - 1]?.tag === closing[1].toLowerCase()) { htmlMarks.pop(); return []; }
      const opening = /^<(strong|b|em|i|s|del|u|mark|code)>$/i.exec(raw.raw);
      if (opening) {
        const tag = opening[1].toLowerCase();
        const type = ({ strong: "bold", b: "bold", em: "italic", i: "italic", s: "strike", del: "strike", u: "underline", mark: "highlight", code: "code" } as Record<string, string>)[tag];
        htmlMarks.push({ tag, mark: { type } }); return [];
      }
      const highlight = /^<mark style="background-color: (#[\da-f]{6})">$/i.exec(raw.raw);
      if (highlight) { htmlMarks.push({ tag: "mark", mark: { type: "highlight", attrs: { color: highlight[1] } } }); return []; }
      const link = /^<a href="([^"<>]+)">$/i.exec(raw.raw);
      const href = link && sanitizeMarkdownLinkHref(decodeInlineEntities(link[1]));
      if (href) { htmlMarks.push({ tag: "a", mark: { type: "link", attrs: { href } } }); return []; }
    }
    const inheritedMarks = [...new Map([...marks, ...htmlMarks.map((item) => item.mark)].map((mark) => [mark.type, mark])).values()];
    if (htmlMarks.some((item) => item.tag === "code")) {
      return [{ type: "text", text: decodeInlineEntities(raw.raw), marks: inheritedMarks }];
    }
    if (raw.type === "noteFlowInline") {
      const token = raw as NoteFlowToken;
      if (token.kind === "highlight") return convertTokens(token.tokens ?? [], [...inheritedMarks, { type: "highlight" }]);
      return [token.kind === "date" ? { type: "inlineDate", attrs: { value: token.value } }
        : { type: "noteMention", attrs: { label: token.value, noteId: token.value } }];
    }
    // Custom tokens are handled above; remaining tokens are Marked's built-in union.
    const token = raw as MarkedToken;
    if (token.type === "checkbox") return [];
    if (token.type === "html" && /^<br\s*\/?\s*>$/i.test(token.raw)) return [{ type: "hardBreak" }];
    if (token.type === "strong" || token.type === "em" || token.type === "del" || token.type === "link") {
      const href = token.type === "link" ? sanitizeMarkdownLinkHref(token.href) : undefined;
      if (token.type === "link" && !href) return convertTokens(token.tokens, inheritedMarks);
      const mark: EditorMark = token.type === "link" ? { type: "link", attrs: { href } }
        : { type: token.type === "strong" ? "bold" : token.type === "em" ? "italic" : "strike" };
      return convertTokens(token.tokens, [...inheritedMarks, mark]);
    }
    if (token.type === "br") return [{ type: "hardBreak" }];
    const rawText = "text" in token ? token.text : token.raw;
    const text = token.type === "text" ? rawText.replace(/&#(\d{1,7});/g, (match, code: string) => {
      const value = Number(code);
      if (value > 0x10ffff) return match;
      const char = String.fromCodePoint(value);
      return /\s/u.test(char) ? char : match;
    }).replace(/\n/g, " ") : rawText;
    const nextMarks = token.type === "codespan" ? [...inheritedMarks, { type: "code" }] : inheritedMarks;
    const value = token.type !== "codespan" ? decodeInlineEntities(text) : text;
    return value ? [{ type: "text", text: value, ...(nextMarks.length ? { marks: nextMarks } : {}) }] : [];
  });
}

function decodeInlineEntities(text: string) {
  return text.replace(/&(amp|lt|gt|quot|#39);/g, (_, entity: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" })[entity] ?? "");
}

export function readMarkdownList(source: string) {
  return parser.lexer(source).find((token): token is import("marked").Tokens.List => token.type === "list");
}

export function readMarkdownTable(source: string): { node: EditorNode; lineCount: number } | undefined {
  const token = parser.lexer(source).find((item): item is import("marked").Tokens.Table => item.type === "table");
  if (!token) return undefined;
  const row = (cells: import("marked").Tokens.TableCell[], header: boolean): EditorNode => ({
    type: "tableRow",
    content: cells.map((cell, column) => ({ type: header ? "tableHeader" : "tableCell", attrs: token.align[column] ? { align: token.align[column] } : {}, content: [{ type: "paragraph", content: convertTokens(cell.tokens) }] })),
  });
  return { node: { type: "table", content: [row(token.header, true), ...token.rows.map((cells) => row(cells, false))] }, lineCount: token.raw.trimEnd().split("\n").length };
}

export function convertMarkdownList(token: import("marked").Tokens.List, parseBlocks: (source: string) => EditorNode[]): EditorNode[] {
  const groups: import("marked").Tokens.ListItem[][] = [];
  for (const item of token.items) {
    const current = groups[groups.length - 1];
    if (!current || Boolean(current[0].task) !== Boolean(item.task)) groups.push([item]);
    else current.push(item);
  }
  return groups.map((items) => convertListGroup({ ...token, items }, parseBlocks));
}

function convertListGroup(token: import("marked").Tokens.List, parseBlocks: (source: string) => EditorNode[]): EditorNode {
  const task = token.items.every((item) => item.task);
  return {
    type: token.ordered ? "orderedList" : task ? "taskList" : "bulletList",
    ...(token.ordered ? { attrs: { start: Number(token.start) || 1 } } : {}),
    content: token.items.map((item) => ({
      type: task ? "taskItem" : "listItem",
      ...(task ? { attrs: { checked: Boolean(item.checked) } } : {}),
      content: item.tokens.flatMap((raw): EditorNode[] => {
        const child = raw as MarkedToken;
        if (child.type === "list") return convertMarkdownList(child, parseBlocks);
        // Loose GFM items put the checkbox inside paragraph tokens; text still contains its raw marker.
        if (child.type === "text" || child.type === "paragraph") return [{ type: "paragraph", content: child.tokens ? convertTokens(child.tokens) : parseMarkdownInline(child.text) }];
        if (child.type === "space" || child.type === "checkbox") return [];
        return parseBlocks(child.raw);
      }),
    })),
  };
}
