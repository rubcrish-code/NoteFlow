import { translate, useInterfaceLanguage } from "../../shared/i18n";
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
  { section: "notes", get label() { return translate("ui.4bcfa3fb168f"); }, icon: "doc" },
  { section: "projects", get label() { return translate("ui.5029f02d0a94"); }, icon: "folder" },
  { section: "rag", get label() { return translate("ui.ea00b57395d6"); }, icon: "chat" },
];

const libraryNavItems: NavItem[] = [
  { section: "tags", get label() { return translate("ui.a2800083983f"); }, icon: "tag" },
  { section: "archive", get label() { return translate("ui.3c54b5e783ef"); }, icon: "archive" },
  { section: "settings", get label() { return translate("ui.985b5e0f2ccf"); }, icon: "gear" },
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
  useInterfaceLanguage();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileAnchorRef = useRef<HTMLButtonElement>(null);
  const closeProfileMenu = useCallback(() => setIsProfileOpen(false), []);

  function renderNavItem(item: NavItem) {
    const isActive = activeSection === item.section;
    return (
      <button
        aria-label={item.label}
        aria-current={isActive ? "page" : undefined}
        className={`nav-i sidebar-action ${isActive ? "on" : ""}`}
        data-tooltip={item.label}
        key={item.section}
        onClick={() => onNavigate(item.section)}
        type="button"
      >
        <Icon name={item.icon} />
        <span className="sidebar-action-label">{item.label}</span>
      </button>
    );
  }

  return (
    <aside className="sb">
      <div className="sb-brand">
        <div className="sidebar-brand-copy">
          <div className="mark">
            <Icon name="logo" />
          </div>
          <span className="nm">NoteFlow</span>
        </div>
        {onToggleCollapse ? (
          <button
            aria-label={collapsed ? translate("ui.376e3c87e982") : translate("ui.4149b3a67e50")}
            aria-expanded={!collapsed}
            className="col"
            data-tooltip={collapsed ? translate("ui.376e3c87e982") : translate("ui.4149b3a67e50")}
            onClick={onToggleCollapse}
            title={collapsed ? translate("ui.376e3c87e982") : translate("ui.4149b3a67e50")}
            type="button"
          >
            <Icon name={collapsed ? "forward" : "back"} />
          </button>
        ) : (
          <button aria-label={translate("ui.2ecb88f70e4d")} className="col" data-tooltip={translate("ui.2ecb88f70e4d")} onClick={() => onNavigate("notes")} type="button">
            <Icon name="back" />
          </button>
        )}
      </div>

      <button aria-label={translate("ui.f653f99e1096")} className="new-btn sidebar-action" data-tooltip={translate("ui.f653f99e1096")} onClick={onNewNote} type="button">
        <Icon name="plus" />
        <span className="sidebar-action-label">{translate("ui.f653f99e1096")}</span>
      </button>

      <nav aria-label={translate("ui.8fff0bba4454")}>
        {primaryNavItems.map(renderNavItem)}
        {libraryNavItems.map(renderNavItem)}
      </nav>

      <div className="spacer" />

      <div className="profile-wrap">
        <button
          aria-label={translate("ui.2a043acd1ff0", { p0: localProfileName })}
          aria-expanded={isProfileOpen}
          aria-haspopup="menu"
          className="sb-user sidebar-profile"
          data-tooltip={localProfileName}
          onClick={() => setIsProfileOpen((value) => !value)}
          ref={profileAnchorRef}
          type="button"
        >
          <div className="av">{getLocalProfileInitial(localProfileName)}</div>
          <div className="info">
            <div className="nm">{localProfileName}</div>
            <div className="em">{translate("ui.91616dd5b60d")}</div>
          </div>
        </button>
        <MenuPopover
          anchorRef={profileAnchorRef}
          ariaLabel={translate("ui.41660eb54f99")}
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
            {translate("ui.02e4f11754bc")}</button>
          <button
            onClick={() => {
              onNavigate("settings");
              setIsProfileOpen(false);
            }}
            role="menuitem"
            type="button"
          >
            {translate("ui.7c8ef82d31bc")}</button>
          <div className="profile-local-note">{translate("ui.0b80394a206c")}</div>
        </MenuPopover>
      </div>
    </aside>
  );
}
