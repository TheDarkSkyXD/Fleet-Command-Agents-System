import { useEffect, useState } from 'react';
import type { MergeQueueEntry, MergeStatus } from '../../shared/types';
import { useMergeStore } from '../stores/mergeStore';

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

function QueueEntryRow({
  entry,
  position,
  onExecute,
  onComplete,
  onFail,
  onRemove,
}: {
  entry: MergeQueueEntry;
  position: number;
  onExecute: (id: number) => void;
  onComplete: (id: number) => void;
  onFail: (id: number) => void;
  onRemove: (id: number) => void;
}) {
  const filesModified = entry.files_modified ? (JSON.parse(entry.files_modified) as string[]) : [];

  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/50 p-4 hover:bg-slate-800 transition-colors">
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
        {entry.status === 'pending' && (
          <button
            type="button"
            onClick={() => onExecute(entry.id)}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 transition-colors"
          >
            Merge
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
  } = useMergeStore();

  const [showEnqueue, setShowEnqueue] = useState(false);
  const [activeTab, setActiveTab] = useState<'queue' | 'history'>('queue');

  useEffect(() => {
    fetchQueue();
    fetchHistory();
  }, [fetchQueue, fetchHistory]);

  const pendingCount = queue.filter((e) => e.status === 'pending').length;
  const mergingCount = queue.filter((e) => e.status === 'merging').length;
  const mergedCount = history.filter((e) => e.status === 'merged').length;
  const failedCount = history.filter(
    (e) => e.status === 'failed' || e.status === 'conflict',
  ).length;

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
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
          <div className="text-2xl font-bold text-sky-400">{pendingCount}</div>
          <div className="text-xs text-slate-400 mt-1">Pending</div>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
          <div className="text-2xl font-bold text-amber-400">{mergingCount}</div>
          <div className="text-xs text-slate-400 mt-1">Merging</div>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
          <div className="text-2xl font-bold text-emerald-400">{mergedCount}</div>
          <div className="text-xs text-slate-400 mt-1">Merged</div>
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
        <div className="space-y-2">
          {history.map((entry, index) => (
            <QueueEntryRow
              key={entry.id}
              entry={entry}
              position={index + 1}
              onExecute={handleExecute}
              onComplete={handleComplete}
              onFail={handleFail}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}

      {/* Enqueue Dialog */}
      <EnqueueDialog
        open={showEnqueue}
        onClose={() => setShowEnqueue(false)}
        onEnqueue={handleEnqueue}
      />
    </div>
  );
}
