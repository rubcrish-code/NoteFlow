import { translate, useInterfaceLanguage } from "../../shared/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import type { Transaction } from "@tiptap/pm/state";
import { Icon } from "../../shared/Icon";
import { MenuPopover } from "../../shared/MenuPopover";
import { noteHeadings, scrollToNoteHeading, type NoteHeading } from "./headingAnchors";

export function NoteOutline({ editor }: { editor: Editor | null }) {
  useInterfaceLanguage();
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
    <button aria-label={translate("ui.33dcbaec8fb2")} aria-expanded={open} aria-haspopup="menu" className="ibtn" data-tooltip={translate("ui.33dcbaec8fb2")} onClick={() => setOpen((value) => !value)} ref={anchor} type="button"><Icon name="ul" /></button>
    <MenuPopover anchorRef={anchor} ariaLabel={translate("ui.33dcbaec8fb2")} className="note-outline" isOpen={open} onClose={close} preferredWidth={320}>
      <div className="note-outline-title">{translate("ui.33dcbaec8fb2")}</div>
      {headings.length ? headings.map((heading) => <button className={`note-outline-level-${heading.level}`} key={heading.id} onClick={() => { if (editor) scrollToNoteHeading(editor.view, heading.id); close(); }} role="menuitem" type="button">{heading.text || translate("ui.f5db3a12b79c")}</button>) : <p className="note-outline-empty">{translate("ui.4a72b8212839")}</p>}
    </MenuPopover>
  </>;
}
