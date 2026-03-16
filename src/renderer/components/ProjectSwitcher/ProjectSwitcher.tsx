import { useEffect, useRef, useState } from 'react';
import {
  FiAlertTriangle,
  FiCheck,
  FiChevronDown,
  FiFolder,
  FiFolderPlus,
  FiGrid,
  FiLoader,
  FiTrash2,
} from 'react-icons/fi';
import { useProjectStore } from '../../stores/projectStore';
import { Button } from '../ui/button';
import { Separator } from '../ui/separator';
import './ProjectSwitcher.css';

interface ProjectSwitcherProps {
  collapsed: boolean;
  onNavigate?: (page: string) => void;
}

export function ProjectSwitcher({ collapsed, onNavigate }: ProjectSwitcherProps) {
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
  const [switching, setSwitching] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
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
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleBrowseAndCreate = async () => {
    // Close dropdown first so it doesn't interfere with the native dialog
    setIsOpen(false);
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

  const handleDeleteClick = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    setDeleteTarget({ id, name });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    await deleteProject(deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
  };

  const handleDeleteCancel = () => {
    setDeleteTarget(null);
  };

  if (collapsed) {
    return (
      <div className="relative px-2 mb-2">
        <Button
          variant="ghost"
          size="icon"
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex w-full items-center justify-center rounded-md p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
          title={activeProject ? activeProject.name : 'No project selected'}
          data-testid="project-switcher-collapsed"
        >
          <FiFolder size={18} className={activeProject ? 'text-blue-400' : ''} />
        </Button>

        {/* Collapsed dropdown - positioned to the right */}
        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => {
                setIsOpen(false);
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
          {projects.length === 0 && (
            <div className="px-3 py-5 text-center text-xs text-slate-400">
              <FiFolder size={20} className="mx-auto mb-2 text-slate-500" />
              No projects yet. Create one to get started.
            </div>
          )}
          {projects.map((project) => {
            const isActive = activeProject?.id === project.id;
            const isSwitching = switching === project.id;
            return (
              <Button
                variant="ghost"
                type="button"
                key={project.id}
                onClick={() => handleSwitch(project.id)}
                disabled={isSwitching}
                className={`flex h-auto w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm rounded-none transition-all duration-150 group ${
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
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    onClick={(e) => handleDeleteClick(e, project.id, project.name)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-600/20 hover:text-red-400 transition-all shrink-0 h-auto w-auto"
                    title="Delete project"
                    data-testid={`project-delete-${project.id}`}
                  >
                    <FiTrash2 size={12} />
                  </Button>
                )}
              </Button>
            );
          })}
        </div>

        {/* Divider */}
        <Separator className="border-slate-700/80" />

        {/* Open project folder */}
        <Button
          variant="ghost"
          type="button"
          onClick={handleBrowseAndCreate}
          className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-slate-400 hover:bg-slate-800/80 hover:text-slate-200 transition-colors h-auto justify-start rounded-none"
        >
          <FiFolderPlus size={14} />
          <span>Open Project</span>
        </Button>

        {/* All Projects */}
        {onNavigate && (
          <Button
            variant="ghost"
            type="button"
            onClick={() => {
              setIsOpen(false);
              onNavigate('projects');
            }}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-slate-400 hover:bg-slate-800/80 hover:text-slate-200 transition-colors h-auto justify-start rounded-none"
            data-testid="project-switcher-all-projects"
          >
            <FiGrid size={14} />
            <span>All Projects</span>
          </Button>
        )}
      </>
    );
  }

  return (
    <div className="relative px-2 mb-2">
      {/* Delete project confirmation modal */}
      {deleteTarget && (
        <>
          <div
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
            onClick={handleDeleteCancel}
            onKeyDown={() => {}}
            data-testid="delete-project-backdrop"
          />
          <div
            className="fixed left-1/2 top-1/2 z-[101] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/60"
            data-testid="delete-project-modal"
          >
            {/* Warning header */}
            <div className="flex items-center gap-3 border-b border-slate-700/80 px-5 py-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/15">
                <FiAlertTriangle size={20} className="text-red-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-100">Delete Project</h3>
                <p className="text-xs text-slate-400 mt-0.5">This action cannot be undone</p>
              </div>
            </div>

            {/* Body */}
            <div className="px-5 py-4 space-y-3">
              <p className="text-sm text-slate-300">
                Are you sure you want to delete this project?
              </p>
              <div className="rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <FiFolder size={14} className="text-slate-400 shrink-0" />
                  <span className="text-sm font-medium text-slate-200 truncate" data-testid="delete-project-name">
                    {deleteTarget.name}
                  </span>
                </div>
              </div>
              <div className="rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2">
                <p className="text-xs text-amber-400">
                  <strong>Warning:</strong> All project data including agent sessions, logs, metrics, and configuration will be permanently removed from Fleet Command. Your source code files will not be affected.
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 border-t border-slate-700/80 px-5 py-3">
              <Button
                variant="outline"
                onClick={handleDeleteCancel}
                data-testid="delete-project-cancel"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteConfirm}
                disabled={deleting}
                className="flex items-center gap-2"
                data-testid="delete-project-confirm"
              >
                {deleting ? (
                  <>
                    <FiLoader size={14} className="animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <FiTrash2 size={14} />
                    Delete Project
                  </>
                )}
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Current project button */}
      <Button
        variant="ghost"
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex h-auto w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-all duration-150 ${
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
      </Button>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              setIsOpen(false);
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
