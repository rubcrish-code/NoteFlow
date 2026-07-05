import type { ReactNode } from "react";
import { markdownToTiptapDoc, type EditorMark, type EditorNode } from "../editor/markdownService";

interface ChatMarkdownProps {
  content: string;
}

export function ChatMarkdown({ content }: ChatMarkdownProps) {
  const document = markdownToTiptapDoc(content);
  return <div className="note-chat-markdown">{(document.content ?? []).map((node, index) => renderBlockNode(node, `b-${index}`))}</div>;
}

export function getNoteChatSourceTitle(title?: string) {
  if (title === undefined) {
    return "текущая заметка";
  }
  const trimmedTitle = title.trim();
  return trimmedTitle || "Без названия";
}

export function sanitizeMarkdownLinkHref(href: string) {
  const trimmedHref = href.trim();
  if (!trimmedHref) {
    return undefined;
  }
  if (trimmedHref.startsWith("//")) {
    return undefined;
  }
  if (trimmedHref.startsWith("#") || trimmedHref.startsWith("/") || trimmedHref.startsWith("./") || trimmedHref.startsWith("../")) {
    return trimmedHref;
  }

  try {
    const url = new URL(trimmedHref);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? trimmedHref : undefined;
  } catch {
    return undefined;
  }
}

function renderBlockNode(node: EditorNode, key: string): ReactNode {
  if (node.type === "paragraph") {
    return <p key={key}>{renderInlineNodes(node.content)}</p>;
  }
  if (node.type === "heading") {
    const level = clampHeadingLevel(node.attrs?.level);
    const content = renderInlineNodes(node.content);
    if (level === 1) {
      return <h1 key={key}>{content}</h1>;
    }
    if (level === 2) {
      return <h2 key={key}>{content}</h2>;
    }
    return <h3 key={key}>{content}</h3>;
  }
  if (node.type === "blockquote") {
    return <blockquote key={key}>{renderBlockChildren(node.content, key)}</blockquote>;
  }
  if (node.type === "codeBlock") {
    return (
      <pre key={key}>
        <code>{nodeText(node)}</code>
      </pre>
    );
  }
  if (node.type === "horizontalRule") {
    return <hr key={key} />;
  }
  if (node.type === "bulletList") {
    return <ul key={key}>{renderBlockChildren(node.content, key)}</ul>;
  }
  if (node.type === "orderedList") {
    return <ol key={key}>{renderBlockChildren(node.content, key)}</ol>;
  }
  if (node.type === "taskList") {
    return <ul className="note-chat-task-list" key={key}>{renderBlockChildren(node.content, key)}</ul>;
  }
  if (node.type === "listItem") {
    return <li key={key}>{renderBlockChildren(node.content, key)}</li>;
  }
  if (node.type === "taskItem") {
    return (
      <li className="note-chat-task-item" key={key}>
        <input checked={Boolean(node.attrs?.checked)} readOnly type="checkbox" />
        <span>{renderBlockChildren(node.content, key)}</span>
      </li>
    );
  }
  if (node.type === "table") {
    return (
      <div className="note-chat-table-wrap" key={key}>
        <table>
          <tbody>{renderBlockChildren(node.content, key)}</tbody>
        </table>
      </div>
    );
  }
  if (node.type === "tableRow") {
    return <tr key={key}>{renderBlockChildren(node.content, key)}</tr>;
  }
  if (node.type === "tableHeader") {
    return <th key={key}>{renderBlockChildren(node.content, key)}</th>;
  }
  if (node.type === "tableCell") {
    return <td key={key}>{renderBlockChildren(node.content, key)}</td>;
  }
  if (node.type === "callout") {
    return (
      <div className="note-chat-callout" key={key}>
        {renderBlockChildren(node.content, key)}
      </div>
    );
  }
  if (node.type === "detailsBlock") {
    return (
      <details key={key} open={Boolean(node.attrs?.open)}>
        {renderBlockChildren(node.content, key)}
      </details>
    );
  }
  if (node.type === "detailsSummary") {
    return <summary key={key}>{renderInlineNodes(node.content)}</summary>;
  }
  if (node.type === "detailsContent") {
    return <div key={key}>{renderBlockChildren(node.content, key)}</div>;
  }
  if (node.type === "formulaBlock") {
    return (
      <pre className="note-chat-formula" key={key}>
        <code>{String(node.attrs?.latex ?? "")}</code>
      </pre>
    );
  }

  return <p key={key}>{renderInlineNodes(node.content) || nodeText(node)}</p>;
}

function renderBlockChildren(nodes: EditorNode[] | undefined, prefix: string) {
  return (nodes ?? []).map((child, index) => renderBlockNode(child, `${prefix}-${index}`));
}

function renderInlineNodes(nodes: EditorNode[] | undefined): ReactNode {
  return (nodes ?? []).map((node, index) => {
    if (node.type === "text") {
      return applyInlineMarks(node.text ?? "", node.marks ?? [], `i-${index}`);
    }
    if (node.type === "noteMention") {
      return (
        <span className="note-chat-token" key={`i-${index}`}>
          @{String(node.attrs?.label ?? "Заметка")}
        </span>
      );
    }
    if (node.type === "inlineDate") {
      return (
        <time className="note-chat-token" key={`i-${index}`}>
          {String(node.attrs?.value ?? "")}
        </time>
      );
    }
    if (node.type === "formulaInline") {
      return <code key={`i-${index}`}>{String(node.attrs?.latex ?? "")}</code>;
    }
    return <span key={`i-${index}`}>{nodeText(node)}</span>;
  });
}

function applyInlineMarks(text: string, marks: EditorMark[], key: string): ReactNode {
  return marks.reduce<ReactNode>((content, mark) => {
    if (mark.type === "bold") {
      return <strong key={`${key}-bold`}>{content}</strong>;
    }
    if (mark.type === "italic") {
      return <em key={`${key}-italic`}>{content}</em>;
    }
    if (mark.type === "strike") {
      return <s key={`${key}-strike`}>{content}</s>;
    }
    if (mark.type === "code") {
      return <code key={`${key}-code`}>{content}</code>;
    }
    if (mark.type === "highlight") {
      return <mark key={`${key}-highlight`}>{content}</mark>;
    }
    if (mark.type === "link") {
      const href = typeof mark.attrs?.href === "string" ? sanitizeMarkdownLinkHref(mark.attrs.href) : undefined;
      if (!href) {
        return <span key={`${key}-unsafe-link`}>{content}</span>;
      }
      return (
        <a href={href} key={`${key}-link`} rel="noreferrer" target="_blank">
          {content}
        </a>
      );
    }
    return content;
  }, text);
}

function clampHeadingLevel(level: unknown) {
  const numericLevel = typeof level === "number" ? level : Number(level ?? 1);
  if (numericLevel <= 1) {
    return 1;
  }
  if (numericLevel >= 3) {
    return 3;
  }
  return 2;
}

function nodeText(node: EditorNode | undefined): string {
  if (!node) {
    return "";
  }
  if (node.type === "text") {
    return node.text ?? "";
  }
  return (node.content ?? []).map(nodeText).join("");
}
