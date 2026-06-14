import type { AppSection } from "../../app/types";
import { mockProjects } from "../../data/mockData";
import { PageShell } from "../navigation/PageShell";

interface ProjectsPageProps {
  onNavigate: (section: AppSection) => void;
  onNewNote: () => void;
  onToast: (message: string) => void;
}

export function ProjectsPage({ onNavigate, onNewNote, onToast }: ProjectsPageProps) {
  return (
    <PageShell activeSection="projects" onNavigate={onNavigate} onNewNote={onNewNote} onToast={onToast}>
      <div className="page-title">Проекты</div>
      <div className="page-subtitle">Объединяйте заметки, задачи и материалы по направлениям работы.</div>
      <div className="project-grid">
        {mockProjects.map((project) => (
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
        <button className="project-card project-card-new" onClick={() => onToast("Создание проекта появится на этапе данных")} type="button">
          <div className="project-title">+ Новый проект</div>
          <div className="project-description">Создать отдельное пространство</div>
        </button>
      </div>
    </PageShell>
  );
}
