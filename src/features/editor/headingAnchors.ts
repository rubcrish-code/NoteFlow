import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

export interface NoteHeading { id: string; text: string; level: 1 | 2 | 3; position: number; size: number }

export function noteHeadings(document: ProseMirrorNode): NoteHeading[] {
  const used = new Set<string>();
  const headings: NoteHeading[] = [];
  document.descendants((node, position) => {
    if (node.type.name !== "heading" || ![1, 2, 3].includes(Number(node.attrs.level))) return;
    const text = node.textContent;
    const stem = text.toLowerCase().replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "").replace(/\s/g, "-") || "section";
    let id = stem;
    let suffix = 1;
    while (used.has(id)) id = `${stem}-${suffix++}`;
    used.add(id);
    headings.push({ id, text, level: Number(node.attrs.level) as 1 | 2 | 3, position, size: node.nodeSize });
  });
  return headings;
}

export function scrollToNoteHeading(view: EditorView, anchor: string): boolean {
  let id: string;
  try { id = decodeURIComponent(anchor.replace(/^#/, "")); } catch { return false; }
  const heading = noteHeadings(view.state.doc).find((item) => item.id === id);
  if (!heading) return false;
  const element = view.nodeDOM(heading.position);
  if (!(element instanceof HTMLElement)) return false;
  element.scrollIntoView({ block: "start", behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  return true;
}

function decorations(document: ProseMirrorNode) {
  return DecorationSet.create(document, noteHeadings(document).map((heading) => Decoration.node(heading.position, heading.position + heading.size, { id: heading.id })));
}

const key = new PluginKey<DecorationSet>("noteHeadingAnchors");
export const HeadingAnchors = Extension.create({
  name: "headingAnchors",
  addProseMirrorPlugins: () => [new Plugin({ key, state: { init: (_, state) => decorations(state.doc), apply: (transaction, previous) => transaction.docChanged ? decorations(transaction.doc) : previous }, props: { decorations: (state) => key.getState(state) } })],
});
