import { useCallback, useEffect, useState } from 'react';
import {
  FiAlertTriangle,
  FiCheck,
  FiCode,
  FiExternalLink,
  FiFolder,
  FiFolderPlus,
  FiGitBranch,
  FiGitCommit,
  FiGitMerge,
  FiRefreshCw,
  FiTrash2,
  FiUser,
  FiX,
} from 'react-icons/fi';
import { toast } from 'sonner';
import type { Worktree } from '../../shared/types';
import { ContextMenu, type ContextMenuItem, useContextMenu } from '../components/ContextMenu';
import { useProjectStore } from '../stores/projectStore';

export function WorktreesPage() {
  const { activeProject } = useProjectStore();
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingPaths, setRemovingPaths] = useState<Set<string>>(new Set());
  const [cleaningAll, setCleaningAll] = useState(false);
  const [initializingOverstory, setInitializingOverstory] = useState(false);
  const [overstoryStatus, setOverstoryStatus] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);
  const [cleanResult, setCleanResult] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [forceRemoveTarget, setForceRemoveTarget] = useState<Worktree | null>(null);
  const [forceRemoving, setForceRemoving] = useState(false);

  const loadWorktrees = useCallback(async () => {
    if (!activeProject) {
      setWorktrees([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.worktreeList(activeProject.path);
      if (result.error) {
        setError(result.error);
        setWorktrees([]);
      } else {
        setWorktrees(result.data || []);
      }
    } catch (err) {
      setError(String(err));
      setWorktrees([]);
    } finally {
      setLoading(false);
    }
  }, [activeProject]);

  useEffect(() => {
    loadWorktrees();
  }, [loadWorktrees]);

  // Clear status messages after a few seconds
  useEffect(() => {
    if (overstoryStatus) {
      const timer = setTimeout(() => setOverstoryStatus(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [overstoryStatus]);

  useEffect(() => {
    if (cleanResult) {
      const timer = setTimeout(() => setCleanResult(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [cleanResult]);

  const handleInitOverstory = useCallback(async () => {
    if (!activeProject) return;
    setInitializingOverstory(true);
    setOverstoryStatus(null);
    try {
      const result = await window.electronAPI.projectInitOverstory(activeProject.path);
      if (result.error) {
        setOverstoryStatus({ type: 'error', message: result.error });
        toast.error(result.error);
      } else if (result.data?.alreadyExisted) {
        setOverstoryStatus({
          type: 'info',
          message: '.overstory/ directory already exists for this project.',
        });
        toast.info('.overstory/ directory already exists');
      } else {
        setOverstoryStatus({
          type: 'success',
          message: '.overstory/ directory initialized successfully!',
        });
        toast.success('.overstory/ initialized successfully');
      }
    } catch (err) {
      setOverstoryStatus({ type: 'error', message: String(err) });
      toast.error('Failed to initialize .overstory/');
    } finally {
      setInitializingOverstory(false);
    }
  }, [activeProject]);

  const handleRemoveWorktree = useCallback(
    async (worktreePath: string) => {
      if (!activeProject) return;
      setRemovingPaths((prev) => new Set(prev).add(worktreePath));
      setCleanResult(null);
      try {
        const result = await window.electronAPI.worktreeRemove(activeProject.path, worktreePath);
        if (result.error) {
          setCleanResult({ type: 'error', message: `Failed to remove: ${result.error}` });
          toast.error('Failed to remove worktree');
        } else {
          setCleanResult({ type: 'success', message: `Removed worktree: ${worktreePath}` });
          toast.success('Worktree removed');
          await loadWorktrees();
        }
      } catch (err) {
        setCleanResult({ type: 'error', message: String(err) });
        toast.error('Failed to remove worktree');
      } finally {
        setRemovingPaths((prev) => {
          const next = new Set(prev);
          next.delete(worktreePath);
          return next;
        });
      }
    },
    [activeProject, loadWorktrees],
  );

  const handleCleanAllCompleted = useCallback(async () => {
    if (!activeProject) return;
    setCleaningAll(true);
    setCleanResult(null);
    try {
      const result = await window.electronAPI.worktreeCleanCompleted(activeProject.path);
      if (result.error) {
        setCleanResult({ type: 'error', message: result.error });
      } else if (result.data) {
        const { removed, errors } = result.data;
        if (removed.length === 0 && errors.length === 0) {
          setCleanResult({
            type: 'success',
            message: 'No completed worktrees to clean up.',
          });
        } else {
          const msg = [`Removed ${removed.length} worktree${removed.length !== 1 ? 's' : ''}.`];
          if (errors.length > 0) {
            msg.push(`${errors.length} failed.`);
          }
          setCleanResult({
            type: errors.length > 0 ? 'error' : 'success',
            message: msg.join(' '),
          });
        }
        await loadWorktrees();
      }
    } catch (err) {
      setCleanResult({ type: 'error', message: String(err) });
    } finally {
      setCleaningAll(false);
    }
  }, [activeProject, loadWorktrees]);

  const handleForceRemoveWorktree = useCallback(
    async (wt: Worktree) => {
      if (!activeProject) return;
      // If unmerged, show confirmation dialog
      if (!wt.isMerged) {
        setForceRemoveTarget(wt);
        return;
      }
      // If merged, just do normal remove
      handleRemoveWorktree(wt.path);
    },
    [activeProject, handleRemoveWorktree],
  );

  const confirmForceRemove = useCallback(async () => {
    if (!activeProject || !forceRemoveTarget) return;
    setForceRemoving(true);
    setCleanResult(null);
    try {
      const result = await window.electronAPI.worktreeForceRemove(
        activeProject.path,
        forceRemoveTarget.path,
      );
      if (result.error) {
        setCleanResult({ type: 'error', message: `Force remove failed: ${result.error}` });
      } else {
        const branchMsg = result.data?.branchDeleted
          ? ` Branch "${forceRemoveTarget.branch}" deleted.`
          : '';
        setCleanResult({
          type: 'success',
          message: `Force removed worktree: ${forceRemoveTarget.path}.${branchMsg}`,
        });
        await loadWorktrees();
      }
    } catch (err) {
      setCleanResult({ type: 'error', message: String(err) });
    } finally {
      setForceRemoving(false);
      setForceRemoveTarget(null);
    }
  }, [activeProject, forceRemoveTarget, loadWorktrees]);

  const handleOpenVSCode = useCallback(async (worktreePath: string) => {
    try {
      const result = await window.electronAPI.worktreeOpenVSCode(worktreePath);
      if (result.error) {
        setCleanResult({ type: 'error', message: result.error });
      }
    } catch (err) {
      setCleanResult({ type: 'error', message: `Failed to open VS Code: ${String(err)}` });
    }
  }, []);

  const handleOpenExplorer = useCallback(async (worktreePath: string) => {
    try {
      const result = await window.electronAPI.worktreeOpenExplorer(worktreePath);
      if (result.error) {
        setCleanResult({ type: 'error', message: result.error });
      }
    } catch (err) {
      setCleanResult({ type: 'error', message: `Failed to open explorer: ${String(err)}` });
    }
  }, []);

  // Context menu for right-click on worktree cards
  const { menu: contextMenu, show: showContextMenu, hide: hideContextMenu } = useContextMenu();

  const handleWorktreeContextMenu = useCallback(
    (e: React.MouseEvent, wt: Worktree) => {
      const items: ContextMenuItem[] = [
        {
          id: 'open-vscode',
          label: 'Open in VS Code',
          icon: <FiCode size={14} />,
          onClick: () => handleOpenVSCode(wt.path),
        },
        {
          id: 'open-explorer',
          label: 'Open in Explorer',
          icon: <FiExternalLink size={14} />,
          onClick: () => handleOpenExplorer(wt.path),
        },
      ];

      // Add cleanup option for non-main, unassigned worktrees
      if (!wt.isMain && !wt.agentName) {
        items.push({
          id: 'separator-cleanup',
          label: '',
          separator: true,
          onClick: () => {},
        });
        items.push({
          id: 'clean-up',
          label: wt.isMerged ? 'Clean Up' : 'Force Remove',
          icon: <FiTrash2 size={14} />,
          danger: true,
          disabled: removingPaths.has(wt.path),
          onClick: () => {
            if (wt.isMerged) {
              handleRemoveWorktree(wt.path);
            } else {
              handleForceRemoveWorktree(wt);
            }
          },
        });
      }

      showContextMenu(e, items);
    },
    [
      handleOpenVSCode,
      handleOpenExplorer,
      handleRemoveWorktree,
      handleForceRemoveWorktree,
      removingPaths,
      showContextMenu,
    ],
  );

  const statusColor = (status: Worktree['status']) => {
    switch (status) {
      case 'clean':
        return 'text-green-400 bg-green-400/10 border-green-400/30';
      case 'dirty':
        return 'text-amber-400 bg-amber-400/10 border-amber-400/30';
      default:
        return 'text-slate-400 bg-slate-400/10 border-slate-400/30';
    }
  };

  const statusLabel = (status: Worktree['status']) => {
    switch (status) {
      case 'clean':
        return 'Clean';
      case 'dirty':
        return 'Modified';
      default:
        return 'Unknown';
    }
  };

  // Count non-main worktrees without active agents (candidates for cleanup)
  const completedWorktrees = worktrees.filter((w) => !w.isMain && !w.agentName);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-50">Worktrees</h1>
        <div className="flex items-center gap-2">
          {/* Initialize .overstory button */}
          {activeProject && (
            <button
              type="button"
              onClick={handleInitOverstory}
              disabled={initializingOverstory}
              className="flex items-center gap-2 rounded-md bg-emerald-600/20 px-3 py-1.5 text-sm text-emerald-400 hover:bg-emerald-600/30 hover:text-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-emerald-500/30"
            >
              <FiFolderPlus size={14} className={initializingOverstory ? 'animate-pulse' : ''} />
              Initialize .overstory
            </button>
          )}
          {/* Clean all completed button */}
          {activeProject && completedWorktrees.length > 0 && (
            <button
              type="button"
              onClick={handleCleanAllCompleted}
              disabled={cleaningAll}
              className="flex items-center gap-2 rounded-md bg-red-600/20 px-3 py-1.5 text-sm text-red-400 hover:bg-red-600/30 hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-red-500/30"
            >
              <FiTrash2 size={14} className={cleaningAll ? 'animate-spin' : ''} />
              {cleaningAll ? 'Cleaning...' : `Clean All Completed (${completedWorktrees.length})`}
            </button>
          )}
          <button
            type="button"
            onClick={loadWorktrees}
            disabled={loading || !activeProject}
            className="flex items-center gap-2 rounded-md bg-slate-800 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700 hover:text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-slate-700"
          >
            <FiRefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Overstory initialization status */}
      {overstoryStatus && (
        <div
          className={`rounded-lg border p-3 text-sm flex items-center gap-2 ${
            overstoryStatus.type === 'success'
              ? 'border-green-500/30 bg-green-500/10 text-green-400'
              : overstoryStatus.type === 'info'
                ? 'border-blue-500/30 bg-blue-500/10 text-blue-400'
                : 'border-red-500/30 bg-red-500/10 text-red-400'
          }`}
        >
          {overstoryStatus.type === 'success' ? (
            <FiCheck size={16} />
          ) : overstoryStatus.type === 'error' ? (
            <FiAlertTriangle size={16} />
          ) : (
            <FiFolder size={16} />
          )}
          {overstoryStatus.message}
        </div>
      )}

      {/* Clean result status */}
      {cleanResult && (
        <div
          className={`rounded-lg border p-3 text-sm flex items-center gap-2 ${
            cleanResult.type === 'success'
              ? 'border-green-500/30 bg-green-500/10 text-green-400'
              : 'border-red-500/30 bg-red-500/10 text-red-400'
          }`}
        >
          {cleanResult.type === 'success' ? <FiCheck size={16} /> : <FiAlertTriangle size={16} />}
          {cleanResult.message}
        </div>
      )}

      {!activeProject && (
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center">
          <FiFolder size={32} className="mx-auto mb-3 text-slate-500" />
          <p className="text-slate-400 text-lg mb-1">No Project Selected</p>
          <p className="text-slate-500 text-sm">
            Select a project from the sidebar to view its worktrees.
          </p>
        </div>
      )}

      {activeProject && error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-400 text-sm">
          <p className="font-medium mb-1">Failed to load worktrees</p>
          <p className="text-red-400/70">{error}</p>
        </div>
      )}

      {activeProject && !error && worktrees.length === 0 && !loading && (
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center">
          <FiGitBranch size={32} className="mx-auto mb-3 text-slate-500" />
          <p className="text-slate-400 text-lg mb-1">No Worktrees Found</p>
          <p className="text-slate-500 text-sm">
            This project has no git worktrees configured. The main working directory will appear
            when the repo is initialized.
          </p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <FiRefreshCw size={24} className="animate-spin text-blue-400" />
          <span className="ml-3 text-slate-400">Loading worktrees...</span>
        </div>
      )}

      {/* Worktree cards */}
      {!loading && worktrees.length > 0 && (
        <div className="grid gap-3">
          {worktrees.map((wt) => (
            <div
              key={wt.path}
              onContextMenu={(e) => handleWorktreeContextMenu(e, wt)}
              className="rounded-lg border border-slate-700 bg-slate-800 p-4 hover:border-slate-600 transition-colors cursor-context-menu"
              data-testid={`worktree-card-${wt.branch || 'detached'}`}
            >
              <div className="flex items-start justify-between gap-4">
                {/* Left side: branch + path */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <FiGitBranch size={16} className="text-blue-400 shrink-0" />
                    <span
                      className="font-medium text-slate-100 truncate"
                      title={wt.branch || '(detached HEAD)'}
                    >
                      {wt.branch || '(detached HEAD)'}
                    </span>
                    {wt.isMain && (
                      <span className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium bg-blue-600/20 text-blue-400 border border-blue-500/30">
                        main
                      </span>
                    )}
                  </div>

                  {/* HEAD commit */}
                  <div className="flex items-center gap-2 mb-2">
                    <FiGitCommit size={14} className="text-slate-500 shrink-0" />
                    <code className="text-xs text-slate-400 font-mono">
                      {wt.headCommitShort || 'unknown'}
                    </code>
                    {wt.headMessage && (
                      <span className="text-xs text-slate-500 truncate" title={wt.headMessage}>
                        {wt.headMessage}
                      </span>
                    )}
                  </div>

                  {/* Path */}
                  <div className="flex items-center gap-2">
                    <FiFolder size={13} className="text-slate-500 shrink-0" />
                    <span className="text-xs text-slate-500 truncate font-mono" title={wt.path}>
                      {wt.path}
                    </span>
                  </div>
                </div>

                {/* Right side: status + agent + actions */}
                <div className="flex flex-col items-end gap-2 shrink-0">
                  {/* Status badges */}
                  <div className="flex items-center gap-1.5">
                    {/* Merged/Unmerged badge */}
                    {!wt.isMain && wt.branch && (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border ${
                          wt.isMerged
                            ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30'
                            : 'text-orange-400 bg-orange-400/10 border-orange-400/30'
                        }`}
                      >
                        <FiGitMerge size={10} />
                        {wt.isMerged ? 'Merged' : 'Unmerged'}
                      </span>
                    )}
                    {/* Clean/dirty status badge */}
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${statusColor(wt.status)}`}
                    >
                      {statusLabel(wt.status)}
                    </span>
                  </div>

                  {/* Agent assignment */}
                  {wt.agentName ? (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                      <FiUser size={12} />
                      <span>{wt.agentName}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-xs text-slate-600">
                      <FiUser size={12} />
                      <span>Unassigned</span>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center gap-1.5">
                    {/* Open in Explorer button */}
                    <button
                      type="button"
                      onClick={() => handleOpenExplorer(wt.path)}
                      className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-purple-400 hover:bg-purple-500/20 hover:text-purple-300 transition-colors border border-purple-500/20"
                      title="Open in file explorer"
                    >
                      <FiExternalLink size={11} />
                      Explorer
                    </button>

                    {/* Open in VS Code button */}
                    <button
                      type="button"
                      onClick={() => handleOpenVSCode(wt.path)}
                      className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-blue-400 hover:bg-blue-500/20 hover:text-blue-300 transition-colors border border-blue-500/20"
                      title="Open in VS Code"
                    >
                      <FiCode size={11} />
                      VS Code
                    </button>

                    {/* Remove button - show for non-main, unassigned worktrees */}
                    {!wt.isMain && !wt.agentName && (
                      <button
                        type="button"
                        onClick={() =>
                          wt.isMerged
                            ? handleRemoveWorktree(wt.path)
                            : handleForceRemoveWorktree(wt)
                        }
                        disabled={removingPaths.has(wt.path)}
                        className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed transition-colors border ${
                          !wt.isMerged
                            ? 'text-orange-400 hover:bg-orange-500/20 hover:text-orange-300 border-orange-500/20'
                            : 'text-red-400 hover:bg-red-500/20 hover:text-red-300 border-red-500/20'
                        }`}
                        title={
                          !wt.isMerged ? 'Force remove (unmerged branch)' : 'Remove this worktree'
                        }
                      >
                        <FiTrash2
                          size={11}
                          className={removingPaths.has(wt.path) ? 'animate-spin' : ''}
                        />
                        {removingPaths.has(wt.path)
                          ? 'Removing...'
                          : !wt.isMerged
                            ? 'Force Remove'
                            : 'Clean'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Summary */}
      {!loading && worktrees.length > 0 && (
        <div className="flex items-center gap-4 text-xs text-slate-500 pt-2">
          <span>
            {worktrees.length} worktree{worktrees.length !== 1 ? 's' : ''}
          </span>
          <span>{worktrees.filter((w) => w.status === 'clean').length} clean</span>
          <span>{worktrees.filter((w) => w.status === 'dirty').length} modified</span>
          <span>{worktrees.filter((w) => w.agentName).length} assigned</span>
          {completedWorktrees.length > 0 && (
            <span className="text-red-400/70">
              {completedWorktrees.length} available for cleanup
            </span>
          )}
        </div>
      )}

      {/* Right-click context menu */}
      <ContextMenu menu={contextMenu} onClose={hideContextMenu} />

      {/* Force Remove Confirmation Dialog */}
      {forceRemoveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-orange-500/30 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-start gap-3 mb-4">
              <div className="rounded-full bg-orange-500/20 p-2">
                <FiAlertTriangle size={20} className="text-orange-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-100">
                  Force Remove Unmerged Worktree?
                </h3>
                <p className="mt-1 text-sm text-slate-400">
                  This worktree has an{' '}
                  <span className="text-orange-400 font-medium">unmerged branch</span> that has not
                  been merged into the main branch. Removing it will permanently delete all unmerged
                  changes.
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3 mb-4 space-y-1.5">
              <div className="flex items-center gap-2 text-sm">
                <FiGitBranch size={14} className="text-blue-400" />
                <span className="text-slate-300 font-mono text-xs">
                  {forceRemoveTarget.branch || '(detached)'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <FiFolder size={14} className="text-slate-500" />
                <span
                  className="text-slate-400 font-mono text-xs truncate"
                  title={forceRemoveTarget.path}
                >
                  {forceRemoveTarget.path}
                </span>
              </div>
              {forceRemoveTarget.headMessage && (
                <div className="flex items-center gap-2 text-sm">
                  <FiGitCommit size={14} className="text-slate-500" />
                  <span
                    className="text-slate-500 text-xs truncate"
                    title={forceRemoveTarget.headMessage}
                  >
                    {forceRemoveTarget.headMessage}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setForceRemoveTarget(null)}
                disabled={forceRemoving}
                className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 transition-colors border border-slate-700"
              >
                <FiX size={14} />
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmForceRemove}
                disabled={forceRemoving}
                className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-orange-100 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <FiTrash2 size={14} className={forceRemoving ? 'animate-spin' : ''} />
                {forceRemoving ? 'Removing...' : 'Force Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
