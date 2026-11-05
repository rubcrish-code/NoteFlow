import { translate, useInterfaceLanguage } from "../../shared/i18n";
import { useCallback, useRef, useState, type FormEvent } from "react";
import type { AppSection, ProjectCard } from "../../app/types";
import { Icon } from "../../shared/Icon";
import { MenuPopover } from "../../shared/MenuPopover";
import { ModalShell } from "../../shared/ModalShell";
import { FILE_COUNT_FORMS, formatRussianCount, NOTE_COUNT_FORMS } from "../../shared/russianPlural";
import { PageShell, type PageShellSidebarProps } from "../navigation/PageShell";
import { ProjectDeleteDialog } from "./ProjectDeleteDialog";
import { normalizeEntityName, validateEntityName } from "../../shared/entityName";
import { EntityNameCounter } from "../../shared/EntityNameCounter";
import { PublicCommandError } from "../../services/safeInvoke";

interface ProjectsPageProps {
  projects: ProjectCard[];
  onArchiveProject: (projectId: string) => Promise<void>;
  onDeleteProject?: (projectId: string) => Promise<void>;
  onExportProject: (project: ProjectCard) => Promise<void>;
  onCreateProject: (title: string, description: string) => Promise<ProjectCard>;
  onNavigate: (section: AppSection) => void;
  onNewNote: () => void;
  onOpenProject: (projectId: string) => void;
  onToast: (message: string) => void;
  onUpdateProject: (projectId: string, title: string, description: string) => Promise<ProjectCard>;
  sidebar: PageShellSidebarProps;
}

export function ProjectsPage({ projects, onArchiveProject, onDeleteProject, onExportProject, onCreateProject, onNavigate, onNewNote, onOpenProject, onToast, onUpdateProject, sidebar }: ProjectsPageProps) {
  useInterfaceLanguage();
  const [editingProject, setEditingProject] = useState<ProjectCard | null>(null);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [pendingArchive, setPendingArchive] = useState<ProjectCard | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ProjectCard | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveError, setArchiveError] = useState("");
  const [openMenuId, setOpenMenuId] = useState("");
  const [exportBusy, setExportBusy] = useState("");
  const menuAnchorRef = useRef<HTMLButtonElement>(null);
  const closeMenu = useCallback(() => setOpenMenuId(""), []);

  async function archiveProject() {
    if (!pendingArchive) return;
    setArchiveBusy(true);
    setArchiveError("");
    try {
      await onArchiveProject(pendingArchive.id);
      setPendingArchive(null);
    } catch {
      setArchiveError(translate("ui.37620a1acc76"));
    } finally {
      setArchiveBusy(false);
    }
  }

  return (
    <PageShell activeSection="projects" onNavigate={onNavigate} onNewNote={onNewNote} onToast={onToast} sidebar={sidebar}>
      <div className="projects-page-content">
        <header className="content-page-header">
          <div>
            <div className="page-title">{translate("ui.5029f02d0a94")}</div>
            <div className="page-subtitle">{translate("ui.a2e3e2ccca3f")}</div>
          </div>
          <button className="primary-btn compact" onClick={() => { setEditingProject(null); setIsProjectModalOpen(true); }} type="button">
            <Icon name="plus" /> {translate("ui.15d568b010da")}</button>
        </header>
        <div className="project-grid">
          {projects.map((project) => (
            <article className="project-card" key={project.id}>
              <button className="project-card-open" onClick={() => onOpenProject(project.id)} type="button">
                <span className="project-icon"><Icon name="folder" /></span>
                <span className="project-copy">
                  <span className="project-title">{project.title}</span>
                  <span className="project-description">{project.description}</span>
                  <span className="project-stats">
                    <span>{formatRussianCount(project.notes, NOTE_COUNT_FORMS)}</span>
                    {project.files ? <span>{formatRussianCount(project.files, FILE_COUNT_FORMS)}</span> : null}
                  </span>
                </span>
                <Icon className="project-open-icon" name="forward" />
              </button>
              <button
                aria-expanded={openMenuId === project.id}
                aria-haspopup="menu"
                aria-label={translate("ui.4f9dd257d14f", { p0: project.title })}
                className="row-menu-trigger project-menu-trigger"
                onClick={(event) => {
                  menuAnchorRef.current = event.currentTarget;
                  setOpenMenuId((current) => current === project.id ? "" : project.id);
                }}
                type="button"
              >
                <Icon name="dots" />
              </button>
              <MenuPopover anchorRef={menuAnchorRef} ariaLabel={translate("ui.4f9dd257d14f", { p0: project.title })} className="row-actions-menu" isOpen={openMenuId === project.id} onClose={closeMenu} preferredWidth={210}>
                <button onClick={() => { closeMenu(); setEditingProject(project); setIsProjectModalOpen(true); }} role="menuitem" type="button">{translate("ui.0f1ec316eb07")}</button>
                <button disabled={Boolean(exportBusy)} onClick={() => {
                  if (exportBusy) return;
                  setExportBusy(project.id);
                  void onExportProject(project).then(closeMenu).catch((error) => onToast(error instanceof Error && error.message === translate("ui.c93e1d253df2") ? error.message : translate("ui.93d7691cdd49"))).finally(() => setExportBusy(""));
                }} role="menuitem" type="button">{exportBusy === project.id ? <span aria-hidden="true" className="button-spinner" /> : null}{exportBusy === project.id ? translate("ui.9c27c381dd8b") : translate("ui.78dfcef11633")}</button>
                <button onClick={() => { closeMenu(); setArchiveError(""); setPendingArchive(project); }} role="menuitem" type="button">{translate("ui.1137508af8ff")}</button>
                <div className="nf-menu-separator" />
                <button className="danger" disabled={!onDeleteProject} onClick={() => { closeMenu(); setPendingDelete(project); }} role="menuitem" type="button">{translate("ui.b8d719c6e9a4")}</button>
              </MenuPopover>
            </article>
          ))}
          {projects.length === 0 ? (
            <div className="page-empty-state project-empty-state">
              <span className="page-empty-icon"><Icon name="folder" /></span>
              <div><b>{translate("ui.3a82717b96cc")}</b><span>{translate("ui.cf12c71acae0")}</span></div>
            </div>
          ) : null}
        </div>
      </div>
      {isProjectModalOpen ? (
        <ProjectEditorModal
          key={editingProject?.id ?? "new"}
          onClose={() => setIsProjectModalOpen(false)}
          onSave={async (title, description) => {
            if (editingProject) await onUpdateProject(editingProject.id, title, description);
            else await onCreateProject(title, description);
            setIsProjectModalOpen(false);
          }}
          project={editingProject}
          projects={projects}
        />
      ) : null}
      {pendingDelete && onDeleteProject ? <ProjectDeleteDialog title={pendingDelete.title} notes={pendingDelete.notes} onClose={() => setPendingDelete(null)} onDelete={() => onDeleteProject(pendingDelete.id)} /> : null}
      {pendingArchive ? (
        <ModalShell
          backdropClassName="confirm-backdrop"
          className="confirm-dialog"
          closeDisabled={archiveBusy}
          description={translate("ui.d022082fa099", { p0: pendingArchive.title })}
          dismissOnBackdrop={false}
          footer={<div className="new-note-actions"><button className="secondary-btn" disabled={archiveBusy} onClick={() => setPendingArchive(null)} type="button">{translate("ui.8fbe9b75cbdf")}</button><button className="primary-btn" disabled={archiveBusy} onClick={() => void archiveProject()} type="button">{archiveBusy ? translate("ui.3b4cda39e966") : translate("ui.1137508af8ff")}</button></div>}
          onClose={() => setPendingArchive(null)}
          open
          size="compact"
          title={translate("ui.5bf08bac9f74")}
          titleId="archive-project-title"
        >
          {archiveError ? <div className="field-error" role="alert">{archiveError}</div> : null}
        </ModalShell>
      ) : null}
    </PageShell>
  );
}

interface ProjectEditorModalProps {
  onClose: () => void;
  onSave: (title: string, description: string) => Promise<void>;
  project: ProjectCard | null;
  projects: ProjectCard[];
}

function ProjectEditorModal({ onClose, onSave, project, projects }: ProjectEditorModalProps) {
  useInterfaceLanguage();
  const [title, setTitle] = useState(project?.title ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || busy) return;
    const validation = title.trim() === project?.title ? "" : validateEntityName(title);
    if (validation) { setError(validation); return; }
    if (projects.some((item) => item.id !== project?.id && item.title.trim().toLocaleLowerCase("ru-RU") === title.trim().toLocaleLowerCase("ru-RU"))) {
      setError(translate("ui.26fee8c88f7e")); return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave(normalizeEntityName(title), description.trim());
    } catch (cause) {
      setError(cause instanceof PublicCommandError && (cause.code === "PROJECT_TITLE_EXISTS" || cause.code === "TITLE_TOO_LONG") ? cause.message : translate("ui.fa68a2c25e54"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell
      backdropClassName="modal-backdrop"
      className="new-note-dialog project-dialog"
      closeDisabled={busy}
      description={translate("ui.723a03094b8c")}
      footer={<div className="new-note-actions"><button className="secondary-btn" disabled={busy} onClick={onClose} type="button">{translate("ui.8fbe9b75cbdf")}</button><button className="primary-btn" disabled={busy || Boolean(validateEntityName(title)) && title.trim() !== project?.title} form="project-editor-form" type="submit">{busy ? translate("ui.9c27c381dd8b") : project ? translate("ui.b4d30cae5289") : translate("ui.e2be34974ae4")}</button></div>}
      initialFocusRef={titleInputRef}
      onClose={onClose}
      open
      size="compact"
      title={project ? translate("ui.0f1ec316eb07") : translate("ui.15d568b010da")}
      titleId="project-editor-title"
    >
      <form className="new-note-form" id="project-editor-form" onSubmit={(event) => void submit(event)}>
        <label>{translate("ui.0918b4ba9268")}<input aria-invalid={Boolean(error) || Boolean(validateEntityName(title)) && title.trim() !== project?.title} onChange={(event) => { setTitle(event.currentTarget.value); setError(""); }} placeholder={translate("ui.2274ee4860e5")} ref={titleInputRef} value={title} /><EntityNameCounter value={title} error={error} legacy={title.trim() === project?.title} /></label>
        <label>{translate("ui.b3680f2cba5f")}<input maxLength={500} onChange={(event) => setDescription(event.currentTarget.value)} placeholder={translate("ui.d4ee51f1183d")} value={description} /></label>
      </form>
    </ModalShell>
  );
}
