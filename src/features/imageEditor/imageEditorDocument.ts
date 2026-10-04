import { getCanvasContext } from "./imageEditService";
import type { Rect } from "./imageGeometry";
import { annotationFontSize, arrowHeadPoints } from "./annotationGeometry";

export type AnnotationTool = "arrow" | "line" | "marker" | "pen" | "rect" | "text";
export interface ImagePoint { x: number; y: number }
export interface ImageSize { width: number; height: number }
export interface ImageAnnotation {
  tool: AnnotationTool;
  points: ImagePoint[];
  color: string;
  width: number;
  text?: string;
}
export const fullImageCrop: Rect = { x: 0, y: 0, width: 1, height: 1 };
export const blankDrawingSize: ImageSize = { width: 1200, height: 800 };

export function intrinsicPoint(client: ImagePoint, bounds: Rect, size: ImageSize, crop: Rect): ImagePoint {
  const unit = (value: number, offset: number, extent: number) => Math.min(1, Math.max(0, (value - offset) / Math.max(1, extent)));
  return {
    x: (crop.x + unit(client.x, bounds.x, bounds.width) * crop.width) * size.width,
    y: (crop.y + unit(client.y, bounds.y, bounds.height) * crop.height) * size.height,
  };
}

export function cropPixels(size: ImageSize, crop: Rect): Rect {
  const x = Math.min(size.width - 1, Math.max(0, Math.round(crop.x * size.width)));
  const y = Math.min(size.height - 1, Math.max(0, Math.round(crop.y * size.height)));
  return { x, y, width: Math.max(1, Math.min(size.width - x, Math.round(crop.width * size.width))), height: Math.max(1, Math.min(size.height - y, Math.round(crop.height * size.height))) };
}

export function drawAnnotation(context: CanvasRenderingContext2D, annotation: ImageAnnotation) {
  const first = annotation.points[0];
  const last = annotation.points[annotation.points.length - 1];
  if (!first || !last) return;
  context.save();
  context.strokeStyle = annotation.color;
  context.fillStyle = annotation.color;
  context.lineWidth = annotation.width * (annotation.tool === "marker" ? 2.4 : 1);
  context.globalAlpha = annotation.tool === "marker" ? 0.35 : 1;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  if (annotation.tool === "text") {
    context.font = `${annotationFontSize(annotation)}px system-ui, sans-serif`;
    context.textBaseline = "top";
    context.fillText(annotation.text ?? "", first.x, first.y);
  } else if (annotation.tool === "rect") {
    context.strokeRect(Math.min(first.x, last.x), Math.min(first.y, last.y), Math.abs(last.x - first.x), Math.abs(last.y - first.y));
  } else {
    context.moveTo(first.x, first.y);
    for (const point of annotation.points.slice(1)) context.lineTo(point.x, point.y);
    if (annotation.points.length === 1) context.lineTo(first.x + 0.01, first.y);
    context.stroke();
    if (annotation.tool === "arrow") {
      const [left, right] = arrowHeadPoints(annotation);
      context.beginPath();
      context.moveTo(left.x, left.y);
      context.lineTo(last.x, last.y);
      context.lineTo(right.x, right.y);
      context.stroke();
    }
  }
  context.restore();
}

// Annotations always use original bitmap coordinates; cropping only changes the projection.
export function renderImageDocument(canvas: HTMLCanvasElement, image: HTMLImageElement | null, size: ImageSize, crop: Rect, annotations: readonly ImageAnnotation[]) {
  const pixels = cropPixels(size, crop);
  if (canvas.width !== pixels.width) canvas.width = pixels.width;
  if (canvas.height !== pixels.height) canvas.height = pixels.height;
  const context = getCanvasContext(canvas);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#ffffff";
  if (!image) context.fillRect(0, 0, canvas.width, canvas.height);
  else context.drawImage(image, pixels.x, pixels.y, pixels.width, pixels.height, 0, 0, pixels.width, pixels.height);
  context.save();
  context.translate(-pixels.x, -pixels.y);
  for (const annotation of annotations) drawAnnotation(context, annotation);
  context.restore();
}
