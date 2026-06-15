import { useState } from "react";
import type { AppSection } from "../../app/types";
import { mockProjects } from "../../data/mockData";
import { PageShell } from "../navigation/PageShell";

interface ProjectsPageProps {
  onNavigate: (section: AppSection) => void;
  onNewNote: () => void;
  onToast: (message: string) => void;
}

export function ProjectsPage({ onNavigate, onNewNote, onToast }: ProjectsPageProps) {
  const [projects, setProjects] = useState(mockProjects);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);

  function createProject(title: string, description: string) {
    setProjects((currentProjects) => [
      ...currentProjects,
      {
        id: `project-${Date.now()}`,
        title,
        description,
        notes: 0,
        tasks: 0,
      },
    ]);
    setIsProjectModalOpen(false);
    onToast("Проект создан в памяти");
  }

  return (
    <PageShell activeSection="projects" onNavigate={onNavigate} onNewNote={onNewNote} onToast={onToast}>
      <div className="page-title">Проекты</div>
      <div className="page-subtitle">Объединяйте заметки, задачи и материалы по направлениям работы.</div>
      <div className="project-grid">
        {projects.map((project) => (
          <button className="project-card" key={project.id} onClick={() => onToast(`Открыт проект ${project.title}`)} type="button">
            <div className="project-title">{project.title}</div>
            <div className="project-description">{project.description}</div>
            <div className="project-stats">
              <span>{project.notes} заметки</span>
              <span>{project.tasks} задач</span>
              {project.files ? <span>{project.files} файлов</span> : null}
            </div>
          </button>
        ))}
        <button className="project-card project-card-new" onClick={() => setIsProjectModalOpen(true)} type="button">
          <div className="project-title">+ Новый проект</div>
          <div className="project-description">Создать отдельное пространство</div>
        </button>
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
  const canCreate = title.trim().length > 0;

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="new-note-dialog project-dialog"
        onSubmit={(event) => {
          event.preventDefault();
          if (canCreate) {
            onCreate(title.trim(), description.trim() || "Новое пространство заметок");
          }
        }}
      >
        <h2>Новый проект</h2>
        <p>Проект появится в текущей сессии и исчезнет после перезапуска приложения.</p>
        <label>
          Название
          <input autoFocus onChange={(event) => setTitle(event.currentTarget.value)} placeholder="Например, Исследование рынка" value={title} />
        </label>
        <label>
          Описание
          <input onChange={(event) => setDescription(event.currentTarget.value)} placeholder="Короткое описание проекта" value={description} />
        </label>
        <div className="new-note-actions">
          <button className="cancel" onClick={onClose} type="button">
            Отмена
          </button>
          <button className="create" disabled={!canCreate} type="submit">
            Создать
          </button>
        </div>
      </form>
    </div>
  );
}
