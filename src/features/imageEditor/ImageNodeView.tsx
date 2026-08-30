import Image from "@tiptap/extension-image";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { useEffect, useRef, useState, type PointerEvent, type CSSProperties } from "react";
import { Icon } from "../../shared/Icon";
import { runtimeAssetUrl } from "../editor/assetUri";
import type { ImageEditMode } from "./imageEditService";
import { getResizeCursor, resizeHandles, resizeImageBox, type ResizeHandle, type Size } from "./imageGeometry";

export interface EditableImageAttributes {
  alignment?: "center" | "left" | "right" | null;
  alt?: string | null;
  attachmentId?: string | null;
  editedAttachmentId?: string | null;
  editMetadata?: Record<string, unknown> | null;
  height?: number | null;
  originalAttachmentId?: string | null;
  originalSrc?: string | null;
  src: string;
  title?: string | null;
  width?: number | null;
}

export interface EditableImageTarget {
  attrs: EditableImageAttributes;
  mode: ImageEditMode;
  updateAttributes: (attrs: Partial<EditableImageAttributes>) => void;
}

interface EditableImageOptions {
  inline?: boolean;
  onEditImage?: (target: EditableImageTarget) => void;
  onToast?: (message: string) => void;
}

function readImageAttrs(attrs: Record<string, unknown>): EditableImageAttributes {
  const alignment = attrs.alignment === "center" || attrs.alignment === "right" ? attrs.alignment : "left";
  return {
    alignment,
    alt: typeof attrs.alt === "string" ? attrs.alt : null,
    attachmentId: typeof attrs.attachmentId === "string" ? attrs.attachmentId : null,
    editedAttachmentId: typeof attrs.editedAttachmentId === "string" ? attrs.editedAttachmentId : null,
    editMetadata: typeof attrs.editMetadata === "object" && attrs.editMetadata !== null ? (attrs.editMetadata as Record<string, unknown>) : null,
    height: typeof attrs.height === "number" ? attrs.height : null,
    originalAttachmentId: typeof attrs.originalAttachmentId === "string" ? attrs.originalAttachmentId : null,
    originalSrc: typeof attrs.originalSrc === "string" ? attrs.originalSrc : null,
    src: typeof attrs.src === "string" ? attrs.src : "",
    title: typeof attrs.title === "string" ? attrs.title : null,
    width: typeof attrs.width === "number" ? attrs.width : null,
  };
}

function parseDimension(value: string | null) {
  if (!value) {
    return null;
  }
  const dimension = Number.parseInt(value, 10);
  return Number.isFinite(dimension) && dimension > 0 ? dimension : null;
}

function renderNullableDataAttribute(name: string, value: unknown) {
  return typeof value === "string" && value.trim() ? { [name]: value } : {};
}

function getHandleLabel(handle: ResizeHandle) {
  const labels: Record<ResizeHandle, string> = {
    e: "Изменить ширину справа",
    n: "Изменить высоту сверху",
    ne: "Изменить размер из правого верхнего угла",
    nw: "Изменить размер из левого верхнего угла",
    s: "Изменить высоту снизу",
    se: "Изменить размер из правого нижнего угла",
    sw: "Изменить размер из левого нижнего угла",
    w: "Изменить ширину слева",
  };
  return labels[handle];
}

function getFigureStyle(width: number | null, height: number | null): CSSProperties | undefined {
  if (!width && !height) {
    return undefined;
  }
  return {
    ...(width ? { width: `${width}px` } : {}),
    ...(height ? { "--image-node-height": `${height}px` } : {}),
  } as CSSProperties;
}

function getImageAlignmentLabel(alignment: EditableImageAttributes["alignment"]) {
  if (alignment === "center") {
    return "По центру";
  }
  if (alignment === "right") {
    return "Справа";
  }
  return "Слева";
}

function ImageNodeView(props: NodeViewProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const resizeRef = useRef<{ handle: ResizeHandle; lastSize: Size; pointerId: number; startSize: Size; startX: number; startY: number } | null>(null);
  const [draftSize, setDraftSize] = useState<Size | null>(null);
  const attrs = readImageAttrs(props.node.attrs);
  const options = props.extension.options as EditableImageOptions;
  const renderedWidth = draftSize?.width ?? attrs.width ?? null;
  const renderedHeight = draftSize?.height ?? attrs.height ?? null;

  useEffect(() => {
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, []);
  const title = attrs.title || attrs.alt || "Изображение";

  function updateImageAttrs(nextAttrs: Partial<EditableImageAttributes>) {
    props.updateAttributes(nextAttrs);
  }

  function openEditor(mode: ImageEditMode) {
    options.onEditImage?.({ attrs, mode, updateAttributes: updateImageAttrs });
  }

  function startResize(event: PointerEvent<HTMLButtonElement>, handle: ResizeHandle) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const imageRect = imageRef.current?.getBoundingClientRect();
    const startSize = {
      height: Math.round(attrs.height ?? imageRect?.height ?? 220),
      width: Math.round(attrs.width ?? imageRect?.width ?? 360),
    };
    resizeRef.current = {
      handle,
      lastSize: startSize,
      pointerId: event.pointerId,
      startSize,
      startX: event.clientX,
      startY: event.clientY,
    };
    setDraftSize(startSize);
    document.body.style.cursor = getResizeCursor(handle);
    document.body.style.userSelect = "none";
  }

  function updateResize(event: PointerEvent<HTMLButtonElement>) {
    const resizeState = resizeRef.current;
    if (!resizeState) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const editorWidth = imageRef.current?.closest(".ed-inner")?.clientWidth ?? 860;
    const nextSize = resizeImageBox(resizeState.startSize, resizeState.handle, event.clientX - resizeState.startX, event.clientY - resizeState.startY, {
      maxHeight: Math.max(120, editorWidth * 1.25),
      maxWidth: Math.max(160, editorWidth),
      minHeight: 72,
      minWidth: 120,
    });
    resizeRef.current = { ...resizeState, lastSize: nextSize };
    setDraftSize(nextSize);
  }

  function stopResize(event: PointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (resizeRef.current?.pointerId === event.pointerId) {
      updateImageAttrs(resizeRef.current.lastSize);
    }
    resizeRef.current = null;
    setDraftSize(null);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }

  function editCaption() {
    const caption = window.prompt("Подпись к изображению", title);
    if (caption === null) {
      return;
    }
    updateImageAttrs({ alt: caption.trim(), title: caption.trim() });
  }

  function resetImage() {
    if (!attrs.originalSrc) {
      updateImageAttrs({ height: null, width: null });
      options.onToast?.("Размер изображения сброшен");
      return;
    }

    updateImageAttrs({
      attachmentId: attrs.originalAttachmentId ?? attrs.attachmentId ?? null,
      editedAttachmentId: null,
      editMetadata: null,
      height: null,
      src: attrs.originalSrc,
      width: null,
    });
    options.onToast?.("Изображение сброшено к оригиналу");
  }

  function setAlignment(alignment: NonNullable<EditableImageAttributes["alignment"]>) {
    updateImageAttrs({ alignment });
  }

  const alignment = attrs.alignment ?? "left";

  return (
    <NodeViewWrapper className={`note-image-node align-${alignment} ${props.selected ? "selected" : ""} ${draftSize ? "resizing" : ""}`} data-drag-handle>
      {props.selected ? (
        <div className="image-action-panel" contentEditable={false}>
          <div className="image-align-actions" aria-label="Выравнивание изображения" role="group">
            {(["left", "center", "right"] as const).map((item) => (
              <button
                aria-pressed={alignment === item}
                className={alignment === item ? "active" : ""}
                data-tooltip={getImageAlignmentLabel(item)}
                key={item}
                onClick={() => setAlignment(item)}
                type="button"
              >
                <Icon name={item === "left" ? "alignLeft" : item === "center" ? "alignCenter" : "alignRight"} />
              </button>
            ))}
          </div>
          <button onClick={() => options.onToast?.("Потяните маркеры по краям изображения")} type="button">
            Изменить размер
          </button>
          <button onClick={() => openEditor("crop")} type="button">
            Обрезать
          </button>
          <button onClick={() => openEditor("draw")} type="button">
            Рисовать
          </button>
          <button onClick={editCaption} type="button">
            Подпись
          </button>
          <button onClick={resetImage} type="button">
            Сбросить
          </button>
          <button className="danger" onClick={props.deleteNode} type="button">
            Удалить
          </button>
        </div>
      ) : null}
      <figure style={getFigureStyle(renderedWidth, renderedHeight)}>
        <img alt={attrs.alt ?? ""} draggable={false} ref={imageRef} src={runtimeAssetUrl(attrs.src)} title={attrs.title ?? ""} />
        {props.selected ? (
          <div className="image-resize-frame" contentEditable={false}>
            {resizeHandles.map((handle) => (
              <button
                aria-label={getHandleLabel(handle)}
                className={`image-resize-handle image-resize-handle-${handle}`}
                key={handle}
                onPointerCancel={stopResize}
                onPointerDown={(event) => startResize(event, handle)}
                onPointerMove={updateResize}
                onPointerUp={stopResize}
                style={{ cursor: getResizeCursor(handle) }}
                type="button"
              />
            ))}
          </div>
        ) : null}
      </figure>
    </NodeViewWrapper>
  );
}

export const EditableImage = Image.extend<EditableImageOptions>({
  addOptions() {
    return {
      ...this.parent?.(),
      onEditImage: undefined,
      onToast: undefined,
    };
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      alignment: {
        default: "left",
        parseHTML: (element) => {
          const value = element.getAttribute("data-image-align");
          return value === "center" || value === "right" ? value : "left";
        },
        renderHTML: (attributes) => {
          const alignment = attributes.alignment === "center" || attributes.alignment === "right" ? attributes.alignment : "left";
          return alignment === "left" ? {} : { "data-image-align": alignment };
        },
      },
      attachmentId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-attachment-id"),
        renderHTML: (attributes) => renderNullableDataAttribute("data-attachment-id", attributes.attachmentId),
      },
      editedAttachmentId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-edited-attachment-id"),
        renderHTML: (attributes) => renderNullableDataAttribute("data-edited-attachment-id", attributes.editedAttachmentId),
      },
      editMetadata: {
        default: null,
        parseHTML: (element) => {
          const value = element.getAttribute("data-edit-metadata");
          if (!value) {
            return null;
          }
          try {
            return JSON.parse(value) as Record<string, unknown>;
          } catch {
            return null;
          }
        },
        renderHTML: (attributes) => (attributes.editMetadata ? { "data-edit-metadata": JSON.stringify(attributes.editMetadata) } : {}),
      },
      originalAttachmentId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-original-attachment-id"),
        renderHTML: (attributes) => renderNullableDataAttribute("data-original-attachment-id", attributes.originalAttachmentId),
      },
      originalSrc: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-original-src"),
        renderHTML: (attributes) => renderNullableDataAttribute("data-original-src", attributes.originalSrc),
      },
      height: {
        default: null,
        parseHTML: (element) => parseDimension(element.getAttribute("data-image-height") ?? element.getAttribute("height")),
        renderHTML: (attributes) => {
          const height = typeof attributes.height === "number" ? attributes.height : null;
          return height ? { "data-image-height": String(height), height: String(height) } : {};
        },
      },
      width: {
        default: null,
        parseHTML: (element) => parseDimension(element.getAttribute("data-image-width") ?? element.getAttribute("width")),
        renderHTML: (attributes) => {
          const width = typeof attributes.width === "number" ? attributes.width : null;
          const height = typeof attributes.height === "number" ? attributes.height : null;
          const style = [
            width ? `width: ${width}px` : null,
            height ? `height: ${height}px` : null,
            height ? "object-fit: fill" : null,
            "max-width: 100%",
          ]
            .filter(Boolean)
            .join("; ");
          return width ? { "data-image-width": String(width), style } : { style };
        },
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },
});
