import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  FiAlertTriangle,
  FiCheck,
  FiCheckCircle,
  FiChevronDown,
  FiClock,
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
import type {
  Hook,
  HookDeployResult,
  HookEvent,
  HookType,
  Project,
  Worktree,
} from '../../shared/types';

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

// ── Hook Event Log Component ─────────────────────────────────────────
function HookEventLog() {
  const [events, setEvents] = useState<HookEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const filters: { hook_type?: string; status?: string; limit?: number } = { limit: 200 };
      if (filterType !== 'all') {
        filters.hook_type = filterType;
      }
      if (filterStatus !== 'all') {
        filters.status = filterStatus;
      }
      const result = await window.electronAPI.hookEventList(filters);
      if (result.data) {
        setEvents(result.data);
      }
    } catch (err) {
      console.error('Failed to load hook events:', err);
    } finally {
      setLoading(false);
    }
  }, [filterType, filterStatus]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const statusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <FiCheckCircle size={14} className="text-green-400" />;
      case 'failure':
        return <FiXCircle size={14} className="text-red-400" />;
      case 'error':
        return <FiAlertTriangle size={14} className="text-amber-400" />;
      default:
        return <FiClock size={14} className="text-slate-400" />;
    }
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      success: 'bg-green-900/30 text-green-400',
      failure: 'bg-red-900/30 text-red-400',
      error: 'bg-amber-900/30 text-amber-400',
    };
    return colors[status] || 'bg-slate-700 text-slate-400';
  };

  const triggerLabel = (trigger: string) => {
    const labels: Record<string, string> = {
      deploy: 'Deploy',
      manual: 'Manual',
      session_start: 'Session Start',
      user_prompt: 'User Prompt',
      pre_tool: 'Pre Tool Use',
    };
    return labels[trigger] || trigger;
  };

  const formatTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return 'just now';
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr}h ago`;
      const diffDay = Math.floor(diffHr / 24);
      return `${diffDay}d ago`;
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6" data-testid="hook-event-log">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">Hook Event Log</h1>
          <p className="mt-1 text-sm text-slate-400">
            Chronological log of hook executions and their results
          </p>
        </div>
        <button
          type="button"
          onClick={loadEvents}
          className="flex items-center gap-2 rounded-md bg-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-600"
        >
          <FiList size={14} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2">
          <span className="text-sm text-slate-400">Type:</span>
          <div className="relative">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="appearance-none rounded-md border border-slate-600 bg-slate-800 pl-3 pr-8 py-1.5 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
            >
              <option value="all">All Types</option>
              <option value="SessionStart">Session Start</option>
              <option value="UserPromptSubmit">User Prompt Submit</option>
              <option value="PreToolUse">Pre Tool Use</option>
            </select>
            <FiChevronDown
              size={14}
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"
            />
          </div>
        </label>

        <label className="flex items-center gap-2">
          <span className="text-sm text-slate-400">Status:</span>
          <div className="relative">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="appearance-none rounded-md border border-slate-600 bg-slate-800 pl-3 pr-8 py-1.5 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="success">Success</option>
              <option value="failure">Failure</option>
              <option value="error">Error</option>
            </select>
            <FiChevronDown
              size={14}
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"
            />
          </div>
        </label>

        <span className="text-sm text-slate-500">
          {events.length} event{events.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Events list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-700 py-16">
          <FiList size={40} className="mb-4 text-slate-600" />
          <p className="text-lg font-medium text-slate-400">No hook events recorded</p>
          <p className="mt-1 text-sm text-slate-500">
            Events will appear here when hooks are deployed or executed
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((event) => (
            <div
              key={event.id}
              data-testid="hook-event-row"
              className="rounded-lg border border-slate-700 bg-slate-800/50 hover:border-slate-600 transition-colors"
            >
              <button
                type="button"
                onClick={() => setExpandedId(expandedId === event.id ? null : event.id)}
                className="flex w-full items-center gap-4 p-4 text-left"
              >
                {/* Status icon */}
                <div className="flex-shrink-0">{statusIcon(event.status)}</div>

                {/* Event info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-200">{event.hook_name}</span>
                    <span className="rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-400">
                      {event.hook_type}
                    </span>
                    <span className={`rounded px-2 py-0.5 text-xs ${statusBadge(event.status)}`}>
                      {event.status}
                    </span>
                    <span className="rounded bg-indigo-900/30 px-2 py-0.5 text-xs text-indigo-400">
                      {triggerLabel(event.trigger)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                    <span>{formatTime(event.created_at)}</span>
                    {event.agent_name && <span>Agent: {event.agent_name}</span>}
                    {event.worktree && (
                      <span className="truncate max-w-[200px]" title={event.worktree}>
                        {event.worktree}
                      </span>
                    )}
                    {event.duration_ms != null && <span>{event.duration_ms}ms</span>}
                  </div>
                </div>

                {/* Expand indicator */}
                <FiChevronDown
                  size={14}
                  className={`text-slate-500 transition-transform ${expandedId === event.id ? 'rotate-180' : ''}`}
                />
              </button>

              {/* Expanded details */}
              {expandedId === event.id && (
                <div
                  className="border-t border-slate-700 px-4 py-3 space-y-2"
                  data-testid="hook-event-details"
                >
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500">Event ID:</span>{' '}
                      <span className="text-slate-300 font-mono">{event.id}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Hook ID:</span>{' '}
                      <span className="text-slate-300 font-mono">{event.hook_id}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Timestamp:</span>{' '}
                      <span className="text-slate-300">
                        {new Date(event.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Trigger:</span>{' '}
                      <span className="text-slate-300">{triggerLabel(event.trigger)}</span>
                    </div>
                    {event.agent_name && (
                      <div>
                        <span className="text-slate-500">Agent:</span>{' '}
                        <span className="text-slate-300">{event.agent_name}</span>
                      </div>
                    )}
                    {event.duration_ms != null && (
                      <div>
                        <span className="text-slate-500">Duration:</span>{' '}
                        <span className="text-slate-300">{event.duration_ms}ms</span>
                      </div>
                    )}
                  </div>
                  {event.worktree && (
                    <div className="text-xs">
                      <span className="text-slate-500">Worktree:</span>{' '}
                      <span className="text-slate-300 font-mono break-all">{event.worktree}</span>
                    </div>
                  )}
                  {event.details && (
                    <div className="text-xs">
                      <span className="text-slate-500">Details:</span>{' '}
                      <span className="text-slate-300">{event.details}</span>
                    </div>
                  )}
                  {event.error_message && (
                    <div className="rounded bg-red-900/20 border border-red-800 p-2 text-xs">
                      <span className="text-red-400 font-medium">Error: </span>
                      <span className="text-red-300">{event.error_message}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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
      <button
        type="button"
        onClick={() => setPageTab('hooks')}
        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
          pageTab === 'hooks'
            ? 'border-blue-500 text-blue-400'
            : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'
        }`}
        data-testid="hooks-tab"
      >
        <span className="flex items-center gap-2">
          <FiPlay size={14} />
          Hooks
        </span>
      </button>
      <button
        type="button"
        onClick={() => setPageTab('event-log')}
        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
          pageTab === 'event-log'
            ? 'border-blue-500 text-blue-400'
            : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'
        }`}
        data-testid="event-log-tab"
      >
        <span className="flex items-center gap-2">
          <FiList size={14} />
          Event Log
        </span>
      </button>
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
