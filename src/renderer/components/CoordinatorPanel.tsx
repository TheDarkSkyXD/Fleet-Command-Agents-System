import { useCallback, useEffect, useState } from 'react';
import {
  FiActivity,
  FiAlertTriangle,
  FiClock,
  FiPlay,
  FiSquare,
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

export function CoordinatorPanel() {
  const [status, setStatus] = useState<CoordinatorStatus | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Poll coordinator status
  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 3000);
    return () => clearInterval(interval);
  }, [loadStatus]);

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
    } catch (err) {
      setError(String(err));
    } finally {
      setIsStopping(false);
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

            {/* Stop button */}
            <button
              type="button"
              onClick={() => setShowStopConfirm(true)}
              disabled={isStopping}
              className="w-full flex items-center justify-center gap-2 rounded-md bg-red-600/20 border border-red-500/30 px-3 py-2 text-sm font-medium text-red-400 hover:bg-red-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
