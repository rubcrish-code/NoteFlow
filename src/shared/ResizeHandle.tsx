import { useRef, useState, type PointerEvent } from "react";

interface ResizeHandleProps {
  className?: string;
  label: string;
  onResize: (deltaX: number) => void;
  onReset?: () => void;
}

export function ResizeHandle({ className = "", label, onResize, onReset }: ResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false);
  const lastClientX = useRef(0);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    lastClientX.current = event.clientX;
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!isDragging) {
      return;
    }

    const deltaX = event.clientX - lastClientX.current;
    lastClientX.current = event.clientX;
    onResize(deltaX);
  }

  function handlePointerEnd(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsDragging(false);
  }

  return (
    <div
      aria-label={label}
      className={`resize-handle ${className} ${isDragging ? "dragging" : ""}`}
      onDoubleClick={onReset}
      onPointerCancel={handlePointerEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      role="separator"
    />
  );
}
