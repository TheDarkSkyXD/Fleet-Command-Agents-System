import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
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
        <span>{'\u2714'}</span> Success
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-400">
        <span>{'\u2718'}</span> Failed
      </span>
    );
  }
  if (status === 'conflict') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400">
        <span>{'\u26A0'}</span> Conflict
      </span>
    );
  }
  return <StatusBadge status={status} />;
}

function HistoryEntryRow({
  entry,
  onViewDiff,
  onRollback,
}: {
  entry: MergeQueueEntry;
  onViewDiff: (id: number) => void;
  onRollback?: (id: number) => void;
}) {
  const filesModified = entry.files_modified ? (JSON.parse(entry.files_modified) as string[]) : [];
  const completedDate = entry.completed_at ? new Date(entry.completed_at) : null;
  const enqueuedDate = new Date(entry.enqueued_at);

  return (
    <div
      data-testid={`history-entry-${entry.id}`}
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
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm text-slate-50 truncate" title={entry.branch_name}>
                {entry.branch_name}
              </span>
              <OutcomeBadge status={entry.status} />
              {entry.rolled_back === 1 && (
                <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/15 px-2 py-0.5 text-xs font-medium text-sky-400">
                  <span>{'\u21A9'}</span> Rolled Back
                </span>
              )}
            </div>
            <div className="mt-2">
              {entry.resolved_tier ? (
                <TierBadge tier={entry.resolved_tier} />
              ) : (
                <span className="inline-flex items-center rounded-full border border-slate-600 bg-slate-700/50 px-3 py-1 text-xs text-slate-400">
                  No resolution tier
                </span>
              )}
            </div>
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
        <div className="shrink-0 ml-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onViewDiff(entry.id)}
            className="rounded-md border border-cyan-600/50 bg-cyan-600/10 px-3 py-1.5 text-xs font-medium text-cyan-400 hover:bg-cyan-600/20 transition-colors"
          >
            View Diff
          </button>
          {(entry.status === 'failed' || entry.status === 'merged') &&
            entry.rolled_back !== 1 &&
            entry.pre_merge_commit &&
            onRollback && (
              <button
                type="button"
                onClick={() => onRollback(entry.id)}
                data-testid={`rollback-${entry.id}`}
                className="rounded-md border border-sky-600/50 bg-sky-600/10 px-3 py-1.5 text-xs font-medium text-sky-400 hover:bg-sky-600/20 transition-colors"
                title="Restore target branch to pre-merge state"
              >
                Rollback
              </button>
            )}
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

function BlockedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-orange-500/30 bg-orange-500/20 px-2.5 py-0.5 text-xs font-medium text-orange-400">
      <span className="h-2 w-2 rounded-full bg-orange-400" />
      Blocked
    </span>
  );
}

function EnqueueDialog({
  open,
  onClose,
  onEnqueue,
  existingEntries,
}: {
  open: boolean;
  onClose: () => void;
  onEnqueue: (entry: {
    branch_name: string;
    task_id?: string;
    agent_name?: string;
    files_modified?: string[];
    depends_on?: number[];
  }) => void;
  existingEntries: MergeQueueEntry[];
}) {
  const [branchName, setBranchName] = useState('');
  const [taskId, setTaskId] = useState('');
  const [agentName, setAgentName] = useState('');
  const [selectedDeps, setSelectedDeps] = useState<number[]>([]);
  const [branchError, setBranchError] = useState<string | undefined>();
  const [branchTouched, setBranchTouched] = useState(false);

  if (!open) return null;

  const validateBranch = (value: string): boolean => {
    if (!value.trim()) {
      setBranchError('Branch Name is required');
      return false;
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/.test(value.trim())) {
      setBranchError('Branch Name must start with a letter or number and contain only letters, numbers, /, -, _, or .');
      return false;
    }
    if (value.trim().length > 200) {
      setBranchError('Branch Name must be 200 characters or fewer');
      return false;
    }
    setBranchError(undefined);
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setBranchTouched(true);
    if (!validateBranch(branchName)) return;
    onEnqueue({
      branch_name: branchName.trim(),
      task_id: taskId.trim() || undefined,
      agent_name: agentName.trim() || undefined,
      depends_on: selectedDeps.length > 0 ? selectedDeps : undefined,
    });
    setBranchName('');
    setTaskId('');
    setAgentName('');
    setSelectedDeps([]);
    setBranchError(undefined);
    setBranchTouched(false);
    onClose();
  };

  const toggleDep = (id: number) => {
    setSelectedDeps((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]));
  };

  const availableDeps = existingEntries.filter(
    (e) => e.status === 'pending' || e.status === 'merging',
  );

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
              onChange={(e) => {
                setBranchName(e.target.value);
                if (branchTouched) validateBranch(e.target.value);
              }}
              onBlur={() => {
                setBranchTouched(true);
                validateBranch(branchName);
              }}
              placeholder="feature/my-branch"
              data-testid="enqueue-branch-input"
              className={`w-full rounded-md border bg-slate-900 px-3 py-2 text-sm text-slate-50 placeholder-slate-500 focus:outline-none focus:ring-1 ${
                branchTouched && branchError
                  ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                  : 'border-slate-600 focus:border-blue-500 focus:ring-blue-500'
              }`}
            />
            {branchTouched && branchError && (
              <p className="mt-1 text-xs text-red-400" data-testid="enqueue-branch-error">{branchError}</p>
            )}
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
          {availableDeps.length > 0 && (
            <div>
              <label
                htmlFor="depends-on-list"
                className="block text-sm font-medium text-slate-300 mb-1"
              >
                Depends On (optional)
              </label>
              <p className="text-xs text-slate-500 mb-2">
                Select merges that must complete before this one can proceed.
              </p>
              <div
                id="depends-on-list"
                className="max-h-32 overflow-y-auto space-y-1 rounded-md border border-slate-600 bg-slate-900 p-2"
              >
                {availableDeps.map((dep) => (
                  <label
                    key={dep.id}
                    className="flex items-center gap-2 rounded px-2 py-1 hover:bg-slate-800 cursor-pointer text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selectedDeps.includes(dep.id)}
                      onChange={() => toggleDep(dep.id)}
                      className="rounded border-slate-500 bg-slate-800 text-blue-500 focus:ring-blue-500"
                    />
                    <span
                      className="font-mono text-xs text-slate-300 truncate"
                      title={`#${dep.id} ${dep.branch_name}`}
                    >
                      #{dep.id} {dep.branch_name}
                    </span>
                    <StatusBadge status={dep.status} />
                  </label>
                ))}
              </div>
            </div>
          )}
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

function parseDependsOn(dependsOn: string | null): number[] {
  if (!dependsOn) return [];
  try {
    return JSON.parse(dependsOn) as number[];
  } catch {
    return [];
  }
}

function QueueEntryRow({
  entry,
  position,
  allEntries,
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
  allEntries: MergeQueueEntry[];
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
  const isBlocked = entry.blocked === true;
  const dependsOnIds = parseDependsOn(entry.depends_on);
  const depEntries = dependsOnIds
    .map((id) => allEntries.find((e) => e.id === id))
    .filter(Boolean) as MergeQueueEntry[];

  return (
    <div
      data-testid={`queue-entry-${entry.id}`}
      className={`rounded-lg border transition-colors ${
        isBlocked
          ? 'border-orange-700/40 bg-orange-900/10 hover:bg-orange-900/15'
          : 'border-slate-700 bg-slate-800/50 hover:bg-slate-800'
      }`}
    >
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-700 text-sm font-mono text-slate-300">
            {position}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-slate-50">{entry.branch_name}</span>
              <StatusBadge status={entry.status} />
              {isBlocked && <BlockedBadge />}
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
            {depEntries.length > 0 && (
              <div className="mt-1.5 flex items-center gap-1 text-xs text-slate-500">
                <span className="text-slate-400">Depends on:</span>
                {depEntries.map((dep) => (
                  <span
                    key={dep.id}
                    className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono ${
                      dep.status === 'failed'
                        ? 'bg-red-500/15 text-red-400'
                        : dep.status === 'merged'
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    #{dep.id}
                  </span>
                ))}
              </div>
            )}
            {isBlocked && (
              <div className="mt-1.5 text-xs text-orange-400/80">
                Blocked: a dependency has failed. Resolve or remove the failed merge to unblock.
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
          {entry.status === 'pending' && !isBlocked && onPreview && (
            <button
              type="button"
              onClick={() => onPreview(entry.id)}
              disabled={previewLoading}
              data-testid={`dry-run-${entry.id}`}
              className="rounded-md border border-teal-600/50 bg-teal-600/10 px-3 py-1.5 text-xs font-medium text-teal-400 hover:bg-teal-600/20 transition-colors disabled:opacity-50"
              title="Check for conflicts without performing the merge"
            >
              {previewLoading ? <><div className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-teal-400 border-t-transparent mr-1 align-middle" />Checking...</> : 'Dry-Run'}
            </button>
          )}
          {entry.status === 'pending' && !isBlocked && (
            <button
              type="button"
              onClick={() => onExecute(entry.id)}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 transition-colors"
            >
              Merge
            </button>
          )}
          {entry.status === 'pending' && isBlocked && (
            <button
              type="button"
              disabled
              className="rounded-md bg-slate-600 px-3 py-1.5 text-xs font-medium text-slate-400 cursor-not-allowed opacity-50"
              title="Blocked by failed dependency"
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
      {entry.status === 'merging' && (
        <div className="px-4 pb-3" data-testid={`merge-progress-${entry.id}`}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-blue-400">Merge in progress…</span>
            <MergeElapsedTimer startTime={entry.enqueued_at} />
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-700">
            <div
              className="h-full rounded-full bg-blue-500"
              style={{
                animation: 'mergeProgress 2s ease-in-out infinite',
                width: '40%',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function MergeElapsedTimer({ startTime }: { startTime: string }) {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    const start = new Date(startTime).getTime();
    const update = () => {
      const diff = Math.max(0, Math.floor((Date.now() - start) / 1000));
      const mins = Math.floor(diff / 60);
      const secs = diff % 60;
      setElapsed(mins > 0 ? `${mins}m ${secs}s` : `${secs}s`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  return <span className="text-xs font-mono text-slate-400 tabular-nums">{elapsed}</span>;
}

function TargetBranchSelector({
  targetBranch,
  onChangeTarget,
}: {
  targetBranch: string;
  onChangeTarget: (branch: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState(targetBranch);

  const handleSave = () => {
    onChangeTarget(inputValue.trim());
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') {
      setInputValue(targetBranch);
      setEditing(false);
    }
  };

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-slate-400 whitespace-nowrap">Target branch:</span>
      {editing ? (
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSave}
            placeholder="main"
            // biome-ignore lint/a11y/noAutofocus: intentional focus for inline edit
            autoFocus
            className="w-40 rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-slate-50 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={handleSave}
            className="rounded px-2 py-1 text-xs text-emerald-400 hover:bg-emerald-600/20 transition-colors"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setInputValue(targetBranch);
              setEditing(false);
            }}
            className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setInputValue(targetBranch);
            setEditing(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-600 bg-slate-800 px-2.5 py-1 text-xs font-mono text-slate-300 hover:bg-slate-700 hover:text-slate-100 transition-colors"
          title="Click to change merge target branch"
        >
          {targetBranch || '(current branch)'}
          <span className="text-slate-500">&#9998;</span>
        </button>
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
    rollback,
  } = useMergeStore();

  const [showEnqueue, setShowEnqueue] = useState(false);
  const [activeTab, setActiveTab] = useState<'queue' | 'history'>('queue');
  const [diffData, setDiffData] = useState<{ diff: string; branchName: string } | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [previewResults, setPreviewResults] = useState<Record<number, PreviewResult>>({});
  const [previewLoadingId, setPreviewLoadingId] = useState<number | null>(null);
  const [targetBranch, setTargetBranch] = useState('');

  useEffect(() => {
    fetchQueue();
    fetchHistory();
    window.electronAPI.mergeGetTargetBranch().then((result) => {
      if (!result.error && result.data) {
        setTargetBranch(result.data);
      }
    });
  }, [fetchQueue, fetchHistory]);

  const allEntries = [...queue, ...history];
  const pendingCount = allEntries.filter((e) => e.status === 'pending').length;
  const mergingCount = allEntries.filter((e) => e.status === 'merging').length;
  const mergedCount = allEntries.filter((e) => e.status === 'merged').length;
  const conflictCount = allEntries.filter((e) => e.status === 'conflict').length;
  const failedCount = allEntries.filter((e) => e.status === 'failed').length;
  const blockedCount = queue.filter((e) => e.blocked === true).length;

  const handleEnqueue = async (entry: {
    branch_name: string;
    task_id?: string;
    agent_name?: string;
    files_modified?: string[];
    depends_on?: number[];
  }) => {
    await enqueue(entry);
  };

  const handleExecute = async (id: number) => {
    const entry = queue.find((e) => e.id === id);
    const result = await execute(id, undefined, targetBranch || undefined);
    if (result) {
      if (result.status === 'merged') {
        toast.success(`Merge completed: ${entry?.branch_name ?? `#${id}`}`);
      } else if (result.status === 'conflict') {
        toast.warning(`Merge conflicts detected: ${entry?.branch_name ?? `#${id}`}`);
      } else {
        toast.info(`Merge started: ${entry?.branch_name ?? `#${id}`}`);
      }
    }
  };

  const handleComplete = async (id: number) => {
    const entry = queue.find((e) => e.id === id);
    const branchName = entry?.branch_name ?? `#${id}`;
    const result = await complete(id, 'clean-merge');
    if (result) {
      toast.success(`Merge completed successfully: ${branchName}`, {
        description: entry?.agent_name ? `Agent ${entry.agent_name} session updated` : undefined,
      });
    }
  };

  const handleFail = async (id: number) => {
    const entry = queue.find((e) => e.id === id);
    const result = await fail(id);
    if (result) {
      toast.error(`Merge failed: ${entry?.branch_name ?? `#${id}`}`);
    }
  };

  const handleRemove = async (id: number) => {
    const entry = queue.find((e) => e.id === id);
    const success = await remove(id);
    if (success) {
      toast.info(`Removed from queue: ${entry?.branch_name ?? `#${id}`}`);
    }
  };

  const handleAutoResolve = async (id: number) => {
    const entry = queue.find((e) => e.id === id);
    const result = await autoResolve(id, undefined, targetBranch || undefined);
    if (result) {
      toast.success(`Auto-resolved: ${entry?.branch_name ?? `#${id}`}`);
    }
  };

  const handleAiResolve = async (id: number) => {
    const entry = queue.find((e) => e.id === id);
    const result = await aiResolve(id, undefined, targetBranch || undefined);
    if (result) {
      toast.success(`AI-resolved: ${entry?.branch_name ?? `#${id}`}`);
    }
  };

  const handleReimagine = async (id: number) => {
    const entry = queue.find((e) => e.id === id);
    const result = await reimagine(id, undefined, targetBranch || undefined);
    if (result) {
      toast.info(`Reimagine branch created: ${entry?.branch_name ?? `#${id}`}`);
    }
  };

  const handleRollback = async (id: number) => {
    const entry = history.find((e) => e.id === id);
    const result = await rollback(id);
    if (result) {
      toast.info(`Rolled back: ${entry?.branch_name ?? `#${id}`}`);
    }
  };

  const handleChangeTargetBranch = async (branch: string) => {
    setTargetBranch(branch);
    await window.electronAPI.mergeSetTargetBranch(branch);
  };

  const handlePreview = async (id: number) => {
    setPreviewLoadingId(id);
    try {
      const result = await window.electronAPI.mergePreview(id);
      if (result.error) {
        console.error('Preview failed:', result.error);
        toast.error('Merge preview failed');
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
        toast.error('Failed to load diff');
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
        <div>
          <h1 className="text-2xl font-bold text-slate-50">Merge Queue</h1>
          <div className="mt-2">
            <TargetBranchSelector
              targetBranch={targetBranch}
              onChangeTarget={handleChangeTargetBranch}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowEnqueue(true)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
        >
          Enqueue Branch
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-6 gap-4" data-testid="merge-stats">
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-4" data-testid="merge-stat-pending">
          <div className="text-2xl font-bold text-slate-300">{pendingCount}</div>
          <div className="text-xs text-slate-400 mt-1">Pending</div>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-4" data-testid="merge-stat-merging">
          <div className="text-2xl font-bold text-blue-400">{mergingCount}</div>
          <div className="text-xs text-slate-400 mt-1">Merging</div>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-4" data-testid="merge-stat-merged">
          <div className="text-2xl font-bold text-emerald-400">{mergedCount}</div>
          <div className="text-xs text-slate-400 mt-1">Merged</div>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-4" data-testid="merge-stat-conflict">
          <div className="text-2xl font-bold text-amber-400">{conflictCount}</div>
          <div className="text-xs text-slate-400 mt-1">Conflict</div>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-4" data-testid="merge-stat-failed">
          <div className="text-2xl font-bold text-red-400">{failedCount}</div>
          <div className="text-xs text-slate-400 mt-1">Failed</div>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-4" data-testid="merge-stat-blocked">
          <div className="text-2xl font-bold text-orange-400">{blockedCount}</div>
          <div className="text-xs text-slate-400 mt-1">Blocked</div>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400 flex items-center justify-between gap-3" data-testid="merge-queue-error">
          <span>{error}</span>
          <div className="flex items-center gap-2 shrink-0">
            <button type="button" onClick={fetchQueue} className="rounded-md bg-red-500/20 px-3 py-1 text-xs font-medium text-red-300 hover:bg-red-500/30 transition-colors" data-testid="merge-queue-error-retry">
              Retry
            </button>
            <button type="button" onClick={() => useMergeStore.setState({ error: null })} className="text-red-400 hover:text-red-200 transition-colors" title="Dismiss error">
              &#10005;
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-700" data-testid="merge-tabs">
        <button
          type="button"
          onClick={() => setActiveTab('queue')}
          data-testid="merge-tab-queue"
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
          data-testid="merge-tab-history"
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
          <div className="space-y-2" data-testid="merge-queue-list">
            {queue.map((entry, index) => (
              <QueueEntryRow
                key={entry.id}
                entry={entry}
                position={index + 1}
                allEntries={allEntries}
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
        <div className="space-y-3" data-testid="merge-history-list">
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
            <HistoryEntryRow
              key={entry.id}
              entry={entry}
              onViewDiff={handleViewDiff}
              onRollback={handleRollback}
            />
          ))}
        </div>
      )}

      {/* Enqueue Dialog */}
      <EnqueueDialog
        open={showEnqueue}
        onClose={() => setShowEnqueue(false)}
        onEnqueue={handleEnqueue}
        existingEntries={queue}
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
