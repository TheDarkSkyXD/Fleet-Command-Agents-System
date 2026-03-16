import { useEffect, useState } from 'react';
import { FiInbox, FiMail, FiSend } from 'react-icons/fi';
import type { Message } from '../../../../shared/types';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Separator } from '../../../components/ui/separator';
import { formatDateTime } from '../../../lib/dateFormatting';
import { MAIL_TYPE_COLORS, PRIORITY_COLORS } from './constants';

export function AgentMailTab({ agentName }: { agentName: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const result = await window.electronAPI.mailList({ agent: agentName });
        if (result.data) setMessages(result.data);
      } catch {
        // Mail may not exist
      }
      setLoading(false);
    }
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [agentName]);

  if (loading && messages.length === 0) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-4 h-full overflow-y-auto">
      {messages.length === 0 ? (
        <div className="text-center py-8 text-slate-400">
          <FiMail className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No mail messages for this agent</p>
        </div>
      ) : (
        <div className="space-y-2">
          {messages.map((msg) => {
            const isExpanded = expandedId === msg.id;
            const isSender = msg.from_agent === agentName;
            return (
              <div
                key={msg.id}
                className="rounded-lg border border-slate-700/50 bg-slate-800/60 overflow-hidden"
              >
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setExpandedId(isExpanded ? null : msg.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left h-auto hover:bg-slate-800 transition-colors rounded-none"
                >
                  {isSender ? (
                    <FiSend className="h-4 w-4 text-cyan-400 flex-shrink-0" />
                  ) : (
                    <FiInbox className="h-4 w-4 text-amber-400 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-200 truncate">
                        {msg.subject || '(no subject)'}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-2 py-0.5 ${MAIL_TYPE_COLORS[msg.type] || 'bg-slate-500/15 text-slate-400 border-slate-500/30'}`}
                      >
                        {msg.type}
                      </Badge>
                      {msg.priority !== 'normal' && (
                        <span className={`text-xs ${PRIORITY_COLORS[msg.priority]}`}>
                          {msg.priority}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {isSender ? `To: ${msg.to_agent}` : `From: ${msg.from_agent}`}
                      {' · '}
                      {formatDateTime(msg.created_at)}
                    </div>
                  </div>
                  {!msg.read && !isSender && (
                    <div className="h-2 w-2 rounded-full bg-blue-400 flex-shrink-0" />
                  )}
                </Button>
                {isExpanded && msg.body && (
                  <div className="px-4 pb-3">
                    <Separator className="mb-3 bg-slate-700/50" />
                    <pre className="text-sm text-slate-300 whitespace-pre-wrap font-mono bg-slate-900/50 rounded-md p-3">
                      {msg.body}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
