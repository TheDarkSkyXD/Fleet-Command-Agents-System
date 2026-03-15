import { useEffect, useRef, useState } from 'react';
import {
  FiCheck,
  FiChevronDown,
  FiFolder,
  FiFolderPlus,
  FiLoader,
  FiTrash2,
  FiX,
} from 'react-icons/fi';
import { useProjectStore } from '../stores/projectStore';

interface ProjectSwitcherProps {
  collapsed: boolean;
}

export function ProjectSwitcher({ collapsed }: ProjectSwitcherProps) {
  const {
    projects,
    activeProject,
    loading,
    loadProjects,
    loadActiveProject,
    createProject,
    switchProject,
    deleteProject,
  } = useProjectStore();
  const [isOpen, setIsOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPath, setNewPath] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [switching, setSwitching] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadProjects();
    loadActiveProject();
  }, [loadProjects, loadActiveProject]);

  // Close dropdown on Escape key
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setShowCreate(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleCreate = async () => {
    if (!newName.trim() || !newPath.trim()) return;
    const project = await createProject(
      newName.trim(),
      newPath.trim(),
      newDesc.trim() || undefined,
    );
    if (project) {
      await switchProject(project.id);
      setShowCreate(false);
      setNewName('');
      setNewPath('');
      setNewDesc('');
      setIsOpen(false);
    }
  };

  const handleSwitch = async (id: string) => {
    if (activeProject?.id === id) {
      setIsOpen(false);
      return;
    }
    setSwitching(id);
    await switchProject(id);
    setSwitching(null);
    setIsOpen(false);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteProject(id);
  };

  if (collapsed) {
    return (
      <div className="relative px-2 mb-2">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex w-full items-center justify-center rounded-md p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
          title={activeProject ? activeProject.name : 'No project selected'}
          data-testid="project-switcher-collapsed"
        >
          <FiFolder size={18} className={activeProject ? 'text-blue-400' : ''} />
        </button>

        {/* Collapsed dropdown - positioned to the right */}
        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => {
                setIsOpen(false);
                setShowCreate(false);
              }}
              onKeyDown={() => {}}
            />
            <div
              ref={dropdownRef}
              className="absolute left-full top-0 z-50 ml-2 w-64 rounded-lg border border-slate-700 shadow-2xl shadow-black/50 overflow-hidden animate-in fade-in slide-in-from-left-2 duration-150"
              style={{ backgroundColor: '#141c2e' }}
            >
              <div className="px-3 py-2 border-b border-slate-700">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Switch Project
                </span>
              </div>
              {renderProjectList()}
            </div>
          </>
        )}
      </div>
    );
  }

  function renderProjectList() {
    return (
      <>
        <div className="max-h-56 overflow-y-auto scrollbar-thin">
          {projects.length === 0 && !showCreate && (
            <div className="px-3 py-5 text-center text-xs text-slate-400">
              <FiFolder size={20} className="mx-auto mb-2 text-slate-500" />
              No projects yet. Create one to get started.
            </div>
          )}
          {projects.map((project) => {
            const isActive = activeProject?.id === project.id;
            const isSwitching = switching === project.id;
            return (
              <button
                type="button"
                key={project.id}
                onClick={() => handleSwitch(project.id)}
                disabled={isSwitching}
                className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-all duration-150 group ${
                  isActive
                    ? 'bg-blue-600/15 text-blue-400 border-l-2 border-blue-500'
                    : 'text-slate-300 hover:bg-slate-800/80 border-l-2 border-transparent'
                } ${isSwitching ? 'opacity-70' : ''}`}
                data-testid={`project-item-${project.id}`}
              >
                <FiFolder
                  size={14}
                  className={`shrink-0 transition-colors ${isActive ? 'text-blue-400' : 'text-slate-400 group-hover:text-slate-400'}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium text-[13px]" title={project.name}>
                    {project.name}
                  </div>
                  <div className="truncate text-[11px] text-slate-400 mt-0.5" title={project.path}>
                    {project.path}
                  </div>
                </div>
                {isSwitching ? (
                  <FiLoader size={14} className="shrink-0 text-blue-400 animate-spin" />
                ) : isActive ? (
                  <FiCheck size={14} className="shrink-0 text-blue-400" />
                ) : (
                  <button
                    type="button"
                    onClick={(e) => handleDelete(e, project.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-600/20 hover:text-red-400 transition-all shrink-0"
                    title="Remove project"
                  >
                    <FiTrash2 size={12} />
                  </button>
                )}
              </button>
            );
          })}
        </div>

        {/* Divider */}
        <div className="border-t border-slate-700/80" />

        {/* Create new project */}
        {showCreate ? (
          <div className="p-3 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-400">New Project</span>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="p-0.5 rounded hover:bg-slate-700 text-slate-400 transition-colors"
              >
                <FiX size={12} />
              </button>
            </div>
            <input
              type="text"
              placeholder="Project name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-900/80 px-2.5 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 focus:outline-none transition-all"
            />
            <input
              type="text"
              placeholder="Project path (e.g. /home/user/my-project)"
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-900/80 px-2.5 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 focus:outline-none transition-all"
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-900/80 px-2.5 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 focus:outline-none transition-all"
            />
            <button
              type="button"
              onClick={handleCreate}
              disabled={!newName.trim() || !newPath.trim()}
              className="w-full rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Create Project
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-slate-400 hover:bg-slate-800/80 hover:text-slate-200 transition-colors"
          >
            <FiFolderPlus size={14} />
            <span>Add Project</span>
          </button>
        )}
      </>
    );
  }

  return (
    <div className="relative px-2 mb-2">
      {/* Current project button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-all duration-150 ${
          isOpen
            ? 'border-blue-500/50 bg-slate-800 ring-1 ring-blue-500/20'
            : 'border-slate-700 bg-slate-800/50 hover:bg-slate-800 hover:border-slate-600'
        }`}
        data-testid="project-switcher"
      >
        <FiFolder size={14} className="text-blue-400 shrink-0" />
        <span
          className="flex-1 truncate text-slate-200 font-medium"
          title={activeProject?.name || ''}
        >
          {loading ? (
            <span className="flex items-center gap-1.5 text-slate-400">
              <FiLoader size={12} className="animate-spin" />
              Loading...
            </span>
          ) : activeProject ? (
            activeProject.name
          ) : (
            <span className="text-slate-400 italic">No project</span>
          )}
        </span>
        <FiChevronDown
          size={14}
          className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              setIsOpen(false);
              setShowCreate(false);
            }}
            onKeyDown={() => {}}
          />

          <div
            ref={dropdownRef}
            className="absolute left-2 right-2 top-full z-50 mt-1 rounded-lg border border-slate-700 shadow-2xl shadow-black/50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150"
            style={{ backgroundColor: '#141c2e' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/80">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Projects
              </span>
              <span className="text-[10px] text-slate-500">
                {projects.length} project{projects.length !== 1 ? 's' : ''}
              </span>
            </div>

            {renderProjectList()}
          </div>
        </>
      )}
    </div>
  );
}
