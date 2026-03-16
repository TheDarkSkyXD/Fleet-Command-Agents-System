import type { ExpertiseClassification, ExpertiseType } from '../../../../shared/types';

export const EXPERTISE_TYPES: ExpertiseType[] = [
  'convention',
  'pattern',
  'failure',
  'decision',
  'reference',
  'guide',
];

export const EXPERTISE_CLASSIFICATIONS: ExpertiseClassification[] = [
  'foundational',
  'tactical',
  'observational',
];

export const TYPE_COLORS: Record<ExpertiseType, string> = {
  convention: 'bg-blue-600/20 text-blue-400 border-blue-500/30',
  pattern: 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30',
  failure: 'bg-red-600/20 text-red-400 border-red-500/30',
  decision: 'bg-sky-600/20 text-sky-400 border-sky-500/30',
  reference: 'bg-amber-600/20 text-amber-400 border-amber-500/30',
  guide: 'bg-cyan-600/20 text-cyan-400 border-cyan-500/30',
};

export const CLASSIFICATION_COLORS: Record<ExpertiseClassification, string> = {
  foundational: 'bg-orange-600/20 text-orange-400',
  tactical: 'bg-sky-600/20 text-sky-400',
  observational: 'bg-slate-600/20 text-slate-300',
};
