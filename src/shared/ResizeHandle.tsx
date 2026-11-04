import { useEffect, useRef, useState, type PointerEvent } from "react";

interface ResizeHandleProps {
  className?: string;
  label: string;
  onResize: (deltaX: number) => void;
  onReset?: () => void;
  onResizeStart?: (handle: HTMLDivElement) => void;
  onResizeEnd?: () => void;
}

export function ResizeHandle({ className = "", label, onResize, onReset, onResizeStart, onResizeEnd }: ResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false);
  const lastClientX = useRef(0);
  const dragging = useRef(false);
  const pendingDelta = useRef(0);
  const frame = useRef<number | null>(null);
  const resizeRef = useRef(onResize);
  resizeRef.current = onResize;

  function flushResize() {
    if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    frame.current = null;
    const delta = pendingDelta.current;
    pendingDelta.current = 0;
    if (delta) resizeRef.current(delta);
  }

  useEffect(() => () => {
    if (frame.current !== null) window.cancelAnimationFrame(frame.current);
  }, []);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    lastClientX.current = event.clientX;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragging.current = true;
    setIsDragging(true);
    onResizeStart?.(event.currentTarget);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!dragging.current) {
      return;
    }

    const deltaX = event.clientX - lastClientX.current;
    lastClientX.current = event.clientX;
    pendingDelta.current += deltaX;
    if (frame.current === null) frame.current = window.requestAnimationFrame(flushResize);
  }

  function handlePointerEnd(event: PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    dragging.current = false;
    flushResize();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsDragging(false);
    onResizeEnd?.();
  }

  return (
    <div
      aria-label={label}
      className={`resize-handle ${className} ${isDragging ? "dragging" : ""}`}
      onDoubleClick={onReset}
      onLostPointerCapture={() => { if (!dragging.current) return; dragging.current = false; flushResize(); setIsDragging(false); onResizeEnd?.(); }}
      onPointerCancel={handlePointerEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      role="separator"
    />
  );
}
