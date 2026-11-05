import { translate } from "../../shared/i18n";
import type { EditorDocument, EditorNode } from "./markdownService";
import { internalNoteHref } from "../../shared/internalNoteLink";
import { sanitizeMarkdownLinkHref } from "../../shared/safeLinkHref";

// Export is a projection only. Never feed it back into canonical storage or backups.
export function preparePortableDocument(input: EditorDocument) {
  const warnings = new Set<string>();
  const text = (value: string): EditorNode => ({ type: "text", text: value });
  const paragraph = (content: EditorNode[]): EditorNode => ({ type: "paragraph", content });
  function project(node: EditorNode, inCell = false): EditorNode[] {
    const attrs = { ...node.attrs };
    const content = (node.content ?? []).flatMap((child) => project(child, inCell || node.type === "tableCell" || node.type === "tableHeader"));
    const markTypes = new Set(["bold", "italic", "strike", "code", "link"]);
    const marks = node.marks?.filter((mark) => {
      if (!markTypes.has(mark.type)) { warnings.add(mark.type === "underline" ? translate("ui.15f4628e2d70") : mark.type === "highlight" ? translate("ui.8ae0c2767626") : translate("ui.548be16490ee")); return false; }
      if (mark.type === "link" && String(mark.attrs?.href ?? "").startsWith("noteflow:")) warnings.add(translate("ui.80a4254cf4f4"));
      return mark.type !== "link" || Boolean(sanitizeMarkdownLinkHref(String(mark.attrs?.href ?? "")));
    });
    if (node.type === "text") return [{ ...node, marks }];
    if (Object.keys(attrs).some((key) => ["fontFamily", "fontSize", "color", "indent", "backgroundColor", "emphasizedBorders", "width", "height", "alignment"].includes(key) && attrs[key]) || !inCell && attrs.textAlign && attrs.textAlign !== "left") warnings.add(translate("ui.aa6f88506466"));
    if (["tableCell", "tableHeader"].includes(node.type) && (Number(attrs.colspan ?? 1) > 1 || Number(attrs.rowspan ?? 1) > 1 || (node.content?.length ?? 0) > 1)) warnings.add(translate("ui.8e8a58e3ef25"));
    if (node.type === "callout") { warnings.add(translate("ui.77478ae0a1c4")); return [{ type: "blockquote", content }]; }
    if (node.type === "detailsBlock") { warnings.add(translate("ui.693e2b12c03d")); return content; }
    if (["detailsSummary", "detailsContent"].includes(node.type)) return node.type === "detailsSummary" ? [paragraph(content)] : content;
    if (node.type === "inlineDate") { warnings.add(translate("ui.3c66c3b5c661")); return [text(String(attrs.value ?? ""))]; }
    if (node.type === "noteMention") {
      warnings.add(translate("ui.80a4254cf4f4"));
      const label = String(attrs.label ?? translate("ui.025e14681a4c"));
      try { return [{ ...text(label), marks: [{ type: "link", attrs: { href: internalNoteHref({ noteId: String(attrs.noteId) }) } }] }]; }
      catch { return [text(label)]; }
    }
    if (node.type === "fileAttachment") {
      warnings.add(translate("ui.5e63bf73f5ce"));
      const name = String(attrs.name ?? translate("ui.f242456b2273"));
      const id = String(attrs.storageId ?? "");
      // The existing backend rewrites this managed reference to the exported resource path.
      return /^[a-zA-Z0-9_-]{1,128}$/.test(id) ? [{ type: "fileAttachment", attrs: { storageId: id, name } }] : [paragraph([text(name)])];
    }
    if (node.type === "image") {
      if (!/^(https?:\/\/|noteflow-asset:\/\/|data:image\/(?:png|jpeg|webp);base64,)/i.test(String(attrs.src ?? ""))) { warnings.add(translate("ui.4a247aa0a694")); return [paragraph([text(String(attrs.alt ?? translate("ui.e5f534734c36")))])]; }
      return [{ ...node, attrs: { src: attrs.src, alt: attrs.alt ?? "" } }];
    }
    const standard = ["doc", "paragraph", "heading", "hardBreak", "horizontalRule", "codeBlock", "blockquote", "bulletList", "orderedList", "listItem", "taskList", "taskItem", "table", "tableRow", "tableCell", "tableHeader"];
    if (!standard.includes(node.type)) {
      warnings.add(translate("ui.b0c383e68d4d"));
      if (content.length) return content;
      const value = String(attrs.latex ?? attrs.formula ?? attrs.value ?? "");
      return value ? [text(value)] : [];
    }
    return [{ ...node, attrs, ...(node.content ? { content } : {}) }];
  }
  const document = project(input)[0] as EditorDocument;
  return { document, warnings: [...warnings] };
}
