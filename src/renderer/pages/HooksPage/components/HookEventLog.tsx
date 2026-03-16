import { useCallback, useEffect, useState } from 'react';
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiChevronDown,
  FiClock,
  FiList,
  FiXCircle,
} from 'react-icons/fi';
import type { HookEvent } from '../../../../shared/types';
import { formatAbsoluteTime } from '../../../components/RelativeTime';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';

export function HookEventLog() {
  const [events, setEvents] = useState<HookEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const filters: { hook_type?: string; status?: string; limit?: number } = { limit: 200 };
      if (filterType !== 'all') {
        filters.hook_type = filterType;
      }
      if (filterStatus !== 'all') {
        filters.status = filterStatus;
      }
      const result = await window.electronAPI.hookEventList(filters);
      if (result.data) {
        setEvents(result.data);
      }
    } catch (err) {
      console.error('Failed to load hook events:', err);
    } finally {
      setLoading(false);
    }
  }, [filterType, filterStatus]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const statusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <FiCheckCircle size={14} className="text-green-400" />;
      case 'failure':
        return <FiXCircle size={14} className="text-red-400" />;
      case 'error':
        return <FiAlertTriangle size={14} className="text-amber-400" />;
      default:
        return <FiClock size={14} className="text-slate-400" />;
    }
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      success: 'bg-green-900/30 text-green-400',
      failure: 'bg-red-900/30 text-red-400',
      error: 'bg-amber-900/30 text-amber-400',
    };
    return colors[status] || 'bg-slate-700 text-slate-400';
  };

  const triggerLabel = (trigger: string) => {
    const labels: Record<string, string> = {
      deploy: 'Deploy',
      manual: 'Manual',
      session_start: 'Session Start',
      user_prompt: 'User Prompt',
      pre_tool: 'Pre Tool Use',
    };
    return labels[trigger] || trigger;
  };

  const formatTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return 'just now';
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr}h ago`;
      const diffDay = Math.floor(diffHr / 24);
      return `${diffDay}d ago`;
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6" data-testid="hook-event-log">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">Hook Event Log</h1>
          <p className="mt-1 text-sm text-slate-400">
            Chronological log of hook executions and their results
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={loadEvents}
          className="gap-2 h-auto px-3 py-2"
        >
          <FiList size={14} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">Type:</span>
          <Select value={filterType} onValueChange={(v) => setFilterType(v)}>
            <SelectTrigger className="h-8 w-auto min-w-[150px] border-slate-600 bg-slate-800 text-sm text-slate-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="SessionStart">Session Start</SelectItem>
              <SelectItem value="UserPromptSubmit">User Prompt Submit</SelectItem>
              <SelectItem value="PreToolUse">Pre Tool Use</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">Status:</span>
          <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v)}>
            <SelectTrigger className="h-8 w-auto min-w-[140px] border-slate-600 bg-slate-800 text-sm text-slate-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="failure">Failure</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <span className="text-sm text-slate-400">
          {events.length} event{events.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Events list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-700 py-16">
          <FiList size={40} className="mb-4 text-slate-500" />
          <p className="text-lg font-medium text-slate-400">No hook events recorded</p>
          <p className="mt-1 text-sm text-slate-400">
            Events will appear here when hooks are deployed or executed
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((event) => (
            <div
              key={event.id}
              data-testid="hook-event-row"
              className="rounded-lg border border-slate-700 bg-slate-800/50 hover:border-slate-600 transition-colors"
            >
              <Button
                type="button"
                variant="ghost"
                onClick={() => setExpandedId(expandedId === event.id ? null : event.id)}
                className="flex w-full items-center gap-4 p-4 text-left h-auto hover:bg-transparent"
              >
                {/* Status icon */}
                <div className="flex-shrink-0">{statusIcon(event.status)}</div>

                {/* Event info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-200">{event.hook_name}</span>
                    <Badge variant="secondary" className="bg-slate-700 text-slate-400">
                      {event.hook_type}
                    </Badge>
                    <Badge variant="secondary" className={statusBadge(event.status)}>
                      {event.status}
                    </Badge>
                    <Badge variant="secondary" className="bg-indigo-900/30 text-indigo-400">
                      {triggerLabel(event.trigger)}
                    </Badge>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-slate-400">
                    <span title={formatAbsoluteTime(event.created_at)}>
                      {formatTime(event.created_at)}
                    </span>
                    {event.agent_name && <span>Agent: {event.agent_name}</span>}
                    {event.worktree && (
                      <span className="truncate max-w-[200px]" title={event.worktree}>
                        {event.worktree}
                      </span>
                    )}
                    {event.duration_ms != null && <span>{event.duration_ms}ms</span>}
                  </div>
                </div>

                {/* Expand indicator */}
                <FiChevronDown
                  size={14}
                  className={`text-slate-400 transition-transform ${expandedId === event.id ? 'rotate-180' : ''}`}
                />
              </Button>

              {/* Expanded details */}
              {expandedId === event.id && (
                <div
                  className="border-t border-slate-700 px-4 py-3 space-y-2"
                  data-testid="hook-event-details"
                >
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-400">Event ID:</span>{' '}
                      <span className="text-slate-300 font-mono">{event.id}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Hook ID:</span>{' '}
                      <span className="text-slate-300 font-mono">{event.hook_id}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Timestamp:</span>{' '}
                      <span className="text-slate-300">
                        {new Date(event.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400">Trigger:</span>{' '}
                      <span className="text-slate-300">{triggerLabel(event.trigger)}</span>
                    </div>
                    {event.agent_name && (
                      <div>
                        <span className="text-slate-400">Agent:</span>{' '}
                        <span className="text-slate-300">{event.agent_name}</span>
                      </div>
                    )}
                    {event.duration_ms != null && (
                      <div>
                        <span className="text-slate-400">Duration:</span>{' '}
                        <span className="text-slate-300">{event.duration_ms}ms</span>
                      </div>
                    )}
                  </div>
                  {event.worktree && (
                    <div className="text-xs">
                      <span className="text-slate-400">Worktree:</span>{' '}
                      <span className="text-slate-300 font-mono break-all">{event.worktree}</span>
                    </div>
                  )}
                  {event.details && (
                    <div className="text-xs">
                      <span className="text-slate-400">Details:</span>{' '}
                      <span className="text-slate-300">{event.details}</span>
                    </div>
                  )}
                  {event.error_message && (
                    <div className="rounded bg-red-900/20 border border-red-800 p-2 text-xs">
                      <span className="text-red-400 font-medium">Error: </span>
                      <span className="text-red-300">{event.error_message}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
