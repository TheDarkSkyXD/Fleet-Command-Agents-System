import { useEffect, useState } from 'react';
import {
  FiActivity,
  FiCheckCircle,
  FiClock,
  FiEdit3,
  FiFolder,
  FiHash,
  FiLoader,
  FiTerminal,
  FiTrash2,
  FiUser,
  FiUserPlus,
  FiX,
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

interface ToolCallEvent {
  id: string;
  agent_name: string | null;
  tool_name: string | null;
  event_type: string;
  tool_duration_ms: number | null;
  created_at: string;
  data: string | null;
}

export function IssueDetailModal({
  issue,
  statusConfig: statuses,
  getPriorityInfo,
  getTypeInfo,
  onClose,
  onStatusChange,
  onDelete,
  onAssignAgent,
  allIssues,
  onDependenciesChange,
}: {
  issue: Issue | null;
  statusConfig: StatusConfigMap;
  getPriorityInfo: (p: IssuePriority) => PriorityInfo;
  getTypeInfo: (t: IssueType) => TypeInfo;
  onClose: () => void;
  onStatusChange: (id: string, status: IssueStatus) => void;
  onDelete?: (id: string) => void;
  onAssignAgent?: (issueId: string, agentName: string | null) => void;
  allIssues: Issue[];
  onDependenciesChange: (id: string, depIds: string[]) => void;
}) {
  const [toolCalls, setToolCalls] = useState<ToolCallEvent[]>([]);
  const [toolCallsLoading, setToolCallsLoading] = useState(false);
  const [showToolCalls, setShowToolCalls] = useState(false);
  const [availableAgents, setAvailableAgents] = useState<string[]>([]);
  const [showAgentPicker, setShowAgentPicker] = useState(false);

  // Load available agents when picker opens
  useEffect(() => {
    if (!showAgentPicker) return;
    window.electronAPI.agentRunningList()
      .then((result) => {
        if (result.data) {
          const names = [...new Set(result.data.map((a) => a.agentName))].sort();
          setAvailableAgents(names);
        }
      })
      .catch(() => {});
  }, [showAgentPicker]);

  // Load tool calls when expanded
  useEffect(() => {
    if (!showToolCalls || !issue?.assigned_agent) return;
    setToolCallsLoading(true);
    window.electronAPI
      .eventList({
        agentName: issue.assigned_agent,
        eventType: 'tool_end',
        limit: 50,
      })
      .then((result) => {
        if (result.data) {
          setToolCalls(result.data as ToolCallEvent[]);
        }
      })
      .catch(() => {})
      .finally(() => setToolCallsLoading(false));
  }, [showToolCalls, issue?.assigned_agent]);

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

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden" data-testid="issue-detail-modal">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-slate-700">
          <DialogTitle className="text-lg font-semibold text-slate-50">Issue Details</DialogTitle>
          <DialogDescription className="sr-only">View and manage issue details</DialogDescription>
        </DialogHeader>

        {/* Content */}
        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Title + ID */}
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
                {issue.status === 'closed' && (
                  <Badge variant="outline" className="gap-1 border-transparent bg-purple-500/10 text-purple-400 text-[10px]">
                    Human Review
                  </Badge>
                )}
              </div>
            </div>

            {/* Type */}
            <div className="rounded-lg border border-slate-700/50 bg-slate-900/50 p-4">
              <span className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                Type
              </span>
              <span className={`text-sm font-medium ${typeInfo.color}`} data-testid="issue-detail-type">
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
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-400">
                      <FiUser size={14} />
                      {issue.assigned_agent}
                    </span>
                    {onAssignAgent && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onAssignAgent(issue.id, null)}
                        className="h-6 w-6 p-0 text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                        title="Unassign agent"
                      >
                        <FiX size={12} />
                      </Button>
                    )}
                  </div>
                ) : onAssignAgent ? (
                  <div className="relative">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAgentPicker(!showAgentPicker)}
                      className="gap-1.5 h-7 text-xs text-slate-400 border-white/10 hover:text-white"
                    >
                      <FiUserPlus size={12} />
                      Assign Agent
                    </Button>
                    {showAgentPicker && (
                      <div className="absolute top-full left-0 mt-1 w-48 rounded-lg border border-white/10 bg-[#1a1a1a] shadow-xl z-50 overflow-hidden">
                        {availableAgents.length === 0 ? (
                          <div className="px-3 py-4 text-xs text-slate-400 text-center italic">
                            No running agents
                          </div>
                        ) : (
                          <div className="max-h-40 overflow-y-auto py-1">
                            {availableAgents.map((name) => (
                              <button
                                key={name}
                                type="button"
                                onClick={() => {
                                  onAssignAgent(issue.id, name);
                                  setShowAgentPicker(false);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
                              >
                                <FiUser size={12} className="text-amber-400 shrink-0" />
                                <span className="truncate">{name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
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
                <div className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed space-y-1.5">
                  {issue.description.split('\n').map((line, i) => {
                    if (!line.trim()) return <br key={i} />;
                    const kvMatch = line.match(/^([A-Za-z][A-Za-z\s]+):\s*(.+)$/);
                    if (kvMatch) {
                      return (
                        <div key={i} className="flex gap-1.5">
                          <span className="text-slate-400 font-medium shrink-0">{kvMatch[1]}:</span>
                          <span className="text-slate-200">{kvMatch[2]}</span>
                        </div>
                      );
                    }
                    return <p key={i}>{line}</p>;
                  })}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-slate-400 italic">No detailed description provided by the agent.</p>
                  <p className="text-xs text-slate-400">
                    This task was created programmatically. The title above is the primary context.
                    Check the tool calls section below for more details on what work was done.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Context info for sparse descriptions */}
          {(!issue.description || issue.description.length < 50) && (
            <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
              <span className="block text-xs font-medium text-blue-400 uppercase tracking-wider mb-2">
                Task Context
              </span>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-400">Task ID:</span>{' '}
                  <span className="font-mono text-slate-300">{issue.id}</span>
                </div>
                <div>
                  <span className="text-slate-400">Type:</span>{' '}
                  <span className={typeInfo.color}>{typeInfo.label}</span>
                </div>
                <div>
                  <span className="text-slate-400">Created:</span>{' '}
                  <span className="text-slate-300">{formatDateTime(issue.created_at)}</span>
                </div>
                <div>
                  <span className="text-slate-400">Agent:</span>{' '}
                  <span className="text-amber-400">{issue.assigned_agent || 'Unassigned'}</span>
                </div>
                {issue.group_id && (
                  <div className="col-span-2">
                    <span className="text-slate-400">Group:</span>{' '}
                    <span className="text-sky-400 font-mono">{issue.group_id}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Close Summary (shown when done) */}
          {issue.status === 'closed' && issue.close_summary && (
            <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4" data-testid="issue-detail-close-summary">
              <span className="block text-xs font-medium text-green-400 uppercase tracking-wider mb-2">
                Completion Summary
              </span>
              <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
                {issue.close_summary}
              </p>
            </div>
          )}

          {/* Tool Calls Section */}
          <div className="rounded-lg border border-slate-700/50 bg-slate-900/50 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowToolCalls(!showToolCalls)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
            >
              <span className="flex items-center gap-2 text-xs font-medium text-slate-400 uppercase tracking-wider">
                <FiTerminal size={13} />
                Agent Tool Calls
                {toolCalls.length > 0 && (
                  <Badge variant="outline" className="border-transparent bg-blue-500/15 text-blue-400 text-[10px] px-1.5 py-0">
                    {toolCalls.length}
                  </Badge>
                )}
              </span>
              <span className={`text-slate-400 text-xs transition-transform ${showToolCalls ? 'rotate-180' : ''}`}>
                ▾
              </span>
            </button>

            {showToolCalls && (
              <div className="border-t border-slate-700/50">
                {!issue.assigned_agent ? (
                  <div className="px-4 py-6 text-center text-sm text-slate-400 italic">
                    No agent assigned — tool calls will appear once an agent is working on this task
                  </div>
                ) : toolCallsLoading ? (
                  <div className="flex items-center justify-center gap-2 py-6 text-xs text-slate-400">
                    <FiLoader size={14} className="animate-spin" />
                    Loading tool calls...
                  </div>
                ) : toolCalls.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-slate-400 italic">
                    No tool calls recorded yet
                  </div>
                ) : (
                  <div className="max-h-60 overflow-y-auto divide-y divide-slate-700/30">
                    {toolCalls.map((tc) => (
                      <div key={tc.id} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                        <FiActivity size={12} className="shrink-0 text-blue-400" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-medium text-slate-200">
                              {tc.tool_name || 'unknown'}
                            </span>
                            {tc.agent_name && (
                              <span className="text-slate-400">
                                by <span className="text-amber-400">{tc.agent_name}</span>
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 text-slate-400">
                          {tc.tool_duration_ms != null && (
                            <span className="tabular-nums">
                              {tc.tool_duration_ms > 1000
                                ? `${(tc.tool_duration_ms / 1000).toFixed(1)}s`
                                : `${tc.tool_duration_ms}ms`}
                            </span>
                          )}
                          <span className="tabular-nums">{formatDateTime(tc.created_at)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Dependencies */}
          <DependencyManager
            issue={issue}
            allIssues={allIssues}
            statusConfig={statuses}
            onDependenciesChange={onDependenciesChange}
          />

          {/* Timestamps & metadata */}
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
                  Done: {formatDateTime(issue.closed_at)}
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

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-700 flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onDelete?.(issue.id);
              onClose();
            }}
            className="bg-red-600/15 text-red-400 border border-red-500/25 hover:bg-red-600/25 hover:text-red-300"
          >
            <FiTrash2 className="h-3.5 w-3.5" />
            Delete Task
          </Button>

          {issue.status === 'closed' && (
            <Badge
              variant="outline"
              className="gap-1.5 bg-purple-500/15 text-purple-400 border-purple-500/25 px-3 py-1"
            >
              <FiUser size={12} />
              Human Review Needed
            </Badge>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
