import { useCallback, useEffect, useState } from 'react';
import {
  FiAlertTriangle,
  FiLink,
  FiRefreshCw,
  FiSkipForward,
  FiXCircle,
} from 'react-icons/fi';
import type { OrphanedProcess } from '../../../shared/types';
import { formatDateTime } from '../../lib/dateFormatting';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { ScrollArea } from '../ui/scroll-area';
import './OrphanedProcessDialog.css';

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
  const [killConfirm, setKillConfirm] = useState<OrphanedProcess | null>(null);

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
    <Dialog open onOpenChange={(open) => { if (!open) handleDismissAll(); }}>
      <DialogContent className="max-w-xl max-h-[80vh] flex flex-col" data-testid="orphan-dialog">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <FiAlertTriangle className="h-5 w-5 text-amber-400" />
            <div>
              <DialogTitle>Orphaned Agent Processes</DialogTitle>
              <DialogDescription>
                {orphans.length} process{orphans.length !== 1 ? 'es' : ''} found from a previous
                session
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 max-h-[50vh]">
        <div className="px-2 py-4 space-y-3">
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
                          <span
                            className="text-sm font-semibold text-white truncate"
                            title={orphan.agentName}
                          >
                            {orphan.agentName}
                          </span>
                          <Badge variant="outline" className="bg-green-500/20 text-green-300 border-green-500/30">
                            PID {orphan.pid}
                          </Badge>
                          <Badge variant="secondary" className="bg-slate-600 text-slate-300">
                            {orphan.capability}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                          Started {formatDateTime(orphan.createdAt)} &middot;{' '}
                          {orphan.model}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          onClick={() => handleReconnect(orphan)}
                          disabled={!!action}
                          className="inline-flex items-center gap-1.5 bg-blue-600/15 text-blue-400 border border-blue-500/25 hover:bg-blue-600/25 hover:text-blue-300"
                          title="Reconnect - track this process in the app"
                        >
                          {action === 'reconnecting' ? (
                            <FiRefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <FiLink className="w-3 h-3" />
                          )}
                          Reconnect
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => setKillConfirm(orphan)}
                          disabled={!!action}
                          className="inline-flex items-center gap-1.5 bg-red-600/15 text-red-400 border border-red-500/25 hover:bg-red-600/25 hover:text-red-300"
                          title="Kill - terminate the process"
                          data-testid="orphan-kill-btn"
                        >
                          {action === 'killing' ? (
                            <FiRefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <FiXCircle className="w-3 h-3" />
                          )}
                          Kill
                        </Button>
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
                        <span
                          className="text-sm font-medium text-gray-300 truncate"
                          title={orphan.agentName}
                        >
                          {orphan.agentName}
                        </span>
                        <Badge variant="secondary" className="bg-gray-600 text-gray-400">
                          PID {orphan.pid} (dead)
                        </Badge>
                        <Badge variant="secondary" className="bg-slate-600 text-slate-300">
                          {orphan.capability}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Started {formatDateTime(orphan.createdAt)}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDismiss(orphan)}
                      className="inline-flex items-center gap-1.5"
                      title="Dismiss - mark session as completed"
                    >
                      <FiSkipForward className="w-3 h-3" />
                      Dismiss
                    </Button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="secondary" onClick={handleDismissAll}>
            Close
          </Button>
        </DialogFooter>

        {/* Kill Confirmation Dialog */}
        {killConfirm && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={(e) => {
              if (e.target === e.currentTarget) setKillConfirm(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setKillConfirm(null);
            }}
            data-testid="orphan-kill-confirm-dialog"
          >
            <div className="mx-4 w-full max-w-md rounded-xl border border-red-500/30 bg-gray-900 p-6 shadow-2xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10">
                  <FiXCircle className="h-5 w-5 text-red-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Kill Process</h3>
                  <p className="text-sm text-gray-400">This action cannot be undone</p>
                </div>
              </div>
              <p className="text-sm text-gray-300 mb-2">
                Are you sure you want to terminate the agent process{' '}
                <span className="font-semibold text-white">"{killConfirm.agentName}"</span> (PID{' '}
                {killConfirm.pid})?
              </p>
              <p className="text-xs text-red-400/80 mb-6">
                The process will be forcefully killed using tree-kill. Any unsaved work will be
                lost.
              </p>
              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => setKillConfirm(null)}
                  data-testid="orphan-kill-cancel"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    const orphan = killConfirm;
                    setKillConfirm(null);
                    handleKill(orphan);
                  }}
                  className="bg-red-600/15 text-red-400 border border-red-500/25 hover:bg-red-600/25 hover:text-red-300"
                  data-testid="orphan-kill-confirm"
                >
                  Kill Process
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
