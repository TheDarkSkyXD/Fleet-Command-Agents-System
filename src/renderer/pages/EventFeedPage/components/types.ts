import {
  FiActivity,
  FiAlertTriangle,
  FiMail,
  FiPlay,
  FiTerminal,
  FiTool,
  FiZap,
} from 'react-icons/fi';
import type { Event, EventType } from '../../../../shared/types';

export type ViewTab = 'feed' | 'replay' | 'correlation';

export interface ToolCorrelation {
  toolName: string;
  agentName: string | null;
  sessionId: string | null;
  startEvent: Event;
  endEvent: Event | null;
  durationMs: number | null;
  isOrphaned: boolean;
}

export type AgentColor = { text: string; bg: string; border: string };

export const EVENT_TYPE_CONFIG: Record<
  EventType,
  { label: string; icon: typeof FiActivity; color: string; bgColor: string }
> = {
  tool_start: {
    label: 'Tool Start',
    icon: FiTool,
    color: 'text-blue-400',
    bgColor: 'bg-blue-900/30 border-blue-700',
  },
  tool_end: {
    label: 'Tool End',
    icon: FiTool,
    color: 'text-blue-300',
    bgColor: 'bg-blue-900/20 border-blue-800',
  },
  session_start: {
    label: 'Session Start',
    icon: FiPlay,
    color: 'text-green-400',
    bgColor: 'bg-green-900/30 border-green-700',
  },
  session_end: {
    label: 'Session End',
    icon: FiTerminal,
    color: 'text-slate-400',
    bgColor: 'bg-slate-800/50 border-slate-700',
  },
  mail_sent: {
    label: 'Mail Sent',
    icon: FiMail,
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-900/30 border-cyan-700',
  },
  mail_received: {
    label: 'Mail Received',
    icon: FiMail,
    color: 'text-cyan-300',
    bgColor: 'bg-cyan-900/20 border-cyan-800',
  },
  spawn: {
    label: 'Agent Spawn',
    icon: FiZap,
    color: 'text-amber-400',
    bgColor: 'bg-amber-900/30 border-amber-700',
  },
  error: {
    label: 'Error',
    icon: FiAlertTriangle,
    color: 'text-red-400',
    bgColor: 'bg-red-900/30 border-red-700',
  },
  custom: {
    label: 'Custom',
    icon: FiActivity,
    color: 'text-sky-400',
    bgColor: 'bg-sky-900/30 border-sky-700',
  },
};

export const ALL_EVENT_TYPES: EventType[] = [
  'spawn',
  'session_start',
  'session_end',
  'tool_start',
  'tool_end',
  'mail_sent',
  'mail_received',
  'error',
  'custom',
];

export const AGENT_COLORS: AgentColor[] = [
  { text: 'text-blue-400', bg: 'bg-blue-900/40', border: 'border-l-blue-400' },
  { text: 'text-green-400', bg: 'bg-green-900/40', border: 'border-l-green-400' },
  { text: 'text-amber-400', bg: 'bg-amber-900/40', border: 'border-l-amber-400' },
  { text: 'text-sky-400', bg: 'bg-sky-900/40', border: 'border-l-sky-400' },
  { text: 'text-cyan-400', bg: 'bg-cyan-900/40', border: 'border-l-cyan-400' },
  { text: 'text-red-400', bg: 'bg-red-900/40', border: 'border-l-red-400' },
  { text: 'text-orange-400', bg: 'bg-orange-900/40', border: 'border-l-orange-400' },
  { text: 'text-teal-400', bg: 'bg-teal-900/40', border: 'border-l-teal-400' },
];

export function formatEventTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);

  if (diffSecs < 5) return 'just now';
  if (diffSecs < 60) return `${diffSecs}s ago`;
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString();
}

export function formatFullTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });
}

export function formatReplayTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}
