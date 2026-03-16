import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FiActivity,
  FiAnchor,
  FiBarChart2,
  FiBell,
  FiBook,
  FiBookOpen,
  FiCheck,
  FiCheckSquare,
  FiChevronDown,
  FiCpu,
  FiDownload,
  FiChevronsLeft,
  FiChevronsRight,
  FiFileText,
  FiFolder,
  FiFolderPlus,
  FiGitBranch,
  FiGitMerge,
  FiGrid,
  FiHeart,
  FiLoader,
  FiMail,
  FiSearch,
  FiSettings,
  FiShield,
  FiTerminal,
  FiUsers,
  FiVolume2,
  FiZap,
} from 'react-icons/fi';
import type { IconType } from 'react-icons';
import { useProjectStore } from '../../stores/projectStore';
import { Button } from '../ui/button';
import { Separator } from '../ui/separator';
import './Sidebar.css';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: IconType;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    label: 'Main',
    items: [
      { id: 'command-center', label: 'Command Center', icon: FiCpu },
      { id: 'projects', label: 'Projects', icon: FiFolder },
      { id: 'agents', label: 'Agents', icon: FiUsers },
      { id: 'mail', label: 'Mail', icon: FiMail },
      { id: 'merge', label: 'Merge', icon: FiGitMerge },
      { id: 'worktrees', label: 'Worktrees', icon: FiGitBranch },
    ],
  },
  {
    label: 'Configure',
    items: [
      { id: 'definitions', label: 'Definitions', icon: FiBookOpen },
      { id: 'guard-rules', label: 'Guard Rules', icon: FiShield },
      { id: 'hooks', label: 'Hooks', icon: FiAnchor },
    ],
  },
  {
    label: 'Work',
    items: [
      { id: 'tasks', label: 'Tasks', icon: FiCheckSquare },
      { id: 'discovery', label: 'Discovery', icon: FiSearch },
      { id: 'prompts', label: 'Prompts', icon: FiFileText },
      { id: 'expertise', label: 'Expertise', icon: FiBook },
    ],
  },
  {
    label: 'Observe',
    items: [
      { id: 'notifications', label: 'Notifications', icon: FiBell },
      { id: 'events', label: 'Event Feed', icon: FiActivity },
      { id: 'metrics', label: 'Metrics', icon: FiBarChart2 },
    ],
  },
  {
    label: 'System',
    items: [
      { id: 'doctor', label: 'Doctor', icon: FiHeart },
      { id: 'cleanup', label: 'Cleanup', icon: FiZap },
      { id: 'debug', label: 'Debug', icon: FiTerminal },
      { id: 'settings', label: 'Settings', icon: FiSettings },
    ],
  },
];

export function Sidebar({ currentPage, onNavigate, collapsed, onToggleCollapse }: SidebarProps) {
  const [mailUnreadCount, setMailUnreadCount] = useState(0);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const projectDropdownRef = useRef<HTMLDivElement>(null);

  const {
    projects,
    activeProject,
    loadProjects,
    loadActiveProject,
    createProject,
    switchProject,
  } = useProjectStore();

  // Load projects on mount
  useEffect(() => {
    loadProjects();
    loadActiveProject();
  }, [loadProjects, loadActiveProject]);

  // Event-driven mail unread count (no polling — uses mail events)
  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const result = await window.electronAPI.mailUnreadCount();
        if (result.data !== null && result.data !== undefined) {
          setMailUnreadCount(result.data);
        }
      } catch {
        // ignore errors
      }
    };
    fetchUnread();
    const unsubPurged = window.electronAPI.onMailPurged(() => fetchUnread());
    const unsubReceived = window.electronAPI.onMailReceived(() => fetchUnread());
    return () => {
      unsubPurged();
      unsubReceived();
    };
  }, []);

  // Close projects dropdown on Escape
  useEffect(() => {
    if (!projectsOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setProjectsOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [projectsOpen]);

  const handleProjectSwitch = useCallback(async (id: string) => {
    if (activeProject?.id === id) {
      setProjectsOpen(false);
      return;
    }
    setSwitching(id);
    await switchProject(id);
    setSwitching(null);
    setProjectsOpen(false);
  }, [activeProject, switchProject]);

  const handleBrowseAndCreate = useCallback(async () => {
    setProjectsOpen(false);
    try {
      const result = await window.electronAPI.dialogSelectFolder();
      if (result.data) {
        const folderPath = result.data;
        const folderName = folderPath.split(/[\\/]/).filter(Boolean).pop() || 'My Project';
        const project = await createProject(folderName, folderPath);
        if (project) {
          await switchProject(project.id);
        }
      }
    } catch {
      // User cancelled
    }
  }, [createProject, switchProject]);

  return (
    <aside
      data-testid="app-sidebar"
      data-collapsed={collapsed}
      className={`sidebar-root flex flex-col transition-all duration-200 ease-out ${
        collapsed ? 'w-[60px]' : 'w-56'
      }`}
    >
      {/* Header */}
      <div className="border-b border-white/5 pr-3 pt-3 pb-1">
        <Button
          variant="ghost"
          onClick={onToggleCollapse}
          className={`sidebar-collapse-btn sidebar-nav-item flex h-auto w-full items-center text-[13.5px] transition-all duration-150 ease-out focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none ${
            collapsed ? 'justify-center h-[46px] w-[46px] ml-2' : 'gap-3.5 pl-5 pr-3 py-[9px]'
          }`}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <FiChevronsRight size={20} strokeWidth={1.7} /> : (
            <>
              <FiChevronsLeft size={20} strokeWidth={1.7} className="shrink-0" />
              <span className="text-[13.5px] font-medium">Collapse Navbar</span>
            </>
          )}
        </Button>
      </div>

      {/* Navigation */}
      <nav
        data-testid="sidebar-nav"
        aria-label="Main navigation"
        className="sidebar-nav flex-1 overflow-y-auto overflow-x-hidden pt-4 pb-4 pr-3"
      >
        {navSections.map((section, sectionIdx) => (
          <div key={section.label} className={sectionIdx > 0 ? 'mt-4' : ''}>
            {/* Section label */}
            {!collapsed && (
              <div className="sidebar-section-label pl-5 pr-3 pb-[6px] pt-[2px] text-[10px] font-bold uppercase tracking-wider">
                {section.label}
              </div>
            )}
            {collapsed && sectionIdx > 0 && (
              <Separator className="sidebar-section-divider mx-auto my-2 w-6" />
            )}

            {/* Section items */}
            <div className="flex flex-col gap-[6px]">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = currentPage === item.id;
                const hasBadge = item.id === 'mail' && mailUnreadCount > 0;
                const isProjectsItem = item.id === 'projects';

                // Projects item — inline accordion dropdown
                if (isProjectsItem) {
                  return (
                    <div key={item.id} ref={projectDropdownRef}>
                      {/* Projects toggle button */}
                      <Button
                        variant="ghost"
                        type="button"
                        data-testid={`nav-${item.id}`}
                        onClick={() => {
                          if (collapsed) {
                            // In collapsed mode, navigate directly
                            onNavigate('projects');
                          } else {
                            setProjectsOpen(!projectsOpen);
                          }
                        }}
                        className={`sidebar-nav-item group flex h-auto w-full items-center text-[13.5px] transition-all duration-150 ease-out focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none ${
                          collapsed
                            ? 'justify-center h-[46px] w-[46px] ml-2'
                            : 'gap-3.5 pl-5 pr-3 py-[9px]'
                        } ${isActive || projectsOpen ? 'sidebar-nav-item-active' : ''}`}
                        title={collapsed ? 'Projects' : undefined}
                        aria-current={isActive ? 'page' : undefined}
                        aria-expanded={!collapsed ? projectsOpen : undefined}
                      >
                        <span className="relative flex-shrink-0">
                          <Icon size={20} strokeWidth={isActive || projectsOpen ? 2.1 : 1.7} />
                        </span>
                        {!collapsed && (
                          <span className="flex flex-1 items-center justify-between min-w-0">
                            <span className="truncate">Projects</span>
                            <FiChevronDown
                              size={14}
                              className={`shrink-0 text-current opacity-40 transition-transform duration-200 ${projectsOpen ? 'rotate-180' : ''}`}
                            />
                          </span>
                        )}
                      </Button>

                      {/* Inline accordion sub-items */}
                      {projectsOpen && !collapsed && (
                        <div className="sidebar-accordion mt-1 ml-[26px] border-l border-dashed border-white/10 pl-3 pb-1 flex flex-col gap-1">
                          {/* All Projects */}
                          <Button
                            variant="ghost"
                            type="button"
                            onClick={() => {
                              setProjectsOpen(false);
                              onNavigate('projects');
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-[8px] text-left text-[13px] text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-all duration-150 h-auto justify-start"
                            data-testid="project-switcher-all-projects"
                          >
                            <FiGrid size={13} className="shrink-0" />
                            <span>All Projects</span>
                          </Button>

                          {/* Open Project */}
                          <Button
                            variant="ghost"
                            type="button"
                            onClick={handleBrowseAndCreate}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-[8px] text-left text-[13px] text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-all duration-150 h-auto justify-start"
                          >
                            <FiFolderPlus size={13} className="shrink-0" />
                            <span>Open Project</span>
                          </Button>

                          {/* Project list */}
                          {projects.length === 0 && (
                            <div className="py-2 px-2 text-[12px] text-slate-500 italic">
                              No projects yet
                            </div>
                          )}
                          {projects.map((project) => {
                            const isActiveProject = activeProject?.id === project.id;
                            const isSwitching = switching === project.id;
                            return (
                              <Button
                                variant="ghost"
                                type="button"
                                key={project.id}
                                onClick={() => handleProjectSwitch(project.id)}
                                disabled={isSwitching}
                                className={`sidebar-accordion-item flex h-auto w-full items-center gap-2 rounded-lg px-2.5 py-[8px] text-left text-[13px] transition-all duration-150 ${
                                  isActiveProject
                                    ? 'text-blue-400 font-medium'
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                                } ${isSwitching ? 'opacity-60' : ''}`}
                                data-testid={`project-item-${project.id}`}
                                title={project.path}
                              >
                                {isSwitching ? (
                                  <FiLoader size={13} className="shrink-0 animate-spin" />
                                ) : isActiveProject ? (
                                  <FiCheck size={13} className="shrink-0" />
                                ) : (
                                  <FiFolder size={13} className="shrink-0" />
                                )}
                                <span className="truncate">{project.name}</span>
                              </Button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }

                // Regular nav item
                return (
                  <Button
                    variant="ghost"
                    type="button"
                    key={item.id}
                    data-testid={`nav-${item.id}`}
                    onClick={() => onNavigate(item.id)}
                    className={`sidebar-nav-item group flex h-auto w-full items-center text-[13.5px] transition-all duration-150 ease-out focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none ${
                      collapsed
                        ? 'justify-center h-[46px] w-[46px] ml-2'
                        : 'gap-3.5 pl-5 pr-3 py-[9px]'
                    } ${isActive ? 'sidebar-nav-item-active' : ''}`}
                    title={collapsed ? item.label : undefined}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <span className="relative flex-shrink-0">
                      <Icon size={20} strokeWidth={isActive ? 2.1 : 1.7} />
                      {hasBadge && collapsed && (
                        <span
                          className="absolute -top-1 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 px-0.5 text-[9px] font-bold text-white"
                          data-testid="mail-unread-badge"
                        >
                          {mailUnreadCount > 99 ? '99+' : mailUnreadCount}
                        </span>
                      )}
                    </span>
                    {!collapsed && (
                      <span className="flex flex-1 items-center justify-between min-w-0">
                        <span className="truncate">{item.label}</span>
                        {hasBadge && (
                          <span
                            className="sidebar-badge flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-semibold"
                            data-testid="mail-unread-badge"
                          >
                            {mailUnreadCount > 99 ? '99+' : mailUnreadCount}
                          </span>
                        )}
                      </span>
                    )}
                  </Button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* What's New */}
      {!collapsed && (
        <div className="mx-4 mb-4 mt-auto rounded-xl bg-blue-500/5 border border-blue-500/15 p-4 text-left">
          <div className="flex items-center gap-2 text-blue-400 mb-1.5">
            <FiZap size={15} />
            <span className="text-[13px] font-semibold">What's New</span>
          </div>
          <p className="text-[11px] text-slate-400 mb-3 leading-snug">
            Fleet Command v14.5.4 is here with new features and improvements.
          </p>
          <div className="flex flex-col gap-1.5">
            <Button
              variant="secondary"
              className="w-full rounded-lg bg-[#222] border border-white/10 px-3 py-1.5 text-[11px] font-medium text-slate-300 hover:bg-[#2a2a2a] hover:text-white transition-colors h-auto gap-1.5"
              onClick={() => window.electronAPI?.openExternal?.('https://github.com/fleet-command/releases')}
            >
              <FiFileText size={12} />
              View Changelogs
            </Button>
            <Button
              variant="secondary"
              className="w-full rounded-lg bg-blue-600/20 border border-blue-500/30 px-3 py-1.5 text-[11px] font-medium text-blue-300 hover:bg-blue-600/30 hover:text-blue-200 transition-colors h-auto gap-1.5"
              onClick={() => window.electronAPI?.openExternal?.('https://github.com/fleet-command/releases/latest')}
            >
              <FiDownload size={12} />
              Download Latest
            </Button>
          </div>
        </div>
      )}
      {collapsed && (
        <div className="mx-auto mb-4 mt-auto flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400" title="What's New">
          <FiZap size={18} />
        </div>
      )}

      {/* Version */}
      {!collapsed && (
        <div className="px-5 pb-4 text-[11.5px] font-medium text-slate-500">
          Version 14.5.4
        </div>
      )}
    </aside>
  );
}
