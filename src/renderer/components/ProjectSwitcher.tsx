import { useEffect, useState } from 'react';
import { FiChevronDown, FiFolder, FiFolderPlus, FiTrash2, FiX } from 'react-icons/fi';
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

  useEffect(() => {
    loadProjects();
    loadActiveProject();
  }, [loadProjects, loadActiveProject]);

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
    await switchProject(id);
    setIsOpen(false);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteProject(id);
  };

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-center rounded-md p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
        title={activeProject ? activeProject.name : 'No project selected'}
      >
        <FiFolder size={18} />
      </button>
    );
  }

  return (
    <div className="relative px-2 mb-2">
      {/* Current project button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2 rounded-md border border-slate-700 bg-slate-800/50 px-3 py-2 text-left text-sm transition-colors hover:bg-slate-800 hover:border-slate-600"
      >
        <FiFolder size={14} className="text-blue-400 shrink-0" />
        <span className="flex-1 truncate text-slate-200">
          {loading ? 'Loading...' : activeProject ? activeProject.name : 'No project'}
        </span>
        <FiChevronDown
          size={14}
          className={`text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
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
            className="absolute left-2 right-2 top-full z-50 mt-1 rounded-lg border border-slate-700 bg-slate-850 shadow-xl overflow-hidden"
            style={{ backgroundColor: '#141c2e' }}
          >
            {/* Project list */}
            <div className="max-h-48 overflow-y-auto">
              {projects.length === 0 && !showCreate && (
                <div className="px-3 py-4 text-center text-xs text-slate-500">
                  No projects yet. Create one to get started.
                </div>
              )}
              {projects.map((project) => (
                <button
                  type="button"
                  key={project.id}
                  onClick={() => handleSwitch(project.id)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors group ${
                    activeProject?.id === project.id
                      ? 'bg-blue-600/20 text-blue-400'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <FiFolder size={13} className="shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium">{project.name}</div>
                    <div className="truncate text-xs text-slate-500">{project.path}</div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => handleDelete(e, project.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-600/20 hover:text-red-400 transition-all shrink-0"
                    title="Remove project"
                  >
                    <FiTrash2 size={12} />
                  </button>
                </button>
              ))}
            </div>

            {/* Divider */}
            <div className="border-t border-slate-700" />

            {/* Create new project */}
            {showCreate ? (
              <div className="p-3 space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-slate-400">New Project</span>
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    className="p-0.5 rounded hover:bg-slate-700 text-slate-500"
                  >
                    <FiX size={12} />
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Project name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Project path (e.g. /home/user/my-project)"
                  value={newPath}
                  onChange={(e) => setNewPath(e.target.value)}
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Description (optional)"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={!newName.trim() || !newPath.trim()}
                  className="w-full rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Create Project
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
              >
                <FiFolderPlus size={14} />
                <span>Add Project</span>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
