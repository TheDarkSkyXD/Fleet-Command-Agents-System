import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FiActivity,
  FiAlertTriangle,
  FiChevronDown,
  FiFilter,
  FiMail,
  FiPlay,
  FiRefreshCw,
  FiTerminal,
  FiTool,
  FiX,
  FiZap,
} from 'react-icons/fi';
import type { Event, EventType } from '../../shared/types';
import { SlidePanel } from '../components/SlidePanel';

const EVENT_TYPE_CONFIG: Record<
  EventType,
  { label: string; icon: typeof FiActivity; color: string; bgColor: string }
> = {
  tool_start: {
    label: 'Tool Start',
    icon: FiTool,
    color: 'text-blue-400',
    bgColor: 'bg-blue-900/30 border-blue-700',
  },
  tool_end: {
    label: 'Tool End',
    icon: FiTool,
    color: 'text-blue-300',
    bgColor: 'bg-blue-900/20 border-blue-800',
  },
  session_start: {
    label: 'Session Start',
    icon: FiPlay,
    color: 'text-green-400',
    bgColor: 'bg-green-900/30 border-green-700',
  },
  session_end: {
    label: 'Session End',
    icon: FiTerminal,
    color: 'text-slate-400',
    bgColor: 'bg-slate-800/50 border-slate-700',
  },
  mail_sent: {
    label: 'Mail Sent',
    icon: FiMail,
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-900/30 border-cyan-700',
  },
  mail_received: {
    label: 'Mail Received',
    icon: FiMail,
    color: 'text-cyan-300',
    bgColor: 'bg-cyan-900/20 border-cyan-800',
  },
  spawn: {
    label: 'Agent Spawn',
    icon: FiZap,
    color: 'text-amber-400',
    bgColor: 'bg-amber-900/30 border-amber-700',
  },
  error: {
    label: 'Error',
    icon: FiAlertTriangle,
    color: 'text-red-400',
    bgColor: 'bg-red-900/30 border-red-700',
  },
  custom: {
    label: 'Custom',
    icon: FiActivity,
    color: 'text-purple-400',
    bgColor: 'bg-purple-900/30 border-purple-700',
  },
};

const ALL_EVENT_TYPES: EventType[] = [
  'spawn',
  'session_start',
  'session_end',
  'tool_start',
  'tool_end',
  'mail_sent',
  'mail_received',
  'error',
  'custom',
];

function formatEventTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);

  if (diffSecs < 5) return 'just now';
  if (diffSecs < 60) return `${diffSecs}s ago`;
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString();
}

function formatFullTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });
}

export function EventFeedPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [filterType, setFilterType] = useState<string>('');
  const [filterAgent, setFilterAgent] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [eventLimit, setEventLimit] = useState(100);
  const feedRef = useRef<HTMLDivElement>(null);
  const prevEventCountRef = useRef(0);

  const loadEvents = useCallback(async () => {
    try {
      const filters: Record<string, unknown> = { limit: eventLimit };
      if (filterType) filters.eventType = filterType;
      if (filterAgent) filters.agentName = filterAgent;

      const result = await window.electronAPI.eventList(filters);
      if (result.data) {
        setEvents(result.data as Event[]);
      }
    } catch (err) {
      console.error('Failed to load events:', err);
    } finally {
      setLoading(false);
    }
  }, [filterType, filterAgent, eventLimit]);

  // Initial load
  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Auto-refresh every 2 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(loadEvents, 2000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadEvents]);

  // Auto-scroll to top when new events arrive
  useEffect(() => {
    if (events.length > prevEventCountRef.current && feedRef.current) {
      feedRef.current.scrollTop = 0;
    }
    prevEventCountRef.current = events.length;
  }, [events.length]);

  // Extract unique agent names for filter suggestions
  const uniqueAgents = Array.from(
    new Set(events.map((e) => e.agent_name).filter(Boolean) as string[]),
  ).sort();

  const activeFilterCount = [filterType, filterAgent].filter(Boolean).length;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-50">Event Feed</h1>
          <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs text-slate-400">
            {events.length} events
          </span>
          {autoRefresh && (
            <span className="flex items-center gap-1 rounded-full bg-green-900/30 px-2.5 py-0.5 text-xs text-green-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
              Live
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Auto-refresh toggle */}
          <button
            type="button"
            onClick={() => setAutoRefresh((v) => !v)}
            className={`flex items-center gap-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
              autoRefresh
                ? 'border-green-700 bg-green-900/20 text-green-400 hover:bg-green-900/30'
                : 'border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
            title={autoRefresh ? 'Pause live updates' : 'Resume live updates'}
          >
            <FiActivity size={14} className={autoRefresh ? 'animate-pulse' : ''} />
            {autoRefresh ? 'Live' : 'Paused'}
          </button>

          {/* Manual refresh */}
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              loadEvents();
            }}
            className="flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
            title="Refresh now"
          >
            <FiRefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>

          {/* Filter toggle */}
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
              showFilters || activeFilterCount > 0
                ? 'border-blue-700 bg-blue-900/20 text-blue-400'
                : 'border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <FiFilter size={14} />
            {activeFilterCount > 0 && (
              <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Filters bar */}
      <SlidePanel isOpen={showFilters} direction="top">
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-slate-700 bg-slate-900 p-3">
          {/* Event type filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Type:</span>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
              aria-label="Filter by event type"
            >
              <option value="">All types</option>
              {ALL_EVENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {EVENT_TYPE_CONFIG[t].label}
                </option>
              ))}
            </select>
          </div>

          {/* Agent filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Agent:</span>
            <select
              value={filterAgent}
              onChange={(e) => setFilterAgent(e.target.value)}
              className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
              aria-label="Filter by agent"
            >
              <option value="">All agents</option>
              {uniqueAgents.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          {/* Limit */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Show:</span>
            <select
              value={eventLimit}
              onChange={(e) => setEventLimit(Number(e.target.value))}
              className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
              aria-label="Number of events to show"
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={250}>250</option>
              <option value={500}>500</option>
            </select>
          </div>

          {/* Clear filters */}
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setFilterType('');
                setFilterAgent('');
              }}
              className="flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-xs text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
            >
              <FiX size={12} />
              Clear
            </button>
          )}
        </div>
      </SlidePanel>

      {/* Event feed */}
      <div ref={feedRef} className="flex-1 space-y-1 overflow-y-auto pr-1">
        {loading && events.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <FiRefreshCw size={24} className="animate-spin text-slate-500" />
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <FiActivity size={40} className="mb-3 opacity-30" />
            <p className="text-sm">No events recorded yet</p>
            <p className="mt-1 text-xs text-slate-600">
              Events will appear here as agents perform actions
            </p>
          </div>
        ) : (
          events.map((event) => {
            const config = EVENT_TYPE_CONFIG[event.event_type] || EVENT_TYPE_CONFIG.custom;
            const Icon = config.icon;
            return (
              <div
                key={event.id}
                className={`flex items-start gap-3 rounded-lg border px-3 py-2 transition-colors hover:bg-slate-800/50 ${config.bgColor}`}
              >
                {/* Icon */}
                <div className={`mt-0.5 flex-shrink-0 ${config.color}`}>
                  <Icon size={16} />
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {/* Event type badge */}
                    <span
                      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${config.color}`}
                    >
                      {config.label}
                    </span>

                    {/* Agent name */}
                    {event.agent_name && (
                      <span
                        className="truncate text-xs font-medium text-slate-300"
                        title={event.agent_name}
                      >
                        {event.agent_name}
                      </span>
                    )}

                    {/* Tool name */}
                    {event.tool_name && (
                      <span
                        className="truncate rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400"
                        title={event.tool_name}
                      >
                        {event.tool_name}
                      </span>
                    )}

                    {/* Duration */}
                    {event.tool_duration_ms != null && event.tool_duration_ms > 0 && (
                      <span className="text-[10px] text-slate-500">{event.tool_duration_ms}ms</span>
                    )}

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* Timestamp */}
                    <span
                      className="flex-shrink-0 text-[10px] text-slate-500"
                      title={formatFullTime(event.created_at)}
                    >
                      {formatEventTime(event.created_at)}
                    </span>
                  </div>

                  {/* Data payload */}
                  {event.data && (
                    <p className="mt-0.5 truncate text-xs text-slate-400" title={event.data}>
                      {event.data}
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}

        {/* Load more indicator */}
        {events.length >= eventLimit && (
          <button
            type="button"
            onClick={() => setEventLimit((v) => v + 100)}
            className="flex w-full items-center justify-center gap-1 rounded-lg border border-slate-800 py-2 text-xs text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
          >
            <FiChevronDown size={14} />
            Load more events
          </button>
        )}
      </div>
    </div>
  );
}
