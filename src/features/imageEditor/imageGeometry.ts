export const resizeHandles = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;

export type ResizeHandle = (typeof resizeHandles)[number];

export interface Size {
  height: number;
  width: number;
}

export interface Rect extends Size {
  x: number;
  y: number;
}

export interface Bounds extends Size {}

export function imageResizeStart(rendered: Size, layout: Size) {
  const scaleX = layout.width > 0 ? rendered.width / layout.width : 1;
  const scaleY = layout.height > 0 ? rendered.height / layout.height : scaleX;
  return { size: { width: layout.width || rendered.width, height: layout.height || rendered.height }, scaleX: scaleX || 1, scaleY: scaleY || 1 };
}

export function getResizeCursor(handle: ResizeHandle) {
  const cursors: Record<ResizeHandle, string> = {
    e: "ew-resize",
    n: "ns-resize",
    ne: "nesw-resize",
    nw: "nwse-resize",
    s: "ns-resize",
    se: "nwse-resize",
    sw: "nesw-resize",
    w: "ew-resize",
  };
  return cursors[handle];
}

export function clampValue(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function moveRectWithinBounds(rect: Rect, deltaX: number, deltaY: number, bounds: Bounds): Rect {
  return {
    ...rect,
    x: clampValue(rect.x + deltaX, 0, bounds.width - rect.width),
    y: clampValue(rect.y + deltaY, 0, bounds.height - rect.height),
  };
}

export function resizeRectWithinBounds(rect: Rect, handle: ResizeHandle, deltaX: number, deltaY: number, bounds: Bounds, minSize: Size): Rect {
  const next = {
    bottom: rect.y + rect.height,
    left: rect.x,
    right: rect.x + rect.width,
    top: rect.y,
  };

  if (handle.includes("w")) {
    next.left = clampValue(rect.x + deltaX, 0, next.right - minSize.width);
  }
  if (handle.includes("e")) {
    next.right = clampValue(rect.x + rect.width + deltaX, next.left + minSize.width, bounds.width);
  }
  if (handle.includes("n")) {
    next.top = clampValue(rect.y + deltaY, 0, next.bottom - minSize.height);
  }
  if (handle.includes("s")) {
    next.bottom = clampValue(rect.y + rect.height + deltaY, next.top + minSize.height, bounds.height);
  }

  return {
    height: next.bottom - next.top,
    width: next.right - next.left,
    x: next.left,
    y: next.top,
  };
}

export function createRectFromPoints(startX: number, startY: number, currentX: number, currentY: number, bounds: Bounds, minSize: Size): Rect {
  const left = clampValue(Math.min(startX, currentX), 0, bounds.width - minSize.width);
  const top = clampValue(Math.min(startY, currentY), 0, bounds.height - minSize.height);
  const right = clampValue(Math.max(startX, currentX), left + minSize.width, bounds.width);
  const bottom = clampValue(Math.max(startY, currentY), top + minSize.height, bounds.height);

  return {
    height: bottom - top,
    width: right - left,
    x: left,
    y: top,
  };
}

export function resizeImageBox(
  startSize: Size,
  handle: ResizeHandle,
  deltaX: number,
  deltaY: number,
  constraints: { maxHeight: number; maxWidth: number; minHeight: number; minWidth: number },
): Size {
  const horizontalDelta = handle.includes("w") ? -deltaX : handle.includes("e") ? deltaX : 0;
  const verticalDelta = handle.includes("n") ? -deltaY : handle.includes("s") ? deltaY : 0;
  const isCorner = (handle.includes("n") || handle.includes("s")) && (handle.includes("e") || handle.includes("w"));

  if (isCorner) {
    const widthScale = (startSize.width + horizontalDelta) / startSize.width;
    const heightScale = (startSize.height + verticalDelta) / startSize.height;
    const dominantScale = Math.abs(widthScale - 1) > Math.abs(heightScale - 1) ? widthScale : heightScale;
    const minScale = Math.max(constraints.minWidth / startSize.width, constraints.minHeight / startSize.height);
    const maxScale = Math.min(constraints.maxWidth / startSize.width, constraints.maxHeight / startSize.height);
    const scale = clampValue(dominantScale, minScale, maxScale);

    return {
      height: Math.round(startSize.height * scale),
      width: Math.round(startSize.width * scale),
    };
  }

  return {
    height: Math.round(clampValue(startSize.height + verticalDelta, constraints.minHeight, constraints.maxHeight)),
    width: Math.round(clampValue(startSize.width + horizontalDelta, constraints.minWidth, constraints.maxWidth)),
  };
}
