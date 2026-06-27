import { useEffect, useRef, useState, type PointerEvent } from "react";
import { canvasToPngDataUrl, getCanvasContext, loadImage } from "./imageEditService";

type AnnotationTool = "arrow" | "line" | "marker" | "pen" | "rect" | "text";

interface ImageAnnotationCanvasProps {
  src: string;
  onApply: (dataUrl: string) => void;
}

const tools: Array<{ label: string; value: AnnotationTool }> = [
  { label: "Карандаш", value: "pen" },
  { label: "Маркер", value: "marker" },
  { label: "Линия", value: "line" },
  { label: "Стрелка", value: "arrow" },
  { label: "Прямоугольник", value: "rect" },
  { label: "Текст", value: "text" },
];

function drawArrowHead(context: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number) {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const size = 14;
  context.beginPath();
  context.moveTo(toX, toY);
  context.lineTo(toX - size * Math.cos(angle - Math.PI / 6), toY - size * Math.sin(angle - Math.PI / 6));
  context.moveTo(toX, toY);
  context.lineTo(toX - size * Math.cos(angle + Math.PI / 6), toY - size * Math.sin(angle + Math.PI / 6));
  context.stroke();
}

export function ImageAnnotationCanvas({ src, onApply }: ImageAnnotationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const snapshotRef = useRef<ImageData | null>(null);
  const [tool, setTool] = useState<AnnotationTool>("pen");
  const [color, setColor] = useState("#3b6ef2");
  const [lineWidth, setLineWidth] = useState(4);
  const [textDraft, setTextDraft] = useState("Подпись");
  const [history, setHistory] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);

  useEffect(() => {
    let isMounted = true;
    void loadImage(src).then((image) => {
      if (!isMounted || !canvasRef.current) {
        return;
      }
      const canvas = canvasRef.current;
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = getCanvasContext(canvas);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      setHistory([canvasToPngDataUrl(canvas)]);
      setRedoStack([]);
    });

    return () => {
      isMounted = false;
    };
  }, [src]);

  function getCanvasPoint(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0 };
    }
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function configureStroke(context: CanvasRenderingContext2D, useMarker = false) {
    context.globalAlpha = useMarker ? 0.35 : 1;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = useMarker ? lineWidth * 2.4 : lineWidth;
    context.strokeStyle = color;
    context.fillStyle = color;
  }

  function commitHistory() {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const dataUrl = canvasToPngDataUrl(canvas);
    setHistory((currentHistory) => [...currentHistory, dataUrl].slice(-30));
    setRedoStack([]);
  }

  function startDrawing(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const point = getCanvasPoint(event);
    const context = getCanvasContext(canvas);
    if (tool === "text") {
      context.font = `${Math.max(16, lineWidth * 5)}px Inter, system-ui, sans-serif`;
      context.fillStyle = color;
      context.globalAlpha = 1;
      context.fillText(textDraft.trim() || "Подпись", point.x, point.y);
      commitHistory();
      return;
    }

    drawingRef.current = true;
    startRef.current = point;
    snapshotRef.current = context.getImageData(0, 0, canvas.width, canvas.height);
    configureStroke(context, tool === "marker");
    context.beginPath();
    context.moveTo(point.x, point.y);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function draw(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || !canvasRef.current || !startRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    const context = getCanvasContext(canvas);
    const point = getCanvasPoint(event);
    configureStroke(context, tool === "marker");

    if (tool === "pen" || tool === "marker") {
      context.lineTo(point.x, point.y);
      context.stroke();
      return;
    }

    if (snapshotRef.current) {
      context.putImageData(snapshotRef.current, 0, 0);
    }
    const start = startRef.current;
    context.beginPath();
    if (tool === "rect") {
      context.rect(start.x, start.y, point.x - start.x, point.y - start.y);
      context.stroke();
      return;
    }
    context.moveTo(start.x, start.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    if (tool === "arrow") {
      drawArrowHead(context, start.x, start.y, point.x, point.y);
    }
  }

  function stopDrawing(event: PointerEvent<HTMLCanvasElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!drawingRef.current) {
      return;
    }
    drawingRef.current = false;
    startRef.current = null;
    snapshotRef.current = null;
    const context = canvasRef.current ? getCanvasContext(canvasRef.current) : null;
    if (context) {
      context.globalAlpha = 1;
    }
    commitHistory();
  }

  async function restoreFromDataUrl(dataUrl: string) {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const image = await loadImage(dataUrl);
    const context = getCanvasContext(canvas);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);
  }

  function undo() {
    if (history.length <= 1) {
      return;
    }
    const previous = history[history.length - 2];
    const current = history[history.length - 1];
    setHistory((currentHistory) => currentHistory.slice(0, -1));
    setRedoStack((currentRedo) => [...currentRedo, current]);
    void restoreFromDataUrl(previous);
  }

  function redo() {
    const next = redoStack[redoStack.length - 1];
    if (!next) {
      return;
    }
    setRedoStack((currentRedo) => currentRedo.slice(0, -1));
    setHistory((currentHistory) => [...currentHistory, next]);
    void restoreFromDataUrl(next);
  }

  function applyAnnotations() {
    if (canvasRef.current) {
      onApply(canvasToPngDataUrl(canvasRef.current));
    }
  }

  return (
    <div className="image-annotation-tool">
      <div className="image-editor-toolbar">
        <div className="image-editor-segmented" role="toolbar" aria-label="Инструменты рисования">
          {tools.map((item) => (
            <button className={tool === item.value ? "active" : ""} key={item.value} onClick={() => setTool(item.value)} type="button">
              {item.label}
            </button>
          ))}
        </div>
        <label className="image-editor-color">
          Цвет
          <input onChange={(event) => setColor(event.currentTarget.value)} type="color" value={color} />
        </label>
        <label className="image-editor-range">
          Толщина
          <input max="18" min="2" onChange={(event) => setLineWidth(Number(event.currentTarget.value))} type="range" value={lineWidth} />
        </label>
        {tool === "text" ? (
          <label className="image-editor-text">
            Текст
            <input onChange={(event) => setTextDraft(event.currentTarget.value)} value={textDraft} />
          </label>
        ) : null}
        <div className="image-editor-history">
          <button className="secondary-btn" disabled={history.length <= 1} onClick={undo} type="button">
            Отмена
          </button>
          <button className="secondary-btn" disabled={redoStack.length === 0} onClick={redo} type="button">
            Повтор
          </button>
        </div>
      </div>
      <div className="image-annotation-stage">
        <canvas ref={canvasRef} onPointerDown={startDrawing} onPointerMove={draw} onPointerUp={stopDrawing} />
      </div>
      <button className="primary-btn image-editor-apply" onClick={applyAnnotations} type="button">
        Применить
      </button>
    </div>
  );
}
