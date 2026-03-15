import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FiActivity,
  FiAlertTriangle,
  FiBarChart2,
  FiCalendar,
  FiChevronDown,
  FiChevronRight,
  FiClock,
  FiFileText,
  FiFilter,
  FiHash,
  FiInfo,
  FiPlay,
  FiRefreshCw,
  FiSearch,
  FiSquare,
  FiTerminal,
  FiTrash2,
  FiTrendingUp,
  FiUpload,
  FiXCircle,
  FiZap,
} from 'react-icons/fi';
import type { AppLogEntry, Event, LogLevel, ToolStats } from '../../shared/types';

type DebugTab = 'terminal' | 'events' | 'tool-stats' | 'logs' | 'timeline' | 'errors';

export function DebugPage() {
  const [activeTab, setActiveTab] = useState<DebugTab>('terminal');

  return (
    <div className={activeTab === 'terminal' ? 'flex flex-col h-full' : ''}>
      <div className="mb-6 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <FiTerminal className="h-7 w-7 text-cyan-400" />
          <h1 className="text-2xl font-bold text-slate-50">Debug</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-lg bg-slate-800 p-1 flex-shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab('terminal')}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'terminal'
              ? 'bg-slate-700 text-cyan-400'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FiTerminal className="h-4 w-4" />
          Terminal
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('logs')}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'logs'
              ? 'bg-slate-700 text-cyan-400'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FiFileText className="h-4 w-4" />
          Logs
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('tool-stats')}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'tool-stats'
              ? 'bg-slate-700 text-cyan-400'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FiBarChart2 className="h-4 w-4" />
          Tool Stats
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('events')}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'events'
              ? 'bg-slate-700 text-cyan-400'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FiActivity className="h-4 w-4" />
          Event Log
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('timeline')}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'timeline'
              ? 'bg-slate-700 text-cyan-400'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FiClock className="h-4 w-4" />
          Timeline
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('errors')}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'errors'
              ? 'bg-slate-700 text-red-400'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FiAlertTriangle className="h-4 w-4" />
          Errors
        </button>
      </div>

      {activeTab === 'terminal' ? (
        <DebugTerminalPanel />
      ) : activeTab === 'logs' ? (
        <AppLogPanel />
      ) : activeTab === 'tool-stats' ? (
        <ToolStatsPanel />
      ) : activeTab === 'timeline' ? (
        <TimelinePanel />
      ) : activeTab === 'errors' ? (
        <ErrorAggregationPanel />
      ) : (
        <EventLogPanel />
      )}
    </div>
  );
}

// ── Debug Terminal Panel (Feature #124) ──────────────────────────────

function DebugTerminalPanel() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [shellPid, setShellPid] = useState<number | null>(null);

  // Spawn shell and initialize xterm
  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      theme: {
        background: '#0f172a',
        foreground: '#f8fafc',
        cursor: '#60a5fa',
        cursorAccent: '#0f172a',
        selectionBackground: '#334155',
        selectionForeground: '#f8fafc',
        black: '#1e293b',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#f1f5f9',
        brightBlack: '#475569',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#facc15',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#ffffff',
      },
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
      fontSize: 13,
      lineHeight: 1.3,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 5000,
      allowProposedApi: true,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon((_event, uri) => {
      window.open(uri, '_blank');
    });

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(terminalRef.current);

    try {
      fitAddon.fit();
    } catch {
      // Ignore initial fit errors
    }

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Send user input to the debug shell pty
    term.onData((data) => {
      window.electronAPI.debugShellWrite(data);
    });

    // Resize handler
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
        if (xtermRef.current) {
          const { cols, rows } = xtermRef.current;
          window.electronAPI.debugShellResize(cols, rows);
        }
      } catch {
        // Ignore resize errors
      }
    });

    resizeObserver.observe(terminalRef.current);

    // Spawn the debug shell
    const spawnShell = async () => {
      try {
        const result = await window.electronAPI.debugShellSpawn();
        if (result.data) {
          setShellPid(result.data.pid);
          setIsRunning(true);

          // Load existing output buffer
          const outputResult = await window.electronAPI.debugShellOutput();
          if (outputResult.data && outputResult.data.length > 0) {
            for (const line of outputResult.data) {
              term.write(line);
            }
            term.scrollToBottom();
          }
        }
      } catch (err) {
        console.error('Failed to spawn debug shell:', err);
      }
    };

    spawnShell();

    // Subscribe to live output
    const handleOutput = (data: { data: string }) => {
      if (xtermRef.current) {
        xtermRef.current.write(data.data);
      }
    };

    window.electronAPI.onDebugShellOutput(handleOutput);

    return () => {
      resizeObserver.disconnect();
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
      window.electronAPI.removeAllListeners('debug:shell-output');
    };
  }, []);

  const handleKill = async () => {
    await window.electronAPI.debugShellKill();
    setIsRunning(false);
    setShellPid(null);
    if (xtermRef.current) {
      xtermRef.current.writeln('\r\n\x1b[31m[Shell terminated]\x1b[0m');
    }
  };

  const handleRestart = async () => {
    await window.electronAPI.debugShellKill();
    if (xtermRef.current) {
      xtermRef.current.clear();
    }
    try {
      const result = await window.electronAPI.debugShellSpawn();
      if (result.data) {
        setShellPid(result.data.pid);
        setIsRunning(true);
      }
    } catch (err) {
      console.error('Failed to restart debug shell:', err);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0" data-testid="debug-terminal-panel">
      {/* Terminal toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-t-lg flex-shrink-0">
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${isRunning ? 'bg-green-400 animate-pulse' : 'bg-slate-500'}`}
          />
          <span className="text-xs text-slate-400">
            {isRunning ? `Shell (PID: ${shellPid})` : 'Not running'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleRestart}
            className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
            title="Restart shell"
          >
            <FiRefreshCw className="h-3.5 w-3.5" />
            Restart
          </button>
          {isRunning && (
            <button
              type="button"
              onClick={handleKill}
              className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/30 transition-colors"
              title="Kill shell"
            >
              <FiSquare className="h-3.5 w-3.5" />
              Kill
            </button>
          )}
        </div>
      </div>

      {/* Terminal container */}
      <div className="flex-1 min-h-0 border border-t-0 border-slate-700 rounded-b-lg overflow-hidden">
        <div
          ref={terminalRef}
          className="h-full w-full"
          style={{ padding: '4px' }}
          data-testid="debug-terminal"
        />
      </div>
    </div>
  );
}

// ── App Log Panel (Feature #125 + #128) ──────────────────────────────

function AppLogPanel() {
  const [logs, setLogs] = useState<AppLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [levelFilter, setLevelFilter] = useState<string>('');
  const [agentFilter, setAgentFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');
  const [agents, setAgents] = useState<string[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [statusMessage, setStatusMessage] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const filters: {
        level?: string;
        agent_name?: string;
        search?: string;
        start_time?: string;
        end_time?: string;
        limit?: number;
      } = { limit: 500 };
      if (levelFilter) filters.level = levelFilter;
      if (agentFilter) filters.agent_name = agentFilter;
      if (searchQuery) filters.search = searchQuery;
      if (startTime) filters.start_time = startTime;
      if (endTime) filters.end_time = endTime;

      const result = await window.electronAPI.appLogList(filters);
      if (result.data) {
        setLogs(result.data);
      }
    } catch (error) {
      console.error('Failed to load app logs:', error);
    } finally {
      setIsLoading(false);
    }
  }, [levelFilter, agentFilter, searchQuery, startTime, endTime]);

  const loadAgents = useCallback(async () => {
    try {
      const result = await window.electronAPI.appLogAgents();
      if (result.data) {
        setAgents(result.data);
      }
    } catch (error) {
      console.error('Failed to load agents:', error);
    }
  }, []);

  useEffect(() => {
    loadLogs();
    loadAgents();
  }, [loadLogs, loadAgents]);

  const handlePurge = async () => {
    if (!confirm('Delete all application logs? This cannot be undone.')) return;
    try {
      await window.electronAPI.appLogPurge();
      setLogs([]);
      setStatusMessage('All logs purged');
      setTimeout(() => setStatusMessage(''), 3000);
    } catch (error) {
      console.error('Failed to purge logs:', error);
    }
  };

  const handleCreateTestLog = async () => {
    try {
      const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
      for (const level of levels) {
        await window.electronAPI.appLogCreate({
          level,
          message: `Test ${level} log entry at ${new Date().toISOString()}`,
          source: 'debug-page',
          agent_name: null as unknown as undefined,
          data: JSON.stringify({ test: true, level, timestamp: Date.now() }),
        });
      }
      setStatusMessage('Created 4 test log entries');
      setTimeout(() => setStatusMessage(''), 3000);
      loadLogs();
    } catch (error) {
      console.error('Failed to create test log:', error);
    }
  };

  const handleImportNdjson = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const content = await file.text();
      const result = await window.electronAPI.appLogImportNdjson(content);
      if (result.data) {
        setStatusMessage(`Imported ${result.data.imported} log entries from ${file.name}`);
        setTimeout(() => setStatusMessage(''), 5000);
        loadLogs();
        loadAgents();
      } else {
        setStatusMessage(`Import failed: ${result.error}`);
        setTimeout(() => setStatusMessage(''), 5000);
      }
    } catch (error) {
      console.error('Failed to import NDJSON:', error);
      setStatusMessage('Import failed');
      setTimeout(() => setStatusMessage(''), 3000);
    }
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClearFilters = () => {
    setLevelFilter('');
    setAgentFilter('');
    setSearchQuery('');
    setStartTime('');
    setEndTime('');
  };

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const hasFilters = levelFilter || agentFilter || searchQuery || startTime || endTime;

  const levelCounts = {
    debug: logs.filter((l) => l.level === 'debug').length,
    info: logs.filter((l) => l.level === 'info').length,
    warn: logs.filter((l) => l.level === 'warn').length,
    error: logs.filter((l) => l.level === 'error').length,
  };

  return (
    <div className="space-y-4">
      {/* Status message */}
      {statusMessage && (
        <div className="rounded-md bg-blue-900/50 border border-blue-700 px-4 py-2 text-sm text-blue-200">
          {statusMessage}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => setLevelFilter(levelFilter === 'debug' ? '' : 'debug')}
          className={`rounded-lg border p-3 text-left transition-colors ${
            levelFilter === 'debug'
              ? 'border-slate-500 bg-slate-700'
              : 'border-slate-700 bg-slate-800 hover:bg-slate-750'
          }`}
        >
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <FiTerminal className="h-3.5 w-3.5 text-slate-400" />
            Debug
          </div>
          <div className="mt-1 text-xl font-bold text-slate-300">{levelCounts.debug}</div>
        </button>
        <button
          type="button"
          onClick={() => setLevelFilter(levelFilter === 'info' ? '' : 'info')}
          className={`rounded-lg border p-3 text-left transition-colors ${
            levelFilter === 'info'
              ? 'border-blue-500 bg-blue-900/30'
              : 'border-slate-700 bg-slate-800 hover:bg-slate-750'
          }`}
        >
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <FiInfo className="h-3.5 w-3.5 text-blue-400" />
            Info
          </div>
          <div className="mt-1 text-xl font-bold text-blue-400">{levelCounts.info}</div>
        </button>
        <button
          type="button"
          onClick={() => setLevelFilter(levelFilter === 'warn' ? '' : 'warn')}
          className={`rounded-lg border p-3 text-left transition-colors ${
            levelFilter === 'warn'
              ? 'border-amber-500 bg-amber-900/30'
              : 'border-slate-700 bg-slate-800 hover:bg-slate-750'
          }`}
        >
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <FiAlertTriangle className="h-3.5 w-3.5 text-amber-400" />
            Warn
          </div>
          <div className="mt-1 text-xl font-bold text-amber-400">{levelCounts.warn}</div>
        </button>
        <button
          type="button"
          onClick={() => setLevelFilter(levelFilter === 'error' ? '' : 'error')}
          className={`rounded-lg border p-3 text-left transition-colors ${
            levelFilter === 'error'
              ? 'border-red-500 bg-red-900/30'
              : 'border-slate-700 bg-slate-800 hover:bg-slate-750'
          }`}
        >
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <FiXCircle className="h-3.5 w-3.5 text-red-400" />
            Error
          </div>
          <div className="mt-1 text-xl font-bold text-red-400">{levelCounts.error}</div>
        </button>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <FiSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search logs by keyword..."
            className="w-full rounded-md border border-slate-600 bg-slate-800 py-1.5 pl-10 pr-3 text-sm text-slate-200 placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
          />
        </div>

        {/* Level filter */}
        <div className="flex items-center gap-1.5">
          <FiFilter className="h-3.5 w-3.5 text-slate-500" />
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200"
          >
            <option value="">All Levels</option>
            <option value="debug">Debug</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
          </select>
        </div>

        {/* Agent filter */}
        <select
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          className="rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200"
        >
          <option value="">All Agents</option>
          {agents.map((agent) => (
            <option key={agent} value={agent}>
              {agent}
            </option>
          ))}
        </select>

        {/* Time range */}
        <div className="flex items-center gap-1.5">
          <FiCalendar className="h-3.5 w-3.5 text-slate-500" />
          <input
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-slate-200"
            title="Start time"
          />
          <span className="text-xs text-slate-500">to</span>
          <input
            type="datetime-local"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-slate-200"
            title="End time"
          />
        </div>

        {hasFilters && (
          <button
            type="button"
            onClick={handleClearFilters}
            className="flex items-center gap-1 rounded-md bg-slate-700 px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-600 transition-colors"
          >
            <FiXCircle className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>

      {/* Actions row */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-400">
          {logs.length} log entries{hasFilters ? ' (filtered)' : ''}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCreateTestLog}
            className="flex items-center gap-2 rounded-md bg-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-600 transition-colors"
          >
            <FiZap className="h-3.5 w-3.5" />
            Add Test Logs
          </button>
          <label className="flex cursor-pointer items-center gap-2 rounded-md bg-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-600 transition-colors">
            <FiUpload className="h-3.5 w-3.5" />
            Import NDJSON
            <input
              ref={fileInputRef}
              type="file"
              accept=".ndjson,.jsonl,.log,.txt,.json"
              onChange={handleImportNdjson}
              className="hidden"
            />
          </label>
          <button
            type="button"
            onClick={loadLogs}
            className="flex items-center gap-2 rounded-md bg-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-600 transition-colors"
          >
            <FiRefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
          <button
            type="button"
            onClick={handlePurge}
            className="flex items-center gap-2 rounded-md bg-red-900/50 px-3 py-1.5 text-sm text-red-300 hover:bg-red-800/50 transition-colors"
          >
            <FiTrash2 className="h-3.5 w-3.5" />
            Purge All
          </button>
        </div>
      </div>

      {/* Log entries */}
      {isLoading ? (
        <LogSkeleton />
      ) : logs.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-16 text-slate-500"
          data-testid="no-logs-empty-state"
        >
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-800 border border-slate-700">
            <FiFileText className="h-7 w-7 text-slate-500" />
          </div>
          <p className="text-lg font-medium text-slate-400">No log entries</p>
          {hasFilters ? (
            <p className="mt-1 text-sm">
              No logs match the current filters. Try adjusting or clearing filters.
            </p>
          ) : (
            <div className="mt-3 text-center">
              <p className="text-sm text-slate-500 mb-4">
                Logs are generated as you use Fleet Command. Here are some ways to get started:
              </p>
              <div className="flex flex-col gap-2 text-xs text-slate-500">
                <div className="flex items-center gap-2 justify-center">
                  <FiPlay className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Spawn an agent to generate activity logs</span>
                </div>
                <div className="flex items-center gap-2 justify-center">
                  <FiUpload className="h-3.5 w-3.5 text-blue-400" />
                  <span>Import existing logs via &quot;Import NDJSON&quot; above</span>
                </div>
                <div className="flex items-center gap-2 justify-center">
                  <FiZap className="h-3.5 w-3.5 text-amber-400" />
                  <span>Click &quot;Add Test Logs&quot; to create sample entries</span>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <VirtualizedLogList
          logs={logs}
          expandedIds={expandedIds}
          toggleExpand={toggleExpand}
          searchQuery={searchQuery}
        />
      )}
    </div>
  );
}

function VirtualizedLogList({
  logs,
  expandedIds,
  toggleExpand,
  searchQuery,
}: {
  logs: AppLogEntry[];
  expandedIds: Set<string>;
  toggleExpand: (id: string) => void;
  searchQuery: string;
}) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: logs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 15,
  });

  return (
    <div
      ref={parentRef}
      className="max-h-[600px] overflow-y-auto"
      data-testid="virtualized-log-list"
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const entry = logs[virtualItem.index];
          return (
            <div
              key={entry.id}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <LogEntryRow
                entry={entry}
                expanded={expandedIds.has(entry.id)}
                onToggle={() => toggleExpand(entry.id)}
                searchQuery={searchQuery}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LogEntryRow({
  entry,
  expanded,
  onToggle,
  searchQuery,
}: {
  entry: AppLogEntry;
  expanded: boolean;
  onToggle: () => void;
  searchQuery: string;
}) {
  const levelColors: Record<string, string> = {
    debug: 'text-slate-400',
    info: 'text-blue-400',
    warn: 'text-amber-400',
    error: 'text-red-400',
  };

  const levelBgColors: Record<string, string> = {
    debug: 'bg-slate-700 text-slate-300',
    info: 'bg-blue-900/50 text-blue-300',
    warn: 'bg-amber-900/50 text-amber-300',
    error: 'bg-red-900/50 text-red-300',
  };

  const levelIcons: Record<string, React.ReactNode> = {
    debug: <FiTerminal className={`h-3.5 w-3.5 ${levelColors[entry.level]}`} />,
    info: <FiInfo className={`h-3.5 w-3.5 ${levelColors[entry.level]}`} />,
    warn: <FiAlertTriangle className={`h-3.5 w-3.5 ${levelColors[entry.level]}`} />,
    error: <FiXCircle className={`h-3.5 w-3.5 ${levelColors[entry.level]}`} />,
  };

  // Highlight search matches in message
  const highlightMessage = (text: string) => {
    if (!searchQuery) return text;
    const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${escapedQuery})`, 'gi'));
    return parts.map((part) => {
      const key = `${part}-${Math.random().toString(36).slice(2, 8)}`;
      return part.toLowerCase() === searchQuery.toLowerCase() ? (
        <mark key={key} className="bg-yellow-500/30 text-yellow-200 rounded px-0.5">
          {part}
        </mark>
      ) : (
        part
      );
    });
  };

  return (
    <div
      className={`rounded-md border overflow-hidden ${
        entry.level === 'error'
          ? 'border-red-800/50 bg-red-950/20'
          : entry.level === 'warn'
            ? 'border-amber-800/30 bg-amber-950/10'
            : 'border-slate-700/50 bg-slate-800'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-slate-750 transition-colors"
      >
        {levelIcons[entry.level] || levelIcons.info}
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium uppercase ${levelBgColors[entry.level] ?? levelBgColors.info}`}
        >
          {entry.level}
        </span>
        <span className="flex-1 truncate text-sm text-slate-200 font-mono" title={entry.message}>
          {highlightMessage(entry.message)}
        </span>
        {entry.agent_name && (
          <span className="rounded bg-purple-900/50 px-2 py-0.5 text-xs text-purple-300">
            {entry.agent_name}
          </span>
        )}
        {entry.source && (
          <span className="rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-400">
            {entry.source}
          </span>
        )}
        <span className="text-xs text-slate-500 whitespace-nowrap">
          {new Date(entry.created_at).toLocaleTimeString()}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-slate-700/50 bg-slate-900/50 px-4 py-3 text-xs space-y-2">
          <div className="grid grid-cols-2 gap-2 text-slate-400">
            <div>
              <span className="text-slate-500">ID:</span> {entry.id}
            </div>
            <div>
              <span className="text-slate-500">Timestamp:</span>{' '}
              {new Date(entry.created_at).toLocaleString()}
            </div>
            <div>
              <span className="text-slate-500">Level:</span>{' '}
              <span className={levelColors[entry.level]}>{entry.level}</span>
            </div>
            <div>
              <span className="text-slate-500">Source:</span> {entry.source ?? '—'}
            </div>
            <div>
              <span className="text-slate-500">Agent:</span> {entry.agent_name ?? '—'}
            </div>
          </div>
          <div>
            <span className="text-slate-500">Message:</span>
            <pre className="mt-1 overflow-x-auto rounded bg-slate-900 p-2 font-mono text-slate-300 whitespace-pre-wrap">
              {entry.message}
            </pre>
          </div>
          {entry.data && (
            <div>
              <span className="text-slate-500">Data (NDJSON):</span>
              <pre className="mt-1 overflow-x-auto rounded bg-slate-900 p-2 font-mono text-slate-300 whitespace-pre-wrap">
                {tryFormatJson(entry.data)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LogSkeleton() {
  return (
    <div className="space-y-1">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-md border border-slate-700/50 bg-slate-800 px-4 py-2.5 animate-pulse"
        >
          <div className="h-4 w-4 rounded bg-slate-700" />
          <div className="h-5 w-14 rounded bg-slate-700" />
          <div className="h-4 flex-1 rounded bg-slate-700" />
          <div className="h-4 w-16 rounded bg-slate-700" />
        </div>
      ))}
    </div>
  );
}

// ── Tool Stats Panel ─────────────────────────────────────────────────

function ToolStatsPanel() {
  const [toolStats, setToolStats] = useState<ToolStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadStats = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await window.electronAPI.eventToolStats();
      if (result.data) {
        setToolStats(result.data);
      }
    } catch (error) {
      console.error('Failed to load tool stats:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const totalInvocations = toolStats.reduce((sum, t) => sum + t.usage_count, 0);
  const totalDuration = toolStats.reduce((sum, t) => sum + (t.total_duration_ms ?? 0), 0);
  const maxUsage = toolStats.length > 0 ? toolStats[0].usage_count : 1;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <FiHash className="h-4 w-4" />
            Total Tools
          </div>
          <div className="mt-1 text-2xl font-bold text-slate-50">{toolStats.length}</div>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <FiZap className="h-4 w-4" />
            Total Invocations
          </div>
          <div className="mt-1 text-2xl font-bold text-cyan-400">{totalInvocations}</div>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <FiClock className="h-4 w-4" />
            Total Duration
          </div>
          <div className="mt-1 text-2xl font-bold text-emerald-400">
            {formatDuration(totalDuration)}
          </div>
        </div>
      </div>

      {/* Refresh */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={loadStats}
          className="flex items-center gap-2 rounded-md bg-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-600 transition-colors"
        >
          <FiRefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* Tool Stats Table */}
      {isLoading ? (
        <ToolStatsSkeleton />
      ) : toolStats.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-500">
          <FiBarChart2 className="mb-3 h-12 w-12" />
          <p className="text-lg font-medium">No tool usage data yet</p>
          <p className="mt-1 text-sm">Tool invocation stats will appear here as agents use tools</p>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-700 bg-slate-800 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700 text-left text-sm text-slate-400">
                <th className="px-4 py-3 font-medium">Tool Name</th>
                <th className="px-4 py-3 font-medium text-right">Usage Count</th>
                <th className="px-4 py-3 font-medium text-right">Avg Duration</th>
                <th className="px-4 py-3 font-medium text-right">Min</th>
                <th className="px-4 py-3 font-medium text-right">Max</th>
                <th className="px-4 py-3 font-medium text-right">Total</th>
                <th className="px-4 py-3 font-medium">Usage Bar</th>
              </tr>
            </thead>
            <tbody>
              {toolStats.map((tool) => (
                <tr
                  key={tool.tool_name}
                  className="border-b border-slate-700/50 last:border-b-0 hover:bg-slate-750"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FiZap className="h-4 w-4 text-cyan-400" />
                      <span className="font-mono text-sm font-medium text-slate-200">
                        {tool.tool_name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono text-sm font-bold text-cyan-400">
                      {tool.usage_count}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono text-sm text-slate-300">
                      {tool.avg_duration_ms != null
                        ? formatDuration(Math.round(tool.avg_duration_ms))
                        : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono text-sm text-slate-400">
                      {tool.min_duration_ms != null ? formatDuration(tool.min_duration_ms) : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono text-sm text-slate-400">
                      {tool.max_duration_ms != null ? formatDuration(tool.max_duration_ms) : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono text-sm text-emerald-400">
                      {tool.total_duration_ms != null
                        ? formatDuration(tool.total_duration_ms)
                        : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-3 w-32 rounded-full bg-slate-700 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all"
                        style={{
                          width: `${(tool.usage_count / maxUsage) * 100}%`,
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EventLogPanel() {
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('');

  const loadEvents = useCallback(async () => {
    setIsLoading(true);
    try {
      const filters: { eventType?: string; limit?: number } = { limit: 200 };
      if (eventTypeFilter) {
        filters.eventType = eventTypeFilter;
      }
      const result = await window.electronAPI.eventList(filters);
      if (result.data) {
        setEvents(result.data);
      }
    } catch (error) {
      console.error('Failed to load events:', error);
    } finally {
      setIsLoading(false);
    }
  }, [eventTypeFilter]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const handlePurge = async () => {
    if (!confirm('Delete all events? This cannot be undone.')) return;
    try {
      await window.electronAPI.eventPurge();
      setEvents([]);
    } catch (error) {
      console.error('Failed to purge events:', error);
    }
  };

  const eventTypes = [
    'tool_start',
    'tool_end',
    'session_start',
    'session_end',
    'mail_sent',
    'mail_received',
    'spawn',
    'error',
    'custom',
  ];

  return (
    <div className="space-y-4">
      {/* Filters and actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <select
            value={eventTypeFilter}
            onChange={(e) => setEventTypeFilter(e.target.value)}
            className="rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200"
          >
            <option value="">All Event Types</option>
            {eventTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <span className="text-sm text-slate-400">{events.length} events</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadEvents}
            className="flex items-center gap-2 rounded-md bg-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-600 transition-colors"
          >
            <FiRefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
          <button
            type="button"
            onClick={handlePurge}
            className="flex items-center gap-2 rounded-md bg-red-900/50 px-3 py-1.5 text-sm text-red-300 hover:bg-red-800/50 transition-colors"
          >
            <FiTrash2 className="h-3.5 w-3.5" />
            Purge All
          </button>
        </div>
      </div>

      {/* Event list */}
      {isLoading ? (
        <EventLogSkeleton />
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-500">
          <FiActivity className="mb-3 h-12 w-12" />
          <p className="text-lg font-medium">No events recorded</p>
          <p className="mt-1 text-sm">
            Events will appear here as agents are spawned, tools are used, and messages are sent
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {events.map((event) => (
            <EventRow key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}

function EventRow({ event }: { event: Event }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-md border border-slate-700/50 bg-slate-800 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-750 transition-colors"
      >
        <EventTypeIcon eventType={event.event_type} />
        <EventTypeBadge eventType={event.event_type} />
        {event.agent_name && (
          <span className="text-sm font-medium text-slate-300">{event.agent_name}</span>
        )}
        {event.tool_name && (
          <span className="rounded bg-slate-700 px-2 py-0.5 font-mono text-xs text-cyan-400">
            {event.tool_name}
          </span>
        )}
        {event.tool_duration_ms != null && (
          <span className="text-xs text-slate-500">{formatDuration(event.tool_duration_ms)}</span>
        )}
        <span className="ml-auto text-xs text-slate-500">
          {new Date(event.created_at).toLocaleTimeString()}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-slate-700/50 bg-slate-850 px-4 py-3 text-xs">
          <div className="grid grid-cols-2 gap-2 text-slate-400">
            <div>
              <span className="text-slate-500">ID:</span> {event.id}
            </div>
            <div>
              <span className="text-slate-500">Session:</span> {event.session_id ?? '—'}
            </div>
            <div>
              <span className="text-slate-500">Run:</span> {event.run_id ?? '—'}
            </div>
            <div>
              <span className="text-slate-500">Level:</span>{' '}
              <span className={event.level === 'error' ? 'text-red-400' : ''}>{event.level}</span>
            </div>
          </div>
          {event.tool_args && (
            <div className="mt-2">
              <span className="text-slate-500">Tool Args:</span>
              <pre className="mt-1 overflow-x-auto rounded bg-slate-900 p-2 font-mono text-slate-300">
                {event.tool_args}
              </pre>
            </div>
          )}
          {event.data && (
            <div className="mt-2">
              <span className="text-slate-500">Data:</span>
              <pre className="mt-1 overflow-x-auto rounded bg-slate-900 p-2 font-mono text-slate-300">
                {tryFormatJson(event.data)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EventTypeIcon({ eventType }: { eventType: string }) {
  switch (eventType) {
    case 'tool_start':
      return <FiPlay className="h-3.5 w-3.5 text-blue-400" />;
    case 'tool_end':
      return <FiSquare className="h-3.5 w-3.5 text-green-400" />;
    case 'session_start':
      return <FiTrendingUp className="h-3.5 w-3.5 text-emerald-400" />;
    case 'session_end':
      return <FiSquare className="h-3.5 w-3.5 text-amber-400" />;
    case 'mail_sent':
    case 'mail_received':
      return <FiZap className="h-3.5 w-3.5 text-purple-400" />;
    default:
      return <FiActivity className="h-3.5 w-3.5 text-slate-400" />;
  }
}

function EventTypeBadge({ eventType }: { eventType: string }) {
  const colorMap: Record<string, string> = {
    tool_start: 'bg-blue-900/50 text-blue-300',
    tool_end: 'bg-green-900/50 text-green-300',
    session_start: 'bg-emerald-900/50 text-emerald-300',
    session_end: 'bg-amber-900/50 text-amber-300',
    mail_sent: 'bg-purple-900/50 text-purple-300',
    mail_received: 'bg-violet-900/50 text-violet-300',
    spawn: 'bg-cyan-900/50 text-cyan-300',
    error: 'bg-red-900/50 text-red-300',
    custom: 'bg-slate-700 text-slate-300',
  };

  return (
    <span
      className={`rounded px-2 py-0.5 text-xs font-medium ${colorMap[eventType] ?? 'bg-slate-700 text-slate-300'}`}
    >
      {eventType}
    </span>
  );
}

// ── Timeline Panel (Feature #126) ──────────────────────────────────

interface TimelineEntry {
  event: Event;
  paired?: Event; // tool_start paired with tool_end
}

function TimelinePanel() {
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [agents, setAgents] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    setIsLoading(true);
    try {
      const filters: { agentName?: string; limit?: number } = { limit: 500 };
      if (selectedAgent) {
        filters.agentName = selectedAgent;
      }
      const result = await window.electronAPI.eventList(filters);
      if (result.data) {
        // Reverse to show chronologically (oldest first)
        setEvents([...result.data].reverse());
      }
    } catch (error) {
      console.error('Failed to load timeline events:', error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedAgent]);

  // Load unique agent names
  useEffect(() => {
    const loadAgents = async () => {
      try {
        const result = await window.electronAPI.eventList({ limit: 1000 });
        if (result.data) {
          const uniqueAgents = [
            ...new Set(result.data.map((e: Event) => e.agent_name).filter(Boolean)),
          ] as string[];
          setAgents(uniqueAgents.sort());
        }
      } catch {
        // ignore
      }
    };
    loadAgents();
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Correlate tool_start and tool_end events
  const timelineEntries = useMemo(() => {
    const entries: TimelineEntry[] = [];
    const startMap = new Map<string, Event>();

    for (const event of events) {
      if (event.event_type === 'tool_start' && event.tool_name && event.session_id) {
        const key = `${event.session_id}:${event.tool_name}:${event.agent_name ?? ''}`;
        startMap.set(key, event);
        entries.push({ event });
      } else if (event.event_type === 'tool_end' && event.tool_name && event.session_id) {
        const key = `${event.session_id}:${event.tool_name}:${event.agent_name ?? ''}`;
        const startEvent = startMap.get(key);
        if (startEvent) {
          // Find the corresponding start entry and attach the paired end
          const startEntry = entries.find((e) => e.event.id === startEvent.id);
          if (startEntry) {
            startEntry.paired = event;
          }
          startMap.delete(key);
        }
        entries.push({ event });
      } else {
        entries.push({ event });
      }
    }

    return entries;
  }, [events]);

  const getTimelineColor = (eventType: string): string => {
    switch (eventType) {
      case 'tool_start':
        return 'border-blue-500 bg-blue-500';
      case 'tool_end':
        return 'border-green-500 bg-green-500';
      case 'session_start':
        return 'border-emerald-500 bg-emerald-500';
      case 'session_end':
        return 'border-amber-500 bg-amber-500';
      case 'mail_sent':
        return 'border-purple-500 bg-purple-500';
      case 'mail_received':
        return 'border-violet-500 bg-violet-500';
      case 'spawn':
        return 'border-cyan-500 bg-cyan-500';
      case 'error':
        return 'border-red-500 bg-red-500';
      default:
        return 'border-slate-500 bg-slate-500';
    }
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FiFilter className="h-4 w-4 text-slate-400" />
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200"
          >
            <option value="">All Agents</option>
            {agents.map((agent) => (
              <option key={agent} value={agent}>
                {agent}
              </option>
            ))}
          </select>
          <span className="text-sm text-slate-400">{events.length} events</span>
        </div>
        <button
          type="button"
          onClick={loadEvents}
          className="flex items-center gap-2 rounded-md bg-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-600 transition-colors"
        >
          <FiRefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* Timeline */}
      {isLoading ? (
        <EventLogSkeleton />
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-500">
          <FiClock className="mb-3 h-12 w-12" />
          <p className="text-lg font-medium">No timeline events</p>
          <p className="mt-1 text-sm">
            {selectedAgent
              ? `No events recorded for agent "${selectedAgent}"`
              : 'Events will appear here as agents perform actions'}
          </p>
        </div>
      ) : (
        <div className="relative ml-4">
          {/* Vertical timeline line */}
          <div className="absolute left-2 top-0 bottom-0 w-px bg-slate-700" />

          <div className="space-y-1">
            {timelineEntries.map((entry) => {
              const { event, paired } = entry;
              const isExpanded = expandedId === event.id;
              const dotColor = getTimelineColor(event.event_type);

              return (
                <div key={event.id} className="relative pl-8">
                  {/* Timeline dot */}
                  <div
                    className={`absolute left-0 top-3 h-4 w-4 rounded-full border-2 ${dotColor}`}
                  />

                  {/* Event card */}
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : event.id)}
                    className="w-full text-left rounded-md border border-slate-700/50 bg-slate-800 px-4 py-2.5 hover:bg-slate-750 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <FiChevronDown className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                      ) : (
                        <FiChevronRight className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                      )}
                      <EventTypeBadge eventType={event.event_type} />
                      {event.agent_name && (
                        <span className="text-sm font-medium text-slate-300">
                          {event.agent_name}
                        </span>
                      )}
                      {event.tool_name && (
                        <span className="rounded bg-slate-700 px-2 py-0.5 font-mono text-xs text-cyan-400">
                          {event.tool_name}
                        </span>
                      )}
                      {paired &&
                        event.event_type === 'tool_start' &&
                        paired.tool_duration_ms != null && (
                          <span className="rounded bg-green-900/30 px-2 py-0.5 text-xs text-green-400">
                            ⏱ {formatDuration(paired.tool_duration_ms)}
                          </span>
                        )}
                      {event.tool_duration_ms != null && event.event_type === 'tool_end' && (
                        <span className="rounded bg-green-900/30 px-2 py-0.5 text-xs text-green-400">
                          ⏱ {formatDuration(event.tool_duration_ms)}
                        </span>
                      )}
                      <span className="ml-auto text-xs text-slate-500 flex items-center gap-1 flex-shrink-0">
                        <FiClock className="h-3 w-3" />
                        {new Date(event.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                  </button>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="mt-1 ml-6 rounded-md border border-slate-700/50 bg-slate-850 px-4 py-3 text-xs">
                      <div className="grid grid-cols-2 gap-2 text-slate-400">
                        <div>
                          <span className="text-slate-500">ID:</span> {event.id}
                        </div>
                        <div>
                          <span className="text-slate-500">Session:</span> {event.session_id ?? '—'}
                        </div>
                        <div>
                          <span className="text-slate-500">Run:</span> {event.run_id ?? '—'}
                        </div>
                        <div>
                          <span className="text-slate-500">Level:</span>{' '}
                          <span className={event.level === 'error' ? 'text-red-400' : ''}>
                            {event.level}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500">Timestamp:</span>{' '}
                          {new Date(event.created_at).toISOString()}
                        </div>
                        {event.tool_duration_ms != null && (
                          <div>
                            <span className="text-slate-500">Duration:</span>{' '}
                            {formatDuration(event.tool_duration_ms)}
                          </div>
                        )}
                      </div>
                      {paired && event.event_type === 'tool_start' && (
                        <div className="mt-2 rounded bg-green-900/20 border border-green-800/30 p-2">
                          <span className="text-green-400 font-medium">Correlated tool_end:</span>
                          <div className="mt-1 text-slate-400">
                            <span className="text-slate-500">End time:</span>{' '}
                            {new Date(paired.created_at).toLocaleTimeString()}
                            {paired.tool_duration_ms != null && (
                              <span className="ml-3">
                                <span className="text-slate-500">Duration:</span>{' '}
                                {formatDuration(paired.tool_duration_ms)}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                      {event.tool_args && (
                        <div className="mt-2">
                          <span className="text-slate-500">Tool Args:</span>
                          <pre className="mt-1 overflow-x-auto rounded bg-slate-900 p-2 font-mono text-slate-300">
                            {tryFormatJson(event.tool_args)}
                          </pre>
                        </div>
                      )}
                      {event.data && (
                        <div className="mt-2">
                          <span className="text-slate-500">Data:</span>
                          <pre className="mt-1 overflow-x-auto rounded bg-slate-900 p-2 font-mono text-slate-300">
                            {tryFormatJson(event.data)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Error Aggregation Panel (Feature #127) ──────────────────────────

interface AgentErrorSummary {
  agentName: string;
  errorCount: number;
  errors: Event[];
}

function ErrorAggregationPanel() {
  const [errors, setErrors] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [agentFilter, setAgentFilter] = useState<string>('');
  const [errorTypeFilter, setErrorTypeFilter] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadErrors = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch error events + also events with level='error'
      const [errorTypeResult, allResult] = await Promise.all([
        window.electronAPI.eventList({ eventType: 'error', limit: 500 }),
        window.electronAPI.eventList({ limit: 1000 }),
      ]);

      const errorEvents: Event[] = [];
      const seenIds = new Set<string>();

      // Add events with event_type = 'error'
      if (errorTypeResult.data) {
        for (const e of errorTypeResult.data) {
          if (!seenIds.has(e.id)) {
            seenIds.add(e.id);
            errorEvents.push(e);
          }
        }
      }

      // Add events with level = 'error' (from any event type)
      if (allResult.data) {
        for (const e of allResult.data) {
          if (e.level === 'error' && !seenIds.has(e.id)) {
            seenIds.add(e.id);
            errorEvents.push(e);
          }
        }
      }

      // Sort by timestamp descending (newest first)
      errorEvents.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );

      setErrors(errorEvents);
    } catch (error) {
      console.error('Failed to load errors:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadErrors();
  }, [loadErrors]);

  // Extract unique agent names and error categories
  const agents = [...new Set(errors.map((e) => e.agent_name).filter(Boolean))] as string[];

  const getErrorCategory = (event: Event): string => {
    if (event.data) {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.type) return parsed.type;
        if (parsed.code) return parsed.code;
        if (parsed.name) return parsed.name;
      } catch {
        // not JSON
      }
      // Try to extract error type from the data string
      const match = event.data.match(/^(\w+Error):/);
      if (match) return match[1];
    }
    if (event.tool_name) return `tool:${event.tool_name}`;
    return event.event_type;
  };

  const errorCategories = [...new Set(errors.map(getErrorCategory))].sort();

  // Filter errors
  const filteredErrors = errors.filter((e) => {
    if (agentFilter && e.agent_name !== agentFilter) return false;
    if (errorTypeFilter && getErrorCategory(e) !== errorTypeFilter) return false;
    return true;
  });

  // Group by agent for summary
  const agentSummaries: AgentErrorSummary[] = agents
    .map((agentName) => {
      const agentErrors = filteredErrors.filter((e) => e.agent_name === agentName);
      return { agentName, errorCount: agentErrors.length, errors: agentErrors };
    })
    .filter((s) => s.errorCount > 0)
    .sort((a, b) => b.errorCount - a.errorCount);

  // Errors without an agent
  const unattributedErrors = filteredErrors.filter((e) => !e.agent_name);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FiFilter className="h-4 w-4 text-slate-400" />
          <select
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            className="rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200"
          >
            <option value="">All Agents</option>
            {agents.map((agent) => (
              <option key={agent} value={agent}>
                {agent}
              </option>
            ))}
          </select>
          <select
            value={errorTypeFilter}
            onChange={(e) => setErrorTypeFilter(e.target.value)}
            className="rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200"
          >
            <option value="">All Error Types</option>
            {errorCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          <span className="text-sm text-slate-400">
            {filteredErrors.length} error{filteredErrors.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          type="button"
          onClick={loadErrors}
          className="flex items-center gap-2 rounded-md bg-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-600 transition-colors"
        >
          <FiRefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* Error count per agent summary */}
      {!isLoading && filteredErrors.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {agentSummaries.map((summary) => (
            <button
              type="button"
              key={summary.agentName}
              onClick={() =>
                setAgentFilter(agentFilter === summary.agentName ? '' : summary.agentName)
              }
              className={`rounded-lg border p-3 text-left transition-colors ${
                agentFilter === summary.agentName
                  ? 'border-red-500/50 bg-red-900/20'
                  : 'border-slate-700 bg-slate-800 hover:border-slate-600'
              }`}
            >
              <div className="text-xs text-slate-400 truncate" title={summary.agentName}>
                {summary.agentName}
              </div>
              <div className="mt-1 text-lg font-bold text-red-400">{summary.errorCount}</div>
            </button>
          ))}
          {unattributedErrors.length > 0 && (
            <div className="rounded-lg border border-slate-700 bg-slate-800 p-3">
              <div className="text-xs text-slate-500 italic">Unattributed</div>
              <div className="mt-1 text-lg font-bold text-amber-400">
                {unattributedErrors.length}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error list */}
      {isLoading ? (
        <EventLogSkeleton />
      ) : filteredErrors.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-500">
          <FiAlertTriangle className="mb-3 h-12 w-12" />
          <p className="text-lg font-medium">No errors found</p>
          <p className="mt-1 text-sm">
            {agentFilter || errorTypeFilter
              ? 'Try adjusting your filters'
              : 'No error events have been recorded'}
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {filteredErrors.map((error) => {
            const isExpanded = expandedId === error.id;
            const category = getErrorCategory(error);

            return (
              <div
                key={error.id}
                className="rounded-md border border-red-900/30 bg-slate-800 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : error.id)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-750 transition-colors"
                >
                  {isExpanded ? (
                    <FiChevronDown className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                  ) : (
                    <FiChevronRight className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                  )}
                  <FiXCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
                  <span className="rounded bg-red-900/50 px-2 py-0.5 text-xs font-medium text-red-300">
                    {category}
                  </span>
                  {error.agent_name && (
                    <span className="text-sm font-medium text-slate-300">{error.agent_name}</span>
                  )}
                  {error.tool_name && (
                    <span className="rounded bg-slate-700 px-2 py-0.5 font-mono text-xs text-cyan-400">
                      {error.tool_name}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-slate-500 flex items-center gap-1 flex-shrink-0">
                    <FiClock className="h-3 w-3" />
                    {new Date(error.created_at).toLocaleTimeString()}
                  </span>
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-700/50 bg-slate-850 px-4 py-3 text-xs">
                    <div className="grid grid-cols-2 gap-2 text-slate-400">
                      <div>
                        <span className="text-slate-500">ID:</span> {error.id}
                      </div>
                      <div>
                        <span className="text-slate-500">Agent:</span> {error.agent_name ?? '—'}
                      </div>
                      <div>
                        <span className="text-slate-500">Session:</span> {error.session_id ?? '—'}
                      </div>
                      <div>
                        <span className="text-slate-500">Event Type:</span> {error.event_type}
                      </div>
                      <div>
                        <span className="text-slate-500">Timestamp:</span>{' '}
                        {new Date(error.created_at).toISOString()}
                      </div>
                      {error.tool_name && (
                        <div>
                          <span className="text-slate-500">Tool:</span> {error.tool_name}
                        </div>
                      )}
                    </div>
                    {error.tool_args && (
                      <div className="mt-2">
                        <span className="text-slate-500">Tool Args:</span>
                        <pre className="mt-1 overflow-x-auto rounded bg-slate-900 p-2 font-mono text-slate-300">
                          {tryFormatJson(error.tool_args)}
                        </pre>
                      </div>
                    )}
                    {error.data && (
                      <div className="mt-2">
                        <span className="text-slate-500">Error Data:</span>
                        <pre className="mt-1 overflow-x-auto rounded bg-red-950/50 border border-red-900/30 p-2 font-mono text-red-300">
                          {tryFormatJson(error.data)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ToolStatsSkeleton() {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 p-4 space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-4 animate-pulse">
          <div className="h-4 w-24 rounded bg-slate-700" />
          <div className="h-4 w-16 rounded bg-slate-700" />
          <div className="h-4 w-20 rounded bg-slate-700" />
          <div className="h-3 w-32 rounded-full bg-slate-700" />
        </div>
      ))}
    </div>
  );
}

function EventLogSkeleton() {
  return (
    <div className="space-y-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-md border border-slate-700/50 bg-slate-800 px-4 py-2.5 animate-pulse"
        >
          <div className="h-4 w-4 rounded bg-slate-700" />
          <div className="h-5 w-20 rounded bg-slate-700" />
          <div className="h-4 w-28 rounded bg-slate-700" />
          <div className="ml-auto h-4 w-16 rounded bg-slate-700" />
        </div>
      ))}
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

function tryFormatJson(str: string): string {
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
}
