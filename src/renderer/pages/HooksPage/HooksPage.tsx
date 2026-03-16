import { useCallback, useEffect, useState } from 'react';
import {
  FiCheck,
  FiCopy,
  FiEdit2,
  FiList,
  FiPlay,
  FiPlus,
  FiTrash2,
  FiUploadCloud,
  FiX,
  FiXCircle,
} from 'react-icons/fi';
import { toast } from 'sonner';
import type {
  Hook,
  HookDeployResult,
  HookType,
  Project,
  Worktree,
} from '../../../shared/types';
import { HookEventLog } from './components';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Checkbox } from '../../components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Tooltip } from '../../components/Tooltip';
import './HooksPage.css';

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
type PageTab = 'hooks' | 'event-log';

// ── Main HooksPage Component ─────────────────────────────────────────

export function HooksPage() {
  const [pageTab, setPageTab] = useState<PageTab>('hooks');
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
      toast.success(`Hook "${formName.trim()}" created`);
      loadHooks();
    } catch (err) {
      console.error('Failed to create hook:', err);
      toast.error('Failed to create hook');
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
      toast.success('Hook updated');
      loadHooks();
    } catch (err) {
      console.error('Failed to update hook:', err);
      toast.error('Failed to update hook');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await window.electronAPI.hookDelete(id);
      toast.success('Hook deleted');
      loadHooks();
    } catch (err) {
      console.error('Failed to delete hook:', err);
      toast.error('Failed to delete hook');
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
        toast.success('Hooks deployed successfully');
      }
      loadHooks();
    } catch (err) {
      console.error('Failed to deploy hooks:', err);
      toast.error('Failed to deploy hooks');
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

  // Tab bar component
  const tabBar = (
    <div className="flex border-b border-slate-700 mb-6">
      <Button
        variant={pageTab === 'hooks' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => setPageTab('hooks')}
        className={`gap-2 rounded-none border-b-2 h-auto px-4 py-2 ${
          pageTab === 'hooks'
            ? 'border-blue-500 text-blue-400 bg-transparent'
            : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'
        }`}
        data-testid="hooks-tab"
      >
        <FiPlay size={14} />
        Hooks
      </Button>
      <Button
        variant={pageTab === 'event-log' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => setPageTab('event-log')}
        className={`gap-2 rounded-none border-b-2 h-auto px-4 py-2 ${
          pageTab === 'event-log'
            ? 'border-blue-500 text-blue-400 bg-transparent'
            : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'
        }`}
        data-testid="event-log-tab"
      >
        <FiList size={14} />
        Event Log
      </Button>
    </div>
  );

  // Event log tab
  if (pageTab === 'event-log') {
    return (
      <div>
        {tabBar}
        <HookEventLog />
      </div>
    );
  }

  if (viewMode === 'create' || viewMode === 'edit') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-50">
            {viewMode === 'create' ? 'Create Hook' : 'Edit Hook'}
          </h1>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              resetForm();
              setEditingHook(null);
              setViewMode('list');
            }}
            className="gap-2 h-auto px-3 py-2"
          >
            <FiX size={14} />
            Cancel
          </Button>
        </div>

        <div className="space-y-4 rounded-lg border border-slate-700 bg-slate-800/50 p-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="block">
              <Label className="mb-1 block text-sm text-slate-400">Hook Name</Label>
              <Input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g., inject-context"
                className="bg-slate-900 border-slate-600 text-slate-50 placeholder:text-slate-400 focus:border-blue-500"
              />
            </div>
            <div className="block">
              <Label className="mb-1 block text-sm text-slate-400">Hook Type</Label>
              <Select value={formType} onValueChange={(v) => setFormType(v as HookType)}>
                <SelectTrigger className="w-full bg-slate-900 border-slate-600 text-sm text-slate-50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOOK_TYPES.map((ht) => (
                    <SelectItem key={ht.type} value={ht.type}>
                      {ht.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="block">
            <Label className="mb-1 block text-sm text-slate-400">Project (optional)</Label>
            <Select value={formProjectId || '__none__'} onValueChange={(v) => setFormProjectId(v === '__none__' ? '' : v)}>
              <SelectTrigger className="w-full bg-slate-900 border-slate-600 text-sm text-slate-50" data-testid="hook-project-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Global (all projects)</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="block">
            <Label className="mb-1 block text-sm text-slate-400">Description</Label>
            <Input
              type="text"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="Brief description of what this hook does"
              className="bg-slate-900 border-slate-600 text-slate-50 placeholder:text-slate-400 focus:border-blue-500"
            />
          </div>

          <div className="block">
            <Label className="mb-1 block text-sm text-slate-400">Script Content</Label>
            <Textarea
              value={formScript}
              onChange={(e) => setFormScript(e.target.value)}
              rows={12}
              className="bg-slate-900 border-slate-600 font-mono text-slate-50 placeholder:text-slate-400 focus:border-blue-500"
              spellCheck={false}
            />
          </div>

          <div className="flex justify-end">
            <Button
              onClick={viewMode === 'create' ? handleCreate : handleUpdate}
              disabled={!formName.trim()}
              className="gap-2 h-auto px-4 py-2 bg-slate-800/90 border border-emerald-500/30 text-emerald-300 hover:bg-slate-700/90 hover:border-emerald-400/40 shadow-sm"
            >
              <FiCheck size={14} />
              {viewMode === 'create' ? 'Create Hook' : 'Save Changes'}
            </Button>
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
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setViewMode('list')}
            className="gap-2 h-auto px-3 py-2"
          >
            <FiX size={14} />
            Cancel
          </Button>
        </div>

        {/* Select Hooks */}
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-300 uppercase tracking-wider">
            1. Select Hooks to Deploy
          </h2>
          {hooks.length === 0 ? (
            <p className="text-sm text-slate-400">No hooks available. Create hooks first.</p>
          ) : (
            <div className="space-y-2">
              {hooks.map((hook) => (
                <label
                  key={hook.id}
                  className="flex items-center gap-3 rounded-md border border-slate-700 bg-slate-900 p-3 cursor-pointer hover:border-slate-600"
                >
                  <Checkbox
                    checked={deploySelectedHooks.has(hook.id)}
                    onCheckedChange={(checked) => {
                      const next = new Set(deploySelectedHooks);
                      if (checked === true) {
                        next.add(hook.id);
                      } else {
                        next.delete(hook.id);
                      }
                      setDeploySelectedHooks(next);
                    }}
                    className="border-slate-600 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500"
                  />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-slate-200">{hook.name}</span>
                    <Badge variant="secondary" className="ml-2 bg-slate-700 text-slate-400">
                      {hook.hook_type}
                    </Badge>
                  </div>
                  <span className="text-xs text-slate-400">{projectName(hook.project_id)}</span>
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
            <p className="text-sm text-slate-400">
              No worktrees found. Ensure a project is active with git worktrees.
            </p>
          ) : (
            <div className="space-y-2">
              {deployWorktrees.map((wt) => (
                <label
                  key={wt.path}
                  className="flex items-center gap-3 rounded-md border border-slate-700 bg-slate-900 p-3 cursor-pointer hover:border-slate-600"
                >
                  <Checkbox
                    checked={deploySelectedWorktrees.has(wt.path)}
                    onCheckedChange={(checked) => {
                      const next = new Set(deploySelectedWorktrees);
                      if (checked === true) {
                        next.add(wt.path);
                      } else {
                        next.delete(wt.path);
                      }
                      setDeploySelectedWorktrees(next);
                    }}
                    className="border-slate-600 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-slate-200">
                      {wt.branch || 'detached'}
                    </span>
                    <p className="truncate text-xs text-slate-400" title={wt.path}>
                      {wt.path}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={`${
                      wt.isMain ? 'bg-blue-900/50 text-blue-400' : 'bg-slate-700 text-slate-400'
                    }`}
                  >
                    {wt.isMain ? 'main' : 'worktree'}
                  </Badge>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Deploy button */}
        <div className="flex items-center gap-4">
          <Button
            onClick={executeDeploy}
            disabled={
              deploySelectedHooks.size === 0 || deploySelectedWorktrees.size === 0 || deploying
            }
            className="gap-2 h-auto px-4 py-2 bg-slate-800/90 border border-sky-500/30 text-sky-300 hover:bg-slate-700/90 hover:border-sky-400/40 shadow-sm"
          >
            <FiUploadCloud size={14} />
            {deploying
              ? 'Deploying...'
              : `Deploy ${deploySelectedHooks.size} hook(s) to ${deploySelectedWorktrees.size} worktree(s)`}
          </Button>
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
                  <span className="flex-1 truncate" title={`${r.hookId} → ${r.worktree}`}>
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
      {tabBar}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">Hooks</h1>
          <p className="mt-1 text-sm text-slate-400">
            View and manage deployed hooks per project (SessionStart, UserPromptSubmit, PreToolUse)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={startDeploy}
            className="gap-2 h-auto px-3 py-2"
          >
            <FiUploadCloud size={14} />
            Deploy
          </Button>
          <Button
            size="sm"
            onClick={() => {
              resetForm();
              setViewMode('create');
            }}
            className="gap-2 h-auto px-3 py-2 bg-slate-800/90 border border-blue-500/30 text-blue-300 hover:bg-slate-700/90 hover:border-blue-400/40 shadow-sm"
          >
            <FiPlus size={14} />
            New Hook
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">Project:</span>
          <Select value={selectedProjectId} onValueChange={(v) => setSelectedProjectId(v)}>
            <SelectTrigger className="w-auto bg-slate-800 border-slate-600 text-sm text-slate-200" data-testid="hook-project-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">Type:</span>
          <Select value={filterType} onValueChange={(v) => setFilterType(v)}>
            <SelectTrigger className="w-auto bg-slate-800 border-slate-600 text-sm text-slate-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {HOOK_TYPES.map((ht) => (
                <SelectItem key={ht.type} value={ht.type}>
                  {ht.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <span className="text-sm text-slate-400">
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
          <FiPlay size={40} className="mb-4 text-slate-500" />
          <p className="text-lg font-medium text-slate-400">No hooks configured</p>
          <p className="mt-1 text-sm text-slate-400">
            Create hooks to automate agent lifecycle events
          </p>
          <Button
            onClick={() => {
              resetForm();
              setViewMode('create');
            }}
            className="mt-4 gap-2 h-auto px-4 py-2 bg-slate-800/90 border border-blue-500/30 text-blue-300 hover:bg-slate-700/90 hover:border-blue-400/40 shadow-sm"
          >
            <FiPlus size={14} />
            Create First Hook
          </Button>
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
                  <Badge variant="secondary" className="rounded-full bg-slate-700 text-slate-400">
                    {group.hooks.length}
                  </Badge>
                </div>
                <p className="mb-3 text-xs text-slate-400">{group.description}</p>

                {group.hooks.length === 0 ? (
                  <div className="rounded-md border border-dashed border-slate-700 p-4 text-center text-sm text-slate-400">
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
                            <Badge
                              variant="outline"
                              className={`${
                                hook.is_installed
                                  ? 'bg-green-900/30 text-green-400 border-green-900/50'
                                  : 'bg-amber-900/30 text-amber-400 border-amber-900/50'
                              }`}
                            >
                              {hook.is_installed ? 'Installed' : 'Not Installed'}
                            </Badge>
                          </div>
                          {hook.description && (
                            <p
                              className="mt-0.5 text-xs text-slate-400 truncate"
                              title={hook.description}
                            >
                              {hook.description}
                            </p>
                          )}
                          <div className="mt-1 flex items-center gap-3 text-xs text-slate-400">
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
                          <Tooltip content="Edit hook">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => startEdit(hook)}
                              className="h-auto w-auto p-2 text-slate-400 hover:text-slate-200"
                            >
                              <FiEdit2 size={14} />
                            </Button>
                          </Tooltip>
                          <Tooltip content="Copy script">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                navigator.clipboard.writeText(hook.script_content);
                              }}
                              className="h-auto w-auto p-2 text-slate-400 hover:text-slate-200"
                            >
                              <FiCopy size={14} />
                            </Button>
                          </Tooltip>
                          <Tooltip content="Delete hook">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(hook.id)}
                              className="h-auto w-auto p-2 text-slate-400 hover:bg-red-900/50 hover:text-red-400"
                            >
                              <FiTrash2 size={14} />
                            </Button>
                          </Tooltip>
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
