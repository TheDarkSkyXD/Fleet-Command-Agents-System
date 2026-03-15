import { useCallback, useEffect, useState } from 'react';
import {
  FiActivity,
  FiAlertTriangle,
  FiCheckCircle,
  FiClock,
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

  // Mail polling state
  const [lastPollResult, setLastPollResult] = useState<PollResult | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [pollCount, setPollCount] = useState(0);

  // Work streams state
  const [workStreams, setWorkStreams] = useState<WorkStream[]>([]);

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

  // Poll coordinator status, dispatched leads, and work streams
  useEffect(() => {
    loadStatus();
    loadDispatchedLeads();
    loadWorkStreams();
    const interval = setInterval(() => {
      loadStatus();
      loadDispatchedLeads();
      loadWorkStreams();
    }, 3000);
    return () => clearInterval(interval);
  }, [loadStatus, loadDispatchedLeads, loadWorkStreams]);

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
      setError(String(err));
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
      setError(String(err));
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
      setError(String(err));
    } finally {
      setIsDispatching(false);
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
                      <span className="text-slate-300 font-mono truncate max-w-[120px]">
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
                          <span className="text-slate-300 font-mono truncate">
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
                          <p className="text-slate-500 truncate mt-0.5">{lead.objective}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Work Streams (Task Decomposition) */}
            {workStreams.length > 0 && (
              <div className="rounded-lg bg-slate-900/40 border border-slate-700/50 p-2.5" data-testid="work-streams">
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
                          <span className="text-slate-300 truncate max-w-[180px]">{streamLabel}</span>
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
                  <span>
                    Total: {workStreams.reduce((s, w) => s + w.total_tasks, 0)} tasks
                  </span>
                  <span className="text-green-400">
                    {workStreams.reduce((s, w) => s + w.completed_tasks, 0)} completed
                  </span>
                </div>
              </div>
            )}

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
            <button type="button" onClick={() => setError(null)} className="shrink-0">
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
