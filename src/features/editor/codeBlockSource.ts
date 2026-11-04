import type { EditorNode } from "./markdownService";
import { sanitizeMarkdownLinkHref } from "../../shared/safeLinkHref";

export const CODE_BLOCK_SOURCE_ATTR = "richTextSource";

export interface CodeBlockSource {
  version: 1;
  text: string;
  content: EditorNode[];
}

const containers = new Set(["blockquote", "bulletList", "orderedList", "listItem", "taskList", "taskItem"]);
const textblocks = new Set(["paragraph", "heading", "codeBlock"]);

// Snapshots are data, never HTML. Bound validation also protects imported sidecars.
export function readCodeBlockSource(value: unknown): CodeBlockSource | null {
  if (!isRecord(value) || value.version !== 1 || typeof value.text !== "string" || !Array.isArray(value.content)) return null;
  if (value.text.length > 2_000_000) return null;
  let remaining = 20_000;
  const readNode = (input: unknown, depth: number): EditorNode | null => {
    if (--remaining < 0 || depth > 64 || !isRecord(input) || typeof input.type !== "string") return null;
    const type = input.type;
    if (type !== "text" && type !== "hardBreak" && !containers.has(type) && !textblocks.has(type)) return null;
    if (input.attrs !== undefined && !isRecord(input.attrs)) return null;
    if (isRecord(input.attrs) && input.attrs[CODE_BLOCK_SOURCE_ATTR]) return null;
    if (type === "text" && (typeof input.text !== "string" || !input.text)) return null;
    if (input.marks !== undefined && (!Array.isArray(input.marks) || !input.marks.every((mark: unknown) =>
      isRecord(mark) && typeof mark.type === "string" && (mark.attrs === undefined || isRecord(mark.attrs))
      && (mark.type !== "link" || (isRecord(mark.attrs) && typeof mark.attrs.href === "string" && Boolean(sanitizeMarkdownLinkHref(mark.attrs.href))))))) return null;
    const node: EditorNode = { type };
    if (isRecord(input.attrs)) node.attrs = JSON.parse(JSON.stringify(input.attrs)) as Record<string, unknown>;
    if (typeof input.text === "string") node.text = input.text;
    if (Array.isArray(input.marks)) node.marks = JSON.parse(JSON.stringify(input.marks)) as EditorNode["marks"];
    if (input.content !== undefined) {
      if (!Array.isArray(input.content)) return null;
      const children = input.content.map((child) => readNode(child, depth + 1));
      if (children.some((child) => child === null)) return null;
      node.content = children as EditorNode[];
    }
    return node;
  };
  const content = value.content.map((node) => readNode(node, 0));
  if (!content.length || content.some((node) => node === null)) return null;
  const source: CodeBlockSource = { version: 1, text: value.text, content: content as EditorNode[] };
  return projectCodeBlockContent(source.content) === source.text ? source : null;
}

export function projectCodeBlockContent(content: EditorNode[]): string {
  const blocks: string[] = [];
  const visit = (node: EditorNode) => {
    if (textblocks.has(node.type)) {
      blocks.push((node.content ?? []).map((child) => child.type === "hardBreak" ? "\n" : child.text ?? "").join(""));
    } else (node.content ?? []).forEach(visit);
  };
  content.forEach(visit);
  return blocks.join("\n");
}

// This is an identity guard against stale metadata, not an authentication hash.
export function codeBlockSourceBinding(markdown: string): string {
  let first = 2166136261;
  let second = 5381;
  for (let index = 0; index < markdown.length; index++) {
    const code = markdown.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second, 33) ^ code;
  }
  return `${markdown.length}:${first >>> 0}:${second >>> 0}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
