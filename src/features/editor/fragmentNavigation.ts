import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { FragmentAnchor } from "../../shared/internalNoteLink";
import { invoke } from "../../services/safeInvoke";

export const fragmentNavigationKey = new PluginKey<DecorationSet>("fragment-navigation");
export const FragmentNavigation = Extension.create({
  name: "fragmentNavigation",
  addProseMirrorPlugins() {
    return [new Plugin<DecorationSet>({ key: fragmentNavigationKey,
      state: { init: () => DecorationSet.empty, apply(tr, previous) {
        const range = tr.getMeta(fragmentNavigationKey) as { from: number; to: number } | null | undefined;
        if (range !== undefined) return range ? DecorationSet.create(tr.doc, [Decoration.inline(range.from, range.to, { class: "note-fragment-target" })]) : DecorationSet.empty;
        return tr.docChanged ? DecorationSet.empty : previous;
      } },
      props: { decorations: (state) => fragmentNavigationKey.getState(state) ?? null },
    })];
  },
});

export function documentTextMap(doc: ProseMirrorNode) {
  let raw = "";
  const rawPositions: number[] = [];
  doc.descendants((node, position) => {
    if (!node.isTextblock) return;
    if (raw) { raw += "\n"; rawPositions.push(position); }
    node.forEach((child, offset) => {
      const text = child.isText ? child.text ?? "" : child.type.name === "hardBreak" ? "\n" : "\ufffc";
      for (let index = 0; index < text.length; index++) { raw += text[index]; rawPositions.push(position + 1 + offset + index); }
    });
    return false;
  });
  let text = ""; const positions: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (/\s/u.test(raw[i])) { if (text && !text.endsWith(" ")) { text += " "; positions.push(rawPositions[i]); } }
    else { text += raw[i]; positions.push(rawPositions[i]); }
  }
  if (text.endsWith(" ")) { text = text.slice(0, -1); positions.pop(); }
  return { text, positions };
}

async function fingerprint(text: string) {
  const input = new TextEncoder().encode(text);
  if (!globalThis.crypto?.subtle) return invoke<string>("fingerprint_fragment_context", { context: new TextDecoder().decode(input) });
  const bytes = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function sourceSnapshotIsCurrent(sourceUpdatedAt: string, noteUpdatedAt: string) {
  const sourceTime = Date.parse(sourceUpdatedAt);
  return Number.isFinite(sourceTime) && sourceTime === Date.parse(noteUpdatedAt);
}

function blockContext(doc: ProseMirrorNode, map: ReturnType<typeof documentTextMap>, offset: number, length: number) {
  const start = doc.resolve(map.positions[offset]).start();
  const end = doc.resolve(map.positions[offset + length - 1] + 1).end();
  let before = offset;
  let after = offset + length;
  while (before > 0 && offset - before < 48 && map.positions[before - 1] >= start) before--;
  while (after < map.text.length && after - offset - length < 48 && map.positions[after] < end) after++;
  return { before: map.text.slice(before, offset), after: map.text.slice(offset + length, after) };
}

export async function captureFragmentAnchor(doc: ProseMirrorNode, from: number, to: number): Promise<FragmentAnchor | null> {
  const map = documentTextMap(doc);
  const start = map.positions.findIndex((position) => position >= from);
  let end = map.positions.findIndex((position) => position >= to);
  if (end < 0) end = map.text.length;
  const selected = start < 0 ? "" : map.text.slice(start, end);
  const quote = selected.trim();
  if (!quote || quote.length > 2000 || quote.includes("\ufffc")) return null;
  const offset = start + selected.indexOf(quote);
  const context = blockContext(doc, map, offset, quote.length);
  return { quote, before: await fingerprint(context.before), after: await fingerprint(context.after) };
}

export async function resolveDocumentFragment(doc: ProseMirrorNode, quote: string, anchor?: FragmentAnchor) {
  const map = documentTextMap(doc);
  const normalized = quote.trim().replace(/\s+/gu, " ");
  if (!normalized || (!anchor && normalized.length < 12)) return null;
  const matches: Array<{ from: number; to: number; score: number }> = [];
  let offset = 0;
  while ((offset = map.text.indexOf(normalized, offset)) >= 0) {
    let score = 1;
    if (anchor) {
      const context = blockContext(doc, map, offset, normalized.length);
      score = Number(await fingerprint(context.before) === anchor.before)
        + Number(await fingerprint(context.after) === anchor.after);
    }
    if (score) matches.push({ from: map.positions[offset], to: map.positions[offset + normalized.length - 1] + 1, score });
    offset += 1;
    if (matches.length > 100) return null;
  }
  const best = matches.filter((match) => match.score === Math.max(...matches.map((match) => match.score)));
  return best.length === 1 ? { from: best[0].from, to: best[0].to } : null;
}
