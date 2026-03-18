import {
  FiAlertTriangle,
  FiGitMerge,
  FiLink,
  FiRefreshCw,
  FiTool,
} from 'react-icons/fi';
import { Badge } from '../../../components/ui/badge';
import { Separator } from '../../../components/ui/separator';
import {
  formatDuration,
  formatFullTime,
  formatReplayTime,
  type ToolCorrelation,
} from './types';

export function CorrelationView({
  correlations,
  correlatedCount,
  orphanedCount,
  loading,
}: {
  correlations: ToolCorrelation[];
  correlatedCount: number;
  orphanedCount: number;
  loading: boolean;
}) {
  return (
    <div className="flex-1 overflow-y-auto pr-1" data-testid="correlation-view">
      {/* Summary stats */}
      <div className="mb-3 flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-900 p-2.5">
        <div className="flex items-center gap-1.5">
          <FiGitMerge size={14} className="text-green-400" />
          <span className="text-xs text-slate-400">Correlated:</span>
          <span className="text-xs font-medium text-green-400" data-testid="correlated-count">
            {correlatedCount}
          </span>
        </div>
        <Separator orientation="vertical" className="h-3 bg-slate-700" />
        <div className="flex items-center gap-1.5">
          <FiAlertTriangle size={14} className={orphanedCount > 0 ? 'text-amber-400' : 'text-slate-400'} />
          <span className="text-xs text-slate-400">Orphaned starts:</span>
          <span
            className={`text-xs font-medium ${orphanedCount > 0 ? 'text-amber-400' : 'text-slate-400'}`}
            data-testid="orphaned-count"
          >
            {orphanedCount}
          </span>
        </div>
        <Separator orientation="vertical" className="h-3 bg-slate-700" />
        <div className="flex items-center gap-1.5">
          <FiTool size={14} className="text-slate-400" />
          <span className="text-xs text-slate-400">Total:</span>
          <span className="text-xs font-medium text-slate-300">{correlations.length}</span>
        </div>
      </div>

      {loading && correlations.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <FiRefreshCw size={24} className="animate-spin text-slate-400" />
        </div>
      ) : correlations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <FiLink size={40} className="mb-3 opacity-30" />
          <p className="text-sm">No tool events to correlate</p>
          <p className="mt-1 text-xs text-slate-400">
            tool_start and tool_end events will be matched here
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {correlations.map((corr) => (
            <div
              key={corr.startEvent.id}
              data-testid="correlation-item"
              data-orphaned={corr.isOrphaned ? 'true' : 'false'}
              className={`rounded-lg border px-3 py-2 transition-colors hover:bg-slate-800/30 ${
                corr.isOrphaned
                  ? 'border-amber-700/50 bg-amber-900/10'
                  : 'border-slate-700 bg-slate-900/30'
              }`}
            >
              <div className="flex items-center gap-2">
                {/* Status icon */}
                {corr.isOrphaned ? (
                  <FiAlertTriangle size={14} className="flex-shrink-0 text-amber-400" />
                ) : (
                  <FiLink size={14} className="flex-shrink-0 text-green-400" />
                )}

                {/* Tool name */}
                <Badge variant="secondary" className="rounded bg-slate-800 px-1.5 py-0.5 text-xs font-medium text-blue-400">
                  {corr.toolName}
                </Badge>

                {/* Agent name */}
                {corr.agentName && (
                  <span className="truncate text-xs text-slate-400" title={corr.agentName}>
                    {corr.agentName}
                  </span>
                )}

                <div className="flex-1" />

                {/* Duration */}
                {corr.durationMs != null ? (
                  <Badge
                    variant="outline"
                    className={`rounded px-1.5 py-0.5 text-xs font-mono border-0 ${
                      corr.durationMs > 10000
                        ? 'bg-red-900/30 text-red-400'
                        : corr.durationMs > 3000
                          ? 'bg-amber-900/30 text-amber-400'
                          : 'bg-green-900/30 text-green-400'
                    }`}
                    data-testid="correlation-duration"
                  >
                    {formatDuration(corr.durationMs)}
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="rounded bg-amber-900/30 px-1.5 py-0.5 text-xs text-amber-400 border-0"
                    data-testid="correlation-duration"
                  >
                    pending...
                  </Badge>
                )}

                {/* Orphaned badge */}
                {corr.isOrphaned && (
                  <Badge
                    variant="destructive"
                    className="rounded bg-amber-900/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-400"
                    data-testid="orphaned-badge"
                  >
                    Orphaned
                  </Badge>
                )}
              </div>

              {/* Timeline details */}
              <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-400">
                <span title={formatFullTime(corr.startEvent.created_at)}>
                  Start: {formatReplayTime(corr.startEvent.created_at)}
                </span>
                {corr.endEvent && !corr.isOrphaned && (
                  <>
                    <span>→</span>
                    <span title={formatFullTime(corr.endEvent.created_at)}>
                      End: {formatReplayTime(corr.endEvent.created_at)}
                    </span>
                  </>
                )}
                {corr.sessionId && (
                  <span className="ml-auto truncate" title={corr.sessionId}>
                    Session: {corr.sessionId.slice(0, 8)}...
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
