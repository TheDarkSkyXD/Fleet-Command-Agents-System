import {
  type ColumnDef,
  type ColumnFiltersState,
  type Row,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FiActivity,
  FiAlertTriangle,
  FiCheckCircle,
  FiChevronDown,
  FiChevronUp,
  FiClipboard,
  FiCopy,
  FiCpu,
  FiEye,
  FiFilter,
  FiGitBranch,
  FiGrid,
  FiList,
  FiLoader,
  FiMap,
  FiPlay,
  FiSearch,
  FiSquare,
  FiUsers,
  FiX,
  FiXCircle,
  FiZap,
} from 'react-icons/fi';
import { toast } from 'sonner';
import { z } from 'zod';
import type {
  AgentCapability,
  AgentProcessInfo,
  RuntimeInfo,
  ScopeOverlap,
  Session,
} from '../../shared/types';
import { AgentHierarchyTree } from '../components/AgentHierarchyTree';
import { AnimatedCard, AnimatedCardContainer } from '../components/AnimatedCard';
import { ContextMenu, type ContextMenuItem, useContextMenu } from '../components/ContextMenu';
import { CoordinatorPanel } from '../components/CoordinatorPanel';
import { FileTreePicker } from '../components/FileTreePicker';
import { ScopeTreeViewer } from '../components/ScopeTreeViewer';
import { useFormDirtyTracking } from '../hooks/useUnsavedChanges';
import { handleIpcError } from '../lib/ipcErrorHandler';
import { useProjectStore } from '../stores/projectStore';
import { DEFAULT_MODEL_DEFAULTS, useSettingsStore } from '../stores/settingsStore';

/** Default model per capability */
const CAPABILITY_DEFAULTS: Record<
  AgentCapability,
  { model: string; description: string; color: string }
> = {
  scout: {
    model: 'haiku',
    description: 'Read-only exploration agent',
    color: 'purple',
  },
  builder: {
    model: 'sonnet',
    description: 'Code implementation agent',
    color: 'blue',
  },
  reviewer: {
    model: 'sonnet',
    description: 'Code review agent',
    color: 'cyan',
  },
  lead: {
    model: 'opus',
    description: 'Team lead / orchestrator',
    color: 'amber',
  },
  merger: {
    model: 'opus',
    description: 'Merge conflict resolution',
    color: 'emerald',
  },
  coordinator: {
    model: 'opus',
    description: 'Multi-agent coordinator',
    color: 'rose',
  },
  monitor: {
    model: 'opus',
    description: 'System health monitor',
    color: 'teal',
  },
};

const CAPABILITY_COLORS: Record<string, string> = {
  scout: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  builder: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  reviewer: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  lead: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  merger: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  coordinator: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  monitor: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
};

const STATE_COLORS: Record<string, string> = {
  booting: 'bg-blue-500/20 text-blue-400',
  working: 'bg-green-500/20 text-green-400',
  completed: 'bg-slate-500/20 text-slate-400',
  stalled: 'bg-amber-500/20 text-amber-400',
  zombie: 'bg-red-500/20 text-red-400',
};

const STATE_DOT_COLORS: Record<string, string> = {
  booting: 'bg-blue-400 animate-pulse',
  working: 'bg-green-400 animate-activity-pulse',
  completed: 'bg-slate-400',
  stalled: 'bg-amber-400',
  zombie: 'bg-red-400',
};

/** State-specific icons for visual distinction */
const STATE_ICONS: Record<string, { icon: React.ReactNode; className: string }> = {
  booting: { icon: <FiLoader className="h-3.5 w-3.5 animate-spin" />, className: 'text-blue-400' },
  working: {
    icon: <FiActivity className="h-3.5 w-3.5" />,
    className: 'text-green-400 animate-pulse',
  },
  completed: { icon: <FiCheckCircle className="h-3.5 w-3.5" />, className: 'text-slate-400' },
  stalled: { icon: <FiAlertTriangle className="h-3.5 w-3.5" />, className: 'text-amber-400' },
  zombie: { icon: <FiXCircle className="h-3.5 w-3.5" />, className: 'text-red-400 animate-pulse' },
};

/** Human-readable state descriptions for hover tooltips */
const STATE_TOOLTIPS: Record<string, string> = {
  booting: 'Agent is starting up and initializing',
  working: 'Agent is actively processing tasks',
  completed: 'Agent has finished all assigned work',
  stalled: 'Agent appears stuck or unresponsive',
  zombie:
    'Zombie: Agent process has died unexpectedly. The session remains but the process is no longer running. Stop and respawn to recover.',
};

/** Human-readable capability descriptions for hover tooltips */
const CAPABILITY_TOOLTIPS: Record<string, string> = {
  scout: 'Explores codebase and gathers information',
  builder: 'Writes and modifies code to implement features',
  reviewer: 'Reviews code changes for quality and correctness',
  lead: 'Coordinates and delegates work to other agents',
  merger: 'Handles git merge operations and conflict resolution',
  coordinator: 'Orchestrates the entire agent swarm',
  monitor: 'Watches for issues and reports anomalies',
};

const MODELS = ['haiku', 'sonnet', 'opus'];

const ALL_CAPABILITIES: AgentCapability[] = [
  'scout',
  'builder',
  'reviewer',
  'lead',
  'merger',
  'coordinator',
  'monitor',
];

function generateId(): string {
  return `agent-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

function generateName(capability: AgentCapability): string {
  const adjectives = ['swift', 'keen', 'bold', 'sharp', 'steady', 'bright', 'calm', 'quick'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  return `${adj}-${capability}-${Math.floor(Math.random() * 1000)}`;
}

function formatUptime(createdAt: string): string {
  const uptime = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
  const minutes = Math.floor(uptime / 60);
  const seconds = uptime % 60;
  return `${minutes}m ${seconds}s`;
}

/**
 * Estimate progress for an agent based on its state, uptime, and output lines.
 * Uses heuristic-based estimation since agents don't report exact progress.
 */
function estimateAgentProgress(
  session: Session,
  processInfo?: AgentProcessInfo,
): { percent: number; label: string; phase: string } {
  if (session.state === 'completed') {
    return { percent: 100, label: 'Complete', phase: 'Done' };
  }
  if (session.state === 'zombie') {
    return { percent: 0, label: 'Process died', phase: 'Error' };
  }
  if (session.state === 'booting') {
    return { percent: 5, label: 'Starting up…', phase: 'Booting' };
  }
  // Ongoing roles don't have a completion point
  if (session.capability === 'coordinator' || session.capability === 'monitor') {
    const minutes = Math.floor((Date.now() - new Date(session.created_at).getTime()) / 60000);
    return { percent: -1, label: `Active ${minutes}m`, phase: 'Ongoing' };
  }

  const uptimeMin = (Date.now() - new Date(session.created_at).getTime()) / 60000;
  const outputCount = processInfo?.outputLines || 0;

  // Expected durations per capability (minutes)
  const expectedDurations: Record<string, number> = {
    scout: 4,
    builder: 12,
    reviewer: 5,
    lead: 15,
    merger: 7,
  };
  const expectedDuration = expectedDurations[session.capability] || 10;

  const timeProgress = Math.min((uptimeMin / expectedDuration) * 100, 95);
  const outputProgress = Math.min((outputCount / 200) * 60, 60);
  const percent = Math.round(Math.min(Math.max(timeProgress, outputProgress), 95));

  let phase: string;
  if (percent < 15) phase = 'Initializing';
  else if (percent < 40) phase = 'Analyzing';
  else if (percent < 70) phase = 'Implementing';
  else if (percent < 90) phase = 'Finalizing';
  else phase = 'Wrapping up';

  if (session.state === 'stalled') phase = 'Stalled';

  return { percent, label: `~${percent}%`, phase };
}

/** Compact progress bar indicator for agent cards and table rows */
function AgentProgressBar({
  percent,
  phase,
  label,
  compact,
}: {
  percent: number;
  phase: string;
  label: string;
  compact?: boolean;
}) {
  // Ongoing agents show a pulsing bar
  if (percent === -1) {
    return (
      <div
        className={`flex items-center gap-2 ${compact ? '' : 'mt-2'}`}
        data-testid="agent-progress-indicator"
      >
        <div
          className={`flex-1 ${compact ? 'h-1' : 'h-1.5'} rounded-full bg-slate-700 overflow-hidden`}
        >
          <div className="h-full w-1/3 rounded-full bg-blue-500/60 animate-pulse" />
        </div>
        <span className={`${compact ? 'text-[10px]' : 'text-xs'} text-slate-500 whitespace-nowrap`}>
          {label}
        </span>
      </div>
    );
  }

  let barColor = 'bg-blue-500';
  if (percent >= 80) barColor = 'bg-emerald-500';
  else if (percent >= 50) barColor = 'bg-cyan-500';
  if (phase === 'Stalled') barColor = 'bg-amber-500';
  if (phase === 'Error') barColor = 'bg-red-500';

  return (
    <div
      className={`flex items-center gap-2 ${compact ? '' : 'mt-2'}`}
      data-testid="agent-progress-indicator"
      title={`${phase}: ${label}`}
    >
      <div
        className={`flex-1 ${compact ? 'h-1' : 'h-1.5'} rounded-full bg-slate-700 overflow-hidden`}
        data-testid="agent-progress-bar"
      >
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-1000 ease-out`}
          style={{ width: `${percent}%` }}
          data-testid="agent-progress-fill"
        />
      </div>
      <span
        className={`${compact ? 'text-[10px]' : 'text-xs'} text-slate-500 whitespace-nowrap`}
        data-testid="agent-progress-label"
      >
        {compact ? label : `${phase} · ${label}`}
      </span>
    </div>
  );
}

/** Confirmation dialog for stopping agents */
function StopConfirmDialog({
  title,
  message,
  agentName,
  agentCount,
  isStopping,
  onConfirm,
  onCancel,
  testId,
}: {
  title: string;
  message: string;
  agentName?: string;
  agentCount?: number;
  isStopping: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  testId?: string;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
    >
      <motion.div
        className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-800 shadow-2xl ring-1 ring-black/20"
        data-testid={testId || "stop-confirm-dialog"}
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.8 }}
      >
        <div className="flex items-center gap-3 border-b border-slate-700 px-6 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/20">
            <FiAlertTriangle className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-50">{title}</h2>
            {agentName && <p className="text-sm text-slate-400 font-mono">{agentName}</p>}
          </div>
        </div>
        <div className="px-6 py-4">
          <p className="text-sm text-slate-300">{message}</p>
          {agentCount !== undefined && agentCount > 0 && (
            <div className="mt-3 rounded-lg bg-red-500/10 border border-red-500/20 p-3">
              <p className="text-sm text-red-400 font-medium">
                {agentCount} active agent{agentCount !== 1 ? 's' : ''} will be terminated
              </p>
            </div>
          )}
          <p className="mt-3 text-xs text-slate-500">
            The agent process will be killed via tree-kill. This action cannot be undone.
          </p>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-slate-700 px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={isStopping}
            className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isStopping}
            className="flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            data-testid="stop-confirm-button"
          >
            {isStopping ? (
              <>
                <FiActivity className="h-4 w-4 animate-spin" />
                Stopping...
              </>
            ) : (
              <>
                <FiSquare className="h-4 w-4" />
                {agentCount !== undefined ? 'Stop All Agents' : 'Stop Agent'}
              </>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/** Skeleton rows for table loading state */
function AgentTableSkeleton() {
  return (
    <div className="space-y-2" data-testid="agent-list-skeleton">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-lg border border-slate-700 bg-slate-800 p-4 animate-pulse"
        >
          <div className="h-2.5 w-2.5 rounded-full bg-slate-600" />
          <div className="h-4 w-32 rounded bg-slate-600" />
          <div className="h-5 w-16 rounded-full bg-slate-600" />
          <div className="h-5 w-16 rounded-full bg-slate-600" />
          <div className="flex-1" />
          <div className="h-4 w-16 rounded bg-slate-600" />
          <div className="h-4 w-14 rounded bg-slate-600" />
          <div className="h-7 w-7 rounded bg-slate-600" />
        </div>
      ))}
    </div>
  );
}

/** Skeleton cards for card view loading state */
function AgentCardSkeleton() {
  return (
    <div className="grid gap-3" data-testid="agent-card-skeleton">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-lg border border-slate-700 bg-slate-800 p-4 animate-pulse">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-2.5 w-2.5 rounded-full bg-slate-600" />
              <div className="h-5 w-28 rounded bg-slate-600" />
              <div className="h-5 w-16 rounded-full bg-slate-600" />
              <div className="h-5 w-16 rounded-full bg-slate-600" />
            </div>
            <div className="flex items-center gap-3">
              <div className="h-4 w-12 rounded bg-slate-600" />
              <div className="h-4 w-14 rounded bg-slate-600" />
              <div className="h-7 w-7 rounded bg-slate-600" />
            </div>
          </div>
          <div className="mt-2 flex items-center gap-4">
            <div className="h-3 w-20 rounded bg-slate-700" />
            <div className="h-3 w-32 rounded bg-slate-700" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface AgentsPageProps {
  onSelectAgent?: (agentId: string) => void;
}

export function AgentsPage({ onSelectAgent }: AgentsPageProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [runningProcesses, setRunningProcesses] = useState<AgentProcessInfo[]>([]);
  const [showSpawnDialog, setShowSpawnDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'table' | 'cards' | 'hierarchy' | 'scope'>('table');

  // Table state
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [capabilityFilter, setCapabilityFilter] = useState<string>('all');

  // Spawn dialog state
  const [spawnCapability, setSpawnCapability] = useState<AgentCapability>('scout');
  const [spawnModel, setSpawnModel] = useState('haiku');
  const [spawnName, setSpawnName] = useState('');
  const [spawnTaskId, setSpawnTaskId] = useState('');
  const [spawnFileScope, setSpawnFileScope] = useState('');
  const [spawnPrompt, setSpawnPrompt] = useState('');
  const [spawnParentAgent, setSpawnParentAgent] = useState('');
  const [spawnTreePaths, setSpawnTreePaths] = useState<string[]>([]);
  const [spawnRuntime, setSpawnRuntime] = useState('claude-code');
  const [availableRuntimes, setAvailableRuntimes] = useState<RuntimeInfo[]>([]);
  const [isSpawning, setIsSpawning] = useState(false);
  const [isOpeningSpawnDialog, setIsOpeningSpawnDialog] = useState(false);
  const [spawnError, setSpawnError] = useState<string | null>(null);

  // Track dirty state for unsaved changes warning on navigation
  const isSpawnFormDirty = showSpawnDialog && (
    spawnName.trim() !== '' ||
    spawnTaskId.trim() !== '' ||
    spawnFileScope.trim() !== '' ||
    spawnPrompt.trim() !== '' ||
    spawnParentAgent !== '' ||
    spawnTreePaths.length > 0
  );
  useFormDirtyTracking('agent-spawn-form', 'Agent Spawn Form', isSpawnFormDirty);

  const { activeProject, loadActiveProject } = useProjectStore();

  // Load active project on mount
  // biome-ignore lint/correctness/useExhaustiveDependencies: load once on mount
  useEffect(() => {
    loadActiveProject();
  }, []);

  // Bulk selection state
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());

  // Stop confirmation dialog state
  const [stopConfirm, setStopConfirm] = useState<{
    type: 'single' | 'all' | 'bulk';
    sessionId?: string;
    agentName?: string;
  } | null>(null);
  const [isStopping, setIsStopping] = useState(false);

  const loadSessions = useCallback(async () => {
    try {
      const result = await window.electronAPI.agentList();
      if (result.data) {
        setSessions(result.data);
      }
    } catch (err) {
      handleIpcError(err, {
        context: 'loading agents',
        retry: () => loadSessions(),
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadRunningProcesses = useCallback(async () => {
    try {
      const result = await window.electronAPI.agentRunningList();
      if (result.data) {
        setRunningProcesses(result.data);
      }
    } catch (err) {
      handleIpcError(err, {
        context: 'loading running processes',
        retry: () => loadRunningProcesses(),
        showToast: false,
      });
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: load on mount
  useEffect(() => {
    loadSessions();
    loadRunningProcesses();

    // Poll for updates
    const interval = setInterval(() => {
      loadSessions();
      loadRunningProcesses();
    }, 3000);

    // Listen for agent state change events for immediate cascading updates
    window.electronAPI.onAgentUpdate(() => {
      loadSessions();
      loadRunningProcesses();
    });

    return () => clearInterval(interval);
  }, []);

  // Update model when capability changes (use settings-based defaults)
  const { settings: appSettings } = useSettingsStore();
  useEffect(() => {
    const modelDefaults = appSettings.modelDefaultsPerCapability ?? DEFAULT_MODEL_DEFAULTS;
    const settingsModel = modelDefaults[spawnCapability as keyof typeof modelDefaults];
    if (settingsModel) {
      setSpawnModel(settingsModel);
    } else {
      const defaults = CAPABILITY_DEFAULTS[spawnCapability];
      if (defaults) {
        setSpawnModel(defaults.model);
      }
    }
  }, [spawnCapability, appSettings.modelDefaultsPerCapability]);

  // Apply capability filter as a column filter
  useEffect(() => {
    if (capabilityFilter === 'all') {
      setColumnFilters((prev) => prev.filter((f) => f.id !== 'capability'));
    } else {
      setColumnFilters((prev) => {
        const without = prev.filter((f) => f.id !== 'capability');
        return [...without, { id: 'capability', value: capabilityFilter }];
      });
    }
  }, [capabilityFilter]);

  const openSpawnDialog = async () => {
    setIsOpeningSpawnDialog(true);
    setSpawnCapability('scout');
    const modelDefaults = appSettings.modelDefaultsPerCapability ?? DEFAULT_MODEL_DEFAULTS;
    setSpawnModel(modelDefaults.scout || 'haiku');
    setSpawnName('');
    setSpawnTaskId('');
    setSpawnFileScope('');
    setSpawnPrompt('');
    setSpawnParentAgent('');
    setSpawnTreePaths([]);
    setSpawnError(null);

    // Load available runtimes
    try {
      const runtimeResult = await window.electronAPI.runtimeList();
      if (runtimeResult.data) {
        setAvailableRuntimes(runtimeResult.data);
      }
      const defaultResult = await window.electronAPI.runtimeGetDefault();
      if (defaultResult.data) {
        setSpawnRuntime(defaultResult.data.defaultRuntimeId);
      }
    } catch {
      // Fallback - claude-code only
      setAvailableRuntimes([]);
      setSpawnRuntime('claude-code');
    }

    setShowSpawnDialog(true);
    setIsOpeningSpawnDialog(false);
  };

  const handleSpawn = async () => {
    setIsSpawning(true);
    setSpawnError(null);

    const id = generateId();
    const agentName = spawnName.trim() || generateName(spawnCapability);

    try {
      // Calculate depth from parent agent
      const parentSession = spawnParentAgent
        ? sessions.find((s) => s.agent_name === spawnParentAgent)
        : undefined;
      const depth = parentSession ? (parentSession.depth || 0) + 1 : 0;

      const result = await window.electronAPI.agentSpawn({
        id,
        agent_name: agentName,
        capability: spawnCapability,
        model: spawnModel,
        runtime: spawnRuntime,
        task_id: spawnTaskId.trim() || undefined,
        file_scope:
          spawnTreePaths.length > 0
            ? spawnTreePaths.join(', ')
            : spawnFileScope.trim() || undefined,
        prompt: spawnPrompt.trim() || undefined,
        parent_agent: spawnParentAgent || undefined,
        depth,
      });

      if (result.error) {
        setSpawnError(result.error);
        toast.error(`Failed to spawn agent: ${result.error}`);
        setIsSpawning(false);
        return;
      }

      // Success - close dialog, refresh, and navigate to agent detail
      setShowSpawnDialog(false);
      toast.success(`Agent "${agentName}" spawned successfully`);
      await loadSessions();
      await loadRunningProcesses();
      // Navigate to the newly spawned agent's detail view
      if (onSelectAgent) {
        onSelectAgent(agentName);
      }
    } catch (err) {
      const msg = handleIpcError(err, { context: 'spawning agent' });
      setSpawnError(msg);
    } finally {
      setIsSpawning(false);
    }
  };

  // Show confirmation dialog before stopping a single agent
  const requestStopAgent = useCallback((sessionId: string, agentName: string) => {
    setStopConfirm({ type: 'single', sessionId, agentName });
  }, []);

  // Show confirmation dialog before stopping all agents
  const requestStopAll = useCallback(() => {
    setStopConfirm({ type: 'all' });
  }, []);

  // Actually perform the stop after confirmation
  const confirmStop = useCallback(async () => {
    if (!stopConfirm) return;
    setIsStopping(true);
    try {
      if (stopConfirm.type === 'single' && stopConfirm.sessionId) {
        await window.electronAPI.agentStop(stopConfirm.sessionId);
        toast.success(`Agent "${stopConfirm.agentName || 'unknown'}" stopped`);
      } else if (stopConfirm.type === 'bulk') {
        // Stop selected agents one by one
        const promises = Array.from(selectedAgents).map((id) =>
          window.electronAPI.agentStop(id).catch((err: unknown) => {
            console.error(`Failed to stop agent ${id}:`, err);
          }),
        );
        await Promise.all(promises);
        toast.success(`Stopped ${selectedAgents.size} agent(s)`);
        setSelectedAgents(new Set());
      } else {
        await window.electronAPI.agentStopAll();
        toast.success('All agents stopped');
      }
      await loadSessions();
      await loadRunningProcesses();
    } catch (err) {
      const msg = handleIpcError(err, {
        context: 'stopping agent(s)',
        retry: () => confirmStop(),
      });
      setError(msg);
    } finally {
      setIsStopping(false);
      setStopConfirm(null);
    }
  }, [stopConfirm, selectedAgents, loadSessions, loadRunningProcesses]);

  const cancelStop = useCallback(() => {
    setStopConfirm(null);
  }, []);

  // Bulk selection handlers
  const toggleAgentSelection = useCallback((sessionId: string) => {
    setSelectedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    const activeIds = activeSessions.map((s) => s.id);
    setSelectedAgents((prev) => {
      const allSelected = activeIds.every((id) => prev.has(id));
      if (allSelected) {
        return new Set();
      }
      return new Set(activeIds);
    });
  }, [activeSessions]);

  const requestBulkStop = useCallback(() => {
    if (selectedAgents.size === 0) return;
    setStopConfirm({ type: 'bulk' });
  }, [selectedAgents.size]);

  // Clear selection when sessions change (remove stale selections)
  // biome-ignore lint/correctness/useExhaustiveDependencies: clear stale selections
  useEffect(() => {
    setSelectedAgents((prev) => {
      const sessionIds = new Set(sessions.map((s) => s.id));
      const cleaned = new Set<string>();
      for (const id of prev) {
        if (sessionIds.has(id)) cleaned.add(id);
      }
      return cleaned.size !== prev.size ? cleaned : prev;
    });
  }, [sessions]);

  const handleNudgeAgent = useCallback(
    async (sessionId: string) => {
      try {
        await window.electronAPI.agentNudge(sessionId);
        toast.success('Agent nudged');
        await loadSessions();
      } catch (err) {
        const msg = handleIpcError(err, {
          context: 'nudging agent',
          retry: () => handleNudgeAgent(sessionId),
        });
        setError(msg);
      }
    },
    [loadSessions],
  );

  // Context menu for right-click on agents
  const agentContextMenu = useContextMenu();

  const handleAgentContextMenu = useCallback(
    (e: React.MouseEvent, session: Session) => {
      const items: ContextMenuItem[] = [];

      if (session.state !== 'completed') {
        items.push({
          id: 'stop',
          label: 'Stop',
          icon: <FiSquare className="h-3.5 w-3.5" />,
          danger: true,
          onClick: () => requestStopAgent(session.id, session.agent_name),
        });

        items.push({
          id: 'nudge',
          label: 'Nudge',
          icon: <FiZap className="h-3.5 w-3.5" />,
          onClick: () => handleNudgeAgent(session.id),
          disabled: session.state !== 'stalled',
        });

        items.push({ id: 'sep-1', label: '', separator: true, onClick: () => {} });
      }

      items.push({
        id: 'inspect',
        label: 'Inspect',
        icon: <FiEye className="h-3.5 w-3.5" />,
        onClick: () => onSelectAgent?.(session.id),
      });

      items.push({
        id: 'copy-id',
        label: 'Copy ID',
        icon: <FiClipboard className="h-3.5 w-3.5" />,
        onClick: () => {
          navigator.clipboard.writeText(session.id);
          toast.success('Agent ID copied to clipboard');
        },
      });

      agentContextMenu.show(e, items);
    },
    [requestStopAgent, handleNudgeAgent, onSelectAgent, agentContextMenu],
  );

  // Table columns definition
  const columns = useMemo<ColumnDef<Session>[]>(
    () => [
      {
        id: 'select',
        header: () => (
          <input
            type="checkbox"
            checked={
              activeSessions.length > 0 && activeSessions.every((s) => selectedAgents.has(s.id))
            }
            onChange={(e) => {
              e.stopPropagation();
              toggleSelectAll();
            }}
            className="h-4 w-4 rounded border-slate-500 bg-slate-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer accent-blue-500"
            title="Select all agents"
            data-testid="select-all-checkbox"
          />
        ),
        size: 36,
        enableSorting: false,
        cell: ({ row }) => {
          if (row.original.state === 'completed') return null;
          return (
            <input
              type="checkbox"
              checked={selectedAgents.has(row.original.id)}
              onChange={(e) => {
                e.stopPropagation();
                toggleAgentSelection(row.original.id);
              }}
              onClick={(e) => e.stopPropagation()}
              className="h-4 w-4 rounded border-slate-500 bg-slate-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer accent-blue-500"
              data-testid={`select-agent-${row.original.id}`}
            />
          );
        },
      },
      {
        id: 'state_indicator',
        header: '',
        size: 36,
        enableSorting: false,
        cell: ({ row }) => {
          const stateInfo = STATE_ICONS[row.original.state];
          return (
            <div
              className={`flex items-center justify-center ${stateInfo?.className || 'text-slate-400'}`}
              data-testid={`agent-state-icon-${row.original.state}`}
              title={STATE_TOOLTIPS[row.original.state] || row.original.state}
            >
              {stateInfo?.icon || (
                <div
                  className={`h-2.5 w-2.5 rounded-full ${STATE_DOT_COLORS[row.original.state] || 'bg-slate-400'}`}
                  title={STATE_TOOLTIPS[row.original.state] || row.original.state}
                />
              )}
            </div>
          );
        },
      },
      {
        accessorKey: 'id',
        header: 'ID',
        size: 100,
        enableSorting: false,
        cell: ({ getValue }) => {
          const agentId = getValue<string>();
          const shortId = agentId.length > 8 ? `${agentId.slice(0, 8)}…` : agentId;
          return (
            <div className="flex items-center gap-1 group/id">
              <span className="text-xs text-slate-500 font-mono" title={agentId}>
                {shortId}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(agentId);
                  toast.success('Agent ID copied to clipboard');
                }}
                className="opacity-0 group-hover/id:opacity-100 rounded p-0.5 text-slate-500 hover:text-slate-300 hover:bg-slate-700 transition-all"
                title="Copy agent ID"
                data-testid={`copy-agent-id-${agentId}`}
              >
                <FiCopy className="h-3 w-3" />
              </button>
            </div>
          );
        },
      },
      {
        accessorKey: 'agent_name',
        header: 'Name',
        enableSorting: true,
        cell: ({ getValue }) => (
          <span className="font-medium text-slate-50">{getValue<string>()}</span>
        ),
      },
      {
        accessorKey: 'capability',
        header: 'Capability',
        enableSorting: true,
        filterFn: 'equalsString',
        cell: ({ getValue }) => {
          const cap = getValue<string>();
          return (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${CAPABILITY_COLORS[cap] || 'bg-slate-500/20 text-slate-400'}`}
              title={CAPABILITY_TOOLTIPS[cap] || cap}
            >
              {cap}
            </span>
          );
        },
      },
      {
        accessorKey: 'state',
        header: 'Status',
        enableSorting: true,
        cell: ({ row }) => {
          const state = row.original.state;
          const escalation = row.original.escalation_level || 0;
          const stalledAt = row.original.stalled_at;
          const stalledDuration = stalledAt
            ? Math.floor((Date.now() - new Date(stalledAt).getTime()) / 1000)
            : 0;
          const stalledMin = Math.floor(stalledDuration / 60);
          const stalledSec = stalledDuration % 60;

          return (
            <div className="flex items-center gap-1.5">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATE_COLORS[state] || ''}`}
                title={STATE_TOOLTIPS[state] || state}
              >
                {state}
              </span>
              {state === 'stalled' && (
                <span
                  className="inline-flex items-center gap-1 text-xs text-amber-400 font-medium"
                  title={`Agent is stalled and unresponsive. Stalled for ${stalledMin}m ${stalledSec}s (escalation level ${escalation}). Try nudging or stopping the agent.`}
                  data-testid="agent-stalled-warning"
                >
                  <FiAlertTriangle className="h-3.5 w-3.5" />
                  {stalledMin > 0 ? `${stalledMin}m` : `${stalledSec}s`}
                </span>
              )}
              {state === 'zombie' && (
                <span
                  className="inline-flex items-center gap-1 text-xs text-red-400 font-semibold animate-pulse"
                  title="Zombie: Agent process has died unexpectedly. The session remains but the process is no longer running. Stop and respawn to recover."
                  data-testid="agent-zombie-error-icon"
                >
                  <FiXCircle className="h-3 w-3" />
                  ZOMBIE
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: 'pid',
        header: 'PID',
        enableSorting: true,
        accessorFn: (row) => {
          const proc = runningProcesses.find((p) => p.id === row.id);
          return row.pid || proc?.pid || null;
        },
        cell: ({ getValue }) => {
          const pid = getValue<number | null>();
          return pid ? (
            <span className="text-xs text-slate-500 font-mono">{pid}</span>
          ) : (
            <span className="text-xs text-slate-600">-</span>
          );
        },
      },
      {
        id: 'uptime',
        header: 'Uptime',
        enableSorting: true,
        accessorFn: (row) => new Date(row.created_at).getTime(),
        cell: ({ row }) => (
          <span className="text-xs text-slate-500">{formatUptime(row.original.created_at)}</span>
        ),
      },
      {
        id: 'task',
        header: 'Task',
        enableSorting: true,
        accessorFn: (row) => row.task_id || '',
        cell: ({ getValue }) => {
          const taskId = getValue<string>();
          return taskId ? (
            <span className="text-xs text-slate-400">{taskId}</span>
          ) : (
            <span className="text-xs text-slate-600">-</span>
          );
        },
      },
      {
        id: 'progress',
        header: 'Progress',
        size: 140,
        enableSorting: false,
        cell: ({ row }) => {
          const proc = runningProcesses.find((p) => p.id === row.original.id);
          const progress = estimateAgentProgress(row.original, proc);
          return (
            <AgentProgressBar
              percent={progress.percent}
              phase={progress.phase}
              label={progress.label}
              compact
            />
          );
        },
      },
      {
        id: 'actions',
        header: '',
        size: 70,
        enableSorting: false,
        cell: ({ row }) => {
          if (row.original.state === 'completed') return null;
          return (
            <div className="flex items-center gap-1">
              {row.original.state === 'stalled' && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNudgeAgent(row.original.id);
                  }}
                  className="rounded-md bg-amber-600/20 p-1.5 text-amber-400 hover:bg-amber-600/30 transition-colors"
                  title="Nudge stalled agent"
                >
                  <FiZap className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  requestStopAgent(row.original.id, row.original.agent_name);
                }}
                className="rounded-md bg-red-600/20 p-1.5 text-red-400 hover:bg-red-600/30 transition-colors"
                title="Stop agent"
              >
                <FiSquare className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        },
      },
    ],
    [
      runningProcesses,
      requestStopAgent,
      handleNudgeAgent,
      selectedAgents,
      activeSessions,
      toggleSelectAll,
      toggleAgentSelection,
    ],
  );

  const table = useReactTable({
    data: sessions,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: 'includesString',
  });

  const filteredRows = table.getRowModel().rows;
  const activeSessions = sessions.filter((s) => s.state !== 'completed');
  const completedSessions = sessions.filter((s) => s.state === 'completed');

  // Compute child agent counts for leads/coordinators
  const childCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of sessions) {
      if (s.parent_agent) {
        map[s.parent_agent] = (map[s.parent_agent] || 0) + 1;
      }
    }
    return map;
  }, [sessions]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">Agents</h1>
          <p className="text-sm text-slate-400 mt-1">
            {activeSessions.length} active, {completedSessions.length} completed
          </p>
        </div>
        <div className="flex gap-2">
          {selectedAgents.size > 0 && (
            <button
              type="button"
              onClick={requestBulkStop}
              className="flex items-center gap-2 rounded-md bg-red-600/20 border border-red-500/30 px-3 py-2 text-sm text-red-400 hover:bg-red-600/30 transition-colors"
              data-testid="bulk-stop-button"
            >
              <FiSquare className="h-4 w-4" />
              Stop Selected ({selectedAgents.size})
            </button>
          )}
          {activeSessions.length > 0 && selectedAgents.size === 0 && (
            <button
              type="button"
              onClick={requestStopAll}
              className="flex items-center gap-2 rounded-md bg-red-600/20 border border-red-500/30 px-3 py-2 text-sm text-red-400 hover:bg-red-600/30 transition-colors"
            >
              <FiSquare className="h-4 w-4" />
              Stop All
            </button>
          )}
          <button
            type="button"
            onClick={openSpawnDialog}
            disabled={isOpeningSpawnDialog}
            data-testid="spawn-agent-button"
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isOpeningSpawnDialog ? (
              <>
                <FiLoader className="h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <FiPlay className="h-4 w-4" />
                Spawn Agent
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400 flex justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>
            <FiX className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Coordinator Panel */}
      <CoordinatorPanel />

      {/* Filter bar */}
      <div className="flex items-center gap-3">
        {/* Global search */}
        <div className="relative flex-1 max-w-sm">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Search agents by name..."
            data-testid="agent-global-filter"
            className="w-full rounded-lg border border-slate-600 bg-slate-800 pl-9 pr-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {globalFilter && (
            <button
              type="button"
              onClick={() => setGlobalFilter('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              title="Clear search"
            >
              <FiX className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Capability filter */}
        <div className="relative">
          <FiFilter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <select
            value={capabilityFilter}
            onChange={(e) => setCapabilityFilter(e.target.value)}
            data-testid="agent-capability-filter"
            className="rounded-lg border border-slate-600 bg-slate-800 pl-9 pr-8 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 appearance-none cursor-pointer"
          >
            <option value="all">All Capabilities</option>
            {ALL_CAPABILITIES.map((cap) => (
              <option key={cap} value={cap}>
                {cap.charAt(0).toUpperCase() + cap.slice(1)}
              </option>
            ))}
          </select>
          <FiChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
        </div>

        {/* View mode toggle */}
        <div className="flex rounded-lg border border-slate-600 overflow-hidden">
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`p-2 transition-colors ${
              viewMode === 'table'
                ? 'bg-blue-500/20 text-blue-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
            }`}
            title="Table view"
          >
            <FiList className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('cards')}
            className={`p-2 transition-colors ${
              viewMode === 'cards'
                ? 'bg-blue-500/20 text-blue-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
            }`}
            title="Card view"
          >
            <FiGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('hierarchy')}
            className={`p-2 transition-colors ${
              viewMode === 'hierarchy'
                ? 'bg-blue-500/20 text-blue-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
            }`}
            title="Hierarchy tree view"
          >
            <FiGitBranch className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('scope')}
            className={`p-2 transition-colors ${
              viewMode === 'scope'
                ? 'bg-blue-500/20 text-blue-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
            }`}
            title="Scope map - file tree color-coded by agent"
            data-testid="view-mode-scope"
          >
            <FiMap className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Loading skeleton */}
      {isLoading ? (
        viewMode === 'table' || viewMode === 'hierarchy' ? (
          <AgentTableSkeleton />
        ) : (
          <AgentCardSkeleton />
        )
      ) : viewMode === 'scope' ? (
        /* Scope map view */
        <ScopeTreeViewer maxHeight="calc(100vh - 200px)" />
      ) : sessions.length === 0 ? (
        /* Empty state */
        <div
          data-testid="agents-empty-state"
          className="rounded-lg border border-slate-700 bg-slate-800 p-12 text-center text-slate-400"
        >
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-slate-700/50">
            <FiCpu className="h-10 w-10 text-slate-500" />
          </div>
          <p data-testid="agents-empty-title" className="text-xl font-semibold text-slate-300 mb-2">
            No agents running
          </p>
          <p
            data-testid="agents-empty-message"
            className="text-sm text-slate-500 mb-6 max-w-md mx-auto"
          >
            Spawn an agent to start coding with AI. Agents can scout, build, review, and orchestrate
            your codebase autonomously.
          </p>
          <button
            type="button"
            data-testid="agents-empty-cta"
            onClick={openSpawnDialog}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors shadow-lg shadow-blue-600/20"
          >
            <FiPlay size={14} />
            Spawn Agent
          </button>
        </div>
      ) : viewMode === 'hierarchy' ? (
        /* Hierarchy tree view */
        <AgentHierarchyTree
          sessions={sessions}
          onSelectAgent={(agentId) => onSelectAgent?.(agentId)}
        />
      ) : viewMode === 'table' ? (
        /* Table view with @tanstack/react-table */
        <div className="rounded-lg border border-slate-700 bg-slate-800 overflow-hidden">
          <table className="w-full">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-slate-700">
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      data-testid={`agent-sort-${header.id}`}
                      className={`px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider ${
                        header.column.getCanSort()
                          ? 'cursor-pointer select-none hover:text-slate-200'
                          : ''
                      }`}
                      style={header.getSize() !== 150 ? { width: header.getSize() } : undefined}
                      onClick={header.column.getToggleSortingHandler()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          header.column.getToggleSortingHandler()?.(e);
                        }
                      }}
                      tabIndex={header.column.getCanSort() ? 0 : undefined}
                    >
                      <div className="flex items-center gap-1">
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === 'asc' && (
                          <FiChevronUp className="h-3 w-3 text-blue-400" />
                        )}
                        {header.column.getIsSorted() === 'desc' && (
                          <FiChevronDown className="h-3 w-3 text-blue-400" />
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <VirtualizedTableBody
              filteredRows={filteredRows}
              colCount={columns.length}
              onSelectAgent={onSelectAgent}
              handleAgentContextMenu={handleAgentContextMenu}
            />
          </table>
          {/* Table footer with count */}
          <div className="border-t border-slate-700 px-4 py-2 text-xs text-slate-500">
            Showing {filteredRows.length} of {sessions.length} agents
          </div>
        </div>
      ) : (
        /* Card view */
        <div className="space-y-4">
          {filteredRows.filter((r) => r.original.state !== 'completed').length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider">
                Active Agents
              </h2>
              <AnimatedCardContainer className="grid gap-3">
                {filteredRows
                  .filter((r) => r.original.state !== 'completed')
                  .map((row) => {
                    const session = row.original;
                    const proc = runningProcesses.find((p) => p.id === session.id);
                    return (
                      <AnimatedCard key={session.id}>
                        <AgentCard
                          session={session}
                          processInfo={proc}
                          childCount={childCountMap[session.agent_name] || 0}
                          isSelected={selectedAgents.has(session.id)}
                          onToggleSelect={() => toggleAgentSelection(session.id)}
                          onStop={() => requestStopAgent(session.id, session.agent_name)}
                          onNudge={() => handleNudgeAgent(session.id)}
                          onSelect={() => onSelectAgent?.(session.id)}
                          onContextMenu={(e) => handleAgentContextMenu(e, session)}
                        />
                      </AnimatedCard>
                    );
                  })}
              </AnimatedCardContainer>
            </div>
          )}

          {filteredRows.filter((r) => r.original.state === 'completed').length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider">
                Completed ({filteredRows.filter((r) => r.original.state === 'completed').length})
              </h2>
              <div className="grid gap-2">
                {filteredRows
                  .filter((r) => r.original.state === 'completed')
                  .slice(0, 10)
                  .map((row) => {
                    const session = row.original;
                    return (
                      <div
                        key={session.id}
                        className="flex items-center justify-between rounded-lg border border-slate-700/50 bg-slate-800/50 p-3"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${CAPABILITY_COLORS[session.capability] || 'bg-slate-500/20 text-slate-400'}`}
                          >
                            {session.capability}
                          </span>
                          <span className="text-sm text-slate-300">{session.agent_name}</span>
                        </div>
                        <span className="text-xs text-slate-500">
                          {session.completed_at
                            ? new Date(session.completed_at).toLocaleString()
                            : ''}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {filteredRows.length === 0 && (
            <div className="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center text-sm text-slate-500">
              No agents match your filters
            </div>
          )}
        </div>
      )}

      {/* Spawn Dialog */}
      {showSpawnDialog && (
        <SpawnDialog
          capability={spawnCapability}
          model={spawnModel}
          runtime={spawnRuntime}
          availableRuntimes={availableRuntimes}
          name={spawnName}
          taskId={spawnTaskId}
          fileScope={spawnFileScope}
          prompt={spawnPrompt}
          parentAgent={spawnParentAgent}
          availableParents={activeSessions.filter(
            (s) => s.capability === 'lead' || s.capability === 'coordinator',
          )}
          treePaths={spawnTreePaths}
          projectPath={activeProject?.path ?? null}
          isSpawning={isSpawning}
          error={spawnError}
          onCapabilityChange={(cap) => {
            setSpawnCapability(cap);
            const modelDefaults = appSettings.modelDefaultsPerCapability ?? DEFAULT_MODEL_DEFAULTS;
            setSpawnModel(
              modelDefaults[cap as keyof typeof modelDefaults] || CAPABILITY_DEFAULTS[cap].model,
            );
          }}
          onModelChange={setSpawnModel}
          onRuntimeChange={setSpawnRuntime}
          onNameChange={setSpawnName}
          onTaskIdChange={setSpawnTaskId}
          onFileScopeChange={setSpawnFileScope}
          onPromptChange={setSpawnPrompt}
          onParentAgentChange={setSpawnParentAgent}
          onTreePathsChange={setSpawnTreePaths}
          onSpawn={handleSpawn}
          onClose={() => setShowSpawnDialog(false)}
        />
      )}

      {/* Stop Confirmation Dialog - Individual Agent */}
      {stopConfirm?.type === 'single' && (
        <StopConfirmDialog
          title="Stop Agent"
          message="Are you sure you want to stop this agent? Any in-progress work will be interrupted and the agent process will be terminated."
          agentName={stopConfirm.agentName}
          isStopping={isStopping}
          onConfirm={confirmStop}
          onCancel={cancelStop}
        />
      )}

      {/* Stop Confirmation Dialog - All Agents (styled dark-theme modal) */}
      {stopConfirm?.type === 'all' && (
        <StopConfirmDialog
          title="Stop All Agents"
          message="Are you sure you want to stop all running agents? All in-progress work will be interrupted and all agent processes will be terminated. This is a destructive action."
          agentCount={activeSessions.length}
          isStopping={isStopping}
          onConfirm={confirmStop}
          onCancel={cancelStop}
          testId="stop-all-confirm-dialog"
        />
      )}

      {/* Stop Confirmation Dialog - Bulk Selected Agents */}
      {stopConfirm?.type === 'bulk' && (
        <StopConfirmDialog
          title="Stop Selected Agents"
          message="Are you sure you want to stop the selected agents? Their in-progress work will be interrupted and their processes will be terminated."
          agentCount={selectedAgents.size}
          isStopping={isStopping}
          onConfirm={confirmStop}
          onCancel={cancelStop}
        />
      )}

      {/* Right-click context menu */}
      <ContextMenu menu={agentContextMenu.menu} onClose={agentContextMenu.hide} />
    </div>
  );
}

/** Border accent colors per capability for left-border styling */
const CAPABILITY_BORDER_ACCENT: Record<string, string> = {
  scout: 'border-l-purple-500',
  builder: 'border-l-blue-500',
  reviewer: 'border-l-cyan-500',
  lead: 'border-l-amber-500',
  merger: 'border-l-emerald-500',
  coordinator: 'border-l-rose-500',
  monitor: 'border-l-teal-500',
};

/** Model badge styling */
const MODEL_COLORS: Record<string, string> = {
  haiku: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  sonnet: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  opus: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
};

function AgentCard({
  session,
  processInfo,
  childCount,
  isSelected,
  onToggleSelect,
  onStop,
  onNudge,
  onSelect,
  onContextMenu,
}: {
  session: Session;
  processInfo?: AgentProcessInfo;
  childCount?: number;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  onStop: () => void;
  onNudge: () => void;
  onSelect?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const agentModel = session.model || processInfo?.model || null;
  const borderAccent = CAPABILITY_BORDER_ACCENT[session.capability] || 'border-l-slate-500';
  const isRunning = session.state === 'working' || session.state === 'booting';

  return (
    <div
      className={`rounded-lg border border-l-[3px] ${borderAccent} bg-slate-800 p-4 cursor-pointer hover:bg-slate-750 hover:border-slate-600 transition-colors ${isSelected ? 'border-blue-500/50 bg-blue-500/5' : 'border-slate-700'} ${isRunning ? 'animate-card-activity-pulse' : ''}`}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSelect?.();
      }}
      tabIndex={0}
      role="button"
      data-testid={`agent-card-${session.id}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Selection checkbox */}
          {onToggleSelect && (
            <input
              type="checkbox"
              checked={!!isSelected}
              onChange={(e) => {
                e.stopPropagation();
                onToggleSelect();
              }}
              onClick={(e) => e.stopPropagation()}
              className="h-4 w-4 rounded border-slate-500 bg-slate-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer accent-blue-500"
              data-testid={`select-agent-card-${session.id}`}
            />
          )}

          {/* State indicator with icon */}
          <div
            className={`flex items-center ${STATE_ICONS[session.state]?.className || 'text-slate-400'}`}
            data-testid={`agent-state-dot-${session.state}`}
            title={STATE_TOOLTIPS[session.state] || session.state}
          >
            {STATE_ICONS[session.state]?.icon || (
              <div
                className={`h-2.5 w-2.5 rounded-full ${STATE_DOT_COLORS[session.state] || 'bg-slate-400'}`}
              />
            )}
          </div>

          {/* Agent name */}
          <span className="font-medium text-slate-50" data-testid="agent-card-name">
            {session.agent_name}
          </span>

          {/* Capability badge */}
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${CAPABILITY_COLORS[session.capability] || 'bg-slate-500/20 text-slate-400'}`}
            data-testid="agent-card-capability"
            title={CAPABILITY_TOOLTIPS[session.capability] || session.capability}
          >
            {session.capability}
          </span>

          {/* State badge */}
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATE_COLORS[session.state] || ''}`}
            data-testid="agent-card-state"
            title={STATE_TOOLTIPS[session.state] || session.state}
          >
            {session.state}
          </span>

          {/* Model badge */}
          {agentModel && (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${MODEL_COLORS[agentModel] || 'bg-slate-500/20 text-slate-400 border-slate-500/30'}`}
              data-testid="agent-card-model"
            >
              <FiCpu className="mr-1 h-3 w-3" />
              {agentModel}
            </span>
          )}

          {/* Stalled warning icon */}
          {session.state === 'stalled' && (
            <span
              className="inline-flex items-center gap-1 text-xs text-amber-400 font-medium"
              title={`Agent is stalled and unresponsive. Escalation level: ${session.escalation_level || 0}. Try nudging or stopping the agent.`}
              data-testid="agent-stalled-warning"
            >
              <FiAlertTriangle className="h-3.5 w-3.5" />
              {session.stalled_at &&
                `${Math.floor((Date.now() - new Date(session.stalled_at).getTime()) / 60000)}m`}
            </span>
          )}

          {/* Zombie alert */}
          {session.state === 'zombie' && (
            <span
              className="inline-flex items-center gap-1 text-xs text-red-400 font-semibold animate-pulse"
              title="Zombie: Agent process has died unexpectedly. The session remains but the process is no longer running. Stop and respawn to recover."
              data-testid="agent-card-zombie-error-icon"
            >
              <FiXCircle className="h-3 w-3" />
              ZOMBIE
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* PID */}
          {(session.pid || processInfo?.pid) && (
            <span className="text-xs text-slate-500 font-mono" data-testid="agent-card-pid">
              PID: {session.pid || processInfo?.pid}
            </span>
          )}

          {/* Uptime */}
          <span className="text-xs text-slate-500" data-testid="agent-card-uptime">
            {formatUptime(session.created_at)}
          </span>

          {/* Nudge button (stalled agents only) */}
          {session.state === 'stalled' && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onNudge();
              }}
              className="rounded-md bg-amber-600/20 p-1.5 text-amber-400 hover:bg-amber-600/30 transition-colors"
              title="Nudge stalled agent"
            >
              <FiZap className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Stop button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onStop();
            }}
            className="rounded-md bg-red-600/20 p-1.5 text-red-400 hover:bg-red-600/30 transition-colors"
            title="Stop agent"
          >
            <FiSquare className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Details row */}
      <div className="mt-2 flex items-center gap-4 text-xs text-slate-500">
        {/* Agent ID with copy button */}
        <span className="inline-flex items-center gap-1 group/card-id" data-testid="agent-card-id">
          <span className="font-mono" title={session.id}>
            ID: {session.id.length > 8 ? `${session.id.slice(0, 8)}…` : session.id}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(session.id);
              toast.success('Agent ID copied to clipboard');
            }}
            className="opacity-0 group-hover/card-id:opacity-100 rounded p-0.5 text-slate-500 hover:text-slate-300 hover:bg-slate-700 transition-all"
            title="Copy agent ID"
            data-testid={`copy-agent-card-id-${session.id}`}
          >
            <FiCopy className="h-3 w-3" />
          </button>
        </span>
        {session.task_id && <span data-testid="agent-card-task">Task: {session.task_id}</span>}
        {session.worktree_path && <span>Worktree: {session.worktree_path}</span>}
        {session.branch_name && <span>Branch: {session.branch_name}</span>}
        {session.parent_agent && (
          <span className="text-amber-400/70">Parent: {session.parent_agent}</span>
        )}
        {(session.capability === 'lead' || session.capability === 'coordinator') &&
          childCount !== undefined && (
            <span className="inline-flex items-center gap-1 text-amber-400/70">
              <FiUsers className="h-3 w-3" />
              {childCount} child{childCount !== 1 ? 'ren' : ''}
            </span>
          )}
      </div>

      {/* Progress estimation bar */}
      {(() => {
        const progress = estimateAgentProgress(session, processInfo);
        return (
          <AgentProgressBar
            percent={progress.percent}
            phase={progress.phase}
            label={progress.label}
          />
        );
      })()}
    </div>
  );
}

/** Zod schema for agent spawn form validation */
const spawnFormSchema = z.object({
  name: z
    .string()
    .refine((val) => val.length === 0 || val.trim().length > 0, {
      message: 'Name cannot be only whitespace',
    })
    .refine((val) => val.length === 0 || /^[a-zA-Z0-9_-][a-zA-Z0-9_ -]*$/.test(val), {
      message: 'Name can only contain letters, numbers, spaces, hyphens, and underscores',
    })
    .refine((val) => val.length === 0 || val.length <= 64, {
      message: 'Name must be 64 characters or fewer',
    }),
  taskId: z
    .string()
    .refine((val) => val.length === 0 || val.trim().length > 0, {
      message: 'Task ID cannot be only whitespace',
    })
    .refine((val) => val.length === 0 || /^[a-zA-Z0-9_-]+$/.test(val.trim()), {
      message: 'Task ID can only contain letters, numbers, hyphens, and underscores',
    }),
  prompt: z.string(),
  fileScope: z.string(),
});

type SpawnFormErrors = Partial<Record<keyof z.infer<typeof spawnFormSchema>, string>>;

function SpawnDialog({
  capability,
  model,
  runtime,
  availableRuntimes,
  name,
  taskId,
  fileScope,
  prompt,
  parentAgent,
  availableParents,
  treePaths,
  projectPath,
  isSpawning,
  error,
  onCapabilityChange,
  onModelChange,
  onRuntimeChange,
  onNameChange,
  onTaskIdChange,
  onFileScopeChange,
  onPromptChange,
  onParentAgentChange,
  onTreePathsChange,
  onSpawn,
  onClose,
}: {
  capability: AgentCapability;
  model: string;
  runtime: string;
  availableRuntimes: RuntimeInfo[];
  name: string;
  taskId: string;
  fileScope: string;
  prompt: string;
  parentAgent: string;
  availableParents: Session[];
  treePaths: string[];
  projectPath: string | null;
  isSpawning: boolean;
  error: string | null;
  onCapabilityChange: (c: AgentCapability) => void;
  onModelChange: (m: string) => void;
  onRuntimeChange: (r: string) => void;
  onNameChange: (n: string) => void;
  onTaskIdChange: (t: string) => void;
  onFileScopeChange: (f: string) => void;
  onPromptChange: (p: string) => void;
  onParentAgentChange: (p: string) => void;
  onTreePathsChange: (paths: string[]) => void;
  onSpawn: () => void;
  onClose: () => void;
}) {
  const capabilityInfo = CAPABILITY_DEFAULTS[capability];
  const { settings: spawnSettings } = useSettingsStore();
  const configuredDefault =
    (spawnSettings.modelDefaultsPerCapability ?? DEFAULT_MODEL_DEFAULTS)[
      capability as keyof typeof DEFAULT_MODEL_DEFAULTS
    ] ?? capabilityInfo.model;
  const [showTreePicker, setShowTreePicker] = useState(capability === 'builder');
  const [scopeOverlaps, setScopeOverlaps] = useState<ScopeOverlap[]>([]);
  const [checkingOverlaps, setCheckingOverlaps] = useState(false);
  const [formErrors, setFormErrors] = useState<SpawnFormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Validate a single field with Zod
  const validateField = useCallback(
    (field: keyof z.infer<typeof spawnFormSchema>, value: string) => {
      const result = spawnFormSchema.shape[field].safeParse(value);
      if (!result.success) {
        setFormErrors((prev) => ({ ...prev, [field]: result.error.errors[0]?.message }));
      } else {
        setFormErrors((prev) => {
          const next = { ...prev };
          delete next[field];
          return next;
        });
      }
    },
    [],
  );

  // Validate all fields before submit
  const validateAll = useCallback((): boolean => {
    const result = spawnFormSchema.safeParse({ name, taskId, prompt, fileScope });
    if (!result.success) {
      const errors: SpawnFormErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof SpawnFormErrors;
        if (!errors[field]) {
          errors[field] = issue.message;
        }
      }
      setFormErrors(errors);
      setTouched({ name: true, taskId: true, prompt: true, fileScope: true });
      return false;
    }
    setFormErrors({});
    return true;
  }, [name, taskId, prompt, fileScope]);

  // Validated spawn handler
  const handleValidatedSpawn = useCallback(() => {
    if (validateAll()) {
      onSpawn();
    }
  }, [validateAll, onSpawn]);

  // Check for scope overlaps when file selections change
  useEffect(() => {
    const paths =
      treePaths.length > 0
        ? treePaths
        : fileScope.trim()
          ? fileScope
              .split(',')
              .map((p) => p.trim())
              .filter(Boolean)
          : [];
    if (paths.length === 0) {
      setScopeOverlaps([]);
      return;
    }

    const timer = setTimeout(async () => {
      setCheckingOverlaps(true);
      try {
        const result = await window.electronAPI.scopeCheckOverlap(paths);
        if (result.data) {
          setScopeOverlaps(result.data);
        }
      } catch {
        // Silently ignore overlap check failures
      } finally {
        setCheckingOverlaps(false);
      }
    }, 300); // Debounce 300ms

    return () => clearTimeout(timer);
  }, [treePaths, fileScope]);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
    >
      <motion.div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-slate-700 bg-slate-800 shadow-2xl"
        data-testid="spawn-dialog"
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.8 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
          <div className="flex items-center gap-2">
            <FiZap className="h-5 w-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-slate-50">Spawn Agent</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
            title="Close"
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-6 py-4">
          {/* Capability selector */}
          <div>
            <span className="block text-sm font-medium text-slate-300 mb-2">Capability</span>
            <div className="grid grid-cols-4 gap-2" data-testid="spawn-capability-selector">
              {(Object.keys(CAPABILITY_DEFAULTS) as AgentCapability[]).map((cap) => (
                <button
                  key={cap}
                  type="button"
                  onClick={() => onCapabilityChange(cap)}
                  className={`rounded-lg border p-2 text-center text-xs font-medium transition-colors ${
                    capability === cap
                      ? `${CAPABILITY_COLORS[cap]} border-current`
                      : 'border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-300'
                  }`}
                >
                  {cap}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-slate-500">{capabilityInfo.description}</p>
          </div>

          {/* Runtime selector */}
          {availableRuntimes.length > 0 && (
            <div data-testid="spawn-runtime-selector">
              <span className="block text-sm font-medium text-slate-300 mb-2">Runtime</span>
              <div className="flex gap-2">
                {availableRuntimes.map((rt) => (
                  <button
                    key={rt.id}
                    type="button"
                    onClick={() => onRuntimeChange(rt.id)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      runtime === rt.id
                        ? 'border-emerald-500 bg-emerald-500/20 text-emerald-400'
                        : 'border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <span>{rt.displayName}</span>
                      {rt.detected ? (
                        <span className="text-[10px] text-emerald-500">● detected</span>
                      ) : (
                        <span className="text-[10px] text-red-400">● not found</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Model picker */}
          <div>
            <span className="block text-sm font-medium text-slate-300 mb-2">Model</span>
            <div className="flex gap-2" data-testid="spawn-model-picker">
              {MODELS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onModelChange(m)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    model === m
                      ? 'border-blue-500 bg-blue-500/20 text-blue-400'
                      : 'border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-300'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            {model !== configuredDefault && (
              <p className="mt-1 text-xs text-amber-400">
                Default for {capability} is {configuredDefault}
              </p>
            )}
          </div>

          {/* Agent name */}
          <div>
            <label htmlFor="spawn-name" className="block text-sm font-medium text-slate-300 mb-1">
              Name{' '}
              <span className="text-slate-500 font-normal">
                (optional, auto-generated if empty)
              </span>
            </label>
            <input
              id="spawn-name"
              type="text"
              value={name}
              onChange={(e) => {
                onNameChange(e.target.value);
                if (touched.name) validateField('name', e.target.value);
              }}
              onBlur={() => {
                setTouched((prev) => ({ ...prev, name: true }));
                validateField('name', name);
              }}
              placeholder={`e.g. swift-${capability}-001`}
              data-testid="spawn-name-input"
              className={`w-full rounded-lg border ${touched.name && formErrors.name ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-slate-600 focus:border-blue-500 focus:ring-blue-500'} bg-slate-700 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1`}
            />
            {touched.name && formErrors.name && (
              <p className="mt-1 text-xs text-red-400" data-testid="spawn-name-error">
                {formErrors.name}
              </p>
            )}
          </div>

          {/* Task ID */}
          <div>
            <label
              htmlFor="spawn-task-id"
              className="block text-sm font-medium text-slate-300 mb-1"
            >
              Task ID <span className="text-slate-500 font-normal">(optional)</span>
            </label>
            <input
              id="spawn-task-id"
              type="text"
              value={taskId}
              onChange={(e) => {
                onTaskIdChange(e.target.value);
                if (touched.taskId) validateField('taskId', e.target.value);
              }}
              onBlur={() => {
                setTouched((prev) => ({ ...prev, taskId: true }));
                validateField('taskId', taskId);
              }}
              placeholder="e.g. TASK-42"
              data-testid="spawn-task-id-input"
              className={`w-full rounded-lg border ${touched.taskId && formErrors.taskId ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-slate-600 focus:border-blue-500 focus:ring-blue-500'} bg-slate-700 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1`}
            />
            {touched.taskId && formErrors.taskId && (
              <p className="mt-1 text-xs text-red-400" data-testid="spawn-task-id-error">
                {formErrors.taskId}
              </p>
            )}
          </div>

          {/* Parent agent */}
          {availableParents.length > 0 && (
            <div>
              <label
                htmlFor="spawn-parent-agent"
                className="block text-sm font-medium text-slate-300 mb-1"
              >
                Parent Agent <span className="text-slate-500 font-normal">(optional)</span>
              </label>
              <div className="relative">
                <select
                  id="spawn-parent-agent"
                  value={parentAgent}
                  onChange={(e) => onParentAgentChange(e.target.value)}
                  data-testid="spawn-parent-agent"
                  className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 appearance-none cursor-pointer"
                >
                  <option value="">No parent (top-level agent)</option>
                  {availableParents.map((s) => (
                    <option key={s.id} value={s.agent_name}>
                      {s.agent_name} ({s.capability})
                    </option>
                  ))}
                </select>
                <FiChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Assign this agent under a lead or coordinator in the hierarchy
              </p>
            </div>
          )}

          {/* File scope */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label
                htmlFor="spawn-file-scope"
                className="block text-sm font-medium text-slate-300"
              >
                File Scope <span className="text-slate-500 font-normal">(optional)</span>
              </label>
              {projectPath && (
                <button
                  type="button"
                  onClick={() => setShowTreePicker(!showTreePicker)}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  data-testid="toggle-tree-picker"
                >
                  {showTreePicker ? 'Use text input' : 'Browse files'}
                </button>
              )}
            </div>

            {showTreePicker && projectPath ? (
              <FileTreePicker
                rootPath={projectPath}
                selectedPaths={treePaths}
                onSelectionChange={onTreePathsChange}
                maxHeight="200px"
              />
            ) : (
              <>
                <input
                  id="spawn-file-scope"
                  type="text"
                  value={fileScope}
                  onChange={(e) => onFileScopeChange(e.target.value)}
                  placeholder="e.g. src/components/**, src/utils/*.ts"
                  data-testid="spawn-file-scope"
                  className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Glob patterns restricting which files this agent can modify
                </p>
              </>
            )}

            {/* Show selected files summary when tree picker has selections */}
            {showTreePicker && treePaths.length > 0 && (
              <p className="mt-1 text-xs text-blue-400">
                {treePaths.length} file{treePaths.length !== 1 ? 's' : ''}/folder
                {treePaths.length !== 1 ? 's' : ''} selected
              </p>
            )}

            {/* Scope overlap warning */}
            {checkingOverlaps && (
              <p className="mt-1 text-xs text-slate-500 animate-pulse">
                Checking for scope conflicts...
              </p>
            )}
            {scopeOverlaps.length > 0 && (
              <div
                className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3"
                data-testid="scope-overlap-warning"
              >
                <div className="flex items-center gap-2 mb-2">
                  <FiAlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0" />
                  <span className="text-sm font-medium text-amber-400">Scope Overlap Detected</span>
                </div>
                <div className="space-y-2">
                  {scopeOverlaps.map((overlap) => (
                    <div key={overlap.sessionId} className="text-xs text-amber-300/80">
                      <span className="font-medium text-amber-300">{overlap.agentName}</span>{' '}
                      already owns:{' '}
                      <span className="text-amber-200/70 font-mono">
                        {overlap.overlappingPaths.slice(0, 3).join(', ')}
                        {overlap.overlappingPaths.length > 3 &&
                          ` +${overlap.overlappingPaths.length - 3} more`}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-amber-400/60">
                  Assigning overlapping files to multiple builders may cause merge conflicts. You
                  can continue anyway or adjust the file scope.
                </p>
              </div>
            )}
          </div>

          {/* Initial prompt */}
          <div>
            <label htmlFor="spawn-prompt" className="block text-sm font-medium text-slate-300 mb-1">
              Initial Prompt <span className="text-slate-500 font-normal">(optional)</span>
            </label>
            <textarea
              id="spawn-prompt"
              value={prompt}
              onChange={(e) => onPromptChange(e.target.value)}
              placeholder="What should this agent work on?"
              rows={3}
              className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Validation errors summary */}
          {Object.keys(formErrors).length > 0 && Object.keys(touched).length > 0 && (
            <div
              className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400"
              data-testid="spawn-validation-errors"
            >
              Please fix the validation errors above before spawning.
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-700 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleValidatedSpawn}
            disabled={isSpawning || Object.keys(formErrors).length > 0}
            data-testid="spawn-confirm-button"
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSpawning ? (
              <>
                <FiLoader className="h-4 w-4 animate-spin" />
                Spawning...
              </>
            ) : (
              <>
                <FiPlay className="h-4 w-4" />
                Spawn {capability}
              </>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/** Virtualized table body for agent list - only renders visible rows */
function VirtualizedTableBody({
  filteredRows,
  colCount,
  onSelectAgent,
  handleAgentContextMenu,
}: {
  filteredRows: Row<Session>[];
  colCount: number;
  onSelectAgent?: (id: string) => void;
  handleAgentContextMenu: (e: React.MouseEvent, session: Session) => void;
}) {
  const tbodyRef = useRef<HTMLTableSectionElement>(null);

  const virtualizer = useVirtualizer({
    count: filteredRows.length,
    getScrollElement: () => tbodyRef.current,
    estimateSize: () => 48,
    overscan: 10,
  });

  if (filteredRows.length === 0) {
    return (
      <tbody>
        <tr>
          <td colSpan={colCount} className="px-4 py-8 text-center text-sm text-slate-500">
            No agents match your filters
          </td>
        </tr>
      </tbody>
    );
  }

  return (
    <tbody
      ref={tbodyRef}
      style={{ display: 'block', maxHeight: '600px', overflowY: 'auto' }}
      data-testid="virtualized-agent-list"
    >
      <tr
        style={{
          display: 'block',
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative',
        }}
      >
        <td style={{ display: 'block', padding: 0 }}>
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const row = filteredRows[virtualItem.index];
            return (
              <div
                key={row.id}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                }}
                className={`flex border-b border-slate-700/50 last:border-0 hover:bg-slate-700/30 transition-colors cursor-pointer ${row.original.state === 'working' || row.original.state === 'booting' ? 'animate-card-activity-pulse' : ''}`}
                onClick={() => onSelectAgent?.(row.original.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSelectAgent?.(row.original.id);
                }}
                onContextMenu={(e) => handleAgentContextMenu(e, row.original)}
                tabIndex={0}
              >
                {row.getVisibleCells().map((cell) => (
                  <div key={cell.id} className="px-4 py-3 flex-1">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </div>
                ))}
              </div>
            );
          })}
        </td>
      </tr>
    </tbody>
  );
}
