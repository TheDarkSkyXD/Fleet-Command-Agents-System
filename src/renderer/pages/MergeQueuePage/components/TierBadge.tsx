import type { MergeResolutionTier } from '../../../../shared/types';
import { Badge } from '../../../components/ui/badge';

const TIER_COLORS: Record<MergeResolutionTier, string> = {
  'clean-merge': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'auto-resolve': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'ai-resolve': 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  reimagine: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const TIER_LABELS: Record<MergeResolutionTier, string> = {
  'clean-merge': 'Tier 1: Clean Merge',
  'auto-resolve': 'Tier 2: Auto-Resolve',
  'ai-resolve': 'Tier 3: AI-Resolve',
  reimagine: 'Tier 4: Reimagine',
};

const TIER_ICONS: Record<MergeResolutionTier, string> = {
  'clean-merge': '\u2714',
  'auto-resolve': '\u2699',
  'ai-resolve': '\u2728',
  reimagine: '\u267B',
};

export function TierBadge({ tier }: { tier: MergeResolutionTier }) {
  return (
    <Badge
      variant="outline"
      className={`gap-1.5 px-3 py-1 ${TIER_COLORS[tier]}`}
    >
      <span>{TIER_ICONS[tier]}</span>
      {TIER_LABELS[tier]}
    </Badge>
  );
}
