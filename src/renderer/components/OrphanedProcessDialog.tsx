import { useCallback, useEffect, useState } from 'react';
import {
  FiAlertTriangle,
  FiLink,
  FiRefreshCw,
  FiSkipForward,
  FiX,
  FiXCircle,
} from 'react-icons/fi';
import type { OrphanedProcess } from '../../shared/types';

/**
 * OrphanedProcessDialog detects agent processes still running without app connection
 * and offers the user the choice to reconnect or kill them.
 * Shown on app startup when orphaned processes are detected.
 */
export function OrphanedProcessDialog() {
  const [orphans, setOrphans] = useState<OrphanedProcess[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<Record<string, string>>({});

  // Detect orphans on mount (app startup)
  useEffect(() => {
    let cancelled = false;
    const detect = async () => {
      try {
        const result = await window.electronAPI.orphanDetect();
        if (!cancelled && result.data) {
          setOrphans(result.data);
        }
      } catch {
        // Silent fail - orphan detection is non-critical
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    // Small delay to let app finish initializing
    const timer = setTimeout(detect, 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const handleReconnect = useCallback(async (orphan: OrphanedProcess) => {
    setActionInProgress((prev) => ({ ...prev, [orphan.sessionId]: 'reconnecting' }));
    try {
      const result = await window.electronAPI.orphanReconnect(orphan.sessionId);
      if (result.data?.reconnected) {
        setOrphans((prev) => prev.filter((o) => o.sessionId !== orphan.sessionId));
      } else {
        // Process died between detection and reconnect attempt
        setOrphans((prev) =>
          prev.map((o) => (o.sessionId === orphan.sessionId ? { ...o, processAlive: false } : o)),
        );
      }
    } catch {
      // ignore
    } finally {
      setActionInProgress((prev) => {
        const next = { ...prev };
        delete next[orphan.sessionId];
        return next;
      });
    }
  }, []);

  const handleKill = useCallback(async (orphan: OrphanedProcess) => {
    setActionInProgress((prev) => ({ ...prev, [orphan.sessionId]: 'killing' }));
    try {
      await window.electronAPI.orphanKill(orphan.sessionId, orphan.pid);
      setOrphans((prev) => prev.filter((o) => o.sessionId !== orphan.sessionId));
    } catch {
      // ignore
    } finally {
      setActionInProgress((prev) => {
        const next = { ...prev };
        delete next[orphan.sessionId];
        return next;
      });
    }
  }, []);

  const handleDismiss = useCallback(async (orphan: OrphanedProcess) => {
    try {
      await window.electronAPI.orphanDismiss(orphan.sessionId);
      setOrphans((prev) => prev.filter((o) => o.sessionId !== orphan.sessionId));
    } catch {
      // ignore
    }
  }, []);

  const handleDismissAll = useCallback(() => {
    // Dismiss all non-alive orphans silently
    for (const orphan of orphans) {
      if (!orphan.processAlive) {
        window.electronAPI.orphanDismiss(orphan.sessionId);
      }
    }
    setDismissed(true);
  }, [orphans]);

  // Don't show if loading, dismissed, or no orphans
  if (loading || dismissed || orphans.length === 0) return null;

  const aliveOrphans = orphans.filter((o) => o.processAlive);
  const deadOrphans = orphans.filter((o) => !o.processAlive);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleDismissAll();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') handleDismissAll();
      }}
      data-testid="orphan-dialog"
    >
      <div className="relative mx-4 flex max-h-[80vh] w-full max-w-xl flex-col rounded-xl bg-gray-900 border border-gray-700 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-700 px-6 py-4">
          <div className="flex items-center gap-3">
            <FiAlertTriangle className="h-5 w-5 text-amber-400" />
            <div>
              <h2 className="text-lg font-semibold text-white">Orphaned Agent Processes</h2>
              <p className="text-xs text-gray-400">
                {orphans.length} process{orphans.length !== 1 ? 'es' : ''} found from a previous
                session
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDismissAll}
            className="rounded p-1.5 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
            title="Dismiss"
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {/* Alive orphans (actionable) */}
          {aliveOrphans.length > 0 && (
            <>
              <p className="text-xs font-medium text-green-400 uppercase tracking-wider">
                Still Running ({aliveOrphans.length})
              </p>
              {aliveOrphans.map((orphan) => {
                const action = actionInProgress[orphan.sessionId];
                return (
                  <div
                    key={orphan.sessionId}
                    className="rounded-lg border border-green-500/20 bg-green-500/5 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-white truncate">
                            {orphan.agentName}
                          </span>
                          <span className="inline-flex items-center rounded-full bg-green-500/20 px-2 py-0.5 text-xs text-green-300">
                            PID {orphan.pid}
                          </span>
                          <span className="inline-flex items-center rounded-full bg-slate-600 px-2 py-0.5 text-xs text-slate-300">
                            {orphan.capability}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                          Started {new Date(orphan.createdAt).toLocaleString()} &middot;{' '}
                          {orphan.model}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleReconnect(orphan)}
                          disabled={!!action}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-500 transition-colors disabled:opacity-50"
                          title="Reconnect - track this process in the app"
                        >
                          {action === 'reconnecting' ? (
                            <FiRefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <FiLink className="w-3 h-3" />
                          )}
                          Reconnect
                        </button>
                        <button
                          type="button"
                          onClick={() => handleKill(orphan)}
                          disabled={!!action}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 transition-colors disabled:opacity-50"
                          title="Kill - terminate the process"
                        >
                          {action === 'killing' ? (
                            <FiRefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <FiXCircle className="w-3 h-3" />
                          )}
                          Kill
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {/* Dead orphans (informational) */}
          {deadOrphans.length > 0 && (
            <>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mt-2">
                No Longer Running ({deadOrphans.length})
              </p>
              {deadOrphans.map((orphan) => (
                <div
                  key={orphan.sessionId}
                  className="rounded-lg border border-slate-700 bg-slate-800/50 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-300 truncate">
                          {orphan.agentName}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-gray-600 px-2 py-0.5 text-xs text-gray-400">
                          PID {orphan.pid} (dead)
                        </span>
                        <span className="inline-flex items-center rounded-full bg-slate-600 px-2 py-0.5 text-xs text-slate-300">
                          {orphan.capability}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Started {new Date(orphan.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDismiss(orphan)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 transition-colors"
                      title="Dismiss - mark session as completed"
                    >
                      <FiSkipForward className="w-3 h-3" />
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-700 px-6 py-3 flex justify-end">
          <button
            type="button"
            onClick={handleDismissAll}
            className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-white hover:bg-gray-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
