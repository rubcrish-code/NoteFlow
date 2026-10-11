import { Extension } from "@tiptap/core";
import Link from "@tiptap/extension-link";
import { TextSelection } from "@tiptap/pm/state";
import { sanitizeMarkdownLinkHref } from "../../shared/safeLinkHref";

export const MAX_PARAGRAPH_INDENT = 100;

export function paragraphIndentLimit(width: number) {
  return Math.min(MAX_PARAGRAPH_INDENT, Math.max(0, Math.floor((width - 120) / 24)));
}

export const EditorIndent = Extension.create({
  name: "editorIndent", priority: 1000,
  addGlobalAttributes() {
    return [{ types: ["paragraph", "heading"], attributes: { indent: {
      default: 0,
      parseHTML: (element: HTMLElement) => Math.min(MAX_PARAGRAPH_INDENT, Math.max(0, Number(element.dataset.editorIndent) || 0)),
      renderHTML: (attributes: Record<string, unknown>) => attributes.indent ? { "data-editor-indent": String(attributes.indent), style: `padding-inline-start: min(${Math.min(MAX_PARAGRAPH_INDENT, Math.max(0, Number(attributes.indent) || 0)) * 24}px, max(0px, calc(100% - 120px)))` } : {},
    } } }];
  },
  addKeyboardShortcuts() {
    const indent = (outdent: boolean) => {
      const editor = this.editor;
      if (editor.isActive("table")) return false;
      if (editor.isActive("taskItem") || editor.isActive("listItem")) {
        let type = editor.isActive("taskItem") ? "taskItem" : "listItem";
        const { $from } = editor.state.selection;
        for (let depth = $from.depth; depth > 0; depth--) {
          const name = $from.node(depth).type.name;
          if (name === "taskItem" || name === "listItem") {
            type = name;
            break;
          }
        }
        if (outdent) editor.commands.liftListItem(type);
        else editor.commands.sinkListItem(type);
        return true;
      }
      const { selection, tr } = editor.state;
      if (editor.isActive("codeBlock")) {
        if (!selection.$from.sameParent(selection.$to)) return false;
        const start = selection.$from.start();
        const text = selection.$from.parent.textContent;
        const from = selection.from - start;
        const to = selection.to - start;
        const firstLine = text.lastIndexOf("\n", from - 1) + 1;
        const positions = [firstLine];
        for (let offset = text.indexOf("\n", firstLine); offset >= 0 && offset + 1 < to; offset = text.indexOf("\n", offset + 1)) positions.push(offset + 1);
        for (const position of positions.reverse()) {
          if (!outdent) tr.insertText("  ", start + position);
          else {
            const length = /^(?: {1,2}|\t)/.exec(text.slice(position))?.[0].length ?? 0;
            if (length) tr.delete(start + position, start + position + length);
          }
        }
        tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map(selection.from), tr.mapping.map(selection.to)));
      } else {
        tr.doc.nodesBetween(selection.from, selection.to, (node, position) => {
          if (node.type.name !== "paragraph" && node.type.name !== "heading") return;
          const current = Number(node.attrs.indent ?? 0);
          const limit = paragraphIndentLimit(editor.view.dom.clientWidth || 600);
          const next = outdent ? Math.max(0, current - 1) : Math.max(current, Math.min(limit, current + 1));
          tr.setNodeMarkup(position, undefined, { ...node.attrs, indent: next });
        });
      }
      if (tr.docChanged) editor.view.dispatch(tr);
      return true;
    };
    return { Tab: () => indent(false), "Shift-Tab": () => indent(true) };
  },
});

export const NoteFlowLink = Link.extend({
  renderHTML(props) {
    const href = props.HTMLAttributes.href;
    const result = this.parent!(props);
    // Keep the parent's URI/XSS validation; only annotate safe anchors.
    if (typeof href === "string" && sanitizeMarkdownLinkHref(href) && Array.isArray(result) && typeof result[1] === "object" && result[1] !== null) {
      Object.assign(result[1], { "data-tooltip": href.startsWith("#") ? "Перейти к заголовку" : href });
    }
    return result;
  },
});
