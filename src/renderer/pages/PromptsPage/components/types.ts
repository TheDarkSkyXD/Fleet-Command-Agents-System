import type { PromptType } from '../../../../shared/types';

export interface InheritanceLink {
  id: string;
  name: string;
  type: PromptType;
  content: string;
}

export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
  leftNum: number | null;
  rightNum: number | null;
}
