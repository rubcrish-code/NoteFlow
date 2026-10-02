import { Lexer, Marked, type MarkedToken, type Token } from "marked";
import type { EditorMark, EditorNode } from "./markdownService";

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
  return convertTokens(new Lexer(parser.defaults).inlineTokens(source));
}

function convertTokens(tokens: Token[], marks: EditorMark[] = []): EditorNode[] {
  return tokens.flatMap((raw): EditorNode[] => {
    if (raw.type === "noteFlowInline") {
      const token = raw as NoteFlowToken;
      if (token.kind === "highlight") return convertTokens(token.tokens ?? [], [...marks, { type: "highlight" }]);
      return [token.kind === "date" ? { type: "inlineDate", attrs: { value: token.value } }
        : { type: "noteMention", attrs: { label: token.value, noteId: token.value } }];
    }
    // Custom tokens are handled above; remaining tokens are Marked's built-in union.
    const token = raw as MarkedToken;
    if (token.type === "html" && /^<br\s*\/?\s*>$/i.test(token.raw)) return [{ type: "hardBreak" }];
    if (token.type === "strong" || token.type === "em" || token.type === "del" || token.type === "link") {
      const mark: EditorMark = token.type === "link" ? { type: "link", attrs: { href: token.href } }
        : { type: token.type === "strong" ? "bold" : token.type === "em" ? "italic" : "strike" };
      return convertTokens(token.tokens, [...marks, mark]);
    }
    if (token.type === "br") return [{ type: "hardBreak" }];
    const text = "text" in token ? token.text : token.raw;
    const nextMarks = token.type === "codespan" ? [...marks, { type: "code" }] : marks;
    return text ? [{ type: "text", text, ...(nextMarks.length ? { marks: nextMarks } : {}) }] : [];
  });
}

export function readMarkdownList(source: string) {
  return parser.lexer(source).find((token): token is import("marked").Tokens.List => token.type === "list");
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
        if (child.type === "text" || child.type === "paragraph") return [{ type: "paragraph", content: parseMarkdownInline(child.text) }];
        if (child.type === "space" || child.type === "checkbox") return [];
        return parseBlocks(child.raw);
      }),
    })),
  };
}
