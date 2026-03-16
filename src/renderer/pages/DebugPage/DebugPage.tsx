import './DebugPage.css';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
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
  FiExternalLink,
  FiEye,
  FiGlobe,
  FiStopCircle,
  FiXCircle,
  FiZap,
} from 'react-icons/fi';
import type { AppLogEntry, Event, LogLevel, ToolStats } from '../../../shared/types';
import { formatTimeOnly, formatDateTime, formatAbsoluteDateTime } from '../../lib/dateFormatting';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/table';

type DebugTab = 'terminal' | 'events' | 'tool-stats' | 'logs' | 'timeline' | 'errors' | 'preview';

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
        <Button
          variant={activeTab === 'terminal' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('terminal')}
          className={`gap-2 h-auto px-4 py-2 ${
            activeTab === 'terminal' ? 'bg-slate-700 text-cyan-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FiTerminal className="h-4 w-4" />
          Terminal
        </Button>
        <Button
          variant={activeTab === 'logs' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('logs')}
          className={`gap-2 h-auto px-4 py-2 ${
            activeTab === 'logs' ? 'bg-slate-700 text-cyan-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FiFileText className="h-4 w-4" />
          Logs
        </Button>
        <Button
          variant={activeTab === 'tool-stats' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('tool-stats')}
          className={`gap-2 h-auto px-4 py-2 ${
            activeTab === 'tool-stats' ? 'bg-slate-700 text-cyan-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FiBarChart2 className="h-4 w-4" />
          Tool Stats
        </Button>
        <Button
          variant={activeTab === 'events' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('events')}
          className={`gap-2 h-auto px-4 py-2 ${
            activeTab === 'events' ? 'bg-slate-700 text-cyan-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FiActivity className="h-4 w-4" />
          Event Log
        </Button>
        <Button
          variant={activeTab === 'timeline' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('timeline')}
          className={`gap-2 h-auto px-4 py-2 ${
            activeTab === 'timeline' ? 'bg-slate-700 text-cyan-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FiClock className="h-4 w-4" />
          Timeline
        </Button>
        <Button
          variant={activeTab === 'errors' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('errors')}
          className={`gap-2 h-auto px-4 py-2 ${
            activeTab === 'errors' ? 'bg-slate-700 text-red-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FiAlertTriangle className="h-4 w-4" />
          Errors
        </Button>
        <Button
          variant={activeTab === 'preview' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('preview')}
          data-testid="debug-tab-preview"
          className={`gap-2 h-auto px-4 py-2 ${
            activeTab === 'preview' ? 'bg-slate-700 text-green-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FiEye className="h-4 w-4" />
          Preview
        </Button>
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
      ) : activeTab === 'preview' ? (
        <AppPreviewPanel />
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
        toast.error('Failed to spawn debug shell');
      }
    };

    spawnShell();

    // Subscribe to live output
    const handleOutput = (data: { data: string }) => {
      if (xtermRef.current) {
        xtermRef.current.write(data.data);
      }
    };

    const unsubShellOutput = window.electronAPI.onDebugShellOutput(handleOutput);

    return () => {
      resizeObserver.disconnect();
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
      unsubShellOutput();
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
      toast.error('Failed to restart debug shell');
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
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRestart}
            className="gap-1.5 h-auto px-2 py-1 text-xs text-slate-400 hover:text-slate-200"
            title="Restart shell"
          >
            <FiRefreshCw className="h-3.5 w-3.5" />
            Restart
          </Button>
          {isRunning && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleKill}
              className="gap-1.5 h-auto px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/30"
              title="Kill shell"
            >
              <FiSquare className="h-3.5 w-3.5" />
              Kill
            </Button>
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
      } = { limit: 5000 };
      if (levelFilter) filters.level = levelFilter;
      if (agentFilter) filters.agent_name = agentFilter;
      if (searchQuery.trim()) filters.search = searchQuery.trim();
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
      toast.error('Failed to purge logs');
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
      toast.error('Failed to create test log');
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
      toast.error('Failed to import NDJSON file');
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

  const hasFilters = levelFilter || agentFilter || searchQuery.trim() || startTime || endTime;

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
        <Button
          variant="ghost"
          type="button"
          onClick={() => setLevelFilter(levelFilter === 'debug' ? '' : 'debug')}
          className={`h-auto rounded-lg border p-3 text-left transition-colors ${
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
        </Button>
        <Button
          variant="ghost"
          type="button"
          onClick={() => setLevelFilter(levelFilter === 'info' ? '' : 'info')}
          className={`h-auto rounded-lg border p-3 text-left transition-colors ${
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
        </Button>
        <Button
          variant="ghost"
          type="button"
          onClick={() => setLevelFilter(levelFilter === 'warn' ? '' : 'warn')}
          className={`h-auto rounded-lg border p-3 text-left transition-colors ${
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
        </Button>
        <Button
          variant="ghost"
          type="button"
          onClick={() => setLevelFilter(levelFilter === 'error' ? '' : 'error')}
          className={`h-auto rounded-lg border p-3 text-left transition-colors ${
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
        </Button>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <FiSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            maxLength={200}
            placeholder="Search logs by keyword..."
            aria-label="Search logs by keyword"
            className="w-full border-slate-600 bg-slate-800 py-1.5 pl-10 pr-3 text-sm text-slate-200 placeholder-slate-500 focus:border-cyan-500"
          />
        </div>

        {/* Level filter */}
        <div className="flex items-center gap-1.5">
          <FiFilter className="h-3.5 w-3.5 text-slate-400" />
          <Select value={levelFilter || '__all__'} onValueChange={(v) => setLevelFilter(v === '__all__' ? '' : v)}>
            <SelectTrigger className="w-auto h-8 border-slate-600 bg-slate-800 text-sm text-slate-200" aria-label="Filter by log level">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Levels</SelectItem>
              <SelectItem value="debug">Debug</SelectItem>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="warn">Warn</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Agent filter */}
        <Select value={agentFilter || '__all__'} onValueChange={(v) => setAgentFilter(v === '__all__' ? '' : v)}>
          <SelectTrigger className="w-auto h-8 border-slate-600 bg-slate-800 text-sm text-slate-200" aria-label="Filter by agent">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Agents</SelectItem>
            {agents.map((agent) => (
              <SelectItem key={agent} value={agent}>
                {agent}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Time range */}
        <div className="flex items-center gap-1.5">
          <FiCalendar className="h-3.5 w-3.5 text-slate-400" />
          <Input
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="h-8 w-auto border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-slate-200"
            title="Start time"
            aria-label="Start time"
          />
          <span className="text-xs text-slate-400">to</span>
          <Input
            type="datetime-local"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="h-8 w-auto border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-slate-200"
            title="End time"
            aria-label="End time"
          />
        </div>

        {hasFilters && (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleClearFilters}
            className="gap-1 h-auto px-2 py-1.5 text-xs"
          >
            <FiXCircle className="h-3 w-3" />
            Clear
          </Button>
        )}
      </div>

      {/* Actions row */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-400" data-testid="log-entry-count" data-count={logs.length}>
          {logs.length} log entries{hasFilters ? ' (filtered)' : ''}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCreateTestLog}
            className="gap-2 h-auto px-3 py-1.5"
          >
            <FiZap className="h-3.5 w-3.5" />
            Add Test Logs
          </Button>
          <label className="flex cursor-pointer items-center gap-2 rounded-md bg-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-600 transition-colors">
            <FiUpload className="h-3.5 w-3.5" />
            Import NDJSON
            <Input
              ref={fileInputRef}
              type="file"
              accept=".ndjson,.jsonl,.log,.txt,.json"
              onChange={handleImportNdjson}
              className="hidden"
            />
          </label>
          <Button
            variant="secondary"
            size="sm"
            onClick={loadLogs}
            className="gap-2 h-auto px-3 py-1.5"
          >
            <FiRefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handlePurge}
            className="gap-2 h-auto px-3 py-1.5 bg-slate-800/90 border border-red-500/30 text-red-300 hover:bg-slate-700/90 hover:border-red-400/40 shadow-sm"
          >
            <FiTrash2 className="h-3.5 w-3.5" />
            Purge All
          </Button>
        </div>
      </div>

      {/* Log entries */}
      {isLoading ? (
        <LogSkeleton />
      ) : logs.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-16 text-slate-400"
          data-testid="no-logs-empty-state"
        >
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-800 border border-slate-700">
            <FiFileText className="h-7 w-7 text-slate-400" />
          </div>
          <p className="text-lg font-medium text-slate-400">No log entries</p>
          {hasFilters ? (
            <p className="mt-1 text-sm">
              No logs match the current filters. Try adjusting or clearing filters.
            </p>
          ) : (
            <div className="mt-3 text-center">
              <p className="text-sm text-slate-400 mb-4">
                Logs are generated as you use Fleet Command. Here are some ways to get started:
              </p>
              <div className="flex flex-col gap-2 text-xs text-slate-400">
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
    overscan: 20,
  });

  return (
    <div
      ref={parentRef}
      className="max-h-[600px] overflow-y-auto"
      data-testid="virtualized-log-list"
      data-total-items={logs.length}
      data-rendered-items={virtualizer.getVirtualItems().length}
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
    if (!searchQuery.trim()) return text;
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
      <Button
        variant="ghost"
        type="button"
        onClick={onToggle}
        className="flex h-auto w-full items-center gap-3 rounded-none px-4 py-2 text-left hover:bg-slate-750 transition-colors"
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
          <Badge variant="secondary" className="bg-sky-900/50 text-sky-300">
            {entry.agent_name}
          </Badge>
        )}
        {entry.source && (
          <Badge variant="secondary" className="bg-slate-700 text-slate-400">
            {entry.source}
          </Badge>
        )}
        <span className="text-xs text-slate-400 whitespace-nowrap">
          {formatTimeOnly(entry.created_at)}
        </span>
      </Button>
      {expanded && (
        <div className="border-t border-slate-700/50 bg-slate-900/50 px-4 py-3 text-xs space-y-2">
          <div className="grid grid-cols-2 gap-2 text-slate-400">
            <div>
              <span className="text-slate-400">ID:</span> {entry.id}
            </div>
            <div>
              <span className="text-slate-400">Timestamp:</span>{' '}
              {formatDateTime(entry.created_at)}
            </div>
            <div>
              <span className="text-slate-400">Level:</span>{' '}
              <span className={levelColors[entry.level]}>{entry.level}</span>
            </div>
            <div>
              <span className="text-slate-400">Source:</span> {entry.source ?? '—'}
            </div>
            <div>
              <span className="text-slate-400">Agent:</span> {entry.agent_name ?? '—'}
            </div>
          </div>
          <div>
            <span className="text-slate-400">Message:</span>
            <pre className="mt-1 overflow-x-auto rounded bg-slate-900 p-2 font-mono text-slate-300 whitespace-pre-wrap">
              {entry.message}
            </pre>
          </div>
          {entry.data && (
            <div>
              <span className="text-slate-400">Data (NDJSON):</span>
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
        <Button
          variant="secondary"
          size="sm"
          onClick={loadStats}
          className="gap-2 h-auto px-3 py-1.5"
        >
          <FiRefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Tool Stats Table */}
      {isLoading ? (
        <ToolStatsSkeleton />
      ) : toolStats.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <FiBarChart2 className="mb-3 h-12 w-12" />
          <p className="text-lg font-medium">No tool usage data yet</p>
          <p className="mt-1 text-sm">Tool invocation stats will appear here as agents use tools</p>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-700 bg-slate-800 overflow-hidden">
          <Table className="w-full">
            <TableHeader>
              <TableRow className="border-b border-slate-700 text-left text-sm text-slate-400">
                <TableHead className="h-auto px-4 py-3 font-medium">Tool Name</TableHead>
                <TableHead className="h-auto px-4 py-3 font-medium text-right">Usage Count</TableHead>
                <TableHead className="h-auto px-4 py-3 font-medium text-right">Avg Duration</TableHead>
                <TableHead className="h-auto px-4 py-3 font-medium text-right">Min</TableHead>
                <TableHead className="h-auto px-4 py-3 font-medium text-right">Max</TableHead>
                <TableHead className="h-auto px-4 py-3 font-medium text-right">Total</TableHead>
                <TableHead className="h-auto px-4 py-3 font-medium">Usage Bar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {toolStats.map((tool) => (
                <TableRow
                  key={tool.tool_name}
                  className="border-b border-slate-700/50 last:border-b-0 hover:bg-slate-750"
                >
                  <TableCell className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FiZap className="h-4 w-4 text-cyan-400" />
                      <span className="font-mono text-sm font-medium text-slate-200">
                        {tool.tool_name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    <span className="font-mono text-sm font-bold text-cyan-400">
                      {tool.usage_count}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    <span className="font-mono text-sm text-slate-300">
                      {tool.avg_duration_ms != null
                        ? formatDuration(Math.round(tool.avg_duration_ms))
                        : '—'}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    <span className="font-mono text-sm text-slate-400">
                      {tool.min_duration_ms != null ? formatDuration(tool.min_duration_ms) : '—'}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    <span className="font-mono text-sm text-slate-400">
                      {tool.max_duration_ms != null ? formatDuration(tool.max_duration_ms) : '—'}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    <span className="font-mono text-sm text-emerald-400">
                      {tool.total_duration_ms != null
                        ? formatDuration(tool.total_duration_ms)
                        : '—'}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <div className="h-3 w-32 rounded-full bg-slate-700 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all"
                        style={{
                          width: `${(tool.usage_count / maxUsage) * 100}%`,
                        }}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
      toast.error('Failed to purge events');
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
          <Select value={eventTypeFilter || '__all__'} onValueChange={(v) => setEventTypeFilter(v === '__all__' ? '' : v)}>
            <SelectTrigger className="w-auto h-8 border-slate-600 bg-slate-800 text-sm text-slate-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Event Types</SelectItem>
              {eventTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-slate-400">{events.length} events</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={loadEvents}
            className="gap-2 h-auto px-3 py-1.5"
          >
            <FiRefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handlePurge}
            className="gap-2 h-auto px-3 py-1.5 bg-slate-800/90 border border-red-500/30 text-red-300 hover:bg-slate-700/90 hover:border-red-400/40 shadow-sm"
          >
            <FiTrash2 className="h-3.5 w-3.5" />
            Purge All
          </Button>
        </div>
      </div>

      {/* Event list */}
      {isLoading ? (
        <EventLogSkeleton />
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
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
      <Button
        variant="ghost"
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex h-auto w-full items-center gap-3 rounded-none px-4 py-2.5 text-left hover:bg-slate-750 transition-colors"
      >
        <EventTypeIcon eventType={event.event_type} />
        <EventTypeBadge eventType={event.event_type} />
        {event.agent_name && (
          <span className="text-sm font-medium text-slate-300">{event.agent_name}</span>
        )}
        {event.tool_name && (
          <Badge variant="secondary" className="bg-slate-700 font-mono text-cyan-400">
            {event.tool_name}
          </Badge>
        )}
        {event.tool_duration_ms != null && (
          <span className="text-xs text-slate-400">{formatDuration(event.tool_duration_ms)}</span>
        )}
        <span className="ml-auto text-xs text-slate-400">
          {formatTimeOnly(event.created_at)}
        </span>
      </Button>
      {expanded && (
        <div className="border-t border-slate-700/50 bg-slate-850 px-4 py-3 text-xs">
          <div className="grid grid-cols-2 gap-2 text-slate-400">
            <div>
              <span className="text-slate-400">ID:</span> {event.id}
            </div>
            <div>
              <span className="text-slate-400">Session:</span> {event.session_id ?? '—'}
            </div>
            <div>
              <span className="text-slate-400">Run:</span> {event.run_id ?? '—'}
            </div>
            <div>
              <span className="text-slate-400">Level:</span>{' '}
              <span className={event.level === 'error' ? 'text-red-400' : ''}>{event.level}</span>
            </div>
          </div>
          {event.tool_args && (
            <div className="mt-2">
              <span className="text-slate-400">Tool Args:</span>
              <pre className="mt-1 overflow-x-auto rounded bg-slate-900 p-2 font-mono text-slate-300">
                {event.tool_args}
              </pre>
            </div>
          )}
          {event.data && (
            <div className="mt-2">
              <span className="text-slate-400">Data:</span>
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
      return <FiZap className="h-3.5 w-3.5 text-sky-400" />;
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
    mail_sent: 'bg-sky-900/50 text-sky-300',
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
        return 'border-sky-500 bg-sky-500';
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
          <Select value={selectedAgent || '__all__'} onValueChange={(v) => setSelectedAgent(v === '__all__' ? '' : v)}>
            <SelectTrigger className="w-auto h-8 border-slate-600 bg-slate-800 text-sm text-slate-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Agents</SelectItem>
              {agents.map((agent) => (
                <SelectItem key={agent} value={agent}>
                  {agent}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-slate-400">{events.length} events</span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={loadEvents}
          className="gap-2 h-auto px-3 py-1.5"
        >
          <FiRefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Timeline */}
      {isLoading ? (
        <EventLogSkeleton />
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
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
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : event.id)}
                    className="h-auto w-full text-left rounded-md border border-slate-700/50 bg-slate-800 px-4 py-2.5 hover:bg-slate-750 transition-colors"
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
                        <Badge variant="secondary" className="bg-slate-700 font-mono text-cyan-400">
                          {event.tool_name}
                        </Badge>
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
                      <span className="ml-auto text-xs text-slate-400 flex items-center gap-1 flex-shrink-0">
                        <FiClock className="h-3 w-3" />
                        {formatTimeOnly(event.created_at)}
                      </span>
                    </div>
                  </Button>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="mt-1 ml-6 rounded-md border border-slate-700/50 bg-slate-850 px-4 py-3 text-xs">
                      <div className="grid grid-cols-2 gap-2 text-slate-400">
                        <div>
                          <span className="text-slate-400">ID:</span> {event.id}
                        </div>
                        <div>
                          <span className="text-slate-400">Session:</span> {event.session_id ?? '—'}
                        </div>
                        <div>
                          <span className="text-slate-400">Run:</span> {event.run_id ?? '—'}
                        </div>
                        <div>
                          <span className="text-slate-400">Level:</span>{' '}
                          <span className={event.level === 'error' ? 'text-red-400' : ''}>
                            {event.level}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400">Timestamp:</span>{' '}
                          {formatAbsoluteDateTime(event.created_at)}
                        </div>
                        {event.tool_duration_ms != null && (
                          <div>
                            <span className="text-slate-400">Duration:</span>{' '}
                            {formatDuration(event.tool_duration_ms)}
                          </div>
                        )}
                      </div>
                      {paired && event.event_type === 'tool_start' && (
                        <div className="mt-2 rounded bg-green-900/20 border border-green-800/30 p-2">
                          <span className="text-green-400 font-medium">Correlated tool_end:</span>
                          <div className="mt-1 text-slate-400">
                            <span className="text-slate-400">End time:</span>{' '}
                            {formatTimeOnly(paired.created_at)}
                            {paired.tool_duration_ms != null && (
                              <span className="ml-3">
                                <span className="text-slate-400">Duration:</span>{' '}
                                {formatDuration(paired.tool_duration_ms)}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                      {event.tool_args && (
                        <div className="mt-2">
                          <span className="text-slate-400">Tool Args:</span>
                          <pre className="mt-1 overflow-x-auto rounded bg-slate-900 p-2 font-mono text-slate-300">
                            {tryFormatJson(event.tool_args)}
                          </pre>
                        </div>
                      )}
                      {event.data && (
                        <div className="mt-2">
                          <span className="text-slate-400">Data:</span>
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
          <Select value={agentFilter || '__all__'} onValueChange={(v) => setAgentFilter(v === '__all__' ? '' : v)}>
            <SelectTrigger className="w-auto h-8 border-slate-600 bg-slate-800 text-sm text-slate-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Agents</SelectItem>
              {agents.map((agent) => (
                <SelectItem key={agent} value={agent}>
                  {agent}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={errorTypeFilter || '__all__'} onValueChange={(v) => setErrorTypeFilter(v === '__all__' ? '' : v)}>
            <SelectTrigger className="w-auto h-8 border-slate-600 bg-slate-800 text-sm text-slate-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Error Types</SelectItem>
              {errorCategories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-slate-400">
            {filteredErrors.length} error{filteredErrors.length !== 1 ? 's' : ''}
          </span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={loadErrors}
          className="gap-2 h-auto px-3 py-1.5"
        >
          <FiRefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Error count per agent summary */}
      {!isLoading && filteredErrors.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {agentSummaries.map((summary) => (
            <Button
              variant="ghost"
              type="button"
              key={summary.agentName}
              onClick={() =>
                setAgentFilter(agentFilter === summary.agentName ? '' : summary.agentName)
              }
              className={`h-auto rounded-lg border p-3 text-left transition-colors ${
                agentFilter === summary.agentName
                  ? 'border-red-500/50 bg-red-900/20'
                  : 'border-slate-700 bg-slate-800 hover:border-slate-600'
              }`}
            >
              <div className="text-xs text-slate-400 truncate" title={summary.agentName}>
                {summary.agentName}
              </div>
              <div className="mt-1 text-lg font-bold text-red-400">{summary.errorCount}</div>
            </Button>
          ))}
          {unattributedErrors.length > 0 && (
            <div className="rounded-lg border border-slate-700 bg-slate-800 p-3">
              <div className="text-xs text-slate-400 italic">Unattributed</div>
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
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
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
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : error.id)}
                  className="flex h-auto w-full items-center gap-3 rounded-none px-4 py-2.5 text-left hover:bg-slate-750 transition-colors"
                >
                  {isExpanded ? (
                    <FiChevronDown className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                  ) : (
                    <FiChevronRight className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                  )}
                  <FiXCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
                  <Badge variant="secondary" className="bg-red-900/50 text-red-300">
                    {category}
                  </Badge>
                  {error.agent_name && (
                    <span className="text-sm font-medium text-slate-300">{error.agent_name}</span>
                  )}
                  {error.tool_name && (
                    <Badge variant="secondary" className="bg-slate-700 font-mono text-cyan-400">
                      {error.tool_name}
                    </Badge>
                  )}
                  <span className="ml-auto text-xs text-slate-400 flex items-center gap-1 flex-shrink-0">
                    <FiClock className="h-3 w-3" />
                    {formatTimeOnly(error.created_at)}
                  </span>
                </Button>

                {isExpanded && (
                  <div className="border-t border-slate-700/50 bg-slate-850 px-4 py-3 text-xs">
                    <div className="grid grid-cols-2 gap-2 text-slate-400">
                      <div>
                        <span className="text-slate-400">ID:</span> {error.id}
                      </div>
                      <div>
                        <span className="text-slate-400">Agent:</span> {error.agent_name ?? '—'}
                      </div>
                      <div>
                        <span className="text-slate-400">Session:</span> {error.session_id ?? '—'}
                      </div>
                      <div>
                        <span className="text-slate-400">Event Type:</span> {error.event_type}
                      </div>
                      <div>
                        <span className="text-slate-400">Timestamp:</span>{' '}
                        {formatAbsoluteDateTime(error.created_at)}
                      </div>
                      {error.tool_name && (
                        <div>
                          <span className="text-slate-400">Tool:</span> {error.tool_name}
                        </div>
                      )}
                    </div>
                    {error.tool_args && (
                      <div className="mt-2">
                        <span className="text-slate-400">Tool Args:</span>
                        <pre className="mt-1 overflow-x-auto rounded bg-slate-900 p-2 font-mono text-slate-300">
                          {tryFormatJson(error.tool_args)}
                        </pre>
                      </div>
                    )}
                    {error.data && (
                      <div className="mt-2">
                        <span className="text-slate-400">Error Data:</span>
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

// ── App Preview Panel (Feature #365) ──────────────────────────────────

function AppPreviewPanel() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [showTerminal, setShowTerminal] = useState(true);

  // Check initial status and set up terminal
  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      theme: {
        background: '#0f172a',
        foreground: '#f8fafc',
        cursor: '#34d399',
        cursorAccent: '#0f172a',
        selectionBackground: '#334155',
        black: '#1e293b',
        red: '#f87171',
        green: '#34d399',
        yellow: '#fbbf24',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#f8fafc',
      },
      fontSize: 13,
      fontFamily: 'JetBrains Mono, Cascadia Code, Consolas, monospace',
      scrollback: 5000,
      cursorBlink: false,
      disableStdin: true,
    });
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(terminalRef.current);
    fitAddon.fit();
    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Check if preview is already running
    window.electronAPI.appPreviewStatus().then((result) => {
      if (result.data?.running) {
        setIsRunning(true);
        setPreviewUrl(result.data.url);
        setProjectPath(result.data.projectPath);
        // Load existing output buffer
        window.electronAPI.appPreviewOutput().then((outputResult) => {
          if (outputResult.data) {
            for (const line of outputResult.data) {
              term.write(line);
            }
          }
        });
      }
    });

    // Listen for output
    const removeOutputListener = window.electronAPI.onAppPreviewOutput((payload) => {
      term.write(payload.data);
      // Check for URL in output
      const urlMatch = payload.data.match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d+/);
      if (urlMatch) {
        const detected = urlMatch[0].replace('0.0.0.0', 'localhost');
        setPreviewUrl(detected);
      }
    });

    const removeExitListener = window.electronAPI.onAppPreviewExit(({ exitCode }) => {
      term.writeln(`\r\n\x1b[33m[Preview] Process exited with code ${exitCode}\x1b[0m`);
      setIsRunning(false);
      setIsStarting(false);
      setPreviewUrl(null);
    });

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
      } catch {
        // ignore
      }
    });
    resizeObserver.observe(terminalRef.current);

    return () => {
      removeOutputListener();
      removeExitListener();
      resizeObserver.disconnect();
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  const handleStart = useCallback(async () => {
    setIsStarting(true);
    if (xtermRef.current) {
      xtermRef.current.clear();
      xtermRef.current.writeln('\x1b[32m[Preview] Starting dev server...\x1b[0m');
    }
    try {
      const result = await window.electronAPI.appPreviewStart();
      if (result.error) {
        toast.error(`Failed to start preview: ${result.error}`);
        if (xtermRef.current) {
          xtermRef.current.writeln(`\x1b[31m[Error] ${result.error}\x1b[0m`);
        }
        setIsStarting(false);
        return;
      }
      if (result.data) {
        setIsRunning(true);
        setProjectPath(result.data.projectPath);
        if (result.data.alreadyRunning) {
          toast.success('Preview server is already running');
          setPreviewUrl(result.data.url);
        } else {
          toast.success('Preview server started');
        }
      }
    } catch (err) {
      toast.error(`Failed to start preview: ${String(err)}`);
    }
    setIsStarting(false);
  }, []);

  const handleStop = useCallback(async () => {
    try {
      const result = await window.electronAPI.appPreviewStop();
      if (result.error) {
        toast.error(`Failed to stop preview: ${result.error}`);
        return;
      }
      setIsRunning(false);
      setPreviewUrl(null);
      setProjectPath(null);
      if (xtermRef.current) {
        xtermRef.current.writeln('\x1b[33m[Preview] Server stopped\x1b[0m');
      }
      toast.success('Preview server stopped');
    } catch (err) {
      toast.error(`Failed to stop preview: ${String(err)}`);
    }
  }, []);

  const handleOpenBrowser = useCallback(async () => {
    try {
      const result = await window.electronAPI.appPreviewOpenBrowser();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success('Opened preview in browser');
    } catch (err) {
      toast.error(`Failed to open browser: ${String(err)}`);
    }
  }, []);

  return (
    <div className="flex flex-col gap-4" data-testid="app-preview-panel">
      {/* Header with controls */}
      <div className="flex items-center justify-between rounded-lg bg-slate-800 p-4">
        <div className="flex items-center gap-3">
          <FiGlobe className="h-5 w-5 text-green-400" />
          <div>
            <h3 className="text-sm font-semibold text-slate-50">App Preview</h3>
            <p className="text-xs text-slate-400">
              {projectPath
                ? `Project: ${projectPath.split(/[\\/]/).pop()}`
                : 'Run the dev server to preview agent changes'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isRunning ? (
            <>
              <Button
                size="sm"
                onClick={handleOpenBrowser}
                disabled={!previewUrl}
                data-testid="preview-open-browser"
                className="gap-1.5 h-auto px-3 py-1.5 text-xs bg-slate-800/90 border border-blue-500/30 text-blue-300 hover:bg-slate-700/90 hover:border-blue-400/40 shadow-sm"
                title={previewUrl || 'Waiting for URL...'}
              >
                <FiExternalLink className="h-3.5 w-3.5" />
                Open in Browser
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleStop}
                data-testid="preview-stop-btn"
                className="gap-1.5 h-auto px-3 py-1.5 text-xs bg-slate-800/90 border border-red-500/30 text-red-300 hover:bg-slate-700/90 hover:border-red-400/40 shadow-sm"
              >
                <FiStopCircle className="h-3.5 w-3.5" />
                Stop Server
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              onClick={handleStart}
              disabled={isStarting}
              data-testid="preview-start-btn"
              className="gap-1.5 h-auto px-3 py-1.5 text-xs bg-slate-800/90 border border-blue-500/30 text-blue-300 hover:bg-slate-700/90 hover:border-blue-400/40 shadow-sm"
            >
              <FiPlay className="h-3.5 w-3.5" />
              {isStarting ? 'Starting...' : 'Run Preview'}
            </Button>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-4 rounded-lg bg-slate-800/50 px-4 py-2">
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${isRunning ? 'bg-green-400 animate-pulse' : 'bg-slate-500'}`}
            data-testid="preview-status-indicator"
            data-running={isRunning}
          />
          <span className="text-xs text-slate-400">
            {isRunning ? 'Server Running' : 'Server Stopped'}
          </span>
        </div>
        {previewUrl && (
          <div className="flex items-center gap-2" data-testid="preview-url-display">
            <FiGlobe className="h-3.5 w-3.5 text-green-400" />
            <span className="text-xs font-mono text-green-400">{previewUrl}</span>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowTerminal((prev) => !prev)}
          className="ml-auto h-auto text-xs text-slate-400 hover:text-slate-200"
          data-testid="preview-toggle-terminal"
        >
          {showTerminal ? 'Hide' : 'Show'} Terminal Output
        </Button>
      </div>

      {/* Preview area */}
      <div className="flex-1 flex flex-col gap-4">
        {/* Embedded webview when URL is available */}
        {previewUrl && (
          <div className="rounded-lg border border-slate-700 overflow-hidden" data-testid="preview-webview-container">
            <div className="flex items-center gap-2 bg-slate-800 px-3 py-1.5 border-b border-slate-700">
              <FiGlobe className="h-3.5 w-3.5 text-green-400" />
              <span className="text-xs font-mono text-slate-400 truncate">{previewUrl}</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  const iframe = document.getElementById('preview-iframe') as HTMLIFrameElement | null;
                  if (iframe) {
                    iframe.src = previewUrl;
                  }
                }}
                data-testid="preview-refresh-btn"
                className="ml-auto h-auto w-auto text-slate-400 hover:text-slate-200"
                title="Refresh preview"
              >
                <FiRefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
            <iframe
              id="preview-iframe"
              src={previewUrl}
              title="App Preview"
              className="w-full bg-white"
              style={{ height: showTerminal ? '350px' : '600px' }}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
              data-testid="preview-iframe"
            />
          </div>
        )}

        {/* Terminal output */}
        {showTerminal && (
          <div
            className="rounded-lg border border-slate-700 overflow-hidden"
            style={{ height: previewUrl ? '200px' : '500px' }}
            data-testid="preview-terminal"
          >
            <div ref={terminalRef} className="h-full" />
          </div>
        )}
      </div>
    </div>
  );
}
