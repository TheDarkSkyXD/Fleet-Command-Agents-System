import { FiCpu } from 'react-icons/fi';
import type { ModelBreakdown } from '../../../../shared/types';
import { Card, CardContent } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import type { FormatTokenCount, FormatDuration, FormatCost, ModelColorFn, ModelBgColorFn } from './types';

interface ModelBreakdownTabProps {
  breakdown: ModelBreakdown[];
  formatTokenCount: FormatTokenCount;
  formatDuration: FormatDuration;
  formatCost: FormatCost;
  modelColor: ModelColorFn;
  modelBgColor: ModelBgColorFn;
}

export function ModelBreakdownTab({
  breakdown,
  formatTokenCount,
  formatDuration,
  formatCost,
  modelColor,
  modelBgColor,
}: ModelBreakdownTabProps) {
  if (breakdown.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <FiCpu size={40} className="mb-3 opacity-50" />
        <p className="text-lg font-medium">No model usage data yet</p>
        <p className="text-sm mt-1">
          Model breakdown will appear after sessions with different models complete
        </p>
      </div>
    );
  }

  // Find max for bar charts
  const maxTokens = Math.max(
    ...breakdown.map(
      (b) =>
        (b.total_input_tokens || 0) +
        (b.total_output_tokens || 0) +
        (b.total_cache_read_tokens || 0) +
        (b.total_cache_creation_tokens || 0),
    ),
  );

  return (
    <div className="space-y-4">
      {breakdown.map((b) => {
        const totalTokens =
          (b.total_input_tokens || 0) +
          (b.total_output_tokens || 0) +
          (b.total_cache_read_tokens || 0) +
          (b.total_cache_creation_tokens || 0);
        const pct = maxTokens > 0 ? (totalTokens / maxTokens) * 100 : 0;
        const inputPct = totalTokens > 0 ? ((b.total_input_tokens || 0) / totalTokens) * 100 : 0;
        const outputPct = totalTokens > 0 ? ((b.total_output_tokens || 0) / totalTokens) * 100 : 0;
        const cacheReadPct =
          totalTokens > 0 ? ((b.total_cache_read_tokens || 0) / totalTokens) * 100 : 0;
        const cacheCreatePct =
          totalTokens > 0 ? ((b.total_cache_creation_tokens || 0) / totalTokens) * 100 : 0;

        return (
          <Card key={b.model_used} className={`${modelBgColor(b.model_used)}`}>
            <CardContent className="p-5 pt-5">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <FiCpu className={`${modelColor(b.model_used)}`} size={20} />
                  <span className={`text-lg font-bold ${modelColor(b.model_used)}`}>
                    {b.model_used}
                  </span>
                  <Badge variant="secondary" className="bg-slate-800/50 text-slate-400 border-transparent">
                    {b.session_count} session{b.session_count !== 1 ? 's' : ''}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-slate-400">{formatDuration(b.total_duration_ms)}</span>
                  <span className="text-slate-300 font-medium">{formatCost(b.total_cost)}</span>
                </div>
              </div>

              {/* Token usage bar */}
              <div className="mb-3">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                  <span>Total: {formatTokenCount(totalTokens)} tokens</span>
                  <span>{pct.toFixed(0)}% of max</span>
                </div>
                <div className="h-4 bg-slate-900/50 rounded-full overflow-hidden flex">
                  <div
                    className="bg-blue-500/70 h-full transition-all"
                    style={{ width: `${inputPct}%` }}
                    title={`Input: ${formatTokenCount(b.total_input_tokens)}`}
                  />
                  <div
                    className="bg-emerald-500/70 h-full transition-all"
                    style={{ width: `${outputPct}%` }}
                    title={`Output: ${formatTokenCount(b.total_output_tokens)}`}
                  />
                  <div
                    className="bg-amber-500/70 h-full transition-all"
                    style={{ width: `${cacheReadPct}%` }}
                    title={`Cache Read: ${formatTokenCount(b.total_cache_read_tokens)}`}
                  />
                  <div
                    className="bg-sky-500/70 h-full transition-all"
                    style={{ width: `${cacheCreatePct}%` }}
                    title={`Cache Create: ${formatTokenCount(b.total_cache_creation_tokens)}`}
                  />
                </div>
              </div>

              {/* Token breakdown grid */}
              <div className="grid grid-cols-4 gap-3 text-sm">
                <div>
                  <div className="text-xs text-slate-400 mb-0.5">Input</div>
                  <div className="text-blue-400 font-medium">
                    {formatTokenCount(b.total_input_tokens)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-0.5">Output</div>
                  <div className="text-emerald-400 font-medium">
                    {formatTokenCount(b.total_output_tokens)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-0.5">Cache Read</div>
                  <div className="text-amber-400 font-medium">
                    {formatTokenCount(b.total_cache_read_tokens)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-0.5">Cache Create</div>
                  <div className="text-sky-400 font-medium">
                    {formatTokenCount(b.total_cache_creation_tokens)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-slate-400 pt-2">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-blue-500/70" /> Input
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-emerald-500/70" /> Output
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-amber-500/70" /> Cache Read
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-sky-500/70" /> Cache Create
        </span>
      </div>
    </div>
  );
}
