import { useEffect, useState } from 'react';

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

export function StatusBar() {
  const [cliStatus, setCliStatus] = useState<CliStatus | null>(null);
  const [loading, setLoading] = useState(true);

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

  const cliState = getCliState(cliStatus, loading);
  const indicator = getCliIndicator(cliState);

  return (
    <footer className="flex items-center justify-between border-t border-slate-700 bg-slate-950 px-4 py-1 text-xs text-slate-400">
      <div className="flex items-center gap-4">
        <span className="font-medium text-slate-300">Fleet Command</span>
        <span>Active Agents: 0</span>
      </div>
      <div className="flex items-center gap-4">
        <span
          className="flex items-center gap-1 cursor-default"
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
        <span>Run: —</span>
      </div>
    </footer>
  );
}
