import { useEffect, useState } from 'react';
import {
  FiAward,
  FiBookOpen,
  FiCalendar,
  FiCheckCircle,
  FiClock,
  FiHash,
  FiLayers,
  FiUser,
  FiZap,
} from 'react-icons/fi';
import type { AgentIdentity, Session } from '../../../../shared/types';
import { Badge } from '../../../components/ui/badge';
import { Card, CardContent } from '../../../components/ui/card';
import { formatDateTime } from '../../../lib/dateFormatting';
import {
  CAPABILITY_ACCENT,
  CAPABILITY_COLORS,
  CAPABILITY_ICON_BG,
  CAPABILITY_TOOLTIPS,
  STATE_COLORS,
  STATE_DOT_COLORS,
  STATE_TOOLTIPS,
} from './constants';

interface AgentCVCardProps {
  agentName: string;
  currentSession: Session;
}

export function AgentCVCard({ agentName, currentSession }: AgentCVCardProps) {
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
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Profile Card Header */}
        <Card className="border-slate-700 bg-slate-800/80 overflow-hidden p-0">
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

          <CardContent className="pt-10 px-6 pb-6">
            {/* Name and capability */}
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-50">{agentName}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <Badge
                    variant="outline"
                    className={CAPABILITY_COLORS[capability] || 'bg-slate-500/20 text-slate-400'}
                    title={CAPABILITY_TOOLTIPS[capability] || capability}
                  >
                    {capability.charAt(0).toUpperCase() + capability.slice(1)}
                  </Badge>
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <FiCalendar className="h-3 w-3" />
                    <span data-testid="agent-created-at" data-created-at={memberSince}>Since {formatDateTime(memberSince)}</span>
                  </span>
                </div>
              </div>
              {/* Session count badge */}
              <div className="flex flex-col items-center bg-slate-700/50 rounded-lg px-4 py-2">
                <span className="text-2xl font-bold text-slate-100">{sessionsCompleted}</span>
                <span className="text-xs text-slate-400">Sessions</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="border-slate-700 bg-slate-800/60 p-4 flex flex-col items-center">
            <FiCheckCircle className="h-5 w-5 text-green-400 mb-1" />
            <span className="text-lg font-bold text-slate-100">{sessionsCompleted}</span>
            <span className="text-xs text-slate-400">Completed</span>
          </Card>
          <Card className="border-slate-700 bg-slate-800/60 p-4 flex flex-col items-center">
            <FiLayers className="h-5 w-5 text-blue-400 mb-1" />
            <span className="text-lg font-bold text-slate-100">{expertiseDomains.length}</span>
            <span className="text-xs text-slate-400">Domains</span>
          </Card>
          <Card className="border-slate-700 bg-slate-800/60 p-4 flex flex-col items-center">
            <FiBookOpen className="h-5 w-5 text-amber-400 mb-1" />
            <span className="text-lg font-bold text-slate-100">{recentTasks.length}</span>
            <span className="text-xs text-slate-400">Recent Tasks</span>
          </Card>
        </div>

        {/* Expertise Domains */}
        <Card className="border-slate-700 bg-slate-800/60 p-0">
          <CardContent className="p-5">
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
              <FiAward className="h-4 w-4 text-amber-400" />
              Expertise Domains
            </h3>
            {expertiseDomains.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {expertiseDomains.map((domain) => (
                  <Badge
                    key={domain}
                    variant="outline"
                    className="bg-slate-700/70 text-slate-300 border-slate-600/50 rounded-md"
                  >
                    {domain}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 italic">
                No expertise domains recorded yet. Domains are added as the agent works on tasks.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Recent Tasks */}
        <Card className="border-slate-700 bg-slate-800/60 p-0">
          <CardContent className="p-5">
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
                    <FiHash className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                    {task}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 italic">
                No tasks recorded yet. Tasks are tracked when sessions complete.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Session History */}
        <Card className="border-slate-700 bg-slate-800/60 p-0">
          <CardContent className="p-5">
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
                        title={STATE_TOOLTIPS[s.state] || s.state}
                      />
                      <span className="text-sm text-slate-300 font-mono">{s.id.slice(0, 12)}...</span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0.5 ${STATE_COLORS[s.state] || ''}`}
                        title={STATE_TOOLTIPS[s.state] || s.state}
                      >
                        {s.state}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      {s.task_id && <span>Task: {s.task_id}</span>}
                      <span data-created-at={s.created_at}>{formatDateTime(s.created_at)}</span>
                    </div>
                  </div>
                ))}
                {sessionHistory.length > 10 && (
                  <p className="text-xs text-slate-400 text-center pt-1">
                    and {sessionHistory.length - 10} more sessions...
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-400 italic">
                No previous sessions found for this agent.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
