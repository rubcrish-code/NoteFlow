import { translate, useInterfaceLanguage } from "../../shared/i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { ModalShell } from "../../shared/ModalShell";
import { Icon } from "../../shared/Icon";
import { ImageAnnotationCanvas, type ImageAnnotationCanvasHandle } from "./ImageAnnotationCanvas";
import { ImageCropTool } from "./ImageCropTool";
import { canvasToPngDataUrl, loadImage, type ImageEditMode } from "./imageEditService";
import { blankDrawingSize, fullImageCrop, renderImageDocument, type ImageAnnotation } from "./imageEditorDocument";
import type { Rect } from "./imageGeometry";

interface ImageEditorModalProps {
  mode: ImageEditMode;
  src: string;
  title: string;
  onApply: (dataUrl: string, mode: ImageEditMode) => Promise<void> | void;
  onClose: () => void;
}
export function ImageEditorModal({ mode: initialMode, src, title, onApply, onClose }: ImageEditorModalProps) {
  useInterfaceLanguage();
  const [mode, setMode] = useState(initialMode);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [ready, setReady] = useState(!src);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const annotationCanvasRef = useRef<ImageAnnotationCanvasHandle>(null);
  const [busy, setBusy] = useState(false);
  const [crop, setCrop] = useState<Rect>(fullImageCrop);
  const [history, setHistory] = useState<ImageAnnotation[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [resetOpen, setResetOpen] = useState(false);
  const annotations = history[historyIndex];
  const size = useMemo(() => image ? { width: image.naturalWidth, height: image.naturalHeight } : blankDrawingSize, [image]);
  const dirty = annotations.length > 0 || Object.keys(fullImageCrop).some((key) => crop[key as keyof Rect] !== fullImageCrop[key as keyof Rect]);
  useEffect(() => {
    let active = true;
    if (!src) return;
    setReady(false);
    void loadImage(src).then((loaded) => {
      if (!active) return;
      if (!loaded.naturalWidth || !loaded.naturalHeight) throw new Error("empty image");
      setImage(loaded); setReady(true);
    }).catch(() => { if (active) setError(translate("ui.8c384ca1a3d1")); });
    return () => { active = false; };
  }, [src]);
  const cropPreview = useMemo(() => {
    if (!ready || mode !== "crop") return { src: "", error: "" };
    try {
      const canvas = document.createElement("canvas");
      renderImageDocument(canvas, image, size, fullImageCrop, annotations);
      return { src: canvasToPngDataUrl(canvas), error: "" };
    } catch { return { src: "", error: translate("ui.39f6bbbfb2f1") }; }
  }, [ready, mode, image, size, annotations]);
  function commitDocument(next: ImageAnnotation[]) {
    setHistory([...history.slice(0, historyIndex + 1), next]);
    setHistoryIndex(historyIndex + 1);
  }
  function commit(annotation: ImageAnnotation) { commitDocument([...annotations, annotation]); }
  function update(index: number, annotation: ImageAnnotation) {
    commitDocument(annotations.map((current, currentIndex) => currentIndex === index ? annotation : current));
  }
  async function apply() {
    if (!ready || busy || savingRef.current) return;
    savingRef.current = true; setSaving(true); setError("");
    try {
      const canvas = document.createElement("canvas");
      renderImageDocument(canvas, image, size, crop, annotations);
      const result = canvasToPngDataUrl(canvas);
      if (!result.startsWith("data:image/png;base64,")) throw new Error("empty canvas");
      await onApply(result, mode);
      onClose();
    } catch { setError(translate("ui.5f14a75bda85")); }
    finally { savingRef.current = false; setSaving(false); }
  }
  function reset() {
    setCrop(fullImageCrop); setHistory([[]]); setHistoryIndex(0); setError(""); setResetOpen(false);
  }
  return <>
    <ModalShell open onClose={onClose} title={src ? translate("ui.37935b84a3d1") : translate("ui.7d6d80bc3805")} description={title || undefined}
      size="wide" className="image-editor-shell" bodyClassName="image-editor-body" closeDisabled={saving}
      dismissOnBackdrop={false} onEscapeKeyDown={(event) => resetOpen || busy || annotationCanvasRef.current?.clearSelection() || (event.target instanceof HTMLInputElement && event.target.closest(".image-annotation-text-entry") !== null)}
      footerClassName="image-editor-footer" footer={<>
        <button className="secondary-btn" disabled={!dirty || saving || busy} onClick={() => setResetOpen(true)} type="button">{translate("ui.3b7c443e5646")}</button>
        <div className="image-editor-primary-actions">
          <button className="secondary-btn" disabled={saving} onClick={onClose} type="button">{translate("ui.8fbe9b75cbdf")}</button>
          <button className="primary-btn" disabled={!ready || saving || busy || Boolean(cropPreview.error)} onClick={() => void apply()} type="button">{saving ? translate("ui.9c27c381dd8b") : translate("ui.e15f960d93eb")}</button>
        </div>
      </>}>
      <div className="image-editor-toolbar">
        <div className="image-editor-segmented" aria-label={translate("ui.2c90b68d1a12")}>
          <button aria-pressed={mode === "crop"} className={mode === "crop" ? "active" : ""} disabled={busy || saving} onClick={() => setMode("crop")} type="button">{translate("ui.1750bfde7de9")}</button>
          <button aria-pressed={mode === "draw"} className={mode === "draw" ? "active" : ""} disabled={busy || saving} onClick={() => setMode("draw")} type="button">{translate("ui.47a0badade12")}</button>
        </div>
        <button aria-label={translate("ui.03046fc9eb22")} title={translate("ui.03046fc9eb22")} className="secondary-btn" disabled={historyIndex === 0 || busy || saving} onClick={() => setHistoryIndex(historyIndex - 1)} type="button"><Icon name="undo" /></button>
        <button aria-label={translate("ui.581ebeabe20c")} title={translate("ui.581ebeabe20c")} className="secondary-btn" disabled={historyIndex === history.length - 1 || busy || saving} onClick={() => setHistoryIndex(historyIndex + 1)} type="button"><Icon name="redo" /></button>
      </div>
      {error || cropPreview.error ? <p role="alert" className="image-editor-error">{error || cropPreview.error}</p> : null}
      {!ready && !error ? <p role="status">{translate("ui.a2ce62176f86")}</p> : null}
      <fieldset className="image-editor-workspace" disabled={saving}>
        {ready && mode === "crop" && cropPreview.src ? <ImageCropTool src={cropPreview.src} aspectRatio={size.width / size.height} crop={crop} onChange={setCrop} /> : null}
        {ready && mode === "draw" ? <ImageAnnotationCanvas ref={annotationCanvasRef} image={image} size={size} crop={crop} annotations={annotations} onCommit={commit} onUpdate={update} onBusyChange={setBusy} /> : null}
      </fieldset>
    </ModalShell>
    <ModalShell open={resetOpen} onClose={() => setResetOpen(false)} title={translate("ui.0775f650fe07")} size="compact"
      footer={<><button className="secondary-btn" onClick={() => setResetOpen(false)} type="button">{translate("ui.8fbe9b75cbdf")}</button><button className="primary-btn" onClick={reset} type="button">{translate("ui.407f871778d3")}</button></>}>
      <p>{translate("ui.17f498154c2a")}</p>
    </ModalShell>
  </>;
}
