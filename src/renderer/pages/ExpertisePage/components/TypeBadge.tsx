import type { ExpertiseType } from '../../../../shared/types';
import { Badge } from '../../../components/ui/badge';
import { TYPE_COLORS } from './constants';

export function TypeBadge({ type }: { type: ExpertiseType }) {
  return (
    <Badge
      variant="outline"
      className={TYPE_COLORS[type] || 'bg-slate-700 text-slate-300'}
    >
      {type}
    </Badge>
  );
}
