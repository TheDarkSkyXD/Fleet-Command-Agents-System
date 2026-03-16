import { FiUsers } from 'react-icons/fi';
import type { CapabilityBreakdown } from '../../../../shared/types';
import { Card, CardContent } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import type { FormatTokenCount, FormatDuration, FormatCost } from './types';

const capabilityColor = (cap: string | null | undefined): string => {
  if (!cap) return 'text-slate-400';
  switch (cap) {
    case 'scout':
      return 'text-emerald-400';
    case 'builder':
      return 'text-blue-400';
    case 'reviewer':
      return 'text-amber-400';
    case 'lead':
      return 'text-orange-400';
    case 'merger':
      return 'text-cyan-400';
    case 'coordinator':
      return 'text-red-400';
    case 'monitor':
      return 'text-teal-400';
    default:
      return 'text-slate-400';
  }
};

const capabilityBgColor = (cap: string | null | undefined): string => {
  if (!cap) return 'bg-slate-700';
  switch (cap) {
    case 'scout':
      return 'bg-emerald-900/40 border-emerald-700/50';
    case 'builder':
      return 'bg-blue-900/40 border-blue-700/50';
    case 'reviewer':
      return 'bg-amber-900/40 border-amber-700/50';
    case 'lead':
      return 'bg-orange-900/40 border-orange-700/50';
    case 'merger':
      return 'bg-cyan-900/40 border-cyan-700/50';
    case 'coordinator':
      return 'bg-red-900/40 border-red-700/50';
    case 'monitor':
      return 'bg-teal-900/40 border-teal-700/50';
    default:
      return 'bg-slate-700';
  }
};

interface CapabilityBreakdownTabProps {
  breakdown: CapabilityBreakdown[];
  formatTokenCount: FormatTokenCount;
  formatDuration: FormatDuration;
  formatCost: FormatCost;
}

export function CapabilityBreakdownTab({
  breakdown,
  formatTokenCount,
  formatDuration,
  formatCost,
}: CapabilityBreakdownTabProps) {
  if (breakdown.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <FiUsers size={40} className="mb-3 opacity-50" />
        <p className="text-lg font-medium">No capability usage data yet</p>
        <p className="text-sm mt-1">
          Capability breakdown will appear after sessions with assigned capabilities complete
        </p>
      </div>
    );
  }

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
    <div className="space-y-4" data-testid="capability-breakdown">
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
          <Card
            key={b.capability}
            className={`${capabilityBgColor(b.capability)}`}
            data-testid={`capability-row-${b.capability}`}
          >
            <CardContent className="p-5 pt-5">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <FiUsers className={capabilityColor(b.capability)} size={20} />
                  <span className={`text-lg font-bold ${capabilityColor(b.capability)} capitalize`}>
                    {b.capability}
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
