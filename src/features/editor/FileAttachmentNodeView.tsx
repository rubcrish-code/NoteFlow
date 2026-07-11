import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { useState, type MouseEvent } from "react";
import { Icon } from "../../shared/Icon";
import { FileAttachment } from "./customExtensions";

interface FileAttachmentOptions {
  onOpenAttachment?: (attachmentId: string) => Promise<void> | void;
  onRevealAttachment?: (attachmentId: string) => Promise<void> | void;
  onToast?: (message: string) => void;
}

interface FileAttachmentAttributes {
  name: string;
  size: string;
  storageId: string;
  type: string;
}

type AttachmentAction = "open" | "reveal";

function readAttachmentAttributes(attrs: Record<string, unknown>): FileAttachmentAttributes {
  return {
    name: typeof attrs.name === "string" && attrs.name.trim() ? attrs.name : "Файл",
    size: typeof attrs.size === "string" ? attrs.size : "",
    storageId: typeof attrs.storageId === "string" ? attrs.storageId : "",
    type: typeof attrs.type === "string" ? attrs.type : "application/octet-stream",
  };
}

export function getAttachmentTypeLabel(mimeType: string, fileName: string) {
  const extension = fileName.includes(".") ? fileName.split(".").pop()?.trim() : "";
  if (extension && /^[a-z0-9]{1,8}$/i.test(extension)) {
    return extension.toUpperCase();
  }
  const subtype = mimeType.split("/")[1]?.split(/[;+]/)[0]?.trim();
  return subtype && /^[a-z0-9.+-]{1,12}$/i.test(subtype) ? subtype.toUpperCase() : "Файл";
}

function FileAttachmentNodeView(props: NodeViewProps) {
  const attrs = readAttachmentAttributes(props.node.attrs);
  const options = props.extension.options as FileAttachmentOptions;
  const [pendingAction, setPendingAction] = useState<AttachmentAction | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const isAvailable = Boolean(attrs.storageId);
  const metadata = [getAttachmentTypeLabel(attrs.type, attrs.name), attrs.size].filter(Boolean).join(" · ");

  function preserveEditorSelection(event: MouseEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
  }

  async function runAttachmentAction(action: AttachmentAction) {
    if (!isAvailable || pendingAction) {
      return;
    }

    setPendingAction(action);
    setErrorMessage("");
    try {
      if (action === "open") {
        await options.onOpenAttachment?.(attrs.storageId);
      } else {
        await options.onRevealAttachment?.(attrs.storageId);
      }
    } catch {
      const message = action === "open" ? "Не удалось открыть файл. Проверьте, что вложение доступно." : "Не удалось показать файл в проводнике.";
      setErrorMessage(message);
      options.onToast?.(message);
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <NodeViewWrapper className={`file-attachment-card ${props.selected ? "selected" : ""}`} contentEditable={false} data-drag-handle>
      <button
        aria-label={`Открыть файл ${attrs.name}`}
        className="file-attachment-main"
        disabled={!isAvailable || pendingAction !== null}
        onClick={() => void runAttachmentAction("open")}
        onMouseDown={preserveEditorSelection}
        type="button"
      >
        <span className="file-attachment-icon">
          <Icon name="attach" />
        </span>
        <span className="file-attachment-copy">
          <strong>{attrs.name}</strong>
          <small>{errorMessage || (isAvailable ? metadata : "Файл недоступен")}</small>
        </span>
      </button>
      <div className="file-attachment-actions" onMouseDown={preserveEditorSelection}>
        <button
          className="file-attachment-action primary"
          disabled={!isAvailable || pendingAction !== null}
          onClick={() => void runAttachmentAction("open")}
          type="button"
        >
          {pendingAction === "open" ? <span className="button-spinner" /> : null}
          Открыть
        </button>
        <button
          aria-label="Показать файл в проводнике"
          className="file-attachment-action icon-only"
          data-tooltip="Показать в проводнике"
          disabled={!isAvailable || pendingAction !== null}
          onClick={() => void runAttachmentAction("reveal")}
          type="button"
        >
          {pendingAction === "reveal" ? <span className="button-spinner" /> : <Icon name="folder" />}
        </button>
      </div>
    </NodeViewWrapper>
  );
}

export const InteractiveFileAttachment = FileAttachment.extend<FileAttachmentOptions>({
  addOptions() {
    return {
      ...this.parent?.(),
      onOpenAttachment: undefined,
      onRevealAttachment: undefined,
      onToast: undefined,
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(FileAttachmentNodeView);
  },
});
