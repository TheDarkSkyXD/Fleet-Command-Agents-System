import { useCallback, useEffect, useState } from 'react';
import {
  FiAlertCircle,
  FiAlertTriangle,
  FiBell,
  FiCheckCircle,
  FiCopy,
  FiFilter,
  FiGitMerge,
  FiHeart,
  FiRefreshCw,
  FiTrash2,
  FiUsers,
  FiX,
} from 'react-icons/fi';
import { toast } from 'sonner';
import { formatAbsoluteTime } from '../components/RelativeTime';

interface NotificationRecord {
  id: number;
  title: string;
  body: string;
  event_type: string;
  agent_name: string | null;
  created_at: string;
}

const EVENT_TYPE_CONFIG: Record<
  string,
  { label: string; color: string; bgColor: string; borderColor: string; icon: typeof FiBell }
> = {
  agent_completed: {
    label: 'Completed',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-900/30',
    borderColor: 'border-emerald-700/50',
    icon: FiCheckCircle,
  },
  agent_stalled: {
    label: 'Stalled',
    color: 'text-amber-400',
    bgColor: 'bg-amber-900/30',
    borderColor: 'border-amber-700/50',
    icon: FiAlertTriangle,
  },
  agent_zombie: {
    label: 'Zombie',
    color: 'text-amber-400',
    bgColor: 'bg-amber-900/30',
    borderColor: 'border-amber-700/50',
    icon: FiAlertTriangle,
  },
  agent_error: {
    label: 'Error',
    color: 'text-red-400',
    bgColor: 'bg-red-900/30',
    borderColor: 'border-red-600/50',
    icon: FiAlertCircle,
  },
  merge_ready: {
    label: 'Merge Ready',
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-900/30',
    borderColor: 'border-cyan-700/50',
    icon: FiGitMerge,
  },
  merge_failed: {
    label: 'Merge Failed',
    color: 'text-red-400',
    bgColor: 'bg-red-900/30',
    borderColor: 'border-red-600/50',
    icon: FiAlertCircle,
  },
  health_alert: {
    label: 'Health Alert',
    color: 'text-red-400',
    bgColor: 'bg-red-900/30',
    borderColor: 'border-red-600/50',
    icon: FiHeart,
  },
};

function getEventConfig(eventType: string) {
  return (
    EVENT_TYPE_CONFIG[eventType] || {
      label: eventType,
      color: 'text-slate-400',
      bgColor: 'bg-slate-800/50',
      borderColor: 'border-slate-700/50',
      icon: FiBell,
    }
  );
}

function formatTimestamp(isoString: string): string {
  try {
    const date = new Date(isoString.endsWith('Z') ? isoString : `${isoString}Z`);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

export function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const filters: { event_type?: string; limit?: number } = { limit: 200 };
      if (filterType) {
        filters.event_type = filterType;
      }
      const result = await window.electronAPI.notificationHistory(filters);
      if (result.data) {
        setNotifications(result.data);
      }
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, [filterType]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Listen for live notification events to append to the list
  useEffect(() => {
    window.electronAPI.onNotificationEvent(() => {
      // Refresh notifications when a new one arrives
      fetchNotifications();
    });
  }, [fetchNotifications]);

  const handleClearHistory = async () => {
    try {
      await window.electronAPI.notificationClearHistory();
      setNotifications([]);
      setShowClearConfirm(false);
    } catch {
      // Silently handle
    }
  };

  const errorCount = notifications.filter(
    (n) =>
      n.event_type === 'agent_error' ||
      n.event_type === 'merge_failed' ||
      n.event_type === 'health_alert',
  ).length;
  const warningCount = notifications.filter(
    (n) => n.event_type === 'agent_stalled' || n.event_type === 'agent_zombie',
  ).length;
  const successCount = notifications.filter(
    (n) => n.event_type === 'agent_completed' || n.event_type === 'merge_ready',
  ).length;

  return (
    <div className="space-y-6" data-testid="notifications-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FiBell className="h-6 w-6 text-cyan-400" />
          <h1 className="text-2xl font-bold text-slate-100">Notifications</h1>
          <span className="rounded-full bg-slate-700 px-2.5 py-0.5 text-xs text-slate-300">
            {notifications.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchNotifications}
            className="flex items-center gap-1.5 rounded-lg bg-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-600 transition-colors"
            data-testid="notifications-refresh"
          >
            <FiRefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowClearConfirm(true)}
            disabled={notifications.length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-red-900/40 px-3 py-1.5 text-sm text-red-400 hover:bg-red-900/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid="notifications-clear"
          >
            <FiTrash2 className="h-3.5 w-3.5" />
            Clear History
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div
          className="rounded-lg border border-red-800/40 bg-red-900/20 p-4"
          data-testid="notifications-error-count"
        >
          <div className="flex items-center gap-2">
            <FiAlertCircle className="h-5 w-5 text-red-400" />
            <span className="text-sm text-red-300">Errors</span>
          </div>
          <p className="mt-1 text-2xl font-bold text-red-400">{errorCount}</p>
        </div>
        <div
          className="rounded-lg border border-amber-800/40 bg-amber-900/20 p-4"
          data-testid="notifications-warning-count"
        >
          <div className="flex items-center gap-2">
            <FiAlertTriangle className="h-5 w-5 text-amber-400" />
            <span className="text-sm text-amber-300">Warnings</span>
          </div>
          <p className="mt-1 text-2xl font-bold text-amber-400">{warningCount}</p>
        </div>
        <div
          className="rounded-lg border border-emerald-800/40 bg-emerald-900/20 p-4"
          data-testid="notifications-success-count"
        >
          <div className="flex items-center gap-2">
            <FiCheckCircle className="h-5 w-5 text-emerald-400" />
            <span className="text-sm text-emerald-300">Success</span>
          </div>
          <p className="mt-1 text-2xl font-bold text-emerald-400">{successCount}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <FiFilter className="h-4 w-4 text-slate-400" />
        <span className="text-sm text-slate-400">Filter:</span>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none"
          data-testid="notifications-filter"
        >
          <option value="">All Types</option>
          <option value="agent_error">Agent Errors</option>
          <option value="agent_stalled">Agent Stalled</option>
          <option value="agent_zombie">Zombie Agents</option>
          <option value="agent_completed">Agent Completed</option>
          <option value="merge_ready">Merge Ready</option>
          <option value="merge_failed">Merge Failed</option>
          <option value="health_alert">Health Alerts</option>
        </select>
        {filterType && (
          <button
            type="button"
            onClick={() => setFilterType('')}
            className="flex items-center gap-1 rounded-md bg-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-600"
          >
            <FiX className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>

      {/* Notification List */}
      <div className="space-y-2" data-testid="notifications-list">
        {loading && notifications.length === 0 ? (
          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-8 text-center text-slate-400">
            Loading notifications...
          </div>
        ) : notifications.length === 0 ? (
          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-8 text-center">
            <FiBell className="mx-auto h-8 w-8 text-slate-500 mb-2" />
            <p className="text-slate-400">No notifications yet</p>
            <p className="text-sm text-slate-500 mt-1">
              Notifications appear when agents encounter errors, complete tasks, or require
              attention.
            </p>
          </div>
        ) : (
          notifications.map((notification) => {
            const config = getEventConfig(notification.event_type);
            const IconComponent = config.icon;
            return (
              <div
                key={notification.id}
                className={`rounded-lg border ${config.borderColor} ${config.bgColor} p-4 transition-colors hover:brightness-110`}
                data-testid={`notification-item-${notification.id}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 ${config.color}`}>
                    <IconComponent className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-slate-100">{notification.title}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${config.color} ${config.bgColor} border ${config.borderColor}`}
                        data-testid={`notification-type-${notification.id}`}
                      >
                        {config.label}
                      </span>
                      {notification.agent_name && (
                        <span className="flex items-center gap-1 rounded-full bg-slate-700/50 px-2 py-0.5 text-xs text-slate-400">
                          <FiUsers className="h-3 w-3" />
                          {notification.agent_name}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-300">{notification.body}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {(notification.event_type === 'agent_error' ||
                      notification.event_type === 'merge_failed' ||
                      notification.event_type === 'health_alert') && (
                      <button
                        type="button"
                        data-testid={`copy-error-notification-${notification.id}`}
                        onClick={() => {
                          const text = `${notification.title}: ${notification.body}`;
                          navigator.clipboard.writeText(text);
                          toast.success('Error message copied to clipboard');
                        }}
                        className="p-1 rounded text-red-400/40 hover:text-red-300 hover:bg-red-500/20 transition-colors"
                        title="Copy error message"
                      >
                        <FiCopy size={13} />
                      </button>
                    )}
                    <span
                      className="whitespace-nowrap text-xs text-slate-500"
                      data-testid={`notification-time-${notification.id}`}
                      title={formatAbsoluteTime(notification.created_at)}
                    >
                      {formatTimestamp(notification.created_at)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Clear Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-lg border border-slate-600 bg-slate-800 p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-100 mb-2">
              Clear Notification History
            </h3>
            <p className="text-sm text-slate-400 mb-4">
              This will permanently remove all {notifications.length} notification records. This
              action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="rounded-lg bg-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearHistory}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-500"
                data-testid="notifications-clear-confirm"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
