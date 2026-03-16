import { FiLink, FiUser } from 'react-icons/fi';
import type { Issue, IssuePriority, IssueType } from '../../../../shared/types';
import { Badge } from '../../../components/ui/badge';
import { formatDateOnly } from '../../../lib/dateFormatting';
import type { PriorityInfo, TypeInfo } from './types';

export function KanbanCard({
  issue,
  getPriorityInfo,
  getTypeInfo,
  onDragStart,
  onSelect,
}: {
  issue: Issue;
  getPriorityInfo: (p: IssuePriority) => PriorityInfo;
  getTypeInfo: (t: IssueType) => TypeInfo;
  onDragStart: (e: React.DragEvent, issueId: string) => void;
  onSelect: (id: string) => void;
}) {
  const priorityInfo = getPriorityInfo(issue.priority);
  const typeInfo = getTypeInfo(issue.type);
  const PriorityIcon = priorityInfo.icon;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, issue.id)}
      onClick={() => onSelect(issue.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect(issue.id);
      }}
      className="rounded-md border border-slate-600 bg-slate-800 p-3 cursor-grab hover:border-blue-500/50 hover:bg-slate-750 active:cursor-grabbing transition-colors"
      data-testid={`kanban-card-${issue.id}`}
    >
      {/* Title */}
      <h4 className="text-sm font-medium text-slate-100 mb-2 line-clamp-2" title={issue.title}>
        {issue.title}
      </h4>

      {/* Badges row */}
      <div className="flex items-center flex-wrap gap-1.5">
        {/* Type badge */}
        <Badge
          variant="outline"
          className={`rounded px-1.5 py-0.5 text-[10px] border-transparent ${typeInfo.color} bg-slate-700/50`}
        >
          {typeInfo.label}
        </Badge>

        {/* Priority */}
        <Badge
          variant="outline"
          className={`gap-0.5 rounded px-1.5 py-0.5 text-[10px] border-transparent ${priorityInfo.color} bg-slate-700/50`}
        >
          <PriorityIcon size={10} />
          {priorityInfo.label}
        </Badge>

        {/* Dependency count */}
        {issue.dependencies &&
          (() => {
            try {
              const depCount = JSON.parse(issue.dependencies).length;
              if (depCount > 0) {
                return (
                  <Badge
                    variant="outline"
                    className="gap-0.5 rounded px-1.5 py-0.5 text-[10px] border-transparent text-slate-400 bg-slate-700/50"
                  >
                    <FiLink size={9} />
                    {depCount}
                  </Badge>
                );
              }
              return null;
            } catch {
              return null;
            }
          })()}
      </div>

      {/* Bottom row: agent + date */}
      <div className="flex items-center justify-between mt-2 text-[10px] text-slate-400">
        {issue.assigned_agent ? (
          <span
            className="inline-flex items-center gap-1 text-amber-400 truncate max-w-[60%]"
            title={issue.assigned_agent}
          >
            <FiUser size={10} />
            {issue.assigned_agent}
          </span>
        ) : (
          <span />
        )}
        <span>{formatDateOnly(issue.created_at)}</span>
      </div>
    </div>
  );
}
