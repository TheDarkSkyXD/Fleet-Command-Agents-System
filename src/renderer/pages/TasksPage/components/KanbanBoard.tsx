import { useState } from 'react';
import type { Issue, IssuePriority, IssueStatus, IssueType } from '../../../../shared/types';
import { Badge } from '../../../components/ui/badge';
import { kanbanColumns } from './constants';
import { KanbanCard } from './KanbanCard';
import type { PriorityInfo, StatusConfigMap, TypeInfo } from './types';

export function KanbanBoard({
  issues,
  statusConfig: statuses,
  getPriorityInfo,
  getTypeInfo,
  onStatusChange,
  onSelect,
}: {
  issues: Issue[];
  statusConfig: StatusConfigMap;
  getPriorityInfo: (p: IssuePriority) => PriorityInfo;
  getTypeInfo: (t: IssueType) => TypeInfo;
  onStatusChange: (id: string, newStatus: IssueStatus) => void;
  onSelect: (id: string) => void;
}) {
  const [dragOverColumn, setDragOverColumn] = useState<IssueStatus | null>(null);

  // Group issues by status
  const issuesByStatus: Record<IssueStatus, Issue[]> = {
    open: [],
    in_progress: [],
    blocked: [],
    closed: [],
  };
  for (const issue of issues) {
    if (issuesByStatus[issue.status]) {
      issuesByStatus[issue.status].push(issue);
    }
  }

  const handleDragStart = (e: React.DragEvent, issueId: string) => {
    e.dataTransfer.setData('text/plain', issueId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, status: IssueStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumn(status);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if leaving the column entirely (not entering a child)
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
      setDragOverColumn(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetStatus: IssueStatus) => {
    e.preventDefault();
    setDragOverColumn(null);
    const issueId = e.dataTransfer.getData('text/plain');
    if (issueId) {
      const issue = issues.find((i) => i.id === issueId);
      if (issue && issue.status !== targetStatus) {
        onStatusChange(issueId, targetStatus);
      }
    }
  };

  // Column border accent colors
  const columnAccent: Record<IssueStatus, string> = {
    open: 'border-t-blue-500',
    in_progress: 'border-t-amber-500',
    blocked: 'border-t-red-500',
    closed: 'border-t-green-500',
  };

  return (
    <div className="grid grid-cols-4 gap-4" data-testid="kanban-board">
      {kanbanColumns.map((status) => {
        const config = statuses[status];
        const columnIssues = issuesByStatus[status];
        const StatusIcon = config.icon;
        const isDragOver = dragOverColumn === status;

        return (
          <div
            key={status}
            className={`flex flex-col rounded-lg border border-slate-700 ${columnAccent[status]} border-t-2 bg-slate-800/50 min-h-[300px] transition-colors ${
              isDragOver ? 'bg-slate-700/50 border-slate-500' : ''
            }`}
            onDragOver={(e) => handleDragOver(e, status)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, status)}
            data-testid={`kanban-column-${status}`}
          >
            {/* Column Header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-700">
              <div className="flex items-center gap-2">
                <StatusIcon size={14} className={config.color} />
                <span className="text-sm font-medium text-slate-200">{config.label}</span>
              </div>
              <Badge
                variant="secondary"
                className={`min-w-[20px] justify-center ${config.bg} ${config.color}`}
                data-testid={`kanban-column-count-${status}`}
              >
                {columnIssues.length}
              </Badge>
            </div>

            {/* Column Body */}
            <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-280px)]">
              {columnIssues.length === 0 ? (
                <div className="flex items-center justify-center h-20 text-xs text-slate-400 italic">
                  No issues
                </div>
              ) : (
                columnIssues.map((issue) => (
                  <KanbanCard
                    key={issue.id}
                    issue={issue}
                    getPriorityInfo={getPriorityInfo}
                    getTypeInfo={getTypeInfo}
                    onDragStart={handleDragStart}
                    onSelect={onSelect}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
