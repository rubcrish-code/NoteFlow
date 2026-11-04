import { translate, useInterfaceLanguage } from "../../shared/i18n";
import { useState, type FormEvent } from "react";
import { Icon } from "../../shared/Icon";

export type EditorCommandPopoverMode = "color" | "highlight" | "image" | "link" | "table";

export type EditorCommandSubmit =
  | { mode: "color"; color: string | null }
  | { mode: "highlight"; color: string | null }
  | { mode: "image"; alt: string; src: string }
  | { mode: "link"; href: string; text: string }
  | { mode: "table"; cols: number; rows: number };

interface EditorCommandPopoverProps {
  onChooseNote?: () => void;
  onCopyFragment?: () => void;
  currentColor?: string;
  initialText?: string;
  initialHref?: string;
  mode: EditorCommandPopoverMode;
  onClose: () => void;
  onSubmit: (value: EditorCommandSubmit) => void;
}

const palette = [
  "#3b6ef2",
  "#5a85ff",
  "#2f80ed",
  "#1e9e6f",
  "#2f9e44",
  "#73a942",
  "#7b61ff",
  "#8f6ed5",
  "#9b5de5",
  "#d97706",
  "#e09f3e",
  "#c77d2b",
  "#e54888",
  "#d6336c",
  "#b56576",
  "#111827",
  "#374151",
  "#6b7280",
  "#8b5e34",
  "#a47148",
  "#64748b",
  "#0f766e",
  "#9333ea",
  "#f6d365",
];

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeColor(value: string) {
  const trimmedValue = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmedValue) ? trimmedValue : "#3b6ef2";
}

export function EditorCommandPopover({ onChooseNote, onCopyFragment, currentColor, initialHref = "", initialText = "", mode, onClose, onSubmit }: EditorCommandPopoverProps) {
  useInterfaceLanguage();
  const [href, setHref] = useState(initialHref);
  const [linkText, setLinkText] = useState(initialText);
  const [imageSrc, setImageSrc] = useState("");
  const [imageAlt, setImageAlt] = useState("");
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  const [color, setColor] = useState(mode === "highlight" ? "#f6d365" : "#3b6ef2");

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (mode === "link") {
      const nextHref = href.trim();
      if (!nextHref) {
        return;
      }
      onSubmit({ mode, href: nextHref, text: linkText.trim() });
      return;
    }

    if (mode === "image") {
      const nextSrc = imageSrc.trim();
      if (!nextSrc) {
        return;
      }
      onSubmit({ mode, alt: imageAlt.trim(), src: nextSrc });
      return;
    }

    if (mode === "table") {
      onSubmit({ mode, cols: clampNumber(cols, 2, 8), rows: clampNumber(rows, 2, 8) });
      return;
    }

    const normalizedColor = normalizeColor(color);
    onSubmit({ mode, color: normalizedColor });
  }

  return (
    <form className="editor-command-popover" onSubmit={submitForm}>
      <div className="editor-command-head">
        <b>{getTitle(mode)}</b>
        <button aria-label={translate("ui.a7a4033657e8")} className="editor-popover-close" onClick={onClose} type="button">
          <Icon name="x" />
        </button>
      </div>

      {mode === "link" ? (
        <>
          {onChooseNote ? <button className="secondary-btn" onClick={onChooseNote} type="button"><Icon name="doc" />{translate("ui.33b49d4149c0")}</button> : null}
          {onCopyFragment ? <button className="ghost-btn" onClick={onCopyFragment} type="button"><Icon name="copy" />{translate("ui.b2352ddb98f5")}</button> : null}
          <label>
            <span>{translate("ui.3091aca226ef")}</span>
            <input autoFocus onChange={(event) => setLinkText(event.target.value)} placeholder={translate("ui.f2ea6e9492de")} type="text" value={linkText} />
          </label>
          <label>
            <span>URL</span>
            <input onChange={(event) => setHref(event.target.value)} placeholder="https://example.com" type="url" value={href} />
          </label>
        </>
      ) : null}

      {mode === "image" ? (
        <>
          <label>
            <span>{translate("ui.56e46960c104")}</span>
            <input autoFocus onChange={(event) => setImageSrc(event.target.value)} placeholder="https://example.com/image.png" type="text" value={imageSrc} />
          </label>
          <label>
            <span>Alt</span>
            <input onChange={(event) => setImageAlt(event.target.value)} placeholder={translate("ui.af89df2ede7d")} type="text" value={imageAlt} />
          </label>
        </>
      ) : null}

      {mode === "table" ? (
        <div className="editor-table-grid">
          <label>
            <span>{translate("ui.72d3703590fe")}</span>
            <input autoFocus max={8} min={2} onChange={(event) => setRows(Number(event.target.value))} type="number" value={rows} />
          </label>
          <label>
            <span>{translate("ui.b3112872372c")}</span>
            <input max={8} min={2} onChange={(event) => setCols(Number(event.target.value))} type="number" value={cols} />
          </label>
        </div>
      ) : null}

      {mode === "color" || mode === "highlight" ? (
        <>
          <button
            className="editor-reset-row"
            onClick={() => onSubmit({ mode, color: null })}
            type="button"
          >
            {mode === "color" ? translate("ui.f6956a1ef744") : translate("ui.fa9b00418eb9")}
          </button>
          <div className="editor-color-grid">
            {palette.map((paletteColor) => (
              <button
                aria-label={paletteColor}
                className={currentColor?.toLowerCase() === paletteColor.toLowerCase() || normalizeColor(color).toLowerCase() === paletteColor.toLowerCase() ? "active" : ""}
                key={paletteColor}
                onClick={() => onSubmit({ mode, color: paletteColor })}
                style={{ backgroundColor: paletteColor }}
                type="button"
              />
            ))}
          </div>
          <label>
            <span>HEX</span>
            <input autoFocus onChange={(event) => setColor(event.target.value)} pattern="#[0-9a-fA-F]{6}" type="text" value={color} />
          </label>
        </>
      ) : null}

      <div className="editor-command-actions">
        <button className="secondary-btn" onClick={onClose} type="button">
          {translate("ui.8fbe9b75cbdf")}</button>
        <button className="primary-btn" type="submit">
          {translate("ui.e15f960d93eb")}</button>
      </div>
    </form>
  );
}

function getTitle(mode: EditorCommandPopoverMode) {
  if (mode === "color") {
    return translate("ui.d76a10ce552f");
  }
  if (mode === "highlight") {
    return translate("ui.985936f581a1");
  }
  if (mode === "image") {
    return translate("ui.e5f534734c36");
  }
  if (mode === "table") {
    return translate("ui.b7f18dd0a994");
  }
  return translate("ui.4c34086988aa");
}
