import { translate, useInterfaceLanguage } from "./i18n";
import { Icon } from "./Icon";

export function InfoHint({ text, label = translate("ui.576077460ea8") }: { text: string; label?: string }) {
  useInterfaceLanguage();
  return <span aria-label={`${label}: ${text}`} className="info-hint" data-tooltip={text} tabIndex={0}><Icon name="help" /></span>;
}
