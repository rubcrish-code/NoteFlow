import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { getSearchTerms } from "../notes/searchText";

export interface NoteSearchState { query: string; index: number; matches: { from: number; to: number }[]; decorations: DecorationSet }
export const noteSearchKey = new PluginKey<NoteSearchState>("note-search");

export function noteSearchMatches(state: EditorState, query: string) {
  const terms = [...new Set(getSearchTerms(query))].sort((a, b) => b.length - a.length);
  if (!terms.length) return [];
  const pattern = new RegExp(terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "giu");
  const matches: { from: number; to: number }[] = [];
  state.doc.descendants((node, position) => {
    if (!node.isTextblock) return;
    let text = "";
    node.forEach((child) => { text += child.isText ? child.text : "\ufffc".repeat(child.nodeSize); });
    for (const match of text.matchAll(pattern)) matches.push({ from: position + 1 + match.index, to: position + 1 + match.index + match[0].length });
    return false;
  });
  return matches;
}

export const NoteSearch = Extension.create({
  name: "noteSearch",
  addProseMirrorPlugins() {
    return [new Plugin<NoteSearchState>({
      key: noteSearchKey,
      state: {
        init: () => ({ query: "", index: 0, matches: [], decorations: DecorationSet.empty }),
        apply(transaction, previous, _old, state) {
          const update = transaction.getMeta(noteSearchKey) as { query?: string; index?: number } | undefined;
          if (!update && !transaction.docChanged) return previous;
          const query = update?.query ?? previous.query;
          const matches = noteSearchMatches(state, query);
          const previousMatch = previous.matches[previous.index];
          const mappedPosition = previousMatch ? transaction.mapping.map(previousMatch.from) : null;
          const mappedIndex = mappedPosition === null ? -1 : matches.findIndex((match) => match.from >= mappedPosition);
          const requestedIndex = update?.index ?? (query !== previous.query ? 0 : transaction.docChanged && mappedIndex >= 0 ? mappedIndex : previous.index);
          const index = matches.length ? Math.max(0, Math.min(matches.length - 1, requestedIndex)) : 0;
          return { query, matches, index, decorations: DecorationSet.create(state.doc, matches.map((match, offset) => Decoration.inline(match.from, match.to, { class: offset === index ? "note-search-match current" : "note-search-match" }))) };
        },
      },
      props: { decorations: (state) => noteSearchKey.getState(state)?.decorations ?? null },
    })];
  },
});
