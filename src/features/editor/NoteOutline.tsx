import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import type { Transaction } from "@tiptap/pm/state";
import { Icon } from "../../shared/Icon";
import { MenuPopover } from "../../shared/MenuPopover";
import { noteHeadings, scrollToNoteHeading, type NoteHeading } from "./headingAnchors";

export function NoteOutline({ editor }: { editor: Editor | null }) {
  const [open, setOpen] = useState(false);
  const [headings, setHeadings] = useState<NoteHeading[]>([]);
  const anchor = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    if (!editor) return;
    const update = () => setHeadings(noteHeadings(editor.state.doc));
    update();
    const onTransaction = ({ transaction }: { transaction: Transaction }) => { if (transaction.docChanged) update(); };
    editor.on("transaction", onTransaction);
    return () => { editor.off("transaction", onTransaction); };
  }, [editor]);
  return <>
    <button aria-label="Оглавление" aria-expanded={open} aria-haspopup="menu" className="ibtn" data-tooltip="Оглавление" onClick={() => setOpen((value) => !value)} ref={anchor} type="button"><Icon name="ul" /></button>
    <MenuPopover anchorRef={anchor} ariaLabel="Оглавление" className="note-outline" isOpen={open} onClose={close} preferredWidth={320}>
      <div className="note-outline-title">Оглавление</div>
      {headings.length ? headings.map((heading) => <button className={`note-outline-level-${heading.level}`} key={heading.id} onClick={() => { if (editor) scrollToNoteHeading(editor.view, heading.id); close(); }} role="menuitem" type="button">{heading.text || "Без названия"}</button>) : <p className="note-outline-empty">В заметке пока нет заголовков.</p>}
    </MenuPopover>
  </>;
}
