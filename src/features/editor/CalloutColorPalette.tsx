import type { RefObject } from "react";
import { Icon } from "../../shared/Icon";
import { MenuPopover } from "../../shared/MenuPopover";
import type { CalloutVariant } from "./customExtensions";

const variants: Array<{ label: string; value: CalloutVariant }> = [
  { label: "Синяя", value: "info" }, { label: "Зелёная", value: "tip" },
  { label: "Жёлтая", value: "warning" }, { label: "Красная", value: "important" },
];
interface CalloutColorPaletteProps {
  anchorRef: RefObject<HTMLButtonElement | null>;
  isOpen: boolean;
  value: CalloutVariant;
  onChoose: (variant: CalloutVariant) => void;
  onClose: () => void;
}

export function CalloutColorPalette({ anchorRef, isOpen, value, onChoose, onClose }: CalloutColorPaletteProps) {
  return <MenuPopover anchorRef={anchorRef} isOpen={isOpen} onClose={onClose} ariaLabel="Цвет выноски" className="callout-color-palette" preferredWidth={260}>
    <div data-callout-palette="true">
      <div className="calendar-caption-title">Цвет выноски</div>
      <div className="callout-palette-grid">
        {variants.map((variant) => <button aria-label={`${variant.label} выноска`} aria-checked={value === variant.value} role="menuitemradio"
          className={`callout-preview ${variant.value}`} key={variant.value} type="button" onClick={() => onChoose(variant.value)}>
          <Icon name="callout" /><span>{variant.label}</span>{value === variant.value ? <Icon name="check" /> : <span className="callout-check-space" />}
        </button>)}
      </div>
    </div>
  </MenuPopover>;
}
