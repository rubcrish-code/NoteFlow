import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { AddMarkStep, RemoveMarkStep } from "@tiptap/pm/transform";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { getSearchTerms } from "../notes/searchText";

interface SearchRange { from: number; to: number }
export interface NoteSearchState { query: string; index: number; matches: SearchRange[]; decorations: DecorationSet; pattern: RegExp | null }
export const noteSearchKey = new PluginKey<NoteSearchState>("note-search");

function searchPattern(query: string) {
  const terms = [...new Set(getSearchTerms(query))].sort((a, b) => b.length - a.length);
  return terms.length ? new RegExp(terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "giu") : null;
}

function scanMatches(doc: ProseMirrorNode, pattern: RegExp, ranges?: SearchRange[]) {
  const matches: SearchRange[] = [];
  const scan = (node: ProseMirrorNode, position: number) => {
    if (!node.isTextblock) return;
    let text = "";
    node.forEach((child) => { text += child.isText ? child.text : "\ufffc".repeat(child.nodeSize); });
    for (const match of text.matchAll(pattern)) matches.push({ from: position + 1 + match.index, to: position + 1 + match.index + match[0].length });
    return false;
  };
  if (ranges) for (const range of ranges) doc.nodesBetween(range.from, range.to, scan);
  else doc.descendants(scan);
  return matches;
}

export function noteSearchMatches(state: EditorState, query: string) {
  const pattern = searchPattern(query);
  return pattern ? scanMatches(state.doc, pattern) : [];
}

function changedTextblocks(transaction: Transaction): SearchRange[] | null {
  const ranges: SearchRange[] = [];
  const doc = transaction.doc;
  transaction.mapping.maps.forEach((map, index) => {
    map.forEach((_oldFrom, _oldTo, newFrom, newTo) => {
      const remaining = transaction.mapping.slice(index + 1);
      const from = Math.max(0, Math.min(doc.content.size, remaining.map(newFrom, -1)));
      const to = Math.max(from, Math.min(doc.content.size, remaining.map(newTo, 1)));
      const add = (node: ProseMirrorNode, position: number) => {
        if (!node.isTextblock) return;
        ranges.push({ from: position + 1, to: position + node.nodeSize - 1 });
        return false;
      };
      doc.nodesBetween(from, to, add);
      // A zero-width deletion can land inside a joined textblock.
      for (const position of [from, to]) {
        const resolved = doc.resolve(position);
        if (resolved.parent.isTextblock) ranges.push({ from: resolved.start(), to: resolved.end() });
      }
    });
  });
  if (!ranges.length && !transaction.steps.every((step) => step instanceof AddMarkStep || step instanceof RemoveMarkStep)) return null;
  const merged: SearchRange[] = [];
  for (const range of ranges.sort((a, b) => a.from - b.from)) {
    const last = merged[merged.length - 1];
    if (last && range.from <= last.to) last.to = Math.max(last.to, range.to);
    else merged.push({ ...range });
  }
  return merged;
}

function matchDecoration(match: SearchRange, current: boolean) {
  return Decoration.inline(match.from, match.to, { class: current ? "note-search-match current" : "note-search-match" }, { current });
}

function sameRange(left: SearchRange | undefined, right: SearchRange | undefined) {
  return left?.from === right?.from && left?.to === right?.to;
}

function updateCurrent(decorations: DecorationSet, doc: ProseMirrorNode, previous: SearchRange | undefined, current: SearchRange | undefined) {
  let next = decorations;
  if (previous && !sameRange(previous, current)) {
    const old = next.find(previous.from, previous.to, (spec) => spec.current === true);
    const replacements = old.map((decoration) => matchDecoration(decoration, false));
    next = next.remove(old).add(doc, replacements);
  }
  if (current) {
    const existing = next.find(current.from, current.to).find((decoration) => sameRange(decoration, current));
    if (!existing?.spec.current) next = next.remove(existing ? [existing] : []).add(doc, [matchDecoration(current, true)]);
  }
  return next;
}

export function createNoteSearchPlugin() {
    return new Plugin<NoteSearchState>({
      key: noteSearchKey,
      state: {
        init: () => ({ query: "", index: 0, matches: [], decorations: DecorationSet.empty, pattern: null }),
        apply(transaction, previous, _old, state) {
          const update = transaction.getMeta(noteSearchKey) as { query?: string; index?: number } | undefined;
          if (!update && !transaction.docChanged) return previous;
          const query = update?.query ?? previous.query;
          const queryChanged = query !== previous.query;
          const pattern = queryChanged ? searchPattern(query) : previous.pattern;
          if (!pattern) return queryChanged ? { query, index: 0, matches: [], decorations: DecorationSet.empty, pattern } : previous;
          let matches = previous.matches;
          let decorations = previous.decorations;
          let rebuild = queryChanged;
          if (!queryChanged && transaction.docChanged) {
            const ranges = changedTextblocks(transaction);
            if (ranges === null) rebuild = true;
            else {
              const overlapsChangedBlock = (match: SearchRange) => ranges.some((range) => match.from < range.to && match.to > range.from);
              matches = previous.matches.map((match) => ({ from: transaction.mapping.map(match.from, 1), to: transaction.mapping.map(match.to, -1) }))
                .filter((match) => match.from < match.to && !overlapsChangedBlock(match));
              const changedMatches = scanMatches(state.doc, pattern, ranges);
              matches = [...matches, ...changedMatches].sort((a, b) => a.from - b.from);
              decorations = decorations.map(transaction.mapping, state.doc);
              const removed = ranges.flatMap((range) => decorations.find(range.from, range.to).filter(overlapsChangedBlock));
              decorations = decorations.remove(removed).add(state.doc, changedMatches.map((match) => matchDecoration(match, false)));
            }
          }
          if (rebuild) matches = scanMatches(state.doc, pattern);
          const previousMatch = previous.matches[previous.index];
          const mappedPosition = previousMatch ? transaction.mapping.map(previousMatch.from) : null;
          const mappedIndex = mappedPosition === null ? -1 : matches.findIndex((match) => match.from >= mappedPosition);
          const requestedIndex = update?.index ?? (queryChanged ? 0 : transaction.docChanged && mappedIndex >= 0 ? mappedIndex : previous.index);
          const index = matches.length ? Math.max(0, Math.min(matches.length - 1, requestedIndex)) : 0;
          if (rebuild) decorations = DecorationSet.create(state.doc, matches.map((match, offset) => matchDecoration(match, offset === index)));
          else decorations = updateCurrent(decorations, state.doc, previousMatch ? { from: transaction.mapping.map(previousMatch.from), to: transaction.mapping.map(previousMatch.to, -1) } : undefined, matches[index]);
          return { query, matches, index, decorations, pattern };
        },
      },
      props: { decorations: (state) => noteSearchKey.getState(state)?.decorations ?? null },
    });
}

export const NoteSearch = Extension.create({
  name: "noteSearch",
  addProseMirrorPlugins: () => [createNoteSearchPlugin()],
});
