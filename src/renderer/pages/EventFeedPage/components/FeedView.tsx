import { FiActivity, FiChevronDown, FiRefreshCw } from 'react-icons/fi';
import type { Event } from '../../../../shared/types';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { EVENT_TYPE_CONFIG, formatEventTime, formatFullTime } from './types';

export function FeedView({
  events,
  loading,
  eventLimit,
  setEventLimit,
  feedRef,
}: {
  events: Event[];
  loading: boolean;
  eventLimit: number;
  setEventLimit: React.Dispatch<React.SetStateAction<number>>;
  feedRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={feedRef} className="flex-1 space-y-1 overflow-y-auto pr-1">
      {loading && events.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <FiRefreshCw size={24} className="animate-spin text-slate-400" />
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <FiActivity size={40} className="mb-3 opacity-30" />
          <p className="text-sm">No events recorded yet</p>
          <p className="mt-1 text-xs text-slate-400">
            Events will appear here as agents perform actions
          </p>
        </div>
      ) : (
        events.map((event) => {
          const config = EVENT_TYPE_CONFIG[event.event_type] || EVENT_TYPE_CONFIG.custom;
          const Icon = config.icon;
          return (
            <div
              key={event.id}
              className={`flex items-start gap-3 rounded-lg border px-3 py-2 transition-colors hover:bg-slate-800/50 ${config.bgColor}`}
            >
              {/* Icon */}
              <div className={`mt-0.5 flex-shrink-0 ${config.color}`}>
                <Icon size={16} />
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {/* Event type badge */}
                  <Badge
                    variant="outline"
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider border-0 ${config.color}`}
                  >
                    {config.label}
                  </Badge>

                  {/* Agent name */}
                  {event.agent_name && (
                    <span
                      className="truncate text-xs font-medium text-slate-300"
                      title={event.agent_name}
                    >
                      {event.agent_name}
                    </span>
                  )}

                  {/* Tool name */}
                  {event.tool_name && (
                    <Badge
                      variant="secondary"
                      className="truncate rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400"
                      title={event.tool_name}
                    >
                      {event.tool_name}
                    </Badge>
                  )}

                  {/* Duration */}
                  {event.tool_duration_ms != null && event.tool_duration_ms > 0 && (
                    <span className="text-[10px] text-slate-400">{event.tool_duration_ms}ms</span>
                  )}

                  {/* Spacer */}
                  <div className="flex-1" />

                  {/* Timestamp */}
                  <span
                    className="flex-shrink-0 text-[10px] text-slate-400"
                    title={formatFullTime(event.created_at)}
                  >
                    {formatEventTime(event.created_at)}
                  </span>
                </div>

                {/* Data payload */}
                {event.data && (
                  <p className="mt-0.5 truncate text-xs text-slate-400" title={event.data}>
                    {event.data}
                  </p>
                )}
              </div>
            </div>
          );
        })
      )}

      {/* Load more indicator */}
      {events.length >= eventLimit && (
        <Button
          variant="outline"
          onClick={() => setEventLimit((v) => v + 100)}
          className="flex w-full items-center justify-center gap-1 rounded-lg border-slate-800 py-2 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-300"
        >
          <FiChevronDown size={14} />
          Load more events
        </Button>
      )}
    </div>
  );
}
