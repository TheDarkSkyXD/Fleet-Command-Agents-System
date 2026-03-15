import { useCallback, useEffect, useState } from 'react';
import { FiFolder, FiGitBranch, FiGitCommit, FiRefreshCw, FiUser } from 'react-icons/fi';
import type { Worktree } from '../../shared/types';
import { useProjectStore } from '../stores/projectStore';

export function WorktreesPage() {
  const { activeProject } = useProjectStore();
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-50">Worktrees</h1>
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
              className="rounded-lg border border-slate-700 bg-slate-800 p-4 hover:border-slate-600 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                {/* Left side: branch + path */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <FiGitBranch size={16} className="text-blue-400 shrink-0" />
                    <span className="font-medium text-slate-100 truncate">
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
                      <span className="text-xs text-slate-500 truncate">{wt.headMessage}</span>
                    )}
                  </div>

                  {/* Path */}
                  <div className="flex items-center gap-2">
                    <FiFolder size={13} className="text-slate-500 shrink-0" />
                    <span className="text-xs text-slate-500 truncate font-mono">{wt.path}</span>
                  </div>
                </div>

                {/* Right side: status + agent */}
                <div className="flex flex-col items-end gap-2 shrink-0">
                  {/* Status badge */}
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${statusColor(wt.status)}`}
                  >
                    {statusLabel(wt.status)}
                  </span>

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
        </div>
      )}
    </div>
  );
}
