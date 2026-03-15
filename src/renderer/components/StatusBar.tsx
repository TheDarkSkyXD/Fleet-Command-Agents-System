import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FiCheck,
  FiCheckCircle,
  FiChevronUp,
  FiClock,
  FiFolder,
  FiList,
  FiPlay,
  FiSquare,
  FiStar,
  FiUsers,
  FiXCircle,
} from 'react-icons/fi';
import type { ConfigProfile } from '../../shared/types';
import { useProjectStore } from '../stores/projectStore';
import { useRunStore } from '../stores/runStore';

type CliState = 'checking' | 'ready' | 'not-authenticated' | 'not-installed' | 'error';

interface CliStatus {
  installed: boolean;
  authenticated: boolean;
  version: string | null;
  path: string | null;
}

function getCliState(status: CliStatus | null, loading: boolean): CliState {
  if (loading || !status) return 'checking';
  if (!status.installed) return 'not-installed';
  if (!status.authenticated) return 'not-authenticated';
  return 'ready';
}

function getCliIndicator(state: CliState): { color: string; label: string } {
  switch (state) {
    case 'checking':
      return { color: 'bg-slate-500 animate-pulse', label: 'CLI: Checking...' };
    case 'ready':
      return { color: 'bg-emerald-500', label: 'CLI: Ready' };
    case 'not-authenticated':
      return { color: 'bg-amber-500', label: 'CLI: Not Authenticated' };
    case 'not-installed':
      return { color: 'bg-red-500', label: 'CLI: Not Installed' };
    case 'error':
      return { color: 'bg-red-500', label: 'CLI: Error' };
  }
}

function formatDuration(startedAt: string): string {
  const start = new Date(startedAt).getTime();
  const now = Date.now();
  const diffMs = now - start;

  if (diffMs < 0) return '0s';

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

interface StatusBarProps {
  onNavigate?: (page: string) => void;
}

export function StatusBar({ onNavigate }: StatusBarProps) {
  const [cliStatus, setCliStatus] = useState<CliStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [activeProfile, setActiveProfile] = useState<ConfigProfile | null>(null);
  const [allProfiles, setAllProfiles] = useState<ConfigProfile[]>([]);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const { activeRun, runs, startRun, stopRun, completeRun, fetchActiveRun, fetchRuns } =
    useRunStore();
  const [showRunHistory, setShowRunHistory] = useState(false);
  const runHistoryRef = useRef<HTMLDivElement>(null);
  const { activeProject, loadActiveProject } = useProjectStore();
  const [runProgress, setRunProgress] = useState<{
    total: number;
    completed: number;
    working: number;
    percentage: number;
  } | null>(null);

  // Fetch active project on mount
  useEffect(() => {
    loadActiveProject();
  }, [loadActiveProject]);

  // Fetch CLI status on mount
  useEffect(() => {
    let mounted = true;

    async function checkCliStatus() {
      try {
        const result = await window.electronAPI.claudeStatus();
        if (mounted) {
          setCliStatus(result.data);
          setLoading(false);
        }
      } catch {
        if (mounted) {
          setCliStatus(null);
          setLoading(false);
        }
      }
    }

    checkCliStatus();

    return () => {
      mounted = false;
    };
  }, []);

  // Fetch active run on mount and poll every 5s
  useEffect(() => {
    fetchActiveRun();
    const interval = setInterval(fetchActiveRun, 5000);
    return () => clearInterval(interval);
  }, [fetchActiveRun]);

  // Refresh active run immediately when an agent state changes (stop/spawn)
  useEffect(() => {
    window.electronAPI.onAgentUpdate(() => {
      fetchActiveRun();
    });
  }, [fetchActiveRun]);

  // Poll run progress when there's an active run
  useEffect(() => {
    if (!activeRun) {
      setRunProgress(null);
      return;
    }
    const fetchProgress = async () => {
      try {
        const result = await window.electronAPI.runProgress(activeRun.id);
        if (result.data) {
          setRunProgress(result.data);
        }
      } catch {
        // Silently fail
      }
    };
    fetchProgress();
    const interval = setInterval(fetchProgress, 5000);
    return () => clearInterval(interval);
  }, [activeRun]);

  // Fetch active profile on mount and poll every 10s
  const loadProfiles = useCallback(async () => {
    try {
      const [activeResult, listResult] = await Promise.all([
        window.electronAPI.profileGetActive(),
        window.electronAPI.profileList(),
      ]);
      if (activeResult.data) {
        setActiveProfile(activeResult.data);
      } else {
        setActiveProfile(null);
      }
      if (listResult.data) {
        setAllProfiles(listResult.data);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadProfiles();
    const interval = setInterval(loadProfiles, 10000);
    return () => clearInterval(interval);
  }, [loadProfiles]);

  // Close profile menu on click outside
  useEffect(() => {
    if (!showProfileMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showProfileMenu]);

  const handleQuickSwitch = useCallback(
    async (profileId: string) => {
      try {
        await window.electronAPI.profileActivate(profileId);
        setShowProfileMenu(false);
        await loadProfiles();
      } catch {
        // ignore
      }
    },
    [loadProfiles],
  );

  // Close run history on click outside
  useEffect(() => {
    if (!showRunHistory) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (runHistoryRef.current && !runHistoryRef.current.contains(e.target as Node)) {
        setShowRunHistory(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showRunHistory]);

  // Fetch run history when dropdown opens
  useEffect(() => {
    if (showRunHistory) {
      fetchRuns();
    }
  }, [showRunHistory, fetchRuns]);

  // Tick timer every second when run is active
  useEffect(() => {
    if (!activeRun) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [activeRun]);

  const handleStartRun = useCallback(async () => {
    await startRun();
  }, [startRun]);

  const handleStopRun = useCallback(async () => {
    if (activeRun) {
      await stopRun(activeRun.id);
    }
  }, [activeRun, stopRun]);

  const handleCompleteRun = useCallback(async () => {
    if (activeRun) {
      await completeRun(activeRun.id);
    }
  }, [activeRun, completeRun]);

  const cliState = getCliState(cliStatus, loading);
  const indicator = getCliIndicator(cliState);

  // Compute run duration string (memoized to avoid recalc on every render except timer tick)
  const runDuration = useMemo(() => {
    if (!activeRun) return null;
    // Use `now` to force recalc every second
    void now;
    return formatDuration(activeRun.started_at);
  }, [activeRun, now]);

  return (
    <footer
      className="flex items-center justify-between border-t border-slate-700 bg-slate-950 px-4 py-1 text-xs text-slate-400"
      data-testid="status-bar"
    >
      <div className="flex items-center gap-4">
        <span
          className="flex items-center gap-1.5 font-medium text-slate-300"
          data-testid="status-bar-project"
          title={
            activeProject
              ? `Project: ${activeProject.name}\nPath: ${activeProject.path}`
              : 'No project selected'
          }
        >
          <FiFolder className="h-3 w-3 text-blue-400" />
          {activeProject ? activeProject.name : 'No Project'}
        </span>
        <span
          className="flex items-center gap-1.5"
          data-testid="status-bar-agent-count"
          title={
            activeRun
              ? `${activeRun.agent_count} agent(s) currently running\nRun started: ${new Date(activeRun.started_at).toLocaleString()}`
              : 'No agents currently running'
          }
        >
          {activeRun ? (
            <>
              <span
                className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"
                title="Run active — agents are working"
              />
              <span className="text-slate-300">Agents: {activeRun.agent_count}</span>
            </>
          ) : (
            <span>Active Agents: 0</span>
          )}
        </span>
      </div>
      <div className="flex items-center gap-4">
        {/* Active Profile Quick-Switch */}
        {allProfiles.length > 0 && (
          <div className="relative" ref={profileMenuRef}>
            <button
              type="button"
              onClick={() => setShowProfileMenu((prev) => !prev)}
              className="flex items-center gap-1 cursor-pointer rounded px-1.5 py-0.5 hover:bg-slate-800 transition-colors"
              data-testid="status-bar-profile"
              title={
                activeProfile
                  ? `Active Profile: ${activeProfile.name}\nClick to switch`
                  : 'No active profile\nClick to select one'
              }
            >
              <FiStar className={`h-3 w-3 ${activeProfile ? 'text-blue-400' : 'text-slate-400'}`} />
              <span className={activeProfile ? 'text-blue-300' : 'text-slate-400'}>
                {activeProfile ? activeProfile.name : 'No Profile'}
              </span>
              <FiChevronUp
                className={`h-3 w-3 text-slate-400 transition-transform ${showProfileMenu ? '' : 'rotate-180'}`}
              />
            </button>

            {/* Dropdown menu (opens upward from status bar) */}
            {showProfileMenu && (
              <div className="absolute bottom-full right-0 mb-1 w-56 rounded-lg border border-slate-700 bg-slate-800 shadow-xl z-50 py-1 max-h-64 overflow-y-auto">
                <div className="px-3 py-1.5 text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Switch Profile
                </div>
                {allProfiles.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleQuickSwitch(p.id)}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-slate-700 transition-colors ${
                      p.is_active ? 'text-blue-300' : 'text-slate-300'
                    }`}
                    title={`${p.name}${p.description ? ` - ${p.description}` : ''}`}
                  >
                    {p.is_active ? (
                      <FiCheck className="h-3 w-3 text-blue-400 shrink-0" />
                    ) : (
                      <span className="h-3 w-3 shrink-0" />
                    )}
                    <span className="truncate" title={p.name}>
                      {p.name}
                    </span>
                    <span className="ml-auto text-slate-400 shrink-0">{p.default_model}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          className="flex items-center gap-1 cursor-pointer rounded px-1.5 py-0.5 hover:bg-slate-800 transition-colors"
          data-testid="status-bar-cli"
          onClick={() => onNavigate?.('settings')}
          title={
            cliStatus
              ? `Path: ${cliStatus.path || 'N/A'}\nVersion: ${cliStatus.version || 'N/A'}\nAuth: ${cliStatus.authenticated ? 'Yes' : 'No'}\nClick to open settings`
              : 'Checking CLI status... Click to open settings'
          }
        >
          <span className={`h-2 w-2 rounded-full ${indicator.color}`} />
          {indicator.label}
          {cliStatus?.version && cliState === 'ready' && (
            <span className="text-slate-400 ml-1">v{cliStatus.version}</span>
          )}
        </button>

        {/* Run controls */}
        {activeRun ? (
          <span className="flex items-center gap-2" data-testid="status-bar-run">
            <span
              className="flex items-center gap-1 text-emerald-400"
              title={'Run ID: '.concat(activeRun.id)}
            >
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Run: {activeRun.id.substring(0, 12)}...
            </span>
            <span className="text-slate-300">{runDuration}</span>
            {runProgress && runProgress.total > 0 && (
              <span
                className="flex items-center gap-1.5"
                data-testid="run-completion-percentage"
                title={`${runProgress.completed}/${runProgress.total} agents completed (${runProgress.working} working)`}
              >
                <span className="w-16 h-1.5 rounded-full bg-slate-700 overflow-hidden">
                  <span
                    className="block h-full rounded-full bg-emerald-500 transition-all duration-700 ease-out"
                    style={{ width: `${runProgress.percentage}%` }}
                  />
                </span>
                <span className="text-emerald-300 font-medium">{runProgress.percentage}%</span>
              </span>
            )}
            <button
              type="button"
              onClick={handleCompleteRun}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300 transition-colors"
              title="Mark run as completed and record outcome"
              data-testid="mark-run-completed-btn"
            >
              <FiCheckCircle className="h-3 w-3" />
              Complete
            </button>
            <button
              type="button"
              onClick={handleStopRun}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors"
              title="Stop run"
            >
              <FiSquare className="h-3 w-3" />
              Stop
            </button>
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleStartRun}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300 transition-colors"
              title="Start a new coordinator run"
            >
              <FiPlay className="h-3 w-3" />
              Start Run
            </button>
          </span>
        )}

        {/* Run History */}
        <div className="relative" ref={runHistoryRef}>
          <button
            type="button"
            onClick={() => setShowRunHistory((prev) => !prev)}
            className="flex items-center gap-1 cursor-pointer rounded px-1.5 py-0.5 hover:bg-slate-800 transition-colors"
            data-testid="run-history-btn"
            title="View run history"
          >
            <FiList className="h-3 w-3 text-slate-400" />
            <span className="text-slate-400">History</span>
          </button>

          {showRunHistory && (
            <div
              className="absolute bottom-full right-0 mb-1 w-96 rounded-lg border border-slate-700 bg-slate-800 shadow-xl z-50 py-1 max-h-80 overflow-y-auto"
              data-testid="run-history-dropdown"
            >
              <div className="flex items-center justify-between px-3 py-1.5">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Run History
                </span>
                <span className="text-xs text-slate-500">
                  {runs.length} run{runs.length !== 1 ? 's' : ''}
                </span>
              </div>
              {runs.length === 0 ? (
                <div className="px-3 py-6 text-xs text-slate-400 text-center">
                  <FiList className="h-5 w-5 mx-auto mb-2 text-slate-500" />
                  No runs yet. Start a run to see history.
                </div>
              ) : (
                runs.map((run) => {
                  const startDate = new Date(run.started_at);
                  const endDate = run.completed_at ? new Date(run.completed_at) : null;
                  const durationMs = endDate
                    ? endDate.getTime() - startDate.getTime()
                    : Date.now() - startDate.getTime();
                  const durationMin = Math.floor(durationMs / 60000);
                  const durationSec = Math.floor((durationMs % 60000) / 1000);
                  const durationStr =
                    durationMin > 0 ? `${durationMin}m ${durationSec}s` : `${durationSec}s`;

                  return (
                    <div
                      key={run.id}
                      className="px-3 py-2 hover:bg-slate-700/50 transition-colors border-b border-slate-700/30 last:border-0"
                      data-testid={`run-history-item-${run.id}`}
                    >
                      {/* Row 1: Status icon + ID + status badge */}
                      <div className="flex items-center gap-2 mb-1">
                        {run.status === 'active' ? (
                          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                        ) : run.status === 'completed' ? (
                          <FiCheckCircle className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                        ) : (
                          <FiXCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                        )}
                        <span className="text-xs font-mono text-slate-300 truncate" title={run.id}>
                          {run.id.substring(0, 12)}
                        </span>
                        <span
                          className={`ml-auto text-xs font-medium px-1.5 py-0.5 rounded ${
                            run.status === 'active'
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : run.status === 'completed'
                                ? 'bg-blue-500/10 text-blue-400'
                                : 'bg-red-500/10 text-red-400'
                          }`}
                        >
                          {run.status}
                        </span>
                      </div>
                      {/* Row 2: Start time, end time, duration, agent count */}
                      <div className="flex items-center gap-3 text-[10px] text-slate-400 ml-5">
                        <span
                          className="flex items-center gap-0.5"
                          title={`Started: ${startDate.toLocaleString()}`}
                        >
                          <FiPlay className="h-2.5 w-2.5" />
                          {startDate.toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {endDate && (
                          <span
                            className="flex items-center gap-0.5"
                            title={`Ended: ${endDate.toLocaleString()}`}
                          >
                            <FiSquare className="h-2.5 w-2.5" />
                            {endDate.toLocaleString(undefined, {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        )}
                        <span className="flex items-center gap-0.5" title="Duration">
                          <FiClock className="h-2.5 w-2.5" />
                          {durationStr}
                        </span>
                        <span
                          className="flex items-center gap-0.5 ml-auto"
                          title={`${run.agent_count} agent${run.agent_count !== 1 ? 's' : ''}`}
                        >
                          <FiUsers className="h-2.5 w-2.5" />
                          {run.agent_count} agent{run.agent_count !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}
