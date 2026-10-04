import type { ImageAnnotation, ImagePoint } from "./imageEditorDocument";
import type { Rect } from "./imageGeometry";

export function annotationFontSize(annotation: ImageAnnotation) {
  return Math.max(1, annotation.width * 5);
}

export function arrowHeadPoints(annotation: ImageAnnotation): ImagePoint[] {
  const first = annotation.points[0], last = annotation.points[annotation.points.length - 1];
  if (!first || !last || annotation.tool !== "arrow") return [];
  const angle = Math.atan2(last.y - first.y, last.x - first.x);
  const head = Math.max(1, annotation.width * 3);
  return [-1, 1].map((direction) => ({ x: last.x - head * Math.cos(angle + direction * Math.PI / 6), y: last.y - head * Math.sin(angle + direction * Math.PI / 6) }));
}

export function annotationBounds(annotation: ImageAnnotation, context: CanvasRenderingContext2D): Rect {
  const first = annotation.points[0];
  if (!first) return { x: 0, y: 0, width: 0, height: 0 };
  if (annotation.tool === "text") {
    const height = annotationFontSize(annotation);
    context.save();
    context.font = `${height}px system-ui, sans-serif`;
    const width = context.measureText(annotation.text ?? "").width;
    context.restore();
    return { x: first.x, y: first.y, width, height: height * 1.2 };
  }
  const points = [...annotation.points, ...arrowHeadPoints(annotation)];
  const inset = annotation.width * (annotation.tool === "marker" ? 2.4 : 1) / 2;
  const bounds = points.reduce((range, point) => ({ left: Math.min(range.left, point.x), top: Math.min(range.top, point.y), right: Math.max(range.right, point.x), bottom: Math.max(range.bottom, point.y) }), { left: first.x, top: first.y, right: first.x, bottom: first.y });
  return { x: bounds.left - inset, y: bounds.top - inset, width: bounds.right - bounds.left + inset * 2, height: bounds.bottom - bounds.top + inset * 2 };
}

function segmentDistance(point: ImagePoint, start: ImagePoint, end: ImagePoint) {
  const dx = end.x - start.x, dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const ratio = lengthSquared ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)) : 0;
  return Math.hypot(point.x - start.x - ratio * dx, point.y - start.y - ratio * dy);
}

export function hitTestAnnotation(annotations: readonly ImageAnnotation[], point: ImagePoint, tolerance: number, context: CanvasRenderingContext2D): number | null {
  for (let index = annotations.length - 1; index >= 0; index--) {
    const annotation = annotations[index];
    const first = annotation.points[0];
    if (!first) continue;
    if (annotation.tool === "text" || annotation.tool === "rect") {
      const bounds = annotationBounds(annotation, context);
      if (point.x >= bounds.x - tolerance && point.x <= bounds.x + bounds.width + tolerance && point.y >= bounds.y - tolerance && point.y <= bounds.y + bounds.height + tolerance) return index;
    } else {
      const radius = tolerance + annotation.width * (annotation.tool === "marker" ? 2.4 : 1) / 2;
      const points = annotation.points.length === 1 ? [first, first] : annotation.points;
      for (let i = 1; i < points.length; i++) if (segmentDistance(point, points[i - 1], points[i]) <= radius) return index;
      for (const head of arrowHeadPoints(annotation)) if (segmentDistance(point, head, annotation.points[annotation.points.length - 1]) <= radius) return index;
    }
  }
  return null;
}

export function translateAnnotation(annotation: ImageAnnotation, delta: ImagePoint): ImageAnnotation {
  return { ...annotation, points: annotation.points.map((point) => ({ x: point.x + delta.x, y: point.y + delta.y })) };
}
