import { useCallback, useEffect, useState } from 'react';
import {
  FiActivity,
  FiAlertTriangle,
  FiArrowLeft,
  FiAward,
  FiBookOpen,
  FiCalendar,
  FiCheckCircle,
  FiClock,
  FiCpu,
  FiFile,
  FiHash,
  FiInbox,
  FiLayers,
  FiLoader,
  FiMail,
  FiSend,
  FiSquare,
  FiTerminal,
  FiTool,
  FiUser,
  FiZap,
} from 'react-icons/fi';
import type {
  AgentIdentity,
  AgentProcessInfo,
  Event,
  Message,
  Session,
} from '../../shared/types';
import { AgentTerminal } from '../components/AgentTerminal';

const CAPABILITY_COLORS: Record<string, string> = {
  scout: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  builder: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  reviewer: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  lead: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  merger: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  coordinator: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  monitor: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
};

const CAPABILITY_ACCENT: Record<string, string> = {
  scout: 'from-purple-500 to-purple-700',
  builder: 'from-blue-500 to-blue-700',
  reviewer: 'from-cyan-500 to-cyan-700',
  lead: 'from-amber-500 to-amber-700',
  merger: 'from-emerald-500 to-emerald-700',
  coordinator: 'from-rose-500 to-rose-700',
  monitor: 'from-teal-500 to-teal-700',
};

const CAPABILITY_ICON_BG: Record<string, string> = {
  scout: 'bg-purple-500/30 text-purple-300',
  builder: 'bg-blue-500/30 text-blue-300',
  reviewer: 'bg-cyan-500/30 text-cyan-300',
  lead: 'bg-amber-500/30 text-amber-300',
  merger: 'bg-emerald-500/30 text-emerald-300',
  coordinator: 'bg-rose-500/30 text-rose-300',
  monitor: 'bg-teal-500/30 text-teal-300',
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

/** State-specific icons for visual distinction */
const STATE_ICONS: Record<string, { icon: React.ReactNode; className: string }> = {
  booting: { icon: <FiLoader className="h-3.5 w-3.5 animate-spin" />, className: 'text-blue-400' },
  working: {
    icon: <FiActivity className="h-3.5 w-3.5" />,
    className: 'text-green-400 animate-pulse',
  },
  completed: { icon: <FiCheckCircle className="h-3.5 w-3.5" />, className: 'text-slate-400' },
  stalled: { icon: <FiAlertTriangle className="h-3.5 w-3.5" />, className: 'text-amber-400' },
  zombie: { icon: <FiZap className="h-3.5 w-3.5" />, className: 'text-red-400 animate-pulse' },
};

type DetailTab = 'terminal' | 'logs' | 'identity' | 'files' | 'mail';

const TABS: { id: DetailTab; label: string; icon: React.ReactNode }[] = [
  { id: 'terminal', label: 'Terminal', icon: <FiTerminal className="h-4 w-4" /> },
  { id: 'logs', label: 'Logs', icon: <FiFile className="h-4 w-4" /> },
  { id: 'identity', label: 'Identity/CV', icon: <FiUser className="h-4 w-4" /> },
  { id: 'files', label: 'Files Changed', icon: <FiHash className="h-4 w-4" /> },
  { id: 'mail', label: 'Mail', icon: <FiMail className="h-4 w-4" /> },
];

function formatUptime(createdAt: string): string {
  const uptime = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = uptime % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ── Agent CV Profile Card ──────────────────────────────────────

interface AgentCVCardProps {
  agentName: string;
  currentSession: Session;
}

function AgentCVCard({ agentName, currentSession }: AgentCVCardProps) {
  const [identity, setIdentity] = useState<AgentIdentity | null>(null);
  const [sessionHistory, setSessionHistory] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [identityRes, sessionsRes] = await Promise.all([
          window.electronAPI.identityGet(agentName),
          window.electronAPI.identitySessions(agentName),
        ]);
        if (identityRes.data) setIdentity(identityRes.data);
        if (sessionsRes.data) setSessionHistory(sessionsRes.data);
      } catch {
        // Identity may not exist yet
      }
      setLoading(false);
    }
    load();
  }, [agentName]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  const capability = identity?.capability || currentSession.capability;
  const sessionsCompleted = identity?.sessions_completed ?? 0;
  const accentGradient = CAPABILITY_ACCENT[capability] || 'from-slate-500 to-slate-700';
  const iconBg = CAPABILITY_ICON_BG[capability] || 'bg-slate-500/30 text-slate-300';

  let expertiseDomains: string[] = [];
  try {
    expertiseDomains = JSON.parse(identity?.expertise_domains || '[]');
  } catch {
    expertiseDomains = [];
  }

  let recentTasks: string[] = [];
  try {
    recentTasks = JSON.parse(identity?.recent_tasks || '[]');
  } catch {
    recentTasks = [];
  }

  const memberSince = identity?.created_at || currentSession.created_at;

  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Profile Card Header */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/80 overflow-hidden">
          {/* Gradient banner */}
          <div className={`h-20 bg-gradient-to-r ${accentGradient} relative`}>
            <div className="absolute -bottom-8 left-6">
              <div
                className={`h-16 w-16 rounded-xl ${iconBg} flex items-center justify-center border-4 border-slate-800`}
              >
                <FiUser className="h-8 w-8" />
              </div>
            </div>
          </div>

          <div className="pt-10 px-6 pb-6">
            {/* Name and capability */}
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-50">{agentName}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${CAPABILITY_COLORS[capability] || 'bg-slate-500/20 text-slate-400'}`}
                  >
                    {capability.charAt(0).toUpperCase() + capability.slice(1)}
                  </span>
                  <span className="text-xs text-slate-500 flex items-center gap-1">
                    <FiCalendar className="h-3 w-3" />
                    Since {formatDate(memberSince)}
                  </span>
                </div>
              </div>
              {/* Session count badge */}
              <div className="flex flex-col items-center bg-slate-700/50 rounded-lg px-4 py-2">
                <span className="text-2xl font-bold text-slate-100">{sessionsCompleted}</span>
                <span className="text-xs text-slate-400">Sessions</span>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-4 flex flex-col items-center">
            <FiCheckCircle className="h-5 w-5 text-green-400 mb-1" />
            <span className="text-lg font-bold text-slate-100">{sessionsCompleted}</span>
            <span className="text-xs text-slate-400">Completed</span>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-4 flex flex-col items-center">
            <FiLayers className="h-5 w-5 text-blue-400 mb-1" />
            <span className="text-lg font-bold text-slate-100">{expertiseDomains.length}</span>
            <span className="text-xs text-slate-400">Domains</span>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-4 flex flex-col items-center">
            <FiBookOpen className="h-5 w-5 text-amber-400 mb-1" />
            <span className="text-lg font-bold text-slate-100">{recentTasks.length}</span>
            <span className="text-xs text-slate-400">Recent Tasks</span>
          </div>
        </div>

        {/* Expertise Domains */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-5">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
            <FiAward className="h-4 w-4 text-amber-400" />
            Expertise Domains
          </h3>
          {expertiseDomains.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {expertiseDomains.map((domain) => (
                <span
                  key={domain}
                  className="inline-flex items-center rounded-md bg-slate-700/70 px-2.5 py-1 text-xs font-medium text-slate-300 border border-slate-600/50"
                >
                  {domain}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500 italic">
              No expertise domains recorded yet. Domains are added as the agent works on tasks.
            </p>
          )}
        </div>

        {/* Recent Tasks */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-5">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
            <FiZap className="h-4 w-4 text-blue-400" />
            Recent Tasks
          </h3>
          {recentTasks.length > 0 ? (
            <div className="space-y-2">
              {recentTasks.map((task, idx) => (
                <div
                  key={`${task}-${idx}`}
                  className="flex items-center gap-2 rounded-md bg-slate-700/40 px-3 py-2 text-sm text-slate-300 font-mono"
                >
                  <FiHash className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
                  {task}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500 italic">
              No tasks recorded yet. Tasks are tracked when sessions complete.
            </p>
          )}
        </div>

        {/* Session History */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-5">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
            <FiClock className="h-4 w-4 text-cyan-400" />
            Session History
          </h3>
          {sessionHistory.length > 0 ? (
            <div className="space-y-2">
              {sessionHistory.slice(0, 10).map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-md bg-slate-700/40 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`h-2 w-2 rounded-full ${STATE_DOT_COLORS[s.state] || 'bg-slate-400'}`}
                    />
                    <span className="text-sm text-slate-300 font-mono">{s.id.slice(0, 12)}...</span>
                    <span
                      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${STATE_COLORS[s.state] || ''}`}
                    >
                      {s.state}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    {s.task_id && <span>Task: {s.task_id}</span>}
                    <span>{formatDate(s.created_at)}</span>
                  </div>
                </div>
              ))}
              {sessionHistory.length > 10 && (
                <p className="text-xs text-slate-500 text-center pt-1">
                  and {sessionHistory.length - 10} more sessions...
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500 italic">
              No previous sessions found for this agent.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Event Type Styling ─────────────────────────────────────────

const EVENT_TYPE_STYLES: Record<string, { bg: string; icon: React.ReactNode }> = {
  tool_start: {
    bg: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    icon: <FiTool className="h-3.5 w-3.5" />,
  },
  tool_end: {
    bg: 'bg-green-500/15 text-green-400 border-green-500/30',
    icon: <FiCheckCircle className="h-3.5 w-3.5" />,
  },
  session_start: {
    bg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    icon: <FiActivity className="h-3.5 w-3.5" />,
  },
  session_end: {
    bg: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
    icon: <FiSquare className="h-3.5 w-3.5" />,
  },
  spawn: {
    bg: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    icon: <FiZap className="h-3.5 w-3.5" />,
  },
  error: {
    bg: 'bg-red-500/15 text-red-400 border-red-500/30',
    icon: <FiAlertTriangle className="h-3.5 w-3.5" />,
  },
  mail_sent: {
    bg: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
    icon: <FiSend className="h-3.5 w-3.5" />,
  },
  mail_received: {
    bg: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    icon: <FiInbox className="h-3.5 w-3.5" />,
  },
  custom: {
    bg: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
    icon: <FiHash className="h-3.5 w-3.5" />,
  },
};

const LOG_LEVEL_COLORS: Record<string, string> = {
  debug: 'text-slate-500',
  info: 'text-slate-300',
  warn: 'text-amber-400',
  error: 'text-red-400',
};

// ── Agent Logs Tab ────────────────────────────────────────────

function AgentLogsTab({ agentName }: { agentName: string }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const result = await window.electronAPI.eventList({
          agentName,
          limit: 200,
        });
        if (result.data) setEvents(result.data);
      } catch {
        // Events may not exist
      }
      setLoading(false);
    }
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [agentName]);

  const filteredEvents = filter === 'all' ? events : events.filter((e) => e.event_type === filter);

  if (loading && events.length === 0) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-4 h-full overflow-y-auto space-y-3">
      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {['all', 'tool_start', 'tool_end', 'spawn', 'error', 'session_start', 'session_end'].map(
          (f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                filter === f
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                  : 'bg-slate-700/50 text-slate-400 border border-slate-600/30 hover:bg-slate-700'
              }`}
            >
              {f === 'all' ? 'All' : f.replace('_', ' ')}
            </button>
          ),
        )}
      </div>

      {/* Events list */}
      {filteredEvents.length === 0 ? (
        <div className="text-center py-8 text-slate-500">
          <FiFile className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No log entries found for this agent</p>
        </div>
      ) : (
        <div className="space-y-1">
          {filteredEvents.map((event) => {
            const style = EVENT_TYPE_STYLES[event.event_type] || EVENT_TYPE_STYLES.custom;
            const levelColor = LOG_LEVEL_COLORS[event.level] || 'text-slate-300';
            return (
              <div
                key={event.id}
                className="flex items-start gap-3 rounded-md bg-slate-800/60 border border-slate-700/50 px-3 py-2 text-sm"
              >
                <div className={`mt-0.5 ${style.bg} rounded p-1`}>{style.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-medium ${levelColor}`}>
                      {event.event_type.replace('_', ' ')}
                    </span>
                    {event.tool_name && (
                      <span className="text-xs text-slate-400 font-mono bg-slate-700/50 rounded px-1.5 py-0.5">
                        {event.tool_name}
                      </span>
                    )}
                    {event.tool_duration_ms != null && (
                      <span className="text-xs text-slate-500">{event.tool_duration_ms}ms</span>
                    )}
                  </div>
                  {event.data && (
                    <p className="text-xs text-slate-500 mt-0.5 truncate max-w-lg">{event.data}</p>
                  )}
                </div>
                <span className="text-xs text-slate-600 whitespace-nowrap flex-shrink-0">
                  {new Date(event.created_at).toLocaleTimeString()}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Files Changed Tab ─────────────────────────────────────────

function AgentFilesTab({ session }: { session: Session }) {
  const fileScope = (() => {
    try {
      return JSON.parse(session.file_scope || '[]') as string[];
    } catch {
      return [];
    }
  })();

  return (
    <div className="p-4 h-full overflow-y-auto">
      <div className="space-y-4">
        {/* File scope section */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-5">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
            <FiFile className="h-4 w-4 text-blue-400" />
            Assigned File Scope
          </h3>
          {fileScope.length > 0 ? (
            <div className="space-y-1">
              {fileScope.map((file) => (
                <div
                  key={file}
                  className="flex items-center gap-2 rounded-md bg-slate-700/40 px-3 py-2 text-sm font-mono text-slate-300"
                >
                  <FiFile className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
                  {file}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500 italic">
              No file scope assigned. This agent can modify any files.
            </p>
          )}
        </div>

        {/* Worktree info */}
        {session.worktree_path && (
          <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-5">
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
              <FiHash className="h-4 w-4 text-emerald-400" />
              Worktree
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Path:</span>
                <span className="font-mono text-slate-300">{session.worktree_path}</span>
              </div>
              {session.branch_name && (
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">Branch:</span>
                  <span className="font-mono text-emerald-400">{session.branch_name}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Mail Tab ──────────────────────────────────────────────────

const MAIL_TYPE_COLORS: Record<string, string> = {
  status: 'bg-blue-500/15 text-blue-400',
  question: 'bg-purple-500/15 text-purple-400',
  result: 'bg-green-500/15 text-green-400',
  error: 'bg-red-500/15 text-red-400',
  worker_done: 'bg-emerald-500/15 text-emerald-400',
  merge_ready: 'bg-cyan-500/15 text-cyan-400',
  merged: 'bg-teal-500/15 text-teal-400',
  merge_failed: 'bg-rose-500/15 text-rose-400',
  escalation: 'bg-amber-500/15 text-amber-400',
  health_check: 'bg-indigo-500/15 text-indigo-400',
  dispatch: 'bg-violet-500/15 text-violet-400',
  assign: 'bg-orange-500/15 text-orange-400',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'text-slate-500',
  normal: 'text-slate-400',
  high: 'text-amber-400',
  urgent: 'text-red-400 font-semibold',
};

function AgentMailTab({ agentName }: { agentName: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const result = await window.electronAPI.mailList({ agent: agentName });
        if (result.data) setMessages(result.data);
      } catch {
        // Mail may not exist
      }
      setLoading(false);
    }
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [agentName]);

  if (loading && messages.length === 0) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-4 h-full overflow-y-auto">
      {messages.length === 0 ? (
        <div className="text-center py-8 text-slate-500">
          <FiMail className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No mail messages for this agent</p>
        </div>
      ) : (
        <div className="space-y-2">
          {messages.map((msg) => {
            const isExpanded = expandedId === msg.id;
            const isSender = msg.from_agent === agentName;
            return (
              <div
                key={msg.id}
                className="rounded-lg border border-slate-700/50 bg-slate-800/60 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : msg.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-800 transition-colors"
                >
                  {isSender ? (
                    <FiSend className="h-4 w-4 text-cyan-400 flex-shrink-0" />
                  ) : (
                    <FiInbox className="h-4 w-4 text-amber-400 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-200 truncate">
                        {msg.subject || '(no subject)'}
                      </span>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${MAIL_TYPE_COLORS[msg.type] || 'bg-slate-500/15 text-slate-400'}`}
                      >
                        {msg.type}
                      </span>
                      {msg.priority !== 'normal' && (
                        <span className={`text-xs ${PRIORITY_COLORS[msg.priority]}`}>
                          {msg.priority}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {isSender ? `To: ${msg.to_agent}` : `From: ${msg.from_agent}`}
                      {' · '}
                      {new Date(msg.created_at).toLocaleString()}
                    </div>
                  </div>
                  {!msg.read && !isSender && (
                    <div className="h-2 w-2 rounded-full bg-blue-400 flex-shrink-0" />
                  )}
                </button>
                {isExpanded && msg.body && (
                  <div className="px-4 pb-3 border-t border-slate-700/50">
                    <pre className="text-sm text-slate-300 whitespace-pre-wrap mt-2 font-mono bg-slate-900/50 rounded-md p-3">
                      {msg.body}
                    </pre>
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

// ── Main Component ─────────────────────────────────────────────

interface AgentDetailPageProps {
  agentId: string;
  onBack: () => void;
}

export function AgentDetailPage({ agentId, onBack }: AgentDetailPageProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [processInfo, setProcessInfo] = useState<AgentProcessInfo | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('terminal');
  const [error, setError] = useState<string | null>(null);

  const loadSession = useCallback(async () => {
    try {
      const result = await window.electronAPI.agentDetail(agentId);
      if (result.data) {
        setSession(result.data);
      } else if (result.error) {
        setError(result.error);
      }
    } catch (err) {
      setError(String(err));
    }
  }, [agentId]);

  const loadProcessInfo = useCallback(async () => {
    try {
      const result = await window.electronAPI.agentProcessInfo(agentId);
      if (result.data) {
        setProcessInfo(result.data);
      }
    } catch {
      // Process may not be running
    }
  }, [agentId]);

  // Load data and poll
  useEffect(() => {
    loadSession();
    loadProcessInfo();

    const interval = setInterval(() => {
      loadSession();
      loadProcessInfo();
    }, 3000);

    return () => clearInterval(interval);
  }, [loadSession, loadProcessInfo]);

  const handleStop = async () => {
    try {
      await window.electronAPI.agentStop(agentId);
      await loadSession();
      await loadProcessInfo();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleNudge = async () => {
    try {
      await window.electronAPI.agentNudge(agentId);
      await loadSession();
    } catch (err) {
      setError(String(err));
    }
  };

  if (error && !session) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          <FiArrowLeft className="h-4 w-4" />
          Back to Agents
        </button>
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-400">
          {error}
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          <FiArrowLeft className="h-4 w-4" />
          Back to Agents
        </button>
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      </div>
    );
  }

  const isRunning = session.state !== 'completed' && (processInfo?.isRunning ?? false);

  return (
    <div className="flex flex-col h-full" style={{ height: 'calc(100vh - 96px)' }}>
      {/* Header */}
      <div className="flex-shrink-0 space-y-3 pb-4">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          <FiArrowLeft className="h-4 w-4" />
          Back to Agents
        </button>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* State indicator with icon */}
            <div
              className={`flex items-center ${STATE_ICONS[session.state]?.className || 'text-slate-400'}`}
            >
              {STATE_ICONS[session.state]?.icon || (
                <div
                  className={`h-3 w-3 rounded-full ${STATE_DOT_COLORS[session.state] || 'bg-slate-400'}`}
                />
              )}
            </div>

            {/* Agent name */}
            <h1 className="text-xl font-bold text-slate-50">{session.agent_name}</h1>

            {/* Capability badge */}
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${CAPABILITY_COLORS[session.capability] || 'bg-slate-500/20 text-slate-400'}`}
            >
              {session.capability}
            </span>

            {/* State badge with icon */}
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${STATE_COLORS[session.state] || ''}`}
            >
              {STATE_ICONS[session.state]?.icon}
              {session.state}
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {session.state === 'stalled' && (
              <button
                type="button"
                onClick={handleNudge}
                className="flex items-center gap-2 rounded-md bg-amber-600/20 border border-amber-500/30 px-3 py-1.5 text-sm text-amber-400 hover:bg-amber-600/30 transition-colors"
              >
                <FiZap className="h-3.5 w-3.5" />
                Nudge
              </button>
            )}
            {isRunning && (
              <button
                type="button"
                onClick={handleStop}
                className="flex items-center gap-2 rounded-md bg-red-600/20 border border-red-500/30 px-3 py-1.5 text-sm text-red-400 hover:bg-red-600/30 transition-colors"
              >
                <FiSquare className="h-3.5 w-3.5" />
                Stop
              </button>
            )}
          </div>
        </div>

        {/* Info bar */}
        <div className="flex items-center gap-4 text-xs text-slate-500">
          {(session.pid || processInfo?.pid) && (
            <span className="flex items-center gap-1 font-mono">
              <FiCpu className="h-3 w-3" />
              PID: {session.pid || processInfo?.pid}
            </span>
          )}
          <span className="flex items-center gap-1">
            <FiClock className="h-3 w-3" />
            {formatUptime(session.created_at)}
          </span>
          {processInfo?.model && (
            <span className="flex items-center gap-1">
              <FiZap className="h-3 w-3" />
              {processInfo.model}
            </span>
          )}
          {session.task_id && (
            <span className="flex items-center gap-1">Task: {session.task_id}</span>
          )}
          {session.branch_name && (
            <span className="flex items-center gap-1">Branch: {session.branch_name}</span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 flex border-b border-slate-700 gap-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${
              activeTab === tab.id
                ? 'text-blue-400 border-blue-400 bg-blue-500/5'
                : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'terminal' && <AgentTerminal agentId={agentId} isRunning={isRunning} />}
        {activeTab === 'logs' && <AgentLogsTab agentName={session.agent_name} />}
        {activeTab === 'identity' && (
          <AgentCVCard agentName={session.agent_name} currentSession={session} />
        )}
        {activeTab === 'files' && <AgentFilesTab session={session} />}
        {activeTab === 'mail' && <AgentMailTab agentName={session.agent_name} />}
      </div>
    </div>
  );
}
