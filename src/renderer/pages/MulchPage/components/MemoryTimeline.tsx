import { FiClock, FiUser } from 'react-icons/fi';
import type { ExpertiseRecord } from '../../../../shared/types';
import { Badge } from '../../../components/ui/badge';
import { Card, CardContent } from '../../../components/ui/card';
import { CLASSIFICATION_STYLES, TYPE_ICONS } from './constants';

interface MemoryTimelineProps {
  records: ExpertiseRecord[];
}

function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = now - then;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.round(diff / 86400000)}d ago`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function MemoryTimeline({ records }: MemoryTimelineProps) {
  // Sort by created_at descending (most recent first)
  const sorted = [...records].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-400">
        <FiClock size={32} className="mb-3 opacity-40" />
        <p className="text-sm">No memories recorded yet</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-4 top-0 bottom-0 w-px bg-slate-700" />

      <div className="space-y-3">
        {sorted.map((record) => {
          const classStyle = CLASSIFICATION_STYLES[record.classification];
          const typeIcon = TYPE_ICONS[record.type] || '\u{1F4CB}';

          return (
            <div key={record.id} className="relative pl-10">
              {/* Timeline dot */}
              <div className="absolute left-[11px] top-3 h-2.5 w-2.5 rounded-full border-2 border-slate-700 bg-slate-800" />

              <Card className="border-slate-700/50 bg-slate-800/40">
                <CardContent className="p-3">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm">{typeIcon}</span>
                      <span className="font-medium text-slate-100 text-sm truncate">{record.title}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant="outline" className={`${classStyle.color} text-[9px] px-1.5 py-0`}>
                        {classStyle.label}
                      </Badge>
                      <Badge variant="outline" className="bg-slate-700/30 text-slate-400 border-slate-600 text-[9px] px-1.5 py-0">
                        {record.type}
                      </Badge>
                    </div>
                  </div>

                  {/* Content preview */}
                  <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed mb-2">
                    {record.content}
                  </p>

                  {/* Footer */}
                  <div className="flex items-center gap-3 text-[10px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <FiClock size={9} />
                      {formatRelativeTime(record.created_at)}
                    </span>
                    {record.agent_name && (
                      <span className="flex items-center gap-1">
                        <FiUser size={9} />
                        {record.agent_name}
                      </span>
                    )}
                    {record.domain && (
                      <Badge variant="outline" className="bg-slate-700/30 text-slate-400 border-slate-600 text-[9px] px-1.5 py-0">
                        {record.domain}
                      </Badge>
                    )}
                    {record.tags && (
                      <span className="text-slate-500 truncate">
                        {record.tags}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}
