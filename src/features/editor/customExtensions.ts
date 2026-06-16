import { Mark, Node, mergeAttributes } from "@tiptap/core";

export type CalloutVariant = "important" | "info" | "tip" | "warning";

const calloutIcons: Record<CalloutVariant, string> = {
  important: "!",
  info: "i",
  tip: "✓",
  warning: "!",
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: {
      insertCallout: (attrs?: { variant?: CalloutVariant }) => ReturnType;
    };
    detailsBlock: {
      insertDetailsBlock: () => ReturnType;
    };
    fileAttachment: {
      insertFileAttachment: (attrs: { name: string; size: string; storageId: string; type: string }) => ReturnType;
    };
    formulaBlock: {
      insertFormulaBlock: (attrs: { latex: string }) => ReturnType;
    };
    formulaInline: {
      insertFormulaInline: (attrs: { latex: string }) => ReturnType;
    };
    inlineDate: {
      insertInlineDate: (attrs: { value: string }) => ReturnType;
    };
    fontFormat: {
      setFontFamily: (fontFamily: string) => ReturnType;
      setFontSize: (fontSize: string) => ReturnType;
      unsetFontFamily: () => ReturnType;
      unsetFontSize: () => ReturnType;
      unsetFontFormat: () => ReturnType;
    };
    noteMention: {
      insertNoteMention: (attrs: { label: string; noteId: string }) => ReturnType;
    };
  }
}

function normalizeFontSize(fontSize: string) {
  const trimmedSize = fontSize.trim();
  return /^\d+$/.test(trimmedSize) ? `${trimmedSize}px` : trimmedSize;
}

export const FontFormat = Mark.create({
  name: "fontFormat",

  addAttributes() {
    return {
      fontFamily: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-font-family") ?? (element.style.fontFamily.replace(/['"]/g, "") || null),
        renderHTML: (attributes) => {
          const fontFamily = attributes.fontFamily;
          return typeof fontFamily === "string" && fontFamily ? { "data-font-family": fontFamily } : {};
        },
      },
      fontSize: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-font-size") ?? (element.style.fontSize || null),
        renderHTML: (attributes) => {
          const fontSize = attributes.fontSize;
          return typeof fontSize === "string" && fontSize ? { "data-font-size": fontSize } : {};
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="font-format"]' }, { style: "font-family" }, { style: "font-size" }];
  },

  renderHTML({ HTMLAttributes }) {
    const fontFamily = String(HTMLAttributes["data-font-family"] ?? "");
    const fontSize = String(HTMLAttributes["data-font-size"] ?? "");
    const styles = [
      fontFamily ? `font-family: ${fontFamily}` : "",
      fontSize ? `font-size: ${normalizeFontSize(fontSize)}` : "",
    ].filter(Boolean);

    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-type": "font-format",
        style: styles.join("; "),
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setFontFamily:
        (fontFamily) =>
        ({ commands, editor }) => {
          const currentFontSize = editor.getAttributes(this.name).fontSize;
          return commands.setMark(this.name, {
            fontFamily,
            fontSize: typeof currentFontSize === "string" ? currentFontSize : null,
          });
        },
      setFontSize:
        (fontSize) =>
        ({ commands, editor }) => {
          const currentFontFamily = editor.getAttributes(this.name).fontFamily;
          return commands.setMark(this.name, {
            fontFamily: typeof currentFontFamily === "string" ? currentFontFamily : null,
            fontSize: normalizeFontSize(fontSize),
          });
        },
      unsetFontFamily:
        () =>
        ({ commands, editor }) => {
          const currentFontSize = editor.getAttributes(this.name).fontSize;
          return typeof currentFontSize === "string" && currentFontSize ? commands.setMark(this.name, { fontSize: currentFontSize }) : commands.unsetMark(this.name);
        },
      unsetFontSize:
        () =>
        ({ commands, editor }) => {
          const currentFontFamily = editor.getAttributes(this.name).fontFamily;
          return typeof currentFontFamily === "string" && currentFontFamily
            ? commands.setMark(this.name, { fontFamily: currentFontFamily })
            : commands.unsetMark(this.name);
        },
      unsetFontFormat:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      variant: {
        default: "info",
        parseHTML: (element) => element.getAttribute("data-variant") ?? "info",
        renderHTML: (attributes) => ({ "data-variant": String(attributes.variant ?? "info") }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="callout"]', contentElement: ".callout-content" }];
  },

  renderHTML({ HTMLAttributes }) {
    const variant = String(HTMLAttributes["data-variant"] ?? "info") as CalloutVariant;
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "callout", class: `callout callout-${variant}` }),
      ["span", { class: "callout-icon", contenteditable: "false" }, calloutIcons[variant] ?? calloutIcons.info],
      ["div", { class: "callout-content" }, 0],
    ];
  },

  addCommands() {
    return {
      insertCallout:
        (attrs = {}) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { variant: attrs.variant ?? "info" },
            content: [{ type: "paragraph", content: [{ type: "text", text: "Новая выноска" }] }],
          }),
    };
  },
});

export const DetailsSummary = Node.create({
  name: "detailsSummary",
  content: "inline*",
  defining: true,

  parseHTML() {
    return [{ tag: "summary" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["summary", mergeAttributes(HTMLAttributes, { class: "details-summary" }), 0];
  },
});

export const DetailsContent = Node.create({
  name: "detailsContent",
  content: "block+",
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="details-content"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "details-content", class: "details-content" }), 0];
  },
});

export const DetailsBlock = Node.create({
  name: "detailsBlock",
  group: "block",
  content: "detailsSummary detailsContent",
  defining: true,

  addAttributes() {
    return {
      open: {
        default: true,
        parseHTML: (element) => element.hasAttribute("open"),
        renderHTML: (attributes) => (attributes.open ? { open: "" } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'details[data-type="details-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["details", mergeAttributes(HTMLAttributes, { "data-type": "details-block", class: "details-block" }), 0];
  },

  addCommands() {
    return {
      insertDetailsBlock:
        () =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { open: true },
            content: [
              { type: "detailsSummary", content: [{ type: "text", text: "Заголовок блока" }] },
              {
                type: "detailsContent",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Содержимое сворачиваемого блока" }] }],
              },
            ],
          }),
    };
  },
});

export const FileAttachment = Node.create({
  name: "fileAttachment",
  atom: true,
  group: "block",
  selectable: true,

  addAttributes() {
    return {
      name: { default: "Файл" },
      size: { default: "" },
      storageId: { default: "" },
      type: { default: "application/octet-stream" },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="file-attachment"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "file-attachment", class: "file-attachment" }),
      ["span", { class: "file-attachment-icon" }, "↗"],
      ["span", { class: "file-attachment-name" }, String(HTMLAttributes.name ?? "Файл")],
      ["span", { class: "file-attachment-meta" }, String(HTMLAttributes.size ?? "")],
    ];
  },

  addCommands() {
    return {
      insertFileAttachment:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});

export const NoteMention = Node.create({
  name: "noteMention",
  atom: true,
  group: "inline",
  inline: true,
  selectable: true,

  addAttributes() {
    return {
      label: {
        default: "Заметка",
        parseHTML: (element) => element.getAttribute("data-label") ?? element.textContent?.replace(/^@/, "") ?? "Заметка",
        renderHTML: (attributes) => ({ "data-label": String(attributes.label ?? "Заметка") }),
      },
      noteId: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-note-id") ?? "",
        renderHTML: (attributes) => ({ "data-note-id": String(attributes.noteId ?? "") }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="note-mention"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-type": "note-mention", class: "note-mention" }), `@${String(HTMLAttributes.label ?? "Заметка")}`];
  },

  addCommands() {
    return {
      insertNoteMention:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});

export const InlineDate = Node.create({
  name: "inlineDate",
  atom: true,
  group: "inline",
  inline: true,
  selectable: true,

  addAttributes() {
    return {
      value: {
        default: "",
        parseHTML: (element) => element.getAttribute("datetime") ?? element.getAttribute("data-value") ?? "",
        renderHTML: (attributes) => ({ "data-value": String(attributes.value ?? "") }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'time[data-type="inline-date"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const value = String(HTMLAttributes.value ?? "");
    return ["time", mergeAttributes(HTMLAttributes, { "data-type": "inline-date", class: "inline-date", datetime: value }), formatDate(value)];
  },

  addCommands() {
    return {
      insertInlineDate:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});

export const FormulaInline = Node.create({
  name: "formulaInline",
  atom: true,
  group: "inline",
  inline: true,
  selectable: true,

  addAttributes() {
    return {
      latex: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-latex") ?? element.textContent?.replace(/^ƒ\s*/, "") ?? "",
        renderHTML: (attributes) => ({ "data-latex": String(attributes.latex ?? "") }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="formula-inline"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-type": "formula-inline", class: "formula-inline" }), `ƒ ${String(HTMLAttributes.latex ?? "")}`];
  },

  addCommands() {
    return {
      insertFormulaInline:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});

export const FormulaBlock = Node.create({
  name: "formulaBlock",
  atom: true,
  group: "block",
  selectable: true,

  addAttributes() {
    return {
      latex: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-latex") ?? element.textContent?.replace(/^ƒ\s*/, "") ?? "",
        renderHTML: (attributes) => ({ "data-latex": String(attributes.latex ?? "") }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="formula-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "formula-block", class: "formula-block" }), `ƒ ${String(HTMLAttributes.latex ?? "")}`];
  },

  addCommands() {
    return {
      insertFormulaBlock:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}.${month}.${year}` : "Дата";
}
