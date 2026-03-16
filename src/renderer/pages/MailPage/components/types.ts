import type { MessagePriority, MessageType } from '../../../../shared/types';

export type MailTab = 'inbox' | 'outbox' | 'all';

export interface ComposeForm {
  from_agent: string;
  to_agent: string;
  subject: string;
  body: string;
  type: MessageType;
  priority: MessagePriority;
  thread_id: string;
  payload: string;
}

export interface MailFilters {
  search: string;
  type: string;
  priority: string;
  agent: string;
  runId: string;
}

export function priorityColor(priority: MessagePriority): string {
  switch (priority) {
    case 'urgent':
      return 'text-red-400';
    case 'high':
      return 'text-orange-400';
    case 'normal':
      return 'text-slate-400';
    case 'low':
      return 'text-slate-400';
  }
}

export function typeColor(type: MessageType): string {
  switch (type) {
    case 'error':
    case 'merge_failed':
      return 'bg-red-900/40 text-red-300 border-red-700';
    case 'escalation':
      return 'bg-orange-900/40 text-orange-300 border-orange-700';
    case 'worker_done':
    case 'merged':
      return 'bg-green-900/40 text-green-300 border-green-700';
    case 'dispatch':
    case 'assign':
      return 'bg-blue-900/40 text-blue-300 border-blue-700';
    case 'question':
      return 'bg-sky-900/40 text-sky-300 border-sky-700';
    case 'merge_ready':
      return 'bg-cyan-900/40 text-cyan-300 border-cyan-700';
    case 'health_check':
      return 'bg-yellow-900/40 text-yellow-300 border-yellow-700';
    default:
      return 'bg-slate-700/40 text-slate-300 border-slate-600';
  }
}
