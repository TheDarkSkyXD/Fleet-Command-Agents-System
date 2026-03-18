import { FiClock, FiFolder, FiLink, FiTrash2, FiUser, FiX } from 'react-icons/fi';
import type { Issue, IssuePriority, IssueType } from '../../../../shared/types';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { formatDateOnly } from '../../../lib/dateFormatting';
import type { PriorityInfo, StatusConfigMap, TypeInfo } from './types';

export function IssueCard({
  issue,
  statusConfig: statuses,
  getPriorityInfo,
  getTypeInfo,
  claimingId,
  claimAgent,
  setClaimAgent,
  setClaimingId,
  handleClaim,
  handleDelete,
  onSelect,
}: {
  issue: Issue;
  onSelect: (id: string) => void;
  statusConfig: StatusConfigMap;
  getPriorityInfo: (p: IssuePriority) => PriorityInfo;
  getTypeInfo: (t: IssueType) => TypeInfo;
  claimingId: string | null;
  claimAgent: string;
  setClaimAgent: (val: string) => void;
  setClaimingId: (val: string | null) => void;
  handleClaim: (issueId: string) => void;
  handleDelete: (id: string) => void;
}) {
  const status = statuses[issue.status];
  const priorityInfo = getPriorityInfo(issue.priority);
  const typeInfo = getTypeInfo(issue.type);
  const PriorityIcon = priorityInfo.icon;
  const StatusIcon = status.icon;

  return (
    <div
      className="rounded-lg border border-slate-700 bg-slate-800 p-4 hover:border-blue-500/50 cursor-pointer transition-colors"
      onClick={() => onSelect(issue.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect(issue.id);
      }}
      data-testid={`issue-card-${issue.id}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {/* Status badge */}
            <Badge variant="outline" className={`gap-1 ${status.color} ${status.bg} border-transparent`}>
              <StatusIcon size={12} />
              {status.label}
            </Badge>

            {/* Type badge */}
            <Badge variant="outline" className={`border-transparent ${typeInfo.color}`}>
              {typeInfo.label}
            </Badge>

            {/* Priority */}
            <Badge variant="outline" className={`gap-1 border-transparent ${priorityInfo.color}`}>
              <PriorityIcon size={12} />
              {priorityInfo.label}
            </Badge>

            {/* Human review tag for done tasks */}
            {issue.status === 'closed' && (
              <Badge variant="outline" className="gap-1 border-transparent bg-purple-500/10 text-purple-400">
                Human Review
              </Badge>
            )}

            {/* Group badge */}
            {issue.group_id && (
              <Badge variant="outline" className="gap-1 border-transparent text-sky-400">
                <FiFolder size={10} />
                Grouped
              </Badge>
            )}

            {/* Dependency badge */}
            {issue.dependencies &&
              (() => {
                try {
                  const depCount = JSON.parse(issue.dependencies).length;
                  if (depCount > 0) {
                    return (
                      <Badge
                        variant="outline"
                        className={`gap-1 border-transparent ${
                          issue.status === 'blocked' ? 'text-red-400' : 'text-slate-400'
                        }`}
                        data-testid={`dep-count-${issue.id}`}
                      >
                        <FiLink size={10} />
                        {depCount} dep{depCount > 1 ? 's' : ''}
                      </Badge>
                    );
                  }
                  return null;
                } catch {
                  return null;
                }
              })()}
          </div>

          <h3 className="text-sm font-medium text-slate-50 truncate" title={issue.title}>
            {issue.title}
          </h3>

          {issue.description && (
            <p className="text-xs text-slate-400 mt-1 line-clamp-2">{issue.description}</p>
          )}

          <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
            {issue.assigned_agent && (
              <span className="inline-flex items-center gap-1 text-amber-400">
                <FiUser size={11} />
                {issue.assigned_agent}
              </span>
            )}
            <span>
              <FiClock size={11} className="inline mr-1" />
              {formatDateOnly(issue.created_at)}
            </span>
          </div>
        </div>

        {/* biome-ignore lint/a11y/useKeyWithClickEvents: parent handles keyboard */}
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {/* Claim button (only for open issues) */}
          {issue.status === 'open' && claimingId === issue.id && (
            <div className="flex items-center gap-1">
              <Input
                type="text"
                value={claimAgent}
                onChange={(e) => setClaimAgent(e.target.value)}
                placeholder="Agent name"
                className="w-28 h-7 rounded border-slate-600 bg-slate-900 px-2 py-1 text-xs text-slate-50 placeholder-slate-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleClaim(issue.id);
                  if (e.key === 'Escape') {
                    setClaimingId(null);
                    setClaimAgent('');
                  }
                }}
                // biome-ignore lint/a11y/noAutofocus: intentional for modal/inline input UX
                autoFocus
              />
              <Button
                size="sm"
                onClick={() => handleClaim(issue.id)}
                disabled={!claimAgent.trim()}
                className="h-7 bg-amber-600/15 px-2 text-xs text-amber-400 border border-amber-500/25 hover:bg-amber-600/25 hover:text-amber-300"
              >
                Claim
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setClaimingId(null);
                  setClaimAgent('');
                }}
                className="h-7 w-7 text-slate-400 hover:text-slate-200"
              >
                <FiX size={14} />
              </Button>
            </div>
          )}
          {issue.status === 'open' && claimingId !== issue.id && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setClaimingId(issue.id)}
              className="h-8 w-8 text-slate-400 hover:text-amber-400"
              title="Claim issue for agent"
            >
              <FiUser size={14} />
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleDelete(issue.id)}
            className="h-8 w-8 text-slate-400 hover:text-red-400"
            title="Delete issue"
          >
            <FiTrash2 size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
}
