import { useCallback, useRef, useState } from "react";
import type { AppSection } from "../../app/types";
import { Icon, type IconName } from "../../shared/Icon";
import { getLocalProfileInitial } from "../../shared/localProfile";
import { MenuPopover } from "../../shared/MenuPopover";

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
  localProfileName: string;
  onEditLocalProfile: () => void;
  onNavigate: (section: AppSection) => void;
  onNewNote: () => void;
  onToggleCollapse?: () => void;
  onToast: (message: string) => void;
}

export function MainSidebar({ activeSection, collapsed = false, localProfileName, onEditLocalProfile, onNavigate, onNewNote, onToggleCollapse }: MainSidebarProps) {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileAnchorRef = useRef<HTMLButtonElement>(null);
  const closeProfileMenu = useCallback(() => setIsProfileOpen(false), []);

  function renderNavItem(item: NavItem) {
    const isActive = activeSection === item.section;
    return (
      <button
        aria-label={item.label}
        aria-current={isActive ? "page" : undefined}
        className={`nav-i ${isActive ? "on" : ""}`}
        data-tooltip={item.label}
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
          <button
            aria-label={collapsed ? "Развернуть боковую панель" : "Свернуть боковую панель"}
            className="col"
            data-tooltip={collapsed ? "Развернуть боковую панель" : "Свернуть боковую панель"}
            onClick={onToggleCollapse}
            title={collapsed ? "Развернуть боковую панель" : "Свернуть боковую панель"}
            type="button"
          >
            <Icon name={collapsed ? "forward" : "back"} />
          </button>
        ) : (
          <button aria-label="К заметкам" className="col" data-tooltip="К заметкам" onClick={() => onNavigate("notes")} type="button">
            <Icon name="back" />
          </button>
        )}
      </div>

      <button aria-label="Новая заметка" className="new-btn" data-tooltip="Новая заметка" onClick={onNewNote} type="button">
        <Icon name="plus" />
        <span>Новая заметка</span>
      </button>

      <nav aria-label="Основная навигация">
        {primaryNavItems.map(renderNavItem)}
        <div className="nav-sec">Библиотека</div>
        {libraryNavItems.map(renderNavItem)}
      </nav>

      <div className="spacer" />

      <div className="profile-wrap">
        <button
          aria-label={`${localProfileName}, локальный профиль`}
          aria-expanded={isProfileOpen}
          aria-haspopup="menu"
          className="sb-user"
          data-tooltip={localProfileName}
          onClick={() => setIsProfileOpen((value) => !value)}
          ref={profileAnchorRef}
          type="button"
        >
          <div className="av">{getLocalProfileInitial(localProfileName)}</div>
          <div className="info">
            <div className="nm">{localProfileName}</div>
            <div className="em">Локальный профиль</div>
          </div>
        </button>
        <MenuPopover
          anchorRef={profileAnchorRef}
          ariaLabel="Меню профиля"
          className="profile-pop show profile-pop-portal"
          isOpen={isProfileOpen}
          maxHeight={240}
          onClose={closeProfileMenu}
          preferredWidth={220}
        >
          <button
            onClick={() => {
              onEditLocalProfile();
              setIsProfileOpen(false);
            }}
            role="menuitem"
            type="button"
          >
            Изменить имя
          </button>
          <button
            onClick={() => {
              onNavigate("settings");
              setIsProfileOpen(false);
            }}
            role="menuitem"
            type="button"
          >
            Открыть настройки
          </button>
          <div className="profile-local-note">NoteFlow не использует онлайн-аккаунт. Данные остаются на этом устройстве.</div>
        </MenuPopover>
      </div>
    </aside>
  );
}
