import { FiActivity, FiTrash2 } from 'react-icons/fi';
import type { Metric } from '../../../../shared/types';
import { toast } from 'sonner';
import { Tooltip } from '../../../components/Tooltip';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Separator } from '../../../components/ui/separator';
import { TokenBadge } from './TokenBadge';
import { DetailRow } from './DetailRow';
import { TokenRow } from './TokenRow';
import type { FormatTokenCount, FormatDuration, FormatCost, ModelColorFn } from './types';

interface SessionsTabProps {
  metrics: Metric[];
  selectedMetric: Metric | null;
  onSelectMetric: (m: Metric | null) => void;
  formatTokenCount: FormatTokenCount;
  formatDuration: FormatDuration;
  formatCost: FormatCost;
  modelColor: ModelColorFn;
  onRefresh: () => void;
}

export function SessionsTab({
  metrics,
  selectedMetric,
  onSelectMetric,
  formatTokenCount,
  formatDuration,
  formatCost,
  modelColor,
  onRefresh,
}: SessionsTabProps) {
  const handleDelete = async (id: string) => {
    try {
      await window.electronAPI.metricsDelete(id);
      toast.success('Metric record deleted');
      if (selectedMetric?.id === id) onSelectMetric(null);
      onRefresh();
    } catch (err) {
      console.error('Failed to delete metric:', err);
      toast.error('Failed to delete metric');
    }
  };

  if (metrics.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <FiActivity size={40} className="mb-3 opacity-50" />
        <p className="text-lg font-medium">No session metrics yet</p>
        <p className="text-sm mt-1">Token usage will appear here after agent sessions complete</p>
      </div>
    );
  }

  return (
    <div className="flex gap-6">
      {/* Session list */}
      <div className="flex-1 space-y-2">
        {metrics.map((m) => {
          const totalTokens =
            (m.input_tokens || 0) +
            (m.output_tokens || 0) +
            (m.cache_read_tokens || 0) +
            (m.cache_creation_tokens || 0);
          const isSelected = selectedMetric?.id === m.id;
          return (
            <Button
              key={m.id}
              variant="ghost"
              type="button"
              onClick={() => onSelectMetric(isSelected ? null : m)}
              className={`h-auto w-full text-left rounded-lg border p-4 transition-colors ${
                isSelected
                  ? 'border-blue-500 bg-blue-900/20'
                  : 'border-slate-700 bg-slate-800 hover:bg-slate-750 hover:border-slate-600'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-50">
                    {m.agent_name || 'Unknown Agent'}
                  </span>
                  {m.model_used && (
                    <Badge
                      variant="outline"
                      className={`${modelColor(m.model_used)} bg-slate-900/50 border-slate-700`}
                    >
                      {m.model_used}
                    </Badge>
                  )}
                  {m.capability && (
                    <Badge variant="secondary" className="bg-slate-700/50 text-slate-400 border-transparent">
                      {m.capability}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <span>{formatDuration(m.duration_ms)}</span>
                  <span>{formatCost(m.estimated_cost)}</span>
                  <Tooltip content="Remove session">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-slate-500 hover:text-red-400"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(m.id);
                      }}
                    >
                      <FiTrash2 size={14} />
                    </Button>
                  </Tooltip>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 text-xs">
                <TokenBadge
                  label="Input"
                  value={formatTokenCount(m.input_tokens)}
                  color="text-blue-400"
                />
                <TokenBadge
                  label="Output"
                  value={formatTokenCount(m.output_tokens)}
                  color="text-emerald-400"
                />
                <TokenBadge
                  label="Cache Read"
                  value={formatTokenCount(m.cache_read_tokens)}
                  color="text-amber-400"
                />
                <TokenBadge
                  label="Cache Create"
                  value={formatTokenCount(m.cache_creation_tokens)}
                  color="text-sky-400"
                />
              </div>
              <div className="flex items-center justify-between mt-2 text-xs text-slate-400">
                <span>Total: {formatTokenCount(totalTokens)} tokens</span>
                <span>{m.completed_at || m.started_at || ''}</span>
              </div>
            </Button>
          );
        })}
      </div>

      {/* Detail panel */}
      {selectedMetric && (
        <Card className="w-80 border-slate-700 bg-slate-800 h-fit sticky top-6">
          <CardHeader className="p-5 pb-0">
            <CardTitle className="text-sm font-semibold text-slate-50 flex items-center gap-2">
              <FiActivity className="text-blue-400" />
              Session Detail
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-4">
            <div className="space-y-3 text-sm">
              <DetailRow label="Agent" value={selectedMetric.agent_name || '\u2014'} />
              <DetailRow label="Model" value={selectedMetric.model_used || '\u2014'} />
              <DetailRow label="Capability" value={selectedMetric.capability || '\u2014'} />
              <DetailRow label="Task ID" value={selectedMetric.task_id || '\u2014'} />
              <DetailRow label="Run ID" value={selectedMetric.run_id || '\u2014'} />
              <DetailRow label="Parent" value={selectedMetric.parent_agent || '\u2014'} />

              <Separator className="bg-slate-700" />

              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase mb-2">
                  Token Breakdown
                </h4>
                <div className="space-y-2">
                  <TokenRow
                    label="Input Tokens"
                    value={selectedMetric.input_tokens}
                    color="text-blue-400"
                  />
                  <TokenRow
                    label="Output Tokens"
                    value={selectedMetric.output_tokens}
                    color="text-emerald-400"
                  />
                  <TokenRow
                    label="Cache Read Tokens"
                    value={selectedMetric.cache_read_tokens}
                    color="text-amber-400"
                  />
                  <TokenRow
                    label="Cache Creation Tokens"
                    value={selectedMetric.cache_creation_tokens}
                    color="text-sky-400"
                  />
                </div>
              </div>

              <Separator className="bg-slate-700" />

              <div className="space-y-3">
                <DetailRow label="Duration" value={formatDuration(selectedMetric.duration_ms)} />
                <DetailRow label="Est. Cost" value={formatCost(selectedMetric.estimated_cost)} />
                <DetailRow label="Started" value={selectedMetric.started_at || '\u2014'} />
                <DetailRow label="Completed" value={selectedMetric.completed_at || '\u2014'} />
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
