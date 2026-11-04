import { translate, useInterfaceLanguage } from "../../shared/i18n";
import { useCallback, useMemo, useRef, useState } from "react";
import type { AppSection, TagRow } from "../../app/types";
import { Icon } from "../../shared/Icon";
import { MenuPopover } from "../../shared/MenuPopover";
import { ModalShell } from "../../shared/ModalShell";
import { formatRussianCount, NOTE_COUNT_FORMS } from "../../shared/russianPlural";
import { PageShell, type PageShellSidebarProps } from "../navigation/PageShell";
import { TagEditorModal, type TagEditorValue } from "./TagEditorModal";
import { validateTagName } from "./tagEditor";
import { tagColorStyle } from "./tagPalette";

interface TagsPageProps {
  tags: TagRow[];
  onCreateTag: (value: TagEditorValue) => Promise<void>;
  onDeleteTag: (tagId: string) => void;
  onMergeTags: (sourceTagId: string, targetTagId: string) => Promise<void>;
  onNavigate: (section: AppSection) => void;
  onNewNote: () => void;
  onOpenTag: (tagId: string) => void;
  onToast: (message: string) => void;
  onUpdateTag: (tagId: string, value: TagEditorValue) => Promise<void>;
  sidebar: PageShellSidebarProps;
}

type TagDialogState =
  | { kind: "create"; trigger: HTMLButtonElement | null }
  | { kind: "edit"; tag: TagRow; trigger: HTMLButtonElement | null }
  | { kind: "merge"; tag: TagRow; trigger: HTMLButtonElement | null }
  | null;

export function validateTagRename(tags: TagRow[], sourceTagId: string, draft: string) {
  return validateTagName(tags, sourceTagId, draft);
}

export function TagsPage({ tags, onCreateTag, onDeleteTag, onMergeTags, onNavigate, onNewNote, onOpenTag, onToast, onUpdateTag, sidebar }: TagsPageProps) {
  useInterfaceLanguage();
  const [query, setQuery] = useState("");
  const [openTagMenuId, setOpenTagMenuId] = useState("");
  const [tagDialog, setTagDialog] = useState<TagDialogState>(null);
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [isDialogSaving, setIsDialogSaving] = useState(false);
  const tagMenuAnchorRef = useRef<HTMLButtonElement>(null);
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const closeTagMenu = useCallback(() => setOpenTagMenuId(""), []);

  const filteredTags = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return normalizedQuery ? tags.filter((tag) => tag.name.toLowerCase().includes(normalizedQuery)) : tags;
  }, [query, tags]);

  const mergeTargets = useMemo(
    () => tagDialog?.kind === "merge" ? tags.filter((tag) => tag.id !== tagDialog.tag.id) : [],
    [tagDialog, tags],
  );

  function openCreateDialog() {
    setDialogError("");
    setTagDialog({ kind: "create", trigger: createButtonRef.current });
  }

  function openEditDialog(tag: TagRow) {
    setOpenTagMenuId("");
    setDialogError("");
    setTagDialog({ kind: "edit", tag, trigger: tagMenuAnchorRef.current });
  }

  function openMergeDialog(tag: TagRow) {
    const firstTarget = tags.find((candidate) => candidate.id !== tag.id);
    setOpenTagMenuId("");
    setMergeTargetId(firstTarget?.id ?? "");
    setDialogError("");
    setTagDialog({ kind: "merge", tag, trigger: tagMenuAnchorRef.current });
  }

  function closeTagDialog() {
    const trigger = tagDialog?.trigger;
    setTagDialog(null);
    setDialogError("");
    window.requestAnimationFrame(() => trigger?.focus());
  }

  async function submitMerge() {
    if (tagDialog?.kind !== "merge" || !mergeTargetId || isDialogSaving) return;
    setIsDialogSaving(true);
    try {
      await onMergeTags(tagDialog.tag.id, mergeTargetId);
      closeTagDialog();
    } catch {
      setDialogError(translate("ui.a1298f237e45"));
    } finally {
      setIsDialogSaving(false);
    }
  }

  return (
    <PageShell activeSection="tags" onNavigate={onNavigate} onNewNote={onNewNote} onToast={onToast} sidebar={sidebar}>
      <div className="tags-page-content">
        <div className="tags-head">
          <div>
            <div className="page-title">{translate("ui.a2800083983f")}</div>
            <div className="page-subtitle">{translate("ui.621abaf901ef")}</div>
          </div>
          <button className="primary-btn tags-new" onClick={openCreateDialog} ref={createButtonRef} type="button">
            <Icon name="plus" />
            {translate("ui.764e4b9bd472")}</button>
        </div>

        <label className="search tags-search">
          <Icon name="search" />
          <input onChange={(event) => setQuery(event.currentTarget.value)} placeholder={translate("ui.775e76d19865")} type="search" value={query} />
        </label>

        <div className="tags-table">
          {filteredTags.map((tag) => (
            <div className="tag-row" key={tag.id}>
              <button className="tag-row-main" onClick={() => onOpenTag(tag.id)} type="button">
                <span className={`tag-dot ${tag.color}`} style={tagColorStyle(tag)} />
                <div>
                  <b>{tag.name}</b>
                  <small>{formatRussianCount(tag.count, NOTE_COUNT_FORMS)}</small>
                </div>
              </button>
              <div className="tag-row-actions">
                <button
                  aria-expanded={openTagMenuId === tag.id}
                  aria-haspopup="menu"
                  aria-label={translate("ui.e690ae0fe693", { p0: tag.name })}
                  className="row-menu-trigger"
                  onClick={(event) => {
                    tagMenuAnchorRef.current = event.currentTarget;
                    setOpenTagMenuId((current) => current === tag.id ? "" : tag.id);
                  }}
                  type="button"
                >
                  <Icon name="dots" />
                </button>
                <MenuPopover
                  anchorRef={tagMenuAnchorRef}
                  ariaLabel={translate("ui.e690ae0fe693", { p0: tag.name })}
                  className="row-actions-menu"
                  isOpen={openTagMenuId === tag.id}
                  onClose={closeTagMenu}
                  preferredWidth={190}
                >
                  <button onClick={() => openEditDialog(tag)} role="menuitem" type="button">{translate("ui.59792556fd06")}</button>
                  <button onClick={() => openMergeDialog(tag)} role="menuitem" type="button">{translate("ui.8f27f05ca87a")}</button>
                  <div className="nf-menu-separator" />
                  <button className="danger" onClick={() => { setOpenTagMenuId(""); onDeleteTag(tag.id); }} role="menuitem" type="button">{translate("ui.be99b1361201")}</button>
                </MenuPopover>
              </div>
            </div>
          ))}
          {filteredTags.length === 0 ? (
            <div className="page-empty-state panel-empty-state">
              <span className="page-empty-icon"><Icon name="tag" /></span>
              <div><b>{translate("ui.27b94d452795")}</b><span>{translate("ui.49a30cf35123")}</span></div>
            </div>
          ) : null}
        </div>
      </div>

      {tagDialog?.kind === "create" ? (
        <TagEditorModal mode="create" onClose={closeTagDialog} onSubmit={onCreateTag} open tags={tags} />
      ) : null}
      {tagDialog?.kind === "edit" ? (
        <TagEditorModal mode="edit" onClose={closeTagDialog} onSubmit={(value) => onUpdateTag(tagDialog.tag.id, value)} open tag={tagDialog.tag} tags={tags} />
      ) : null}
      {tagDialog?.kind === "merge" ? (
        <ModalShell
          backdropClassName="confirm-backdrop"
          className="tag-dialog"
          closeDisabled={isDialogSaving}
          description={translate("ui.70e187e7d757", { p0: tagDialog.tag.name })}
          dismissOnBackdrop={false}
          footer={(
            <div className="new-note-actions">
              <button className="secondary-btn" disabled={isDialogSaving} onClick={closeTagDialog} type="button">{translate("ui.8fbe9b75cbdf")}</button>
              <button className="danger-btn" disabled={!mergeTargetId || isDialogSaving} form="merge-tag-form" type="submit">{isDialogSaving ? translate("ui.35f4de9829fd") : translate("ui.8f27f05ca87a")}</button>
            </div>
          )}
          onClose={closeTagDialog}
          open
          size="compact"
          title={translate("ui.d070bf5d3e68")}
          titleId="merge-tag-title"
        >
          <form id="merge-tag-form" onSubmit={(event) => { event.preventDefault(); void submitMerge(); }}>
            <div aria-label={translate("ui.3257db6d2237")} className="tag-merge-flow">
              <span><small>{translate("ui.15525b48b24d")}</small><b>{tagDialog.tag.name}</b></span>
              <Icon name="forward" />
              <label className="field">
                {translate("ui.6072adc9b245")}<select disabled={mergeTargets.length === 0} onChange={(event) => { setMergeTargetId(event.currentTarget.value); setDialogError(""); }} value={mergeTargetId}>
                  {mergeTargets.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
                </select>
              </label>
            </div>
            {mergeTargets.length === 0 ? <div className="field-error" role="status">{translate("ui.845e5743f235")}</div> : null}
            {dialogError ? <div className="field-error" role="alert">{dialogError}</div> : null}
          </form>
        </ModalShell>
      ) : null}
    </PageShell>
  );
}
