import { useCallback, useEffect, useState } from 'react';
import {
  FiAlertCircle,
  FiAlertTriangle,
  FiArrowDown,
  FiArrowUp,
  FiCheckCircle,
  FiChevronDown,
  FiCircle,
  FiClock,
  FiLoader,
  FiPlus,
  FiTrash2,
  FiUser,
  FiX,
} from 'react-icons/fi';
import type { Issue, IssuePriority, IssueStatus, IssueType } from '../../shared/types';

// ID generator (simple nanoid-like)
function generateId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `issue_${result}`;
}

const issueTypes: { value: IssueType; label: string; color: string }[] = [
  { value: 'task', label: 'Task', color: 'text-blue-400' },
  { value: 'bug', label: 'Bug', color: 'text-red-400' },
  { value: 'feature', label: 'Feature', color: 'text-green-400' },
  { value: 'research', label: 'Research', color: 'text-purple-400' },
  { value: 'spike', label: 'Spike', color: 'text-amber-400' },
];

const priorities: { value: IssuePriority; label: string; icon: typeof FiArrowUp; color: string }[] =
  [
    { value: 'critical', label: 'Critical', icon: FiAlertCircle, color: 'text-red-500' },
    { value: 'high', label: 'High', icon: FiArrowUp, color: 'text-orange-400' },
    { value: 'medium', label: 'Medium', icon: FiCircle, color: 'text-yellow-400' },
    { value: 'low', label: 'Low', icon: FiArrowDown, color: 'text-slate-400' },
  ];

const statusConfig: Record<
  IssueStatus,
  { label: string; icon: typeof FiCircle; color: string; bg: string }
> = {
  open: { label: 'Open', icon: FiCircle, color: 'text-blue-400', bg: 'bg-blue-400/10' },
  in_progress: {
    label: 'In Progress',
    icon: FiLoader,
    color: 'text-amber-400',
    bg: 'bg-amber-400/10',
  },
  closed: { label: 'Closed', icon: FiCheckCircle, color: 'text-green-400', bg: 'bg-green-400/10' },
  blocked: { label: 'Blocked', icon: FiAlertTriangle, color: 'text-red-400', bg: 'bg-red-400/10' },
};

interface CreateIssueForm {
  title: string;
  description: string;
  type: IssueType;
  priority: IssuePriority;
}

export function TasksPage() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterPriority, setFilterPriority] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimAgent, setClaimAgent] = useState('');
  const [form, setForm] = useState<CreateIssueForm>({
    title: '',
    description: '',
    type: 'task',
    priority: 'medium',
  });

  const loadIssues = useCallback(async () => {
    try {
      const filters: Record<string, string> = {};
      if (filterStatus) filters.status = filterStatus;
      if (filterPriority) filters.priority = filterPriority;
      if (filterType) filters.type = filterType;
      const result = await window.electronAPI.issueList(
        Object.keys(filters).length > 0
          ? (filters as { status?: string; priority?: string; type?: string })
          : undefined,
      );
      if (result.data) {
        setIssues(result.data);
      }
    } catch (err) {
      console.error('Failed to load issues:', err);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterPriority, filterType]);

  useEffect(() => {
    loadIssues();
  }, [loadIssues]);

  const handleCreate = async () => {
    if (!form.title.trim()) return;
    setCreating(true);
    try {
      const result = await window.electronAPI.issueCreate({
        id: generateId(),
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        type: form.type,
        priority: form.priority,
      });
      if (result.data) {
        setIssues((prev) => [result.data as Issue, ...prev]);
        setForm({ title: '', description: '', type: 'task', priority: 'medium' });
        setShowCreateForm(false);
      }
    } catch (err) {
      console.error('Failed to create issue:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await window.electronAPI.issueDelete(id);
      setIssues((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      console.error('Failed to delete issue:', err);
    }
  };

  const handleClaim = async (issueId: string) => {
    if (!claimAgent.trim()) return;
    try {
      const result = await window.electronAPI.issueClaim(issueId, claimAgent.trim());
      if (result.data) {
        setIssues((prev) => prev.map((i) => (i.id === issueId ? (result.data as Issue) : i)));
      }
      setClaimingId(null);
      setClaimAgent('');
    } catch (err) {
      console.error('Failed to claim issue:', err);
    }
  };

  const getPriorityInfo = (priority: IssuePriority) =>
    priorities.find((p) => p.value === priority) || priorities[2];

  const getTypeInfo = (type: IssueType) =>
    issueTypes.find((t) => t.value === type) || issueTypes[0];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-50">Tasks</h1>
        <button
          type="button"
          onClick={() => setShowCreateForm(true)}
          className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
        >
          <FiPlus size={16} />
          Create Issue
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Filter:</span>
        <FilterSelect
          value={filterStatus}
          onChange={setFilterStatus}
          placeholder="Status"
          options={[
            { value: '', label: 'All Statuses' },
            { value: 'open', label: 'Open' },
            { value: 'in_progress', label: 'In Progress' },
            { value: 'closed', label: 'Closed' },
            { value: 'blocked', label: 'Blocked' },
          ]}
        />
        <FilterSelect
          value={filterPriority}
          onChange={setFilterPriority}
          placeholder="Priority"
          options={[
            { value: '', label: 'All Priorities' },
            { value: 'critical', label: 'Critical' },
            { value: 'high', label: 'High' },
            { value: 'medium', label: 'Medium' },
            { value: 'low', label: 'Low' },
          ]}
        />
        <FilterSelect
          value={filterType}
          onChange={setFilterType}
          placeholder="Type"
          options={[
            { value: '', label: 'All Types' },
            { value: 'task', label: 'Task' },
            { value: 'bug', label: 'Bug' },
            { value: 'feature', label: 'Feature' },
            { value: 'research', label: 'Research' },
            { value: 'spike', label: 'Spike' },
          ]}
        />
      </div>

      {/* Create Issue Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-lg border border-slate-700 bg-slate-800 p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-50">Create Issue</h2>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
              >
                <FiX size={18} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Title */}
              <div>
                <label
                  htmlFor="issue-title"
                  className="block text-sm font-medium text-slate-300 mb-1"
                >
                  Title <span className="text-red-400">*</span>
                </label>
                <input
                  id="issue-title"
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Issue title..."
                  className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-50 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  // biome-ignore lint/a11y/noAutofocus: intentional for modal/inline input UX
                  autoFocus
                />
              </div>

              {/* Type & Priority row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="issue-type"
                    className="block text-sm font-medium text-slate-300 mb-1"
                  >
                    Type
                  </label>
                  <div className="relative">
                    <select
                      id="issue-type"
                      value={form.type}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, type: e.target.value as IssueType }))
                      }
                      className="w-full appearance-none rounded-md border border-slate-600 bg-slate-900 px-3 py-2 pr-8 text-sm text-slate-50 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      {issueTypes.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <FiChevronDown
                      className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"
                      size={14}
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="issue-priority"
                    className="block text-sm font-medium text-slate-300 mb-1"
                  >
                    Priority
                  </label>
                  <div className="relative">
                    <select
                      id="issue-priority"
                      value={form.priority}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, priority: e.target.value as IssuePriority }))
                      }
                      className="w-full appearance-none rounded-md border border-slate-600 bg-slate-900 px-3 py-2 pr-8 text-sm text-slate-50 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      {priorities.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                    <FiChevronDown
                      className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"
                      size={14}
                    />
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <label
                  htmlFor="issue-description"
                  className="block text-sm font-medium text-slate-300 mb-1"
                >
                  Description
                </label>
                <textarea
                  id="issue-description"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Describe the issue..."
                  rows={4}
                  className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-50 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="rounded-md border border-slate-600 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={!form.title.trim() || creating}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {creating ? 'Creating...' : 'Create Issue'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Issue List */}
      {loading ? (
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center text-slate-400">
          <FiLoader className="mx-auto mb-2 animate-spin" size={24} />
          <p>Loading issues...</p>
        </div>
      ) : issues.length === 0 ? (
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center text-slate-400">
          <p className="text-lg mb-2">No issues found</p>
          <p className="text-sm">Create an issue to get started</p>
        </div>
      ) : (
        <div className="space-y-2">
          {issues.map((issue) => {
            const status = statusConfig[issue.status];
            const priorityInfo = getPriorityInfo(issue.priority);
            const typeInfo = getTypeInfo(issue.type);
            const PriorityIcon = priorityInfo.icon;
            const StatusIcon = status.icon;

            return (
              <div
                key={issue.id}
                className="rounded-lg border border-slate-700 bg-slate-800 p-4 hover:border-slate-600 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {/* Status badge */}
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${status.color} ${status.bg}`}
                      >
                        <StatusIcon size={12} />
                        {status.label}
                      </span>

                      {/* Type badge */}
                      <span className={`text-xs font-medium ${typeInfo.color}`}>
                        {typeInfo.label}
                      </span>

                      {/* Priority */}
                      <span
                        className={`inline-flex items-center gap-1 text-xs ${priorityInfo.color}`}
                      >
                        <PriorityIcon size={12} />
                        {priorityInfo.label}
                      </span>
                    </div>

                    <h3 className="text-sm font-medium text-slate-50 truncate">{issue.title}</h3>

                    {issue.description && (
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                        {issue.description}
                      </p>
                    )}

                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                      {issue.assigned_agent && (
                        <span className="inline-flex items-center gap-1 text-amber-400">
                          <FiUser size={11} />
                          {issue.assigned_agent}
                        </span>
                      )}
                      <span>
                        <FiClock size={11} className="inline mr-1" />
                        {new Date(issue.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {/* Claim button (only for open issues) */}
                    {issue.status === 'open' && claimingId === issue.id && (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={claimAgent}
                          onChange={(e) => setClaimAgent(e.target.value)}
                          placeholder="Agent name"
                          className="w-28 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-slate-50 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleClaim(issue.id);
                            if (e.key === 'Escape') {
                              setClaimingId(null);
                              setClaimAgent('');
                            }
                          }}
                          // biome-ignore lint/a11y/noAutofocus: intentional for modal/inline input UX
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => handleClaim(issue.id)}
                          disabled={!claimAgent.trim()}
                          className="rounded bg-amber-600 px-2 py-1 text-xs text-white hover:bg-amber-500 disabled:opacity-50"
                        >
                          Claim
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setClaimingId(null);
                            setClaimAgent('');
                          }}
                          className="rounded p-1 text-slate-400 hover:text-slate-200"
                        >
                          <FiX size={14} />
                        </button>
                      </div>
                    )}
                    {issue.status === 'open' && claimingId !== issue.id && (
                      <button
                        type="button"
                        onClick={() => setClaimingId(issue.id)}
                        className="rounded p-1.5 text-slate-400 hover:bg-slate-700 hover:text-amber-400 transition-colors"
                        title="Claim issue for agent"
                      >
                        <FiUser size={14} />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleDelete(issue.id)}
                      className="rounded p-1.5 text-slate-400 hover:bg-slate-700 hover:text-red-400 transition-colors"
                      title="Delete issue"
                    >
                      <FiTrash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 pr-7 text-xs text-slate-300 focus:border-blue-500 focus:outline-none"
        aria-label={placeholder}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <FiChevronDown
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500"
        size={12}
      />
    </div>
  );
}
