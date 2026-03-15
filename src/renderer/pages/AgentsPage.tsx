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
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FiActivity,
  FiChevronDown,
  FiChevronUp,
  FiCpu,
  FiFilter,
  FiGrid,
  FiList,
  FiPlay,
  FiSearch,
  FiSquare,
  FiX,
  FiZap,
} from 'react-icons/fi';
import type { AgentCapability, AgentProcessInfo, Session } from '../../shared/types';
import { CoordinatorPanel } from '../components/CoordinatorPanel';

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
  working: 'bg-green-400 animate-pulse',
  completed: 'bg-slate-400',
  stalled: 'bg-amber-400',
  zombie: 'bg-red-400',
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

export function AgentsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [runningProcesses, setRunningProcesses] = useState<AgentProcessInfo[]>([]);
  const [showSpawnDialog, setShowSpawnDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

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
  const [spawnPrompt, setSpawnPrompt] = useState('');
  const [isSpawning, setIsSpawning] = useState(false);
  const [spawnError, setSpawnError] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      const result = await window.electronAPI.agentList();
      if (result.data) {
        setSessions(result.data);
      }
    } catch (err) {
      console.error('Failed to load sessions:', err);
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
      console.error('Failed to load running processes:', err);
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

    return () => clearInterval(interval);
  }, []);

  // Update model when capability changes
  useEffect(() => {
    const defaults = CAPABILITY_DEFAULTS[spawnCapability];
    if (defaults) {
      setSpawnModel(defaults.model);
    }
  }, [spawnCapability]);

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

  const openSpawnDialog = () => {
    setSpawnCapability('scout');
    setSpawnModel('haiku');
    setSpawnName('');
    setSpawnTaskId('');
    setSpawnPrompt('');
    setSpawnError(null);
    setShowSpawnDialog(true);
  };

  const handleSpawn = async () => {
    setIsSpawning(true);
    setSpawnError(null);

    const id = generateId();
    const agentName = spawnName.trim() || generateName(spawnCapability);

    try {
      const result = await window.electronAPI.agentSpawn({
        id,
        agent_name: agentName,
        capability: spawnCapability,
        model: spawnModel,
        task_id: spawnTaskId.trim() || undefined,
        prompt: spawnPrompt.trim() || undefined,
      });

      if (result.error) {
        setSpawnError(result.error);
        setIsSpawning(false);
        return;
      }

      // Success - close dialog and refresh
      setShowSpawnDialog(false);
      await loadSessions();
      await loadRunningProcesses();
    } catch (err) {
      setSpawnError(String(err));
    } finally {
      setIsSpawning(false);
    }
  };

  const handleStop = useCallback(
    async (sessionId: string) => {
      try {
        await window.electronAPI.agentStop(sessionId);
        await loadSessions();
        await loadRunningProcesses();
      } catch (err) {
        setError(String(err));
      }
    },
    [loadSessions, loadRunningProcesses],
  );

  const handleStopAll = async () => {
    try {
      await window.electronAPI.agentStopAll();
      await loadSessions();
      await loadRunningProcesses();
    } catch (err) {
      setError(String(err));
    }
  };

  // Table columns definition
  const columns = useMemo<ColumnDef<Session>[]>(
    () => [
      {
        id: 'state_indicator',
        header: '',
        size: 30,
        enableSorting: false,
        cell: ({ row }) => (
          <div
            className={`h-2.5 w-2.5 rounded-full ${STATE_DOT_COLORS[row.original.state] || 'bg-slate-400'}`}
          />
        ),
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
        cell: ({ getValue }) => {
          const state = getValue<string>();
          return (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATE_COLORS[state] || ''}`}
            >
              {state}
            </span>
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
        id: 'actions',
        header: '',
        size: 40,
        enableSorting: false,
        cell: ({ row }) => {
          if (row.original.state === 'completed') return null;
          return (
            <button
              type="button"
              onClick={() => handleStop(row.original.id)}
              className="rounded-md bg-red-600/20 p-1.5 text-red-400 hover:bg-red-600/30 transition-colors"
              title="Stop agent"
            >
              <FiSquare className="h-3.5 w-3.5" />
            </button>
          );
        },
      },
    ],
    [runningProcesses, handleStop],
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
          {activeSessions.length > 0 && (
            <button
              type="button"
              onClick={handleStopAll}
              className="flex items-center gap-2 rounded-md bg-red-600/20 border border-red-500/30 px-3 py-2 text-sm text-red-400 hover:bg-red-600/30 transition-colors"
            >
              <FiSquare className="h-4 w-4" />
              Stop All
            </button>
          )}
          <button
            type="button"
            onClick={openSpawnDialog}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
          >
            <FiPlay className="h-4 w-4" />
            Spawn Agent
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
            className="w-full rounded-lg border border-slate-600 bg-slate-800 pl-9 pr-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {globalFilter && (
            <button
              type="button"
              onClick={() => setGlobalFilter('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
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
        </div>
      </div>

      {/* Loading skeleton */}
      {isLoading ? (
        viewMode === 'table' ? (
          <AgentTableSkeleton />
        ) : (
          <AgentCardSkeleton />
        )
      ) : sessions.length === 0 ? (
        /* Empty state */
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center text-slate-400">
          <FiCpu className="h-12 w-12 mx-auto mb-3 text-slate-600" />
          <p className="text-lg mb-2">No agents running</p>
          <p className="text-sm mb-4">Spawn an agent to start coding with AI</p>
          <button
            type="button"
            onClick={openSpawnDialog}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
          >
            Spawn Agent
          </button>
        </div>
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
            <tbody>
              {filteredRows.length > 0 ? (
                filteredRows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-slate-700/50 last:border-0 hover:bg-slate-700/30 transition-colors"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-4 py-8 text-center text-sm text-slate-500"
                  >
                    No agents match your filters
                  </td>
                </tr>
              )}
            </tbody>
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
              <div className="grid gap-3">
                {filteredRows
                  .filter((r) => r.original.state !== 'completed')
                  .map((row) => {
                    const session = row.original;
                    const proc = runningProcesses.find((p) => p.id === session.id);
                    return (
                      <AgentCard
                        key={session.id}
                        session={session}
                        processInfo={proc}
                        onStop={() => handleStop(session.id)}
                      />
                    );
                  })}
              </div>
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
          name={spawnName}
          taskId={spawnTaskId}
          prompt={spawnPrompt}
          isSpawning={isSpawning}
          error={spawnError}
          onCapabilityChange={setSpawnCapability}
          onModelChange={setSpawnModel}
          onNameChange={setSpawnName}
          onTaskIdChange={setSpawnTaskId}
          onPromptChange={setSpawnPrompt}
          onSpawn={handleSpawn}
          onClose={() => setShowSpawnDialog(false)}
        />
      )}
    </div>
  );
}

function AgentCard({
  session,
  processInfo,
  onStop,
}: {
  session: Session;
  processInfo?: AgentProcessInfo;
  onStop: () => void;
}) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* State indicator */}
          <div
            className={`h-2.5 w-2.5 rounded-full ${STATE_DOT_COLORS[session.state] || 'bg-slate-400'}`}
          />

          {/* Agent name */}
          <span className="font-medium text-slate-50">{session.agent_name}</span>

          {/* Capability badge */}
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${CAPABILITY_COLORS[session.capability] || 'bg-slate-500/20 text-slate-400'}`}
          >
            {session.capability}
          </span>

          {/* State badge */}
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATE_COLORS[session.state] || ''}`}
          >
            {session.state}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Model */}
          {processInfo && <span className="text-xs text-slate-500">{processInfo.model}</span>}

          {/* PID */}
          {(session.pid || processInfo?.pid) && (
            <span className="text-xs text-slate-500 font-mono">
              PID: {session.pid || processInfo?.pid}
            </span>
          )}

          {/* Uptime */}
          <span className="text-xs text-slate-500">{formatUptime(session.created_at)}</span>

          {/* Stop button */}
          <button
            type="button"
            onClick={onStop}
            className="rounded-md bg-red-600/20 p-1.5 text-red-400 hover:bg-red-600/30 transition-colors"
            title="Stop agent"
          >
            <FiSquare className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Details row */}
      <div className="mt-2 flex items-center gap-4 text-xs text-slate-500">
        {session.task_id && <span>Task: {session.task_id}</span>}
        {session.worktree_path && <span>Worktree: {session.worktree_path}</span>}
        {session.branch_name && <span>Branch: {session.branch_name}</span>}
      </div>
    </div>
  );
}

function SpawnDialog({
  capability,
  model,
  name,
  taskId,
  prompt,
  isSpawning,
  error,
  onCapabilityChange,
  onModelChange,
  onNameChange,
  onTaskIdChange,
  onPromptChange,
  onSpawn,
  onClose,
}: {
  capability: AgentCapability;
  model: string;
  name: string;
  taskId: string;
  prompt: string;
  isSpawning: boolean;
  error: string | null;
  onCapabilityChange: (c: AgentCapability) => void;
  onModelChange: (m: string) => void;
  onNameChange: (n: string) => void;
  onTaskIdChange: (t: string) => void;
  onPromptChange: (p: string) => void;
  onSpawn: () => void;
  onClose: () => void;
}) {
  const capabilityInfo = CAPABILITY_DEFAULTS[capability];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-800 shadow-2xl">
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
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-6 py-4">
          {/* Capability selector */}
          <div>
            <span className="block text-sm font-medium text-slate-300 mb-2">Capability</span>
            <div className="grid grid-cols-4 gap-2">
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

          {/* Model picker */}
          <div>
            <span className="block text-sm font-medium text-slate-300 mb-2">Model</span>
            <div className="flex gap-2">
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
            {model !== capabilityInfo.model && (
              <p className="mt-1 text-xs text-amber-400">
                Default for {capability} is {capabilityInfo.model}
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
              onChange={(e) => onNameChange(e.target.value)}
              placeholder={`e.g. swift-${capability}-001`}
              className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
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
              onChange={(e) => onTaskIdChange(e.target.value)}
              placeholder="e.g. TASK-42"
              className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
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
            onClick={onSpawn}
            disabled={isSpawning}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSpawning ? (
              <>
                <FiActivity className="h-4 w-4 animate-spin" />
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
      </div>
    </div>
  );
}
