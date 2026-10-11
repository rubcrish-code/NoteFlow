import { Icon } from "./Icon";

export function InfoHint({ text, label = "Подсказка" }: { text: string; label?: string }) {
  return <span aria-label={`${label}: ${text}`} className="info-hint" data-tooltip={text} tabIndex={0}><Icon name="help" /></span>;
}
