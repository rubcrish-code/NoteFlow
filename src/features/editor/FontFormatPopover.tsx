import { translate, useInterfaceLanguage } from "../../shared/i18n";
import type { CSSProperties, MouseEvent, RefObject } from "react";
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
  popoverRef?: RefObject<HTMLDivElement | null>;
  style?: CSSProperties;
}

export function FontFormatPopover({
  draft,
  onApply,
  onCancel,
  onChange,
  onReset,
  popoverRef,
  style,
}: FontFormatPopoverProps) {
  useInterfaceLanguage();
  const currentFontLabel = getFontFamilyLabel(draft.fontFamily);
  const currentSizeLabel = draft.fontSize || translate("ui.fe7ef244bbd0");

  function updateDraft(nextDraft: Partial<FontFormatDraft>) {
    onChange({ ...draft, ...nextDraft });
  }

  return (
    <div aria-label={translate("ui.fc69eed57334")} className="font-format-popover" ref={popoverRef} role="dialog" style={style}>
      <div className="font-popover-head">
        <div>
          <b>{translate("ui.9161c26f391b")}</b>
          <span>
            {currentFontLabel} · {currentSizeLabel}
          </span>
        </div>
        <button aria-label={translate("ui.a7a4033657e8")} className="editor-popover-close" onClick={onCancel} onMouseDown={preventMouseFocus} type="button">
          <Icon name="x" />
        </button>
      </div>

      <div className="font-popover-section">
        <div className="font-popover-sec">{translate("ui.09afe00f0a23")}</div>
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
        <div className="font-popover-sec">{translate("ui.d541bc04bcf7")}</div>
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
          {translate("ui.407f871778d3")}</button>
        <button className="font-action secondary" onClick={onCancel} onMouseDown={preventMouseFocus} type="button">
          {translate("ui.8fbe9b75cbdf")}</button>
        <button className="font-action primary" onClick={onApply} onMouseDown={preventMouseFocus} type="button">
          {translate("ui.e15f960d93eb")}</button>
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
  useInterfaceLanguage();
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
