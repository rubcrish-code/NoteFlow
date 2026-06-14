import { useEffect, useRef, useState } from "react";
import type { AppSection } from "../../app/types";
import { Icon, type IconName } from "../../shared/Icon";

interface NavItem {
  section: AppSection;
  label: string;
  icon: IconName;
}

const primaryNavItems: NavItem[] = [
  { section: "notes", label: "Все заметки", icon: "doc" },
  { section: "projects", label: "Проекты", icon: "folder" },
  { section: "rag", label: "ИИ-чат по базе", icon: "chat" },
];

const libraryNavItems: NavItem[] = [
  { section: "tags", label: "Теги", icon: "tag" },
  { section: "archive", label: "Архив", icon: "archive" },
  { section: "settings", label: "Настройки", icon: "gear" },
];

interface MainSidebarProps {
  activeSection: AppSection;
  collapsed?: boolean;
  onNavigate: (section: AppSection) => void;
  onNewNote: () => void;
  onToggleCollapse?: () => void;
  onToast: (message: string) => void;
}

export function MainSidebar({ activeSection, collapsed = false, onNavigate, onNewNote, onToggleCollapse, onToast }: MainSidebarProps) {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleDocumentMouseDown(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Node && profileRef.current && !profileRef.current.contains(target)) {
        setIsProfileOpen(false);
      }
    }

    document.addEventListener("mousedown", handleDocumentMouseDown);
    return () => document.removeEventListener("mousedown", handleDocumentMouseDown);
  }, []);

  function renderNavItem(item: NavItem) {
    const isActive = activeSection === item.section;
    return (
      <button
        aria-current={isActive ? "page" : undefined}
        className={`nav-i ${isActive ? "on" : ""}`}
        data-tooltip={collapsed ? item.label : undefined}
        key={item.section}
        onClick={() => onNavigate(item.section)}
        type="button"
      >
        <Icon name={item.icon} />
        <span>{item.label}</span>
      </button>
    );
  }

  return (
    <aside className="sb">
      <div className="sb-brand">
        <div className="mark">
          <Icon name="logo" />
        </div>
        <span className="nm">NoteFlow</span>
        {onToggleCollapse ? (
          <button className="col" data-tooltip={collapsed ? "Раскрыть сайдбар" : "Свернуть (Ctrl+B)"} onClick={onToggleCollapse} type="button">
            <Icon name={collapsed ? "caret" : "back"} />
          </button>
        ) : (
          <button className="col" data-tooltip="К заметкам" onClick={() => onNavigate("notes")} type="button">
            <Icon name="back" />
          </button>
        )}
      </div>

      <button className="new-btn" onClick={onNewNote} type="button">
        <Icon name="plus" />
        <span>Новая заметка</span>
        {!collapsed ? (
          <span className="caret">
            <Icon name="caret" />
          </span>
        ) : null}
      </button>

      <nav aria-label="Основная навигация">
        {primaryNavItems.map(renderNavItem)}
        <div className="nav-sec">БИБЛИОТЕКА</div>
        {libraryNavItems.map(renderNavItem)}
      </nav>

      <div className="spacer" />

      <div className="profile-wrap" ref={profileRef}>
        <button className="sb-user" onClick={() => setIsProfileOpen((value) => !value)} type="button">
          <div className="av">В</div>
          <div className="info">
            <div className="nm">Уильям</div>
            <div className="em">noteflow@local</div>
          </div>
        </button>
        <div className={`profile-pop ${isProfileOpen ? "show" : ""}`}>
          <button
            onClick={() => {
              onNavigate("settings");
              setIsProfileOpen(false);
            }}
            type="button"
          >
            Профиль и настройки
          </button>
          <button
            onClick={() => {
              onToast("Локальный профиль активен");
              setIsProfileOpen(false);
            }}
            type="button"
          >
            Локальный профиль
          </button>
          <button
            onClick={() => {
              onToast("Профиль локальный, облачный выход не требуется");
              setIsProfileOpen(false);
            }}
            type="button"
          >
            Выйти
          </button>
        </div>
      </div>
    </aside>
  );
}
