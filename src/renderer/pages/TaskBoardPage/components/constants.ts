import {
  FiAlertCircle,
  FiAlertTriangle,
  FiArrowDown,
  FiArrowUp,
  FiCheckCircle,
  FiCircle,
  FiLoader,
} from 'react-icons/fi';
import type { IssuePriority, IssueStatus, IssueType } from '../../../../shared/types';

export const issueTypes: { value: IssueType; label: string; color: string }[] = [
  { value: 'task', label: 'Task', color: 'text-blue-400' },
  { value: 'bug', label: 'Bug', color: 'text-red-400' },
  { value: 'feature', label: 'Feature', color: 'text-green-400' },
  { value: 'research', label: 'Research', color: 'text-sky-400' },
  { value: 'spike', label: 'Spike', color: 'text-amber-400' },
];

export const priorities: {
  value: IssuePriority;
  label: string;
  icon: typeof FiArrowUp;
  color: string;
}[] = [
  { value: 'critical', label: 'Critical', icon: FiAlertCircle, color: 'text-red-500' },
  { value: 'high', label: 'High', icon: FiArrowUp, color: 'text-orange-400' },
  { value: 'medium', label: 'Medium', icon: FiCircle, color: 'text-yellow-400' },
  { value: 'low', label: 'Low', icon: FiArrowDown, color: 'text-slate-400' },
];

export const statusConfig: Record<
  IssueStatus,
  { label: string; icon: typeof FiCircle; color: string; bg: string }
> = {
  open: { label: 'Open', icon: FiCircle, color: 'text-blue-400', bg: 'bg-blue-400/10' },
  in_progress: {
    label: 'In Progress',
    icon: FiLoader,
    color: 'text-amber-400',
    bg: 'bg-amber-400/10',
  },
  closed: { label: 'Done', icon: FiCheckCircle, color: 'text-green-400', bg: 'bg-green-400/10' },
  blocked: { label: 'Blocked', icon: FiAlertTriangle, color: 'text-red-400', bg: 'bg-red-400/10' },
};

export const kanbanColumns: IssueStatus[] = ['open', 'in_progress', 'blocked', 'closed'];

// ID generator (simple nanoid-like)
export function generateId(prefix: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}_${result}`;
}
