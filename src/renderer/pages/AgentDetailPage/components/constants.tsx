import {
  FiActivity,
  FiAlertTriangle,
  FiCheckCircle,
  FiHash,
  FiInbox,
  FiLoader,
  FiSend,
  FiSquare,
  FiTool,
  FiXCircle,
  FiZap,
} from 'react-icons/fi';

export const CAPABILITY_COLORS: Record<string, string> = {
  scout: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  builder: 'bg-green-500/20 text-green-400 border-green-500/30',
  reviewer: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  lead: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  merger: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  coordinator: 'bg-red-500/20 text-red-400 border-red-500/30',
  monitor: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
};

export const CAPABILITY_ACCENT: Record<string, string> = {
  scout: 'from-cyan-500 to-cyan-700',
  builder: 'from-green-500 to-green-700',
  reviewer: 'from-amber-500 to-amber-700',
  lead: 'from-orange-500 to-orange-700',
  merger: 'from-blue-500 to-blue-700',
  coordinator: 'from-red-500 to-red-700',
  monitor: 'from-teal-500 to-teal-700',
};

export const CAPABILITY_ICON_BG: Record<string, string> = {
  scout: 'bg-cyan-500/30 text-cyan-300',
  builder: 'bg-green-500/30 text-green-300',
  reviewer: 'bg-amber-500/30 text-amber-300',
  lead: 'bg-orange-500/30 text-orange-300',
  merger: 'bg-blue-500/30 text-blue-300',
  coordinator: 'bg-red-500/30 text-red-300',
  monitor: 'bg-teal-500/30 text-teal-300',
};

export const STATE_COLORS: Record<string, string> = {
  booting: 'bg-blue-500/20 text-blue-400',
  working: 'bg-cyan-500/20 text-cyan-400',
  completed: 'bg-green-500/20 text-green-400',
  stalled: 'bg-amber-500/20 text-amber-400',
  zombie: 'bg-red-500/20 text-red-400',
};

export const STATE_DOT_COLORS: Record<string, string> = {
  booting: 'bg-blue-400 animate-pulse',
  working: 'bg-cyan-400 animate-pulse',
  completed: 'bg-green-400',
  stalled: 'bg-amber-400',
  zombie: 'bg-red-400',
};

/** State-specific icons for visual distinction */
export const STATE_ICONS: Record<string, { icon: React.ReactNode; className: string }> = {
  booting: { icon: <FiLoader className="h-5 w-5 animate-spin" />, className: 'text-blue-400' },
  working: {
    icon: <FiActivity className="h-5 w-5" />,
    className: 'text-cyan-400 animate-pulse',
  },
  completed: { icon: <FiCheckCircle className="h-5 w-5" />, className: 'text-green-400' },
  stalled: { icon: <FiAlertTriangle className="h-5 w-5" />, className: 'text-amber-400' },
  zombie: { icon: <FiXCircle className="h-5 w-5" />, className: 'text-red-400 animate-pulse' },
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

export const EVENT_TYPE_STYLES: Record<string, { bg: string; icon: React.ReactNode }> = {
  tool_start: {
    bg: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    icon: <FiTool className="h-3.5 w-3.5" />,
  },
  tool_end: {
    bg: 'bg-green-500/15 text-green-400 border-green-500/30',
    icon: <FiCheckCircle className="h-3.5 w-3.5" />,
  },
  session_start: {
    bg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    icon: <FiActivity className="h-3.5 w-3.5" />,
  },
  session_end: {
    bg: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
    icon: <FiSquare className="h-3.5 w-3.5" />,
  },
  spawn: {
    bg: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
    icon: <FiZap className="h-3.5 w-3.5" />,
  },
  error: {
    bg: 'bg-red-500/15 text-red-400 border-red-500/30',
    icon: <FiAlertTriangle className="h-3.5 w-3.5" />,
  },
  mail_sent: {
    bg: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
    icon: <FiSend className="h-3.5 w-3.5" />,
  },
  mail_received: {
    bg: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    icon: <FiInbox className="h-3.5 w-3.5" />,
  },
  custom: {
    bg: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
    icon: <FiHash className="h-3.5 w-3.5" />,
  },
};

export const LOG_LEVEL_COLORS: Record<string, string> = {
  debug: 'text-slate-400',
  info: 'text-slate-300',
  warn: 'text-amber-400',
  error: 'text-red-400',
};

export const MAIL_TYPE_COLORS: Record<string, string> = {
  status: 'bg-blue-500/15 text-blue-400',
  question: 'bg-sky-500/15 text-sky-400',
  result: 'bg-green-500/15 text-green-400',
  error: 'bg-red-500/15 text-red-400',
  worker_done: 'bg-emerald-500/15 text-emerald-400',
  merge_ready: 'bg-cyan-500/15 text-cyan-400',
  merged: 'bg-teal-500/15 text-teal-400',
  merge_failed: 'bg-red-500/15 text-red-400',
  escalation: 'bg-amber-500/15 text-amber-400',
  health_check: 'bg-indigo-500/15 text-indigo-400',
  dispatch: 'bg-violet-500/15 text-violet-400',
  assign: 'bg-orange-500/15 text-orange-400',
};

export const PRIORITY_COLORS: Record<string, string> = {
  low: 'text-slate-400',
  normal: 'text-slate-400',
  high: 'text-amber-400',
  urgent: 'text-red-400 font-semibold',
};
