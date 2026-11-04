import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { Mapping } from "@tiptap/pm/transform";
import { CODE_BLOCK_SOURCE_ATTR, readCodeBlockSource } from "./codeBlockSource";
import { restoreCodeBlockContent } from "./editorBlockCommands";

export const CodeBlockRestoration = Extension.create({
  name: "codeBlockRestoration",
  addGlobalAttributes() {
    return [{ types: ["codeBlock"], attributes: {
      [CODE_BLOCK_SOURCE_ATTR]: { default: null, rendered: false, parseHTML: () => null },
    } }];
  },
  addProseMirrorPlugins() {
    return [new Plugin({
      appendTransaction(transactions, _oldState, state) {
        const maps = transactions.flatMap((transaction) => transaction.mapping.maps);
        const mapping = new Mapping(maps);
        const positions = new Set<number>();
        maps.forEach((map, index) => map.forEach((_from, _to, from, to) => {
          const rest = mapping.slice(index + 1);
          const start = Math.max(0, Math.min(state.doc.content.size, rest.map(from, -1)));
          const end = Math.max(start, Math.min(state.doc.content.size, rest.map(to, 1)));
          const resolved = state.doc.resolve(start);
          if (resolved.parent.type.name === "codeBlock") positions.add(resolved.before());
          state.doc.nodesBetween(start, end, (node, position) => {
            if (node.type.name === "codeBlock") { positions.add(position); return false; }
          });
        }));
        const tr = state.tr;
        positions.forEach((position) => {
          const node = tr.doc.nodeAt(position);
          if (!node || node.type.name !== "codeBlock" || !node.attrs[CODE_BLOCK_SOURCE_ATTR]) return;
          const source = readCodeBlockSource(node.attrs[CODE_BLOCK_SOURCE_ATTR]);
          if (source?.text === node.textContent) return;
          const restored = restoreCodeBlockContent(source, node.textContent, state.schema);
          const next = restored ? readCodeBlockSource({ version: 1, text: node.textContent, content: restored.toJSON() }) : null;
          tr.setNodeMarkup(position, undefined, { ...node.attrs, [CODE_BLOCK_SOURCE_ATTR]: next });
        });
        return tr.docChanged ? tr : null;
      },
    })];
  },
});
