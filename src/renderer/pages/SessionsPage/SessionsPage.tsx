import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FiActivity,
  FiClock,
  FiCpu,
  FiLayers,
  FiRefreshCw,
  FiZap,
} from 'react-icons/fi';
import type { Session, AgentState, AgentCapability, Checkpoint, SessionHandoff } from '../../../shared/types';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Separator } from '../../components/ui/separator';
import { SessionCard, SessionDetail, SessionFilters } from './components';

export function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<Checkpoint | null>(null);
  const [selectedHandoffs, setSelectedHandoffs] = useState<SessionHandoff[]>([]);

  // Filters
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<AgentState | 'all'>('all');
  const [capabilityFilter, setCapabilityFilter] = useState<AgentCapability | 'all'>('all');

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await window.electronAPI.agentList();
      if (result.data) {
        setSessions(result.data);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Listen for agent state changes
  useEffect(() => {
    const unsub = window.electronAPI.onAgentUpdate(() => {
      loadSessions();
    });
    return () => { unsub(); };
  }, [loadSessions]);

  // Load checkpoint and handoffs when session is selected
  useEffect(() => {
    if (!selectedSession) {
      setSelectedCheckpoint(null);
      setSelectedHandoffs([]);
      return;
    }
    (async () => {
      // Try to find a checkpoint for this agent
      try {
        const cpResult = await window.electronAPI.checkpointList();
        if (cpResult.data) {
          const cp = cpResult.data.find((c) => c.agent_name === selectedSession.agent_name);
          setSelectedCheckpoint(cp || null);
        }
      } catch {
        setSelectedCheckpoint(null);
      }
      // Load handoffs
      try {
        const hResult = await window.electronAPI.sessionHandoffBySession(selectedSession.id);
        if (hResult.data) {
          setSelectedHandoffs(Array.isArray(hResult.data) ? hResult.data : [hResult.data]);
        } else {
          setSelectedHandoffs([]);
        }
      } catch {
        setSelectedHandoffs([]);
      }
    })();
  }, [selectedSession]);

  // Filtered sessions
  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (stateFilter !== 'all' && s.state !== stateFilter) return false;
      if (capabilityFilter !== 'all' && s.capability !== capabilityFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const searchable = [
          s.agent_name,
          s.task_id,
          s.branch_name,
          s.model,
          s.parent_agent,
          s.run_id,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      return true;
    });
  }, [sessions, stateFilter, capabilityFilter, search]);

  // Summary stats
  const stats = useMemo(() => {
    const active = sessions.filter((s) => s.state === 'working' || s.state === 'booting').length;
    const completed = sessions.filter((s) => s.state === 'completed').length;
    const stalled = sessions.filter((s) => s.state === 'stalled' || s.state === 'zombie').length;
    const uniqueRuns = new Set(sessions.filter((s) => s.run_id).map((s) => s.run_id)).size;
    return { total: sessions.length, active, completed, stalled, uniqueRuns };
  }, [sessions]);

  return (
    <div className="space-y-6" data-testid="sessions-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-50 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600/15 text-indigo-400">
              <FiLayers size={18} />
            </div>
            Sessions
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Browse all agent sessions — active, completed, and historical
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={loadSessions}
          disabled={isLoading}
          className="text-slate-400 hover:text-slate-200 h-8 gap-1.5"
        >
          <FiRefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
          Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-5 gap-3">
        <SummaryCard label="Total Sessions" value={stats.total} icon={FiLayers} color="text-slate-300" />
        <SummaryCard label="Active" value={stats.active} icon={FiZap} color="text-emerald-400" />
        <SummaryCard label="Completed" value={stats.completed} icon={FiActivity} color="text-blue-400" />
        <SummaryCard label="Stalled / Zombie" value={stats.stalled} icon={FiClock} color="text-amber-400" />
        <SummaryCard label="Unique Runs" value={stats.uniqueRuns} icon={FiCpu} color="text-purple-400" />
      </div>

      <Separator className="bg-slate-800" />

      {/* Filters */}
      <SessionFilters
        search={search}
        onSearchChange={setSearch}
        stateFilter={stateFilter}
        onStateFilterChange={setStateFilter}
        capabilityFilter={capabilityFilter}
        onCapabilityFilterChange={setCapabilityFilter}
        totalCount={sessions.length}
        filteredCount={filteredSessions.length}
      />

      {/* Content */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <FiRefreshCw size={32} className="mb-3 animate-spin opacity-50" />
          <p className="text-sm">Loading sessions...</p>
        </div>
      ) : filteredSessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <FiLayers size={40} className="mb-3 opacity-40" />
          <p className="text-lg font-medium">
            {sessions.length === 0 ? 'No sessions yet' : 'No sessions match your filters'}
          </p>
          <p className="text-sm mt-1">
            {sessions.length === 0
              ? 'Sessions will appear here when agents are spawned'
              : 'Try adjusting your search or filters'}
          </p>
        </div>
      ) : (
        <div className="flex gap-5">
          {/* Session list */}
          <div className="flex-1 min-w-0 space-y-2">
            {filteredSessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                isSelected={selectedSession?.id === session.id}
                onSelect={(s) => setSelectedSession(selectedSession?.id === s.id ? null : s)}
              />
            ))}
          </div>

          {/* Detail panel */}
          {selectedSession && (
            <SessionDetail
              session={selectedSession}
              checkpoint={selectedCheckpoint}
              handoffs={selectedHandoffs}
              onClose={() => setSelectedSession(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string;
}) {
  return (
    <Card className="border-slate-700/50 bg-slate-800/40">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">{label}</span>
          <Icon size={14} className={color} />
        </div>
        <span className={`text-2xl font-bold ${color}`}>{value}</span>
      </CardContent>
    </Card>
  );
}
