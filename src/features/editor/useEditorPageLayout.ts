import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import {
  EDITOR_CONTENT_MAX_WIDTH,
  EDITOR_CONTENT_MIN_INTERACTIVE_WIDTH,
  EDITOR_CONTENT_MIN_WIDTH,
  clampEditorContentOffset,
  clampEditorContentWidth,
  type EditorPageLayoutSettings,
} from "../../shared/editorPageLayout";

type ResizeSide = "left" | "right";

type EditorPageStyle = CSSProperties & {
  "--editor-page-offset": string;
  "--editor-page-width": string;
};

interface ResizeSession {
  containerCenter: number;
  maxRight: number;
  minLeft: number;
  minWidth: number;
  side: ResizeSide;
  startClientX: number;
  startLeft: number;
  startRight: number;
}

interface UseEditorPageLayoutOptions extends EditorPageLayoutSettings {
  onLayoutChange: (layout: EditorPageLayoutSettings) => void;
  onReset: () => void;
}

function readInlineBox(element: HTMLElement) {
  const computedStyle = window.getComputedStyle(element);
  const paddingLeft = Number.parseFloat(computedStyle.paddingLeft) || 0;
  const paddingRight = Number.parseFloat(computedStyle.paddingRight) || 0;
  const width = element.clientWidth;

  return {
    availableWidth: Math.max(0, width - paddingLeft - paddingRight),
    containerCenter: width / 2,
    maxRight: width - paddingRight,
    minLeft: paddingLeft,
  };
}

function getEffectivePageWidth(availableWidth: number, preferredWidth: number) {
  if (availableWidth <= 0) {
    return clampEditorContentWidth(preferredWidth);
  }

  return Math.min(clampEditorContentWidth(preferredWidth), availableWidth);
}

function getMinResizeWidth(availableWidth: number) {
  if (availableWidth <= EDITOR_CONTENT_MIN_INTERACTIVE_WIDTH) {
    return Math.max(0, availableWidth);
  }

  return Math.min(EDITOR_CONTENT_MIN_WIDTH, availableWidth);
}

function clampOffsetToAvailableWidth(offset: number, availableWidth: number, pageWidth: number) {
  const maxOffset = Math.max(0, (availableWidth - pageWidth) / 2);
  return Math.min(maxOffset, Math.max(-maxOffset, clampEditorContentOffset(offset)));
}

function toPageLayout(left: number, right: number, containerCenter: number): EditorPageLayoutSettings {
  const editorContentWidth = clampEditorContentWidth(right - left);
  const editorContentOffset = clampEditorContentOffset((left + right) / 2 - containerCenter);

  return {
    editorContentOffset,
    editorContentWidth,
  };
}

export function useEditorPageLayout({ editorContentOffset, editorContentWidth, onLayoutChange, onReset }: UseEditorPageLayoutOptions) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const resizeSessionRef = useRef<ResizeSession | null>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const [activeSide, setActiveSide] = useState<ResizeSide | null>(null);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element || typeof window === "undefined") {
      return undefined;
    }

    const updateAvailableWidth = () => setAvailableWidth(readInlineBox(element).availableWidth);
    updateAvailableWidth();

    const resizeObserver = new ResizeObserver(updateAvailableWidth);
    resizeObserver.observe(element);
    window.addEventListener("resize", updateAvailableWidth);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateAvailableWidth);
    };
  }, []);

  const effectivePageWidth = getEffectivePageWidth(availableWidth, editorContentWidth);
  const effectiveOffset = clampOffsetToAvailableWidth(editorContentOffset, availableWidth, effectivePageWidth);

  const pageStyle: EditorPageStyle = useMemo(
    () => ({
      "--editor-page-offset": `${effectiveOffset}px`,
      "--editor-page-width": `${effectivePageWidth}px`,
    }),
    [effectiveOffset, effectivePageWidth],
  );

  function startResize(side: ResizeSide, event: ReactPointerEvent<HTMLButtonElement>) {
    const viewportElement = viewportRef.current;
    const pageElement = pageRef.current;
    if (!viewportElement || !pageElement) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    const viewportRect = viewportElement.getBoundingClientRect();
    const pageRect = pageElement.getBoundingClientRect();
    const inlineBox = readInlineBox(viewportElement);

    resizeSessionRef.current = {
      containerCenter: inlineBox.containerCenter,
      maxRight: inlineBox.maxRight,
      minLeft: inlineBox.minLeft,
      minWidth: getMinResizeWidth(inlineBox.availableWidth),
      side,
      startClientX: event.clientX,
      startLeft: pageRect.left - viewportRect.left,
      startRight: pageRect.right - viewportRect.left,
    };
    setActiveSide(side);
  }

  function moveResize(event: ReactPointerEvent<HTMLButtonElement>) {
    const session = resizeSessionRef.current;
    if (!session) {
      return;
    }

    event.preventDefault();
    const deltaX = event.clientX - session.startClientX;
    const maxWidth = Math.max(session.minWidth, Math.min(EDITOR_CONTENT_MAX_WIDTH, session.maxRight - session.minLeft));

    if (session.side === "left") {
      const proposedLeft = Math.min(session.startRight - session.minWidth, Math.max(session.minLeft, session.startLeft + deltaX));
      const width = Math.min(maxWidth, session.startRight - proposedLeft);
      const left = session.startRight - width;
      onLayoutChange(toPageLayout(left, session.startRight, session.containerCenter));
      return;
    }

    const proposedRight = Math.max(session.startLeft + session.minWidth, Math.min(session.maxRight, session.startRight + deltaX));
    const width = Math.min(maxWidth, proposedRight - session.startLeft);
    const right = session.startLeft + width;
    onLayoutChange(toPageLayout(session.startLeft, right, session.containerCenter));
  }

  function endResize(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    resizeSessionRef.current = null;
    setActiveSide(null);
  }

  function buildHandleProps(side: ResizeSide) {
    return {
      "aria-label": side === "left" ? "Изменить левую границу заметки" : "Изменить правую границу заметки",
      className: `editor-page-resize editor-page-resize-${side} ${activeSide === side ? "dragging" : ""}`,
      "data-tooltip": "Потяните, чтобы изменить ширину заметки. Двойной щелчок — сброс",
      onDoubleClick: onReset,
      onPointerCancel: endResize,
      onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => startResize(side, event),
      onPointerMove: moveResize,
      onPointerUp: endResize,
      type: "button" as const,
    };
  }

  return {
    isResizing: activeSide !== null,
    leftHandleProps: buildHandleProps("left"),
    pageRef,
    pageStyle,
    rightHandleProps: buildHandleProps("right"),
    viewportRef,
  };
}
