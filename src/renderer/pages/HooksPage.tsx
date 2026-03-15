import { useCallback, useEffect, useState } from 'react';
import {
  FiCheck,
  FiChevronDown,
  FiCopy,
  FiEdit2,
  FiPlay,
  FiPlus,
  FiTrash2,
  FiUploadCloud,
  FiX,
  FiXCircle,
} from 'react-icons/fi';
import type { Hook, HookDeployResult, HookType, Project, Worktree } from '../../shared/types';

const HOOK_TYPES: { type: HookType; label: string; description: string }[] = [
  {
    type: 'SessionStart',
    label: 'Session Start',
    description: 'Runs when an agent session begins. Use for environment setup, context injection.',
  },
  {
    type: 'UserPromptSubmit',
    label: 'User Prompt Submit',
    description:
      'Runs when a user prompt is submitted. Use for prompt augmentation, logging, validation.',
  },
  {
    type: 'PreToolUse',
    label: 'Pre Tool Use',
    description:
      'Runs before a tool is invoked. Use for permission checks, argument validation, auditing.',
  },
];

type ViewMode = 'list' | 'create' | 'edit' | 'deploy';

export function HooksPage() {
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [editingHook, setEditingHook] = useState<Hook | null>(null);
  const [loading, setLoading] = useState(true);

  // Deploy state
  const [deploySelectedHooks, setDeploySelectedHooks] = useState<Set<string>>(new Set());
  const [deployWorktrees, setDeployWorktrees] = useState<Worktree[]>([]);
  const [deploySelectedWorktrees, setDeploySelectedWorktrees] = useState<Set<string>>(new Set());
  const [deployResults, setDeployResults] = useState<HookDeployResult[] | null>(null);
  const [deploying, setDeploying] = useState(false);

  // Create/edit form state
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<HookType>('SessionStart');
  const [formDescription, setFormDescription] = useState('');
  const [formScript, setFormScript] = useState('#!/bin/bash\n\n# Hook script\n');
  const [formProjectId, setFormProjectId] = useState<string>('');

  const loadHooks = useCallback(async () => {
    setLoading(true);
    try {
      const filters: { project_id?: string; hook_type?: string } = {};
      if (selectedProjectId !== 'all') {
        filters.project_id = selectedProjectId;
      }
      if (filterType !== 'all') {
        filters.hook_type = filterType;
      }
      const result = await window.electronAPI.hookList(filters);
      if (result.data) {
        setHooks(result.data);
      }
    } catch (err) {
      console.error('Failed to load hooks:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId, filterType]);

  const loadProjects = useCallback(async () => {
    try {
      const result = await window.electronAPI.projectList();
      if (result.data) {
        setProjects(result.data);
      }
    } catch (err) {
      console.error('Failed to load projects:', err);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    loadHooks();
  }, [loadHooks]);

  const handleCreate = async () => {
    if (!formName.trim()) return;
    const id = `hook-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    try {
      await window.electronAPI.hookCreate({
        id,
        project_id: formProjectId || undefined,
        hook_type: formType,
        name: formName.trim(),
        description: formDescription.trim() || undefined,
        script_content: formScript,
      });
      resetForm();
      setViewMode('list');
      loadHooks();
    } catch (err) {
      console.error('Failed to create hook:', err);
    }
  };

  const handleUpdate = async () => {
    if (!editingHook || !formName.trim()) return;
    try {
      await window.electronAPI.hookUpdate(editingHook.id, {
        hook_type: formType,
        name: formName.trim(),
        description: formDescription.trim(),
        script_content: formScript,
        project_id: formProjectId || null,
      });
      resetForm();
      setEditingHook(null);
      setViewMode('list');
      loadHooks();
    } catch (err) {
      console.error('Failed to update hook:', err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await window.electronAPI.hookDelete(id);
      loadHooks();
    } catch (err) {
      console.error('Failed to delete hook:', err);
    }
  };

  const startEdit = (hook: Hook) => {
    setEditingHook(hook);
    setFormName(hook.name);
    setFormType(hook.hook_type);
    setFormDescription(hook.description || '');
    setFormScript(hook.script_content);
    setFormProjectId(hook.project_id || '');
    setViewMode('edit');
  };

  const startDeploy = async () => {
    setDeploySelectedHooks(new Set());
    setDeploySelectedWorktrees(new Set());
    setDeployResults(null);
    // Load worktrees from active project
    try {
      const activeProject = await window.electronAPI.projectGetActive();
      if (activeProject.data?.path) {
        const wtResult = await window.electronAPI.worktreeList(activeProject.data.path);
        if (wtResult.data) {
          setDeployWorktrees(wtResult.data);
        }
      }
    } catch {
      // No active project or worktrees - that's okay
    }
    setViewMode('deploy');
  };

  const executeDeploy = async () => {
    if (deploySelectedHooks.size === 0 || deploySelectedWorktrees.size === 0) return;
    setDeploying(true);
    try {
      const result = await window.electronAPI.hookDeploy(
        Array.from(deploySelectedHooks),
        Array.from(deploySelectedWorktrees),
      );
      if (result.data) {
        setDeployResults(result.data);
      }
      loadHooks();
    } catch (err) {
      console.error('Failed to deploy hooks:', err);
    } finally {
      setDeploying(false);
    }
  };

  const resetForm = () => {
    setFormName('');
    setFormType('SessionStart');
    setFormDescription('');
    setFormScript('#!/bin/bash\n\n# Hook script\n');
    setFormProjectId('');
  };

  const hooksByType = HOOK_TYPES.map((ht) => ({
    ...ht,
    hooks: hooks.filter((h) => h.hook_type === ht.type),
  }));

  const projectName = (id: string | null) => {
    if (!id) return 'Global';
    const p = projects.find((pr) => pr.id === id);
    return p ? p.name : id;
  };

  if (viewMode === 'create' || viewMode === 'edit') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-50">
            {viewMode === 'create' ? 'Create Hook' : 'Edit Hook'}
          </h1>
          <button
            type="button"
            onClick={() => {
              resetForm();
              setEditingHook(null);
              setViewMode('list');
            }}
            className="flex items-center gap-2 rounded-md bg-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-600"
          >
            <FiX size={14} />
            Cancel
          </button>
        </div>

        <div className="space-y-4 rounded-lg border border-slate-700 bg-slate-800/50 p-6">
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1 block text-sm text-slate-400">Hook Name</span>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g., inject-context"
                className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-slate-400">Hook Type</span>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value as HookType)}
                className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-50 focus:border-blue-500 focus:outline-none"
              >
                {HOOK_TYPES.map((ht) => (
                  <option key={ht.type} value={ht.type}>
                    {ht.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-sm text-slate-400">Project (optional)</span>
            <select
              value={formProjectId}
              onChange={(e) => setFormProjectId(e.target.value)}
              className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-50 focus:border-blue-500 focus:outline-none"
            >
              <option value="">Global (all projects)</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-slate-400">Description</span>
            <input
              type="text"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="Brief description of what this hook does"
              className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-slate-400">Script Content</span>
            <textarea
              value={formScript}
              onChange={(e) => setFormScript(e.target.value)}
              rows={12}
              className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 font-mono text-sm text-slate-50 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              spellCheck={false}
            />
          </label>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={viewMode === 'create' ? handleCreate : handleUpdate}
              disabled={!formName.trim()}
              className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FiCheck size={14} />
              {viewMode === 'create' ? 'Create Hook' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (viewMode === 'deploy') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-50">Deploy Hooks to Worktrees</h1>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className="flex items-center gap-2 rounded-md bg-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-600"
          >
            <FiX size={14} />
            Cancel
          </button>
        </div>

        {/* Select Hooks */}
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-300 uppercase tracking-wider">
            1. Select Hooks to Deploy
          </h2>
          {hooks.length === 0 ? (
            <p className="text-sm text-slate-500">No hooks available. Create hooks first.</p>
          ) : (
            <div className="space-y-2">
              {hooks.map((hook) => (
                <label
                  key={hook.id}
                  className="flex items-center gap-3 rounded-md border border-slate-700 bg-slate-900 p-3 cursor-pointer hover:border-slate-600"
                >
                  <input
                    type="checkbox"
                    checked={deploySelectedHooks.has(hook.id)}
                    onChange={(e) => {
                      const next = new Set(deploySelectedHooks);
                      if (e.target.checked) {
                        next.add(hook.id);
                      } else {
                        next.delete(hook.id);
                      }
                      setDeploySelectedHooks(next);
                    }}
                    className="rounded border-slate-600"
                  />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-slate-200">{hook.name}</span>
                    <span className="ml-2 rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-400">
                      {hook.hook_type}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500">{projectName(hook.project_id)}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Select Worktrees */}
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-300 uppercase tracking-wider">
            2. Select Target Worktrees
          </h2>
          {deployWorktrees.length === 0 ? (
            <p className="text-sm text-slate-500">
              No worktrees found. Ensure a project is active with git worktrees.
            </p>
          ) : (
            <div className="space-y-2">
              {deployWorktrees.map((wt) => (
                <label
                  key={wt.path}
                  className="flex items-center gap-3 rounded-md border border-slate-700 bg-slate-900 p-3 cursor-pointer hover:border-slate-600"
                >
                  <input
                    type="checkbox"
                    checked={deploySelectedWorktrees.has(wt.path)}
                    onChange={(e) => {
                      const next = new Set(deploySelectedWorktrees);
                      if (e.target.checked) {
                        next.add(wt.path);
                      } else {
                        next.delete(wt.path);
                      }
                      setDeploySelectedWorktrees(next);
                    }}
                    className="rounded border-slate-600"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-slate-200">
                      {wt.branch || 'detached'}
                    </span>
                    <p className="truncate text-xs text-slate-500">{wt.path}</p>
                  </div>
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      wt.isMain ? 'bg-blue-900/50 text-blue-400' : 'bg-slate-700 text-slate-400'
                    }`}
                  >
                    {wt.isMain ? 'main' : 'worktree'}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Deploy button */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={executeDeploy}
            disabled={
              deploySelectedHooks.size === 0 || deploySelectedWorktrees.size === 0 || deploying
            }
            className="flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FiUploadCloud size={14} />
            {deploying
              ? 'Deploying...'
              : `Deploy ${deploySelectedHooks.size} hook(s) to ${deploySelectedWorktrees.size} worktree(s)`}
          </button>
        </div>

        {/* Deploy results */}
        {deployResults && (
          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-300 uppercase tracking-wider">
              Deploy Results
            </h2>
            <div className="space-y-2">
              {deployResults.map((r, i) => (
                <div
                  key={`${r.hookId}-${r.worktree}-${i}`}
                  className={`flex items-center gap-3 rounded-md border p-2 text-sm ${
                    r.success
                      ? 'border-green-800 bg-green-900/20 text-green-400'
                      : 'border-red-800 bg-red-900/20 text-red-400'
                  }`}
                >
                  {r.success ? <FiCheck size={14} /> : <FiXCircle size={14} />}
                  <span className="flex-1 truncate">
                    {r.hookId} → {r.worktree}
                  </span>
                  {r.error && <span className="text-xs text-red-400">{r.error}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Main list view
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">Hooks</h1>
          <p className="mt-1 text-sm text-slate-400">
            View and manage deployed hooks per project (SessionStart, UserPromptSubmit, PreToolUse)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={startDeploy}
            className="flex items-center gap-2 rounded-md bg-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-600"
          >
            <FiUploadCloud size={14} />
            Deploy
          </button>
          <button
            type="button"
            onClick={() => {
              resetForm();
              setViewMode('create');
            }}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            <FiPlus size={14} />
            New Hook
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2">
          <span className="text-sm text-slate-400">Project:</span>
          <div className="relative">
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="appearance-none rounded-md border border-slate-600 bg-slate-800 pl-3 pr-8 py-1.5 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
            >
              <option value="all">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <FiChevronDown
              size={14}
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"
            />
          </div>
        </label>

        <label className="flex items-center gap-2">
          <span className="text-sm text-slate-400">Type:</span>
          <div className="relative">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="appearance-none rounded-md border border-slate-600 bg-slate-800 pl-3 pr-8 py-1.5 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
            >
              <option value="all">All Types</option>
              {HOOK_TYPES.map((ht) => (
                <option key={ht.type} value={ht.type}>
                  {ht.label}
                </option>
              ))}
            </select>
            <FiChevronDown
              size={14}
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"
            />
          </div>
        </label>

        <span className="text-sm text-slate-500">
          {hooks.length} hook{hooks.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      ) : hooks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-700 py-16">
          <FiPlay size={40} className="mb-4 text-slate-600" />
          <p className="text-lg font-medium text-slate-400">No hooks configured</p>
          <p className="mt-1 text-sm text-slate-500">
            Create hooks to automate agent lifecycle events
          </p>
          <button
            type="button"
            onClick={() => {
              resetForm();
              setViewMode('create');
            }}
            className="mt-4 flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            <FiPlus size={14} />
            Create First Hook
          </button>
        </div>
      ) : (
        /* Hooks grouped by type */
        <div className="space-y-6">
          {hooksByType
            .filter((group) => filterType === 'all' || group.type === filterType)
            .map((group) => (
              <div key={group.type}>
                <div className="mb-3 flex items-center gap-3">
                  <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
                    {group.label}
                  </h2>
                  <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-400">
                    {group.hooks.length}
                  </span>
                </div>
                <p className="mb-3 text-xs text-slate-500">{group.description}</p>

                {group.hooks.length === 0 ? (
                  <div className="rounded-md border border-dashed border-slate-700 p-4 text-center text-sm text-slate-500">
                    No {group.label} hooks configured
                  </div>
                ) : (
                  <div className="space-y-2">
                    {group.hooks.map((hook) => (
                      <div
                        key={hook.id}
                        className="flex items-center gap-4 rounded-lg border border-slate-700 bg-slate-800/50 p-4 hover:border-slate-600 transition-colors"
                      >
                        {/* Status indicator */}
                        <div
                          className={`flex h-8 w-8 items-center justify-center rounded-full ${
                            hook.is_installed
                              ? 'bg-green-900/50 text-green-400'
                              : 'bg-slate-700 text-slate-400'
                          }`}
                          title={hook.is_installed ? 'Installed' : 'Not installed'}
                        >
                          {hook.is_installed ? <FiCheck size={16} /> : <FiX size={16} />}
                        </div>

                        {/* Hook info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-200">{hook.name}</span>
                            <span
                              className={`rounded px-2 py-0.5 text-xs ${
                                hook.is_installed
                                  ? 'bg-green-900/30 text-green-400'
                                  : 'bg-amber-900/30 text-amber-400'
                              }`}
                            >
                              {hook.is_installed ? 'Installed' : 'Not Installed'}
                            </span>
                          </div>
                          {hook.description && (
                            <p className="mt-0.5 text-xs text-slate-500 truncate">
                              {hook.description}
                            </p>
                          )}
                          <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                            <span>Project: {projectName(hook.project_id)}</span>
                            {hook.installed_at && (
                              <span>
                                Deployed: {new Date(hook.installed_at).toLocaleDateString()}
                              </span>
                            )}
                            {hook.target_worktrees && (
                              <span>
                                {(() => {
                                  try {
                                    return `${JSON.parse(hook.target_worktrees).length} worktree(s)`;
                                  } catch {
                                    return '';
                                  }
                                })()}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => startEdit(hook)}
                            className="rounded p-2 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                            title="Edit hook"
                          >
                            <FiEdit2 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(hook.script_content);
                            }}
                            className="rounded p-2 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                            title="Copy script"
                          >
                            <FiCopy size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(hook.id)}
                            className="rounded p-2 text-slate-400 hover:bg-red-900/50 hover:text-red-400"
                            title="Delete hook"
                          >
                            <FiTrash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
