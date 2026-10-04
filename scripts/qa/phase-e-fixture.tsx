import { useState } from "react";
import { createRoot } from "react-dom/client";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { HeadingAnchors } from "../../src/features/editor/headingAnchors";
import { NoteOutline } from "../../src/features/editor/NoteOutline";
import { NoteExportDialog } from "../../src/features/export/NoteExportDialog";
import { AppZoomProvider } from "../../src/shared/AppZoomContext";
import "../../src/styles/tokens.css";
import "../../src/styles/app.css";
import "../../src/styles/foundation.css";
import "../../src/styles/editor.css";
import "../../src/styles/pages.css";
import "../../src/styles/settings.css";

document.documentElement.dataset.theme = new URLSearchParams(location.search).get("theme") ?? "light";
function Fixture() {
  const [open, setOpen] = useState(false);
  const editor = useEditor({ extensions: [StarterKit, HeadingAnchors], content: "<h1>Документация API</h1><h2>Очень длинный заголовок для проверки переноса и узкого окна приложения</h2><h3>Вложенный раздел</h3><h2>Результаты</h2><h2>Результаты</h2><p>Съешь ещё этих мягких французских булок.</p>" });
  return <AppZoomProvider zoomPercent={100}><div className="editor-area"><header className="editor-head"><button className="secondary-btn" onClick={() => setOpen(true)}>Экспортировать</button><NoteOutline editor={editor} /></header><main className="editor-content"><EditorContent editor={editor} /></main>{open ? <NoteExportDialog onClose={() => setOpen(false)} onExport={async () => {}} /> : null}</div></AppZoomProvider>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
