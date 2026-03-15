import { useCallback, useEffect, useState } from 'react';
import {
  FiArrowLeft,
  FiClock,
  FiCpu,
  FiFile,
  FiHash,
  FiMail,
  FiSquare,
  FiTerminal,
  FiUser,
  FiZap,
} from 'react-icons/fi';
import type { AgentProcessInfo, Session } from '../../shared/types';
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
            {/* State indicator */}
            <div
              className={`h-3 w-3 rounded-full ${STATE_DOT_COLORS[session.state] || 'bg-slate-400'}`}
            />

            {/* Agent name */}
            <h1 className="text-xl font-bold text-slate-50">{session.agent_name}</h1>

            {/* Capability badge */}
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${CAPABILITY_COLORS[session.capability] || 'bg-slate-500/20 text-slate-400'}`}
            >
              {session.capability}
            </span>

            {/* State badge */}
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATE_COLORS[session.state] || ''}`}
            >
              {session.state}
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
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
        {activeTab === 'logs' && (
          <div className="p-6 text-slate-400">
            <p>Agent log viewer - coming soon</p>
          </div>
        )}
        {activeTab === 'identity' && (
          <div className="p-6 text-slate-400">
            <p>Agent identity/CV - coming soon</p>
          </div>
        )}
        {activeTab === 'files' && (
          <div className="p-6 text-slate-400">
            <p>Files changed by this agent - coming soon</p>
          </div>
        )}
        {activeTab === 'mail' && (
          <div className="p-6 text-slate-400">
            <p>Agent mail messages - coming soon</p>
          </div>
        )}
      </div>
    </div>
  );
}
