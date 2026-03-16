import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FiActivity,
  FiClock,
  FiFilter,
  FiLink,
  FiRefreshCw,
  FiX,
} from 'react-icons/fi';
import type { Event, Run } from '../../../shared/types';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { SlidePanel } from '../../components/SlidePanel';
import { Tooltip } from '../../components/Tooltip';
import {
  AGENT_COLORS,
  ALL_EVENT_TYPES,
  CorrelationView,
  EVENT_TYPE_CONFIG,
  FeedView,
  ReplayView,
  type ToolCorrelation,
  type ViewTab,
} from './components';
import './EventFeedPage.css';

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
          <Badge variant="secondary" className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs text-slate-400">
            {events.length} events
          </Badge>
          {autoRefresh && activeTab === 'feed' && (
            <Badge variant="outline" className="flex items-center gap-1 rounded-full bg-green-900/30 px-2.5 py-0.5 text-xs text-green-400 border-0">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
              Live
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Auto-refresh toggle */}
          <Button
            variant={autoRefresh ? 'outline' : 'outline'}
            size="sm"
            onClick={() => setAutoRefresh((v) => !v)}
            className={`flex items-center gap-1 ${
              autoRefresh
                ? 'border-green-700 bg-green-900/20 text-green-400 hover:bg-green-900/30'
                : 'border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
            title={autoRefresh ? 'Pause live updates' : 'Resume live updates'}
          >
            <FiActivity size={14} className={autoRefresh ? 'animate-pulse' : ''} />
            {autoRefresh ? 'Live' : 'Paused'}
          </Button>

          {/* Manual refresh */}
          <Tooltip content="Refresh events">
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                setLoading(true);
                loadEvents();
              }}
              className="border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            >
              <FiRefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </Button>
          </Tooltip>

          {/* Filter toggle */}
          <Tooltip content="Toggle filters">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowFilters((v) => !v)}
              className={`flex items-center gap-1 ${
                showFilters || activeFilterCount > 0
                  ? 'border-blue-700 bg-blue-900/20 text-blue-400'
                  : 'border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <FiFilter size={14} />
              {activeFilterCount > 0 && (
                <Badge className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white border-0 px-1 py-0">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v: string) => setActiveTab(v as ViewTab)} className="mb-3">
        <TabsList className="bg-transparent border-b border-slate-800 rounded-none h-auto p-0 gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                data-testid={`event-tab-${tab.id}`}
                className="flex items-center gap-1.5 rounded-t-lg rounded-b-none border-b-2 border-transparent px-3 py-2 text-sm text-slate-400 shadow-none data-[state=active]:border-blue-500 data-[state=active]:bg-slate-800/50 data-[state=active]:text-blue-400 data-[state=active]:shadow-none hover:bg-slate-800/30 hover:text-slate-300"
              >
                <Icon size={14} />
                {tab.label}
                {tab.id === 'correlation' && orphanedCount > 0 && (
                  <Badge className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-600 text-[10px] font-bold text-white border-0 px-1 py-0">
                    {orphanedCount}
                  </Badge>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {/* Filters bar */}
      <SlidePanel isOpen={showFilters} direction="top">
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-slate-700 bg-slate-900 p-3">
          {/* Event type filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Type:</span>
            <Select
              value={filterType || '__all__'}
              onValueChange={(v) => setFilterType(v === '__all__' ? '' : v)}
              aria-label="Filter by event type"
            >
              <SelectTrigger className="w-auto h-8 border-slate-700 bg-slate-800 text-xs text-slate-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All types</SelectItem>
                {ALL_EVENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {EVENT_TYPE_CONFIG[t].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Agent filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Agent:</span>
            <Select
              value={filterAgent || '__all__'}
              onValueChange={(v) => setFilterAgent(v === '__all__' ? '' : v)}
              aria-label="Filter by agent"
            >
              <SelectTrigger className="w-auto h-8 border-slate-700 bg-slate-800 text-xs text-slate-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All agents</SelectItem>
                {uniqueAgents.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Run filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Run:</span>
            <Select
              value={filterRunId || '__all__'}
              onValueChange={(v) => setFilterRunId(v === '__all__' ? '' : v)}
              aria-label="Filter by run ID"
            >
              <SelectTrigger className="w-auto h-8 border-slate-700 bg-slate-800 text-xs text-slate-200" data-testid="event-filter-run">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All runs</SelectItem>
                {runs.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.id.slice(0, 8)}… ({r.status}{r.agent_count ? `, ${r.agent_count} agents` : ''})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Limit */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Show:</span>
            <Select
              value={String(eventLimit)}
              onValueChange={(v) => setEventLimit(Number(v))}
              aria-label="Number of events to show"
            >
              <SelectTrigger className="w-auto h-8 border-slate-700 bg-slate-800 text-xs text-slate-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="250">250</SelectItem>
                <SelectItem value="500">500</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Clear filters */}
          {activeFilterCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFilterType('');
                setFilterAgent('');
                setFilterRunId('');
              }}
              className="flex items-center gap-1 border-slate-700 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            >
              <FiX size={12} />
              Clear
            </Button>
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
