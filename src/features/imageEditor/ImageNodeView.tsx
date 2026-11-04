import { translate, useInterfaceLanguage } from "../../shared/i18n";
import Image from "@tiptap/extension-image";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { useCallback, useEffect, useId, useRef, useState, type PointerEvent, type CSSProperties } from "react";
import { Icon } from "../../shared/Icon";
import { MenuPopover } from "../../shared/MenuPopover";
import { ModalShell } from "../../shared/ModalShell";
import { runtimeAssetUrl } from "../editor/assetUri";
import type { ImageEditMode } from "./imageEditService";
import { copyImage, saveImage } from "../../services/imageTransferService";
import { getResizeCursor, imageResizeStart, resizeHandles, resizeImageBox, type ResizeHandle, type Size } from "./imageGeometry";

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
  isCurrent: () => boolean;
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
    e: translate("ui.411a92969559"),
    n: translate("ui.52aea93bd5b4"),
    ne: translate("ui.82e580e78ef0"),
    nw: translate("ui.9c960229b7a1"),
    s: translate("ui.49003a6b2f8a"),
    se: translate("ui.ae9616833184"),
    sw: translate("ui.69e6bed0f733"),
    w: translate("ui.bbe2f49ebc7d"),
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
    return translate("ui.93f3d6b8dc12");
  }
  if (alignment === "right") {
    return translate("ui.98ab54c1c01f");
  }
  return translate("ui.d7f76a36c9fb");
}

function ImageNodeView(props: NodeViewProps) {
  useInterfaceLanguage();
  const imageRef = useRef<HTMLImageElement>(null);
  const moreActionsRef = useRef<HTMLButtonElement>(null);
  const descriptionInputRef = useRef<HTMLInputElement>(null);
  const resizeRef = useRef<{ handle: ResizeHandle; lastSize: Size; pointerId: number; startSize: Size; startX: number; startY: number; scaleX: number; scaleY: number } | null>(null);
  const [draftSize, setDraftSize] = useState<Size | null>(null);
  const [isMoreActionsOpen, setIsMoreActionsOpen] = useState(false);
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(false);
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [transfer, setTransfer] = useState<"copy" | "save" | null>(null);
  const transferBusy = useRef(false);
  const mounted = useRef(true);
  const descriptionFormId = `image-description-${useId()}`;
  const attrs = readImageAttrs(props.node.attrs);
  const options = props.extension.options as EditableImageOptions;
  const renderedWidth = draftSize?.width ?? attrs.width ?? null;
  const renderedHeight = draftSize?.height ?? attrs.height ?? null;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, []);

  useEffect(() => {
    if (!props.selected) {
      setIsMoreActionsOpen(false);
      setIsDescriptionOpen(false);
    }
  }, [props.selected]);

  const closeMoreActions = useCallback(() => setIsMoreActionsOpen(false), []);

  function updateImageAttrs(nextAttrs: Partial<EditableImageAttributes>) {
    props.updateAttributes(nextAttrs);
  }

  function openEditor(mode: ImageEditMode) {
    const node = props.node;
    options.onEditImage?.({ attrs, mode, updateAttributes: updateImageAttrs, isCurrent: () => {
      if (props.editor.isDestroyed) return false;
      const position = props.getPos();
      return typeof position === "number" && props.editor.state.doc.nodeAt(position) === node;
    } });
  }

  function startResize(event: PointerEvent<HTMLButtonElement>, handle: ResizeHandle) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const imageRect = imageRef.current?.getBoundingClientRect();
    const measured = imageResizeStart({ width: imageRect?.width ?? 360, height: imageRect?.height ?? 220 }, { width: imageRef.current?.offsetWidth ?? 0, height: imageRef.current?.offsetHeight ?? 0 });
    const startSize = measured.size;
    resizeRef.current = {
      handle,
      lastSize: startSize,
      pointerId: event.pointerId,
      startSize,
      startX: event.clientX,
      startY: event.clientY,
      scaleX: measured.scaleX,
      scaleY: measured.scaleY,
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
    const nextSize = resizeImageBox(resizeState.startSize, resizeState.handle, (event.clientX - resizeState.startX) / resizeState.scaleX, (event.clientY - resizeState.startY) / resizeState.scaleY, {
      maxHeight: Math.max(120, editorWidth * 1.25),
      maxWidth: Math.max(160, editorWidth),
      minHeight: Math.min(72, resizeState.startSize.height),
      minWidth: Math.min(120, resizeState.startSize.width),
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

  function openDescription() {
    setDescriptionDraft(attrs.alt ?? attrs.title ?? "");
    setIsMoreActionsOpen(false);
    setIsDescriptionOpen(true);
    window.requestAnimationFrame(() => descriptionInputRef.current?.select());
  }

  function saveDescription() {
    const description = descriptionDraft.trim();
    updateImageAttrs({ alt: description, title: description });
    setIsDescriptionOpen(false);
  }

  function resetImage() {
    if (!attrs.originalSrc) {
      updateImageAttrs({ height: null, width: null });
      options.onToast?.(translate("ui.28362fdc3d5a"));
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
    options.onToast?.(translate("ui.ac08859c0ef1"));
  }

  function setAlignment(alignment: NonNullable<EditableImageAttributes["alignment"]>) {
    updateImageAttrs({ alignment });
  }

  async function transferImage(action: "copy" | "save") {
    if (transferBusy.current) return;
    transferBusy.current = true; setTransfer(action);
    try {
      const completed = action === "copy" ? (await copyImage(attrs.src), true) : await saveImage(attrs.src, attrs.title || attrs.alt || translate("ui.e5f534734c36"));
      if (completed) options.onToast?.(action === "copy" ? translate("ui.608fb6053e4e") : translate("ui.f55302131338"));
      if (mounted.current) setIsMoreActionsOpen(false);
    } catch {
      options.onToast?.(action === "copy" ? translate("ui.7d67e478535c") : translate("ui.fa52cbcdd62e"));
    } finally {
      transferBusy.current = false;
      if (mounted.current) setTransfer(null);
    }
  }

  const alignment = attrs.alignment ?? "left";

  return (
    <NodeViewWrapper className={`note-image-node align-${alignment} ${props.selected ? "selected" : ""} ${draftSize ? "resizing" : ""}`} data-drag-handle>
      {props.selected ? (
        <div className="image-action-panel" contentEditable={false}>
          <div className="image-align-actions" aria-label={translate("ui.0be29a6af1d2")} role="group">
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
          <button onClick={() => options.onToast?.(translate("ui.f1ffde43448d"))} type="button">
            {translate("ui.572095d4a787")}</button>
          <button onClick={() => openEditor("crop")} type="button">
            {translate("ui.1fe990f27562")}</button>
          <button
            aria-expanded={isMoreActionsOpen}
            aria-haspopup="menu"
            aria-label={translate("ui.3849df359623")}
            className="image-more-actions"
            data-tooltip={translate("ui.c4f678b17288")}
            onClick={() => setIsMoreActionsOpen((current) => !current)}
            ref={moreActionsRef}
            type="button"
          >
            <Icon name="dots" />
          </button>
          <MenuPopover
            anchorRef={moreActionsRef}
            ariaLabel={translate("ui.3849df359623")}
            className="image-actions-menu"
            isOpen={isMoreActionsOpen}
            onClose={closeMoreActions}
            preferredWidth={220}
          >
            <button onClick={() => { setIsMoreActionsOpen(false); openEditor("draw"); }} role="menuitem" type="button">{translate("ui.2cb442e7dd2b")}</button>
            <button onClick={openDescription} role="menuitem" type="button">{translate("ui.af89df2ede7d")}</button>
            <button disabled={!attrs.width && !attrs.height && (!attrs.originalSrc || attrs.originalSrc === attrs.src)} onClick={() => { setIsMoreActionsOpen(false); setIsResetOpen(true); }} role="menuitem" type="button">{translate("ui.3b7c443e5646")}</button>
            <button disabled={transfer !== null} onClick={() => void transferImage("copy")} role="menuitem" type="button">{transfer === "copy" ? translate("ui.b121223a8e52") : translate("ui.1ecddf40bfeb")}</button>
            <button disabled={transfer !== null} onClick={() => void transferImage("save")} role="menuitem" type="button">{transfer === "save" ? translate("ui.9c27c381dd8b") : translate("ui.ee96e239c644")}</button>
            <div className="nf-menu-separator" />
            <button className="danger" onClick={() => { setIsMoreActionsOpen(false); props.deleteNode(); }} role="menuitem" type="button">{translate("ui.6e255893e722")}</button>
          </MenuPopover>
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
      {isResetOpen ? <ModalShell open title={translate("ui.0775f650fe07")} size="compact" onClose={() => setIsResetOpen(false)}
        footer={<><button className="secondary-btn" onClick={() => setIsResetOpen(false)} type="button">{translate("ui.8fbe9b75cbdf")}</button><button className="primary-btn" onClick={() => { resetImage(); setIsResetOpen(false); }} type="button">{translate("ui.407f871778d3")}</button></>}>
        <p>{translate("ui.c7718b5af028")}</p>
      </ModalShell> : null}
      {isDescriptionOpen ? (
        <ModalShell
          backdropClassName="modal-backdrop"
          className="image-description-dialog"
          description={translate("ui.9bb509b291fc")}
          footer={(
            <div className="new-note-actions">
              <button className="secondary-btn" onClick={() => setIsDescriptionOpen(false)} type="button">{translate("ui.8fbe9b75cbdf")}</button>
              <button className="primary-btn" form={descriptionFormId} type="submit">{translate("ui.b4d30cae5289")}</button>
            </div>
          )}
          initialFocusRef={descriptionInputRef}
          onClose={() => setIsDescriptionOpen(false)}
          open
          size="compact"
          title={translate("ui.af89df2ede7d")}
          titleId={`${descriptionFormId}-title`}
        >
          <form id={descriptionFormId} onSubmit={(event) => { event.preventDefault(); saveDescription(); }}>
            <label className="field">
              {translate("ui.b3680f2cba5f")}<input maxLength={240} onChange={(event) => setDescriptionDraft(event.currentTarget.value)} placeholder={translate("ui.a9bcc6676f84")} ref={descriptionInputRef} value={descriptionDraft} />
            </label>
          </form>
        </ModalShell>
      ) : null}
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
