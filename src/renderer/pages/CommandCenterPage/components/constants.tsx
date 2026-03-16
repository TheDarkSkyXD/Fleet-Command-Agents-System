import {
  FiActivity,
  FiAlertTriangle,
  FiCheckCircle,
  FiLoader,
  FiXCircle,
} from 'react-icons/fi';
import type { AgentCapability } from '../../../../shared/types';

/** Default model per capability */
export const CAPABILITY_DEFAULTS: Record<
  AgentCapability,
  { model: string; description: string; color: string }
> = {
  scout: {
    model: 'haiku',
    description: 'Read-only exploration agent',
    color: 'cyan',
  },
  builder: {
    model: 'sonnet',
    description: 'Code implementation agent',
    color: 'blue',
  },
  reviewer: {
    model: 'sonnet',
    description: 'Code review agent',
    color: 'cyan',
  },
  lead: {
    model: 'opus',
    description: 'Team lead / orchestrator',
    color: 'amber',
  },
  merger: {
    model: 'opus',
    description: 'Merge conflict resolution',
    color: 'emerald',
  },
  coordinator: {
    model: 'opus',
    description: 'Multi-agent coordinator',
    color: 'red',
  },
  monitor: {
    model: 'opus',
    description: 'System health monitor',
    color: 'teal',
  },
};

export const CAPABILITY_COLORS: Record<string, string> = {
  scout: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  builder: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  reviewer: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  lead: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  merger: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  coordinator: 'bg-red-500/20 text-red-400 border-red-500/30',
  monitor: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
};

export const STATE_COLORS: Record<string, string> = {
  booting: 'bg-blue-500/20 text-blue-400',
  working: 'bg-green-500/20 text-green-400',
  completed: 'bg-slate-500/20 text-slate-400',
  stalled: 'bg-amber-500/20 text-amber-400',
  zombie: 'bg-red-500/20 text-red-400',
};

export const STATE_DOT_COLORS: Record<string, string> = {
  booting: 'bg-blue-400 animate-pulse',
  working: 'bg-green-400 animate-activity-pulse',
  completed: 'bg-slate-400',
  stalled: 'bg-amber-400',
  zombie: 'bg-red-400',
};

/** State-specific icons for visual distinction */
export const STATE_ICONS: Record<string, { icon: React.ReactNode; className: string }> = {
  booting: { icon: <FiLoader className="h-3.5 w-3.5 animate-spin" />, className: 'text-blue-400' },
  working: {
    icon: <FiActivity className="h-3.5 w-3.5" />,
    className: 'text-green-400 animate-pulse',
  },
  completed: { icon: <FiCheckCircle className="h-3.5 w-3.5" />, className: 'text-slate-400' },
  stalled: { icon: <FiAlertTriangle className="h-3.5 w-3.5" />, className: 'text-amber-400' },
  zombie: { icon: <FiXCircle className="h-3.5 w-3.5" />, className: 'text-red-400 animate-pulse' },
};

/** Human-readable state descriptions for hover tooltips */
export const STATE_TOOLTIPS: Record<string, string> = {
  booting: 'Agent is starting up and initializing',
  working: 'Agent is actively processing tasks',
  completed: 'Agent has finished all assigned work',
  stalled: 'Agent appears stuck or unresponsive',
  zombie:
    'Zombie: Agent process has died unexpectedly. The session remains but the process is no longer running. Stop and respawn to recover.',
};

/** Human-readable capability descriptions for hover tooltips */
export const CAPABILITY_TOOLTIPS: Record<string, string> = {
  scout: 'Explores codebase and gathers information',
  builder: 'Writes and modifies code to implement features',
  reviewer: 'Reviews code changes for quality and correctness',
  lead: 'Coordinates and delegates work to other agents',
  merger: 'Handles git merge operations and conflict resolution',
  coordinator: 'Orchestrates the entire agent swarm',
  monitor: 'Watches for issues and reports anomalies',
};

export const MODELS = ['haiku', 'sonnet', 'opus'];

export const ALL_CAPABILITIES: AgentCapability[] = [
  'scout',
  'builder',
  'reviewer',
  'lead',
  'merger',
  'coordinator',
  'monitor',
];

/** Border accent colors per capability for left-border styling */
export const CAPABILITY_BORDER_ACCENT: Record<string, string> = {
  scout: 'border-l-cyan-500',
  builder: 'border-l-blue-500',
  reviewer: 'border-l-cyan-500',
  lead: 'border-l-amber-500',
  merger: 'border-l-emerald-500',
  coordinator: 'border-l-red-500',
  monitor: 'border-l-teal-500',
};

/** Model badge styling */
export const MODEL_COLORS: Record<string, string> = {
  haiku: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  sonnet: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  opus: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
};
