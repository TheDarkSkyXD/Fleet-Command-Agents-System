import { useCallback, useEffect, useState } from 'react';
import {
  FiActivity,
  FiBarChart2,
  FiClock,
  FiHash,
  FiPlay,
  FiRefreshCw,
  FiSquare,
  FiTerminal,
  FiTrash2,
  FiTrendingUp,
  FiZap,
} from 'react-icons/fi';
import type { Event, ToolStats } from '../../shared/types';

type DebugTab = 'events' | 'tool-stats';

export function DebugPage() {
  const [activeTab, setActiveTab] = useState<DebugTab>('tool-stats');

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FiTerminal className="h-7 w-7 text-cyan-400" />
          <h1 className="text-2xl font-bold text-slate-50">Debug</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-lg bg-slate-800 p-1">
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
      </div>

      {activeTab === 'tool-stats' ? <ToolStatsPanel /> : <EventLogPanel />}
    </div>
  );
}

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
