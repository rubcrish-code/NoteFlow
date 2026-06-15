export interface EditorMark {
  attrs?: Record<string, unknown>;
  type: string;
}

export interface EditorNode {
  attrs?: Record<string, unknown>;
  content?: EditorNode[];
  marks?: EditorMark[];
  text?: string;
  type: string;
}

export type EditorDocument = EditorNode & {
  type: "doc";
};

const markdownSignals = [
  /^#{1,3}\s+\S/m,
  /^\s{0,3}>\s+\S/m,
  /^\s{0,3}(?:[-*+]\s+|\d+\.\s+)\S/m,
  /^\s{0,3}[-*+]\s+\[[ xX]\]\s+\S/m,
  /```[\s\S]*?```/,
  /\*\*[^*\n]+\*\*/,
  /==[^=\n]+==/,
  /~~[^~\n]+~~/,
  /`[^`\n]+`/,
  /\[[^\]\n]+\]\([^)]+\)/,
  /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/m,
];

function textNode(text: string, marks?: EditorMark[]): EditorNode {
  return marks && marks.length > 0 ? { type: "text", text, marks } : { type: "text", text };
}

function paragraph(text = ""): EditorNode {
  const content = parseInlineMarkdown(text);
  return content.length > 0 ? { type: "paragraph", content } : { type: "paragraph" };
}

function isBlank(line: string) {
  return line.trim().length === 0;
}

function isHorizontalRule(line: string) {
  return /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line);
}

function getHeading(line: string) {
  const match = /^(#{1,3})\s+(.+)$/.exec(line);
  if (!match) {
    return null;
  }
  return { level: match[1].length, text: match[2].trim() };
}

function isTaskLine(line: string) {
  return /^\s{0,3}[-*+]\s+\[[ xX]\]\s+/.test(line);
}

function isBulletLine(line: string) {
  return /^\s{0,3}[-*+]\s+\S/.test(line) && !isTaskLine(line);
}

function isOrderedLine(line: string) {
  return /^\s{0,3}\d+\.\s+\S/.test(line);
}

function isQuoteLine(line: string) {
  return /^\s{0,3}>\s?/.test(line);
}

function hasTablePipe(line: string) {
  const trimmed = line.trim();
  return trimmed.includes("|") && !trimmed.startsWith("```");
}

function isTableSeparator(line: string) {
  return /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function isTableStart(lines: string[], index: number) {
  return Boolean(lines[index + 1] && hasTablePipe(lines[index]) && isTableSeparator(lines[index + 1]));
}

function splitTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function tableCell(type: "tableCell" | "tableHeader", value: string): EditorNode {
  return {
    type,
    content: [paragraph(value)],
  };
}

function isSpecialBlockStart(lines: string[], index: number) {
  const line = lines[index];
  return (
    isBlank(line) ||
    line.startsWith("```") ||
    line.trim() === "$$" ||
    getHeading(line) !== null ||
    isCalloutStart(line) ||
    isDetailsStart(line) ||
    isHorizontalRule(line) ||
    isTableStart(lines, index) ||
    isTaskLine(line) ||
    isBulletLine(line) ||
    isOrderedLine(line) ||
    isQuoteLine(line)
  );
}

function isCalloutStart(line: string) {
  return /^:::(info|tip|warning|important)\s*$/i.test(line.trim());
}

function isDetailsStart(line: string) {
  return /^:::details(?:\s+(.+))?$/i.test(line.trim());
}

export function isMarkdownLike(text: string) {
  const trimmedText = text.trim();
  if (trimmedText.length < 2 || trimmedText === "-" || /^https?:\/\/\S+$/i.test(trimmedText)) {
    return false;
  }

  if (isTableStart(trimmedText.split(/\r?\n/), 0)) {
    return true;
  }

  return markdownSignals.some((signal) => signal.test(trimmedText));
}

export function markdownToTiptapDoc(markdown: string): EditorDocument {
  const normalizedMarkdown = markdown.replace(/\r\n/g, "\n");
  const lines = normalizedMarkdown.split("\n");
  const content: EditorNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (isBlank(line)) {
      index += 1;
      continue;
    }

    const calloutMatch = /^:::(info|tip|warning|important)\s*$/i.exec(line.trim());
    if (calloutMatch) {
      const calloutLines: string[] = [];
      index += 1;
      while (index < lines.length && lines[index].trim() !== ":::") {
        calloutLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      content.push({
        type: "callout",
        attrs: { variant: calloutMatch[1].toLowerCase() },
        content: markdownToTiptapDoc(calloutLines.join("\n")).content,
      });
      continue;
    }

    const detailsMatch = /^:::details(?:\s+(.+))?$/i.exec(line.trim());
    if (detailsMatch) {
      const detailsLines: string[] = [];
      index += 1;
      while (index < lines.length && lines[index].trim() !== ":::") {
        detailsLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      content.push({
        type: "detailsBlock",
        attrs: { open: true },
        content: [
          { type: "detailsSummary", content: parseInlineMarkdown(detailsMatch[1]?.trim() || "Заголовок блока") },
          { type: "detailsContent", content: markdownToTiptapDoc(detailsLines.join("\n")).content },
        ],
      });
      continue;
    }

    if (line.startsWith("```")) {
      const language = line.replace(/^```/, "").trim();
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      content.push({
        type: "codeBlock",
        attrs: language ? { language } : {},
        content: codeLines.length > 0 ? [textNode(codeLines.join("\n"))] : undefined,
      });
      continue;
    }

    if (line.trim() === "$$") {
      const formulaLines: string[] = [];
      index += 1;
      while (index < lines.length && lines[index].trim() !== "$$") {
        formulaLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      content.push({ type: "formulaBlock", attrs: { latex: formulaLines.join("\n").trim() } });
      continue;
    }

    const heading = getHeading(line);
    if (heading) {
      content.push({ type: "heading", attrs: { level: heading.level }, content: parseInlineMarkdown(heading.text) });
      index += 1;
      continue;
    }

    if (isHorizontalRule(line)) {
      content.push({ type: "horizontalRule" });
      index += 1;
      continue;
    }

    if (isTableStart(lines, index)) {
      const rows: EditorNode[] = [];
      const headerCells = splitTableRow(lines[index]).map((cell) => tableCell("tableHeader", cell));
      rows.push({ type: "tableRow", content: headerCells });
      index += 2;

      while (index < lines.length && hasTablePipe(lines[index]) && !isBlank(lines[index])) {
        rows.push({ type: "tableRow", content: splitTableRow(lines[index]).map((cell) => tableCell("tableCell", cell)) });
        index += 1;
      }

      content.push({ type: "table", content: rows });
      continue;
    }

    if (isTaskLine(line)) {
      const items: EditorNode[] = [];
      while (index < lines.length && isTaskLine(lines[index])) {
        const match = /^\s{0,3}[-*+]\s+\[([ xX])\]\s+(.+)$/.exec(lines[index]);
        if (match) {
          items.push({
            type: "taskItem",
            attrs: { checked: match[1].toLowerCase() === "x" },
            content: [paragraph(match[2])],
          });
        }
        index += 1;
      }
      content.push({ type: "taskList", content: items });
      continue;
    }

    if (isBulletLine(line)) {
      const items: EditorNode[] = [];
      while (index < lines.length && isBulletLine(lines[index])) {
        items.push({ type: "listItem", content: [paragraph(lines[index].replace(/^\s{0,3}[-*+]\s+/, ""))] });
        index += 1;
      }
      content.push({ type: "bulletList", content: items });
      continue;
    }

    if (isOrderedLine(line)) {
      const start = Number(/^\s{0,3}(\d+)\./.exec(line)?.[1] ?? "1");
      const items: EditorNode[] = [];
      while (index < lines.length && isOrderedLine(lines[index])) {
        items.push({ type: "listItem", content: [paragraph(lines[index].replace(/^\s{0,3}\d+\.\s+/, ""))] });
        index += 1;
      }
      content.push({ type: "orderedList", attrs: { start }, content: items });
      continue;
    }

    if (isQuoteLine(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && isQuoteLine(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s{0,3}>\s?/, ""));
        index += 1;
      }
      content.push({ type: "blockquote", content: [paragraph(quoteLines.join(" "))] });
      continue;
    }

    const paragraphLines = [line.trim()];
    index += 1;
    while (index < lines.length && !isSpecialBlockStart(lines, index)) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }
    content.push(paragraph(paragraphLines.join(" ")));
  }

  return { type: "doc", content: content.length > 0 ? content : [paragraph()] };
}

export function parseInlineMarkdown(text: string): EditorNode[] {
  const nodes: EditorNode[] = [];
  const tokenPattern = /(@\[\[[^\]\n]+\]\]|\{\{date:[^}\n]+\}\}|\$[^$\n]+\$|==[^=\n]+==|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|`[^`\n]+`|\[[^\]\n]+\]\([^)]+\)|\*[^*\n]+\*|_[^_\n]+_)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(textNode(text.slice(lastIndex, match.index)));
    }

    const token = match[0];
    if (token.startsWith("@[[")) {
      const label = token.slice(3, -2);
      nodes.push({ type: "noteMention", attrs: { label, noteId: label } });
    } else if (token.startsWith("{{date:")) {
      nodes.push({ type: "inlineDate", attrs: { value: token.slice(7, -2) } });
    } else if (token.startsWith("$")) {
      nodes.push({ type: "formulaInline", attrs: { latex: token.slice(1, -1) } });
    } else if (token.startsWith("==")) {
      nodes.push(textNode(token.slice(2, -2), [{ type: "highlight" }]));
    } else if (token.startsWith("**") || token.startsWith("__")) {
      nodes.push(textNode(token.slice(2, -2), [{ type: "bold" }]));
    } else if (token.startsWith("~~")) {
      nodes.push(textNode(token.slice(2, -2), [{ type: "strike" }]));
    } else if (token.startsWith("`")) {
      nodes.push(textNode(token.slice(1, -1), [{ type: "code" }]));
    } else if (token.startsWith("[")) {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (linkMatch) {
        nodes.push(textNode(linkMatch[1], [{ type: "link", attrs: { href: linkMatch[2] } }]));
      }
    } else {
      nodes.push(textNode(token.slice(1, -1), [{ type: "italic" }]));
    }

    lastIndex = tokenPattern.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(textNode(text.slice(lastIndex)));
  }

  return nodes;
}

function inlineToMarkdown(nodes: EditorNode[] | undefined) {
  return (nodes ?? [])
    .map((node) => {
      if (node.type !== "text") {
        return tiptapJsonToMarkdown({ type: "doc", content: [node] }).trim();
      }

      const marks = node.marks ?? [];
      return marks.reduce((value, mark) => {
        if (mark.type === "bold") {
          return `**${value}**`;
        }
        if (mark.type === "italic") {
          return `*${value}*`;
        }
        if (mark.type === "strike") {
          return `~~${value}~~`;
        }
        if (mark.type === "code") {
          return `\`${value}\``;
        }
        if (mark.type === "highlight") {
          return `==${value}==`;
        }
        if (mark.type === "underline") {
          return `<u>${value}</u>`;
        }
        if (mark.type === "superscript") {
          return `<sup>${value}</sup>`;
        }
        if (mark.type === "subscript") {
          return `<sub>${value}</sub>`;
        }
        if (mark.type === "textStyle") {
          const color = typeof mark.attrs?.color === "string" ? mark.attrs.color : "";
          return color ? `<span style="color: ${color}">${value}</span>` : value;
        }
        if (mark.type === "link") {
          return `[${value}](${String(mark.attrs?.href ?? "")})`;
        }
        return value;
      }, node.text ?? "");
    })
    .join("");
}

function nodeText(node: EditorNode | undefined): string {
  if (!node) {
    return "";
  }
  if (node.type === "text") {
    return node.text ?? "";
  }
  if (node.type === "fileAttachment") {
    return String(node.attrs?.name ?? "Файл");
  }
  if (node.type === "noteMention") {
    return `@${String(node.attrs?.label ?? "Заметка")}`;
  }
  if (node.type === "inlineDate") {
    return formatDate(String(node.attrs?.value ?? ""));
  }
  if (node.type === "formulaInline" || node.type === "formulaBlock") {
    return String(node.attrs?.latex ?? "");
  }
  return (node.content ?? []).map(nodeText).join("");
}

export function tiptapJsonToPlainText(document: EditorDocument): string {
  return (document.content ?? [])
    .map(nodeText)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function listItemText(node: EditorNode, fallback = "") {
  const paragraphNode = node.content?.find((child) => child.type === "paragraph");
  return paragraphNode ? inlineToMarkdown(paragraphNode.content) : fallback;
}

function tableToMarkdown(node: EditorNode) {
  const rows = node.content ?? [];
  if (rows.length === 0) {
    return "";
  }

  const tableRows = rows.map((row) => (row.content ?? []).map((cell) => nodeText(cell)));
  const columnCount = Math.max(...tableRows.map((row) => row.length));
  const normalizeRow = (row: string[]) => [...row, ...Array<string>(Math.max(0, columnCount - row.length)).fill("")];
  const header = normalizeRow(tableRows[0]);
  const bodyRows = tableRows.slice(1).map(normalizeRow);

  return [`| ${header.join(" |")} |`, `| ${header.map(() => "---").join(" |")} |`, ...bodyRows.map((row) => `| ${row.join(" |")} |`)].join("\n");
}

export function tiptapJsonToMarkdown(document: EditorDocument): string {
  return (document.content ?? [])
    .map((node, index) => {
      if (node.type === "paragraph") {
        return inlineToMarkdown(node.content);
      }
      if (node.type === "heading") {
        const level = Number(node.attrs?.level ?? 1);
        return `${"#".repeat(Math.min(3, Math.max(1, level)))} ${inlineToMarkdown(node.content)}`;
      }
      if (node.type === "horizontalRule") {
        return "---";
      }
      if (node.type === "blockquote") {
        return (node.content ?? []).map((child) => `> ${inlineToMarkdown(child.content)}`).join("\n");
      }
      if (node.type === "codeBlock") {
        const language = String(node.attrs?.language ?? "");
        return `\`\`\`${language}\n${nodeText(node)}\n\`\`\``;
      }
      if (node.type === "bulletList") {
        return (node.content ?? []).map((item) => `- ${listItemText(item)}`).join("\n");
      }
      if (node.type === "orderedList") {
        const start = Number(node.attrs?.start ?? 1);
        return (node.content ?? []).map((item, itemIndex) => `${start + itemIndex}. ${listItemText(item)}`).join("\n");
      }
      if (node.type === "taskList") {
        return (node.content ?? [])
          .map((item) => `- [${item.attrs?.checked ? "x" : " "}] ${listItemText(item)}`)
          .join("\n");
      }
      if (node.type === "table") {
        return tableToMarkdown(node);
      }
      if (node.type === "image") {
        return `![${String(node.attrs?.alt ?? "")}](${String(node.attrs?.src ?? "")})`;
      }
      if (node.type === "noteMention") {
        return `@[[${String(node.attrs?.label ?? "Заметка")}]]`;
      }
      if (node.type === "inlineDate") {
        return `{{date:${String(node.attrs?.value ?? "")}}}`;
      }
      if (node.type === "formulaInline") {
        return `$${String(node.attrs?.latex ?? "")}$`;
      }
      if (node.type === "callout") {
        const variant = String(node.attrs?.variant ?? "info");
        return `:::${variant}\n${tiptapJsonToMarkdown({ type: "doc", content: node.content ?? [] })}\n:::`;
      }
      if (node.type === "detailsBlock") {
        const summary = node.content?.find((child) => child.type === "detailsSummary");
        const detailsContent = node.content?.find((child) => child.type === "detailsContent");
        return `:::details ${inlineToMarkdown(summary?.content) || "Заголовок блока"}\n${tiptapJsonToMarkdown({ type: "doc", content: detailsContent?.content ?? [] })}\n:::`;
      }
      if (node.type === "fileAttachment") {
        return `[file:${String(node.attrs?.name ?? "Файл")}](noteflow-file://${String(node.attrs?.storageId ?? "")})`;
      }
      if (node.type === "formulaBlock") {
        return `$$\n${String(node.attrs?.latex ?? "")}\n$$`;
      }

      return index === 0 ? "" : nodeText(node);
    })
    .filter((block) => block.length > 0)
    .join("\n\n");
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
}

function inlineToHtml(nodes: EditorNode[] | undefined) {
  return (nodes ?? [])
    .map((node) => {
      if (node.type !== "text") {
        return nodeToHtml(node);
      }

      const htmlText = escapeHtml(node.text ?? "");
      return (node.marks ?? []).reduce((value, mark) => {
        if (mark.type === "bold") {
          return `<strong>${value}</strong>`;
        }
        if (mark.type === "italic") {
          return `<em>${value}</em>`;
        }
        if (mark.type === "strike") {
          return `<s>${value}</s>`;
        }
        if (mark.type === "code") {
          return `<code>${value}</code>`;
        }
        if (mark.type === "highlight") {
          const color = typeof mark.attrs?.color === "string" ? ` style="background-color: ${escapeHtml(mark.attrs.color)}"` : "";
          return `<mark${color}>${value}</mark>`;
        }
        if (mark.type === "underline") {
          return `<u>${value}</u>`;
        }
        if (mark.type === "superscript") {
          return `<sup>${value}</sup>`;
        }
        if (mark.type === "subscript") {
          return `<sub>${value}</sub>`;
        }
        if (mark.type === "textStyle") {
          const color = typeof mark.attrs?.color === "string" ? mark.attrs.color : "";
          return color ? `<span style="color: ${escapeHtml(color)}">${value}</span>` : value;
        }
        if (mark.type === "link") {
          return `<a href="${escapeHtml(String(mark.attrs?.href ?? ""))}">${value}</a>`;
        }
        return value;
      }, htmlText);
    })
    .join("");
}

function nodeToHtml(node: EditorNode): string {
  if (node.type === "paragraph") {
    return `<p>${inlineToHtml(node.content)}</p>`;
  }
  if (node.type === "heading") {
    const level = Math.min(3, Math.max(1, Number(node.attrs?.level ?? 1)));
    return `<h${level}>${inlineToHtml(node.content)}</h${level}>`;
  }
  if (node.type === "blockquote") {
    return `<blockquote>${(node.content ?? []).map(nodeToHtml).join("")}</blockquote>`;
  }
  if (node.type === "codeBlock") {
    return `<pre><code>${escapeHtml(nodeText(node))}</code></pre>`;
  }
  if (node.type === "horizontalRule") {
    return "<hr>";
  }
  if (node.type === "bulletList") {
    return `<ul>${(node.content ?? []).map(nodeToHtml).join("")}</ul>`;
  }
  if (node.type === "orderedList") {
    return `<ol>${(node.content ?? []).map(nodeToHtml).join("")}</ol>`;
  }
  if (node.type === "taskList") {
    return `<ul data-type="taskList">${(node.content ?? []).map(nodeToHtml).join("")}</ul>`;
  }
  if (node.type === "listItem") {
    return `<li>${(node.content ?? []).map(nodeToHtml).join("")}</li>`;
  }
  if (node.type === "taskItem") {
    const checked = node.attrs?.checked ? " checked" : "";
    return `<li data-type="taskItem"><label><input type="checkbox"${checked}> ${node.content?.map(nodeToHtml).join("") ?? ""}</label></li>`;
  }
  if (node.type === "table") {
    return `<table><tbody>${(node.content ?? []).map(nodeToHtml).join("")}</tbody></table>`;
  }
  if (node.type === "tableRow") {
    return `<tr>${(node.content ?? []).map(nodeToHtml).join("")}</tr>`;
  }
  if (node.type === "tableHeader") {
    return `<th>${(node.content ?? []).map(nodeToHtml).join("")}</th>`;
  }
  if (node.type === "tableCell") {
    return `<td>${(node.content ?? []).map(nodeToHtml).join("")}</td>`;
  }
  if (node.type === "image") {
    return `<img src="${escapeHtml(String(node.attrs?.src ?? ""))}" alt="${escapeHtml(String(node.attrs?.alt ?? ""))}">`;
  }
  if (node.type === "callout") {
    const variant = escapeHtml(String(node.attrs?.variant ?? "info"));
    return `<div data-type="callout" data-variant="${variant}" class="callout callout-${variant}"><span class="callout-icon">${variant === "tip" ? "✓" : variant === "info" ? "i" : "!"}</span><div class="callout-content">${(node.content ?? []).map(nodeToHtml).join("")}</div></div>`;
  }
  if (node.type === "detailsBlock") {
    return `<details data-type="details-block"${node.attrs?.open ? " open" : ""}>${(node.content ?? []).map(nodeToHtml).join("")}</details>`;
  }
  if (node.type === "detailsSummary") {
    return `<summary>${inlineToHtml(node.content)}</summary>`;
  }
  if (node.type === "detailsContent") {
    return `<div data-type="details-content">${(node.content ?? []).map(nodeToHtml).join("")}</div>`;
  }
  if (node.type === "fileAttachment") {
    return `<div data-type="file-attachment" data-storage-id="${escapeHtml(String(node.attrs?.storageId ?? ""))}"><span>${escapeHtml(String(node.attrs?.name ?? "Файл"))}</span><small>${escapeHtml(String(node.attrs?.size ?? ""))}</small></div>`;
  }
  if (node.type === "noteMention") {
    return `<span data-type="note-mention" data-note-id="${escapeHtml(String(node.attrs?.noteId ?? ""))}">@${escapeHtml(String(node.attrs?.label ?? "Заметка"))}</span>`;
  }
  if (node.type === "inlineDate") {
    const value = String(node.attrs?.value ?? "");
    return `<time data-type="inline-date" datetime="${escapeHtml(value)}">${escapeHtml(formatDate(value))}</time>`;
  }
  if (node.type === "formulaInline") {
    return `<span data-type="formula-inline">ƒ ${escapeHtml(String(node.attrs?.latex ?? ""))}</span>`;
  }
  if (node.type === "formulaBlock") {
    return `<div data-type="formula-block">ƒ ${escapeHtml(String(node.attrs?.latex ?? ""))}</div>`;
  }

  return inlineToHtml(node.content);
}

export function tiptapJsonToHtml(document: EditorDocument): string {
  return (document.content ?? []).map(nodeToHtml).join("");
}

export function markdownToHtml(markdown: string) {
  return tiptapJsonToHtml(markdownToTiptapDoc(markdown));
}
