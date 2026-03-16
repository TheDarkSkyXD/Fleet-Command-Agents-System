import type { PromptType } from '../../../../shared/types';
import { Badge } from '../../../components/ui/badge';
import { typeColors } from './constants';

export function TypeBadge({ type }: { type: PromptType }) {
  return (
    <Badge
      variant="outline"
      className={typeColors[type] || 'bg-slate-500/20 text-slate-400'}
    >
      {type}
    </Badge>
  );
}
