import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FiCheckCircle,
  FiChevronLeft,
  FiClipboard,
  FiCornerUpLeft,
  FiEye,
  FiFilter,
  FiInbox,
  FiMail,
  FiMessageSquare,
  FiRefreshCw,
  FiSearch,
  FiLoader,
  FiSend,
  FiTrash2,
  FiX,
} from 'react-icons/fi';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { toast } from 'sonner';
import type { Message, MessagePriority, MessageType, Run } from '../../../shared/types';
import { GROUP_BROADCAST_ADDRESSES, PAYLOAD_TEMPLATES, PROTOCOL_TYPES } from '../../../shared/types';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { ContextMenu, type ContextMenuItem, useContextMenu } from '../../components/ContextMenu';
import { Tooltip } from '../../components/Tooltip';
import { formatAbsoluteTime } from '../../components/RelativeTime';
import { formatRelativeTime as formatRelTime } from '../../lib/dateFormatting';
import { useFormDirtyTracking } from '../../hooks/useUnsavedChanges';
import { handleIpcError } from '../../lib/ipcErrorHandler';
import { VirtualizedMailList, priorityColor, typeColor } from './components';
import type { ComposeForm, MailFilters, MailTab } from './components';
import './MailPage.css';

const isProtocolType = (type: MessageType): boolean => PROTOCOL_TYPES.includes(type);

const defaultCompose: ComposeForm = {
  from_agent: '',
  to_agent: '',
  subject: '',
  body: '',
  type: 'status',
  priority: 'normal',
  thread_id: '',
  payload: '',
};

/** Attempt to format a JSON string for display */
function formatPayloadJson(raw: string): {
  parsed: Record<string, unknown> | null;
  formatted: string;
} {
  try {
    const parsed = JSON.parse(raw);
    return { parsed, formatted: JSON.stringify(parsed, null, 2) };
  } catch {
    return { parsed: null, formatted: raw };
  }
}

const defaultFilters: MailFilters = {
  search: '',
  type: '',
  priority: '',
  agent: '',
  runId: '',
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


export function MailPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<MailTab>('inbox');
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [composeForm, setComposeForm] = useState<ComposeForm>(defaultCompose);

  // Track compose form dirty state for beforeunload warning
  const isComposeFormDirty = useMemo(
    () =>
      showCompose &&
      (composeForm.from_agent.trim() !== '' ||
        composeForm.to_agent.trim() !== '' ||
        composeForm.subject.trim() !== '' ||
        composeForm.body.trim() !== '' ||
        composeForm.payload.trim() !== ''),
    [showCompose, composeForm],
  );
  useFormDirtyTracking('mail-compose-form', 'Mail Compose Form', isComposeFormDirty);

  const [sending, setSending] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  );

  // Thread state
  const [threadMessages, setThreadMessages] = useState<Message[]>([]);
  const [threadReplyCount, setThreadReplyCount] = useState(0);
  const [showThread, setShowThread] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);

  // Search and filter state
  const [filters, setFilters] = useState<MailFilters>(defaultFilters);
  const [searchInput, setSearchInput] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Database-driven agent names derived from messages
  const [knownAgents, setKnownAgents] = useState<string[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);

  const activeFilterCount = [filters.type, filters.priority, filters.agent, filters.runId].filter(Boolean).length;
  const hasAnyFilter = filters.search !== '' || activeFilterCount > 0;

  const loadMessages = useCallback(
    async (currentFilters?: MailFilters) => {
      setLoading(true);
      try {
        const f = currentFilters || filters;
        const queryFilters: Record<string, unknown> = {};
        if (f.search) queryFilters.search = f.search;
        if (f.type) queryFilters.type = f.type;
        if (f.priority) queryFilters.priority = f.priority;
        if (f.agent) queryFilters.agent = f.agent;
        if (f.runId) queryFilters.runId = f.runId;

        const result = await window.electronAPI.mailList(
          Object.keys(queryFilters).length > 0 ? queryFilters : undefined,
        );
        if (result.data) {
          setMessages(result.data);
          // Extract unique agent names from messages for database-driven dropdowns
          const agentSet = new Set<string>();
          for (const m of result.data) {
            if (m.from_agent) agentSet.add(m.from_agent);
            if (m.to_agent && !m.to_agent.startsWith('@')) agentSet.add(m.to_agent);
          }
          setKnownAgents([...agentSet].sort());
        }
        const countResult = await window.electronAPI.mailUnreadCount();
        if (countResult.data !== undefined && countResult.data !== null) {
          setUnreadCount(countResult.data);
        }
      } catch (err) {
        handleIpcError(err, { context: 'loading messages', retry: () => loadMessages() });
      } finally {
        setLoading(false);
      }
    },
    [filters],
  );

  // Load available runs for filtering
  useEffect(() => {
    (async () => {
      try {
        const result = await window.electronAPI.runList();
        if (result.data) {
          setRuns(result.data as Run[]);
        }
      } catch (err) {
        console.error('Failed to load runs:', err);
      }
    })();
  }, []);

  useEffect(() => {
    loadMessages();
    // Listen for real-time mail events
    const unsubReceived = window.electronAPI.onMailReceived(() => {
      loadMessages();
    });
    // Listen for purge events to refresh all views (inbox, outbox, badge, search)
    const unsubPurged = window.electronAPI.onMailPurged(() => {
      loadMessages();
    });
    // Poll every 10s for updates
    const interval = setInterval(() => loadMessages(), 10000);
    return () => {
      clearInterval(interval);
      unsubReceived();
      unsubPurged();
    };
  }, [loadMessages]);

  // Debounced search
  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      const newFilters = { ...filters, search: value };
      setFilters(newFilters);
      loadMessages(newFilters);
    }, 250);
  };

  const handleFilterChange = (key: keyof MailFilters, value: string) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    loadMessages(newFilters);
  };

  const clearAllFilters = () => {
    setSearchInput('');
    setFilters(defaultFilters);
    loadMessages(defaultFilters);
  };

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
      // Use message ID as thread_id for new threads (no existing thread_id)
      const threadId = composeForm.thread_id || id;
      const result = await window.electronAPI.mailSend({
        id,
        from_agent: composeForm.from_agent.trim(),
        to_agent: composeForm.to_agent.trim(),
        subject: composeForm.subject.trim() || null,
        body: composeForm.body.trim() || null,
        type: composeForm.type,
        priority: composeForm.priority,
        thread_id: threadId,
        payload: composeForm.payload.trim() || undefined,
      });
      if (result.error) {
        setStatusMsg({ type: 'error', text: `Failed to send: ${result.error}` });
      } else {
        setStatusMsg({ type: 'success', text: 'Message sent successfully' });
        toast.success('Message sent successfully');
        setComposeForm(defaultCompose);
        setShowCompose(false);
        loadMessages();
      }
    } catch (err) {
      const msg = handleIpcError(err, { context: 'sending message', showToast: false });
      setStatusMsg({ type: 'error', text: msg });
    } finally {
      setSending(false);
    }
  };

  const handleMarkAllRead = async () => {
    setMarkingAllRead(true);
    try {
      const result = await window.electronAPI.mailMarkAllRead();
      if (result.error) {
        setStatusMsg({ type: 'error', text: `Failed: ${result.error}` });
      } else {
        setMessages((prev) => prev.map((m) => ({ ...m, read: 1 })));
        setUnreadCount(0);
        if (selectedMessage) {
          setSelectedMessage({ ...selectedMessage, read: 1 });
        }
        setStatusMsg({ type: 'success', text: 'All messages marked as read' });
        toast.success('All messages marked as read');
      }
    } catch (err) {
      const msg = handleIpcError(err, { context: 'marking all as read', showToast: false });
      setStatusMsg({ type: 'error', text: msg });
    } finally {
      setMarkingAllRead(false);
    }
  };

  // Processing states for action buttons
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [purging, setPurging] = useState(false);

  // Purge state
  const [showPurgeMenu, setShowPurgeMenu] = useState(false);
  const [purgeAgentName, setPurgeAgentName] = useState('');
  const purgeMenuRef = useRef<HTMLDivElement>(null);

  // Close purge menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (purgeMenuRef.current && !purgeMenuRef.current.contains(e.target as Node)) {
        setShowPurgeMenu(false);
      }
    };
    if (showPurgeMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showPurgeMenu]);

  const handlePurgeAll = async () => {
    if (!confirm('Delete ALL messages? This cannot be undone.')) return;
    setPurging(true);
    try {
      const result = await window.electronAPI.mailPurge();
      setMessages([]);
      setUnreadCount(0);
      setSelectedMessage(null);
      setShowPurgeMenu(false);
      const deleted = (result?.data as { deleted?: number } | null)?.deleted ?? 0;
      setStatusMsg({ type: 'success', text: `Purged all messages (${deleted} removed)` });
      toast.success(`Purged all messages (${deleted} removed)`);
    } catch (err) {
      const msg = handleIpcError(err, { context: 'purging messages', showToast: false });
      setStatusMsg({ type: 'error', text: msg });
    } finally {
      setPurging(false);
    }
  };

  const handlePurgeByAge = async (hours: number) => {
    const label = hours >= 24 ? `${hours / 24} day(s)` : `${hours} hour(s)`;
    if (!confirm(`Delete messages older than ${label}? This cannot be undone.`)) return;
    setPurging(true);
    try {
      if (hours >= 24) {
        await window.electronAPI.mailPurge({ olderThanDays: hours / 24 });
      } else {
        await window.electronAPI.mailPurge({ olderThanHours: hours });
      }
      setShowPurgeMenu(false);
      setSelectedMessage(null);
      loadMessages();
      setStatusMsg({ type: 'success', text: `Purged messages older than ${label}` });
      toast.success(`Purged messages older than ${label}`);
    } catch (err) {
      const msg = handleIpcError(err, { context: 'purging messages', showToast: false });
      setStatusMsg({ type: 'error', text: msg });
    } finally {
      setPurging(false);
    }
  };

  const handlePurgeByAgent = async () => {
    const name = purgeAgentName.trim();
    if (!name) return;
    if (!confirm(`Delete all messages for agent "${name}"? This cannot be undone.`)) return;
    setPurging(true);
    try {
      await window.electronAPI.mailPurge({ agentName: name });
      setPurgeAgentName('');
      setShowPurgeMenu(false);
      setSelectedMessage(null);
      loadMessages();
      setStatusMsg({ type: 'success', text: `Purged messages for agent "${name}"` });
      toast.success(`Purged messages for agent "${name}"`);
    } catch (err) {
      const msg = handleIpcError(err, { context: 'purging messages', showToast: false });
      setStatusMsg({ type: 'error', text: msg });
    } finally {
      setPurging(false);
    }
  };

  const loadThread = async (threadId: string) => {
    setLoadingThread(true);
    try {
      const result = await window.electronAPI.mailThread(threadId);
      if (result.data) {
        setThreadMessages(result.data.messages);
        setThreadReplyCount(result.data.replyCount);
        setShowThread(true);
      }
    } catch (err) {
      handleIpcError(err, { context: 'loading thread' });
    } finally {
      setLoadingThread(false);
    }
  };

  const handleReply = (msg: Message) => {
    const threadId = msg.thread_id || msg.id;
    setComposeForm({
      ...defaultCompose,
      from_agent: msg.to_agent,
      to_agent: msg.from_agent,
      subject: msg.subject ? `Re: ${msg.subject.replace(/^Re: /, '')}` : '',
      type: msg.type,
      priority: msg.priority,
      thread_id: threadId,
    });
    setShowCompose(true);
    setShowThread(false);
  };

  // Context menu for right-click on messages
  const msgContextMenu = useContextMenu();

  // biome-ignore lint/correctness/useExhaustiveDependencies: handleReply/handleMarkRead are inline functions
  const handleMessageContextMenu = useCallback(
    (e: React.MouseEvent, msg: Message) => {
      const items: ContextMenuItem[] = [
        {
          id: 'reply',
          label: 'Reply',
          icon: <FiCornerUpLeft className="h-3.5 w-3.5" />,
          onClick: () => handleReply(msg),
        },
        {
          id: 'mark-read',
          label: 'Mark as Read',
          icon: <FiEye className="h-3.5 w-3.5" />,
          onClick: () => handleMarkRead(msg),
          disabled: msg.read !== 0,
        },
        { id: 'sep-1', label: '', separator: true, onClick: () => {} },
        {
          id: 'copy-content',
          label: 'Copy Content',
          icon: <FiClipboard className="h-3.5 w-3.5" />,
          onClick: () => {
            const content = msg.body || msg.subject || '';
            navigator.clipboard.writeText(content);
            toast.success('Message content copied to clipboard');
          },
        },
      ];
      msgContextMenu.show(e, items);
    },
    [msgContextMenu],
  );

  // Filter messages by tab
  const filteredMessages = messages.filter(() => {
    // All tabs show all messages for now since we don't have a "current agent" concept
    // In a real scenario, inbox would filter by to_agent === currentAgent
    return true;
  });

  // Messages are already sorted by priority then created_at from the backend query
  const sortedMessages = filteredMessages;

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
            <Badge className="flex items-center gap-1 rounded-full bg-blue-600 px-2.5 py-0.5 text-xs font-medium text-white border-0">
              {unreadCount} unread
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              setShowCompose(true);
              setSelectedMessage(null);
            }}
            className="flex items-center gap-2 bg-blue-600/15 text-blue-400 border border-blue-500/25 hover:bg-blue-600/25 hover:text-blue-300"
          >
            <FiSend size={14} />
            Compose
          </Button>
          <Tooltip content="Refresh">
            <Button
              variant="outline"
              size="icon"
              onClick={() => loadMessages()}
              className="border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            >
              <FiRefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </Button>
          </Tooltip>
          {unreadCount > 0 && (
            <Tooltip content="Mark all as read">
              <Button
                variant="outline"
                size="icon"
                onClick={handleMarkAllRead}
                disabled={markingAllRead}
                className="border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                data-testid="mail-mark-all-read"
              >
                <FiCheckCircle size={14} className={markingAllRead ? 'animate-spin' : ''} />
              </Button>
            </Tooltip>
          )}
          <div className="relative" ref={purgeMenuRef}>
            <Tooltip content="Purge all messages">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowPurgeMenu((v) => !v)}
                className="border-slate-700 text-slate-400 hover:bg-red-900/30 hover:text-red-400"
              >
                <FiTrash2 size={14} />
              </Button>
            </Tooltip>
            {showPurgeMenu && (
              <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-lg border border-slate-700 bg-slate-900 p-3 shadow-xl">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Purge Messages
                </h4>

                {/* Purge by age */}
                <div className="mb-3 space-y-1">
                  <p className="text-xs text-slate-400">By age:</p>
                  <div className="flex flex-wrap gap-1">
                    {[
                      { label: '1 hour', hours: 1 },
                      { label: '6 hours', hours: 6 },
                      { label: '24 hours', hours: 24 },
                      { label: '7 days', hours: 168 },
                    ].map((opt) => (
                      <Button
                        key={opt.hours}
                        variant="outline"
                        size="sm"
                        onClick={() => handlePurgeByAge(opt.hours)}
                        disabled={purging}
                        className="h-auto border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-red-600 hover:bg-red-900/30 hover:text-red-300"
                      >
                        &gt; {opt.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Purge by agent */}
                <div className="mb-3">
                  <p className="mb-1 text-xs text-slate-400">By agent:</p>
                  <div className="flex gap-1">
                    <Input
                      type="text"
                      value={purgeAgentName}
                      onChange={(e) => setPurgeAgentName(e.target.value)}
                      placeholder="Agent name..."
                      aria-label="Agent name to purge messages"
                      className="h-auto flex-1 border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 placeholder-slate-500 focus:border-blue-500"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handlePurgeByAgent();
                      }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePurgeByAgent}
                      disabled={!purgeAgentName.trim() || purging}
                      className="h-auto border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-red-600 hover:bg-red-900/30 hover:text-red-300"
                    >
                      {purging ? <><FiLoader size={10} className="inline animate-spin mr-1" />Purging...</> : 'Purge'}
                    </Button>
                  </div>
                </div>

                {/* Purge all */}
                <Button
                  onClick={handlePurgeAll}
                  disabled={purging}
                  className="w-full px-3 py-1.5 text-xs font-medium bg-red-600/15 text-red-400 border border-red-500/25 hover:bg-red-600/25 hover:text-red-300"
                >
                  {purging ? <><FiLoader size={12} className="inline animate-spin mr-1" />Purging...</> : 'Purge All Messages'}
                </Button>
              </div>
            )}
          </div>
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

      {/* Search and Filter Bar */}
      <div className="mb-3 space-y-2" data-testid="mail-search-filters">
        {/* Search input row */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <FiSearch
              size={14}
              className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-400"
            />
            <Input
              type="text"
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search messages by subject, body, or agent..."
              aria-label="Search messages"
              className="w-full rounded-lg border-slate-700 bg-slate-800 py-2 pr-3 pl-9 text-sm text-slate-100 placeholder:text-slate-400 focus:border-blue-500"
              data-testid="mail-search-input"
            />
            {searchInput && (
              <Tooltip content="Clear search">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleSearchChange('')}
                  className="absolute top-1/2 right-1 -translate-y-1/2 h-7 w-7 text-slate-400 hover:text-slate-300"
                  data-testid="mail-search-clear"
                  aria-label="Clear search"
                >
                  <FiX size={14} />
                </Button>
              </Tooltip>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className={`relative flex items-center gap-1.5 ${
              showFilters || activeFilterCount > 0
                ? 'border-blue-600 bg-blue-900/30 text-blue-400'
                : 'border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
            data-testid="mail-filter-toggle"
          >
            <FiFilter size={14} />
            Filters
            {activeFilterCount > 0 && (
              <Badge className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white border-0 px-0 py-0">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
          {hasAnyFilter && (
            <Button
              variant="outline"
              size="sm"
              onClick={clearAllFilters}
              className="flex items-center gap-1 border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              data-testid="mail-clear-filters"
            >
              <FiX size={12} />
              Clear
            </Button>
          )}
        </div>

        {/* Filter dropdowns row */}
        {showFilters && (
          <div
            className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-3"
            data-testid="mail-filter-panel"
          >
            <div className="flex items-center gap-2">
              <Label htmlFor="filter-type" className="text-xs font-medium text-slate-400">
                Type:
              </Label>
              <Select
                value={filters.type || '__all__'}
                onValueChange={(v) => handleFilterChange('type', v === '__all__' ? '' : v)}
              >
                <SelectTrigger
                  id="filter-type"
                  className="w-auto h-8 border-slate-700 bg-slate-800 text-xs text-slate-200"
                  data-testid="mail-filter-type"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All types</SelectItem>
                  {MESSAGE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Label htmlFor="filter-priority" className="text-xs font-medium text-slate-400">
                Priority:
              </Label>
              <Select
                value={filters.priority || '__all__'}
                onValueChange={(v) => handleFilterChange('priority', v === '__all__' ? '' : v)}
              >
                <SelectTrigger
                  id="filter-priority"
                  className="w-auto h-8 border-slate-700 bg-slate-800 text-xs text-slate-200"
                  data-testid="mail-filter-priority"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All priorities</SelectItem>
                  {PRIORITY_OPTIONS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Label htmlFor="filter-agent" className="text-xs font-medium text-slate-400">
                Agent:
              </Label>
              <Select
                value={filters.agent || '__all__'}
                onValueChange={(v) => handleFilterChange('agent', v === '__all__' ? '' : v)}
              >
                <SelectTrigger
                  id="filter-agent"
                  className="w-40 h-8 border-slate-700 bg-slate-800 text-xs text-slate-200"
                  data-testid="mail-filter-agent"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All agents</SelectItem>
                  {knownAgents.map((agent) => (
                    <SelectItem key={agent} value={agent}>
                      {agent}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Label htmlFor="filter-run" className="text-xs font-medium text-slate-400">
                Run:
              </Label>
              <Select
                value={filters.runId || '__all__'}
                onValueChange={(v) => handleFilterChange('runId', v === '__all__' ? '' : v)}
              >
                <SelectTrigger
                  id="filter-run"
                  className="w-40 h-8 border-slate-700 bg-slate-800 text-xs text-slate-200"
                  data-testid="mail-filter-run"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All runs</SelectItem>
                  {runs.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.id.slice(0, 8)}… ({r.status}{r.agent_count ? `, ${r.agent_count} agents` : ''})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Active filter summary */}
        {hasAnyFilter && (
          <div
            className="flex items-center gap-2 text-xs text-slate-400"
            data-testid="mail-filter-summary"
          >
            <span>
              Showing {sortedMessages.length} result{sortedMessages.length !== 1 ? 's' : ''}
            </span>
            {filters.search && (
              <Badge variant="secondary" className="rounded-full bg-slate-700 px-2 py-0.5 text-slate-300">
                search: &quot;{filters.search}&quot;
              </Badge>
            )}
            {filters.type && (
              <Badge variant="secondary" className="rounded-full bg-slate-700 px-2 py-0.5 text-slate-300">
                type: {filters.type}
              </Badge>
            )}
            {filters.priority && (
              <Badge variant="secondary" className="rounded-full bg-slate-700 px-2 py-0.5 text-slate-300">
                priority: {filters.priority}
              </Badge>
            )}
            {filters.agent && (
              <Badge variant="secondary" className="rounded-full bg-slate-700 px-2 py-0.5 text-slate-300">
                agent: {filters.agent}
              </Badge>
            )}
            {filters.runId && (
              <Badge variant="secondary" className="rounded-full bg-slate-700 px-2 py-0.5 text-slate-300">
                run: {filters.runId.slice(0, 8)}…
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as MailTab); setSelectedMessage(null); }} className="mb-4">
        <TabsList className="flex gap-1 rounded-lg border border-slate-700 bg-slate-800/50 p-1 h-auto">
          {(['inbox', 'outbox', 'all'] as MailTab[]).map((tab) => (
            <TabsTrigger
              key={tab}
              value={tab}
              className="flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium capitalize text-slate-400 shadow-none data-[state=active]:bg-slate-700 data-[state=active]:text-slate-50 data-[state=active]:shadow-none hover:text-slate-200"
            >
              {tab === 'inbox' && <FiInbox size={14} />}
              {tab === 'outbox' && <FiSend size={14} />}
              {tab === 'all' && <FiMail size={14} />}
              {tab === 'outbox' ? 'Outbox' : tab}
              {tab === 'inbox' && unreadCount > 0 && (
                <Badge className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white border-0 px-0 py-0">
                  {unreadCount}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Content - Resizable Panels */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal" autoSaveId="mail-panels">
          {/* Message list panel */}
          <Panel defaultSize={selectedMessage || showCompose ? 40 : 100} minSize={25}>
            <div className="flex h-full flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-800">
              {loading && messages.length === 0 ? (
                <div className="flex-1 overflow-hidden" data-testid="mail-skeleton">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div
                      key={`skeleton-${
                        // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows
                        i
                      }`}
                      className="flex w-full items-start gap-3 border-b border-b-slate-700/50 px-4 py-3 animate-pulse"
                    >
                      <div className="mt-1.5 flex-shrink-0">
                        <div className="h-2 w-2 rounded-full bg-slate-700" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div className="h-3.5 w-24 rounded bg-slate-700" />
                            <div className="h-3 w-8 rounded bg-slate-700/50" />
                            <div className="h-3.5 w-20 rounded bg-slate-700" />
                          </div>
                          <div className="h-3 w-12 rounded bg-slate-700/50" />
                        </div>
                        <div
                          className="mt-2 h-3.5 rounded bg-slate-700/70"
                          style={{ width: `${65 + (i % 3) * 10}%` }}
                        />
                        <div
                          className="mt-1.5 h-3 rounded bg-slate-700/40"
                          style={{ width: `${70 + (i % 4) * 8}%` }}
                        />
                        <div className="mt-2 flex items-center gap-2">
                          <div className="h-4 w-14 rounded-full bg-slate-700/50" />
                          <div className="h-4 w-16 rounded-full bg-slate-700/40" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : sortedMessages.length === 0 ? (
                <div
                  data-testid="mail-empty-state"
                  className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-slate-400"
                >
                  <div className="mb-1 flex h-16 w-16 items-center justify-center rounded-full bg-slate-700/50">
                    <FiInbox size={32} className="text-slate-400" />
                  </div>
                  <p
                    data-testid="mail-empty-title"
                    className="text-lg font-semibold text-slate-400"
                  >
                    {hasAnyFilter ? 'No matching messages' : 'No messages yet'}
                  </p>
                  <p
                    data-testid="mail-empty-message"
                    className="text-sm text-slate-400 max-w-sm text-center"
                  >
                    {hasAnyFilter
                      ? 'Try adjusting your search or filters.'
                      : 'The mail system enables inter-agent communication. Messages will appear here when agents send status updates, requests, or reports to each other.'}
                  </p>
                  {hasAnyFilter && (
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid="mail-clear-filters-cta"
                      onClick={clearAllFilters}
                      className="mt-2 border-slate-600 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                    >
                      Clear all filters
                    </Button>
                  )}
                </div>
              ) : (
                <VirtualizedMailList
                  messages={sortedMessages}
                  selectedMessage={selectedMessage}
                  activeTab={activeTab}
                  handleSelectMessage={handleSelectMessage}
                  handleMessageContextMenu={handleMessageContextMenu}
                  formatDate={formatRelTime}
                  formatAbsoluteTime={formatAbsoluteTime}
                  typeColor={typeColor}
                  priorityColor={priorityColor}
                />
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
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedMessage(null);
                      setShowThread(false);
                    }}
                    className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200"
                  >
                    <FiChevronLeft size={16} /> Back
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleReply(selectedMessage)}
                      className="flex items-center gap-1 h-auto border-slate-600 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-700 hover:text-slate-100"
                      title="Reply to this message"
                    >
                      <FiCornerUpLeft size={12} /> Reply
                    </Button>
                    {selectedMessage.thread_id && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadThread(selectedMessage.thread_id as string)}
                        disabled={loadingThread}
                        className="flex items-center gap-1 h-auto border-cyan-700 bg-cyan-900/30 px-2.5 py-1 text-xs text-cyan-300 hover:bg-cyan-900/50"
                        title="View thread conversation"
                      >
                        <FiMessageSquare size={12} />
                        {loadingThread ? 'Loading...' : 'View Thread'}
                      </Button>
                    )}
                    <Badge
                      variant="outline"
                      className={`px-2 py-0.5 text-xs ${typeColor(selectedMessage.type)}`}
                    >
                      {selectedMessage.type}
                    </Badge>
                    <Badge
                      variant="secondary"
                      className={`text-xs font-medium border-0 bg-transparent ${priorityColor(selectedMessage.priority)}`}
                    >
                      {selectedMessage.priority}
                    </Badge>
                  </div>
                </div>

                {/* Detail content */}
                <div className="flex-1 overflow-y-auto p-4">
                  <h2 className="mb-3 text-lg font-semibold text-slate-100">
                    {selectedMessage.subject || '(no subject)'}
                  </h2>

                  <div className="mb-4 space-y-1 text-sm">
                    <div className="flex gap-2">
                      <span className="w-16 text-slate-400">From:</span>
                      <span className="font-medium text-cyan-400">
                        {selectedMessage.from_agent}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <span className="w-16 text-slate-400">To:</span>
                      <span className="font-medium text-green-400">{selectedMessage.to_agent}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="w-16 text-slate-400">Time:</span>
                      <span className="text-slate-300">
                        {new Date(selectedMessage.created_at).toLocaleString()}
                      </span>
                    </div>
                    {selectedMessage.thread_id && (
                      <div className="flex gap-2">
                        <span className="w-16 text-slate-400">Thread:</span>
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

                  {selectedMessage.payload &&
                    (() => {
                      const { parsed, formatted } = formatPayloadJson(selectedMessage.payload);
                      return (
                        <div className="mt-4">
                          <h3 className="mb-2 text-sm font-medium text-slate-400">
                            Payload
                            {parsed && (
                              <Badge variant="secondary" className="ml-2 rounded bg-emerald-900/40 px-1.5 py-0.5 text-xs text-emerald-400">
                                JSON
                              </Badge>
                            )}
                          </h3>
                          {parsed ? (
                            <div className="rounded-lg border border-slate-700 bg-slate-950 p-4">
                              <div className="space-y-1">
                                {Object.entries(parsed).map(([key, value]) => (
                                  <div key={key} className="flex gap-2 text-xs">
                                    <span className="shrink-0 font-mono text-cyan-400">{key}:</span>
                                    <span className="font-mono text-emerald-300">
                                      {Array.isArray(value)
                                        ? value.length > 0
                                          ? `[${value.map((v) => JSON.stringify(v)).join(', ')}]`
                                          : '[]'
                                        : typeof value === 'object' && value !== null
                                          ? JSON.stringify(value, null, 2)
                                          : String(value)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                              <details className="mt-3">
                                <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-400">
                                  Raw JSON
                                </summary>
                                <pre className="mt-2 whitespace-pre-wrap font-mono text-xs text-slate-400">
                                  {formatted}
                                </pre>
                              </details>
                            </div>
                          ) : (
                            <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
                              <pre className="whitespace-pre-wrap font-mono text-xs text-slate-400">
                                {formatted}
                              </pre>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                  {/* Thread conversation view */}
                  {showThread && threadMessages.length > 0 && (
                    <div className="mt-6">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                          <FiMessageSquare size={14} className="text-cyan-400" />
                          Thread Conversation
                          <Badge variant="secondary" className="rounded-full bg-cyan-900/40 px-2 py-0.5 text-[10px] font-medium text-cyan-300">
                            {threadReplyCount} {threadReplyCount === 1 ? 'reply' : 'replies'}
                          </Badge>
                        </h3>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowThread(false)}
                          className="text-xs text-slate-400 hover:text-slate-300"
                        >
                          Hide thread
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {threadMessages.map((tmsg, idx) => (
                          <div
                            key={tmsg.id}
                            className={`rounded-lg border p-3 ${
                              tmsg.id === selectedMessage.id
                                ? 'border-cyan-700 bg-cyan-950/30'
                                : 'border-slate-700 bg-slate-900/50'
                            }`}
                          >
                            <div className="mb-1.5 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-cyan-400">
                                  {tmsg.from_agent}
                                </span>
                                <span className="text-[10px] text-slate-400">{'\u2192'}</span>
                                <span className="text-xs font-medium text-green-400">
                                  {tmsg.to_agent}
                                </span>
                                {idx === 0 && (
                                  <Badge variant="secondary" className="rounded bg-slate-700 px-1.5 py-0.5 text-[9px] font-medium text-slate-400">
                                    ORIGINAL
                                  </Badge>
                                )}
                                {tmsg.priority !== 'normal' && (
                                  <span
                                    className={`text-[10px] font-medium ${priorityColor(tmsg.priority)}`}
                                  >
                                    {tmsg.priority.toUpperCase()}
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-400">
                                {formatRelTime(tmsg.created_at)}
                              </span>
                            </div>
                            {tmsg.subject && (
                              <p className="mb-1 text-xs font-medium text-slate-300">
                                {tmsg.subject}
                              </p>
                            )}
                            <pre className="whitespace-pre-wrap text-xs text-slate-400">
                              {tmsg.body || '(empty)'}
                            </pre>
                          </div>
                        ))}
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
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-slate-200">
                      {composeForm.thread_id ? 'Reply to Thread' : 'Compose Message'}
                    </h2>
                    {composeForm.thread_id && (
                      <Badge variant="secondary" className="rounded bg-cyan-900/40 px-1.5 py-0.5 text-[10px] font-medium text-cyan-300">
                        <FiMessageSquare size={10} className="mr-1 inline" />
                        thread
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowCompose(false)}
                    className="h-7 w-7 text-slate-400 hover:text-slate-200"
                  >
                    <FiX size={16} />
                  </Button>
                </div>

                {/* Compose form */}
                <div className="flex-1 overflow-y-auto p-4">
                  <div className="space-y-3">
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <Label
                          htmlFor="compose-from"
                          className="mb-1 block text-xs font-medium text-slate-400"
                        >
                          From Agent
                        </Label>
                        <Input
                          id="compose-from"
                          type="text"
                          list="known-agents-from"
                          value={composeForm.from_agent}
                          onChange={(e) =>
                            setComposeForm((f) => ({ ...f, from_agent: e.target.value }))
                          }
                          placeholder="e.g. coordinator"
                          className="border-slate-600 bg-slate-900 text-sm text-slate-100 placeholder:text-slate-400 focus:border-blue-500"
                          data-testid="compose-from-agent"
                        />
                        <datalist id="known-agents-from">
                          {knownAgents.map((agent) => (
                            <option key={agent} value={agent} />
                          ))}
                        </datalist>
                      </div>
                      <div className="flex-1">
                        <Label
                          htmlFor="compose-to"
                          className="mb-1 block text-xs font-medium text-slate-400"
                        >
                          To Agent
                        </Label>
                        <Input
                          id="compose-to"
                          type="text"
                          list="group-addresses"
                          value={composeForm.to_agent}
                          onChange={(e) =>
                            setComposeForm((f) => ({ ...f, to_agent: e.target.value }))
                          }
                          placeholder="e.g. builder-1 or @all"
                          className="border-slate-600 bg-slate-900 text-sm text-slate-100 placeholder:text-slate-400 focus:border-blue-500"
                        />
                        <datalist id="group-addresses">
                          {knownAgents.map((agent) => (
                            <option key={agent} value={agent} />
                          ))}
                          {GROUP_BROADCAST_ADDRESSES.map((addr) => (
                            <option key={addr} value={addr} />
                          ))}
                        </datalist>
                        {composeForm.to_agent.startsWith('@') && (
                          <p className="mt-1 text-xs text-amber-400">
                            Broadcast: message will be sent to all{' '}
                            {composeForm.to_agent === '@all'
                              ? 'active agents'
                              : `${composeForm.to_agent.slice(1)} agents`}
                          </p>
                        )}
                      </div>
                    </div>

                    <div>
                      <Label
                        htmlFor="compose-subject"
                        className="mb-1 block text-xs font-medium text-slate-400"
                      >
                        Subject
                      </Label>
                      <Input
                        id="compose-subject"
                        type="text"
                        value={composeForm.subject}
                        onChange={(e) => setComposeForm((f) => ({ ...f, subject: e.target.value }))}
                        placeholder="Message subject"
                        className="border-slate-600 bg-slate-900 text-sm text-slate-100 placeholder:text-slate-400 focus:border-blue-500"
                      />
                    </div>

                    <div className="flex gap-3">
                      <div className="flex-1">
                        <Label
                          htmlFor="compose-type"
                          className="mb-1 block text-xs font-medium text-slate-400"
                        >
                          Type
                        </Label>
                        <Select
                          value={composeForm.type}
                          onValueChange={(v) =>
                            setComposeForm((f) => ({
                              ...f,
                              type: v as MessageType,
                            }))
                          }
                        >
                          <SelectTrigger
                            id="compose-type"
                            className="w-full h-9 border-slate-700 bg-slate-800 text-sm text-slate-200"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {MESSAGE_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>
                                {t}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex-1">
                        <Label
                          htmlFor="compose-priority"
                          className="mb-1 block text-xs font-medium text-slate-400"
                        >
                          Priority
                        </Label>
                        <Select
                          value={composeForm.priority}
                          onValueChange={(v) =>
                            setComposeForm((f) => ({
                              ...f,
                              priority: v as MessagePriority,
                            }))
                          }
                        >
                          <SelectTrigger
                            id="compose-priority"
                            className="w-full h-9 border-slate-700 bg-slate-800 text-sm text-slate-200"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PRIORITY_OPTIONS.map((p) => (
                              <SelectItem key={p} value={p}>
                                {p}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div>
                      <Label
                        htmlFor="compose-body"
                        className="mb-1 block text-xs font-medium text-slate-400"
                      >
                        Body
                      </Label>
                      <Textarea
                        id="compose-body"
                        value={composeForm.body}
                        onChange={(e) => setComposeForm((f) => ({ ...f, body: e.target.value }))}
                        placeholder="Message body..."
                        rows={isProtocolType(composeForm.type) ? 4 : 8}
                        className="border-slate-600 bg-slate-900 text-sm text-slate-100 placeholder:text-slate-400 focus:border-blue-500 resize-none"
                      />
                    </div>

                    {isProtocolType(composeForm.type) && (
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <Label
                            htmlFor="compose-payload"
                            className="block text-xs font-medium text-slate-400"
                          >
                            JSON Payload
                          </Label>
                          <Button
                            variant="link"
                            size="sm"
                            onClick={() => {
                              const template = PAYLOAD_TEMPLATES[composeForm.type];
                              if (template) {
                                setComposeForm((f) => ({ ...f, payload: template }));
                              }
                            }}
                            className="h-auto p-0 text-xs text-blue-400 hover:text-blue-300"
                          >
                            Insert Template
                          </Button>
                        </div>
                        <Textarea
                          id="compose-payload"
                          value={composeForm.payload}
                          onChange={(e) =>
                            setComposeForm((f) => ({ ...f, payload: e.target.value }))
                          }
                          placeholder={PAYLOAD_TEMPLATES[composeForm.type] || '{"key": "value"}'}
                          rows={5}
                          className="border-slate-600 bg-slate-950 font-mono text-xs text-emerald-300 placeholder:text-slate-400 focus:border-blue-500 resize-none"
                        />
                        {composeForm.payload.trim() &&
                          (() => {
                            try {
                              JSON.parse(composeForm.payload);
                              return <p className="mt-1 text-xs text-emerald-500">Valid JSON</p>;
                            } catch {
                              return <p className="mt-1 text-xs text-red-400">Invalid JSON</p>;
                            }
                          })()}
                      </div>
                    )}
                  </div>
                </div>

                {/* Compose footer */}
                <div className="flex items-center justify-end gap-2 border-t border-slate-700 px-4 py-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowCompose(false);
                      setComposeForm(defaultCompose);
                    }}
                    className="border-slate-600 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSend}
                    disabled={sending}
                    className="bg-blue-600/15 text-blue-400 border border-blue-500/25 hover:bg-blue-600/25 hover:text-blue-300"
                  >
                    {sending ? <FiLoader size={14} className="animate-spin" /> : <FiSend size={14} />}
                    {sending ? 'Sending...' : 'Send'}
                  </Button>
                </div>
              </div>
            </Panel>
          )}
        </PanelGroup>
      </div>

      {/* Right-click context menu */}
      <ContextMenu menu={msgContextMenu.menu} onClose={msgContextMenu.hide} />
    </div>
  );
}

