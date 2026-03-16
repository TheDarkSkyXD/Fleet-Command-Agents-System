import type { ExpertiseClassification } from '../../../../shared/types';
import { Badge } from '../../../components/ui/badge';
import { CLASSIFICATION_COLORS } from './constants';

export function ClassificationBadge({ classification }: { classification: ExpertiseClassification }) {
  return (
    <Badge
      variant="outline"
      className={`border-transparent ${CLASSIFICATION_COLORS[classification] || 'bg-slate-700 text-slate-300'}`}
    >
      {classification}
    </Badge>
  );
}
