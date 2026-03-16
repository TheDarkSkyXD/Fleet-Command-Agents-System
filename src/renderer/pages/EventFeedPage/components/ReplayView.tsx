import { FiChevronDown, FiClock, FiRefreshCw } from 'react-icons/fi';
import type { Event } from '../../../../shared/types';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Separator } from '../../../components/ui/separator';
import {
  AGENT_COLORS,
  EVENT_TYPE_CONFIG,
  formatDuration,
  formatFullTime,
  formatReplayTime,
  type AgentColor,
} from './types';

export function ReplayView({
  events,
  agentColorMap,
  loading,
  eventLimit,
  setEventLimit,
}: {
  events: Event[];
  agentColorMap: Map<string, AgentColor>;
  loading: boolean;
  eventLimit: number;
  setEventLimit: React.Dispatch<React.SetStateAction<number>>;
}) {
  const agentNames = Array.from(agentColorMap.keys()).filter((n) => n !== '__unknown__');

  return (
    <div className="flex-1 space-y-0 overflow-y-auto pr-1" data-testid="replay-view">
      {/* Replay header with agent legend */}
      {agentNames.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 p-2.5">
          <span className="mr-1 text-xs font-medium text-slate-400">Agents:</span>
          {agentNames.map((name) => {
            const color = agentColorMap.get(name)!;
            return (
              <Badge
                key={name}
                variant="secondary"
                className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${color.text} ${color.bg}`}
                data-testid={`replay-agent-${name}`}
              >
                <span className={`h-2 w-2 rounded-full bg-current`} />
                {name}
              </Badge>
            );
          })}
          <span className="ml-auto text-[10px] text-slate-500">
            {events.length} events, {agentNames.length} agent{agentNames.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {loading && events.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <FiRefreshCw size={24} className="animate-spin text-slate-400" />
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <FiClock size={40} className="mb-3 opacity-30" />
          <p className="text-sm">No events to replay</p>
          <p className="mt-1 text-xs text-slate-500">
            Events from multiple agents will be interleaved chronologically
          </p>
        </div>
      ) : (
        <div className="space-y-0.5">
          {events.map((event, index) => {
            const config = EVENT_TYPE_CONFIG[event.event_type] || EVENT_TYPE_CONFIG.custom;
            const Icon = config.icon;
            const agentKey = event.agent_name || '__unknown__';
            const agentColor = agentColorMap.get(agentKey) || AGENT_COLORS[0];

            // Show time separator when time gap > 5 seconds
            let showTimeSep = false;
            if (index > 0) {
              const prevTime = new Date(events[index - 1].created_at).getTime();
              const curTime = new Date(event.created_at).getTime();
              if (curTime - prevTime > 5000) {
                showTimeSep = true;
              }
            }

            return (
              <div key={event.id}>
                {showTimeSep && (
                  <div className="my-1.5 flex items-center gap-2 px-2">
                    <Separator className="flex-1 bg-slate-700" />
                    <span className="text-[10px] text-slate-500">
                      {formatReplayTime(event.created_at)}
                    </span>
                    <Separator className="flex-1 bg-slate-700" />
                  </div>
                )}
                <div
                  data-testid="replay-event"
                  data-agent={event.agent_name || 'unknown'}
                  data-event-type={event.event_type}
                  className={`flex items-start gap-2 rounded border border-slate-800 border-l-2 px-3 py-1.5 transition-colors hover:bg-slate-800/30 ${agentColor.border}`}
                >
                  {/* Timestamp column */}
                  <span
                    className="mt-0.5 w-16 flex-shrink-0 text-right font-mono text-[10px] text-slate-500"
                    title={formatFullTime(event.created_at)}
                  >
                    {formatReplayTime(event.created_at)}
                  </span>

                  {/* Agent indicator */}
                  <span
                    className={`mt-0.5 w-24 flex-shrink-0 truncate text-xs font-medium ${agentColor.text}`}
                    title={event.agent_name || 'unknown'}
                    data-testid="replay-event-agent"
                  >
                    {event.agent_name || 'unknown'}
                  </span>

                  {/* Event icon */}
                  <div className={`mt-0.5 flex-shrink-0 ${config.color}`}>
                    <Icon size={14} />
                  </div>

                  {/* Event content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider border-0 ${config.color}`}
                      >
                        {config.label}
                      </Badge>
                      {event.tool_name && (
                        <Badge
                          variant="secondary"
                          className="truncate rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400"
                        >
                          {event.tool_name}
                        </Badge>
                      )}
                      {event.tool_duration_ms != null && event.tool_duration_ms > 0 && (
                        <span className="text-[10px] text-slate-500">
                          {formatDuration(event.tool_duration_ms)}
                        </span>
                      )}
                    </div>
                    {event.data && (
                      <p className="mt-0.5 truncate text-[11px] text-slate-500" title={event.data}>
                        {event.data}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Load more */}
      {events.length >= eventLimit && (
        <Button
          variant="outline"
          onClick={() => setEventLimit((v) => v + 100)}
          className="mt-1 flex w-full items-center justify-center gap-1 rounded-lg border-slate-800 py-2 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-300"
        >
          <FiChevronDown size={14} />
          Load more events
        </Button>
      )}
    </div>
  );
}
