import {
  FiCheckCircle,
  FiClock,
  FiEdit3,
  FiFolder,
  FiHash,
  FiUser,
} from 'react-icons/fi';
import type { Issue, IssuePriority, IssueStatus, IssueType } from '../../../../shared/types';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import { Separator } from '../../../components/ui/separator';
import { formatDateTime } from '../../../lib/dateFormatting';
import { DependencyManager } from './DependencyManager';
import type { PriorityInfo, StatusConfigMap, TypeInfo } from './types';

export function IssueDetailModal({
  issue,
  statusConfig: statuses,
  getPriorityInfo,
  getTypeInfo,
  onClose,
  onStatusChange,
  allIssues,
  onDependenciesChange,
}: {
  issue: Issue | null;
  statusConfig: StatusConfigMap;
  getPriorityInfo: (p: IssuePriority) => PriorityInfo;
  getTypeInfo: (t: IssueType) => TypeInfo;
  onClose: () => void;
  onStatusChange: (id: string, status: IssueStatus) => void;
  allIssues: Issue[];
  onDependenciesChange: (id: string, depIds: string[]) => void;
}) {
  if (!issue) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-2xl" data-testid="issue-detail-modal">
          <DialogHeader>
            <DialogTitle>Issue Details</DialogTitle>
            <DialogDescription>Issue not found</DialogDescription>
          </DialogHeader>
          <p className="text-slate-400 text-center">Issue not found</p>
          <div className="flex justify-center">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const status = statuses[issue.status];
  const priorityInfo = getPriorityInfo(issue.priority);
  const typeInfo = getTypeInfo(issue.type);
  const PriorityIcon = priorityInfo.icon;
  const StatusIcon = status.icon;

  const allStatuses: IssueStatus[] = ['open', 'in_progress', 'closed', 'blocked'];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden" data-testid="issue-detail-modal">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-slate-700">
          <DialogTitle className="text-lg font-semibold text-slate-50">Issue Details</DialogTitle>
          <DialogDescription className="sr-only">View and manage issue details</DialogDescription>
        </DialogHeader>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Title */}
          <div>
            <h3 className="text-xl font-semibold text-slate-50" data-testid="issue-detail-title">
              {issue.title}
            </h3>
            <div className="flex items-center gap-2 mt-2 text-xs text-slate-400">
              <FiHash size={11} />
              <span className="font-mono">{issue.id}</span>
            </div>
          </div>

          {/* Metadata grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* Status */}
            <div className="rounded-lg border border-slate-700/50 bg-slate-900/50 p-4">
              <span className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                Status
              </span>
              <div className="flex items-center gap-2" data-testid="issue-detail-status">
                <Badge variant="outline" className={`gap-1.5 border-transparent ${status.color} ${status.bg}`}>
                  <StatusIcon size={14} />
                  {status.label}
                </Badge>
              </div>
              {/* Quick status change */}
              <div className="flex items-center gap-1.5 mt-3">
                {allStatuses
                  .filter((s) => s !== issue.status)
                  .map((s) => {
                    const sConf = statuses[s];
                    return (
                      <Button
                        key={s}
                        variant="outline"
                        size="sm"
                        onClick={() => onStatusChange(issue.id, s)}
                        className={`h-6 px-2 text-[10px] border-slate-700 hover:border-slate-500 ${sConf.color}`}
                        title={`Change to ${sConf.label}`}
                      >
                        {sConf.label}
                      </Button>
                    );
                  })}
              </div>
            </div>

            {/* Type */}
            <div className="rounded-lg border border-slate-700/50 bg-slate-900/50 p-4">
              <span className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                Type
              </span>
              <span
                className={`text-sm font-medium ${typeInfo.color}`}
                data-testid="issue-detail-type"
              >
                {typeInfo.label}
              </span>
            </div>

            {/* Priority */}
            <div className="rounded-lg border border-slate-700/50 bg-slate-900/50 p-4">
              <span className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                Priority
              </span>
              <div className="flex items-center gap-2" data-testid="issue-detail-priority">
                <PriorityIcon size={16} className={priorityInfo.color} />
                <span className={`text-sm font-medium ${priorityInfo.color}`}>
                  {priorityInfo.label}
                </span>
              </div>
            </div>

            {/* Assigned Agent */}
            <div className="rounded-lg border border-slate-700/50 bg-slate-900/50 p-4">
              <span className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                Assigned Agent
              </span>
              <div data-testid="issue-detail-assigned-agent">
                {issue.assigned_agent ? (
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-400">
                    <FiUser size={14} />
                    {issue.assigned_agent}
                  </span>
                ) : (
                  <span className="text-sm text-slate-400 italic">Unassigned</span>
                )}
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="rounded-lg border border-slate-700/50 bg-slate-900/50 p-4">
            <span className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
              Description
            </span>
            <div data-testid="issue-detail-description">
              {issue.description ? (
                <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
                  {issue.description}
                </p>
              ) : (
                <p className="text-sm text-slate-400 italic">No description provided</p>
              )}
            </div>
          </div>

          {/* Close Summary (shown when issue is closed) */}
          {issue.status === 'closed' && issue.close_summary && (
            <div
              className="rounded-lg border border-green-500/20 bg-green-500/5 p-4"
              data-testid="issue-detail-close-summary"
            >
              <span className="block text-xs font-medium text-green-400 uppercase tracking-wider mb-2">
                Close Summary
              </span>
              <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
                {issue.close_summary}
              </p>
            </div>
          )}

          {/* Dependencies */}
          <DependencyManager
            issue={issue}
            allIssues={allIssues}
            statusConfig={statuses}
            onDependenciesChange={onDependenciesChange}
          />

          {/* Timestamps & metadata footer */}
          <Separator className="bg-slate-700/50" />
          <div className="flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1">
                <FiClock size={11} />
                <span data-testid="issue-created-at" data-created-at={issue.created_at}>Created: {formatDateTime(issue.created_at)}</span>
              </span>
              {issue.updated_at && issue.updated_at !== issue.created_at && (
                <span className="inline-flex items-center gap-1">
                  <FiEdit3 size={11} />
                  Updated: {formatDateTime(issue.updated_at)}
                </span>
              )}
              {issue.closed_at && (
                <span className="inline-flex items-center gap-1 text-green-400">
                  <FiCheckCircle size={11} />
                  Closed: {formatDateTime(issue.closed_at)}
                </span>
              )}
            </div>
            {issue.group_id && (
              <Badge variant="outline" className="gap-1 border-transparent text-sky-400">
                <FiFolder size={11} />
                Grouped
              </Badge>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
