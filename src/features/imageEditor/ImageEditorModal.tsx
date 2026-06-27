import { useEffect } from "react";
import { Icon } from "../../shared/Icon";
import { ImageAnnotationCanvas } from "./ImageAnnotationCanvas";
import { ImageCropTool } from "./ImageCropTool";
import type { ImageEditMode } from "./imageEditService";

interface ImageEditorModalProps {
  mode: ImageEditMode;
  src: string;
  title: string;
  onApply: (dataUrl: string, mode: ImageEditMode) => void;
  onClose: () => void;
}

const modeTitle: Record<ImageEditMode, string> = {
  crop: "Обрезка изображения",
  draw: "Рисование и аннотации",
};

export function ImageEditorModal({ mode, src, title, onApply, onClose }: ImageEditorModalProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose]);

  return (
    <div className="image-editor-backdrop" role="presentation">
      <section aria-label={modeTitle[mode]} className="image-editor-modal" role="dialog">
        <div className="image-editor-head">
          <div>
            <b>{modeTitle[mode]}</b>
            <span>{title || "Изображение в заметке"}</span>
          </div>
          <button aria-label="Закрыть" className="editor-popover-close" onClick={onClose} type="button">
            <Icon name="x" />
          </button>
        </div>

        {mode === "crop" ? <ImageCropTool src={src} onApply={(dataUrl) => onApply(dataUrl, mode)} /> : null}
        {mode === "draw" ? <ImageAnnotationCanvas src={src} onApply={(dataUrl) => onApply(dataUrl, mode)} /> : null}

        <div className="image-editor-footer">
          <button className="secondary-btn" onClick={onClose} type="button">
            Отмена
          </button>
        </div>
      </section>
    </div>
  );
}
