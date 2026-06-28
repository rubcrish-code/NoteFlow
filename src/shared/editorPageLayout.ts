export const EDITOR_CONTENT_DEFAULT_WIDTH = 840;
export const EDITOR_CONTENT_MIN_WIDTH = 560;
export const EDITOR_CONTENT_MAX_WIDTH = 1440;
export const EDITOR_CONTENT_DEFAULT_OFFSET = 0;
export const EDITOR_CONTENT_MAX_OFFSET = 720;
export const EDITOR_CONTENT_MIN_INTERACTIVE_WIDTH = 280;

export interface EditorPageLayoutSettings {
  editorContentOffset: number;
  editorContentWidth: number;
}

export function clampEditorContentWidth(value: number) {
  if (!Number.isFinite(value)) {
    return EDITOR_CONTENT_DEFAULT_WIDTH;
  }

  return Math.min(EDITOR_CONTENT_MAX_WIDTH, Math.max(EDITOR_CONTENT_MIN_WIDTH, Math.round(value)));
}

export function clampEditorContentOffset(value: number) {
  if (!Number.isFinite(value)) {
    return EDITOR_CONTENT_DEFAULT_OFFSET;
  }

  return Math.min(EDITOR_CONTENT_MAX_OFFSET, Math.max(-EDITOR_CONTENT_MAX_OFFSET, Math.round(value)));
}

export function getDefaultEditorPageLayout(): EditorPageLayoutSettings {
  return {
    editorContentOffset: EDITOR_CONTENT_DEFAULT_OFFSET,
    editorContentWidth: EDITOR_CONTENT_DEFAULT_WIDTH,
  };
}
