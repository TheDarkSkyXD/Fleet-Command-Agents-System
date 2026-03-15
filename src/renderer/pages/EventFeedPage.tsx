import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FiActivity,
  FiAlertTriangle,
  FiChevronDown,
  FiClock,
  FiFilter,
  FiGitMerge,
  FiLink,
  FiMail,
  FiPlay,
  FiRefreshCw,
  FiTerminal,
  FiTool,
  FiX,
  FiZap,
} from 'react-icons/fi';
import type { Event, EventType, Run } from '../../shared/types';
import { SlidePanel } from '../components/SlidePanel';

type ViewTab = 'feed' | 'replay' | 'correlation';

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

// Stable agent color palette for replay view
const AGENT_COLORS = [
  { text: 'text-blue-400', bg: 'bg-blue-900/40', border: 'border-l-blue-400' },
  { text: 'text-green-400', bg: 'bg-green-900/40', border: 'border-l-green-400' },
  { text: 'text-amber-400', bg: 'bg-amber-900/40', border: 'border-l-amber-400' },
  { text: 'text-purple-400', bg: 'bg-purple-900/40', border: 'border-l-purple-400' },
  { text: 'text-cyan-400', bg: 'bg-cyan-900/40', border: 'border-l-cyan-400' },
  { text: 'text-pink-400', bg: 'bg-pink-900/40', border: 'border-l-pink-400' },
  { text: 'text-orange-400', bg: 'bg-orange-900/40', border: 'border-l-orange-400' },
  { text: 'text-teal-400', bg: 'bg-teal-900/40', border: 'border-l-teal-400' },
];

interface ToolCorrelation {
  toolName: string;
  agentName: string | null;
  sessionId: string | null;
  startEvent: Event;
  endEvent: Event | null;
  durationMs: number | null;
  isOrphaned: boolean;
}

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

function formatReplayTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

export function EventFeedPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [filterType, setFilterType] = useState<string>('');
  const [filterAgent, setFilterAgent] = useState('');
  const [filterRunId, setFilterRunId] = useState('');
  const [runs, setRuns] = useState<Run[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [eventLimit, setEventLimit] = useState(100);
  const [activeTab, setActiveTab] = useState<ViewTab>('feed');
  const feedRef = useRef<HTMLDivElement>(null);
  const prevEventCountRef = useRef(0);

  // Load available runs for the filter dropdown
  useEffect(() => {
    (async () => {
      try {
        const result = await window.electronAPI.runList();
        if (result.data) {
          setRuns(result.data as Run[]);
        }
      } catch (err) {
        console.error('Failed to load runs:', err);
      }
    })();
  }, []);

  const loadEvents = useCallback(async () => {
    try {
      const filters: Record<string, unknown> = { limit: eventLimit };
      if (filterType) filters.eventType = filterType;
      if (filterAgent) filters.agentName = filterAgent;
      if (filterRunId) filters.runId = filterRunId;

      const result = await window.electronAPI.eventList(filters);
      if (result.data) {
        setEvents(result.data as Event[]);
      }
    } catch (err) {
      console.error('Failed to load events:', err);
    } finally {
      setLoading(false);
    }
  }, [filterType, filterAgent, filterRunId, eventLimit]);

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

  // Auto-scroll to top when new events arrive (feed tab only)
  useEffect(() => {
    if (activeTab === 'feed' && events.length > prevEventCountRef.current && feedRef.current) {
      feedRef.current.scrollTop = 0;
    }
    prevEventCountRef.current = events.length;
  }, [events.length, activeTab]);

  // Extract unique agent names for filter suggestions
  const uniqueAgents = Array.from(
    new Set(events.map((e) => e.agent_name).filter(Boolean) as string[]),
  ).sort();

  const activeFilterCount = [filterType, filterAgent, filterRunId].filter(Boolean).length;

  // Replay view: events sorted chronologically (ascending) with agent color mapping
  const replayData = useMemo(() => {
    const sorted = [...events].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

    // Assign stable colors to agents
    const agentColorMap = new Map<string, (typeof AGENT_COLORS)[0]>();
    let colorIndex = 0;
    for (const evt of sorted) {
      const name = evt.agent_name || '__unknown__';
      if (!agentColorMap.has(name)) {
        agentColorMap.set(name, AGENT_COLORS[colorIndex % AGENT_COLORS.length]);
        colorIndex++;
      }
    }

    return { events: sorted, agentColorMap };
  }, [events]);

  // Tool correlation: match tool_start with tool_end events
  const toolCorrelations = useMemo((): ToolCorrelation[] => {
    // Get all tool_start and tool_end events sorted chronologically
    const toolEvents = [...events]
      .filter((e) => e.event_type === 'tool_start' || e.event_type === 'tool_end')
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    const correlations: ToolCorrelation[] = [];
    // Track pending tool_start events per agent+session+tool combo
    const pendingStarts = new Map<string, Event[]>();

    for (const evt of toolEvents) {
      const key = `${evt.agent_name || ''}::${evt.session_id || ''}::${evt.tool_name || ''}`;

      if (evt.event_type === 'tool_start') {
        if (!pendingStarts.has(key)) {
          pendingStarts.set(key, []);
        }
        pendingStarts.get(key)!.push(evt);
      } else if (evt.event_type === 'tool_end') {
        const pending = pendingStarts.get(key);
        if (pending && pending.length > 0) {
          const startEvt = pending.shift()!;
          const startTime = new Date(startEvt.created_at).getTime();
          const endTime = new Date(evt.created_at).getTime();
          const durationMs = evt.tool_duration_ms ?? (endTime - startTime);
          correlations.push({
            toolName: evt.tool_name || 'unknown',
            agentName: evt.agent_name,
            sessionId: evt.session_id,
            startEvent: startEvt,
            endEvent: evt,
            durationMs,
            isOrphaned: false,
          });
        } else {
          // tool_end without matching tool_start - still show it as a correlated pair
          correlations.push({
            toolName: evt.tool_name || 'unknown',
            agentName: evt.agent_name,
            sessionId: evt.session_id,
            startEvent: evt,
            endEvent: evt,
            durationMs: evt.tool_duration_ms,
            isOrphaned: false,
          });
        }
      }
    }

    // Mark remaining unmatched tool_start events as orphaned
    for (const pending of pendingStarts.values()) {
      for (const startEvt of pending) {
        correlations.push({
          toolName: startEvt.tool_name || 'unknown',
          agentName: startEvt.agent_name,
          sessionId: startEvt.session_id,
          startEvent: startEvt,
          endEvent: null,
          durationMs: null,
          isOrphaned: true,
        });
      }
    }

    // Sort: orphaned first, then by start time descending
    correlations.sort((a, b) => {
      if (a.isOrphaned !== b.isOrphaned) return a.isOrphaned ? -1 : 1;
      return new Date(b.startEvent.created_at).getTime() - new Date(a.startEvent.created_at).getTime();
    });

    return correlations;
  }, [events]);

  const orphanedCount = toolCorrelations.filter((c) => c.isOrphaned).length;
  const correlatedCount = toolCorrelations.filter((c) => !c.isOrphaned).length;

  const tabs: { id: ViewTab; label: string; icon: typeof FiActivity }[] = [
    { id: 'feed', label: 'Live Feed', icon: FiActivity },
    { id: 'replay', label: 'Replay', icon: FiClock },
    { id: 'correlation', label: 'Tool Correlation', icon: FiLink },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-50">Event Feed</h1>
          <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs text-slate-400">
            {events.length} events
          </span>
          {autoRefresh && activeTab === 'feed' && (
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

      {/* Tabs */}
      <div className="mb-3 flex gap-1 border-b border-slate-800 pb-0">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              data-testid={`event-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2 text-sm transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 bg-slate-800/50 text-blue-400'
                  : 'border-transparent text-slate-400 hover:bg-slate-800/30 hover:text-slate-300'
              }`}
            >
              <Icon size={14} />
              {tab.label}
              {tab.id === 'correlation' && orphanedCount > 0 && (
                <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-600 text-[10px] font-bold text-white">
                  {orphanedCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Filters bar */}
      <SlidePanel isOpen={showFilters} direction="top">
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-slate-700 bg-slate-900 p-3">
          {/* Event type filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Type:</span>
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
            <span className="text-xs text-slate-400">Agent:</span>
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

          {/* Run filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Run:</span>
            <select
              value={filterRunId}
              onChange={(e) => setFilterRunId(e.target.value)}
              className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
              aria-label="Filter by run ID"
              data-testid="event-filter-run"
            >
              <option value="">All runs</option>
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.id.slice(0, 8)}… ({r.status}{r.agent_count ? `, ${r.agent_count} agents` : ''})
                </option>
              ))}
            </select>
          </div>

          {/* Limit */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Show:</span>
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
                setFilterRunId('');
              }}
              className="flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-xs text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
            >
              <FiX size={12} />
              Clear
            </button>
          )}
        </div>
      </SlidePanel>

      {/* Tab content */}
      {activeTab === 'feed' && (
        <FeedView
          events={events}
          loading={loading}
          eventLimit={eventLimit}
          setEventLimit={setEventLimit}
          feedRef={feedRef}
        />
      )}

      {activeTab === 'replay' && (
        <ReplayView
          events={replayData.events}
          agentColorMap={replayData.agentColorMap}
          loading={loading}
          eventLimit={eventLimit}
          setEventLimit={setEventLimit}
        />
      )}

      {activeTab === 'correlation' && (
        <CorrelationView
          correlations={toolCorrelations}
          correlatedCount={correlatedCount}
          orphanedCount={orphanedCount}
          loading={loading}
        />
      )}
    </div>
  );
}

/* ===================== FEED VIEW (original) ===================== */

function FeedView({
  events,
  loading,
  eventLimit,
  setEventLimit,
  feedRef,
}: {
  events: Event[];
  loading: boolean;
  eventLimit: number;
  setEventLimit: React.Dispatch<React.SetStateAction<number>>;
  feedRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={feedRef} className="flex-1 space-y-1 overflow-y-auto pr-1">
      {loading && events.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <FiRefreshCw size={24} className="animate-spin text-slate-400" />
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <FiActivity size={40} className="mb-3 opacity-30" />
          <p className="text-sm">No events recorded yet</p>
          <p className="mt-1 text-xs text-slate-500">
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
                    <span className="text-[10px] text-slate-400">{event.tool_duration_ms}ms</span>
                  )}

                  {/* Spacer */}
                  <div className="flex-1" />

                  {/* Timestamp */}
                  <span
                    className="flex-shrink-0 text-[10px] text-slate-400"
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
          className="flex w-full items-center justify-center gap-1 rounded-lg border border-slate-800 py-2 text-xs text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-300"
        >
          <FiChevronDown size={14} />
          Load more events
        </button>
      )}
    </div>
  );
}

/* ===================== REPLAY VIEW (#353) ===================== */

function ReplayView({
  events,
  agentColorMap,
  loading,
  eventLimit,
  setEventLimit,
}: {
  events: Event[];
  agentColorMap: Map<string, (typeof AGENT_COLORS)[0]>;
  loading: boolean;
  eventLimit: number;
  setEventLimit: React.Dispatch<React.SetStateAction<number>>;
}) {
  const agentNames = Array.from(agentColorMap.keys()).filter((n) => n !== '__unknown__');

  return (
    <div className="flex-1 space-y-0 overflow-y-auto pr-1" data-testid="replay-view">
      {/* Replay header with agent legend */}
      {agentNames.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 p-2.5">
          <span className="mr-1 text-xs font-medium text-slate-400">Agents:</span>
          {agentNames.map((name) => {
            const color = agentColorMap.get(name)!;
            return (
              <span
                key={name}
                className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${color.text} ${color.bg}`}
                data-testid={`replay-agent-${name}`}
              >
                <span className={`h-2 w-2 rounded-full bg-current`} />
                {name}
              </span>
            );
          })}
          <span className="ml-auto text-[10px] text-slate-500">
            {events.length} events, {agentNames.length} agent{agentNames.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {loading && events.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <FiRefreshCw size={24} className="animate-spin text-slate-400" />
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <FiClock size={40} className="mb-3 opacity-30" />
          <p className="text-sm">No events to replay</p>
          <p className="mt-1 text-xs text-slate-500">
            Events from multiple agents will be interleaved chronologically
          </p>
        </div>
      ) : (
        <div className="space-y-0.5">
          {events.map((event, index) => {
            const config = EVENT_TYPE_CONFIG[event.event_type] || EVENT_TYPE_CONFIG.custom;
            const Icon = config.icon;
            const agentKey = event.agent_name || '__unknown__';
            const agentColor = agentColorMap.get(agentKey) || AGENT_COLORS[0];

            // Show time separator when time gap > 5 seconds
            let showTimeSep = false;
            if (index > 0) {
              const prevTime = new Date(events[index - 1].created_at).getTime();
              const curTime = new Date(event.created_at).getTime();
              if (curTime - prevTime > 5000) {
                showTimeSep = true;
              }
            }

            return (
              <div key={event.id}>
                {showTimeSep && (
                  <div className="my-1.5 flex items-center gap-2 px-2">
                    <div className="h-px flex-1 bg-slate-700" />
                    <span className="text-[10px] text-slate-500">
                      {formatReplayTime(event.created_at)}
                    </span>
                    <div className="h-px flex-1 bg-slate-700" />
                  </div>
                )}
                <div
                  data-testid="replay-event"
                  data-agent={event.agent_name || 'unknown'}
                  data-event-type={event.event_type}
                  className={`flex items-start gap-2 rounded border border-slate-800 border-l-2 px-3 py-1.5 transition-colors hover:bg-slate-800/30 ${agentColor.border}`}
                >
                  {/* Timestamp column */}
                  <span
                    className="mt-0.5 w-16 flex-shrink-0 text-right font-mono text-[10px] text-slate-500"
                    title={formatFullTime(event.created_at)}
                  >
                    {formatReplayTime(event.created_at)}
                  </span>

                  {/* Agent indicator */}
                  <span
                    className={`mt-0.5 w-24 flex-shrink-0 truncate text-xs font-medium ${agentColor.text}`}
                    title={event.agent_name || 'unknown'}
                    data-testid="replay-event-agent"
                  >
                    {event.agent_name || 'unknown'}
                  </span>

                  {/* Event icon */}
                  <div className={`mt-0.5 flex-shrink-0 ${config.color}`}>
                    <Icon size={14} />
                  </div>

                  {/* Event content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-[10px] font-semibold uppercase tracking-wider ${config.color}`}
                      >
                        {config.label}
                      </span>
                      {event.tool_name && (
                        <span className="truncate rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                          {event.tool_name}
                        </span>
                      )}
                      {event.tool_duration_ms != null && event.tool_duration_ms > 0 && (
                        <span className="text-[10px] text-slate-500">
                          {formatDuration(event.tool_duration_ms)}
                        </span>
                      )}
                    </div>
                    {event.data && (
                      <p className="mt-0.5 truncate text-[11px] text-slate-500" title={event.data}>
                        {event.data}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Load more */}
      {events.length >= eventLimit && (
        <button
          type="button"
          onClick={() => setEventLimit((v) => v + 100)}
          className="mt-1 flex w-full items-center justify-center gap-1 rounded-lg border border-slate-800 py-2 text-xs text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-300"
        >
          <FiChevronDown size={14} />
          Load more events
        </button>
      )}
    </div>
  );
}

/* ===================== CORRELATION VIEW (#354) ===================== */

function CorrelationView({
  correlations,
  correlatedCount,
  orphanedCount,
  loading,
}: {
  correlations: ToolCorrelation[];
  correlatedCount: number;
  orphanedCount: number;
  loading: boolean;
}) {
  return (
    <div className="flex-1 overflow-y-auto pr-1" data-testid="correlation-view">
      {/* Summary stats */}
      <div className="mb-3 flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-900 p-2.5">
        <div className="flex items-center gap-1.5">
          <FiGitMerge size={14} className="text-green-400" />
          <span className="text-xs text-slate-400">Correlated:</span>
          <span className="text-xs font-medium text-green-400" data-testid="correlated-count">
            {correlatedCount}
          </span>
        </div>
        <div className="h-3 w-px bg-slate-700" />
        <div className="flex items-center gap-1.5">
          <FiAlertTriangle size={14} className={orphanedCount > 0 ? 'text-amber-400' : 'text-slate-500'} />
          <span className="text-xs text-slate-400">Orphaned starts:</span>
          <span
            className={`text-xs font-medium ${orphanedCount > 0 ? 'text-amber-400' : 'text-slate-500'}`}
            data-testid="orphaned-count"
          >
            {orphanedCount}
          </span>
        </div>
        <div className="h-3 w-px bg-slate-700" />
        <div className="flex items-center gap-1.5">
          <FiTool size={14} className="text-slate-400" />
          <span className="text-xs text-slate-400">Total:</span>
          <span className="text-xs font-medium text-slate-300">{correlations.length}</span>
        </div>
      </div>

      {loading && correlations.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <FiRefreshCw size={24} className="animate-spin text-slate-400" />
        </div>
      ) : correlations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <FiLink size={40} className="mb-3 opacity-30" />
          <p className="text-sm">No tool events to correlate</p>
          <p className="mt-1 text-xs text-slate-500">
            tool_start and tool_end events will be matched here
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {correlations.map((corr) => (
            <div
              key={corr.startEvent.id}
              data-testid="correlation-item"
              data-orphaned={corr.isOrphaned ? 'true' : 'false'}
              className={`rounded-lg border px-3 py-2 transition-colors hover:bg-slate-800/30 ${
                corr.isOrphaned
                  ? 'border-amber-700/50 bg-amber-900/10'
                  : 'border-slate-700 bg-slate-900/30'
              }`}
            >
              <div className="flex items-center gap-2">
                {/* Status icon */}
                {corr.isOrphaned ? (
                  <FiAlertTriangle size={14} className="flex-shrink-0 text-amber-400" />
                ) : (
                  <FiLink size={14} className="flex-shrink-0 text-green-400" />
                )}

                {/* Tool name */}
                <span className="rounded bg-slate-800 px-1.5 py-0.5 text-xs font-medium text-blue-400">
                  {corr.toolName}
                </span>

                {/* Agent name */}
                {corr.agentName && (
                  <span className="truncate text-xs text-slate-400" title={corr.agentName}>
                    {corr.agentName}
                  </span>
                )}

                <div className="flex-1" />

                {/* Duration */}
                {corr.durationMs != null ? (
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-mono ${
                      corr.durationMs > 10000
                        ? 'bg-red-900/30 text-red-400'
                        : corr.durationMs > 3000
                          ? 'bg-amber-900/30 text-amber-400'
                          : 'bg-green-900/30 text-green-400'
                    }`}
                    data-testid="correlation-duration"
                  >
                    {formatDuration(corr.durationMs)}
                  </span>
                ) : (
                  <span
                    className="rounded bg-amber-900/30 px-1.5 py-0.5 text-xs text-amber-400"
                    data-testid="correlation-duration"
                  >
                    pending...
                  </span>
                )}

                {/* Orphaned badge */}
                {corr.isOrphaned && (
                  <span
                    className="rounded bg-amber-900/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-400"
                    data-testid="orphaned-badge"
                  >
                    Orphaned
                  </span>
                )}
              </div>

              {/* Timeline details */}
              <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500">
                <span title={formatFullTime(corr.startEvent.created_at)}>
                  Start: {formatReplayTime(corr.startEvent.created_at)}
                </span>
                {corr.endEvent && !corr.isOrphaned && (
                  <>
                    <span>→</span>
                    <span title={formatFullTime(corr.endEvent.created_at)}>
                      End: {formatReplayTime(corr.endEvent.created_at)}
                    </span>
                  </>
                )}
                {corr.sessionId && (
                  <span className="ml-auto truncate" title={corr.sessionId}>
                    Session: {corr.sessionId.slice(0, 8)}...
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
