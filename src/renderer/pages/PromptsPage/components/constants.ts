import type { PromptType } from '../../../../shared/types';

export const typeColors: Record<PromptType, string> = {
  system: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
  user: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  agent: 'bg-green-500/20 text-green-400 border-green-500/30',
  task: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  template: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
};
