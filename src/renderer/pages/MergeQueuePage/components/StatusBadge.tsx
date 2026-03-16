import type { MergeStatus } from '../../../../shared/types';
import { Badge } from '../../../components/ui/badge';

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

export function StatusBadge({ status }: { status: MergeStatus }) {
  return (
    <Badge
      variant="outline"
      className={STATUS_COLORS[status]}
    >
      {status === 'merging' && (
        <span className="mr-1.5 h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
      )}
      {STATUS_LABELS[status]}
    </Badge>
  );
}
