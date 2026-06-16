import type { MouseEvent } from "react";
import { Icon } from "../../shared/Icon";
import {
  fontFamilyOptions,
  fontSizeOptions,
  getFontFamilyLabel,
  type FontFamilyOption,
} from "./fontFormatOptions";

export interface FontFormatDraft {
  fontFamily: string;
  fontSize: string;
}

interface FontFormatPopoverProps {
  draft: FontFormatDraft;
  onApply: () => void;
  onCancel: () => void;
  onChange: (draft: FontFormatDraft) => void;
  onReset: () => void;
}

export function FontFormatPopover({
  draft,
  onApply,
  onCancel,
  onChange,
  onReset,
}: FontFormatPopoverProps) {
  const currentFontLabel = getFontFamilyLabel(draft.fontFamily);
  const currentSizeLabel = draft.fontSize || "по умолчанию";

  function updateDraft(nextDraft: Partial<FontFormatDraft>) {
    onChange({ ...draft, ...nextDraft });
  }

  return (
    <div aria-label="Шрифт и размер текста" className="font-format-popover" role="dialog">
      <div className="font-popover-head">
        <div>
          <b>Шрифт и размер</b>
          <span>
            {currentFontLabel} · {currentSizeLabel}
          </span>
        </div>
        <button aria-label="Закрыть" className="editor-popover-close" onClick={onCancel} onMouseDown={preventMouseFocus} type="button">
          <Icon name="x" />
        </button>
      </div>

      <div className="font-popover-section">
        <div className="font-popover-sec">ШРИФТ</div>
        <div className="font-family-list">
          {fontFamilyOptions.map((option) => (
            <FontFamilyButton
              isActive={draft.fontFamily === option.value}
              key={option.label}
              option={option}
              onSelect={() => updateDraft({ fontFamily: option.value })}
            />
          ))}
        </div>
      </div>

      <div className="font-popover-section">
        <div className="font-popover-sec">РАЗМЕР</div>
        <div className="font-size-grid">
          {fontSizeOptions.map((size) => (
            <button
              aria-pressed={draft.fontSize === size}
              className={`font-size-choice ${draft.fontSize === size ? "active" : ""}`}
              key={size}
              onClick={() => updateDraft({ fontSize: size })}
              onMouseDown={preventMouseFocus}
              type="button"
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      <div className="font-popover-actions">
        <button className="font-action reset" onClick={onReset} onMouseDown={preventMouseFocus} type="button">
          Сбросить
        </button>
        <button className="font-action secondary" onClick={onCancel} onMouseDown={preventMouseFocus} type="button">
          Отмена
        </button>
        <button className="font-action primary" onClick={onApply} onMouseDown={preventMouseFocus} type="button">
          Применить
        </button>
      </div>
    </div>
  );
}

interface FontFamilyButtonProps {
  isActive: boolean;
  onSelect: () => void;
  option: FontFamilyOption;
}

function FontFamilyButton({ isActive, onSelect, option }: FontFamilyButtonProps) {
  return (
    <button
      aria-pressed={isActive}
      className={`font-family-choice ${isActive ? "active" : ""}`}
      onClick={onSelect}
      onMouseDown={preventMouseFocus}
      style={{ fontFamily: option.preview }}
      type="button"
    >
      <span className="font-choice-check">{isActive ? <Icon name="check" /> : null}</span>
      <span>{option.label}</span>
    </button>
  );
}

function preventMouseFocus(event: MouseEvent<HTMLElement>) {
  event.preventDefault();
}
