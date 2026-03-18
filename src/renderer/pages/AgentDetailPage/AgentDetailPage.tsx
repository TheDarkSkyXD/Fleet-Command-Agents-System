import { useCallback, useEffect, useState } from 'react';
import {
  FiActivity,
  FiAlertTriangle,
  FiArrowLeft,
  FiClock,
  FiCopy,
  FiCpu,
  FiFile,
  FiHash,
  FiLink,
  FiMail,
  FiShield,
  FiSquare,
  FiTerminal,
  FiTrash2,
  FiUser,
  FiZap,
} from 'react-icons/fi';
import { toast } from 'sonner';
import type {
  AgentProcessInfo,
  Issue,
  Session,
} from '../../../shared/types';
import { Button } from '../../components/ui/button';
import { Tooltip } from '../../components/Tooltip';
import { Badge } from '../../components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';
import {
  AgentTerminal,
  Breadcrumbs,
  AgentCVCard,
  AgentLogsTab,
  AgentFilesTab,
  AgentMailTab,
  AgentPerformanceTab,
  AgentGatesTab,
  CAPABILITY_COLORS,
  CAPABILITY_TOOLTIPS,
  STATE_COLORS,
  STATE_DOT_COLORS,
  STATE_ICONS,
  STATE_TOOLTIPS,
} from './components';
import { formatUptime as formatUptimeFn } from '../../lib/dateFormatting';
import { handleIpcError } from '../../lib/ipcErrorHandler';
import './AgentDetailPage.css';

/** Normalize SQLite UTC timestamps for correct local time display */
function normalizeTimestamp(dateStr: string): Date {
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(dateStr) && !dateStr.includes('Z') && !dateStr.includes('+') && !dateStr.includes('T')) {
    return new Date(`${dateStr.replace(' ', 'T')}Z`);
  }
  return new Date(dateStr);
}

type DetailTab = 'terminal' | 'logs' | 'identity' | 'files' | 'mail' | 'performance' | 'gates';

const TABS: { id: DetailTab; label: string; icon: React.ReactNode }[] = [
  { id: 'terminal', label: 'Terminal', icon: <FiTerminal className="h-4 w-4" /> },
  { id: 'logs', label: 'Logs', icon: <FiFile className="h-4 w-4" /> },
  { id: 'identity', label: 'Identity/CV', icon: <FiUser className="h-4 w-4" /> },
  { id: 'files', label: 'Files Changed', icon: <FiHash className="h-4 w-4" /> },
  { id: 'mail', label: 'Mail', icon: <FiMail className="h-4 w-4" /> },
  { id: 'performance', label: 'Performance', icon: <FiActivity className="h-4 w-4" /> },
  { id: 'gates', label: 'Gates', icon: <FiShield className="h-4 w-4" /> },
];

// ── Main Component ─────────────────────────────────────────────

interface AgentDetailPageProps {
  agentId: string;
  onBack: () => void;
}

export function AgentDetailPage({ agentId, onBack }: AgentDetailPageProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [processInfo, setProcessInfo] = useState<AgentProcessInfo | null>(null);
  const [associatedIssues, setAssociatedIssues] = useState<Issue[]>([]);
  const [activeTab, setActiveTab] = useState<DetailTab>('terminal');
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  // Tick counter to force uptime display re-renders every second for accuracy
  const [, setUptimeTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setUptimeTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadSession = useCallback(async () => {
    try {
      const result = await window.electronAPI.agentDetail(agentId);
      if (result.data) {
        setSession(result.data);
        setNotFound(false);
      } else if (result.error) {
        const msg = handleIpcError(new Error(result.error), {
          context: 'loading agent details',
          showToast: false,
        });
        setError(msg);
      } else {
        // No data and no error means agent ID doesn't exist
        setNotFound(true);
      }
    } catch (err) {
      const msg = handleIpcError(err, {
        context: 'loading agent details',
        showToast: false,
      });
      setError(msg);
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

  const loadAssociatedIssues = useCallback(async () => {
    if (!session?.agent_name) return;
    try {
      const result = await window.electronAPI.issueByAgent(session.agent_name);
      if (result.data) {
        setAssociatedIssues(result.data);
      }
    } catch {
      // Issues may not exist
    }
  }, [session?.agent_name]);

  // Load data and poll
  useEffect(() => {
    loadSession();
    loadProcessInfo();

    const interval = setInterval(() => {
      loadSession();
      loadProcessInfo();
    }, 3000);

    // Listen for agent state change events for immediate cascading updates
    const unsubAgentUpdate = window.electronAPI.onAgentUpdate((data: unknown) => {
      const event = data as { agentId?: string };
      // Refresh when this agent or any parent changes state
      if (!event.agentId || event.agentId === agentId) {
        loadSession();
        loadProcessInfo();
      }
    });

    return () => {
      clearInterval(interval);
      unsubAgentUpdate();
    };
  }, [loadSession, loadProcessInfo, agentId]);

  // Load associated issues when session is available
  useEffect(() => {
    loadAssociatedIssues();
    const interval = setInterval(loadAssociatedIssues, 5000);
    return () => clearInterval(interval);
  }, [loadAssociatedIssues]);

  const handleStop = async () => {
    try {
      await window.electronAPI.agentStop(agentId);
      await loadSession();
      await loadProcessInfo();
    } catch (err) {
      handleIpcError(err, { context: 'stopping agent' });
    }
  };

  const handleNudge = async () => {
    try {
      await window.electronAPI.agentNudge(agentId);
      await loadSession();
    } catch (err) {
      handleIpcError(err, { context: 'nudging agent' });
    }
  };

  const handleCheckMail = async () => {
    if (!session) return;
    try {
      const result = await window.electronAPI.mailCheck(agentId, session.agent_name);
      if (result.error) {
        toast.error(`Mail check failed: ${result.error}`, { duration: 5000 });
      } else if (result.data) {
        if (result.data.injected === 0) {
          toast('No unread messages', { description: `${session.agent_name} has no pending mail`, duration: 5000 });
        } else {
          toast.success(`${result.data.injected} message(s) injected`, {
            description: `Mail delivered to ${session.agent_name}'s context`,
            duration: 5000,
          });
        }
      }
    } catch (err) {
      handleIpcError(err, { context: 'checking mail' });
    }
  };

  if (error && !session) {
    return (
      <div className="space-y-4">
        <Breadcrumbs
          items={[{ label: 'Agents', page: 'agents', onClick: onBack }, { label: 'Error' }]}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="text-slate-400 hover:text-slate-200"
          data-testid="back-to-agents"
        >
          <FiArrowLeft className="h-4 w-4" />
          Back to Agents
        </Button>
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-400 flex items-center justify-between gap-2">
          <span>{error}</span>
          <Tooltip content="Copy error">
            <Button
              variant="ghost"
              size="icon"
              data-testid="copy-error-agent-detail"
              onClick={() => {
                navigator.clipboard.writeText(error);
                toast.success('Error message copied to clipboard');
              }}
              className="shrink-0 text-red-400/50 hover:text-red-300 hover:bg-red-500/20 h-8 w-8"
              aria-label="Copy error message"
            >
              <FiCopy size={14} />
            </Button>
          </Tooltip>
        </div>
      </div>
    );
  }

  if (notFound && !session) {
    return (
      <div className="space-y-4" data-testid="agent-not-found">
        <Breadcrumbs
          items={[{ label: 'Agents', page: 'agents', onClick: onBack }, { label: 'Not Found' }]}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="text-slate-400 hover:text-slate-200"
          data-testid="back-to-agents"
        >
          <FiArrowLeft className="h-4 w-4" />
          Back to Agents
        </Button>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-800">
            <span className="text-3xl font-bold text-slate-400">404</span>
          </div>
          <h2 className="mb-2 text-xl font-semibold text-slate-200">Agent Not Found</h2>
          <p className="mb-1 text-slate-400">
            No agent session exists with ID{' '}
            <span className="font-mono text-slate-300" data-testid="agent-not-found-id">
              "{agentId}"
            </span>
          </p>
          <p className="mb-6 text-sm text-slate-400">
            The agent may have been removed, or the URL contains an invalid ID.
          </p>
          <Button
            onClick={onBack}
            className="bg-blue-600/15 text-blue-400 border border-blue-500/25 hover:bg-blue-600/25 hover:text-blue-300"
            data-testid="agent-not-found-back-button"
          >
            Go to Agents
          </Button>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="space-y-4">
        <Breadcrumbs
          items={[{ label: 'Agents', page: 'agents', onClick: onBack }, { label: 'Loading...' }]}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="text-slate-400 hover:text-slate-200"
          data-testid="back-to-agents"
        >
          <FiArrowLeft className="h-4 w-4" />
          Back to Agents
        </Button>
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      </div>
    );
  }

  const isRunning = session.state !== 'completed';
  const hasProcess = processInfo?.isRunning ?? false;

  return (
    <div
      className="flex flex-col h-full"
      style={{ height: 'calc(100vh - 96px)' }}
      data-testid="agent-detail-page"
      data-agent-id={agentId}
    >
      {/* Header */}
      <div className="flex-shrink-0 space-y-3 pb-4">
        <Breadcrumbs
          items={[
            { label: 'Agents', page: 'agents', onClick: onBack },
            { label: session.agent_name || 'Agent Detail' },
          ]}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="text-slate-400 hover:text-slate-200"
          data-testid="back-to-agents"
        >
          <FiArrowLeft className="h-4 w-4" />
          Back to Agents
        </Button>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* State indicator with icon */}
            <div
              className={`flex items-center shrink-0 ${STATE_ICONS[session.state]?.className || 'text-slate-400'}`}
              title={STATE_TOOLTIPS[session.state] || session.state}
            >
              {STATE_ICONS[session.state]?.icon || (
                <div
                  className={`h-3 w-3 rounded-full ${STATE_DOT_COLORS[session.state] || 'bg-slate-400'}`}
                />
              )}
            </div>

            {/* Agent name */}
            <h1
              className="text-xl font-bold text-slate-50 truncate max-w-[300px]"
              title={session.agent_name}
            >
              {session.agent_name}
            </h1>

            {/* Capability badge */}
            <Badge
              variant="outline"
              className={`shrink-0 ${CAPABILITY_COLORS[session.capability] || 'bg-slate-500/20 text-slate-400'}`}
              title={CAPABILITY_TOOLTIPS[session.capability] || session.capability}
            >
              {session.capability}
            </Badge>

            {/* State badge with icon */}
            <Badge
              variant="outline"
              className={`shrink-0 gap-1 ${STATE_COLORS[session.state] || ''}`}
              title={STATE_TOOLTIPS[session.state] || session.state}
            >
              {STATE_ICONS[session.state]?.icon}
              {session.state}
            </Badge>

            {/* Active / Stopped indicator */}
            <Badge
              variant="outline"
              className={`shrink-0 gap-1.5 px-2.5 py-0.5 font-semibold ${
                isRunning
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                  : 'bg-red-500/15 text-red-400 border-red-500/25'
              }`}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
              {isRunning ? 'Active' : 'Stopped'}
            </Badge>

            {/* Stalled warning indicator */}
            {session.state === 'stalled' && (
              <Badge
                variant="outline"
                className="shrink-0 gap-1.5 bg-amber-500/15 text-amber-400 border-amber-500/30 font-semibold"
                title={`Agent is stalled and unresponsive. Escalation level: ${session.escalation_level || 0}. Try nudging or stopping the agent.`}
                data-testid="agent-stalled-warning"
              >
                <FiAlertTriangle className="h-3.5 w-3.5" />
                Stalled
                {session.stalled_at && (
                  <span className="text-amber-500/70">
                    {`${Math.floor((Date.now() - normalizeTimestamp(session.stalled_at).getTime()) / 60000)}m`}
                  </span>
                )}
              </Badge>
            )}
          </div>

          {/* Actions — always visible */}
          <div className="flex items-center gap-2 shrink-0">
            {session.state === 'stalled' && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleNudge}
                className="bg-amber-600/15 text-amber-400 border border-amber-500/25 hover:bg-amber-600/25 hover:text-amber-300"
              >
                <FiZap className="h-3.5 w-3.5" />
                Nudge
              </Button>
            )}
            {hasProcess && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCheckMail}
                className="bg-cyan-600/15 text-cyan-400 border border-cyan-500/25 hover:bg-cyan-600/25 hover:text-cyan-300"
              >
                <FiMail className="h-3.5 w-3.5" />
                Check Mail
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleStop}
              disabled={!isRunning}
              className={isRunning
                ? 'bg-red-600/15 text-red-400 border border-red-500/25 hover:bg-red-600/25 hover:text-red-300'
                : 'bg-[#1e1e1e] text-slate-500 border border-white/5 cursor-not-allowed'
              }
            >
              <FiSquare className="h-3.5 w-3.5" />
              Stop Agent
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  const result = await window.electronAPI.agentDelete(agentId);
                  if (result.error) {
                    toast.error(`Failed to delete: ${result.error}`);
                    return;
                  }
                  toast.success('Agent deleted');
                  onBack();
                } catch (err) {
                  handleIpcError(err, { context: 'deleting agent' });
                }
              }}
              className="bg-red-600/15 text-red-400 border border-red-500/25 hover:bg-red-600/25 hover:text-red-300"
            >
              <FiTrash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        </div>

        {/* Info bar */}
        <div className="flex items-center gap-4 text-xs text-slate-400">
          {(session.pid || processInfo?.pid) && (
            <span className="flex items-center gap-1 font-mono">
              <FiCpu className="h-3 w-3" />
              PID: {session.pid || processInfo?.pid}
            </span>
          )}
          <span className="flex items-center gap-1" data-testid="agent-detail-uptime" data-created-at={session.created_at}>
            <FiClock className="h-3 w-3" />
            {formatUptimeFn(session.created_at)}
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
          {associatedIssues.length > 0 && (
            <span className="flex items-center gap-1" data-testid="agent-associated-issues">
              <FiLink className="h-3 w-3" />
              {associatedIssues.length} issue{associatedIssues.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Associated Issues */}
        {associatedIssues.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap" data-testid="agent-issue-list">
            {associatedIssues.map((issue) => {
              const statusColor =
                issue.status === 'in_progress'
                  ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                  : issue.status === 'closed'
                    ? 'bg-green-500/15 text-green-400 border-green-500/30'
                    : issue.status === 'blocked'
                      ? 'bg-red-500/15 text-red-400 border-red-500/30'
                      : 'bg-slate-500/15 text-slate-400 border-slate-500/30';
              return (
                <Badge
                  key={issue.id}
                  variant="outline"
                  className={`gap-1.5 rounded-md ${statusColor}`}
                  title={`${issue.title} (${issue.status})`}
                >
                  <FiLink className="h-3 w-3" />
                  {issue.title.length > 40 ? `${issue.title.slice(0, 40)}...` : issue.title}
                  <span className="opacity-60">({issue.status.replace('_', ' ')})</span>
                </Badge>
              );
            })}
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as DetailTab)}
        className="flex flex-col flex-1 min-h-0"
      >
        <TabsList
          className="flex-shrink-0 w-full justify-start rounded-none border-b border-slate-700 bg-transparent h-auto p-0 gap-0"
          data-testid="agent-detail-tabs"
        >
          {TABS.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-none border-b-2 border-transparent data-[state=active]:border-blue-400 data-[state=active]:text-blue-400 data-[state=active]:bg-blue-500/5 data-[state=active]:shadow-none text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              data-testid={`agent-tab-${tab.id}`}
            >
              {tab.icon}
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Tab content */}
        <TabsContent
          value="terminal"
          className="flex-1 min-h-0 overflow-hidden mt-0"
          data-testid="agent-tab-content-terminal"
        >
          <AgentTerminal agentId={agentId} isRunning={isRunning} />
        </TabsContent>
        <TabsContent
          value="logs"
          className="flex-1 min-h-0 overflow-hidden mt-0"
          data-testid="agent-tab-content-logs"
        >
          <AgentLogsTab agentName={session.agent_name} />
        </TabsContent>
        <TabsContent
          value="identity"
          className="flex-1 min-h-0 overflow-hidden mt-0"
          data-testid="agent-tab-content-identity"
        >
          <AgentCVCard agentName={session.agent_name} currentSession={session} />
        </TabsContent>
        <TabsContent
          value="files"
          className="flex-1 min-h-0 overflow-hidden mt-0"
          data-testid="agent-tab-content-files"
        >
          <AgentFilesTab session={session} />
        </TabsContent>
        <TabsContent
          value="mail"
          className="flex-1 min-h-0 overflow-hidden mt-0"
          data-testid="agent-tab-content-mail"
        >
          <AgentMailTab agentName={session.agent_name} />
        </TabsContent>
        <TabsContent
          value="performance"
          className="flex-1 min-h-0 overflow-hidden mt-0"
          data-testid="agent-tab-content-performance"
        >
          <AgentPerformanceTab agentName={session.agent_name} />
        </TabsContent>
        <TabsContent
          value="gates"
          className="flex-1 min-h-0 overflow-hidden mt-0"
          data-testid="agent-tab-content-gates"
        >
          <AgentGatesTab agentName={session.agent_name} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
