import type { EditorContentSidecarInput, NoteContentSidecar } from "../../app/types";
import {
  markdownToTiptapDoc,
  tiptapJsonToHtml,
  tiptapJsonToMarkdown,
  tiptapJsonToPlainText,
  type EditorDocument,
  type EditorMark,
  type EditorNode,
} from "./markdownService";
import { normalizeDocumentAssetUris } from "./assetUri";
import { projectTable, readTableLayouts, restoreTableLayout, type TableLayout } from "./tableDocumentLayout";

export const LEGACY_TIPTAP_SIDECAR_KIND = "legacy_tiptap_json";
export const EDITOR_NODE_ATTRS_SIDECAR_KIND = "editor_node_attrs_v1";

type EditorLoadSource = "contentJson" | "markdown";
type EditorLoadFallbackReason = "empty-markdown" | "empty-parsed-markdown" | "markdown-parse-failed" | "invalid-content-json";

export interface EditorContentLoadWarning {
  noteId?: string;
  reason: EditorLoadFallbackReason | "sidecar-apply-failed";
}

export interface StoredEditorContent {
  contentJson: EditorDocument;
  contentMarkdown: string;
  contentSidecars?: NoteContentSidecar[];
  noteId?: string;
  plainText: string;
}

export interface EditorContentLoadResult {
  editorDocument: EditorDocument;
  fallbackReason?: EditorLoadFallbackReason;
  source: EditorLoadSource;
  usedFallback: boolean;
}

export interface EditorContentSerializeResult {
  contentHtml: string;
  contentMarkdown: string;
  contentSidecars: EditorContentSidecarInput[];
  editorDocument: EditorDocument;
  plainText: string;
  wordCount: number;
}

interface EditorContentLoadOptions {
  markdownParser?: (markdown: string) => EditorDocument;
  warn?: (warning: EditorContentLoadWarning) => void;
}

interface SidecarNodeEntry {
  attrs: Record<string, unknown>;
  index: number;
  matcher?: Record<string, string>;
  type: string;
}

interface SidecarTextMarkEntry {
  end: number;
  marks: EditorMark[];
  start: number;
}

interface EditorNodeAttrsSidecarPayload {
  blocks: SidecarNodeEntry[];
  callouts: SidecarNodeEntry[];
  detailsBlocks: SidecarNodeEntry[];
  fileAttachments: SidecarNodeEntry[];
  images: SidecarNodeEntry[];
  tables: SidecarNodeEntry[];
  tableLayouts: Array<{ index: number; layout: TableLayout }>;
  tableCells: SidecarNodeEntry[];
  tableHeaders: SidecarNodeEntry[];
  textMarks: SidecarTextMarkEntry[];
  version: 1;
}

const emptyDocument: EditorDocument = { type: "doc", content: [{ type: "paragraph" }] };
const meaningfulAtomTypes = new Set(["callout", "detailsBlock", "fileAttachment", "horizontalRule", "image", "table"]);
const sidecarTextMarkTypes = new Set(["fontFormat", "subscript", "superscript", "textStyle", "underline"]);
const blockAttrKeys = new Set(["textAlign", "indent"]);
const imageAttrKeys = new Set(["alignment", "alt", "attachmentId", "editedAttachmentId", "editMetadata", "height", "originalAttachmentId", "originalSrc", "src", "title", "width"]);
const fileAttachmentAttrKeys = new Set(["name", "size", "storageId", "type"]);
const tableAttrKeys = new Set(["emphasizedBorders"]);
const tableCellAttrKeys = new Set(["backgroundColor", "colspan", "colwidth", "rowspan"]);
const tableCellAppearanceAttrKeys = new Set(["backgroundColor", "colwidth"]);
const detailsAttrKeys = new Set(["open"]);
const calloutAttrKeys = new Set(["variant"]);

export function buildEditorDocumentFromStoredNoteContent(input: StoredEditorContent, options: EditorContentLoadOptions = {}): EditorContentLoadResult {
  const warn = options.warn ?? warnEditorContentLoad;
  const fallbackDocument = normalizeEditorDocument(input.contentJson);
  const markdown = input.contentMarkdown;

  if (!markdown.trim()) {
    return createFallbackLoadResult(fallbackDocument, hasMeaningfulEditorDocument(fallbackDocument) ? "empty-markdown" : "invalid-content-json");
  }

  try {
    const parser = options.markdownParser ?? markdownToTiptapDoc;
    const parsedDocument = normalizeEditorDocument(parser(markdown));
    if (!hasMeaningfulEditorDocument(parsedDocument) && (hasMeaningfulEditorDocument(fallbackDocument) || input.plainText.trim())) {
      warn({ noteId: input.noteId, reason: "empty-parsed-markdown" });
      return createFallbackLoadResult(fallbackDocument, "empty-parsed-markdown");
    }

    return {
      editorDocument: applyEditorContentSidecars(parsedDocument, input.contentSidecars ?? [], warn, input.noteId),
      source: "markdown",
      usedFallback: false,
    };
  } catch {
    warn({ noteId: input.noteId, reason: "markdown-parse-failed" });
    return createFallbackLoadResult(fallbackDocument, "markdown-parse-failed");
  }
}

export function serializeEditorDocumentForStorage(editorDocument: EditorDocument, contentHtml?: string): EditorContentSerializeResult {
  const normalizedDocument = normalizeDocumentAssetUris(normalizeEditorDocument(editorDocument));
  const plainText = tiptapJsonToPlainText(normalizedDocument);
  return {
    contentHtml: contentHtml ?? tiptapJsonToHtml(normalizedDocument),
    contentMarkdown: tiptapJsonToMarkdown(normalizedDocument),
    contentSidecars: extractEditorContentSidecars(normalizedDocument),
    editorDocument: normalizedDocument,
    plainText,
    wordCount: countWords(plainText),
  };
}

export function extractEditorContentSidecars(editorDocument: EditorDocument): EditorContentSidecarInput[] {
  return [
    {
      kind: EDITOR_NODE_ATTRS_SIDECAR_KIND,
      payloadJson: extractEditorNodeAttrsPayload(editorDocument),
      schemaVersion: 1,
    },
  ];
}

function createFallbackLoadResult(editorDocument: EditorDocument, fallbackReason: EditorLoadFallbackReason): EditorContentLoadResult {
  return {
    editorDocument,
    fallbackReason,
    source: "contentJson",
    usedFallback: true,
  };
}

function warnEditorContentLoad(warning: EditorContentLoadWarning) {
  if (!import.meta.env.DEV) {
    return;
  }
  console.warn("[NoteFlow] Markdown-first editor load fallback", warning);
}

function normalizeEditorDocument(document: EditorDocument): EditorDocument {
  if (document.type !== "doc") {
    return cloneNode(emptyDocument) as EditorDocument;
  }
  const normalized = cloneNode(document) as EditorDocument;
  return normalized.content && normalized.content.length > 0 ? normalized : cloneNode(emptyDocument) as EditorDocument;
}

function hasMeaningfulEditorDocument(document: EditorDocument): boolean {
  if (tiptapJsonToPlainText(document).trim()) {
    return true;
  }
  return collectNodes(document).some((node) => meaningfulAtomTypes.has(node.type));
}

function applyEditorContentSidecars(
  document: EditorDocument,
  sidecars: NoteContentSidecar[],
  warn: (warning: EditorContentLoadWarning) => void,
  noteId?: string,
): EditorDocument {
  try {
    let nextDocument = applyLegacyTiptapAttrs(document, sidecars);
    nextDocument = applyNodeAttrsSidecar(nextDocument, sidecars);
    return nextDocument;
  } catch {
    warn({ noteId, reason: "sidecar-apply-failed" });
    return document;
  }
}

function applyNodeAttrsSidecar(document: EditorDocument, sidecars: NoteContentSidecar[]): EditorDocument {
  const payload = getEditorNodeAttrsPayload(sidecars);
  if (!payload) {
    return document;
  }

  let nextDocument = cloneNode(document) as EditorDocument;
  const tables = collectNodesByType(nextDocument, "table");
  payload.tableLayouts.forEach(({ index, layout }) => {
    if (tables[index]) restoreTableLayout(tables[index], layout);
  });
  applyEntriesByType(nextDocument, "image", payload.images, imageAttrKeys);
  applyEntriesByType(nextDocument, "fileAttachment", payload.fileAttachments, fileAttachmentAttrKeys);
  applyEntriesByType(nextDocument, "detailsBlock", payload.detailsBlocks, detailsAttrKeys);
  applyEntriesByType(nextDocument, "callout", payload.callouts, calloutAttrKeys);
  applyEntriesByType(nextDocument, "table", payload.tables, tableAttrKeys);
  const cellAttrKeys = payload.tableLayouts.length ? tableCellAppearanceAttrKeys : tableCellAttrKeys;
  applyEntriesByType(nextDocument, "tableCell", payload.tableCells, cellAttrKeys);
  applyEntriesByType(nextDocument, "tableHeader", payload.tableHeaders, cellAttrKeys);
  applyBlockEntries(nextDocument, payload.blocks);
  nextDocument = applyTextMarkEntries(nextDocument, payload.textMarks);
  return nextDocument;
}

function applyLegacyTiptapAttrs(document: EditorDocument, sidecars: NoteContentSidecar[]): EditorDocument {
  const legacyDocument = getLegacyTiptapDocument(sidecars);
  if (!legacyDocument) {
    return document;
  }

  const payload = extractEditorNodeAttrsPayload(legacyDocument);
  let nextDocument = cloneNode(document) as EditorDocument;
  const tables = collectNodesByType(nextDocument, "table");
  payload.tableLayouts.forEach(({ index, layout }) => {
    if (tables[index]) restoreTableLayout(tables[index], layout);
  });
  applyEntriesByType(nextDocument, "image", payload.images, imageAttrKeys);
  applyEntriesByType(nextDocument, "fileAttachment", payload.fileAttachments, fileAttachmentAttrKeys);
  applyEntriesByType(nextDocument, "detailsBlock", payload.detailsBlocks, detailsAttrKeys);
  applyEntriesByType(nextDocument, "callout", payload.callouts, calloutAttrKeys);
  applyEntriesByType(nextDocument, "table", payload.tables, tableAttrKeys);
  const cellAttrKeys = payload.tableLayouts.length ? tableCellAppearanceAttrKeys : tableCellAttrKeys;
  applyEntriesByType(nextDocument, "tableCell", payload.tableCells, cellAttrKeys);
  applyEntriesByType(nextDocument, "tableHeader", payload.tableHeaders, cellAttrKeys);
  applyBlockEntries(nextDocument, payload.blocks);
  if (getLinearText(nextDocument) === getLinearText(legacyDocument)) {
    nextDocument = applyTextMarkEntries(nextDocument, payload.textMarks);
  }
  return nextDocument;
}

function extractEditorNodeAttrsPayload(editorDocument: EditorDocument): EditorNodeAttrsSidecarPayload {
  return {
    blocks: extractBlockEntries(editorDocument),
    callouts: extractNodeEntries(editorDocument, "callout", calloutAttrKeys),
    detailsBlocks: extractNodeEntries(editorDocument, "detailsBlock", detailsAttrKeys),
    fileAttachments: extractNodeEntries(editorDocument, "fileAttachment", fileAttachmentAttrKeys, ["storageId", "name"]),
    images: extractNodeEntries(editorDocument, "image", imageAttrKeys, ["src", "alt"]),
    tables: extractNodeEntries(editorDocument, "table", tableAttrKeys),
    tableLayouts: collectNodesByType(editorDocument, "table").map((table, index) => ({ index, layout: projectTable(table).layout })),
    tableCells: extractNodeEntries(editorDocument, "tableCell", tableCellAttrKeys),
    tableHeaders: extractNodeEntries(editorDocument, "tableHeader", tableCellAttrKeys),
    textMarks: extractTextMarkEntries(editorDocument),
    version: 1,
  };
}

function extractNodeEntries(document: EditorDocument, type: string, allowedKeys: Set<string>, matcherKeys: string[] = []): SidecarNodeEntry[] {
  return collectNodesByType(document, type)
    .map((node, index) => {
      const attrs = pickAttrs(node.attrs, allowedKeys);
      const matcher = pickStringAttrs(node.attrs, matcherKeys);
      return { attrs, index, matcher, type };
    })
    .filter((entry) => Object.keys(entry.attrs).length > 0);
}

function extractBlockEntries(document: EditorDocument): SidecarNodeEntry[] {
  return collectNodes(document)
    .filter((node) => node.type === "heading" || node.type === "paragraph")
    .map((node, index) => ({ attrs: pickAttrs(node.attrs, blockAttrKeys), index, type: node.type }))
    .filter((entry) => Object.keys(entry.attrs).length > 0);
}

function extractTextMarkEntries(document: EditorDocument): SidecarTextMarkEntry[] {
  const entries: SidecarTextMarkEntry[] = [];
  let offset = 0;
  visitNodes(document, (node) => {
    if (node.type !== "text") {
      return;
    }

    const text = node.text ?? "";
    const marks = (node.marks ?? []).filter((mark) => isSidecarTextMark(mark) || node.marks?.some((item) => item.type === "code")).map(cloneMark);
    if (text.length > 0 && marks.length > 0) {
      entries.push({ end: offset + text.length, marks, start: offset });
    }
    offset += text.length;
  });
  return entries;
}

function isSidecarTextMark(mark: EditorMark): boolean {
  if (sidecarTextMarkTypes.has(mark.type)) {
    return true;
  }
  return mark.type === "highlight" && Object.keys(mark.attrs ?? {}).length > 0;
}

function applyEntriesByType(document: EditorDocument, type: string, entries: SidecarNodeEntry[], allowedKeys: Set<string>) {
  const nodes = collectNodesByType(document, type);
  entries.forEach((entry) => {
    const node = nodes[entry.index];
    if (!node || !nodeMatchesEntry(node, entry)) {
      return;
    }
    mergeAllowedAttrs(node, entry.attrs, allowedKeys);
  });
}

function applyBlockEntries(document: EditorDocument, entries: SidecarNodeEntry[]) {
  const nodes = collectNodes(document).filter((node) => node.type === "heading" || node.type === "paragraph");
  entries.forEach((entry) => {
    const node = nodes[entry.index];
    if (!node || node.type !== entry.type) {
      return;
    }
    mergeAllowedAttrs(node, entry.attrs, blockAttrKeys);
  });
}

function applyTextMarkEntries(document: EditorDocument, entries: SidecarTextMarkEntry[]): EditorDocument {
  if (entries.length === 0) {
    return document;
  }
  const cursor = { value: 0 };
  const transformed = transformTextMarks(document, entries, cursor)[0];
  return transformed && transformed.type === "doc" ? (transformed as EditorDocument) : document;
}

function transformTextMarks(node: EditorNode, entries: SidecarTextMarkEntry[], cursor: { value: number }): EditorNode[] {
  if (node.type === "text") {
    const text = node.text ?? "";
    const start = cursor.value;
    const end = start + text.length;
    cursor.value = end;
    const boundaries = new Set([0, text.length]);
    entries.forEach((entry) => {
      if (entry.end <= start || entry.start >= end) {
        return;
      }
      boundaries.add(Math.max(0, entry.start - start));
      boundaries.add(Math.min(text.length, entry.end - start));
    });
    const sortedBoundaries = [...boundaries].sort((first, second) => first - second);
    return sortedBoundaries.slice(0, -1).flatMap((from, index) => {
      const to = sortedBoundaries[index + 1];
      if (from === to) {
        return [];
      }
      const activeMarks = entries
        .filter((entry) => entry.start < start + to && entry.end > start + from)
        .flatMap((entry) => entry.marks.map(cloneMark));
      const marks = mergeMarks(node.marks ?? [], activeMarks);
      return [{ ...cloneNode(node), text: text.slice(from, to), marks: marks.length > 0 ? marks : undefined }];
    });
  }

  const nextNode = cloneNode(node);
  if (node.content) {
    nextNode.content = node.content.flatMap((child) => transformTextMarks(child, entries, cursor));
  }
  return [nextNode];
}

function mergeMarks(baseMarks: EditorMark[], sidecarMarks: EditorMark[]) {
  const markMap = new Map<string, EditorMark>();
  [...baseMarks, ...sidecarMarks].forEach((mark) => {
    markMap.set(mark.type, cloneMark(mark));
  });
  return [...markMap.values()];
}

function nodeMatchesEntry(node: EditorNode, entry: SidecarNodeEntry) {
  if (!entry.matcher) {
    return true;
  }
  return Object.entries(entry.matcher).every(([key, value]) => !value || String(node.attrs?.[key] ?? "") === value);
}

function mergeAllowedAttrs(node: EditorNode, attrs: Record<string, unknown>, allowedKeys: Set<string>) {
  const allowedAttrs = pickAttrs(attrs, allowedKeys);
  if (Object.keys(allowedAttrs).length === 0) {
    return;
  }
  node.attrs = { ...(node.attrs ?? {}), ...allowedAttrs };
}

function getEditorNodeAttrsPayload(sidecars: NoteContentSidecar[]): EditorNodeAttrsSidecarPayload | null {
  const payload = sidecars.find((sidecar) => sidecar.kind === EDITOR_NODE_ATTRS_SIDECAR_KIND)?.payloadJson;
  if (!isRecord(payload) || payload.version !== 1) {
    return null;
  }
  return {
    blocks: readNodeEntries(payload.blocks),
    callouts: readNodeEntries(payload.callouts),
    detailsBlocks: readNodeEntries(payload.detailsBlocks),
    fileAttachments: readNodeEntries(payload.fileAttachments),
    images: readNodeEntries(payload.images),
    tables: readNodeEntries(payload.tables),
    tableLayouts: readTableLayouts(payload.tableLayouts),
    tableCells: readNodeEntries(payload.tableCells),
    tableHeaders: readNodeEntries(payload.tableHeaders),
    textMarks: readTextMarkEntries(payload.textMarks),
    version: 1,
  };
}

function getLegacyTiptapDocument(sidecars: NoteContentSidecar[]): EditorDocument | null {
  const payload = sidecars.find((sidecar) => sidecar.kind === LEGACY_TIPTAP_SIDECAR_KIND)?.payloadJson;
  return isEditorDocument(payload) ? normalizeEditorDocument(payload) : null;
}

function readNodeEntries(value: unknown): SidecarNodeEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.index !== "number" || typeof entry.type !== "string" || !isRecord(entry.attrs)) {
      return [];
    }
    return [
      {
        attrs: cloneAttrs(entry.attrs),
        index: Math.max(0, Math.floor(entry.index)),
        matcher: isRecord(entry.matcher) ? pickStringAttrs(entry.matcher, Object.keys(entry.matcher)) : undefined,
        type: entry.type,
      },
    ];
  });
}

function readTextMarkEntries(value: unknown): SidecarTextMarkEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.start !== "number" || typeof entry.end !== "number" || !Array.isArray(entry.marks)) {
      return [];
    }
    const marks = entry.marks.flatMap((mark) => (isEditorMark(mark) ? [cloneMark(mark)] : []));
    return marks.length > 0
      ? [
          {
            end: Math.max(0, Math.floor(entry.end)),
            marks,
            start: Math.max(0, Math.floor(entry.start)),
          },
        ]
      : [];
  });
}

function isEditorDocument(value: unknown): value is EditorDocument {
  return isRecord(value) && value.type === "doc";
}

function isEditorMark(value: unknown): value is EditorMark {
  return isRecord(value) && typeof value.type === "string" && (!("attrs" in value) || isRecord(value.attrs));
}

function collectNodes(document: EditorDocument): EditorNode[] {
  const nodes: EditorNode[] = [];
  visitNodes(document, (node) => nodes.push(node));
  return nodes;
}

function collectNodesByType(document: EditorDocument, type: string): EditorNode[] {
  return collectNodes(document).filter((node) => node.type === type);
}

function visitNodes(node: EditorNode, visitor: (node: EditorNode) => void) {
  visitor(node);
  (node.content ?? []).forEach((child) => visitNodes(child, visitor));
}

function getLinearText(document: EditorDocument) {
  let text = "";
  visitNodes(document, (node) => {
    if (node.type === "text") {
      text += node.text ?? "";
    }
  });
  return text;
}

function pickAttrs(attrs: Record<string, unknown> | undefined, allowedKeys: Set<string>): Record<string, unknown> {
  if (!attrs) {
    return {};
  }
  return Object.fromEntries(Object.entries(attrs).filter(([key, value]) => allowedKeys.has(key) && value !== undefined && value !== null).map(([key, value]) => [key, cloneUnknown(value)]));
}

function pickStringAttrs(attrs: Record<string, unknown> | undefined, keys: string[]): Record<string, string> | undefined {
  if (!attrs || keys.length === 0) {
    return undefined;
  }
  const matcher = Object.fromEntries(keys.map((key) => [key, typeof attrs[key] === "string" ? attrs[key] : ""]).filter(([, value]) => value));
  return Object.keys(matcher).length > 0 ? matcher : undefined;
}

function cloneNode(node: EditorNode): EditorNode {
  const nextNode: EditorNode = { type: node.type };
  if (node.text !== undefined) {
    nextNode.text = node.text;
  }
  if (node.attrs) {
    nextNode.attrs = cloneAttrs(node.attrs);
  }
  if (node.content) {
    nextNode.content = node.content.map(cloneNode);
  }
  if (node.marks) {
    nextNode.marks = node.marks.map(cloneMark);
  }
  return nextNode;
}

function cloneMark(mark: EditorMark): EditorMark {
  const nextMark: EditorMark = { type: mark.type };
  if (mark.attrs) {
    nextMark.attrs = cloneAttrs(mark.attrs);
  }
  return nextMark;
}

function cloneAttrs(attrs: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(attrs).map(([key, value]) => [key, cloneUnknown(value)]));
}

function cloneUnknown(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(cloneUnknown);
  }
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, nestedValue]) => [key, cloneUnknown(nestedValue)]));
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function countWords(text: string) {
  const normalizedText = text.replace(/\s+/g, " ").trim();
  return normalizedText.length > 0 ? normalizedText.split(" ").length : 0;
}
