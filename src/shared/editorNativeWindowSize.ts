import { LogicalSize } from "@tauri-apps/api/dpi";

interface EditorNativeWindow {
  isMaximized(): Promise<boolean>;
  isFullscreen(): Promise<boolean>;
  innerSize(): Promise<{ width: number; height: number }>;
  scaleFactor(): Promise<number>;
  setMinSize(size: LogicalSize): Promise<void>;
  setSize(size: LogicalSize): Promise<void>;
}

// Windows can leave maximized mode when programmatic size constraints change.
// Defer both constraints and resizing until the user restores a normal window.
export async function applyEditorWindowMinimum(appWindow: EditorNativeWindow, width: number, current = () => true) {
  const maximized = await appWindow.isMaximized();
  const fullscreen = await appWindow.isFullscreen();
  const size = await appWindow.innerSize();
  const scale = await appWindow.scaleFactor();
  if (!current()) return;
  if (maximized || fullscreen) {
    if (size.width / scale < width) throw new Error("Unsupported editor width");
    return;
  }
  await appWindow.setMinSize(new LogicalSize(width, 700));
  if (current() && size.width / scale < width && !await appWindow.isMaximized() && !await appWindow.isFullscreen()) {
    await appWindow.setSize(new LogicalSize(width, size.height / scale));
  }
}
