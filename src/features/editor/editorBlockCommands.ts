import { Fragment, Slice, type ResolvedPos, type Schema } from "@tiptap/pm/model";
import { TextSelection, type Transaction } from "@tiptap/pm/state";
import { CODE_BLOCK_SOURCE_ATTR, projectCodeBlockContent, readCodeBlockSource, type CodeBlockSource } from "./codeBlockSource";
import type { EditorNode } from "./markdownService";

function boundary(position: ResolvedPos, end: boolean, containerDepth: number): number {
  let result = position.pos;
  for (let depth = position.depth; depth > containerDepth; depth--) {
    if (!position.node(depth).isTextblock && depth === position.depth) break;
    if (result !== (end ? position.end(depth) : position.start(depth))) break;
    result = end ? position.after(depth) : position.before(depth);
  }
  return result;
}

function checked(fragment: Fragment): boolean {
  try { fragment.forEach((node) => node.check()); return true; } catch { return false; }
}

function fragmentFromSource(source: CodeBlockSource, schema: Schema): Fragment | null {
  try {
    const fragment = Fragment.fromArray(source.content.map((node) => schema.nodeFromJSON(node)));
    return checked(fragment) ? fragment : null;
  } catch { return null; }
}

export function restoreCodeBlockContent(value: unknown, text: string, schema: Schema): Fragment | null {
  const source = readCodeBlockSource(value);
  if (!source) return null;
  const original = fragmentFromSource(source, schema);
  if (!original) return null;
  if (source.text === text) return original;

  let from = 0;
  while (from < source.text.length && from < text.length && source.text[from] === text[from]) from++;
  let to = source.text.length;
  let newTo = text.length;
  while (to > from && newTo > from && source.text[to - 1] === text[newTo - 1]) { to--; newTo--; }
  const inserted = text.slice(from, newTo);
  if (inserted.includes("\n") || source.text.slice(from, to).includes("\n")) return null;

  // Only map an unambiguous edit inside one textblock; never resurrect deleted structure.
  const doc = schema.nodes.doc.create(null, original);
  let offset = 0;
  let replacement: Fragment | null = null;
  doc.descendants((node, position) => {
    if (!node.isTextblock) return;
    const length = node.textBetween(0, node.content.size, "", "\n").length;
    if (from >= offset && to <= offset + length && !replacement) {
      const start = from - offset;
      const end = to - offset;
      const marks = doc.resolve(position + 1 + start).marks();
      const inline = inserted ? Fragment.from(schema.text(inserted, marks)) : Fragment.empty;
      const content = node.content.cut(0, start).append(inline).append(node.content.cut(end));
      if (node.type.validContent(content)) {
        const updated = node.copy(content);
        const trDoc = doc.replace(position, position + node.nodeSize, new Slice(Fragment.from(updated), 0, 0));
        replacement = trDoc.content;
      }
    }
    offset += length + 1;
    return false;
  });
  return replacement;
}

function sourceFor(content: Fragment): CodeBlockSource | null {
  const nodes = content.toJSON() as EditorNode[];
  return readCodeBlockSource({ version: 1, content: nodes, text: projectCodeBlockContent(nodes) });
}

/** Replace only the selected closed fragment, retaining cut ancestors on either side. */
export function toggleSelectedEditorBlock(tr: Transaction, kind: "blockquote" | "codeBlock"): boolean {
  const { selection } = tr;
  const { $from, $to } = selection;
  const schema = tr.doc.type.schema;
  let activeDepth = 0;
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.name === kind && $to.pos <= $from.end(depth)) { activeDepth = depth; break; }
  }

  if (kind === "codeBlock" && activeDepth) {
    const node = $from.node(activeDepth);
    const restored = restoreCodeBlockContent(node.attrs[CODE_BLOCK_SOURCE_ATTR], node.textContent, schema)
      ?? Fragment.fromArray(node.textContent.split("\n").map((line) => schema.nodes.paragraph.create(null, line ? schema.text(line) : null)));
    const start = $from.before(activeDepth);
    const parent = $from.node(activeDepth - 1);
    if (!parent.canReplace($from.index(activeDepth - 1), $from.index(activeDepth - 1) + 1, restored)) return false;
    tr.replaceWith(start, $from.after(activeDepth), restored);
    tr.setSelection(TextSelection.near(tr.doc.resolve(start + 1)));
    return true;
  }

  if (kind === "blockquote" && activeDepth && selection.empty) {
    const node = $from.node(activeDepth);
    const start = $from.before(activeDepth);
    const parent = $from.node(activeDepth - 1);
    if (!parent.canReplace($from.index(activeDepth - 1), $from.index(activeDepth - 1) + 1, node.content)) return false;
    tr.replaceWith(start, $from.after(activeDepth), node.content);
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(selection.from - 1, start + node.content.size))));
    return true;
  }

  // A wrapper may need splitting at several levels (e.g. a selected list fragment).
  const initialDepth = activeDepth ? activeDepth - 1 : Math.min($from.sharedDepth($to.pos), Math.max(0, $from.depth - 1));
  for (let depth = initialDepth; depth >= 0; depth--) {
    const parent = $from.node(depth);
    if (parent.isTextblock) continue;
    const base = $from.start(depth);
    const from = boundary($from, selection.empty && $from.parentOffset === $from.parent.content.size, depth);
    const to = selection.empty ? from : boundary($to, true, depth);
    const start = $from.depth > depth ? $from.before(depth + 1) : $from.pos;
    const end = $to.depth > depth ? $to.after(depth + 1) : $to.pos;
    const before = parent.cut(start - base, from - base).content;
    const after = parent.cut(to - base, end - base).content;
    const selected = selection.empty ? Fragment.from(schema.nodes.paragraph.create()) : parent.cut(from - base, to - base).content;
    if (!checked(before) || !checked(after) || !checked(selected)) continue;

    let target: Fragment;
    if (activeDepth) {
      if (selected.childCount !== 1 || selected.firstChild?.type.name !== kind) continue;
      target = selected.firstChild.content;
    } else if (kind === "blockquote") {
      if (!schema.nodes.blockquote.validContent(selected)) continue;
      target = Fragment.from(schema.nodes.blockquote.create(null, selected));
    } else {
      const source = selection.empty ? null : sourceFor(selected);
      if (!selection.empty && !source) return false;
      target = Fragment.from(schema.nodes.codeBlock.create({ [CODE_BLOCK_SOURCE_ATTR]: source }, source?.text ? schema.text(source.text) : null));
    }
    const replacement = before.append(target).append(after);
    const startIndex = $from.index(depth);
    const endIndex = $to.depth === depth ? $to.index(depth) : $to.indexAfter(depth);
    if (!parent.canReplace(startIndex, endIndex, replacement)) continue;
    tr.replaceWith(start, end, replacement);
    const targetStart = start + before.size;
    const head = TextSelection.near(tr.doc.resolve(targetStart + 1));
    const tail = TextSelection.near(tr.doc.resolve(targetStart + target.size - 1), -1);
    tr.setSelection(selection.empty || activeDepth ? head : TextSelection.create(tr.doc, head.from, tail.to));
    return true;
  }
  return false;
}
