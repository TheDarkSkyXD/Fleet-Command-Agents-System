import { useCallback, useEffect, useMemo, useState } from 'react';
import { FiFolder, FiPlay, FiSquare } from 'react-icons/fi';
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

export function StatusBar() {
  const [cliStatus, setCliStatus] = useState<CliStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  const { activeRun, startRun, stopRun, fetchActiveRun } = useRunStore();
  const { activeProject, loadActiveProject } = useProjectStore();

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
        <span className="flex items-center gap-1.5" data-testid="status-bar-agent-count">
          {activeRun ? (
            <>
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-slate-300">Agents: {activeRun.agent_count}</span>
            </>
          ) : (
            <span>Active Agents: 0</span>
          )}
        </span>
      </div>
      <div className="flex items-center gap-4">
        <span
          className="flex items-center gap-1 cursor-default"
          data-testid="status-bar-cli"
          title={
            cliStatus
              ? `Path: ${cliStatus.path || 'N/A'}\nVersion: ${cliStatus.version || 'N/A'}\nAuth: ${cliStatus.authenticated ? 'Yes' : 'No'}`
              : 'Checking CLI status...'
          }
        >
          <span className={`h-2 w-2 rounded-full ${indicator.color}`} />
          {indicator.label}
          {cliStatus?.version && cliState === 'ready' && (
            <span className="text-slate-500 ml-1">v{cliStatus.version}</span>
          )}
        </span>

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
          <button
            type="button"
            onClick={handleStartRun}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300 transition-colors"
            title="Start a new coordinator run"
          >
            <FiPlay className="h-3 w-3" />
            Start Run
          </button>
        )}
      </div>
    </footer>
  );
}
