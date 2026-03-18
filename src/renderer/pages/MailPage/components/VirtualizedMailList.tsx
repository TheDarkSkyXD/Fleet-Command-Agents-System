import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';
import {
  FiAlertTriangle,
  FiCircle,
} from 'react-icons/fi';
import type { Message, MessagePriority, MessageType } from '../../../../shared/types';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { formatCompactDateTime } from '../../../lib/dateFormatting';

export function VirtualizedMailList({
  messages,
  selectedMessage,
  activeTab,
  handleSelectMessage,
  handleMessageContextMenu,
  formatDate,
  formatAbsoluteTime,
  typeColor,
  priorityColor,
}: {
  messages: Message[];
  selectedMessage: Message | null;
  activeTab: string;
  handleSelectMessage: (msg: Message) => void;
  handleMessageContextMenu: (e: React.MouseEvent, msg: Message) => void;
  formatDate: (d: string) => string;
  formatAbsoluteTime: (d: string) => string;
  typeColor: (type: MessageType) => string;
  priorityColor: (priority: MessagePriority) => string;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,
    overscan: 15,
  });

  return (
    <div ref={parentRef} className="flex-1 overflow-y-auto" data-testid="virtualized-mail-list" data-message-count={messages.length} data-rendered-items={virtualizer.getVirtualItems().length}>
      <div
        style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const msg = messages[virtualItem.index];
          return (
            <div
              key={msg.id}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <Button
                variant="ghost"
                type="button"
                onClick={() => handleSelectMessage(msg)}
                onContextMenu={(e) => handleMessageContextMenu(e, msg)}
                className={`flex h-auto w-full cursor-pointer items-start gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-slate-700/50 ${
                  selectedMessage?.id === msg.id ? 'bg-slate-700/70' : ''
                } ${msg.read === 0 ? 'bg-slate-800' : 'bg-slate-800/30'} ${
                  msg.priority === 'urgent'
                    ? 'border-l-2 border-l-red-500 border-b-slate-700/50 bg-red-950/20'
                    : msg.priority === 'high'
                      ? 'border-l-2 border-l-orange-500 border-b-slate-700/50'
                      : 'border-b-slate-700/50'
                }`}
              >
                <div className="mt-1.5 flex-shrink-0">
                  {msg.priority === 'urgent' ? (
                    <FiAlertTriangle
                      size={12}
                      className="text-red-400 animate-pulse"
                      aria-label="Urgent"
                    />
                  ) : msg.read === 0 ? (
                    <FiCircle
                      size={8}
                      className="fill-blue-500 text-blue-500"
                      aria-label="Unread"
                    />
                  ) : (
                    <div className="h-2 w-2" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    {activeTab === 'outbox' ? (
                      <span
                        className={`truncate text-sm ${msg.read === 0 ? 'font-semibold text-slate-100' : 'text-slate-300'}`}
                      >
                        <span className="text-slate-400">To:</span>{' '}
                        <span className="text-green-400">{msg.to_agent}</span>
                        <span className="text-slate-400 ml-1.5 text-xs">from {msg.from_agent}</span>
                      </span>
                    ) : (
                      <span
                        className={`truncate text-sm ${msg.read === 0 ? 'font-semibold text-slate-100' : 'text-slate-300'}`}
                      >
                        {msg.from_agent}{' '}
                        <span className="text-slate-400">
                          {'\u2192'} {msg.to_agent}
                        </span>
                      </span>
                    )}
                    <span
                      className="flex-shrink-0 text-xs text-slate-400"
                      title={formatAbsoluteTime(msg.created_at)}
                    >
                      {activeTab === 'outbox'
                        ? formatCompactDateTime(msg.created_at)
                        : formatDate(msg.created_at)}
                    </span>
                  </div>
                  <p
                    className={`mt-0.5 truncate text-sm ${msg.read === 0 ? 'font-medium text-slate-200' : 'text-slate-400'}`}
                    title={msg.subject || '(no subject)'}
                  >
                    {msg.subject || '(no subject)'}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${typeColor(msg.type)}`}
                    >
                      {msg.type}
                    </Badge>
                    {msg.priority !== 'normal' && (
                      <Badge
                        variant={msg.priority === 'urgent' ? 'destructive' : 'secondary'}
                        className={`text-[10px] font-medium ${msg.priority === 'urgent' ? 'rounded bg-red-900/60 px-1.5 py-0.5 text-red-300 border border-red-700 animate-pulse' : priorityColor(msg.priority)}`}
                      >
                        {msg.priority === 'urgent' ? '\u26A0 URGENT' : msg.priority.toUpperCase()}
                      </Badge>
                    )}
                  </div>
                </div>
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
