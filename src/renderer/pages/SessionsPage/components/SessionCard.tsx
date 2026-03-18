import { FiClock, FiCpu, FiGitBranch, FiUser } from 'react-icons/fi';
import type { Session } from '../../../../shared/types';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { STATE_COLORS, CAPABILITY_COLORS } from './constants';

interface SessionCardProps {
  session: Session;
  isSelected: boolean;
  onSelect: (session: Session) => void;
}

function formatDuration(start: string, end: string | null): string {
  const startTime = new Date(start).getTime();
  const endTime = end ? new Date(end).getTime() : Date.now();
  const diffMs = endTime - startTime;
  if (diffMs < 60000) return `${Math.round(diffMs / 1000)}s`;
  if (diffMs < 3600000) return `${Math.round(diffMs / 60000)}m`;
  const hours = Math.floor(diffMs / 3600000);
  const mins = Math.round((diffMs % 3600000) / 60000);
  return `${hours}h ${mins}m`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function SessionCard({ session, isSelected, onSelect }: SessionCardProps) {
  const stateColor = STATE_COLORS[session.state] || 'bg-slate-600/20 text-slate-300 border-slate-500/30';
  const capColor = CAPABILITY_COLORS[session.capability] || 'bg-slate-600/20 text-slate-300 border-slate-500/30';
  const isActive = session.state === 'working' || session.state === 'booting';

  return (
    <Button
      variant="ghost"
      type="button"
      onClick={() => onSelect(session)}
      className={`h-auto w-full text-left rounded-lg border p-4 transition-all ${
        isSelected
          ? 'border-blue-500/50 bg-blue-900/15'
          : 'border-slate-700/50 bg-slate-800/40 hover:bg-slate-800/70 hover:border-slate-600'
      }`}
    >
      {/* Row 1: Name + badges */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {isActive && (
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
          )}
          <span className="font-medium text-slate-100 truncate text-sm">
            {session.agent_name}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge variant="outline" className={`${capColor} text-[10px] px-1.5 py-0`}>
            {session.capability}
          </Badge>
          <Badge variant="outline" className={`${stateColor} text-[10px] px-1.5 py-0`}>
            {session.state}
          </Badge>
        </div>
      </div>

      {/* Row 2: Meta info */}
      <div className="flex items-center gap-4 text-[11px] text-slate-400">
        {session.model && (
          <span className="flex items-center gap-1">
            <FiCpu size={10} />
            {session.model}
          </span>
        )}
        {session.parent_agent && (
          <span className="flex items-center gap-1 truncate">
            <FiUser size={10} />
            {session.parent_agent}
          </span>
        )}
        {session.branch_name && (
          <span className="flex items-center gap-1 truncate">
            <FiGitBranch size={10} />
            {session.branch_name.replace(/^agent-/, '')}
          </span>
        )}
        <span className="flex items-center gap-1 ml-auto shrink-0">
          <FiClock size={10} />
          {formatDuration(session.created_at, session.completed_at)}
        </span>
      </div>

      {/* Row 3: Timeline */}
      <div className="flex items-center justify-between mt-2 text-[10px] text-slate-500">
        <span>Started {formatTime(session.created_at)}</span>
        {session.completed_at && <span>Ended {formatTime(session.completed_at)}</span>}
        {session.depth > 0 && <span>Depth {session.depth}</span>}
      </div>
    </Button>
  );
}
