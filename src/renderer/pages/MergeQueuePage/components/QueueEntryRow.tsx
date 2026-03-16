import type { MergeQueueEntry } from '../../../../shared/types';
import { Button } from '../../../components/ui/button';
import { BlockedBadge } from './BlockedBadge';
import { MergeElapsedTimer } from './MergeElapsedTimer';
import { StatusBadge } from './StatusBadge';
import type { PreviewResult } from './types';

function parseDependsOn(dependsOn: string | null): number[] {
  if (!dependsOn) return [];
  try {
    return JSON.parse(dependsOn) as number[];
  } catch {
    return [];
  }
}

export function QueueEntryRow({
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
  let filesModified: string[] = [];
  try {
    filesModified = entry.files_modified ? (JSON.parse(entry.files_modified) as string[]) : [];
  } catch { /* malformed JSON */ }
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
              <div className="mt-1 text-xs text-slate-400">
                {filesModified.length} file{filesModified.length !== 1 ? 's' : ''} modified
              </div>
            )}
            {depEntries.length > 0 && (
              <div className="mt-1.5 flex items-center gap-1 text-xs text-slate-400">
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => onViewDiff(entry.id)}
            className="border-cyan-600/50 bg-cyan-600/10 text-cyan-400 hover:bg-cyan-600/20 hover:text-cyan-400"
          >
            View Diff
          </Button>
          {entry.status === 'pending' && !isBlocked && onPreview && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPreview(entry.id)}
              disabled={previewLoading}
              data-testid={`dry-run-${entry.id}`}
              className="border-teal-600/50 bg-teal-600/10 text-teal-400 hover:bg-teal-600/20 hover:text-teal-400"
              title="Check for conflicts without performing the merge"
            >
              {previewLoading ? <><div className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-teal-400 border-t-transparent mr-1 align-middle" />Checking...</> : 'Dry-Run'}
            </Button>
          )}
          {entry.status === 'pending' && !isBlocked && (
            <Button
              size="sm"
              onClick={() => onExecute(entry.id)}
              className="bg-emerald-600 text-white hover:bg-emerald-500"
            >
              Merge
            </Button>
          )}
          {entry.status === 'pending' && isBlocked && (
            <Button
              size="sm"
              disabled
              className="bg-slate-600 text-slate-400"
              title="Blocked by failed dependency"
            >
              Merge
            </Button>
          )}
          {entry.status === 'conflict' && onAutoResolve && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onAutoResolve(entry.id)}
              data-testid={`auto-resolve-${entry.id}`}
              className="border-amber-600/50 bg-amber-600/10 text-amber-400 hover:bg-amber-600/20 hover:text-amber-400"
            >
              Auto-Resolve
            </Button>
          )}
          {entry.status === 'conflict' && onAiResolve && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onAiResolve(entry.id)}
              data-testid={`ai-resolve-${entry.id}`}
              className="border-violet-600/50 bg-violet-600/10 text-violet-400 hover:bg-violet-600/20 hover:text-violet-400"
            >
              AI-Resolve
            </Button>
          )}
          {(entry.status === 'conflict' || entry.status === 'failed') && onReimagine && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onReimagine(entry.id)}
              data-testid={`reimagine-${entry.id}`}
              className="border-red-600/50 bg-red-600/10 text-red-400 hover:bg-red-600/20 hover:text-red-400"
              title="Abandon branch and reimplement from scratch"
            >
              Reimagine
            </Button>
          )}
          {entry.status === 'merging' && (
            <>
              <Button
                size="sm"
                onClick={() => onComplete(entry.id)}
                className="bg-emerald-600 text-white hover:bg-emerald-500"
              >
                Complete
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => onFail(entry.id)}
              >
                Fail
              </Button>
            </>
          )}
          {(entry.status === 'pending' ||
            entry.status === 'failed' ||
            entry.status === 'conflict') && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRemove(entry.id)}
              className="border-slate-600 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
            >
              Remove
            </Button>
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
            <span className="text-xs font-medium text-blue-400">Merge in progress...</span>
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
