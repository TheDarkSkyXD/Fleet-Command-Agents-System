import { useCallback, useState } from 'react';
import {
  FiAlertTriangle,
  FiCheck,
  FiDatabase,
  FiGitBranch,
  FiLoader,
  FiTrash2,
  FiX,
  FiZap,
} from 'react-icons/fi';
import { toast } from 'sonner';
import type { Worktree } from '../../../shared/types';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Checkbox } from '../../components/ui/checkbox';
import { Card, CardContent } from '../../components/ui/card';
import { Label } from '../../components/ui/label';
import { useProjectStore } from '../../stores/projectStore';
import { ConfirmDestructionDialog } from './components';
import type { CleanupResult, ConfirmDialogState } from './components';
import './NuclearCleanupPage.css';

export function NuclearCleanupPage() {
  const { activeProject } = useProjectStore();
  const [wipingSessions, setWipingSessions] = useState(false);
  const [sessionResult, setSessionResult] = useState<CleanupResult | null>(null);

  const [cleaningWorktrees, setCleaningWorktrees] = useState(false);
  const [worktreeResult, setWorktreeResult] = useState<CleanupResult | null>(null);
  const [worktreesToClean, setWorktreesToClean] = useState<Worktree[]>([]);
  const [loadingWorktrees, setLoadingWorktrees] = useState(false);
  const [forceUnmerged, setForceUnmerged] = useState(false);

  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    open: false,
    title: '',
    description: '',
    danger: '',
    onConfirm: () => {},
  });

  // ─── Feature #203: Wipe Sessions ───
  const handleWipeSessions = useCallback(() => {
    setConfirmDialog({
      open: true,
      title: 'Wipe All Sessions',
      description:
        'This will permanently delete ALL session records from the database. This includes all agent execution history, run records, and session metadata.',
      danger: 'This action cannot be undone.',
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, open: false }));
        setWipingSessions(true);
        setSessionResult(null);
        try {
          const result = await window.electronAPI.cleanupExecute({ target: 'sessions' });
          if (result.error) {
            setSessionResult({ type: 'error', message: result.error });
            toast.error('Failed to wipe sessions');
          } else {
            setSessionResult({
              type: 'success',
              message: 'All session records have been wiped from the database.',
            });
            toast.success('All session records wiped');
          }
        } catch (err) {
          setSessionResult({ type: 'error', message: String(err) });
          toast.error('Failed to wipe sessions');
        } finally {
          setWipingSessions(false);
        }
      },
    });
  }, []);

  // ─── Feature #204: Clean All Worktrees ───
  const loadWorktreeList = useCallback(async () => {
    if (!activeProject) return;
    setLoadingWorktrees(true);
    try {
      const result = await window.electronAPI.worktreeList(activeProject.path);
      if (result.data) {
        // Filter to non-main worktrees
        const nonMain = result.data.filter((w) => !w.isMain && !w.isBare);
        setWorktreesToClean(nonMain);
      }
    } catch {
      // ignore
    } finally {
      setLoadingWorktrees(false);
    }
  }, [activeProject]);

  const handleCleanAllWorktrees = useCallback(() => {
    if (!activeProject) return;

    // Load current worktrees to show in confirmation
    loadWorktreeList();

    setConfirmDialog({
      open: true,
      title: 'Clean All Worktrees',
      description:
        'This will remove all agent worktrees from the repository. Worktrees with active agents will be force-stopped first.',
      danger: 'Unmerged branches will be permanently deleted if force option is enabled.',
      forceOption: true,
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, open: false }));
        setCleaningWorktrees(true);
        setWorktreeResult(null);

        try {
          // Get the current list of worktrees
          const listResult = await window.electronAPI.worktreeList(activeProject.path);
          if (listResult.error || !listResult.data) {
            setWorktreeResult({
              type: 'error',
              message: listResult.error || 'Failed to list worktrees',
            });
            setCleaningWorktrees(false);
            return;
          }

          const nonMain = listResult.data.filter((w) => !w.isMain && !w.isBare);

          if (nonMain.length === 0) {
            setWorktreeResult({ type: 'success', message: 'No worktrees to clean.' });
            setCleaningWorktrees(false);
            return;
          }

          let removedCount = 0;
          const errors: string[] = [];

          for (const wt of nonMain) {
            try {
              if (!wt.isMerged && forceUnmerged) {
                // Force remove unmerged worktrees
                const removeResult = await window.electronAPI.worktreeForceRemove(
                  activeProject.path,
                  wt.path,
                );
                if (removeResult.error) {
                  errors.push(`${wt.branch || wt.path}: ${removeResult.error}`);
                } else {
                  removedCount++;
                }
              } else if (wt.isMerged || !wt.branch) {
                // Regular remove for merged worktrees
                const removeResult = await window.electronAPI.worktreeRemove(
                  activeProject.path,
                  wt.path,
                );
                if (removeResult.error) {
                  errors.push(`${wt.branch || wt.path}: ${removeResult.error}`);
                } else {
                  removedCount++;
                }
              } else {
                // Unmerged and force not enabled - skip
                errors.push(`${wt.branch}: skipped (unmerged, force not enabled)`);
              }
            } catch (err) {
              errors.push(`${wt.branch || wt.path}: ${String(err)}`);
            }
          }

          if (errors.length > 0) {
            const msg = `Removed ${removedCount} worktree(s). ${errors.length} issue(s): ${errors.join('; ')}`;
            setWorktreeResult({
              type: removedCount > 0 ? 'success' : 'error',
              message: msg,
            });
            if (removedCount > 0) toast.success(`Removed ${removedCount} worktree(s)`);
            else toast.error('Failed to clean worktrees');
          } else {
            setWorktreeResult({
              type: 'success',
              message: `Successfully removed all ${removedCount} worktree(s).`,
            });
            toast.success(`Removed all ${removedCount} worktree(s)`);
          }

          // Refresh the list
          setWorktreesToClean([]);
        } catch (err) {
          setWorktreeResult({ type: 'error', message: String(err) });
        } finally {
          setCleaningWorktrees(false);
        }
      },
    });
  }, [activeProject, forceUnmerged, loadWorktreeList]);

  const unmergedCount = worktreesToClean.filter((w) => !w.isMerged).length;

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="nuclear-cleanup-page">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/20">
          <FiZap size={22} className="text-red-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-50">Nuclear Cleanup</h1>
          <p className="text-sm text-slate-400">
            Destructive operations to reset system state. Use with caution.
          </p>
        </div>
      </div>

      {/* Warning Banner */}
      <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
        <FiAlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-400" />
        <div>
          <p className="text-sm font-medium text-amber-300">Danger Zone</p>
          <p className="text-sm text-amber-400/80">
            These operations permanently delete data and cannot be undone. Make sure you understand
            the impact before proceeding.
          </p>
        </div>
      </div>

      {/* Cleanup Cards */}
      <div className="grid gap-4">
        {/* Wipe Sessions Card */}
        <Card
          className="border-slate-700 bg-slate-800/50 p-0"
          data-testid="wipe-sessions-card"
        >
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-red-500/15">
                  <FiDatabase size={18} className="text-red-400" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-100">Wipe Sessions Database</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    Delete all session records from the database including agent execution history,
                    run records, PIDs, worktree assignments, and session metadata.
                  </p>
                </div>
              </div>
              <Button
                variant="destructive"
                data-testid="wipe-sessions-btn"
                onClick={handleWipeSessions}
                disabled={wipingSessions}
                className="ml-4 shrink-0 bg-red-600/15 text-red-400 border border-red-500/25 hover:bg-red-600/25 hover:text-red-300"
              >
                {wipingSessions ? (
                  <>
                    <FiLoader size={14} className="animate-spin" />
                    Wiping...
                  </>
                ) : (
                  <>
                    <FiTrash2 size={14} />
                    Wipe Sessions
                  </>
                )}
              </Button>
            </div>
            {sessionResult && (
              <div
                className={`mt-3 flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                  sessionResult.type === 'success'
                    ? 'bg-green-500/10 text-green-400 border border-green-500/30'
                    : 'bg-red-500/10 text-red-400 border border-red-500/30'
                }`}
                data-testid="wipe-sessions-result"
              >
                {sessionResult.type === 'success' ? <FiCheck size={14} /> : <FiX size={14} />}
                {sessionResult.message}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Clean All Worktrees Card */}
        <Card
          className="border-slate-700 bg-slate-800/50 p-0"
          data-testid="clean-worktrees-card"
        >
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-red-500/15">
                  <FiGitBranch size={18} className="text-red-400" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-100">Clean All Worktrees</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    Remove all agent worktrees from the repository. This cleans up all branches
                    created by agents for their isolated workspaces.
                  </p>
                  {!activeProject && (
                    <p className="mt-2 text-sm text-amber-400">
                      No active project selected. Select a project first.
                    </p>
                  )}
                </div>
              </div>
              <div className="ml-4 flex shrink-0 flex-col items-end gap-2">
                <Button
                  variant="destructive"
                  data-testid="clean-worktrees-btn"
                  onClick={handleCleanAllWorktrees}
                  disabled={cleaningWorktrees || !activeProject}
                  className="bg-red-600/15 text-red-400 border border-red-500/25 hover:bg-red-600/25 hover:text-red-300"
                >
                  {cleaningWorktrees ? (
                    <>
                      <FiLoader size={14} className="animate-spin" />
                      Cleaning...
                    </>
                  ) : (
                    <>
                      <FiTrash2 size={14} />
                      Clean All Worktrees
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Force option for unmerged branches */}
            {activeProject && (
              <div className="mt-3 flex items-center gap-2">
                <Label className="flex items-center gap-2 cursor-pointer" htmlFor="force-unmerged">
                  <Checkbox
                    id="force-unmerged"
                    data-testid="force-unmerged-checkbox"
                    checked={forceUnmerged}
                    onCheckedChange={(checked) => setForceUnmerged(checked === true)}
                    className="border-slate-600 data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500"
                  />
                  <span className="text-sm text-slate-300">Force remove unmerged branches</span>
                </Label>
                {forceUnmerged && (
                  <span className="text-xs text-amber-400 flex items-center gap-1">
                    <FiAlertTriangle size={12} />
                    Unmerged work will be permanently lost
                  </span>
                )}
              </div>
            )}

            {/* Worktree preview list */}
            {worktreesToClean.length > 0 && (
              <div className="mt-3 rounded-md border border-slate-600 bg-slate-900/50 p-3">
                <p className="text-xs font-medium text-slate-400 mb-2">
                  Worktrees to clean ({worktreesToClean.length} total
                  {unmergedCount > 0 && `, ${unmergedCount} unmerged`}):
                </p>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {worktreesToClean.map((wt) => (
                    <div
                      key={wt.path}
                      className="flex items-center gap-2 text-xs"
                      data-testid="worktree-item"
                    >
                      <FiGitBranch
                        size={12}
                        className={wt.isMerged ? 'text-green-400' : 'text-amber-400'}
                      />
                      <span
                        className="text-slate-300 font-mono truncate"
                        title={wt.branch || wt.path}
                      >
                        {wt.branch || wt.path}
                      </span>
                      {!wt.isMerged && (
                        <Badge variant="outline" className="shrink-0 bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px] px-1.5 py-0.5">
                          unmerged
                        </Badge>
                      )}
                      {wt.agentName && (
                        <Badge variant="outline" className="shrink-0 bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px] px-1.5 py-0.5">
                          {wt.agentName}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {loadingWorktrees && (
              <div className="mt-3 flex items-center gap-2 text-sm text-slate-400">
                <FiLoader size={14} className="animate-spin" />
                Loading worktree list...
              </div>
            )}

            {worktreeResult && (
              <div
                className={`mt-3 flex items-start gap-2 rounded-md px-3 py-2 text-sm ${
                  worktreeResult.type === 'success'
                    ? 'bg-green-500/10 text-green-400 border border-green-500/30'
                    : 'bg-red-500/10 text-red-400 border border-red-500/30'
                }`}
                data-testid="clean-worktrees-result"
              >
                {worktreeResult.type === 'success' ? (
                  <FiCheck size={14} className="mt-0.5 shrink-0" />
                ) : (
                  <FiX size={14} className="mt-0.5 shrink-0" />
                )}
                <span>{worktreeResult.message}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Nuclear Cleanup Confirmation Dialog - Styled with prominent danger warnings */}
      <ConfirmDestructionDialog
        confirmDialog={confirmDialog}
        forceUnmerged={forceUnmerged}
        onForceUnmergedChange={setForceUnmerged}
        onClose={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
      />
    </div>
  );
}
