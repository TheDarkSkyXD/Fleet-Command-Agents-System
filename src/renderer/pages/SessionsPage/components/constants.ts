import type { AgentState, AgentCapability } from '../../../../shared/types';

export const STATE_COLORS: Record<AgentState, string> = {
  booting: 'bg-sky-600/20 text-sky-400 border-sky-500/30',
  working: 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30',
  completed: 'bg-slate-600/20 text-slate-300 border-slate-500/30',
  stalled: 'bg-amber-600/20 text-amber-400 border-amber-500/30',
  zombie: 'bg-red-600/20 text-red-400 border-red-500/30',
};

export const CAPABILITY_COLORS: Record<AgentCapability, string> = {
  coordinator: 'bg-purple-600/20 text-purple-400 border-purple-500/30',
  lead: 'bg-blue-600/20 text-blue-400 border-blue-500/30',
  scout: 'bg-cyan-600/20 text-cyan-400 border-cyan-500/30',
  builder: 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30',
  reviewer: 'bg-amber-600/20 text-amber-400 border-amber-500/30',
  merger: 'bg-orange-600/20 text-orange-400 border-orange-500/30',
  monitor: 'bg-pink-600/20 text-pink-400 border-pink-500/30',
};
