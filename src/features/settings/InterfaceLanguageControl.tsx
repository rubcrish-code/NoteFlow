import { useId } from "react";
import type { AppLanguage } from "../../app/types";

interface InterfaceLanguageControlProps {
  language: AppLanguage;
  labelledBy: string;
  onChange?: (language: AppLanguage) => void;
}

export function InterfaceLanguageControl({ language, labelledBy, onChange }: InterfaceLanguageControlProps) {
  const name = useId();
  return (
    <div aria-labelledby={labelledBy} className="interface-language-control" data-language={language} id="interface-language" role="radiogroup">
      {(["ru", "en"] as const).map((value) => (
        <label className="interface-language-segment" key={value}>
          <input checked={language === value} lang={value} name={name} onChange={() => onChange?.(value)} type="radio" value={value} />
          <span lang={value}>{value === "ru" ? "Русский" : "English"}</span>
        </label>
      ))}
    </div>
  );
}
