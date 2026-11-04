import { translate, useInterfaceLanguage } from "../../shared/i18n";
import type { RefObject } from "react";
import { Icon } from "../../shared/Icon";
import { MenuPopover } from "../../shared/MenuPopover";
import type { CalloutVariant } from "./customExtensions";

const variants: Array<{ label: string; value: CalloutVariant }> = [
  { get label() { return translate("ui.340c1f4e274c"); }, value: "info" }, { get label() { return translate("ui.c481e75b9097"); }, value: "tip" },
  { get label() { return translate("ui.5e2b2f24b0a1"); }, value: "warning" }, { get label() { return translate("ui.9380138b459f"); }, value: "important" },
];
interface CalloutColorPaletteProps {
  anchorRef: RefObject<HTMLButtonElement | null>;
  isOpen: boolean;
  value: CalloutVariant;
  onChoose: (variant: CalloutVariant) => void;
  onClose: () => void;
}

export function CalloutColorPalette({ anchorRef, isOpen, value, onChoose, onClose }: CalloutColorPaletteProps) {
  useInterfaceLanguage();
  return <MenuPopover anchorRef={anchorRef} isOpen={isOpen} onClose={onClose} ariaLabel={translate("ui.a6e2d0369840")} className="callout-color-palette" preferredWidth={260}>
    <div data-callout-palette="true">
      <div className="calendar-caption-title">{translate("ui.a6e2d0369840")}</div>
      <div className="callout-palette-grid">
        {variants.map((variant) => <button aria-label={translate("ui.17597c7cfa04", { p0: variant.label })} aria-checked={value === variant.value} role="menuitemradio"
          className={`callout-preview ${variant.value}`} key={variant.value} type="button" onClick={() => onChoose(variant.value)}>
          <Icon name="callout" /><span>{variant.label}</span>{value === variant.value ? <Icon name="check" /> : <span className="callout-check-space" />}
        </button>)}
      </div>
    </div>
  </MenuPopover>;
}
