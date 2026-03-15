import { useCallback, useEffect, useState } from 'react';
import {
  FiChevronLeft,
  FiCircle,
  FiInbox,
  FiMail,
  FiRefreshCw,
  FiSend,
  FiTrash2,
  FiX,
} from 'react-icons/fi';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import type { Message, MessagePriority, MessageType } from '../../shared/types';

type MailTab = 'inbox' | 'sent' | 'all';

interface ComposeForm {
  from_agent: string;
  to_agent: string;
  subject: string;
  body: string;
  type: MessageType;
  priority: MessagePriority;
}

const defaultCompose: ComposeForm = {
  from_agent: '',
  to_agent: '',
  subject: '',
  body: '',
  type: 'status',
  priority: 'normal',
};

const MESSAGE_TYPES: MessageType[] = [
  'status',
  'question',
  'result',
  'error',
  'worker_done',
  'merge_ready',
  'merged',
  'merge_failed',
  'escalation',
  'health_check',
  'dispatch',
  'assign',
];

const PRIORITY_OPTIONS: MessagePriority[] = ['low', 'normal', 'high', 'urgent'];

function priorityColor(priority: MessagePriority): string {
  switch (priority) {
    case 'urgent':
      return 'text-red-400';
    case 'high':
      return 'text-orange-400';
    case 'normal':
      return 'text-slate-400';
    case 'low':
      return 'text-slate-500';
  }
}

function typeColor(type: MessageType): string {
  switch (type) {
    case 'error':
    case 'merge_failed':
      return 'bg-red-900/40 text-red-300 border-red-700';
    case 'escalation':
      return 'bg-orange-900/40 text-orange-300 border-orange-700';
    case 'worker_done':
    case 'merged':
      return 'bg-green-900/40 text-green-300 border-green-700';
    case 'dispatch':
    case 'assign':
      return 'bg-blue-900/40 text-blue-300 border-blue-700';
    case 'question':
      return 'bg-purple-900/40 text-purple-300 border-purple-700';
    case 'merge_ready':
      return 'bg-cyan-900/40 text-cyan-300 border-cyan-700';
    case 'health_check':
      return 'bg-yellow-900/40 text-yellow-300 border-yellow-700';
    default:
      return 'bg-slate-700/40 text-slate-300 border-slate-600';
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function MailPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<MailTab>('inbox');
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [composeForm, setComposeForm] = useState<ComposeForm>(defaultCompose);
  const [sending, setSending] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  );

  const loadMessages = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.electronAPI.mailList();
      if (result.data) {
        setMessages(result.data);
      }
      const countResult = await window.electronAPI.mailUnreadCount();
      if (countResult.data !== undefined && countResult.data !== null) {
        setUnreadCount(countResult.data);
      }
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMessages();
    // Listen for real-time mail events
    const handler = () => {
      loadMessages();
    };
    window.electronAPI.onMailReceived(handler);
    // Poll every 10s for updates
    const interval = setInterval(loadMessages, 10000);
    return () => {
      clearInterval(interval);
      window.electronAPI.removeAllListeners('mail:received');
    };
  }, [loadMessages]);

  const handleMarkRead = async (msg: Message) => {
    if (msg.read === 0) {
      await window.electronAPI.mailMarkRead(msg.id);
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, read: 1 } : m)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
      if (selectedMessage?.id === msg.id) {
        setSelectedMessage({ ...msg, read: 1 });
      }
    }
  };

  const handleSelectMessage = (msg: Message) => {
    setSelectedMessage(msg);
    handleMarkRead(msg);
  };

  const handleSend = async () => {
    if (!composeForm.from_agent.trim() || !composeForm.to_agent.trim()) {
      setStatusMsg({ type: 'error', text: 'From and To agent names are required' });
      return;
    }
    setSending(true);
    try {
      const id = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const result = await window.electronAPI.mailSend({
        id,
        from_agent: composeForm.from_agent.trim(),
        to_agent: composeForm.to_agent.trim(),
        subject: composeForm.subject.trim() || null,
        body: composeForm.body.trim() || null,
        type: composeForm.type,
        priority: composeForm.priority,
      });
      if (result.error) {
        setStatusMsg({ type: 'error', text: `Failed to send: ${result.error}` });
      } else {
        setStatusMsg({ type: 'success', text: 'Message sent successfully' });
        setComposeForm(defaultCompose);
        setShowCompose(false);
        loadMessages();
      }
    } catch (err) {
      setStatusMsg({ type: 'error', text: `Failed to send: ${String(err)}` });
    } finally {
      setSending(false);
    }
  };

  const handlePurge = async () => {
    if (!confirm('Delete all messages? This cannot be undone.')) return;
    await window.electronAPI.mailPurge();
    setMessages([]);
    setUnreadCount(0);
    setSelectedMessage(null);
  };

  // Filter messages by tab
  const filteredMessages = messages.filter(() => {
    // All tabs show all messages for now since we don't have a "current agent" concept
    // In a real scenario, inbox would filter by to_agent === currentAgent
    return true;
  });

  // Sort chronologically (newest first)
  const sortedMessages = [...filteredMessages].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  // Auto-dismiss status messages
  useEffect(() => {
    if (statusMsg) {
      const t = setTimeout(() => setStatusMsg(null), 4000);
      return () => clearTimeout(t);
    }
  }, [statusMsg]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-50">Mail</h1>
          {unreadCount > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-blue-600 px-2.5 py-0.5 text-xs font-medium text-white">
              {unreadCount} unread
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setShowCompose(true);
              setSelectedMessage(null);
            }}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
          >
            <FiSend size={14} />
            Compose
          </button>
          <button
            type="button"
            onClick={loadMessages}
            className="flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
            title="Refresh"
          >
            <FiRefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            onClick={handlePurge}
            className="flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-red-900/30 hover:text-red-400"
            title="Purge all messages"
          >
            <FiTrash2 size={14} />
          </button>
        </div>
      </div>

      {/* Status message */}
      {statusMsg && (
        <div
          className={`mb-3 rounded-lg px-4 py-2 text-sm ${
            statusMsg.type === 'success'
              ? 'bg-green-900/30 text-green-400 border border-green-700'
              : 'bg-red-900/30 text-red-400 border border-red-700'
          }`}
        >
          {statusMsg.text}
        </div>
      )}

      {/* Tabs */}
      <div className="mb-4 flex gap-1 rounded-lg border border-slate-700 bg-slate-800/50 p-1">
        {(['inbox', 'sent', 'all'] as MailTab[]).map((tab) => (
          <button
            type="button"
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              setSelectedMessage(null);
            }}
            className={`flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
              activeTab === tab
                ? 'bg-slate-700 text-slate-50'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab === 'inbox' && <FiInbox size={14} />}
            {tab === 'sent' && <FiSend size={14} />}
            {tab === 'all' && <FiMail size={14} />}
            {tab}
            {tab === 'inbox' && unreadCount > 0 && (
              <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content - Resizable Panels */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal" autoSaveId="mail-panels">
          {/* Message list panel */}
          <Panel defaultSize={selectedMessage || showCompose ? 40 : 100} minSize={25}>
            <div className="flex h-full flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-800">
              {loading && messages.length === 0 ? (
                <div className="flex flex-1 items-center justify-center text-slate-500">
                  <FiRefreshCw className="mr-2 animate-spin" /> Loading messages...
                </div>
              ) : sortedMessages.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-slate-500">
                  <FiInbox size={48} className="text-slate-600" />
                  <p className="text-lg font-medium">No messages</p>
                  <p className="text-sm text-slate-600">
                    Agent messages will appear here when agents communicate.
                  </p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  {sortedMessages.map((msg) => (
                    <button
                      type="button"
                      key={msg.id}
                      onClick={() => handleSelectMessage(msg)}
                      className={`flex w-full cursor-pointer items-start gap-3 border-b border-slate-700/50 px-4 py-3 text-left transition-colors hover:bg-slate-700/50 ${
                        selectedMessage?.id === msg.id ? 'bg-slate-700/70' : ''
                      } ${msg.read === 0 ? 'bg-slate-800' : 'bg-slate-800/30'}`}
                    >
                      {/* Unread indicator */}
                      <div className="mt-1.5 flex-shrink-0">
                        {msg.read === 0 ? (
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
                        {/* From/To + time */}
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`truncate text-sm ${
                              msg.read === 0 ? 'font-semibold text-slate-100' : 'text-slate-300'
                            }`}
                          >
                            {msg.from_agent}{' '}
                            <span className="text-slate-500">
                              {'\u2192'} {msg.to_agent}
                            </span>
                          </span>
                          <span className="flex-shrink-0 text-xs text-slate-500">
                            {formatDate(msg.created_at)}
                          </span>
                        </div>

                        {/* Subject */}
                        <p
                          className={`mt-0.5 truncate text-sm ${
                            msg.read === 0 ? 'font-medium text-slate-200' : 'text-slate-400'
                          }`}
                        >
                          {msg.subject || '(no subject)'}
                        </p>

                        {/* Type + Priority badges */}
                        <div className="mt-1 flex items-center gap-2">
                          <span
                            className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${typeColor(msg.type)}`}
                          >
                            {msg.type}
                          </span>
                          {msg.priority !== 'normal' && (
                            <span
                              className={`text-[10px] font-medium ${priorityColor(msg.priority)}`}
                            >
                              {msg.priority.toUpperCase()}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Panel>

          {/* Resize handle - only show when detail/compose is visible */}
          {(selectedMessage || showCompose) && (
            <PanelResizeHandle className="group mx-1 flex w-2 items-center justify-center">
              <div className="h-8 w-1 rounded-full bg-slate-600 transition-colors group-hover:bg-blue-500 group-active:bg-blue-400" />
            </PanelResizeHandle>
          )}

          {/* Detail / Compose panel */}
          {selectedMessage && !showCompose && (
            <Panel defaultSize={60} minSize={30}>
              <div className="flex h-full flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-800">
                {/* Detail header */}
                <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setSelectedMessage(null)}
                    className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200"
                  >
                    <FiChevronLeft size={16} /> Back
                  </button>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded border px-2 py-0.5 text-xs ${typeColor(selectedMessage.type)}`}
                    >
                      {selectedMessage.type}
                    </span>
                    <span
                      className={`text-xs font-medium ${priorityColor(selectedMessage.priority)}`}
                    >
                      {selectedMessage.priority}
                    </span>
                  </div>
                </div>

                {/* Detail content */}
                <div className="flex-1 overflow-y-auto p-4">
                  <h2 className="mb-3 text-lg font-semibold text-slate-100">
                    {selectedMessage.subject || '(no subject)'}
                  </h2>

                  <div className="mb-4 space-y-1 text-sm">
                    <div className="flex gap-2">
                      <span className="w-16 text-slate-500">From:</span>
                      <span className="font-medium text-cyan-400">
                        {selectedMessage.from_agent}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <span className="w-16 text-slate-500">To:</span>
                      <span className="font-medium text-green-400">{selectedMessage.to_agent}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="w-16 text-slate-500">Time:</span>
                      <span className="text-slate-300">
                        {new Date(selectedMessage.created_at).toLocaleString()}
                      </span>
                    </div>
                    {selectedMessage.thread_id && (
                      <div className="flex gap-2">
                        <span className="w-16 text-slate-500">Thread:</span>
                        <span className="font-mono text-xs text-slate-400">
                          {selectedMessage.thread_id}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
                    <pre className="whitespace-pre-wrap text-sm text-slate-300">
                      {selectedMessage.body || '(empty body)'}
                    </pre>
                  </div>

                  {selectedMessage.payload && (
                    <div className="mt-4">
                      <h3 className="mb-2 text-sm font-medium text-slate-400">Payload</h3>
                      <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
                        <pre className="whitespace-pre-wrap font-mono text-xs text-slate-400">
                          {selectedMessage.payload}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Panel>
          )}

          {showCompose && (
            <Panel defaultSize={60} minSize={30}>
              <div className="flex h-full flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-800">
                {/* Compose header */}
                <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
                  <h2 className="text-sm font-semibold text-slate-200">Compose Message</h2>
                  <button
                    type="button"
                    onClick={() => setShowCompose(false)}
                    className="text-slate-400 hover:text-slate-200"
                  >
                    <FiX size={16} />
                  </button>
                </div>

                {/* Compose form */}
                <div className="flex-1 overflow-y-auto p-4">
                  <div className="space-y-3">
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label
                          htmlFor="compose-from"
                          className="mb-1 block text-xs font-medium text-slate-400"
                        >
                          From Agent
                        </label>
                        <input
                          id="compose-from"
                          type="text"
                          value={composeForm.from_agent}
                          onChange={(e) =>
                            setComposeForm((f) => ({ ...f, from_agent: e.target.value }))
                          }
                          placeholder="e.g. coordinator"
                          className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                      <div className="flex-1">
                        <label
                          htmlFor="compose-to"
                          className="mb-1 block text-xs font-medium text-slate-400"
                        >
                          To Agent
                        </label>
                        <input
                          id="compose-to"
                          type="text"
                          value={composeForm.to_agent}
                          onChange={(e) =>
                            setComposeForm((f) => ({ ...f, to_agent: e.target.value }))
                          }
                          placeholder="e.g. builder-1"
                          className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="compose-subject"
                        className="mb-1 block text-xs font-medium text-slate-400"
                      >
                        Subject
                      </label>
                      <input
                        id="compose-subject"
                        type="text"
                        value={composeForm.subject}
                        onChange={(e) => setComposeForm((f) => ({ ...f, subject: e.target.value }))}
                        placeholder="Message subject"
                        className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
                      />
                    </div>

                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label
                          htmlFor="compose-type"
                          className="mb-1 block text-xs font-medium text-slate-400"
                        >
                          Type
                        </label>
                        <select
                          id="compose-type"
                          value={composeForm.type}
                          onChange={(e) =>
                            setComposeForm((f) => ({
                              ...f,
                              type: e.target.value as MessageType,
                            }))
                          }
                          className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
                        >
                          {MESSAGE_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex-1">
                        <label
                          htmlFor="compose-priority"
                          className="mb-1 block text-xs font-medium text-slate-400"
                        >
                          Priority
                        </label>
                        <select
                          id="compose-priority"
                          value={composeForm.priority}
                          onChange={(e) =>
                            setComposeForm((f) => ({
                              ...f,
                              priority: e.target.value as MessagePriority,
                            }))
                          }
                          className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
                        >
                          {PRIORITY_OPTIONS.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="compose-body"
                        className="mb-1 block text-xs font-medium text-slate-400"
                      >
                        Body
                      </label>
                      <textarea
                        id="compose-body"
                        value={composeForm.body}
                        onChange={(e) => setComposeForm((f) => ({ ...f, body: e.target.value }))}
                        placeholder="Message body..."
                        rows={8}
                        className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none resize-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Compose footer */}
                <div className="flex items-center justify-end gap-2 border-t border-slate-700 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCompose(false);
                      setComposeForm(defaultCompose);
                    }}
                    className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-400 transition-colors hover:bg-slate-700 hover:text-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={sending}
                    className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
                  >
                    <FiSend size={14} />
                    {sending ? 'Sending...' : 'Send'}
                  </button>
                </div>
              </div>
            </Panel>
          )}
        </PanelGroup>
      </div>
    </div>
  );
}
