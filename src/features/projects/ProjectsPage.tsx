import { useCallback, useRef, useState, type FormEvent } from "react";
import type { AppSection, ProjectCard } from "../../app/types";
import { Icon } from "../../shared/Icon";
import { MenuPopover } from "../../shared/MenuPopover";
import { ModalShell } from "../../shared/ModalShell";
import { FILE_COUNT_FORMS, formatRussianCount, NOTE_COUNT_FORMS } from "../../shared/russianPlural";
import { PageShell, type PageShellSidebarProps } from "../navigation/PageShell";

interface ProjectsPageProps {
  projects: ProjectCard[];
  onArchiveProject: (projectId: string) => Promise<void>;
  onCreateProject: (title: string, description: string) => Promise<ProjectCard>;
  onNavigate: (section: AppSection) => void;
  onNewNote: () => void;
  onOpenProject: (projectId: string) => void;
  onToast: (message: string) => void;
  onUpdateProject: (projectId: string, title: string, description: string) => Promise<ProjectCard>;
  sidebar: PageShellSidebarProps;
}

export function ProjectsPage({ projects, onArchiveProject, onCreateProject, onNavigate, onNewNote, onOpenProject, onToast, onUpdateProject, sidebar }: ProjectsPageProps) {
  const [editingProject, setEditingProject] = useState<ProjectCard | null>(null);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [pendingArchive, setPendingArchive] = useState<ProjectCard | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveError, setArchiveError] = useState("");
  const [openMenuId, setOpenMenuId] = useState("");
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
      setArchiveError("Не удалось архивировать проект. Попробуйте ещё раз.");
    } finally {
      setArchiveBusy(false);
    }
  }

  return (
    <PageShell activeSection="projects" onNavigate={onNavigate} onNewNote={onNewNote} onToast={onToast} sidebar={sidebar}>
      <div className="projects-page-content">
        <header className="content-page-header">
          <div>
            <div className="page-title">Проекты</div>
            <div className="page-subtitle">Организуйте заметки и материалы по направлениям работы.</div>
          </div>
          <button className="primary-btn compact" onClick={() => { setEditingProject(null); setIsProjectModalOpen(true); }} type="button">
            <Icon name="plus" /> Новый проект
          </button>
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
                aria-label={`Действия с проектом «${project.title}»`}
                className="row-menu-trigger project-menu-trigger"
                onClick={(event) => {
                  menuAnchorRef.current = event.currentTarget;
                  setOpenMenuId((current) => current === project.id ? "" : project.id);
                }}
                type="button"
              >
                <Icon name="dots" />
              </button>
              <MenuPopover anchorRef={menuAnchorRef} ariaLabel={`Действия с проектом «${project.title}»`} className="row-actions-menu" isOpen={openMenuId === project.id} onClose={closeMenu} preferredWidth={210}>
                <button onClick={() => { closeMenu(); setEditingProject(project); setIsProjectModalOpen(true); }} role="menuitem" type="button">Изменить проект</button>
                <button onClick={() => { closeMenu(); setArchiveError(""); setPendingArchive(project); }} role="menuitem" type="button">Архивировать</button>
              </MenuPopover>
            </article>
          ))}
          {projects.length === 0 ? (
            <div className="page-empty-state project-empty-state">
              <span className="page-empty-icon"><Icon name="folder" /></span>
              <div><b>Проектов пока нет</b><span>Создайте проект, чтобы собрать связанные заметки в одном месте.</span></div>
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
        />
      ) : null}
      {pendingArchive ? (
        <ModalShell
          backdropClassName="confirm-backdrop"
          className="confirm-dialog"
          closeDisabled={archiveBusy}
          description={`«${pendingArchive.title}» и активные заметки проекта переместятся в Архив. Заметки можно будет просматривать и восстановить вместе с проектом.`}
          dismissOnBackdrop={false}
          footer={<div className="new-note-actions"><button className="secondary-btn" disabled={archiveBusy} onClick={() => setPendingArchive(null)} type="button">Отмена</button><button className="primary-btn" disabled={archiveBusy} onClick={() => void archiveProject()} type="button">{archiveBusy ? "Архивируем…" : "Архивировать"}</button></div>}
          onClose={() => setPendingArchive(null)}
          open
          size="compact"
          title="Архивировать проект?"
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
}

function ProjectEditorModal({ onClose, onSave, project }: ProjectEditorModalProps) {
  const [title, setTitle] = useState(project?.title ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await onSave(title.trim(), description.trim());
    } catch {
      setError("Не удалось сохранить проект. Проверьте название и попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell
      backdropClassName="modal-backdrop"
      className="new-note-dialog project-dialog"
      closeDisabled={busy}
      description="Проект хранится локально вместе со связанными заметками."
      footer={<div className="new-note-actions"><button className="secondary-btn" disabled={busy} onClick={onClose} type="button">Отмена</button><button className="primary-btn" disabled={!title.trim() || busy} form="project-editor-form" type="submit">{busy ? "Сохраняем…" : project ? "Сохранить" : "Создать"}</button></div>}
      initialFocusRef={titleInputRef}
      onClose={onClose}
      open
      size="compact"
      title={project ? "Изменить проект" : "Новый проект"}
      titleId="project-editor-title"
    >
      <form className="new-note-form" id="project-editor-form" onSubmit={(event) => void submit(event)}>
        <label>Название<input maxLength={180} onChange={(event) => setTitle(event.currentTarget.value)} placeholder="Например, Исследование рынка" ref={titleInputRef} value={title} /></label>
        <label>Описание<input maxLength={500} onChange={(event) => setDescription(event.currentTarget.value)} placeholder="Короткое описание проекта" value={description} /></label>
        {error ? <div className="field-error" role="alert">{error}</div> : null}
      </form>
    </ModalShell>
  );
}
