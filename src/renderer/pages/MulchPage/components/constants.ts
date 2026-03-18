import type { ExpertiseType, ExpertiseClassification } from '../../../../shared/types';

export const DOMAIN_COLORS: Record<string, string> = {
  architecture: 'bg-purple-600/20 text-purple-400 border-purple-500/30',
  agents: 'bg-blue-600/20 text-blue-400 border-blue-500/30',
  cli: 'bg-cyan-600/20 text-cyan-400 border-cyan-500/30',
  messaging: 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30',
  ecosystem: 'bg-amber-600/20 text-amber-400 border-amber-500/30',
  patterns: 'bg-pink-600/20 text-pink-400 border-pink-500/30',
  typescript: 'bg-sky-600/20 text-sky-400 border-sky-500/30',
  merge: 'bg-orange-600/20 text-orange-400 border-orange-500/30',
  testing: 'bg-lime-600/20 text-lime-400 border-lime-500/30',
  security: 'bg-red-600/20 text-red-400 border-red-500/30',
  default: 'bg-slate-600/20 text-slate-300 border-slate-500/30',
};

export const TYPE_ICONS: Record<ExpertiseType, string> = {
  convention: '\u{1F4CB}',
  pattern: '\u{1F9E9}',
  failure: '\u{26A0}',
  decision: '\u{2696}',
  reference: '\u{1F4D6}',
  guide: '\u{1F4DA}',
};

export const CLASSIFICATION_STYLES: Record<ExpertiseClassification, { color: string; label: string; description: string }> = {
  foundational: {
    color: 'bg-orange-600/20 text-orange-400 border-orange-500/30',
    label: 'Foundational',
    description: 'Stable conventions confirmed across sessions',
  },
  tactical: {
    color: 'bg-sky-600/20 text-sky-400 border-sky-500/30',
    label: 'Tactical',
    description: 'Session-specific patterns',
  },
  observational: {
    color: 'bg-slate-600/20 text-slate-300 border-slate-500/30',
    label: 'Observational',
    description: 'One-off findings or unverified hypotheses',
  },
};
