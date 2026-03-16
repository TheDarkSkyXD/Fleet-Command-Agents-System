import { memo } from 'react';
import {
  FiAlertTriangle,
  FiCopy,
  FiCpu,
  FiSquare,
  FiUsers,
  FiXCircle,
  FiZap,
} from 'react-icons/fi';
import { toast } from 'sonner';
import type { AgentProcessInfo, Session } from '../../../../shared/types';
import {
  CAPABILITY_BORDER_ACCENT,
  CAPABILITY_COLORS,
  CAPABILITY_TOOLTIPS,
  MODEL_COLORS,
  STATE_COLORS,
  STATE_DOT_COLORS,
  STATE_ICONS,
  STATE_TOOLTIPS,
} from './constants';
import { estimateAgentProgress, formatUptime } from './utils';
import { AgentProgressBar } from './AgentProgressBar';
import { Badge } from '../../../components/ui/badge';
import { Tooltip } from '../../../components/Tooltip';
import { Button } from '../../../components/ui/button';
import { Checkbox } from '../../../components/ui/checkbox';

export const AgentCard = memo(function AgentCard({
  session,
  processInfo,
  childCount,
  isSelected,
  onToggleSelect,
  onStop,
  onNudge,
  onSelect,
  onContextMenu,
}: {
  session: Session;
  processInfo?: AgentProcessInfo;
  childCount?: number;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  onStop: () => void;
  onNudge: () => void;
  onSelect?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const agentModel = session.model || processInfo?.model || null;
  const borderAccent = CAPABILITY_BORDER_ACCENT[session.capability] || 'border-l-slate-500';
  const isRunning = session.state === 'working' || session.state === 'booting';

  return (
    <div
      className={`rounded-lg border border-l-[3px] ${borderAccent} bg-slate-800 p-4 cursor-pointer hover:bg-slate-750 hover:border-slate-600 transition-colors ${isSelected ? 'border-blue-500/50 bg-blue-500/5' : 'border-slate-700'} ${isRunning ? 'animate-card-activity-pulse' : ''}`}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSelect?.();
      }}
      tabIndex={0}
      role="button"
      data-testid={`agent-card-${session.id}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Selection checkbox */}
          {onToggleSelect && (
            <Checkbox
              checked={!!isSelected}
              onCheckedChange={() => { onToggleSelect(); }}
              onClick={(e) => e.stopPropagation()}
              className="border-slate-500 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500 cursor-pointer"
              data-testid={`select-agent-card-${session.id}`}
            />
          )}

          {/* State indicator with icon */}
          <div
            className={`flex items-center ${STATE_ICONS[session.state]?.className || 'text-slate-400'}`}
            data-testid={`agent-state-dot-${session.state}`}
            title={STATE_TOOLTIPS[session.state] || session.state}
          >
            {STATE_ICONS[session.state]?.icon || (
              <div
                className={`h-2.5 w-2.5 rounded-full ${STATE_DOT_COLORS[session.state] || 'bg-slate-400'}`}
              />
            )}
          </div>

          {/* Agent name */}
          <span
            className="font-medium text-slate-50 truncate max-w-[200px]"
            data-testid="agent-card-name"
            title={session.agent_name}
          >
            {session.agent_name}
          </span>

          {/* Capability badge */}
          <Badge
            variant="outline"
            className={`${CAPABILITY_COLORS[session.capability] || 'bg-slate-500/20 text-slate-400'}`}
            data-testid="agent-card-capability"
            title={CAPABILITY_TOOLTIPS[session.capability] || session.capability}
          >
            {session.capability}
          </Badge>

          {/* State badge */}
          <Badge
            variant="outline"
            className={`${STATE_COLORS[session.state] || ''} border-transparent`}
            data-testid="agent-card-state"
            title={STATE_TOOLTIPS[session.state] || session.state}
          >
            {session.state}
          </Badge>

          {/* Model badge */}
          {agentModel && (
            <Badge
              variant="outline"
              className={`${MODEL_COLORS[agentModel] || 'bg-slate-500/20 text-slate-400 border-slate-500/30'}`}
              data-testid="agent-card-model"
            >
              <FiCpu className="mr-1 h-3 w-3" />
              {agentModel}
            </Badge>
          )}

          {/* Stalled warning icon */}
          {session.state === 'stalled' && (
            <span
              className="inline-flex items-center gap-1 text-xs text-amber-400 font-medium"
              title={`Agent is stalled and unresponsive. Escalation level: ${session.escalation_level || 0}. Try nudging or stopping the agent.`}
              data-testid="agent-stalled-warning"
            >
              <FiAlertTriangle className="h-3.5 w-3.5" />
              {session.stalled_at &&
                `${Math.floor((Date.now() - new Date(session.stalled_at).getTime()) / 60000)}m`}
            </span>
          )}

          {/* Zombie alert */}
          {session.state === 'zombie' && (
            <span
              className="inline-flex items-center gap-1 text-xs text-red-400 font-semibold animate-pulse"
              title="Zombie: Agent process has died unexpectedly. The session remains but the process is no longer running. Stop and respawn to recover."
              data-testid="agent-card-zombie-error-icon"
            >
              <FiXCircle className="h-3 w-3" />
              ZOMBIE
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* PID */}
          {(session.pid || processInfo?.pid) && (
            <span className="text-xs text-slate-400 font-mono" data-testid="agent-card-pid">
              PID: {session.pid || processInfo?.pid}
            </span>
          )}

          {/* Uptime */}
          <span className="text-xs text-slate-400" data-testid="agent-card-uptime" data-created-at={session.created_at}>
            {formatUptime(session.created_at)}
          </span>

          {/* Nudge button (stalled agents only) */}
          {session.state === 'stalled' && (
            <Tooltip content="Nudge stalled agent">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onNudge();
                }}
                className="size-7 bg-amber-600/20 text-amber-400 hover:bg-amber-600/30"
              >
                <FiZap className="size-3.5" />
              </Button>
            </Tooltip>
          )}

          {/* Stop button */}
          <Tooltip content="Stop agent">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={(e) => {
                e.stopPropagation();
                onStop();
              }}
              className="size-7 bg-red-600/20 text-red-400 hover:bg-red-600/30"
            >
              <FiSquare className="size-3.5" />
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* Details row */}
      <div className="mt-2 flex items-center gap-4 text-xs text-slate-400">
        {/* Agent ID with copy button */}
        <span className="inline-flex items-center gap-1 group/card-id" data-testid="agent-card-id">
          <span className="font-mono" title={session.id}>
            ID: {session.id.length > 8 ? `${session.id.slice(0, 8)}\u2026` : session.id}
          </span>
          <Tooltip content="Copy agent ID">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(session.id);
                toast.success('Agent ID copied to clipboard');
              }}
              className="opacity-0 group-hover/card-id:opacity-100 size-5 text-slate-400 hover:text-slate-300 hover:bg-slate-700 transition-all"
              data-testid={`copy-agent-card-id-${session.id}`}
            >
              <FiCopy className="size-3" />
            </Button>
          </Tooltip>
        </span>
        {session.task_id && <span data-testid="agent-card-task">Task: {session.task_id}</span>}
        {session.worktree_path && <span>Worktree: {session.worktree_path}</span>}
        {session.branch_name && <span>Branch: {session.branch_name}</span>}
        {session.parent_agent && (
          <span className="text-amber-400/70">Parent: {session.parent_agent}</span>
        )}
        {(session.capability === 'lead' || session.capability === 'coordinator') &&
          childCount !== undefined && (
            <span className="inline-flex items-center gap-1 text-amber-400/70">
              <FiUsers className="h-3 w-3" />
              {childCount} child{childCount !== 1 ? 'ren' : ''}
            </span>
          )}
      </div>

      {/* Progress estimation bar */}
      {(() => {
        const progress = estimateAgentProgress(session, processInfo);
        return (
          <AgentProgressBar
            percent={progress.percent}
            phase={progress.phase}
            label={progress.label}
          />
        );
      })()}
    </div>
  );
});
