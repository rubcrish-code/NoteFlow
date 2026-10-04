import { useEffect, useRef, type CSSProperties, type PointerEvent } from "react";
import {
  clampValue,
  createRectFromPoints,
  getResizeCursor,
  moveRectWithinBounds,
  resizeHandles,
  resizeRectWithinBounds,
  type Rect,
  type ResizeHandle,
} from "./imageGeometry";

interface ImageCropToolProps {
  src: string;
  aspectRatio: number;
  crop: Rect;
  onChange: (crop: Rect) => void;
}

type CropInteraction =
  | { kind: "create"; pointerId: number; startPoint: { x: number; y: number } }
  | { kind: "move"; pointerId: number; startCrop: Rect; startPoint: { x: number; y: number } }
  | { handle: ResizeHandle; kind: "resize"; pointerId: number; startCrop: Rect; startPoint: { x: number; y: number } };

const cropBounds = { height: 1, width: 1 };
const minimumCropSize = { height: 0.04, width: 0.04 };

function getCropHandleLabel(handle: ResizeHandle) {
  const labels: Record<ResizeHandle, string> = {
    e: "Изменить область обрезки справа",
    n: "Изменить область обрезки сверху",
    ne: "Изменить область обрезки из правого верхнего угла",
    nw: "Изменить область обрезки из левого верхнего угла",
    s: "Изменить область обрезки снизу",
    se: "Изменить область обрезки из правого нижнего угла",
    sw: "Изменить область обрезки из левого нижнего угла",
    w: "Изменить область обрезки слева",
  };
  return labels[handle];
}

export function ImageCropTool({ src, aspectRatio, crop, onChange: setCrop }: ImageCropToolProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<CropInteraction | null>(null);

  function getRelativePoint(event: PointerEvent<Element>) {
    const layer = layerRef.current;
    if (!layer) {
      return { x: 0, y: 0 };
    }

    const rect = layer.getBoundingClientRect();
    const x = clampValue((event.clientX - rect.left) / rect.width, 0, 1);
    const y = clampValue((event.clientY - rect.top) / rect.height, 0, 1);
    return { x, y };
  }

  function capturePointer(pointerId: number) {
    layerRef.current?.setPointerCapture(pointerId);
  }

  function startCreate(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || event.target !== event.currentTarget) {
      return;
    }
    event.preventDefault();
    const point = getRelativePoint(event);
    interactionRef.current = { kind: "create", pointerId: event.pointerId, startPoint: point };
    capturePointer(event.pointerId);
    setCrop({ x: point.x, y: point.y, width: minimumCropSize.width, height: minimumCropSize.height });
    document.body.style.userSelect = "none";
  }

  function startMove(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    interactionRef.current = { kind: "move", pointerId: event.pointerId, startCrop: crop, startPoint: getRelativePoint(event) };
    capturePointer(event.pointerId);
    document.body.style.cursor = "move";
    document.body.style.userSelect = "none";
  }

  function startResize(event: PointerEvent<HTMLButtonElement>, handle: ResizeHandle) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    interactionRef.current = { handle, kind: "resize", pointerId: event.pointerId, startCrop: crop, startPoint: getRelativePoint(event) };
    capturePointer(event.pointerId);
    document.body.style.cursor = getResizeCursor(handle);
    document.body.style.userSelect = "none";
  }

  function updateCrop(event: PointerEvent<HTMLDivElement>) {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    const point = getRelativePoint(event);

    if (interaction.kind === "create") {
      setCrop(createRectFromPoints(interaction.startPoint.x, interaction.startPoint.y, point.x, point.y, cropBounds, minimumCropSize));
      return;
    }

    const deltaX = point.x - interaction.startPoint.x;
    const deltaY = point.y - interaction.startPoint.y;
    if (interaction.kind === "move") {
      setCrop(moveRectWithinBounds(interaction.startCrop, deltaX, deltaY, cropBounds));
      return;
    }

    setCrop(resizeRectWithinBounds(interaction.startCrop, interaction.handle, deltaX, deltaY, cropBounds, minimumCropSize));
  }

  function stopCrop(event: PointerEvent<HTMLDivElement>) {
    if (interactionRef.current?.pointerId !== event.pointerId) return;
    interactionRef.current = null;
    if (layerRef.current?.hasPointerCapture(event.pointerId)) {
      layerRef.current.releasePointerCapture(event.pointerId);
    }
    interactionRef.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }

  useEffect(() => {
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, []);

  return (
    <div className="image-crop-tool">
      <div className="image-crop-stage">
        <div className="image-crop-canvas" style={{ "--image-editor-aspect": aspectRatio } as CSSProperties}>
          <img alt="" crossOrigin="anonymous" draggable={false} ref={imageRef} src={src} />
          <div className="image-crop-layer" onLostPointerCapture={stopCrop} onPointerCancel={stopCrop} onPointerDown={startCreate} onPointerMove={updateCrop} onPointerUp={stopCrop} ref={layerRef}>
            <div
              className="image-crop-rect"
              onPointerDown={startMove}
              style={{
                height: `${crop.height * 100}%`,
                left: `${crop.x * 100}%`,
                top: `${crop.y * 100}%`,
                width: `${crop.width * 100}%`,
              }}
            >
              <span className="image-crop-grid" />
              {resizeHandles.map((handle) => (
                <button
                  aria-label={getCropHandleLabel(handle)}
                  className={`image-crop-handle image-crop-handle-${handle}`}
                  key={handle}
                  onPointerDown={(event) => startResize(event, handle)}
                  style={{ cursor: getResizeCursor(handle) }}
                  type="button"
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
