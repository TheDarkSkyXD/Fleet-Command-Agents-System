import { useEffect, useState } from 'react';
import {
  FiActivity,
  FiAnchor,
  FiBarChart2,
  FiBell,
  FiBook,
  FiBookOpen,
  FiCheckSquare,
  FiChevronLeft,
  FiChevronRight,
  FiFileText,
  FiGitBranch,
  FiGitMerge,
  FiHeart,
  FiMail,
  FiSearch,
  FiSettings,
  FiShield,
  FiTerminal,
  FiUsers,
  FiZap,
} from 'react-icons/fi';
import { ProjectSwitcher } from './ProjectSwitcher';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const navItems = [
  { id: 'agents', label: 'Agents', icon: FiUsers },
  { id: 'mail', label: 'Mail', icon: FiMail },
  { id: 'merge', label: 'Merge', icon: FiGitMerge },
  { id: 'worktrees', label: 'Worktrees', icon: FiGitBranch },
  { id: 'definitions', label: 'Definitions', icon: FiBookOpen },
  { id: 'guard-rules', label: 'Guard Rules', icon: FiShield },
  { id: 'hooks', label: 'Hooks', icon: FiAnchor },
  { id: 'tasks', label: 'Tasks', icon: FiCheckSquare },
  { id: 'discovery', label: 'Discovery', icon: FiSearch },
  { id: 'prompts', label: 'Prompts', icon: FiFileText },
  { id: 'expertise', label: 'Expertise', icon: FiBook },
  { id: 'notifications', label: 'Notifications', icon: FiBell },
  { id: 'events', label: 'Event Feed', icon: FiActivity },
  { id: 'metrics', label: 'Metrics', icon: FiBarChart2 },
  { id: 'doctor', label: 'Doctor', icon: FiHeart },
  { id: 'cleanup', label: 'Cleanup', icon: FiZap },
  { id: 'debug', label: 'Debug', icon: FiTerminal },
  { id: 'settings', label: 'Settings', icon: FiSettings },
];

export function Sidebar({ currentPage, onNavigate, collapsed, onToggleCollapse }: SidebarProps) {
  const [mailUnreadCount, setMailUnreadCount] = useState(0);

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
    const interval = setInterval(fetchUnread, 5000);
    // Refresh immediately when mail is purged or received
    const unsubPurged = window.electronAPI.onMailPurged(() => fetchUnread());
    const unsubReceived = window.electronAPI.onMailReceived(() => fetchUnread());
    return () => {
      clearInterval(interval);
      unsubPurged();
      unsubReceived();
    };
  }, []);

  return (
    <aside
      data-testid="app-sidebar"
      data-collapsed={collapsed}
      className={`flex flex-col border-r border-slate-700 bg-slate-950 transition-all duration-200 ${
        collapsed ? 'w-16' : 'w-56'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
        {!collapsed && (
          <span className="text-sm font-bold text-slate-50 tracking-wide">FLEET COMMAND</span>
        )}
        <button
          type="button"
          onClick={onToggleCollapse}
          className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <FiChevronRight size={16} /> : <FiChevronLeft size={16} />}
        </button>
      </div>

      {/* Project Switcher */}
      <div className="pt-2">
        <ProjectSwitcher collapsed={collapsed} />
      </div>

      {/* Navigation */}
      <nav data-testid="sidebar-nav" aria-label="Main navigation" className="flex-1 space-y-1 p-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          return (
            <button
              type="button"
              key={item.id}
              data-testid={`nav-${item.id}`}
              onClick={() => onNavigate(item.id)}
              className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none ${
                isActive
                  ? 'bg-blue-600/20 text-blue-400'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              } ${collapsed ? 'justify-center' : ''}`}
              title={collapsed ? item.label : undefined}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="relative">
                <Icon size={18} />
                {item.id === 'mail' && mailUnreadCount > 0 && collapsed && (
                  <span
                    className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 px-0.5 text-[10px] font-bold text-white shadow-lg shadow-blue-500/30"
                    data-testid="mail-unread-badge"
                  >
                    {mailUnreadCount > 99 ? '99+' : mailUnreadCount}
                  </span>
                )}
              </span>
              {!collapsed && (
                <span className="flex flex-1 items-center justify-between">
                  <span>{item.label}</span>
                  {item.id === 'mail' && mailUnreadCount > 0 && (
                    <span
                      className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-bold text-white shadow-lg shadow-blue-500/30"
                      data-testid="mail-unread-badge"
                    >
                      {mailUnreadCount > 99 ? '99+' : mailUnreadCount}
                    </span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
