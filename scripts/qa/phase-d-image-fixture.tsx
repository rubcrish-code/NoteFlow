import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ImageEditorModal } from "../../src/features/imageEditor/ImageEditorModal";
import { DatePicker } from "../../src/shared/DatePicker";
import { CalloutColorPalette } from "../../src/features/editor/CalloutColorPalette";
import type { CalloutVariant } from "../../src/features/editor/customExtensions";
import { NewNoteModal } from "../../src/features/notes/NewNoteModal";
import "../../src/styles/tokens.css";
import "../../src/styles/app.css";
import "../../src/styles/foundation.css";
import "../../src/styles/editor.css";
const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get("theme") ?? "light";
const source = document.createElement("canvas");
source.width = Number(params.get("width") ?? 1200); source.height = Number(params.get("height") ?? 800);
const context = source.getContext("2d")!;
context.fillStyle = "#ff0000"; context.fillRect(0, 0, source.width / 2, source.height);
context.fillStyle = "#00ff00"; context.fillRect(source.width / 2, 0, source.width / 2, source.height);
const initialImage = source.toDataURL("image/png");
function Fixture() {
  const [open, setOpen] = useState(true);
  const [dateOpen, setDateOpen] = useState(false);
  const [date, setDate] = useState("2026-09-22");
  const [result, setResult] = useState("");
  const [calloutOpen, setCalloutOpen] = useState(false);
  const [callout, setCallout] = useState<CalloutVariant>("info");
  const [newNoteOpen, setNewNoteOpen] = useState(false);
  const calloutRef = useRef<HTMLButtonElement>(null);
  return <>
    <button type="button" onClick={() => setOpen(true)}>Редактор</button>
    <DatePicker isOpen={dateOpen} onOpenChange={setDateOpen} onChange={setDate} value={date} />
    <div className="qa-edge-controls">
      <button className="secondary-btn" type="button" onClick={() => setNewNoteOpen(true)}>Новая QA заметка</button>
      <button className="secondary-btn" ref={calloutRef} type="button" onClick={() => setCalloutOpen(true)}>Выноска</button>
    </div>
    <CalloutColorPalette anchorRef={calloutRef} isOpen={calloutOpen} value={callout} onClose={() => setCalloutOpen(false)}
      onChoose={(value) => { setCallout(value); setCalloutOpen(false); }} />
    <NewNoteModal isOpen={newNoteOpen} onClose={() => setNewNoteOpen(false)} onCreate={() => setNewNoteOpen(false)} />
    {result ? <img alt="Результат" id="qa-result" src={result} /> : null}
    {open ? <ImageEditorModal mode="crop" src={result || (params.has("blank") ? "" : initialImage)} title="Phase D fixture"
      onClose={() => setOpen(false)} onApply={(dataUrl) => { setResult(dataUrl); }} /> : null}
  </>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
