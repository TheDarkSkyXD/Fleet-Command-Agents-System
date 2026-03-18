import type { FiArrowUp, FiCircle } from 'react-icons/fi';
import type { IssuePriority, IssueStatus, IssueType } from '../../../../shared/types';

export interface CreateIssueForm {
  title: string;
  description: string;
  type: IssueType;
  priority: IssuePriority;
}

export interface GroupProgress {
  total: number;
  completed: number;
  in_progress: number;
  open: number;
  blocked: number;
}

export type ActiveTab = 'issues' | 'groups' | 'ready' | 'completed';
export type ViewMode = 'list' | 'kanban';

export interface StatusConfigEntry {
  label: string;
  icon: typeof FiCircle;
  color: string;
  bg: string;
}

export type StatusConfigMap = Record<IssueStatus, StatusConfigEntry>;

export interface PriorityInfo {
  value: IssuePriority;
  label: string;
  icon: typeof FiArrowUp;
  color: string;
}

export interface TypeInfo {
  value: IssueType;
  label: string;
  color: string;
}
