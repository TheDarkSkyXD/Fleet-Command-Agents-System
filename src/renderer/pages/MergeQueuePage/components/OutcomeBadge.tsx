import type { MergeStatus } from '../../../../shared/types';
import { Badge } from '../../../components/ui/badge';
import { StatusBadge } from './StatusBadge';

export function OutcomeBadge({ status }: { status: MergeStatus }) {
  if (status === 'merged') {
    return (
      <Badge variant="outline" className="gap-1 bg-emerald-500/15 text-emerald-400 border-transparent rounded-md">
        <span>{'\u2714'}</span> Success
      </Badge>
    );
  }
  if (status === 'failed') {
    return (
      <Badge variant="outline" className="gap-1 bg-red-500/15 text-red-400 border-transparent rounded-md">
        <span>{'\u2718'}</span> Failed
      </Badge>
    );
  }
  if (status === 'conflict') {
    return (
      <Badge variant="outline" className="gap-1 bg-amber-500/15 text-amber-400 border-transparent rounded-md">
        <span>{'\u26A0'}</span> Conflict
      </Badge>
    );
  }
  return <StatusBadge status={status} />;
}
