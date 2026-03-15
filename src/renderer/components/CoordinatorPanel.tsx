import { useCallback, useEffect, useState } from 'react';
import {
  FiActivity,
  FiAlertTriangle,
  FiCheckCircle,
  FiClock,
  FiFileText,
  FiLayers,
  FiMail,
  FiPlay,
  FiSend,
  FiSquare,
  FiTarget,
  FiUsers,
  FiX,
  FiZap,
} from 'react-icons/fi';
import type { Session } from '../../shared/types';
import { handleIpcError } from '../lib/ipcErrorHandler';

interface CoordinatorStatus {
  active: boolean;
  session: Session | null;
  processAlive: boolean;
  agentsDispatched?: number;
}

interface DispatchedLead extends Session {
  objective?: string;
}

interface PollResult {
  messages_processed: Array<{
    message_id: string;
    from_agent: string;
    type: string;
    action_taken: string;
  }>;
  unread_count: number;
  fleet_summary: {
    active_agents: number;
    stalled_agents: number;
    completed_today: number;
  };
}

interface WorkStream {
  id: string;
  name: string;
  status: string;
  total_tasks: number;
  completed_tasks: number;
  in_progress_tasks: number;
  created_at: string;
}

export function CoordinatorPanel() {
  const [status, setStatus] = useState<CoordinatorStatus | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dispatch state
  const [showDispatch, setShowDispatch] = useState(false);
  const [dispatchObjective, setDispatchObjective] = useState('');
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchedLeads, setDispatchedLeads] = useState<DispatchedLead[]>([]);

  // Ask state
  const [showAsk, setShowAsk] = useState(false);
  const [askSubject, setAskSubject] = useState('');
  const [askBody, setAskBody] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [askResult, setAskResult] = useState<{
    correlation_id: string;
    question_message_id: string;
    reply: Record<string, unknown> | null;
    elapsed_ms: number;
    timed_out: boolean;
  } | null>(null);

  // Mail polling state
  const [lastPollResult, setLastPollResult] = useState<PollResult | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [pollCount, setPollCount] = useState(0);

  // Work streams state
  const [workStreams, setWorkStreams] = useState<WorkStream[]>([]);

  // Operator dispatch state
  const [showOperatorMessage, setShowOperatorMessage] = useState(false);
  const [operatorMessage, setOperatorMessage] = useState('');
  const [isSendingOperator, setIsSendingOperator] = useState(false);
  const [operatorHistory, setOperatorHistory] = useState<
    Array<{
      id: string;
      from_agent: string;
      to_agent: string;
      subject: string;
      body: string;
      created_at: string;
    }>
  >([]);

  // Activity log state
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [activityLog, setActivityLog] = useState<
    Array<{
      id: string;
      source: string;
      type: string;
      summary: string;
      detail: string | null;
      level: string;
      timestamp: string;
    }>
  >([]);

  const loadStatus = useCallback(async () => {
    try {
      const result = await window.electronAPI.coordinatorStatus();
      if (result.data) {
        setStatus(result.data);
      }
    } catch (err) {
      console.error('Failed to load coordinator status:', err);
    }
  }, []);

  const loadDispatchedLeads = useCallback(async () => {
    try {
      const result = await window.electronAPI.coordinatorDispatchedLeads();
      if (result.data) {
        setDispatchedLeads(result.data as DispatchedLead[]);
      }
    } catch (err) {
      console.error('Failed to load dispatched leads:', err);
    }
  }, []);

  const loadWorkStreams = useCallback(async () => {
    try {
      const result = await window.electronAPI.coordinatorWorkStreams();
      if (result.data) {
        setWorkStreams(result.data as WorkStream[]);
      }
    } catch (err) {
      console.error('Failed to load work streams:', err);
    }
  }, []);

  const loadActivityLog = useCallback(async () => {
    try {
      const result = await window.electronAPI.coordinatorActivityLog(50);
      if (result.data) {
        setActivityLog(result.data);
      }
    } catch (err) {
      console.error('Failed to load activity log:', err);
    }
  }, []);

  const loadOperatorHistory = useCallback(async () => {
    try {
      const result = await window.electronAPI.operatorHistory(20);
      if (result.data) {
        setOperatorHistory(result.data);
      }
    } catch (err) {
      console.error('Failed to load operator history:', err);
    }
  }, []);

  // Poll coordinator status, dispatched leads, work streams, activity log, and operator history
  useEffect(() => {
    loadStatus();
    loadDispatchedLeads();
    loadWorkStreams();
    loadActivityLog();
    loadOperatorHistory();
    const interval = setInterval(() => {
      loadStatus();
      loadDispatchedLeads();
      loadWorkStreams();
      loadActivityLog();
      loadOperatorHistory();
    }, 3000);
    return () => clearInterval(interval);
  }, [loadStatus, loadDispatchedLeads, loadWorkStreams, loadActivityLog, loadOperatorHistory]);

  // Auto-poll mail when coordinator is active
  useEffect(() => {
    if (!status?.active || !status?.processAlive) return;

    const pollMail = async () => {
      try {
        setIsPolling(true);
        const result = await window.electronAPI.coordinatorPollMail();
        if (result.data) {
          setLastPollResult(result.data);
          setPollCount((c) => c + 1);
        }
      } catch (err) {
        console.error('Failed to poll mail:', err);
      } finally {
        setIsPolling(false);
      }
    };

    pollMail();
    const interval = setInterval(pollMail, 5000);
    return () => clearInterval(interval);
  }, [status?.active, status?.processAlive]);

  const handleStart = async () => {
    setIsStarting(true);
    setError(null);
    try {
      const result = await window.electronAPI.coordinatorStart();
      if (result.error) {
        setError(result.error);
      }
      await loadStatus();
    } catch (err) {
      const msg = handleIpcError(err, { context: 'starting coordinator', showToast: false });
      setError(msg);
    } finally {
      setIsStarting(false);
    }
  };

  const handleStop = async () => {
    setIsStopping(true);
    setError(null);
    setShowStopConfirm(false);
    try {
      const result = await window.electronAPI.coordinatorStop();
      if (result.error) {
        setError(result.error);
      }
      await loadStatus();
      setLastPollResult(null);
      setPollCount(0);
    } catch (err) {
      const msg = handleIpcError(err, { context: 'stopping coordinator', showToast: false });
      setError(msg);
    } finally {
      setIsStopping(false);
    }
  };

  const handleDispatch = async () => {
    if (!dispatchObjective.trim()) return;
    setIsDispatching(true);
    setError(null);
    try {
      const result = await window.electronAPI.coordinatorDispatch({
        objective: dispatchObjective.trim(),
      });
      if (result.error) {
        setError(result.error);
      } else {
        setDispatchObjective('');
        setShowDispatch(false);
        await loadDispatchedLeads();
        await loadStatus();
      }
    } catch (err) {
      const msg = handleIpcError(err, { context: 'dispatching lead', showToast: false });
      setError(msg);
    } finally {
      setIsDispatching(false);
    }
  };

  const handleOperatorDispatch = async () => {
    if (!operatorMessage.trim()) return;
    setIsSendingOperator(true);
    setError(null);
    try {
      const result = await window.electronAPI.operatorDispatch(operatorMessage.trim());
      if (result.error) {
        setError(result.error);
      } else {
        setOperatorMessage('');
        setShowOperatorMessage(false);
        await loadOperatorHistory();
      }
    } catch (err) {
      const msg = handleIpcError(err, { context: 'sending operator message', showToast: false });
      setError(msg);
    } finally {
      setIsSendingOperator(false);
    }
  };

  const handleAsk = async () => {
    if (!askSubject.trim() || !askBody.trim()) return;
    setIsAsking(true);
    setError(null);
    setAskResult(null);
    try {
      const result = await window.electronAPI.coordinatorAsk({
        subject: askSubject.trim(),
        body: askBody.trim(),
      });
      if (result.error) {
        setError(result.error);
      } else if (result.data) {
        setAskResult(result.data);
        if (!result.data.timed_out) {
          setAskSubject('');
          setAskBody('');
        }
      }
    } catch (err) {
      const msg = handleIpcError(err, { context: 'asking coordinator', showToast: false });
      setError(msg);
    } finally {
      setIsAsking(false);
    }
  };

  const isActive = status?.active && status?.processAlive;
  const session = status?.session;

  // Tick uptime every second for live counter
  const [uptimeTick, setUptimeTick] = useState(0);
  useEffect(() => {
    if (!isActive || !session?.created_at) return;
    const timer = setInterval(() => setUptimeTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [isActive, session?.created_at]);

  // Calculate uptime (re-evaluates on each tick)
  const uptime = session?.created_at
    ? Math.floor((Date.now() - new Date(session.created_at).getTime()) / 1000)
    : 0;
  // Use uptimeTick to prevent lint warning about unused var
  void uptimeTick;
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = uptime % 60;
  const uptimeStr = hours > 0 ? `${hours}h ${minutes}m ${seconds}s` : `${minutes}m ${seconds}s`;

  const fleetSummary = lastPollResult?.fleet_summary;

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3 bg-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div
            className={`flex items-center justify-center h-8 w-8 rounded-lg ${
              isActive ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-700 text-slate-400'
            }`}
          >
            <FiZap className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Coordinator</h3>
            <p className="text-xs text-slate-500">
              {isActive ? 'Fleet orchestrator active' : 'Fleet orchestrator idle'}
            </p>
          </div>
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-2">
          {isActive && isPolling && <FiMail className="h-3.5 w-3.5 text-blue-400 animate-pulse" />}
          <div
            className={`h-2.5 w-2.5 rounded-full ${
              isActive ? 'bg-green-400 animate-pulse' : 'bg-slate-600'
            }`}
          />
          <span className={`text-xs font-medium ${isActive ? 'text-green-400' : 'text-slate-500'}`}>
            {isActive ? (session?.state === 'booting' ? 'Booting' : 'Working') : 'Inactive'}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {isActive && session ? (
          /* Active coordinator info */
          <div className="space-y-3">
            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-slate-900/60 p-3 border border-slate-700/50">
                <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
                  <FiClock className="h-3 w-3" />
                  Uptime
                </div>
                <p className="text-sm font-medium text-slate-200">{uptimeStr}</p>
              </div>
              <div className="rounded-lg bg-slate-900/60 p-3 border border-slate-700/50">
                <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
                  <FiUsers className="h-3 w-3" />
                  Dispatched
                </div>
                <p className="text-sm font-medium text-slate-200">
                  {status?.agentsDispatched ?? 0} agents
                </p>
              </div>
              <div className="rounded-lg bg-slate-900/60 p-3 border border-slate-700/50">
                <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
                  <FiActivity className="h-3 w-3" />
                  PID
                </div>
                <p className="text-sm font-mono font-medium text-slate-200">
                  {session.pid ?? 'N/A'}
                </p>
              </div>
            </div>

            {/* Fleet summary from mail polling */}
            {fleetSummary && (
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-green-900/20 p-2.5 border border-green-700/30">
                  <div className="text-xs text-green-400 font-medium">Active</div>
                  <p className="text-lg font-bold text-green-300">{fleetSummary.active_agents}</p>
                </div>
                <div className="rounded-lg bg-amber-900/20 p-2.5 border border-amber-700/30">
                  <div className="text-xs text-amber-400 font-medium">Stalled</div>
                  <p className="text-lg font-bold text-amber-300">{fleetSummary.stalled_agents}</p>
                </div>
                <div className="rounded-lg bg-blue-900/20 p-2.5 border border-blue-700/30">
                  <div className="text-xs text-blue-400 font-medium">Done (24h)</div>
                  <p className="text-lg font-bold text-blue-300">{fleetSummary.completed_today}</p>
                </div>
              </div>
            )}

            {/* Mail polling status */}
            {pollCount > 0 && (
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <FiMail className="h-3 w-3" />
                  Mail polls: {pollCount}
                </span>
                {lastPollResult && lastPollResult.messages_processed.length > 0 && (
                  <span className="text-blue-400">
                    Last: {lastPollResult.messages_processed.length} messages processed
                  </span>
                )}
              </div>
            )}

            {/* Recent mail activity */}
            {lastPollResult && lastPollResult.messages_processed.length > 0 && (
              <div className="rounded-lg bg-slate-900/40 border border-slate-700/50 p-2.5">
                <div className="text-xs font-medium text-slate-400 mb-1.5">
                  Recent Mail Activity
                </div>
                <div className="space-y-1 max-h-24 overflow-y-auto">
                  {lastPollResult.messages_processed.slice(0, 5).map((msg) => (
                    <div key={msg.message_id} className="flex items-center justify-between text-xs">
                      <span
                        className="text-slate-300 font-mono truncate max-w-[120px]"
                        title={msg.from_agent}
                      >
                        {msg.from_agent}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          msg.type === 'error'
                            ? 'bg-red-500/20 text-red-400'
                            : msg.type === 'worker_done'
                              ? 'bg-green-500/20 text-green-400'
                              : msg.type === 'escalation'
                                ? 'bg-amber-500/20 text-amber-400'
                                : 'bg-slate-600/40 text-slate-400'
                        }`}
                      >
                        {msg.type}
                      </span>
                      <span className="text-slate-500 text-[10px]">
                        {msg.action_taken.replace(/_/g, ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Dispatched leads */}
            {dispatchedLeads.length > 0 && (
              <div className="rounded-lg bg-slate-900/40 border border-slate-700/50 p-2.5">
                <div className="text-xs font-medium text-slate-400 mb-1.5 flex items-center gap-1.5">
                  <FiTarget className="h-3 w-3" />
                  Dispatched Leads ({dispatchedLeads.length})
                </div>
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {dispatchedLeads.map((lead) => (
                    <div key={lead.id} className="flex items-start gap-2 text-xs">
                      <div
                        className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${
                          lead.state === 'working'
                            ? 'bg-green-400'
                            : lead.state === 'stalled'
                              ? 'bg-amber-400'
                              : lead.state === 'completed'
                                ? 'bg-blue-400'
                                : 'bg-slate-500'
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span
                            className="text-slate-300 font-mono truncate"
                            title={lead.agent_name}
                          >
                            {lead.agent_name}
                          </span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded ${
                              lead.state === 'working'
                                ? 'bg-green-500/20 text-green-400'
                                : lead.state === 'stalled'
                                  ? 'bg-amber-500/20 text-amber-400'
                                  : lead.state === 'completed'
                                    ? 'bg-blue-500/20 text-blue-400'
                                    : 'bg-slate-600/40 text-slate-400'
                            }`}
                          >
                            {lead.state}
                          </span>
                        </div>
                        {lead.objective && (
                          <p className="text-slate-500 truncate mt-0.5" title={lead.objective}>
                            {lead.objective}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Work Streams (Task Decomposition) */}
            {workStreams.length > 0 && (
              <div
                className="rounded-lg bg-slate-900/40 border border-slate-700/50 p-2.5"
                data-testid="work-streams"
              >
                <div className="text-xs font-medium text-slate-400 mb-1.5 flex items-center gap-1.5">
                  <FiLayers className="h-3 w-3" />
                  Work Streams ({workStreams.length})
                </div>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {workStreams.map((stream) => {
                    const progress =
                      stream.total_tasks > 0
                        ? Math.round((stream.completed_tasks / stream.total_tasks) * 100)
                        : 0;
                    const streamLabel = stream.name.includes(' - ')
                      ? stream.name.split(' - ').pop()
                      : stream.name;
                    return (
                      <div key={stream.id} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span
                            className="text-slate-300 truncate max-w-[180px]"
                            title={stream.name}
                          >
                            {streamLabel}
                          </span>
                          <span className="text-slate-500 text-[10px]">
                            {stream.completed_tasks}/{stream.total_tasks} tasks
                          </span>
                        </div>
                        <div className="w-full bg-slate-700 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full transition-all ${
                              progress === 100
                                ? 'bg-green-500'
                                : stream.in_progress_tasks > 0
                                  ? 'bg-blue-500'
                                  : 'bg-slate-500'
                            }`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 pt-1.5 border-t border-slate-700/50 flex items-center justify-between text-[10px] text-slate-500">
                  <span>Total: {workStreams.reduce((s, w) => s + w.total_tasks, 0)} tasks</span>
                  <span className="text-green-400">
                    {workStreams.reduce((s, w) => s + w.completed_tasks, 0)} completed
                  </span>
                </div>
              </div>
            )}

            {/* Coordinator Activity Log */}
            <div className="rounded-lg bg-slate-900/40 border border-slate-700/50 p-2.5">
              <button
                type="button"
                onClick={() => setShowActivityLog(!showActivityLog)}
                className="w-full flex items-center justify-between text-xs font-medium text-slate-400 hover:text-slate-300 transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <FiFileText className="h-3 w-3" />
                  Activity Log ({activityLog.length} entries)
                </span>
                <span className="text-[10px] text-slate-500">
                  {showActivityLog ? 'Hide' : 'Show'}
                </span>
              </button>
              {showActivityLog && (
                <div
                  className="mt-2 space-y-1 max-h-64 overflow-y-auto"
                  data-testid="coordinator-activity-log"
                >
                  {activityLog.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-2">
                      No activity recorded yet
                    </p>
                  ) : (
                    activityLog.map((entry) => {
                      const timeStr = entry.timestamp
                        ? new Date(
                            entry.timestamp.includes('Z') ? entry.timestamp : `${entry.timestamp}Z`,
                          ).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })
                        : '';
                      const dateStr = entry.timestamp
                        ? new Date(
                            entry.timestamp.includes('Z') ? entry.timestamp : `${entry.timestamp}Z`,
                          ).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                          })
                        : '';

                      const levelColor =
                        entry.level === 'error'
                          ? 'border-l-red-500 bg-red-900/10'
                          : entry.level === 'warn'
                            ? 'border-l-amber-500 bg-amber-900/10'
                            : entry.source === 'dispatch'
                              ? 'border-l-purple-500 bg-purple-900/10'
                              : entry.source === 'mail'
                                ? 'border-l-blue-500 bg-blue-900/10'
                                : 'border-l-slate-600 bg-slate-800/50';

                      const sourceIcon =
                        entry.source === 'mail' ? (
                          <FiMail className="h-3 w-3 text-blue-400 shrink-0" />
                        ) : entry.source === 'dispatch' ? (
                          <FiSend className="h-3 w-3 text-purple-400 shrink-0" />
                        ) : entry.type === 'error' ? (
                          <FiAlertTriangle className="h-3 w-3 text-red-400 shrink-0" />
                        ) : (
                          <FiActivity className="h-3 w-3 text-slate-400 shrink-0" />
                        );

                      return (
                        <div
                          key={entry.id}
                          className={`border-l-2 rounded-r px-2 py-1.5 ${levelColor}`}
                        >
                          <div className="flex items-start gap-1.5">
                            <div className="mt-0.5">{sourceIcon}</div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-1">
                                <span
                                  className="text-xs text-slate-200 truncate"
                                  title={entry.summary}
                                >
                                  {entry.summary}
                                </span>
                                <span
                                  className="text-[10px] text-slate-500 whitespace-nowrap shrink-0"
                                  title={`${dateStr} ${timeStr}`}
                                >
                                  {dateStr} {timeStr}
                                </span>
                              </div>
                              {entry.detail && (
                                <p
                                  className="text-[10px] text-slate-500 mt-0.5 truncate"
                                  title={entry.detail}
                                >
                                  {entry.detail}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Agent name & details */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">
                Name: <span className="text-slate-300 font-mono">{session.agent_name}</span>
              </span>
              {session.worktree_path && (
                <span className="text-slate-500 truncate ml-2" title={session.worktree_path}>
                  {session.worktree_path}
                </span>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowDispatch(!showDispatch)}
                className="flex-1 flex items-center justify-center gap-2 rounded-md bg-purple-600/20 border border-purple-500/30 px-3 py-2 text-sm font-medium text-purple-400 hover:bg-purple-600/30 transition-colors"
              >
                <FiSend className="h-4 w-4" />
                Dispatch Lead
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAsk(!showAsk);
                  setAskResult(null);
                }}
                data-testid="operator-ask-btn"
                className="flex-1 flex items-center justify-center gap-2 rounded-md bg-blue-600/20 border border-blue-500/30 px-3 py-2 text-sm font-medium text-blue-400 hover:bg-blue-600/30 transition-colors"
              >
                <FiMail className="h-4 w-4" />
                Ask
              </button>
              <button
                type="button"
                onClick={() => setShowOperatorMessage(!showOperatorMessage)}
                data-testid="operator-message-btn"
                className="flex-1 flex items-center justify-center gap-2 rounded-md bg-cyan-600/20 border border-cyan-500/30 px-3 py-2 text-sm font-medium text-cyan-400 hover:bg-cyan-600/30 transition-colors"
              >
                <FiMail className="h-4 w-4" />
                Message
              </button>
              <button
                type="button"
                onClick={() => setShowStopConfirm(true)}
                disabled={isStopping}
                className="flex-1 flex items-center justify-center gap-2 rounded-md bg-red-600/20 border border-red-500/30 px-3 py-2 text-sm font-medium text-red-400 hover:bg-red-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isStopping ? (
                  <>
                    <FiActivity className="h-4 w-4 animate-spin" />
                    Stopping...
                  </>
                ) : (
                  <>
                    <FiSquare className="h-4 w-4" />
                    Stop
                  </>
                )}
              </button>
            </div>

            {/* Dispatch form */}
            {showDispatch && (
              <div className="rounded-lg border border-purple-500/30 bg-purple-900/10 p-3 space-y-2">
                <label htmlFor="dispatch-objective" className="text-xs font-medium text-purple-300">
                  Lead Objective
                </label>
                <textarea
                  id="dispatch-objective"
                  value={dispatchObjective}
                  onChange={(e) => setDispatchObjective(e.target.value)}
                  placeholder="Describe the high-level objective for this lead agent..."
                  className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-purple-500 focus:outline-none resize-none"
                  rows={3}
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowDispatch(false);
                      setDispatchObjective('');
                    }}
                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-300 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDispatch}
                    disabled={isDispatching || !dispatchObjective.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-purple-600 text-xs font-medium text-white hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isDispatching ? (
                      <>
                        <FiActivity className="h-3 w-3 animate-spin" />
                        Dispatching...
                      </>
                    ) : (
                      <>
                        <FiCheckCircle className="h-3 w-3" />
                        Dispatch
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Ask form - synchronous ask-reply */}
            {showAsk && (
              <div
                className="rounded-lg border border-blue-500/30 bg-blue-900/10 p-3 space-y-2"
                data-testid="operator-ask-panel"
              >
                <label htmlFor="ask-subject" className="text-xs font-medium text-blue-300">
                  Ask Coordinator (sync reply, 120s timeout)
                </label>
                <input
                  id="ask-subject"
                  type="text"
                  value={askSubject}
                  onChange={(e) => setAskSubject(e.target.value)}
                  placeholder="Subject of your question..."
                  data-testid="ask-subject-input"
                  className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                />
                <textarea
                  id="ask-body"
                  value={askBody}
                  onChange={(e) => setAskBody(e.target.value)}
                  placeholder="Describe your question in detail..."
                  data-testid="ask-body-input"
                  className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none resize-none"
                  rows={3}
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAsk(false);
                      setAskSubject('');
                      setAskBody('');
                      setAskResult(null);
                    }}
                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-300 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAsk}
                    disabled={isAsking || !askSubject.trim() || !askBody.trim()}
                    data-testid="ask-send-btn"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isAsking ? (
                      <>
                        <FiClock className="h-3 w-3 animate-spin" />
                        Waiting for reply...
                      </>
                    ) : (
                      <>
                        <FiSend className="h-3 w-3" />
                        Send Ask
                      </>
                    )}
                  </button>
                </div>

                {/* Ask result display */}
                {askResult && (
                  <div
                    className={`mt-2 rounded-lg border p-2.5 ${
                      askResult.timed_out
                        ? 'border-amber-500/30 bg-amber-900/10'
                        : 'border-green-500/30 bg-green-900/10'
                    }`}
                    data-testid="ask-result"
                  >
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span
                        className={`font-medium ${askResult.timed_out ? 'text-amber-400' : 'text-green-400'}`}
                      >
                        {askResult.timed_out ? 'Timed Out (120s)' : 'Reply Received'}
                      </span>
                      <span className="text-slate-500 text-[10px]">
                        {Math.round(askResult.elapsed_ms / 1000)}s elapsed
                      </span>
                    </div>
                    <div
                      className="text-[10px] text-slate-500 mb-1"
                      data-testid="ask-correlation-id"
                    >
                      Correlation: {askResult.correlation_id}
                    </div>
                    {askResult.reply ? (
                      <div className="text-xs text-slate-200" data-testid="ask-reply-body">
                        {askResult.reply.subject ? (
                          <div className="font-medium text-slate-300 mb-0.5">
                            {String(askResult.reply.subject)}
                          </div>
                        ) : null}
                        <p className="text-slate-400 whitespace-pre-wrap">
                          {String(askResult.reply.body ?? '')}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-amber-400">
                        No reply received within timeout period. The coordinator may still process
                        this question asynchronously.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Operator message form - fire-and-forget */}
            {showOperatorMessage && (
              <div
                className="rounded-lg border border-cyan-500/30 bg-cyan-900/10 p-3 space-y-2"
                data-testid="operator-message-panel"
              >
                <label htmlFor="operator-message" className="text-xs font-medium text-cyan-300">
                  Operator Message (fire-and-forget)
                </label>
                <textarea
                  id="operator-message"
                  value={operatorMessage}
                  onChange={(e) => setOperatorMessage(e.target.value)}
                  placeholder="Send a message directly to the coordinator's terminal..."
                  className="w-full rounded-md bg-slate-900 border border-slate-600 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-cyan-500 focus:outline-none resize-none"
                  rows={2}
                  data-testid="operator-message-input"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowOperatorMessage(false);
                      setOperatorMessage('');
                    }}
                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-300 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleOperatorDispatch}
                    disabled={isSendingOperator || !operatorMessage.trim()}
                    data-testid="operator-message-send"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-cyan-600 text-xs font-medium text-white hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isSendingOperator ? (
                      <>
                        <FiActivity className="h-3 w-3 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <FiSend className="h-3 w-3" />
                        Send
                      </>
                    )}
                  </button>
                </div>

                {/* Operator message history */}
                {operatorHistory.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-cyan-500/20">
                    <div className="text-[10px] font-medium text-cyan-400/70 mb-1.5">
                      Recent Messages ({operatorHistory.length})
                    </div>
                    <div
                      className="space-y-1 max-h-24 overflow-y-auto"
                      data-testid="operator-history"
                    >
                      {operatorHistory.map((msg) => {
                        const timeStr = msg.created_at
                          ? new Date(
                              msg.created_at.includes('Z') ? msg.created_at : `${msg.created_at}Z`,
                            ).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '';
                        return (
                          <div
                            key={msg.id}
                            className="flex items-start justify-between gap-2 text-[11px]"
                          >
                            <span className="text-slate-300 truncate" title={msg.body}>
                              {msg.body}
                            </span>
                            <span className="text-slate-500 whitespace-nowrap shrink-0">
                              {timeStr}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Inactive - show start button */
          <div className="text-center py-2">
            <p className="text-sm text-slate-400 mb-3">
              Start the coordinator to orchestrate your agent fleet. It will decompose tasks,
              dispatch leads, and manage merges.
            </p>
            <button
              type="button"
              onClick={handleStart}
              disabled={isStarting}
              className="inline-flex items-center gap-2 rounded-md bg-rose-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isStarting ? (
                <>
                  <FiActivity className="h-4 w-4 animate-spin" />
                  Starting Coordinator...
                </>
              ) : (
                <>
                  <FiPlay className="h-4 w-4" />
                  Start Coordinator
                </>
              )}
            </button>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-400 flex items-start justify-between gap-2">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="shrink-0"
              title="Dismiss error"
            >
              <FiX className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Stop Confirmation Dialog */}
      {showStopConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-800 shadow-2xl">
            <div className="flex items-center gap-3 border-b border-slate-700 px-6 py-4">
              <div className="flex items-center justify-center h-10 w-10 rounded-full bg-amber-500/20">
                <FiAlertTriangle className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-50">Stop Coordinator?</h3>
                <p className="text-sm text-slate-400">
                  This will gracefully shut down the coordinator agent.
                </p>
              </div>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-slate-300">
                The coordinator will be terminated gracefully using SIGTERM. Running worker agents
                will continue independently, but no new agents will be dispatched and fleet
                coordination will stop.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-slate-700 px-6 py-4">
              <button
                type="button"
                onClick={() => setShowStopConfirm(false)}
                className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStop}
                disabled={isStopping}
                className="flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isStopping ? (
                  <>
                    <FiActivity className="h-4 w-4 animate-spin" />
                    Stopping...
                  </>
                ) : (
                  <>
                    <FiSquare className="h-4 w-4" />
                    Stop Coordinator
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
