import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AppSection } from "../../app/types";
import { Icon, type IconName } from "../../shared/Icon";
import { useFloatingPopoverPosition } from "../../shared/useFloatingPopoverPosition";

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
  const profileAnchorRef = useRef<HTMLButtonElement>(null);
  const profilePopoverRef = useRef<HTMLDivElement>(null);
  const profilePopoverStyle = useFloatingPopoverPosition({
    anchorRef: profileAnchorRef,
    gap: 8,
    isOpen: isProfileOpen,
    maxHeight: 240,
    padding: 12,
    popoverRef: profilePopoverRef,
    preferredWidth: 220,
  });

  useEffect(() => {
    function handleDocumentPointerDown(event: PointerEvent) {
      const target = event.target;
      if (
        target instanceof Node
        && !profileAnchorRef.current?.contains(target)
        && !profilePopoverRef.current?.contains(target)
      ) {
        setIsProfileOpen(false);
      }
    }

    function handleDocumentKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setIsProfileOpen(false);
        profileAnchorRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handleDocumentPointerDown);
    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handleDocumentPointerDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
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
          <button className="col" data-tooltip="К заметкам" onClick={() => onNavigate("notes")} type="button">
            <Icon name="back" />
          </button>
        )}
      </div>

      <button className="new-btn" onClick={onNewNote} type="button">
        <Icon name="plus" />
        <span>Новая заметка</span>
      </button>

      <nav aria-label="Основная навигация">
        {primaryNavItems.map(renderNavItem)}
        <div className="nav-sec">БИБЛИОТЕКА</div>
        {libraryNavItems.map(renderNavItem)}
      </nav>

      <div className="spacer" />

      <div className="profile-wrap">
        <button
          aria-expanded={isProfileOpen}
          aria-haspopup="menu"
          className="sb-user"
          onClick={() => setIsProfileOpen((value) => !value)}
          ref={profileAnchorRef}
          type="button"
        >
          <div className="av">В</div>
          <div className="info">
            <div className="nm">Уильям</div>
            <div className="em">noteflow@local</div>
          </div>
        </button>
        {isProfileOpen ? createPortal((
          <div
            className="profile-pop show profile-pop-portal"
            ref={profilePopoverRef}
            role="menu"
            style={{ ...profilePopoverStyle, visibility: profilePopoverStyle ? "visible" : "hidden" }}
          >
          <button
            onClick={() => {
              onNavigate("settings");
              setIsProfileOpen(false);
            }}
            role="menuitem"
            type="button"
          >
            Профиль и настройки
          </button>
          <button
            onClick={() => {
              onToast("Локальный профиль активен");
              setIsProfileOpen(false);
            }}
            role="menuitem"
            type="button"
          >
            Локальный профиль
          </button>
          <button
            onClick={() => {
              onToast("Профиль локальный, облачный выход не требуется");
              setIsProfileOpen(false);
            }}
            role="menuitem"
            type="button"
          >
            Выйти
          </button>
          </div>
        ), document.body) : null}
      </div>
    </aside>
  );
}
