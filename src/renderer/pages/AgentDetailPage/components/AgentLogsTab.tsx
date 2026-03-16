import { useEffect, useState } from 'react';
import { FiFile } from 'react-icons/fi';
import type { Event } from '../../../../shared/types';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { formatTimeOnly } from '../../../lib/dateFormatting';
import { EVENT_TYPE_STYLES, LOG_LEVEL_COLORS } from './constants';

export function AgentLogsTab({ agentName }: { agentName: string }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const result = await window.electronAPI.eventList({
          agentName,
          limit: 200,
        });
        if (result.data) setEvents(result.data);
      } catch {
        // Events may not exist
      }
      setLoading(false);
    }
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [agentName]);

  const filteredEvents = filter === 'all' ? events : events.filter((e) => e.event_type === filter);

  if (loading && events.length === 0) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-4 h-full overflow-y-auto space-y-3">
      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {['all', 'tool_start', 'tool_end', 'spawn', 'error', 'session_start', 'session_end'].map(
          (f) => (
            <Button
              key={f}
              variant="outline"
              size="sm"
              onClick={() => setFilter(f)}
              data-testid={`log-filter-${f}`}
              className={`rounded-full px-2.5 py-1 text-xs h-auto ${
                filter === f
                  ? 'bg-blue-500/20 text-blue-400 border-blue-500/40'
                  : 'bg-slate-700/50 text-slate-400 border-slate-600/30 hover:bg-slate-700'
              }`}
            >
              {f === 'all' ? 'All' : f.replace('_', ' ')}
            </Button>
          ),
        )}
      </div>

      {/* Events list */}
      {filteredEvents.length === 0 ? (
        <div className="text-center py-8 text-slate-400">
          <FiFile className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No log entries found for this agent</p>
        </div>
      ) : (
        <div className="space-y-1">
          {filteredEvents.map((event) => {
            const style = EVENT_TYPE_STYLES[event.event_type] || EVENT_TYPE_STYLES.custom;
            const levelColor = LOG_LEVEL_COLORS[event.level] || 'text-slate-300';
            return (
              <div
                key={event.id}
                className="flex items-start gap-3 rounded-md bg-slate-800/60 border border-slate-700/50 px-3 py-2 text-sm"
              >
                <div className={`mt-0.5 ${style.bg} rounded p-1`}>{style.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-medium ${levelColor}`}>
                      {event.event_type.replace('_', ' ')}
                    </span>
                    {event.tool_name && (
                      <Badge variant="secondary" className="bg-slate-700/50 text-slate-400 border-transparent font-mono text-xs px-1.5 py-0.5">
                        {event.tool_name}
                      </Badge>
                    )}
                    {event.tool_duration_ms != null && (
                      <span className="text-xs text-slate-400">{event.tool_duration_ms}ms</span>
                    )}
                  </div>
                  {event.data && (
                    <p className="text-xs text-slate-400 mt-0.5 truncate max-w-lg">{event.data}</p>
                  )}
                </div>
                <span className="text-xs text-slate-500 whitespace-nowrap flex-shrink-0">
                  {formatTimeOnly(event.created_at)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
