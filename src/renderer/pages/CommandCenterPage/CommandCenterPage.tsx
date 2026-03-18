import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { formatDateTime } from '../../lib/dateFormatting';
import { motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FiAlertTriangle,
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
  FiTrash2,
  FiX,
  FiXCircle,
  FiZap,
} from 'react-icons/fi';
import { toast } from 'sonner';
import type {
  AgentCapability,
  AgentProcessInfo,
  RuntimeInfo,
  Session,
} from '../../../shared/types';

import { Checkbox } from '../../components/ui/checkbox';
import { ContextMenu, type ContextMenuItem, useContextMenu } from '../../components/ContextMenu';
import { useFormDirtyTracking } from '../../hooks/useUnsavedChanges';
import { handleIpcError } from '../../lib/ipcErrorHandler';
import { useFilterStore } from '../../stores/filterStore';
import { useProjectStore } from '../../stores/projectStore';
import { DEFAULT_MODEL_DEFAULTS, useSettingsStore } from '../../stores/settingsStore';
import {
  AgentHierarchyTree,
  CoordinatorPanel,
  ScopeTreeViewer,
  AgentProgressBar,
  StopConfirmDialog,
  AgentTableSkeleton,
  AgentCardSkeleton,
  SpawnDialog,
  VirtualizedTableBody,
  VirtualizedCardList,
  CAPABILITY_DEFAULTS,
  CAPABILITY_COLORS,
  CAPABILITY_TOOLTIPS,
  STATE_COLORS,
  STATE_DOT_COLORS,
  STATE_ICONS,
  STATE_TOOLTIPS,
  ALL_CAPABILITIES,
  generateId,
  generateName,
  formatUptime,
  estimateAgentProgress,
} from './components';
import { Tooltip } from '../../components/Tooltip';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Separator } from '../../components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Table, TableHeader, TableHead, TableRow } from '../../components/ui/table';
import './CommandCenterPage.css';

/** Normalize SQLite UTC timestamps for correct local time display */
function normalizeTimestamp(dateStr: string): Date {
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(dateStr) && !dateStr.includes('Z') && !dateStr.includes('+') && !dateStr.includes('T')) {
    return new Date(`${dateStr.replace(' ', 'T')}Z`);
  }
  return new Date(dateStr);
}

/** Live-updating uptime display that ticks every second */
function LiveUptime({ createdAt }: { createdAt: string }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span
      className="text-xs text-slate-400 tabular-nums"
      data-testid="agent-uptime-cell"
      data-created-at={createdAt}
    >
      {formatUptime(createdAt)}
    </span>
  );
}

interface CommandCenterPageProps {
  onSelectAgent?: (agentId: string) => void;
}

export function CommandCenterPage({ onSelectAgent }: CommandCenterPageProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const activeSessions = useMemo(() => sessions.filter((s) => s.state !== 'completed'), [sessions]);
  const completedSessions = useMemo(() => sessions.filter((s) => s.state === 'completed'), [sessions]);
  const [runningProcesses, setRunningProcesses] = useState<AgentProcessInfo[]>([]);
  const [showSpawnDialog, setShowSpawnDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Tick counter to force uptime cell re-renders every second for accurate display
  // Only runs when there are active (non-completed) sessions to avoid idle CPU usage
  const [uptimeTick, setUptimeTick] = useState(0);
  const hasActiveSessions = useMemo(() => sessions.some((s) => s.state !== 'completed'), [sessions]);
  useEffect(() => {
    if (!hasActiveSessions) return;
    const timer = setInterval(() => setUptimeTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [hasActiveSessions]);
  const { agentsFilters, setAgentsFilters } = useFilterStore();
  const [viewMode, setViewMode] = useState<'table' | 'cards' | 'hierarchy' | 'scope'>(
    agentsFilters.viewMode,
  );

  // Table state - initialized from persistent filter store
  const [sorting, setSorting] = useState<SortingState>(agentsFilters.sorting);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(
    agentsFilters.columnFilters,
  );
  const [globalFilter, setGlobalFilter] = useState(agentsFilters.globalFilter);
  const [capabilityFilter, setCapabilityFilter] = useState<string>(agentsFilters.capabilityFilter);

  // Sync filter state back to store on changes
  useEffect(() => {
    setAgentsFilters({ viewMode, sorting, columnFilters, globalFilter, capabilityFilter });
  }, [viewMode, sorting, columnFilters, globalFilter, capabilityFilter, setAgentsFilters]);

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
  const spawnLockRef = useRef(false); // Ref-based guard to prevent double-click race conditions
  const [isOpeningSpawnDialog, setIsOpeningSpawnDialog] = useState(false);
  const [spawnError, setSpawnError] = useState<string | null>(null);

  // Track dirty state for unsaved changes warning on navigation
  const isSpawnFormDirty =
    showSpawnDialog &&
    (spawnName.trim() !== '' ||
      spawnTaskId.trim() !== '' ||
      spawnFileScope.trim() !== '' ||
      spawnPrompt.trim() !== '' ||
      spawnParentAgent !== '' ||
      spawnTreePaths.length > 0);
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
  const stopLockRef = useRef(false); // Guard against rapid stop clicks

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

  // Event-driven session/process loading (no polling)
  // biome-ignore lint/correctness/useExhaustiveDependencies: load on mount
  useEffect(() => {
    loadSessions();
    loadRunningProcesses();

    // Listen for agent state change events — no polling needed
    const unsubAgentUpdate = window.electronAPI.onAgentUpdate(() => {
      loadSessions();
      loadRunningProcesses();
    });

    return () => {
      unsubAgentUpdate();
    };
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
    // Ref-based guard prevents double-click race condition
    // (React state batching means isSpawning may not disable the button instantly)
    if (spawnLockRef.current) return;
    spawnLockRef.current = true;
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
      // Navigate to the newly spawned agent's detail view using session ID
      if (onSelectAgent && result.data?.id) {
        onSelectAgent(result.data.id as string);
      }
    } catch (err) {
      const msg = handleIpcError(err, { context: 'spawning agent' });
      setSpawnError(msg);
    } finally {
      setIsSpawning(false);
      spawnLockRef.current = false;
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
    // Ref-based guard against rapid double-clicks (prevents race conditions from React batching)
    if (stopLockRef.current) return;
    stopLockRef.current = true;
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
      stopLockRef.current = false;
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
          <Checkbox
            checked={
              activeSessions.length > 0 && activeSessions.every((s) => selectedAgents.has(s.id))
            }
            onCheckedChange={() => { toggleSelectAll(); }}
            onClick={(e) => e.stopPropagation()}
            className="border-slate-500 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500 cursor-pointer"
            title="Select all agents"
            data-testid="select-all-checkbox"
          />
        ),
        size: 36,
        enableSorting: false,
        cell: ({ row }) => (
          <Checkbox
            checked={selectedAgents.has(row.original.id)}
            onCheckedChange={() => { toggleAgentSelection(row.original.id); }}
            onClick={(e) => e.stopPropagation()}
            className="border-slate-500 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500 cursor-pointer"
            data-testid={`select-agent-${row.original.id}`}
          />
        ),
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
              <span className="text-xs text-slate-400 font-mono" title={agentId}>
                {shortId}
              </span>
              <Tooltip content="Copy agent ID">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(agentId);
                    toast.success('Agent ID copied to clipboard');
                  }}
                  className="opacity-0 group-hover/id:opacity-100 size-5 text-slate-400 hover:text-slate-300 hover:bg-slate-700 transition-all"
                  data-testid={`copy-agent-id-${agentId}`}
                >
                  <FiCopy className="size-3" />
                </Button>
              </Tooltip>
            </div>
          );
        },
      },
      {
        accessorKey: 'agent_name',
        header: 'Name',
        enableSorting: true,
        cell: ({ getValue }) => (
          <span className="font-medium text-slate-50 truncate block" title={getValue<string>()}>
            {getValue<string>()}
          </span>
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
            <Badge
              variant="outline"
              className={`${CAPABILITY_COLORS[cap] || 'bg-slate-500/20 text-slate-400'}`}
              title={CAPABILITY_TOOLTIPS[cap] || cap}
            >
              {cap}
            </Badge>
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
            ? Math.floor((Date.now() - normalizeTimestamp(stalledAt).getTime()) / 1000)
            : 0;
          const stalledMin = Math.floor(stalledDuration / 60);
          const stalledSec = stalledDuration % 60;

          return (
            <div className="flex items-center gap-1.5">
              <Badge
                variant="outline"
                className={`${STATE_COLORS[state] || ''} border-transparent`}
                title={STATE_TOOLTIPS[state] || state}
              >
                {state}
              </Badge>
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
        id: 'active',
        header: 'Active',
        size: 110,
        enableSorting: true,
        accessorFn: (row) => row.state !== 'completed',
        cell: ({ row }) => {
          const active = row.original.state !== 'completed';
          return (
            <Badge
              variant="outline"
              className={`gap-1.5 whitespace-nowrap px-2.5 py-0.5 text-xs font-semibold ${
                active
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                  : 'bg-red-500/15 text-red-400 border-red-500/25'
              }`}
            >
              <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${active ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
              {active ? 'Active' : 'Stopped'}
            </Badge>
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
            <span className="text-xs text-slate-400 font-mono">{pid}</span>
          ) : (
            <span className="text-xs text-slate-400">-</span>
          );
        },
      },
      {
        id: 'uptime',
        header: 'Uptime',
        enableSorting: true,
        // Uses numeric milliseconds for correct sorting across midnight/day boundaries
        accessorFn: (row) => normalizeTimestamp(row.created_at).getTime(),
        sortingFn: 'basic',
        sortDescFirst: true,
        cell: ({ row }) => <LiveUptime createdAt={row.original.created_at} />,
      },
      {
        id: 'task',
        header: 'Task',
        enableSorting: true,
        accessorFn: (row) => row.task_id || '',
        cell: ({ getValue }) => {
          const taskId = getValue<string>();
          return taskId ? (
            <span className="text-xs text-slate-400 truncate block" title={taskId}>
              {taskId}
            </span>
          ) : (
            <span className="text-xs text-slate-400">-</span>
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
                <Tooltip content="Nudge stalled agent">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleNudgeAgent(row.original.id);
                    }}
                    className="size-7 bg-amber-600/20 text-amber-400 hover:bg-amber-600/30"
                    aria-label="Nudge stalled agent"
                  >
                    <FiZap className="size-3.5" />
                  </Button>
                </Tooltip>
              )}
              <Tooltip content="Stop agent">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    requestStopAgent(row.original.id, row.original.agent_name);
                  }}
                  className="size-7 bg-red-600/20 text-red-400 hover:bg-red-600/30"
                  aria-label="Stop agent"
                >
                  <FiSquare className="size-3.5" />
                </Button>
              </Tooltip>
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
      uptimeTick, // Force uptime cell re-renders every second
    ],
  );

  const table = useReactTable({
    data: sessions,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter: globalFilter.trim(),
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
    <div className="space-y-5" data-testid="agents-page" data-agent-count={sessions.length}>
      {/* Header */}
      <motion.div
        className="flex items-center justify-between"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-50 tracking-tight">Agents</h1>
            <div className="flex items-center gap-2 mt-1.5">
              {activeSessions.length > 0 && (
                <Badge variant="outline" className="bg-green-500/10 border-green-500/20 text-green-400 gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                  {activeSessions.length} active
                </Badge>
              )}
              {completedSessions.length > 0 && (
                <Badge variant="outline" className="bg-slate-500/10 border-slate-500/20 text-slate-400">
                  {completedSessions.length} completed
                </Badge>
              )}
              {activeSessions.length === 0 && completedSessions.length === 0 && (
                <span className="text-sm text-slate-400">No agents deployed</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedAgents.size > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-2"
            >
              <span className="text-xs text-slate-400 mr-1">
                {selectedAgents.size} selected
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const promises = Array.from(selectedAgents).map((id) => {
                    const s = sessions.find((sess) => sess.id === id);
                    if (s && (s.state === 'stalled' || s.state === 'working')) {
                      return window.electronAPI.agentNudge(id).catch(() => {});
                    }
                    return Promise.resolve();
                  });
                  await Promise.allSettled(promises);
                  toast.success(`Nudged ${selectedAgents.size} agent(s)`);
                }}
                className="bg-amber-600/15 text-amber-400 border border-amber-500/25 hover:bg-amber-600/25 hover:text-amber-300"
                data-testid="bulk-nudge-button"
              >
                <FiZap className="size-3.5" />
                Nudge
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={requestBulkStop}
                className="bg-red-600/15 text-red-400 border border-red-500/25 hover:bg-red-600/25 hover:text-red-300"
                data-testid="bulk-stop-button"
              >
                <FiSquare className="size-3.5" />
                Stop
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const ids = Array.from(selectedAgents);
                  const count = ids.length;
                  let deleted = 0;
                  for (const id of ids) {
                    try {
                      const result = await window.electronAPI.agentDelete(id);
                      if (result.data) deleted++;
                      else if (result.error) toast.error(`Failed to delete agent: ${result.error}`);
                    } catch (err) {
                      toast.error(`Delete failed: ${err}`);
                    }
                  }
                  // Remove from local state immediately
                  const deletedSet = new Set(ids);
                  setSessions((prev) => prev.filter((s) => !deletedSet.has(s.id)));
                  setSelectedAgents(new Set());
                  loadRunningProcesses();
                  if (deleted > 0) toast.success(`Deleted ${deleted} agent(s)`);
                }}
                className="bg-red-600/15 text-red-400 border border-red-500/25 hover:bg-red-600/25 hover:text-red-300"
                data-testid="bulk-delete-button"
              >
                <FiTrash2 className="size-3.5" />
                Delete
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedAgents(new Set())}
                className="text-slate-400 hover:text-white"
                data-testid="bulk-deselect-button"
              >
                <FiX className="size-3.5" />
                Clear
              </Button>
            </motion.div>
          )}
          {activeSessions.length > 0 && selectedAgents.size === 0 && (
            <Button
              variant="outline"
              onClick={requestStopAll}
              className="bg-red-600/15 text-red-400 border border-red-500/25 hover:bg-red-600/25 hover:text-red-300"
              >
              <FiSquare className="size-3.5" />
              Stop All
            </Button>
          )}
          <Button
            onClick={openSpawnDialog}
            disabled={isOpeningSpawnDialog}
            data-testid="spawn-agent-button"
            className="bg-blue-600/15 text-blue-400 border border-blue-500/25 hover:bg-blue-600/25 hover:text-blue-300"
          >
            {isOpeningSpawnDialog ? (
              <>
                <FiLoader className="size-4 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <FiPlay className="size-4" />
                Spawn Agent
              </>
            )}
          </Button>
        </div>
      </motion.div>

      {/* Error display */}
      {error && (
        <motion.div
          className="rounded-xl border border-red-500/20 bg-red-500/5 backdrop-blur-sm px-4 py-3 text-sm text-red-400 flex items-center justify-between gap-3"
          initial={{ opacity: 0, y: -4, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          transition={{ duration: 0.2 }}
        >
          <div className="flex items-center gap-2.5">
            <FiAlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
          <Tooltip content="Dismiss">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setError(null)}
              className="shrink-0 hover:bg-red-500/10"
            >
              <FiX className="size-3.5" />
            </Button>
          </Tooltip>
        </motion.div>
      )}

      {/* Coordinator Panel */}
      <CoordinatorPanel />

      {/* Filter bar */}
      <motion.div
        className="flex items-center gap-3 rounded-xl border border-slate-700/50 bg-slate-800/40 backdrop-blur-sm px-4 py-3"
        data-testid="agent-filter-bar"
        data-filters-active={
          globalFilter.trim() !== '' || capabilityFilter !== 'all' ? 'true' : 'false'
        }
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05, ease: 'easeOut' }}
      >
        {/* Global search */}
        <div className="relative flex-1 max-w-sm">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            type="text"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            maxLength={200}
            placeholder="Search agents by name..."
            aria-label="Search agents by name"
            data-testid="agent-global-filter"
            className="w-full border-slate-600/50 bg-slate-900/60 pl-9 pr-8 text-slate-200 placeholder-slate-500 focus-visible:ring-blue-500/30 focus-visible:border-blue-500/50"
          />
          {globalFilter && (
            <Tooltip content="Clear search">
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setGlobalFilter('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 size-5 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
                aria-label="Clear search"
                data-testid="agent-search-clear"
              >
                <FiX className="size-3.5" />
              </Button>
            </Tooltip>
          )}
        </div>

        {/* Capability filter */}
        <Select
          value={capabilityFilter}
          onValueChange={(val) => setCapabilityFilter(val)}
        >
          <SelectTrigger
            data-testid="agent-capability-filter"
            aria-label="Filter by capability"
            className={`w-auto min-w-[160px] bg-slate-900/60 text-sm ${
              capabilityFilter !== 'all'
                ? 'border-blue-500/30 text-blue-300'
                : 'border-slate-600/50 text-slate-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <FiFilter className="h-4 w-4 text-slate-400" />
              <SelectValue placeholder="All Capabilities" />
            </div>
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem value="all" className="text-slate-300 focus:bg-slate-700 focus:text-slate-200">
              All Capabilities
            </SelectItem>
            {ALL_CAPABILITIES.map((cap) => (
              <SelectItem key={cap} value={cap} className="text-slate-300 focus:bg-slate-700 focus:text-slate-200">
                {cap.charAt(0).toUpperCase() + cap.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Separator */}
        <Separator orientation="vertical" className="h-6 bg-slate-700/50" />

        {/* View mode toggle */}
        <div className="flex rounded-lg border border-slate-600/50 bg-slate-900/40 overflow-hidden">
          {([
            { mode: 'table' as const, icon: <FiList className="size-4" />, label: 'Table view' },
            { mode: 'cards' as const, icon: <FiGrid className="size-4" />, label: 'Card view' },
            { mode: 'hierarchy' as const, icon: <FiGitBranch className="size-4" />, label: 'Hierarchy tree view' },
            { mode: 'scope' as const, icon: <FiMap className="size-4" />, label: 'Scope map - file tree color-coded by agent' },
          ] as const).map((v) => (
            <Tooltip key={v.mode} content={v.label}>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setViewMode(v.mode)}
                className={`relative rounded-none transition-all ${
                  viewMode === v.mode
                    ? 'bg-blue-500/15 text-blue-400'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                }`}
                aria-label={v.label}
                data-testid={v.mode === 'scope' ? 'view-mode-scope' : undefined}
              >
                {v.icon}
              {viewMode === v.mode && (
                <motion.div
                  className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-400"
                  layoutId="viewModeIndicator"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              </Button>
            </Tooltip>
          ))}
        </div>
      </motion.div>

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
        /* Empty state — command center awaiting deployment */
        <motion.div
          data-testid="agents-empty-state"
          className="relative rounded-xl border border-slate-700/50 bg-slate-800/50 overflow-hidden"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          {/* Animated grid background */}
          <div className="absolute inset-0 agents-grid-bg" />

          {/* Content */}
          <div className="relative z-10 flex flex-col items-center py-16 px-8">
            {/* Radar icon with animated rings */}
            <motion.div
              className="relative mb-8"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.15 }}
            >
              {/* Pulse rings */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-28 w-28 rounded-full border border-blue-500/10 animate-radar-pulse-ring" />
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-28 w-28 rounded-full border border-blue-500/10 animate-radar-pulse-ring" style={{ animationDelay: '1s' }} />
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-28 w-28 rounded-full border border-blue-500/10 animate-radar-pulse-ring" style={{ animationDelay: '2s' }} />
              </div>

              {/* Center icon */}
              <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-slate-700/80 to-slate-800/80 border border-slate-600/50 shadow-xl shadow-black/20">
                <FiCpu className="h-9 w-9 text-blue-400/80" />
              </div>
            </motion.div>

            <motion.p
              data-testid="agents-empty-title"
              className="text-xl font-semibold text-slate-200 mb-2 tracking-tight"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.25 }}
            >
              Command center ready
            </motion.p>
            <motion.p
              data-testid="agents-empty-message"
              className="text-sm text-slate-400 mb-8 max-w-md text-center leading-relaxed"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.3 }}
            >
              Deploy agents to scout, build, review, and orchestrate your codebase.
              Each agent works autonomously with its own worktree and context.
            </motion.p>

            <motion.div
              className="flex items-center gap-3"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.35 }}
            >
              <Button
                data-testid="agents-empty-cta"
                onClick={openSpawnDialog}
                className="bg-blue-600/15 text-blue-400 border border-blue-500/25 hover:bg-blue-600/25 hover:text-blue-300"
                  >
                <FiPlay className="size-3.5" />
                Spawn Agent
              </Button>
            </motion.div>

            {/* Capability hints */}
            <motion.div
              className="flex items-center gap-2 mt-8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.5 }}
            >
              {(['scout', 'builder', 'reviewer', 'lead'] as const).map((cap) => (
                <Badge
                  key={cap}
                  variant="outline"
                  className={`${CAPABILITY_COLORS[cap]} opacity-50`}
                  title={CAPABILITY_TOOLTIPS[cap]}
                >
                  {cap}
                </Badge>
              ))}
              <span className="text-xs text-slate-400">+3 more</span>
            </motion.div>
          </div>
        </motion.div>
      ) : viewMode === 'hierarchy' ? (
        /* Hierarchy tree view */
        <AgentHierarchyTree
          sessions={sessions}
          onSelectAgent={(agentId) => onSelectAgent?.(agentId)}
        />
      ) : viewMode === 'table' ? (
        /* Table view with @tanstack/react-table */
        <motion.div
          className="rounded-xl border border-slate-700/50 bg-slate-800/50 overflow-hidden"
          data-testid="agents-table-container"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="border-b border-slate-700/60 bg-slate-800/80 hover:bg-slate-800/80 flex">
                  {headerGroup.headers.map((header) => {
                    const size = header.getSize();
                    const hasExplicitSize = size !== 150;
                    return (
                      <TableHead
                        key={header.id}
                        data-testid={`agent-sort-${header.id}`}
                        className={`h-auto px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider ${
                          header.column.getCanSort()
                            ? 'cursor-pointer select-none hover:text-slate-200 transition-colors'
                            : ''
                        }`}
                        style={hasExplicitSize ? { width: size, flexShrink: 0 } : { flex: 1, minWidth: 0 }}
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
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <VirtualizedTableBody
              filteredRows={filteredRows}
              colCount={columns.length}
              onSelectAgent={onSelectAgent}
              handleAgentContextMenu={handleAgentContextMenu}
            />
          </Table>
          {/* Table footer with count */}
          <div
            className="border-t border-slate-700/40 bg-slate-800/30 px-4 py-2 text-xs text-slate-400"
            data-testid="agent-filter-count"
            data-filtered-count={filteredRows.length}
            data-total-count={sessions.length}
          >
            Showing {filteredRows.length} of {sessions.length} agent{sessions.length !== 1 ? 's' : ''}
          </div>
        </motion.div>
      ) : (
        /* Card view - virtualized for 100+ agents */
        <motion.div
          className="space-y-5"
          data-testid="agent-card-view"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          {filteredRows.filter((r) => r.original.state !== 'completed').length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Active Agents
                </h2>
                <Badge variant="outline" className="bg-green-500/10 border-green-500/20 text-green-400 text-[10px]">
                  {filteredRows.filter((r) => r.original.state !== 'completed').length}
                </Badge>
              </div>
              <VirtualizedCardList
                rows={filteredRows.filter((r) => r.original.state !== 'completed')}
                runningProcesses={runningProcesses}
                childCountMap={childCountMap}
                selectedAgents={selectedAgents}
                toggleAgentSelection={toggleAgentSelection}
                requestStopAgent={requestStopAgent}
                handleNudgeAgent={handleNudgeAgent}
                onSelectAgent={onSelectAgent}
                handleAgentContextMenu={handleAgentContextMenu}
              />
            </div>
          )}

          {filteredRows.filter((r) => r.original.state === 'completed').length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Completed
                </h2>
                <Badge variant="outline" className="bg-slate-500/10 border-slate-500/20 text-slate-400 text-[10px]">
                  {filteredRows.filter((r) => r.original.state === 'completed').length}
                </Badge>
              </div>
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
                          <Badge
                            variant="outline"
                            className={`${CAPABILITY_COLORS[session.capability] || 'bg-slate-500/20 text-slate-400'}`}
                          >
                            {session.capability}
                          </Badge>
                          <span
                            className="text-sm text-slate-300 truncate max-w-[200px]"
                            title={session.agent_name}
                          >
                            {session.agent_name}
                          </span>
                        </div>
                        <span className="text-xs text-slate-400">
                          {session.completed_at
                            ? formatDateTime(session.completed_at)
                            : ''}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {filteredRows.length === 0 && (
            <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-10 text-center">
              <FiSearch className="h-8 w-8 text-slate-400 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-300 mb-1">No agents match your filters</p>
              <p className="text-xs text-slate-400">Try adjusting your search or capability filter</p>
            </div>
          )}
        </motion.div>
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
