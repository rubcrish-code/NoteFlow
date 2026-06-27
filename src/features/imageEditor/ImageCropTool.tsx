import { useEffect, useRef, useState, type PointerEvent } from "react";
import { canvasToPngDataUrl, getCanvasContext } from "./imageEditService";
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
  onApply: (dataUrl: string) => void;
}

type CropInteraction =
  | { kind: "create"; pointerId: number; startPoint: { x: number; y: number } }
  | { kind: "move"; pointerId: number; startCrop: Rect; startPoint: { x: number; y: number } }
  | { handle: ResizeHandle; kind: "resize"; pointerId: number; startCrop: Rect; startPoint: { x: number; y: number } };

const cropBounds = { height: 1, width: 1 };
const defaultCrop: Rect = { x: 0.08, y: 0.08, width: 0.84, height: 0.84 };
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

export function ImageCropTool({ src, onApply }: ImageCropToolProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<CropInteraction | null>(null);
  const [crop, setCrop] = useState<Rect>(defaultCrop);

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
    if (event.target !== event.currentTarget) {
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
    event.preventDefault();
    event.stopPropagation();
    interactionRef.current = { kind: "move", pointerId: event.pointerId, startCrop: crop, startPoint: getRelativePoint(event) };
    capturePointer(event.pointerId);
    document.body.style.cursor = "move";
    document.body.style.userSelect = "none";
  }

  function startResize(event: PointerEvent<HTMLButtonElement>, handle: ResizeHandle) {
    event.preventDefault();
    event.stopPropagation();
    interactionRef.current = { handle, kind: "resize", pointerId: event.pointerId, startCrop: crop, startPoint: getRelativePoint(event) };
    capturePointer(event.pointerId);
    document.body.style.cursor = getResizeCursor(handle);
    document.body.style.userSelect = "none";
  }

  function updateCrop(event: PointerEvent<HTMLDivElement>) {
    const interaction = interactionRef.current;
    if (!interaction) {
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
    if (layerRef.current?.hasPointerCapture(event.pointerId)) {
      layerRef.current.releasePointerCapture(event.pointerId);
    }
    interactionRef.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }

  useEffect(() => {
    setCrop(defaultCrop);
  }, [src]);

  useEffect(() => {
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, []);

  function applyCrop() {
    const image = imageRef.current;
    if (!image) {
      return;
    }

    const naturalWidth = image.naturalWidth;
    const naturalHeight = image.naturalHeight;
    const sourceX = Math.round(crop.x * naturalWidth);
    const sourceY = Math.round(crop.y * naturalHeight);
    const sourceWidth = Math.max(1, Math.round(crop.width * naturalWidth));
    const sourceHeight = Math.max(1, Math.round(crop.height * naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = sourceWidth;
    canvas.height = sourceHeight;
    getCanvasContext(canvas).drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);
    onApply(canvasToPngDataUrl(canvas));
  }

  return (
    <div className="image-crop-tool">
      <div className="image-crop-stage">
        <div className="image-crop-canvas">
          <img alt="" draggable={false} ref={imageRef} src={src} />
          <div className="image-crop-layer" onPointerCancel={stopCrop} onPointerDown={startCreate} onPointerMove={updateCrop} onPointerUp={stopCrop} ref={layerRef}>
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
      <button className="primary-btn image-editor-apply" onClick={applyCrop} type="button">
        Применить
      </button>
    </div>
  );
}
