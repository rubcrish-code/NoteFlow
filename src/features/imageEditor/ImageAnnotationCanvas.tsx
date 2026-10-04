import { useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type PointerEvent, type Ref } from "react";
import { cropPixels, intrinsicPoint, renderImageDocument, type AnnotationTool, type ImageAnnotation, type ImagePoint, type ImageSize } from "./imageEditorDocument";
import type { Rect } from "./imageGeometry";
import { Icon, type IconName } from "../../shared/Icon";
import { annotationBounds, hitTestAnnotation, translateAnnotation } from "./annotationGeometry";

export interface ImageAnnotationCanvasHandle { clearSelection: () => boolean }
type CanvasTool = AnnotationTool | "move";
type PointerDraft = { pointerId: number; annotation: ImageAnnotation } & (
  { kind: "create" } | { kind: "move"; index: number; anchor: ImagePoint; original: ImageAnnotation }
);

interface ImageAnnotationCanvasProps {
  image: HTMLImageElement | null;
  size: ImageSize;
  crop: Rect;
  annotations: readonly ImageAnnotation[];
  onCommit: (annotation: ImageAnnotation) => void;
  onUpdate: (index: number, annotation: ImageAnnotation) => void;
  onBusyChange: (busy: boolean) => void;
  ref?: Ref<ImageAnnotationCanvasHandle>;
}
const tools: Array<{ label: string; value: CanvasTool; icon: IconName }> = [
  { label: "Перемещение", value: "move", icon: "hand" },
  { label: "Карандаш", value: "pen", icon: "pen" }, { label: "Маркер", value: "marker", icon: "highlight" },
  { label: "Линия", value: "line", icon: "minus" }, { label: "Стрелка", value: "arrow", icon: "annotationArrow" },
  { label: "Прямоугольник", value: "rect", icon: "rectangle" }, { label: "Текст", value: "text", icon: "annotationText" },
];

export function ImageAnnotationCanvas({ image, size, crop, annotations, onCommit, onUpdate, onBusyChange, ref }: ImageAnnotationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draftRef = useRef<PointerDraft | null>(null);
  const frameRef = useRef<number | null>(null);
  const [tool, setTool] = useState<CanvasTool>("pen");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const selectedRef = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [color, setColor] = useState("#3b6ef2");
  const [lineWidth, setLineWidth] = useState(4);
  const [text, setText] = useState<{ point: ImagePoint; value: string; color: string; width: number } | null>(null);
  function paint(document = annotations) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draft = draftRef.current;
    const preview = !draft ? document : draft.kind === "create" ? [...document, draft.annotation]
      : document.map((annotation, index) => index === draft.index ? draft.annotation : annotation);
    renderImageDocument(canvas, image, size, crop, preview);
    const selected = selectedRef.current === null ? undefined : preview[selectedRef.current];
    const context = canvas.getContext("2d");
    if (!selected || !context) return;
    const pixels = cropPixels(size, crop);
    const scale = pixels.width / Math.max(1, canvas.getBoundingClientRect().width);
    const bounds = annotationBounds(selected, context);
    const inset = 4 * scale;
    context.save();
    context.strokeStyle = "#3b6ef2";
    context.lineWidth = scale;
    context.setLineDash([4 * scale, 3 * scale]);
    context.strokeRect(bounds.x - pixels.x - inset, bounds.y - pixels.y - inset, bounds.width + inset * 2, bounds.height + inset * 2);
    context.restore();
  }
  function select(index: number | null) { selectedRef.current = index; setSelectedIndex(index); }
  function clearSelection() {
    if (selectedRef.current === null) return false;
    select(null); paint(); return true;
  }
  useImperativeHandle(ref, () => ({ clearSelection }));
  useEffect(() => { if (selectedRef.current !== null && !annotations[selectedRef.current]) select(null); paint(); }, [image, size, crop, annotations]);
  useEffect(() => () => { if (frameRef.current !== null) cancelAnimationFrame(frameRef.current); }, []);
  useEffect(() => { onBusyChange(text !== null); return () => onBusyChange(false); }, [text, onBusyChange]);
  function point(event: PointerEvent<HTMLCanvasElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return intrinsicPoint({ x: event.clientX, y: event.clientY }, { x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height }, size, crop);
  }
  function start(event: PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0 || draftRef.current || text) return;
    event.preventDefault();
    const anchor = point(event);
    if (tool === "move") {
      const context = event.currentTarget.getContext("2d");
      const tolerance = 6 * cropPixels(size, crop).width / Math.max(1, event.currentTarget.getBoundingClientRect().width);
      const index = context ? hitTestAnnotation(annotations, anchor, tolerance, context) : null;
      select(index);
      if (index !== null) {
        const annotation = annotations[index];
        draftRef.current = { kind: "move", pointerId: event.pointerId, index, anchor, original: annotation, annotation };
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true); onBusyChange(true);
      }
      paint(); return;
    }
    const intrinsicWidth = lineWidth * size.width * crop.width / Math.max(1, event.currentTarget.getBoundingClientRect().width);
    if (tool === "text") {
      setText({ point: anchor, value: "", color, width: intrinsicWidth }); return;
    }
    draftRef.current = { kind: "create", pointerId: event.pointerId, annotation: { tool, points: [anchor], color, width: intrinsicWidth } };
    event.currentTarget.setPointerCapture(event.pointerId);
    onBusyChange(true);
    paint();
  }
  function move(event: PointerEvent<HTMLCanvasElement>) {
    const draft = draftRef.current;
    if (!draft || draft.pointerId !== event.pointerId) return;
    const next = point(event);
    draft.annotation = draft.kind === "move" ? translateAnnotation(draft.original, { x: next.x - draft.anchor.x, y: next.y - draft.anchor.y })
      : { ...draft.annotation, points: draft.annotation.tool === "pen" || draft.annotation.tool === "marker"
      ? [...draft.annotation.points, next] : [draft.annotation.points[0], next] };
    if (frameRef.current === null) frameRef.current = requestAnimationFrame(() => { frameRef.current = null; paint(); });
  }
  function finish(event: PointerEvent<HTMLCanvasElement>, cancelled = false) {
    if (draftRef.current?.pointerId !== event.pointerId) return;
    if (!cancelled) move(event);
    const draft = draftRef.current;
    draftRef.current = null;
    if (frameRef.current !== null) { cancelAnimationFrame(frameRef.current); frameRef.current = null; }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    onBusyChange(false); setDragging(false);
    if (!cancelled && draft.kind === "create") onCommit(draft.annotation);
    if (!cancelled && draft.kind === "move" && draft.annotation.points.some((point, index) => point.x !== draft.original.points[index].x || point.y !== draft.original.points[index].y)) onUpdate(draft.index, draft.annotation);
    paint(!cancelled && draft.kind === "move" ? annotations.map((annotation, index) => index === draft.index ? draft.annotation : annotation) : annotations);
  }
  function confirmText() {
    if (!text) return;
    if (text.value.trim()) onCommit({ tool: "text", points: [text.point], color: text.color, width: text.width, text: text.value });
    setText(null);
  }
  const textPosition = text ? {
    "--annotation-text-x": `${Math.min(85, Math.max(0, (text.point.x / size.width - crop.x) / crop.width * 100))}%`,
    "--annotation-text-y": `${Math.min(90, Math.max(0, (text.point.y / size.height - crop.y) / crop.height * 100))}%`,
  } as CSSProperties : undefined;
  return <div className="image-annotation-tool">
    <div className="image-editor-toolbar">
      <div className="image-editor-segmented" role="toolbar" aria-label="Инструменты рисования">
        {tools.map((item) => <button aria-label={item.label} title={item.value === "move" ? "Перемещение элементов" : item.label} aria-pressed={tool === item.value} className={`image-drawing-tool ${tool === item.value ? "active" : ""}`} key={item.value}
          disabled={dragging || text !== null} onClick={() => { clearSelection(); setTool(item.value); }} type="button"><Icon name={item.icon} /></button>)}
      </div>
      <label className="image-editor-color">Цвет<input type="color" value={color} onChange={(event) => setColor(event.currentTarget.value)} /></label>
      <label className="image-editor-range drawing-stroke-range" style={{ "--drawing-color": color } as CSSProperties}>Толщина<input aria-label="Толщина" type="range" min="2" max="18" value={lineWidth} onChange={(event) => setLineWidth(Number(event.currentTarget.value))} /><output>{lineWidth}</output></label>
    </div>
    <div className="image-annotation-stage"><div className="image-annotation-surface" style={{ "--image-editor-aspect": cropPixels(size, crop).width / cropPixels(size, crop).height } as CSSProperties}>
      <canvas ref={canvasRef} aria-label="Холст рисования" data-tool={tool} data-selected={selectedIndex !== null} data-dragging={dragging} tabIndex={0}
        onKeyDown={(event) => { if (event.key === "Escape" && clearSelection()) { event.preventDefault(); event.stopPropagation(); } }} onPointerDown={start} onPointerMove={move} onPointerUp={(event) => finish(event)}
        onPointerCancel={(event) => finish(event, true)} onLostPointerCapture={(event) => finish(event, true)} />
      {text ? <form className="image-annotation-text-entry" style={textPosition} onSubmit={(event) => { event.preventDefault(); confirmText(); }}>
        <input aria-label="Текст на изображении" autoFocus value={text.value} onChange={(event) => setText({ ...text, value: event.currentTarget.value })}
          onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setText(null); } }} />
        <button aria-label="Добавить текст" className="secondary-btn" type="submit">OK</button>
        <button aria-label="Отменить текст" className="secondary-btn" type="button" onClick={() => setText(null)}>Отмена</button>
      </form> : null}
    </div></div>
  </div>;
}
