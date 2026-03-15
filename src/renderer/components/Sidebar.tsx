import {
  FiCheckSquare,
  FiChevronLeft,
  FiChevronRight,
  FiGitMerge,
  FiMail,
  FiSettings,
  FiTerminal,
  FiUsers,
} from 'react-icons/fi';

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
  { id: 'tasks', label: 'Tasks', icon: FiCheckSquare },
  { id: 'debug', label: 'Debug', icon: FiTerminal },
  { id: 'settings', label: 'Settings', icon: FiSettings },
];

export function Sidebar({ currentPage, onNavigate, collapsed, onToggleCollapse }: SidebarProps) {
  return (
    <aside
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
          className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <FiChevronRight size={16} /> : <FiChevronLeft size={16} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          return (
            <button
              type="button"
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-600/20 text-blue-400'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              } ${collapsed ? 'justify-center' : ''}`}
              title={collapsed ? item.label : undefined}
            >
              <Icon size={18} />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
