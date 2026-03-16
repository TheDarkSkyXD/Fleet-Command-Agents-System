import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FiActivity,
  FiClock,
  FiCpu,
  FiEye,
  FiFilter,
  FiRefreshCw,
  FiSearch,
  FiShield,
  FiTerminal,
  FiTool,
  FiUsers,
  FiZap,
} from 'react-icons/fi';
import type { AgentCapability, AgentIdentity, AgentProcessInfo, AgentState, Session } from '../../../shared/types';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Tooltip } from '../../components/Tooltip';
import './AgentsPage.css';

// ── Role config ────────────────────────────────────────────────────

const ROLE_CONFIG: Record<string, { color: string; bg: string; border: string; icon: React.ReactNode }> = {
  scout:       { color: 'text-cyan-400',    bg: 'bg-cyan-500/10',    border: 'border-cyan-500/30',    icon: <FiSearch size={18} /> },
  builder:     { color: 'text-green-400',   bg: 'bg-green-500/10',   border: 'border-green-500/30',   icon: <FiTool size={18} /> },
  reviewer:    { color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   icon: <FiEye size={18} /> },
  lead:        { color: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/30',  icon: <FiUsers size={18} /> },
  merger:      { color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/30',    icon: <FiTerminal size={18} /> },
  coordinator: { color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/30',     icon: <FiCpu size={18} /> },
  monitor:     { color: 'text-teal-400',    bg: 'bg-teal-500/10',    border: 'border-teal-500/30',    icon: <FiShield size={18} /> },
};

const STATE_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  booting:   { label: 'Booting',   color: 'text-blue-400',    dot: 'bg-blue-400 animate-pulse' },
  working:   { label: 'Working',   color: 'text-emerald-400', dot: 'bg-emerald-400 animate-pulse' },
  completed: { label: 'Completed', color: 'text-slate-400',   dot: 'bg-slate-400' },
  stalled:   { label: 'Stalled',   color: 'text-amber-400',   dot: 'bg-amber-400' },
  zombie:    { label: 'Zombie',    color: 'text-red-400',     dot: 'bg-red-400' },
};

const ALL_CAPABILITIES: AgentCapability[] = ['scout', 'builder', 'reviewer', 'lead', 'merger', 'coordinator', 'monitor'];
const ALL_STATES: AgentState[] = ['booting', 'working', 'completed', 'stalled', 'zombie'];

// ── Aggregate type ─────────────────────────────────────────────────

interface AgentSummary {
  name: string;
  capability: AgentCapability;
  model: string | null;
  latestState: AgentState;
  latestSessionId: string;
  isRunning: boolean;
  pid: number | null;
  totalSessions: number;
  completedSessions: number;
  lastActive: string;
  worktreePath: string | null;
  branchName: string | null;
  depth: number;
  parentAgent: string | null;
  identity: AgentIdentity | null;
}

// ── Helpers ────────────────────────────────────────────────────────

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 0) return 'just now';
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── Component ──────────────────────────────────────────────────────

export function AgentsPage({ onSelectAgent }: { onSelectAgent?: (agentId: string) => void }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [runningProcesses, setRunningProcesses] = useState<AgentProcessInfo[]>([]);
  const [identities, setIdentities] = useState<AgentIdentity[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [capFilter, setCapFilter] = useState<AgentCapability | ''>('');
  const [stateFilter, setStateFilter] = useState<AgentState | ''>('');
  const [showFilters, setShowFilters] = useState(false);

  // ── Data loading ─────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      const [sessResult, runResult, idResult] = await Promise.all([
        window.electronAPI.agentList(),
        window.electronAPI.agentRunningList(),
        window.electronAPI.identityList(),
      ]);
      if (sessResult.data) setSessions(sessResult.data);
      if (runResult.data) setRunningProcesses(runResult.data);
      if (idResult.data) setIdentities(idResult.data);
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const unsub = window.electronAPI.onAgentUpdate(() => loadData());
    return () => { unsub(); };
  }, [loadData]);

  // ── Aggregate sessions by agent name ─────────────────────────────

  const agents: AgentSummary[] = useMemo(() => {
    const runningSet = new Set(runningProcesses.filter(p => p.isRunning).map(p => p.agentName));
    const identityMap = new Map(identities.map(id => [id.name, id]));

    const grouped = new Map<string, Session[]>();
    for (const s of sessions) {
      const list = grouped.get(s.agent_name) || [];
      list.push(s);
      grouped.set(s.agent_name, list);
    }

    const result: AgentSummary[] = [];
    for (const [name, agentSessions] of grouped) {
      // Sort by updated_at descending to get latest session first
      agentSessions.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
      const latest = agentSessions[0];
      const completed = agentSessions.filter(s => s.state === 'completed').length;

      result.push({
        name,
        capability: latest.capability,
        model: latest.model,
        latestState: latest.state,
        latestSessionId: latest.id,
        isRunning: runningSet.has(name),
        pid: latest.pid,
        totalSessions: agentSessions.length,
        completedSessions: completed,
        lastActive: latest.updated_at,
        worktreePath: latest.worktree_path,
        branchName: latest.branch_name,
        depth: latest.depth,
        parentAgent: latest.parent_agent,
        identity: identityMap.get(name) || null,
      });
    }

    // Sort: running first, then by last active
    result.sort((a, b) => {
      if (a.isRunning !== b.isRunning) return a.isRunning ? -1 : 1;
      const activeStates = ['booting', 'working'];
      const aActive = activeStates.includes(a.latestState);
      const bActive = activeStates.includes(b.latestState);
      if (aActive !== bActive) return aActive ? -1 : 1;
      return new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime();
    });

    return result;
  }, [sessions, runningProcesses, identities]);

  // ── Filtered list ────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return agents.filter(a => {
      if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (capFilter && a.capability !== capFilter) return false;
      if (stateFilter && a.latestState !== stateFilter) return false;
      return true;
    });
  }, [agents, search, capFilter, stateFilter]);

  // ── Stats ────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const running = agents.filter(a => a.isRunning || a.latestState === 'working' || a.latestState === 'booting').length;
    const completed = agents.filter(a => a.latestState === 'completed').length;
    const stalled = agents.filter(a => a.latestState === 'stalled' || a.latestState === 'zombie').length;
    return { total: agents.length, running, completed, stalled };
  }, [agents]);

  // ── Render ───────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/20">
            <FiUsers className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-50">Agents Directory</h1>
            <p className="text-sm text-slate-400">
              {stats.total} agent{stats.total !== 1 ? 's' : ''} registered
              {stats.running > 0 && <span className="text-emerald-400"> &middot; {stats.running} active</span>}
              {stats.stalled > 0 && <span className="text-amber-400"> &middot; {stats.stalled} needs attention</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip content="Refresh">
            <Button
              variant="outline"
              size="icon"
              onClick={() => { setLoading(true); loadData(); }}
              className="border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            >
              <FiRefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Total Agents" value={stats.total} icon={<FiUsers size={16} />} color="text-blue-400" bg="bg-blue-500/10" />
        <StatCard label="Active" value={stats.running} icon={<FiActivity size={16} />} color="text-emerald-400" bg="bg-emerald-500/10" />
        <StatCard label="Completed" value={stats.completed} icon={<FiClock size={16} />} color="text-slate-400" bg="bg-slate-500/10" />
        <StatCard label="Needs Attention" value={stats.stalled} icon={<FiZap size={16} />} color="text-amber-400" bg="bg-amber-500/10" />
      </div>

      {/* Search + Filters */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <FiSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <Input
            placeholder="Search agents by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-slate-800/50 border-slate-700 text-slate-200 placeholder:text-slate-500"
          />
        </div>
        <Tooltip content="Toggle filters">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowFilters(!showFilters)}
            className={`border-slate-700 ${showFilters ? 'bg-slate-700 text-slate-200' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
          >
            <FiFilter size={16} />
          </Button>
        </Tooltip>
      </div>

      {/* Filter pills */}
      {showFilters && (
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-medium">Role:</span>
            <button
              onClick={() => setCapFilter('')}
              className={`px-2 py-0.5 rounded-full transition-colors ${!capFilter ? 'bg-slate-600 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
            >
              All
            </button>
            {ALL_CAPABILITIES.map(cap => {
              const cfg = ROLE_CONFIG[cap];
              return (
                <button
                  key={cap}
                  onClick={() => setCapFilter(cap === capFilter ? '' : cap)}
                  className={`px-2 py-0.5 rounded-full capitalize transition-colors ${capFilter === cap ? `${cfg.bg} ${cfg.color}` : 'text-slate-400 hover:text-slate-200'}`}
                >
                  {cap}
                </button>
              );
            })}
          </div>
          <div className="w-px h-4 bg-slate-700" />
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-medium">State:</span>
            <button
              onClick={() => setStateFilter('')}
              className={`px-2 py-0.5 rounded-full transition-colors ${!stateFilter ? 'bg-slate-600 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
            >
              All
            </button>
            {ALL_STATES.map(st => {
              const cfg = STATE_CONFIG[st];
              return (
                <button
                  key={st}
                  onClick={() => setStateFilter(st === stateFilter ? '' : st)}
                  className={`px-2 py-0.5 rounded-full capitalize transition-colors ${stateFilter === st ? `${cfg.color}` : 'text-slate-400 hover:text-slate-200'}`}
                >
                  {st}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Agent cards grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 rounded-lg border border-slate-700/50 bg-slate-800/30 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FiUsers className="h-12 w-12 text-slate-600 mb-4" />
          <h2 className="text-lg font-medium text-slate-300 mb-2">
            {agents.length === 0 ? 'No Agents Yet' : 'No Matching Agents'}
          </h2>
          <p className="text-slate-500 max-w-md text-sm">
            {agents.length === 0
              ? 'Start a run from the Command Center to spawn agents. They will appear here as a roster.'
              : 'Try adjusting your search or filters to find agents.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(agent => (
            <AgentCard key={agent.name} agent={agent} onSelect={onSelectAgent} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Stat Card ──────────────────────────────────────────────────────

function StatCard({ label, value, icon, color, bg }: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  bg: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-700/50 bg-slate-800/30 px-4 py-3">
      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${bg}`}>
        <span className={color}>{icon}</span>
      </div>
      <div>
        <div className={`text-lg font-bold ${color}`}>{value}</div>
        <div className="text-xs text-slate-500">{label}</div>
      </div>
    </div>
  );
}

// ── Agent Card ─────────────────────────────────────────────────────

function AgentCard({ agent, onSelect }: { agent: AgentSummary; onSelect?: (id: string) => void }) {
  const roleCfg = ROLE_CONFIG[agent.capability] || ROLE_CONFIG.scout;
  const stateCfg = STATE_CONFIG[agent.latestState] || STATE_CONFIG.completed;
  const isActive = agent.isRunning || agent.latestState === 'working' || agent.latestState === 'booting';

  return (
    <button
      type="button"
      onClick={() => onSelect?.(agent.latestSessionId)}
      className={`w-full text-left rounded-lg border p-4 transition-all duration-150 cursor-pointer hover:border-slate-500 ${
        isActive
          ? `${roleCfg.border} ${roleCfg.bg}`
          : 'border-slate-700/50 bg-slate-800/30 hover:bg-slate-800/50'
      }`}
    >
      {/* Top row: icon + name + state */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`shrink-0 ${roleCfg.color}`}>{roleCfg.icon}</span>
          <span className="font-semibold text-slate-100 truncate">{agent.name}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          <span className={`h-2 w-2 rounded-full ${stateCfg.dot}`} />
          <span className={`text-xs font-medium ${stateCfg.color}`}>{stateCfg.label}</span>
        </div>
      </div>

      {/* Role + model */}
      <div className="flex items-center gap-2 mb-3">
        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 capitalize ${roleCfg.color} ${roleCfg.border}`}>
          {agent.capability}
        </Badge>
        {agent.model && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-slate-400 border-slate-600">
            {agent.model}
          </Badge>
        )}
        {agent.parentAgent && (
          <span className="text-[10px] text-slate-500 truncate" title={`Parent: ${agent.parentAgent}`}>
            &larr; {agent.parentAgent}
          </span>
        )}
      </div>

      {/* Stats row */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <div className="flex items-center gap-3">
          <span title="Total sessions">
            {agent.totalSessions} session{agent.totalSessions !== 1 ? 's' : ''}
          </span>
          {agent.totalSessions > 0 && (
            <span title="Completion rate" className={agent.completedSessions === agent.totalSessions ? 'text-emerald-400' : ''}>
              {Math.round((agent.completedSessions / agent.totalSessions) * 100)}% done
            </span>
          )}
        </div>
        <span className="text-slate-600" title={new Date(agent.lastActive).toLocaleString()}>
          {formatRelativeTime(agent.lastActive)}
        </span>
      </div>

      {/* Branch info */}
      {agent.branchName && (
        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500 truncate">
          <span className="text-slate-600">&rarr;</span>
          <span className="font-mono truncate">{agent.branchName}</span>
        </div>
      )}
    </button>
  );
}
