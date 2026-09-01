import { useRef, useState } from "react";
import type { AppSection, ProjectCard } from "../../app/types";
import { Icon } from "../../shared/Icon";
import { ModalShell } from "../../shared/ModalShell";
import { PageShell } from "../navigation/PageShell";

interface ProjectsPageProps {
  projects: ProjectCard[];
  onCreateProject: (title: string, description: string) => void;
  onNavigate: (section: AppSection) => void;
  onNewNote: () => void;
  onOpenProject: (projectTitle: string) => void;
  onToast: (message: string) => void;
}

export function ProjectsPage({ projects, onCreateProject, onNavigate, onNewNote, onOpenProject, onToast }: ProjectsPageProps) {
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);

  function createProject(title: string, description: string) {
    onCreateProject(title, description);
    setIsProjectModalOpen(false);
  }

  return (
    <PageShell activeSection="projects" onNavigate={onNavigate} onNewNote={onNewNote} onToast={onToast}>
      <header className="content-page-header">
        <div>
          <div className="page-title">Проекты</div>
          <div className="page-subtitle">Организуйте заметки и материалы по направлениям работы.</div>
        </div>
        <button className="primary-btn compact" onClick={() => setIsProjectModalOpen(true)} type="button">
          <Icon name="plus" />
          Новый проект
        </button>
      </header>
      <div className="project-grid">
        {projects.map((project) => (
          <button className="project-card" key={project.id} onClick={() => onOpenProject(project.title)} type="button">
            <span className="project-icon"><Icon name="folder" /></span>
            <span className="project-copy">
              <span className="project-title">{project.title}</span>
              <span className="project-description">{project.description}</span>
              <span className="project-stats">
                <span>{project.notes} заметок</span>
                {project.files ? <span>{project.files} файлов</span> : null}
              </span>
            </span>
            <Icon className="project-open-icon" name="forward" />
          </button>
        ))}
        {projects.length === 0 ? (
          <div className="page-empty-state project-empty-state">
            <span className="page-empty-icon"><Icon name="folder" /></span>
            <div>
              <b>Проектов пока нет</b>
              <span>Создайте проект, чтобы собрать связанные заметки в одном месте.</span>
            </div>
          </div>
        ) : null}
      </div>
      {isProjectModalOpen ? <NewProjectModal onClose={() => setIsProjectModalOpen(false)} onCreate={createProject} /> : null}
    </PageShell>
  );
}

interface NewProjectModalProps {
  onClose: () => void;
  onCreate: (title: string, description: string) => void;
}

function NewProjectModal({ onClose, onCreate }: NewProjectModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);
  const canCreate = title.trim().length > 0;

  return (
    <ModalShell
      backdropClassName="modal-backdrop"
      className="new-note-dialog project-dialog"
      description="Проект будет сохранён в локальной базе NoteFlow."
      footer={(
        <div className="new-note-actions">
          <button className="secondary-btn" onClick={onClose} type="button">Отмена</button>
          <button className="primary-btn" disabled={!canCreate} form="new-project-form" type="submit">Создать</button>
        </div>
      )}
      initialFocusRef={titleInputRef}
      onClose={onClose}
      open
      size="compact"
      title="Новый проект"
      titleId="new-project-title"
    >
      <form
        className="new-note-form"
        id="new-project-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (canCreate) {
            onCreate(title.trim(), description.trim() || "Новое пространство заметок");
          }
        }}
      >
        <label>
          Название
          <input onChange={(event) => setTitle(event.currentTarget.value)} placeholder="Например, Исследование рынка" ref={titleInputRef} value={title} />
        </label>
        <label>
          Описание
          <input onChange={(event) => setDescription(event.currentTarget.value)} placeholder="Короткое описание проекта" value={description} />
        </label>
      </form>
    </ModalShell>
  );
}
