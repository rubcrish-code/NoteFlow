import { translate, useInterfaceLanguage } from "../../shared/i18n";
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { Editor } from "@tiptap/react";
import type { NoteAttachment } from "../../app/types";
import { Icon, type IconName } from "../../shared/Icon";
import { DatePicker, todayIsoDate, type DatePickerHandle } from "../../shared/DatePicker";
import { attachmentErrorMessage, attachmentLimitLabel, getAttachmentPolicy, imageFormatsLabel, type AttachmentPolicy } from "../../services/attachmentPolicy";
import type { CalloutVariant } from "./customExtensions";
import { CalloutColorPalette } from "./CalloutColorPalette";

type SimpleBlockCommand =
  | "callout"
  | "details"
  | "divider"
  | "table";

interface BlockInsertMenuProps {
  editTarget: EditorInsertTarget | null;
  editor: Editor | null;
  onClose: () => void;
  onCreateDrawing?: () => void;
  onPickAndStoreAttachment: (kind: "file" | "image") => Promise<{ attachment: NoteAttachment; sizeLabel: string } | null>;
  onToast: (message: string) => void;
  selection: EditorInsertSelection | null;
}

export interface EditorInsertSelection {
  from: number;
  to: number;
}

export type EditorInsertTarget = { kind: "date"; position: number; value: string };

interface BlockMenuItem {
  command: SimpleBlockCommand;
  icon: IconName;
  title: string;
  description: string;
}

const blockMenuItems: BlockMenuItem[] = [
  { command: "table", icon: "table", get title() { return translate("ui.b7f18dd0a994"); }, get description() { return translate("ui.5c04b0fb6fd8"); } },
  { command: "callout", icon: "callout", get title() { return translate("ui.6c1806f71e88"); }, get description() { return translate("ui.e4d5236c8399"); } },
  { command: "details", icon: "toggle", get title() { return translate("ui.0145c4fcdb4f"); }, description: "Summary/details" },
  { command: "divider", icon: "divider", get title() { return translate("ui.0b25285709bc"); }, get description() { return translate("ui.661f5fc2dfb1"); } },
];

function getTodayIsoDate() {
  return todayIsoDate();
}

function formatFileSize(size: number) {
  if (size < 1024) {
    return translate("ui.9603c035f8bf", { p0: size });
  }
  if (size < 1024 * 1024) {
    return translate("ui.a949d23a8402", { p0: Math.round(size / 1024) });
  }
  return translate("ui.fb360df45f73", { p0: (size / 1024 / 1024).toFixed(1) });
}

export function BlockInsertMenu({ editTarget, editor, onClose, onCreateDrawing, onPickAndStoreAttachment, onToast, selection }: BlockInsertMenuProps) {
  useInterfaceLanguage();
  const [dateDraft, setDateDraft] = useState(editTarget?.kind === "date" ? editTarget.value : getTodayIsoDate());
  const [insertError, setInsertError] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(editTarget?.kind === "date");
  const calendarOpenRef = useRef(false);
  calendarOpenRef.current = calendarOpen;
  const [calloutOpen, setCalloutOpen] = useState(false);
  const calloutOpenRef = useRef(false);
  calloutOpenRef.current = calloutOpen;
  const calloutAnchorRef = useRef<HTMLButtonElement>(null);
  const datePickerRef = useRef<DatePickerHandle>(null);
  const [mediaKind, setMediaKind] = useState<"image" | "file" | null>(null);
  const [policy, setPolicy] = useState<AttachmentPolicy | null>(null);
  const [policyError, setPolicyError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const uploadingRef = useRef(false);
  const originalDocumentRef = useRef(editor?.state.doc);

  useEffect(() => {
    if (!mediaKind || policy) return;
    let active = true;
    setPolicyError(false);
    void getAttachmentPolicy().then((value) => { if (active) setPolicy(value); }).catch(() => { if (active) setPolicyError(true); });
    return () => { active = false; };
  }, [mediaKind, policy]);

  useEffect(() => {
    if (editTarget?.kind === "date") {
      setDateDraft(editTarget.value);
    }
    setInsertError("");
  }, [editTarget]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target;
      if (uploadingRef.current || (target instanceof Element && target.closest("[data-date-picker], .date-caption-popover, .callout-color-palette"))) return;
      if (target instanceof Node && menuRef.current && !menuRef.current.contains(target)) {
        onClose();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (calendarOpenRef.current) { event.stopPropagation(); datePickerRef.current?.dismissTopLayer(); return; }
        if (calloutOpenRef.current) { event.stopPropagation(); setCalloutOpen(false); calloutAnchorRef.current?.focus(); return; }
        if (uploadingRef.current) return;
        event.stopPropagation();
        onClose();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [onClose]);

  function runSimpleCommand(command: SimpleBlockCommand) {
    if (!editor) {
      return;
    }

    if (command === "callout") { setCalloutOpen((open) => !open); return; }
    const chain = restoreInsertionSelection();
    if (!chain) return;
    if (command === "table") {
      chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    }
    if (command === "details") {
      chain.insertDetailsBlock().run();
    }
    if (command === "divider") {
      chain.setHorizontalRule().run();
    }

    onClose();
  }

  async function insertImage() {
    if (!editor || uploadingRef.current) {
      return;
    }

    uploadingRef.current = true; setUploading(true); setInsertError("");
    try {
      const stored = await onPickAndStoreAttachment("image");
      if (!stored?.attachment.assetUri) {
        return;
      }
      if (editor.isDestroyed || !originalDocumentRef.current?.eq(editor.state.doc)) throw new Error("document changed");
      const imageAttrs = {
        alt: stored.attachment.originalName,
        attachmentId: stored.attachment.id,
        originalAttachmentId: stored.attachment.id,
        originalSrc: stored.attachment.assetUri,
        src: stored.attachment.assetUri,
        title: stored.attachment.originalName,
      };
      restoreInsertionSelection()
        ?.setImage(imageAttrs)
        .run();
      onToast(translate("ui.29260c2eb9c4"));
      onClose();
    } catch (error) { setInsertError(attachmentErrorMessage(error, "image", policy)); }
    finally { uploadingRef.current = false; setUploading(false); }
  }

  async function insertFile() {
    if (!editor || uploadingRef.current) {
      return;
    }

    uploadingRef.current = true; setUploading(true); setInsertError("");
    try {
      const stored = await onPickAndStoreAttachment("file");
      if (!stored) {
        return;
      }
      if (editor.isDestroyed || !originalDocumentRef.current?.eq(editor.state.doc)) throw new Error("document changed");
      restoreInsertionSelection()
        ?.insertFileAttachment({
          name: stored.attachment.originalName,
          size: stored.sizeLabel || formatFileSize(stored.attachment.sizeBytes),
          storageId: stored.attachment.id,
          type: stored.attachment.mimeType || "file",
        })
        .run();
      onToast(translate("ui.e062d650340e"));
      onClose();
    } catch (error) { setInsertError(attachmentErrorMessage(error, "file", policy)); }
    finally { uploadingRef.current = false; setUploading(false); }
  }

  function restoreInsertionSelection() {
    if (!editor || editTarget || !selection) {
      return editor?.chain().focus();
    }
    const maxPosition = editor.state.doc.content.size;
    return editor
      .chain()
      .focus()
      .setTextSelection({
        from: Math.min(selection.from, maxPosition),
        to: Math.min(selection.to, maxPosition),
      });
  }

  function insertDate() {
    const value = dateDraft.trim();
    if (!editor || !value) {
      return;
    }
    setInsertError("");
    const didRun = editTarget?.kind === "date"
      ? editor
          .chain()
          .focus()
          .setNodeSelection(editTarget.position)
          .updateAttributes("inlineDate", { value })
          .setTextSelection(Math.min(editTarget.position + 1, editor.state.doc.content.size))
          .run()
      : restoreInsertionSelection()?.insertInlineDate({ value }).run() ?? false;
    if (didRun) {
      onClose();
    } else {
      setInsertError(translate("ui.0f6c87b69df3"));
    }
  }

  function preserveEditorSelection(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault();
  }

  function insertCalloutVariant(variant: CalloutVariant) {
    if (!editor) {
      return;
    }
    const chain = restoreInsertionSelection();
    if (editor.isActive("callout")) chain?.updateAttributes("callout", { variant }).run();
    else chain?.insertCallout({ variant }).run();
    onClose();
  }

  return (
    <div className="block-insert-menu" ref={menuRef} role="dialog">
      <div className="block-menu-head">
        <div>
          <b>{translate("ui.08bf11b3a0e2")}</b>
          <span>{translate("ui.2b8c6baaf711")}</span>
        </div>
        <button aria-label={translate("ui.a7a4033657e8")} className="editor-popover-close" onClick={onClose} type="button">
          <Icon name="x" />
        </button>
      </div>

      <div className="block-menu-grid block-menu-tools">
        {blockMenuItems.map((item) => (
          <button className="block-menu-item" key={item.command} ref={item.command === "callout" ? calloutAnchorRef : undefined}
            aria-expanded={item.command === "callout" ? calloutOpen : undefined} aria-haspopup={item.command === "callout" ? "menu" : undefined}
            onClick={() => runSimpleCommand(item.command)} type="button">
            <Icon name={item.icon} />
            <span>
              <b>{item.title}</b>
              <small>{item.description}</small>
            </span>
          </button>
        ))}
        <button className="block-menu-item" onClick={() => setMediaKind(mediaKind === "image" ? null : "image")} type="button">
          <Icon name="image" />
          <span>
            <b>{translate("ui.e5f534734c36")}</b>
            <small>{translate("ui.c60aba128bca")}</small>
          </span>
        </button>
        <button className="block-menu-item" onClick={() => setMediaKind(mediaKind === "file" ? null : "file")} type="button">
          <Icon name="attach" />
          <span>
            <b>{translate("ui.f242456b2273")}</b>
            <small>{translate("ui.f2a11b7d6f97")}</small>
          </span>
        </button>
        {onCreateDrawing ? <button className="block-menu-item" onClick={onCreateDrawing} type="button"><Icon name="image" /><span><b>{translate("ui.7d6d80bc3805")}</b><small>{translate("ui.eff1b9d83152")}</small></span></button> : null}
        <button className="block-menu-item" aria-expanded={dateOpen} onClick={() => setDateOpen((open) => !open)} type="button"><Icon name="date" /><span><b>{translate("ui.e536b5680a22")}</b><small>{translate("ui.c7cdb352607c")}</small></span></button>
      </div>

      {mediaKind ? <div className="block-media-requirements">
        {policy ? <>
          <p>{mediaKind === "image" ? translate("ui.b5123f825832", { p0: imageFormatsLabel(policy) }) : translate("ui.2ff0c5e4e07e")}</p>
          <p>{translate("ui.398adbb0e215") + " "}{attachmentLimitLabel(mediaKind === "image" ? policy.maxImageBytes : policy.maxFileBytes)}{translate("ui.14baebd52bd6")}</p>
          <button className="primary-btn" disabled={uploading} onClick={() => void (mediaKind === "image" ? insertImage() : insertFile())} type="button">{uploading ? translate("ui.5637cb987056") : translate("ui.e3663341c82c")}</button>
        </> : policyError ? <><p role="alert">{translate("ui.30ad9892bd62")}</p><button className="secondary-btn" onClick={() => { setMediaKind(null); }} type="button">{translate("ui.1a9fb1f3cf8e")}</button></> : <p role="status">{translate("ui.2bfc39ed73dd")}</p>}
      </div> : null}

      <CalloutColorPalette anchorRef={calloutAnchorRef} isOpen={calloutOpen} onClose={() => setCalloutOpen(false)}
        value={(editor?.getAttributes("callout").variant as CalloutVariant | undefined) ?? "info"} onChoose={insertCalloutVariant} />

      {dateOpen ? (
        <div className="block-menu-inline">
          <DatePicker ref={datePickerRef} isOpen={calendarOpen} onOpenChange={setCalendarOpen} onChange={setDateDraft} value={dateDraft} />
          <button className="secondary-btn" disabled={!dateDraft.trim()} onClick={insertDate} onMouseDown={preserveEditorSelection} type="button">
            {editTarget?.kind === "date" ? translate("ui.6ab4eb8bcee7") : translate("ui.ec79f4d0c884")}
          </button>
        </div>
      ) : null}


      {insertError ? <div aria-live="polite" className="block-menu-error">{insertError}</div> : null}

    </div>
  );
}
