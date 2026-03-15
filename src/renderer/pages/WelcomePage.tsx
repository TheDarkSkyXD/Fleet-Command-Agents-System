import { useEffect, useMemo, useState } from 'react';
import type { Project } from '../../shared/types';
import { formatAbsoluteTime } from '../components/RelativeTime';
import { useFormDirtyTracking } from '../hooks/useUnsavedChanges';
import { useProjectStore } from '../stores/projectStore';

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Never opened';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function ProjectCard({
  project,
  isActive,
  onSelect,
}: {
  project: Project;
  isActive: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(project.id)}
      className={`group w-full rounded-lg border p-4 text-left transition-all hover:scale-[1.01] ${
        isActive
          ? 'border-blue-500/50 bg-blue-500/10 hover:bg-blue-500/15'
          : 'border-slate-700 bg-slate-800/50 hover:border-slate-600 hover:bg-slate-800'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-slate-50 truncate" title={project.name}>
              {project.name}
            </span>
            {isActive && (
              <span className="inline-flex items-center rounded-full bg-blue-500/20 px-2 py-0.5 text-xs font-medium text-blue-400 border border-blue-500/30">
                Active
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-400 font-mono truncate" title={project.path}>
            {project.path}
          </p>
          {project.description && (
            <p className="mt-2 text-sm text-slate-500 line-clamp-2">{project.description}</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <span
            className="text-xs text-slate-500"
            title={project.last_opened_at ? formatAbsoluteTime(project.last_opened_at) : undefined}
          >
            {formatRelativeTime(project.last_opened_at)}
          </span>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
        <span
          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 ${
            isActive
              ? 'bg-emerald-500/15 text-emerald-400'
              : 'bg-slate-700/50 text-slate-400 group-hover:bg-blue-500/15 group-hover:text-blue-400'
          }`}
        >
          {isActive ? '\u2714 Current' : '\u2192 Open'}
        </span>
      </div>
    </button>
  );
}

function AddProjectForm({
  onCreated,
}: {
  onCreated: () => void;
}) {
  const { createProject, switchProject } = useProjectStore();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; path?: string }>({});
  const [touched, setTouched] = useState<{ name?: boolean; path?: boolean }>({});

  // Track project creation form dirty state for beforeunload warning
  const isProjectFormDirty = useMemo(
    () => showForm && (name.trim() !== '' || path.trim() !== '' || description.trim() !== ''),
    [showForm, name, path, description],
  );
  useFormDirtyTracking('project-create-form', 'Create Project Form', isProjectFormDirty);

  const validateField = (field: 'name' | 'path', value: string) => {
    let error: string | undefined;
    if (field === 'name') {
      if (!value.trim()) {
        error = 'Project Name is required';
      } else if (value.trim().length > 100) {
        error = 'Project Name must be 100 characters or fewer';
      }
    } else if (field === 'path') {
      if (!value.trim()) {
        error = 'Project Path is required';
      } else if (!/^[a-zA-Z]:[/\\]|^\//.test(value.trim())) {
        error = 'Project Path must be an absolute path (e.g. /home/user/project or C:\\projects)';
      }
    }
    setFieldErrors((prev) => {
      if (error) return { ...prev, [field]: error };
      const next = { ...prev };
      delete next[field];
      return next;
    });
    return !error;
  };

  const validateAll = (): boolean => {
    const nameValid = validateField('name', name);
    const pathValid = validateField('path', path);
    setTouched({ name: true, path: true });
    return nameValid && pathValid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateAll()) return;
    setCreating(true);
    try {
      const project = await createProject(
        name.trim(),
        path.trim(),
        description.trim() || undefined,
      );
      if (project) {
        await switchProject(project.id);
        setName('');
        setPath('');
        setDescription('');
        setFieldErrors({});
        setTouched({});
        setShowForm(false);
        onCreated();
      }
    } finally {
      setCreating(false);
    }
  };

  if (!showForm) {
    return (
      <button
        type="button"
        onClick={() => setShowForm(true)}
        data-testid="add-project-button"
        className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-700 p-6 text-sm text-slate-400 transition-colors hover:border-blue-500/50 hover:text-blue-400 hover:bg-blue-500/5"
      >
        <span className="text-xl">+</span>
        <span>Add New Project</span>
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-slate-700 bg-slate-800/50 p-4 space-y-3"
    >
      <h3 className="text-sm font-semibold text-slate-300">New Project</h3>
      <div>
        <label htmlFor="proj-name" className="block text-xs font-medium text-slate-400 mb-1">
          Project Name <span className="text-red-400">*</span>
        </label>
        <input
          id="proj-name"
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (touched.name) validateField('name', e.target.value);
          }}
          onBlur={() => {
            setTouched((prev) => ({ ...prev, name: true }));
            validateField('name', name);
          }}
          placeholder="My App"
          data-testid="proj-name-input"
          className={`w-full rounded-md border bg-slate-900 px-3 py-2 text-sm text-slate-50 placeholder-slate-500 focus:outline-none focus:ring-1 ${
            touched.name && fieldErrors.name
              ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
              : 'border-slate-600 focus:border-blue-500 focus:ring-blue-500'
          }`}
        />
        {touched.name && fieldErrors.name && (
          <p className="mt-1 text-xs text-red-400" data-testid="proj-name-error">{fieldErrors.name}</p>
        )}
      </div>
      <div>
        <label htmlFor="proj-path" className="block text-xs font-medium text-slate-400 mb-1">
          Project Path <span className="text-red-400">*</span>
        </label>
        <input
          id="proj-path"
          type="text"
          value={path}
          onChange={(e) => {
            setPath(e.target.value);
            if (touched.path) validateField('path', e.target.value);
          }}
          onBlur={() => {
            setTouched((prev) => ({ ...prev, path: true }));
            validateField('path', path);
          }}
          placeholder="/home/user/projects/my-app"
          data-testid="proj-path-input"
          className={`w-full rounded-md border bg-slate-900 px-3 py-2 text-sm text-slate-50 font-mono placeholder-slate-500 focus:outline-none focus:ring-1 ${
            touched.path && fieldErrors.path
              ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
              : 'border-slate-600 focus:border-blue-500 focus:ring-blue-500'
          }`}
        />
        {touched.path && fieldErrors.path && (
          <p className="mt-1 text-xs text-red-400" data-testid="proj-path-error">{fieldErrors.path}</p>
        )}
      </div>
      <div>
        <label htmlFor="proj-desc" className="block text-xs font-medium text-slate-400 mb-1">
          Description (optional)
        </label>
        <input
          id="proj-desc"
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief description..."
          className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-50 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={() => setShowForm(false)}
          className="rounded-md border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!name.trim() || !path.trim() || creating}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {creating ? 'Creating...' : 'Create & Open'}
        </button>
      </div>
    </form>
  );
}

export function WelcomePage({
  onProjectOpened,
}: {
  onProjectOpened: () => void;
}) {
  const { projects, activeProject, loadProjects, switchProject } = useProjectStore();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadProjects().then(() => setLoaded(true));
  }, [loadProjects]);

  const handleSelectProject = async (id: string) => {
    await switchProject(id);
    onProjectOpened();
  };

  const recentProjects = projects.slice(0, 10); // Show up to 10 recent projects

  return (
    <div className="flex h-full items-center justify-center">
      <div className="w-full max-w-2xl px-6">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-slate-50 tracking-tight">
            {'\u2693'} Fleet Command
          </h1>
          <p className="mt-2 text-sm text-slate-400">Multi-agent AI coding orchestration</p>
        </div>

        {/* Recent Projects */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-200">Recent Projects</h2>
            {recentProjects.length > 0 && (
              <span className="text-xs text-slate-500">
                {recentProjects.length} project
                {recentProjects.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {!loaded ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            </div>
          ) : recentProjects.length === 0 ? (
            <div
              className="rounded-lg border border-slate-700 bg-slate-800/30 p-10 text-center"
              data-testid="no-projects-empty-state"
            >
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-500/10 border border-blue-500/20">
                <span className="text-3xl">{'\u2693'}</span>
              </div>
              <p className="text-lg font-semibold text-slate-300 mb-2">No projects configured</p>
              <p className="text-sm text-slate-500 mb-6 max-w-sm mx-auto">
                Get started by adding your first project. Point Fleet Command at a Git repository to
                begin orchestrating AI coding agents.
              </p>
              <button
                type="button"
                onClick={() => {
                  const addBtn = document.querySelector('[data-testid="add-project-button"]');
                  if (addBtn instanceof HTMLElement) addBtn.click();
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-500 transition-colors"
                data-testid="open-project-button"
              >
                <span className="text-lg">+</span>
                Open Project
              </button>
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
              {recentProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  isActive={activeProject?.id === project.id}
                  onSelect={handleSelectProject}
                />
              ))}
            </div>
          )}

          {/* Add New Project */}
          <div className="pt-2">
            <AddProjectForm onCreated={onProjectOpened} />
          </div>
        </div>

        {/* Skip to app if there's an active project */}
        {activeProject && (
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={onProjectOpened}
              className="text-sm text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors"
            >
              Continue with {activeProject.name} {'\u2192'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
