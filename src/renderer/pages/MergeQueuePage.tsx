import { useCallback, useEffect, useState } from 'react';
import type { MergeQueueEntry, MergeResolutionTier, MergeStatus } from '../../shared/types';
import { DiffViewer } from '../components/DiffViewer';
import { useMergeStore } from '../stores/mergeStore';

const TIER_COLORS: Record<MergeResolutionTier, string> = {
  'clean-merge': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'auto-resolve': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'ai-resolve': 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  reimagine: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
};

const TIER_LABELS: Record<MergeResolutionTier, string> = {
  'clean-merge': 'Tier 1: Clean Merge',
  'auto-resolve': 'Tier 2: Auto-Resolve',
  'ai-resolve': 'Tier 3: AI-Resolve',
  reimagine: 'Tier 4: Reimagine',
};

const TIER_ICONS: Record<MergeResolutionTier, string> = {
  'clean-merge': '\u2714',
  'auto-resolve': '\u2699',
  'ai-resolve': '\u2728',
  reimagine: '\u267B',
};

function TierBadge({ tier }: { tier: MergeResolutionTier }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${TIER_COLORS[tier]}`}
    >
      <span>{TIER_ICONS[tier]}</span>
      {TIER_LABELS[tier]}
    </span>
  );
}

function OutcomeBadge({ status }: { status: MergeStatus }) {
  if (status === 'merged') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">
        <span>\u2714</span> Success
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-400">
        <span>\u2718</span> Failed
      </span>
    );
  }
  if (status === 'conflict') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400">
        <span>\u26A0</span> Conflict
      </span>
    );
  }
  return <StatusBadge status={status} />;
}

function HistoryEntryRow({
  entry,
  onViewDiff,
}: {
  entry: MergeQueueEntry;
  onViewDiff: (id: number) => void;
}) {
  const filesModified = entry.files_modified ? (JSON.parse(entry.files_modified) as string[]) : [];
  const completedDate = entry.completed_at ? new Date(entry.completed_at) : null;
  const enqueuedDate = new Date(entry.enqueued_at);

  return (
    <div
      className={`rounded-lg border bg-slate-800/50 hover:bg-slate-800 transition-colors ${
        entry.status === 'merged'
          ? 'border-emerald-700/40'
          : entry.status === 'failed'
            ? 'border-red-700/40'
            : 'border-amber-700/40'
      }`}
    >
      <div className="flex items-start justify-between p-4">
        <div className="flex items-start gap-4 min-w-0 flex-1">
          {/* Outcome icon */}
          <div
            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg ${
              entry.status === 'merged'
                ? 'bg-emerald-500/20 text-emerald-400'
                : entry.status === 'failed'
                  ? 'bg-red-500/20 text-red-400'
                  : 'bg-amber-500/20 text-amber-400'
            }`}
          >
            {entry.status === 'merged' ? '\u2714' : entry.status === 'failed' ? '\u2718' : '\u26A0'}
          </div>

          <div className="min-w-0 flex-1">
            {/* Branch name + outcome */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm text-slate-50 truncate">{entry.branch_name}</span>
              <OutcomeBadge status={entry.status} />
            </div>

            {/* Tier badge (prominent) */}
            <div className="mt-2">
              {entry.resolved_tier ? (
                <TierBadge tier={entry.resolved_tier} />
              ) : (
                <span className="inline-flex items-center rounded-full border border-slate-600 bg-slate-700/50 px-3 py-1 text-xs text-slate-400">
                  No resolution tier
                </span>
              )}
            </div>

            {/* Metadata row */}
            <div className="mt-2 flex items-center gap-3 text-xs text-slate-400 flex-wrap">
              {entry.agent_name && (
                <span className="inline-flex items-center gap-1">
                  <span className="text-slate-500">Agent:</span> {entry.agent_name}
                </span>
              )}
              {entry.task_id && (
                <span className="inline-flex items-center gap-1">
                  <span className="text-slate-500">Task:</span> {entry.task_id}
                </span>
              )}
              {filesModified.length > 0 && (
                <span className="text-slate-500">
                  {filesModified.length} file{filesModified.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {/* Timestamps */}
            <div className="mt-1.5 flex items-center gap-4 text-xs text-slate-500">
              <span title={enqueuedDate.toLocaleString()}>
                Enqueued: {enqueuedDate.toLocaleDateString()}{' '}
                {enqueuedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              {completedDate && (
                <span title={completedDate.toLocaleString()}>
                  Completed: {completedDate.toLocaleDateString()}{' '}
                  {completedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="shrink-0 ml-4">
          <button
            type="button"
            onClick={() => onViewDiff(entry.id)}
            className="rounded-md border border-cyan-600/50 bg-cyan-600/10 px-3 py-1.5 text-xs font-medium text-cyan-400 hover:bg-cyan-600/20 transition-colors"
          >
            View Diff
          </button>
        </div>
      </div>
    </div>
  );
}

const STATUS_COLORS: Record<MergeStatus, string> = {
  pending: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  merging: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  merged: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  conflict: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  failed: 'bg-red-500/20 text-red-300 border-red-500/30',
};

const STATUS_LABELS: Record<MergeStatus, string> = {
  pending: 'Pending',
  merging: 'Merging',
  merged: 'Merged',
  conflict: 'Conflict',
  failed: 'Failed',
};

function StatusBadge({ status }: { status: MergeStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}
    >
      {status === 'merging' && (
        <span className="mr-1.5 h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
      )}
      {STATUS_LABELS[status]}
    </span>
  );
}

function EnqueueDialog({
  open,
  onClose,
  onEnqueue,
}: {
  open: boolean;
  onClose: () => void;
  onEnqueue: (entry: {
    branch_name: string;
    task_id?: string;
    agent_name?: string;
    files_modified?: string[];
  }) => void;
}) {
  const [branchName, setBranchName] = useState('');
  const [taskId, setTaskId] = useState('');
  const [agentName, setAgentName] = useState('');

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchName.trim()) return;
    onEnqueue({
      branch_name: branchName.trim(),
      task_id: taskId.trim() || undefined,
      agent_name: agentName.trim() || undefined,
    });
    setBranchName('');
    setTaskId('');
    setAgentName('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-800 p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-50 mb-4">Enqueue Branch for Merge</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="branch-name" className="block text-sm font-medium text-slate-300 mb-1">
              Branch Name <span className="text-red-400">*</span>
            </label>
            <input
              id="branch-name"
              type="text"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              placeholder="feature/my-branch"
              className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-50 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="task-id" className="block text-sm font-medium text-slate-300 mb-1">
              Task ID (optional)
            </label>
            <input
              id="task-id"
              type="text"
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
              placeholder="TASK-123"
              className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-50 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="agent-name" className="block text-sm font-medium text-slate-300 mb-1">
              Agent Name (optional)
            </label>
            <input
              id="agent-name"
              type="text"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="builder-01"
              className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-50 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-600 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!branchName.trim()}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Enqueue
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface PreviewResult {
  canMerge: boolean;
  conflicts: string[];
}

function QueueEntryRow({
  entry,
  position,
  onExecute,
  onComplete,
  onFail,
  onRemove,
  onViewDiff,
  onAutoResolve,
  onAiResolve,
  onReimagine,
  onPreview,
  previewResult,
  previewLoading,
}: {
  entry: MergeQueueEntry;
  position: number;
  onExecute: (id: number) => void;
  onComplete: (id: number) => void;
  onFail: (id: number) => void;
  onRemove: (id: number) => void;
  onViewDiff: (id: number) => void;
  onAutoResolve?: (id: number) => void;
  onAiResolve?: (id: number) => void;
  onReimagine?: (id: number) => void;
  onPreview?: (id: number) => void;
  previewResult?: PreviewResult | null;
  previewLoading?: boolean;
}) {
  const filesModified = entry.files_modified ? (JSON.parse(entry.files_modified) as string[]) : [];

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/50 hover:bg-slate-800 transition-colors">
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-700 text-sm font-mono text-slate-300">
            {position}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-slate-50">{entry.branch_name}</span>
              <StatusBadge status={entry.status} />
            </div>
            <div className="mt-1 flex items-center gap-3 text-xs text-slate-400">
              {entry.agent_name && <span>Agent: {entry.agent_name}</span>}
              {entry.task_id && <span>Task: {entry.task_id}</span>}
              {entry.resolved_tier && <span>Tier: {entry.resolved_tier}</span>}
              <span>Enqueued: {new Date(entry.enqueued_at).toLocaleString()}</span>
            </div>
            {filesModified.length > 0 && (
              <div className="mt-1 text-xs text-slate-500">
                {filesModified.length} file{filesModified.length !== 1 ? 's' : ''} modified
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onViewDiff(entry.id)}
            className="rounded-md border border-cyan-600/50 bg-cyan-600/10 px-3 py-1.5 text-xs font-medium text-cyan-400 hover:bg-cyan-600/20 transition-colors"
          >
            View Diff
          </button>
          {entry.status === 'pending' && onPreview && (
            <button
              type="button"
              onClick={() => onPreview(entry.id)}
              disabled={previewLoading}
              data-testid={`dry-run-${entry.id}`}
              className="rounded-md border border-teal-600/50 bg-teal-600/10 px-3 py-1.5 text-xs font-medium text-teal-400 hover:bg-teal-600/20 transition-colors disabled:opacity-50"
              title="Check for conflicts without performing the merge"
            >
              {previewLoading ? 'Checking...' : 'Dry-Run'}
            </button>
          )}
          {entry.status === 'pending' && (
            <button
              type="button"
              onClick={() => onExecute(entry.id)}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 transition-colors"
            >
              Merge
            </button>
          )}
          {entry.status === 'conflict' && onAutoResolve && (
            <button
              type="button"
              onClick={() => onAutoResolve(entry.id)}
              data-testid={`auto-resolve-${entry.id}`}
              className="rounded-md border border-amber-600/50 bg-amber-600/10 px-3 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-600/20 transition-colors"
            >
              Auto-Resolve
            </button>
          )}
          {entry.status === 'conflict' && onAiResolve && (
            <button
              type="button"
              onClick={() => onAiResolve(entry.id)}
              data-testid={`ai-resolve-${entry.id}`}
              className="rounded-md border border-violet-600/50 bg-violet-600/10 px-3 py-1.5 text-xs font-medium text-violet-400 hover:bg-violet-600/20 transition-colors"
            >
              AI-Resolve
            </button>
          )}
          {(entry.status === 'conflict' || entry.status === 'failed') && onReimagine && (
            <button
              type="button"
              onClick={() => onReimagine(entry.id)}
              data-testid={`reimagine-${entry.id}`}
              className="rounded-md border border-rose-600/50 bg-rose-600/10 px-3 py-1.5 text-xs font-medium text-rose-400 hover:bg-rose-600/20 transition-colors"
              title="Abandon branch and reimplement from scratch"
            >
              Reimagine
            </button>
          )}
          {entry.status === 'merging' && (
            <>
              <button
                type="button"
                onClick={() => onComplete(entry.id)}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 transition-colors"
              >
                Complete
              </button>
              <button
                type="button"
                onClick={() => onFail(entry.id)}
                className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 transition-colors"
              >
                Fail
              </button>
            </>
          )}
          {(entry.status === 'pending' ||
            entry.status === 'failed' ||
            entry.status === 'conflict') && (
            <button
              type="button"
              onClick={() => onRemove(entry.id)}
              className="rounded-md border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors"
            >
              Remove
            </button>
          )}
        </div>
      </div>
      {/* Dry-run preview result */}
      {previewResult && (
        <div
          data-testid={`preview-result-${entry.id}`}
          className={`mx-4 mb-4 rounded-md border p-3 text-sm ${
            previewResult.canMerge
              ? 'border-emerald-600/30 bg-emerald-600/10 text-emerald-400'
              : 'border-amber-600/30 bg-amber-600/10 text-amber-400'
          }`}
        >
          {previewResult.canMerge ? (
            <div className="flex items-center gap-2">
              <span className="text-emerald-400">&#10003;</span>
              <span>Merge can proceed cleanly &mdash; no conflicts detected</span>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 font-medium">
                <span className="text-amber-400">&#9888;</span>
                <span>
                  Conflicts detected in {previewResult.conflicts.length} file
                  {previewResult.conflicts.length !== 1 ? 's' : ''}
                </span>
              </div>
              {previewResult.conflicts.length > 0 && (
                <ul className="mt-2 space-y-0.5 pl-6 text-xs font-mono text-amber-300/80">
                  {previewResult.conflicts.map((file) => (
                    <li key={file}>{file}</li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-slate-400">
                No changes were made to the target branch.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function MergeQueuePage() {
  const {
    queue,
    history,
    loading,
    error,
    fetchQueue,
    fetchHistory,
    enqueue,
    execute,
    complete,
    fail,
    remove,
    autoResolve,
    aiResolve,
    reimagine,
  } = useMergeStore();

  const [showEnqueue, setShowEnqueue] = useState(false);
  const [activeTab, setActiveTab] = useState<'queue' | 'history'>('queue');
  const [diffData, setDiffData] = useState<{ diff: string; branchName: string } | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [previewResults, setPreviewResults] = useState<Record<number, PreviewResult>>({});
  const [previewLoadingId, setPreviewLoadingId] = useState<number | null>(null);

  useEffect(() => {
    fetchQueue();
    fetchHistory();
  }, [fetchQueue, fetchHistory]);

  const allEntries = [...queue, ...history];
  const pendingCount = allEntries.filter((e) => e.status === 'pending').length;
  const mergingCount = allEntries.filter((e) => e.status === 'merging').length;
  const mergedCount = allEntries.filter((e) => e.status === 'merged').length;
  const conflictCount = allEntries.filter((e) => e.status === 'conflict').length;
  const failedCount = allEntries.filter((e) => e.status === 'failed').length;

  const handleEnqueue = async (entry: {
    branch_name: string;
    task_id?: string;
    agent_name?: string;
    files_modified?: string[];
  }) => {
    await enqueue(entry);
  };

  const handleExecute = async (id: number) => {
    await execute(id);
  };

  const handleComplete = async (id: number) => {
    await complete(id, 'clean-merge');
  };

  const handleFail = async (id: number) => {
    await fail(id);
  };

  const handleRemove = async (id: number) => {
    await remove(id);
  };

  const handleAutoResolve = async (id: number) => {
    await autoResolve(id);
  };

  const handleAiResolve = async (id: number) => {
    await aiResolve(id);
  };

  const handleReimagine = async (id: number) => {
    await reimagine(id);
  };

  const handlePreview = async (id: number) => {
    setPreviewLoadingId(id);
    try {
      const result = await window.electronAPI.mergePreview(id);
      if (result.error) {
        console.error('Preview failed:', result.error);
      } else if (result.data) {
        const { canMerge, conflicts } = result.data as {
          canMerge: boolean;
          conflicts: string[];
        };
        setPreviewResults((prev) => ({
          ...prev,
          [id]: { canMerge, conflicts },
        }));
      }
    } catch (err) {
      console.error('Preview error:', err);
    } finally {
      setPreviewLoadingId(null);
    }
  };

  const handleViewDiff = useCallback(
    async (id: number) => {
      setDiffLoading(true);
      try {
        const result = await window.electronAPI.mergeDiff(id);
        if (result.error) {
          console.error('Failed to get diff:', result.error);
          // Show a sample diff as fallback when git diff fails (e.g., branch not found locally)
          setDiffData({
            diff: '',
            branchName:
              queue.find((e) => e.id === id)?.branch_name ||
              history.find((e) => e.id === id)?.branch_name ||
              'unknown',
          });
        } else if (result.data) {
          setDiffData(result.data);
        }
      } catch (err) {
        console.error('Failed to load diff:', err);
      } finally {
        setDiffLoading(false);
      }
    },
    [queue, history],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-50">Merge Queue</h1>
        <button
          type="button"
          onClick={() => setShowEnqueue(true)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
        >
          Enqueue Branch
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-4">
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
          <div className="text-2xl font-bold text-slate-300">{pendingCount}</div>
          <div className="text-xs text-slate-400 mt-1">Pending</div>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
          <div className="text-2xl font-bold text-blue-400">{mergingCount}</div>
          <div className="text-xs text-slate-400 mt-1">Merging</div>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
          <div className="text-2xl font-bold text-emerald-400">{mergedCount}</div>
          <div className="text-xs text-slate-400 mt-1">Merged</div>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
          <div className="text-2xl font-bold text-amber-400">{conflictCount}</div>
          <div className="text-xs text-slate-400 mt-1">Conflict</div>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
          <div className="text-2xl font-bold text-red-400">{failedCount}</div>
          <div className="text-xs text-slate-400 mt-1">Failed</div>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-700">
        <button
          type="button"
          onClick={() => setActiveTab('queue')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'queue'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-300'
          }`}
        >
          Queue ({queue.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'history'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-300'
          }`}
        >
          History ({history.length})
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      ) : activeTab === 'queue' ? (
        queue.length === 0 ? (
          <div className="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center text-slate-400">
            <p className="text-lg mb-2">No merges in queue</p>
            <p className="text-sm">Enqueue a branch to start the merge process</p>
          </div>
        ) : (
          <div className="space-y-2">
            {queue.map((entry, index) => (
              <QueueEntryRow
                key={entry.id}
                entry={entry}
                position={index + 1}
                onExecute={handleExecute}
                onComplete={handleComplete}
                onFail={handleFail}
                onRemove={handleRemove}
                onViewDiff={handleViewDiff}
                onAutoResolve={handleAutoResolve}
                onAiResolve={handleAiResolve}
                onReimagine={handleReimagine}
                onPreview={handlePreview}
                previewResult={previewResults[entry.id] || null}
                previewLoading={previewLoadingId === entry.id}
              />
            ))}
          </div>
        )
      ) : history.length === 0 ? (
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center text-slate-400">
          <p className="text-lg mb-2">No merge history</p>
          <p className="text-sm">Completed and failed merges will appear here</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* History tier summary */}
          <div className="flex items-center gap-4 text-xs text-slate-400 pb-2 border-b border-slate-700/50">
            <span className="font-medium text-slate-300">
              {history.length} merge{history.length !== 1 ? 's' : ''} total
            </span>
            <span className="text-emerald-400">
              {history.filter((e) => e.status === 'merged').length} succeeded
            </span>
            <span className="text-red-400">
              {history.filter((e) => e.status === 'failed').length} failed
            </span>
            {history.filter((e) => e.resolved_tier === 'clean-merge').length > 0 && (
              <span className="text-emerald-400/70">
                {history.filter((e) => e.resolved_tier === 'clean-merge').length} clean
              </span>
            )}
            {history.filter((e) => e.resolved_tier === 'auto-resolve').length > 0 && (
              <span className="text-amber-400/70">
                {history.filter((e) => e.resolved_tier === 'auto-resolve').length} auto-resolved
              </span>
            )}
            {history.filter((e) => e.resolved_tier === 'ai-resolve').length > 0 && (
              <span className="text-violet-400/70">
                {history.filter((e) => e.resolved_tier === 'ai-resolve').length} AI-resolved
              </span>
            )}
            {history.filter((e) => e.resolved_tier === 'reimagine').length > 0 && (
              <span className="text-rose-400/70">
                {history.filter((e) => e.resolved_tier === 'reimagine').length} reimagined
              </span>
            )}
          </div>
          {history.map((entry) => (
            <HistoryEntryRow key={entry.id} entry={entry} onViewDiff={handleViewDiff} />
          ))}
        </div>
      )}

      {/* Enqueue Dialog */}
      <EnqueueDialog
        open={showEnqueue}
        onClose={() => setShowEnqueue(false)}
        onEnqueue={handleEnqueue}
      />

      {/* Diff Loading Overlay */}
      {diffLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="flex flex-col items-center gap-3 rounded-lg border border-slate-700 bg-slate-800 p-8">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <span className="text-sm text-slate-300">Loading diff...</span>
          </div>
        </div>
      )}

      {/* Diff Viewer with file-level review */}
      {diffData && (
        <DiffViewer
          diffString={diffData.diff}
          branchName={diffData.branchName}
          onClose={() => setDiffData(null)}
          reviewMode={true}
          onProceedMerge={(approvedFiles) => {
            console.log('Proceeding with merge of approved files:', approvedFiles);
            setDiffData(null);
          }}
        />
      )}
    </div>
  );
}
