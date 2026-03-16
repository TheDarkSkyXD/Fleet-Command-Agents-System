import type { MergeQueueEntry } from '../../../../shared/types';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { OutcomeBadge } from './OutcomeBadge';
import { TierBadge } from './TierBadge';

export function HistoryEntryRow({
  entry,
  onViewDiff,
  onRollback,
}: {
  entry: MergeQueueEntry;
  onViewDiff: (id: number) => void;
  onRollback?: (id: number) => void;
}) {
  let filesModified: string[] = [];
  try {
    filesModified = entry.files_modified ? (JSON.parse(entry.files_modified) as string[]) : [];
  } catch { /* malformed JSON */ }
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
                <Badge variant="outline" className="gap-1 bg-sky-500/15 text-sky-400 border-transparent rounded-md">
                  <span>{'\u21A9'}</span> Rolled Back
                </Badge>
              )}
            </div>
            <div className="mt-2">
              {entry.resolved_tier ? (
                <TierBadge tier={entry.resolved_tier} />
              ) : (
                <Badge variant="outline" className="border-slate-600 bg-slate-700/50 text-slate-400 px-3 py-1">
                  No resolution tier
                </Badge>
              )}
            </div>
            <div className="mt-2 flex items-center gap-3 text-xs text-slate-400 flex-wrap">
              {entry.agent_name && (
                <span className="inline-flex items-center gap-1">
                  <span className="text-slate-400">Agent:</span> {entry.agent_name}
                </span>
              )}
              {entry.task_id && (
                <span className="inline-flex items-center gap-1">
                  <span className="text-slate-400">Task:</span> {entry.task_id}
                </span>
              )}
              {filesModified.length > 0 && (
                <span className="text-slate-400">
                  {filesModified.length} file{filesModified.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="mt-1.5 flex items-center gap-4 text-xs text-slate-400">
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => onViewDiff(entry.id)}
            className="border-cyan-600/50 bg-cyan-600/10 text-cyan-400 hover:bg-cyan-600/20 hover:text-cyan-400"
          >
            View Diff
          </Button>
          {(entry.status === 'failed' || entry.status === 'merged') &&
            entry.rolled_back !== 1 &&
            entry.pre_merge_commit &&
            onRollback && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onRollback(entry.id)}
                data-testid={`rollback-${entry.id}`}
                className="border-sky-600/50 bg-sky-600/10 text-sky-400 hover:bg-sky-600/20 hover:text-sky-400"
                title="Restore target branch to pre-merge state"
              >
                Rollback
              </Button>
            )}
        </div>
      </div>
    </div>
  );
}
