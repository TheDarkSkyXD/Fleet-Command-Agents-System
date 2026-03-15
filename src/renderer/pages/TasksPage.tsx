import { useCallback, useEffect, useState } from 'react';
import {
  FiAlertCircle,
  FiAlertTriangle,
  FiArrowDown,
  FiArrowLeft,
  FiArrowUp,
  FiCheckCircle,
  FiChevronDown,
  FiChevronRight,
  FiCircle,
  FiClock,
  FiEdit3,
  FiFolder,
  FiHash,
  FiLink,
  FiLoader,
  FiMinus,
  FiPlus,
  FiTrash2,
  FiUser,
  FiX,
} from 'react-icons/fi';
import type { Issue, IssuePriority, IssueStatus, IssueType, TaskGroup } from '../../shared/types';

// ID generator (simple nanoid-like)
function generateId(prefix: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}_${result}`;
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

interface GroupProgress {
  total: number;
  completed: number;
  in_progress: number;
  open: number;
  blocked: number;
}

type ActiveTab = 'issues' | 'groups' | 'ready' | 'completed';

export function TasksPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('issues');
  const [issues, setIssues] = useState<Issue[]>([]);
  const [readyIssues, setReadyIssues] = useState<Issue[]>([]);
  const [readyLoading, setReadyLoading] = useState(false);
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

  // Task Groups state
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [showCreateGroupForm, setShowCreateGroupForm] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [groupProgress, setGroupProgress] = useState<Record<string, GroupProgress>>({});
  const [addingIssueToGroup, setAddingIssueToGroup] = useState<string | null>(null);
  const [selectedIssueForGroup, setSelectedIssueForGroup] = useState<string>('');
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);

  // Close with summary state
  const [closingIssueId, setClosingIssueId] = useState<string | null>(null);
  const [closeSummary, setCloseSummary] = useState('');
  const [closingInProgress, setClosingInProgress] = useState(false);
  // Completed issues
  const [completedIssues, setCompletedIssues] = useState<Issue[]>([]);
  const [completedLoading, setCompletedLoading] = useState(false);

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

  const loadGroups = useCallback(async () => {
    try {
      const result = await window.electronAPI.taskGroupList();
      if (result.data) {
        setGroups(result.data);
        // Load progress for each group
        const progressMap: Record<string, GroupProgress> = {};
        for (const group of result.data) {
          const progResult = await window.electronAPI.taskGroupGetProgress(group.id);
          if (progResult.data) {
            progressMap[group.id] = progResult.data;
          }
        }
        setGroupProgress(progressMap);
      }
    } catch (err) {
      console.error('Failed to load groups:', err);
    } finally {
      setGroupsLoading(false);
    }
  }, []);

  const loadReadyQueue = useCallback(async () => {
    setReadyLoading(true);
    try {
      const result = await window.electronAPI.issueReadyQueue();
      if (result.data) {
        setReadyIssues(result.data);
      }
    } catch (err) {
      console.error('Failed to load ready queue:', err);
    } finally {
      setReadyLoading(false);
    }
  }, []);

  useEffect(() => {
    loadIssues();
  }, [loadIssues]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    if (activeTab === 'ready') {
      loadReadyQueue();
    }
  }, [activeTab, loadReadyQueue]);

  const handleCreate = async () => {
    if (!form.title.trim()) return;
    setCreating(true);
    try {
      const result = await window.electronAPI.issueCreate({
        id: generateId('issue'),
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

  // Task Group handlers
  const handleCreateGroup = async () => {
    if (!groupName.trim()) return;
    setCreatingGroup(true);
    try {
      const result = await window.electronAPI.taskGroupCreate({
        id: generateId('group'),
        name: groupName.trim(),
      });
      if (result.data) {
        setGroups((prev) => [result.data as TaskGroup, ...prev]);
        setGroupProgress((prev) => ({
          ...prev,
          [(result.data as TaskGroup).id]: {
            total: 0,
            completed: 0,
            in_progress: 0,
            open: 0,
            blocked: 0,
          },
        }));
        setGroupName('');
        setShowCreateGroupForm(false);
      }
    } catch (err) {
      console.error('Failed to create group:', err);
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleDeleteGroup = async (id: string) => {
    try {
      await window.electronAPI.taskGroupDelete(id);
      setGroups((prev) => prev.filter((g) => g.id !== id));
      setGroupProgress((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (err) {
      console.error('Failed to delete group:', err);
    }
  };

  const handleAddIssueToGroup = async (groupId: string, issueId: string) => {
    try {
      const result = await window.electronAPI.taskGroupAddIssue(groupId, issueId);
      if (result.data) {
        setGroups((prev) => prev.map((g) => (g.id === groupId ? (result.data as TaskGroup) : g)));
        // Refresh progress
        const progResult = await window.electronAPI.taskGroupGetProgress(groupId);
        if (progResult.data) {
          setGroupProgress((prev) => ({ ...prev, [groupId]: progResult.data as GroupProgress }));
        }
        // Reload issues to reflect group_id change
        loadIssues();
      }
      setAddingIssueToGroup(null);
      setSelectedIssueForGroup('');
    } catch (err) {
      console.error('Failed to add issue to group:', err);
    }
  };

  const handleRemoveIssueFromGroup = async (groupId: string, issueId: string) => {
    try {
      const result = await window.electronAPI.taskGroupRemoveIssue(groupId, issueId);
      if (result.data) {
        setGroups((prev) => prev.map((g) => (g.id === groupId ? (result.data as TaskGroup) : g)));
        // Refresh progress
        const progResult = await window.electronAPI.taskGroupGetProgress(groupId);
        if (progResult.data) {
          setGroupProgress((prev) => ({ ...prev, [groupId]: progResult.data as GroupProgress }));
        }
        loadIssues();
      }
    } catch (err) {
      console.error('Failed to remove issue from group:', err);
    }
  };

  const getGroupMembers = (group: TaskGroup): string[] => {
    try {
      return JSON.parse(group.member_issues || '[]');
    } catch {
      return [];
    }
  };

  const getGroupMemberIssues = (group: TaskGroup): Issue[] => {
    const memberIds = getGroupMembers(group);
    return issues.filter((i) => memberIds.includes(i.id));
  };

  const getUnassignedIssues = (): Issue[] => {
    return issues.filter((i) => !i.group_id);
  };

  const getPriorityInfo = (priority: IssuePriority) =>
    priorities.find((p) => p.value === priority) || priorities[2];

  const getTypeInfo = (type: IssueType) =>
    issueTypes.find((t) => t.value === type) || issueTypes[0];

  // Load completed (closed) issues
  const loadCompletedIssues = useCallback(async () => {
    setCompletedLoading(true);
    try {
      const result = await window.electronAPI.issueList({ status: 'closed' });
      if (result.data) {
        setCompletedIssues(result.data);
      }
    } catch (err) {
      console.error('Failed to load completed issues:', err);
    } finally {
      setCompletedLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'completed') {
      loadCompletedIssues();
    }
  }, [activeTab, loadCompletedIssues]);

  // Close issue with summary
  const handleCloseWithSummary = async () => {
    if (!closingIssueId) return;
    setClosingInProgress(true);
    try {
      const result = await window.electronAPI.issueUpdate(closingIssueId, {
        status: 'closed',
        close_summary: closeSummary.trim() || null,
      });
      if (result.data) {
        setIssues((prev) =>
          prev.map((i) => (i.id === closingIssueId ? (result.data as Issue) : i)),
        );
      }
      setClosingIssueId(null);
      setCloseSummary('');
    } catch (err) {
      console.error('Failed to close issue:', err);
    } finally {
      setClosingInProgress(false);
    }
  };

  // Wrapper for status changes that intercepts "closed" to prompt for summary
  const handleStatusChangeWithClose = async (id: string, newStatus: IssueStatus) => {
    if (newStatus === 'closed') {
      setClosingIssueId(id);
      setCloseSummary('');
      return;
    }
    try {
      const result = await window.electronAPI.issueUpdate(id, { status: newStatus });
      if (result.data) {
        setIssues((prev) => prev.map((i) => (i.id === id ? (result.data as Issue) : i)));
      }
    } catch (err) {
      console.error('Failed to update issue status:', err);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-50">Tasks</h1>
        <div className="flex items-center gap-2">
          {activeTab === 'groups' && (
            <button
              type="button"
              onClick={() => setShowCreateGroupForm(true)}
              className="flex items-center gap-2 rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500 transition-colors"
              data-testid="create-group-btn"
            >
              <FiFolder size={16} />
              Create Group
            </button>
          )}
          {activeTab === 'issues' && (
            <button
              type="button"
              onClick={() => setShowCreateForm(true)}
              className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
            >
              <FiPlus size={16} />
              Create Issue
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-700">
        <button
          type="button"
          onClick={() => setActiveTab('issues')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'issues'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
          data-testid="tab-issues"
        >
          Issues ({issues.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('groups')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'groups'
              ? 'border-purple-500 text-purple-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
          data-testid="tab-groups"
        >
          Groups ({groups.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('ready')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'ready'
              ? 'border-green-500 text-green-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
          data-testid="tab-ready-queue"
        >
          Ready Queue ({readyIssues.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('completed')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'completed'
              ? 'border-green-500 text-green-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
          data-testid="tab-completed"
        >
          <span className="inline-flex items-center gap-1.5">
            <FiCheckCircle size={14} />
            Completed ({completedIssues.length})
          </span>
        </button>
      </div>

      {/* Issues Tab */}
      {activeTab === 'issues' && (
        <>
          {/* Filters */}
          <div className="flex items-center gap-3" data-testid="issue-filters">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Filter:
            </span>
            <FilterSelect
              value={filterStatus}
              onChange={setFilterStatus}
              placeholder="Status"
              testId="filter-status"
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
              testId="filter-priority"
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
              testId="filter-type"
              options={[
                { value: '', label: 'All Types' },
                { value: 'task', label: 'Task' },
                { value: 'bug', label: 'Bug' },
                { value: 'feature', label: 'Feature' },
                { value: 'research', label: 'Research' },
                { value: 'spike', label: 'Spike' },
              ]}
            />
            {(filterStatus || filterPriority || filterType) && (
              <button
                type="button"
                onClick={() => {
                  setFilterStatus('');
                  setFilterPriority('');
                  setFilterType('');
                }}
                className="flex items-center gap-1 rounded-md border border-slate-600 bg-slate-700/50 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-600 hover:text-slate-100 transition-colors"
                data-testid="clear-filters-btn"
              >
                <FiX size={12} />
                Clear Filters
              </button>
            )}
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
            <div
              className="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center text-slate-400"
              data-testid="issue-list-empty"
            >
              <p className="text-lg mb-2">
                {filterStatus || filterPriority || filterType
                  ? 'No issues match filters'
                  : 'No issues found'}
              </p>
              <p className="text-sm">
                {filterStatus || filterPriority || filterType
                  ? 'Try adjusting your filters or clear them to see all issues'
                  : 'Create an issue to get started'}
              </p>
            </div>
          ) : (
            <div className="space-y-2" data-testid="issue-list">
              {issues.map((issue) => (
                <IssueCard
                  key={issue.id}
                  issue={issue}
                  statusConfig={statusConfig}
                  getPriorityInfo={getPriorityInfo}
                  getTypeInfo={getTypeInfo}
                  claimingId={claimingId}
                  claimAgent={claimAgent}
                  setClaimAgent={setClaimAgent}
                  setClaimingId={setClaimingId}
                  handleClaim={handleClaim}
                  handleDelete={handleDelete}
                  onSelect={(id) => setSelectedIssueId(id)}
                />
              ))}
            </div>
          )}

          {/* Issue Detail Modal */}
          {selectedIssueId && (
            <IssueDetailModal
              issue={issues.find((i) => i.id === selectedIssueId) ?? null}
              statusConfig={statusConfig}
              getPriorityInfo={getPriorityInfo}
              getTypeInfo={getTypeInfo}
              onClose={() => setSelectedIssueId(null)}
              onStatusChange={handleStatusChangeWithClose}
              allIssues={issues}
              onDependenciesChange={async (id, depIds) => {
                try {
                  const result = await window.electronAPI.issueSetDependencies(id, depIds);
                  if (result.data) {
                    setIssues((prev) =>
                      prev.map((i) => (i.id === id ? (result.data as Issue) : i)),
                    );
                  }
                } catch (err) {
                  console.error('Failed to update dependencies:', err);
                }
              }}
            />
          )}
        </>
      )}

      {/* Groups Tab */}
      {activeTab === 'groups' && (
        <>
          {/* Create Group Modal */}
          {showCreateGroupForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-800 p-6 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-slate-50">Create Task Group</h2>
                  <button
                    type="button"
                    onClick={() => setShowCreateGroupForm(false)}
                    className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                  >
                    <FiX size={18} />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="group-name"
                      className="block text-sm font-medium text-slate-300 mb-1"
                    >
                      Group Name <span className="text-red-400">*</span>
                    </label>
                    <input
                      id="group-name"
                      type="text"
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      placeholder="e.g., Sprint 1 Tasks, Auth Module..."
                      className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-50 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreateGroup();
                      }}
                      // biome-ignore lint/a11y/noAutofocus: intentional for modal/inline input UX
                      autoFocus
                    />
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowCreateGroupForm(false)}
                      className="rounded-md border border-slate-600 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleCreateGroup}
                      disabled={!groupName.trim() || creatingGroup}
                      className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      data-testid="confirm-create-group"
                    >
                      {creatingGroup ? 'Creating...' : 'Create Group'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Groups List */}
          {groupsLoading ? (
            <div className="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center text-slate-400">
              <FiLoader className="mx-auto mb-2 animate-spin" size={24} />
              <p>Loading groups...</p>
            </div>
          ) : groups.length === 0 ? (
            <div className="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center text-slate-400">
              <FiFolder className="mx-auto mb-2" size={32} />
              <p className="text-lg mb-2">No task groups yet</p>
              <p className="text-sm">Create a group to batch related issues together</p>
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map((group) => {
                const progress = groupProgress[group.id];
                const isExpanded = expandedGroupId === group.id;
                const memberIssues = getGroupMemberIssues(group);
                const memberCount = getGroupMembers(group).length;
                const isCompleted = group.status === 'completed';

                return (
                  <div
                    key={group.id}
                    className={`rounded-lg border ${
                      isCompleted
                        ? 'border-green-700/50 bg-green-900/10'
                        : 'border-slate-700 bg-slate-800'
                    } transition-colors`}
                    data-testid={`group-card-${group.id}`}
                  >
                    {/* Group Header */}
                    <div className="p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <button
                            type="button"
                            onClick={() => setExpandedGroupId(isExpanded ? null : group.id)}
                            className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors"
                          >
                            {isExpanded ? (
                              <FiChevronDown size={16} />
                            ) : (
                              <FiChevronRight size={16} />
                            )}
                          </button>

                          <FiFolder
                            size={18}
                            className={isCompleted ? 'text-green-400' : 'text-purple-400'}
                          />

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-medium text-slate-50 truncate">
                                {group.name}
                              </h3>
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                  isCompleted
                                    ? 'bg-green-400/10 text-green-400'
                                    : 'bg-purple-400/10 text-purple-400'
                                }`}
                                data-testid={`group-status-${group.id}`}
                              >
                                {isCompleted ? 'Completed' : 'Active'}
                              </span>
                            </div>

                            <div className="flex items-center gap-3 mt-1">
                              <span
                                className="text-xs text-slate-400"
                                data-testid={`group-member-count-${group.id}`}
                              >
                                {memberCount} {memberCount === 1 ? 'issue' : 'issues'}
                              </span>

                              {progress && progress.total > 0 && (
                                <>
                                  <span className="text-xs text-slate-500">|</span>
                                  <span
                                    className="text-xs text-green-400"
                                    data-testid={`group-progress-completed-${group.id}`}
                                  >
                                    {progress.completed} completed
                                  </span>
                                  {progress.in_progress > 0 && (
                                    <span
                                      className="text-xs text-amber-400"
                                      data-testid={`group-progress-inprogress-${group.id}`}
                                    >
                                      {progress.in_progress} in progress
                                    </span>
                                  )}
                                  {progress.open > 0 && (
                                    <span className="text-xs text-blue-400">
                                      {progress.open} open
                                    </span>
                                  )}
                                  {progress.blocked > 0 && (
                                    <span className="text-xs text-red-400">
                                      {progress.blocked} blocked
                                    </span>
                                  )}
                                </>
                              )}
                            </div>

                            {/* Progress bar */}
                            {progress && progress.total > 0 && (
                              <div className="mt-2 h-1.5 rounded-full bg-slate-700 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-green-500 transition-all duration-300"
                                  style={{
                                    width: `${(progress.completed / progress.total) * 100}%`,
                                  }}
                                  data-testid={`group-progress-bar-${group.id}`}
                                />
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          {!isCompleted && (
                            <button
                              type="button"
                              onClick={() => setAddingIssueToGroup(group.id)}
                              className="rounded p-1.5 text-slate-400 hover:bg-slate-700 hover:text-purple-400 transition-colors"
                              title="Add issue to group"
                              data-testid={`add-issue-to-group-${group.id}`}
                            >
                              <FiLink size={14} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteGroup(group.id)}
                            className="rounded p-1.5 text-slate-400 hover:bg-slate-700 hover:text-red-400 transition-colors"
                            title="Delete group"
                          >
                            <FiTrash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Add Issue to Group UI */}
                      {addingIssueToGroup === group.id && (
                        <div className="mt-3 flex items-center gap-2 pl-10">
                          <div className="relative flex-1">
                            <select
                              value={selectedIssueForGroup}
                              onChange={(e) => setSelectedIssueForGroup(e.target.value)}
                              className="w-full appearance-none rounded-md border border-slate-600 bg-slate-900 px-3 py-1.5 pr-8 text-xs text-slate-300 focus:border-purple-500 focus:outline-none"
                              aria-label="Select issue to add"
                            >
                              <option value="">Select an issue...</option>
                              {getUnassignedIssues().map((issue) => (
                                <option key={issue.id} value={issue.id}>
                                  {issue.title} ({issue.status})
                                </option>
                              ))}
                            </select>
                            <FiChevronDown
                              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500"
                              size={12}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (selectedIssueForGroup) {
                                handleAddIssueToGroup(group.id, selectedIssueForGroup);
                              }
                            }}
                            disabled={!selectedIssueForGroup}
                            className="rounded bg-purple-600 px-3 py-1.5 text-xs text-white hover:bg-purple-500 disabled:opacity-50"
                          >
                            Add
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAddingIssueToGroup(null);
                              setSelectedIssueForGroup('');
                            }}
                            className="rounded p-1 text-slate-400 hover:text-slate-200"
                          >
                            <FiX size={14} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Expanded: Member Issues */}
                    {isExpanded && (
                      <div className="border-t border-slate-700/50 p-3 pl-12 space-y-1.5">
                        {memberIssues.length === 0 ? (
                          <p className="text-xs text-slate-500 py-2">
                            No issues in this group yet. Click the link icon to add issues.
                          </p>
                        ) : (
                          memberIssues.map((issue) => {
                            const status = statusConfig[issue.status];
                            const StatusIcon = status.icon;
                            return (
                              <div
                                key={issue.id}
                                className="flex items-center justify-between gap-2 rounded px-2 py-1.5 hover:bg-slate-700/50"
                              >
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <span
                                    className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs ${status.color} ${status.bg}`}
                                  >
                                    <StatusIcon size={10} />
                                    {status.label}
                                  </span>
                                  <span className="text-xs text-slate-200 truncate">
                                    {issue.title}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveIssueFromGroup(group.id, issue.id)}
                                  className="rounded p-1 text-slate-500 hover:text-red-400 transition-colors"
                                  title="Remove from group"
                                >
                                  <FiMinus size={12} />
                                </button>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
      {/* Ready Queue Tab */}
      {activeTab === 'ready' && (
        <>
          <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3">
            <p className="text-sm text-green-300">
              <FiCheckCircle className="inline mr-1.5 -mt-0.5" size={14} />
              Ready Queue shows issues with no unresolved blocking dependencies — available to work
              on now.
            </p>
          </div>

          {readyLoading ? (
            <div className="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center text-slate-400">
              <FiLoader className="mx-auto mb-2 animate-spin" size={24} />
              <p>Loading ready queue...</p>
            </div>
          ) : readyIssues.length === 0 ? (
            <div
              className="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center text-slate-400"
              data-testid="ready-queue-empty"
            >
              <p className="text-lg mb-2">No ready issues</p>
              <p className="text-sm">
                All open issues have unresolved dependencies, or there are no open issues
              </p>
            </div>
          ) : (
            <div className="space-y-2" data-testid="ready-queue-list">
              {readyIssues.map((issue) => (
                <IssueCard
                  key={issue.id}
                  issue={issue}
                  statusConfig={statusConfig}
                  getPriorityInfo={getPriorityInfo}
                  getTypeInfo={getTypeInfo}
                  claimingId={claimingId}
                  claimAgent={claimAgent}
                  setClaimAgent={setClaimAgent}
                  setClaimingId={setClaimingId}
                  handleClaim={handleClaim}
                  handleDelete={handleDelete}
                  onSelect={(id) => setSelectedIssueId(id)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Completed Tab */}
      {activeTab === 'completed' && (
        <>
          <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3">
            <p className="text-sm text-green-300">
              <FiCheckCircle className="inline mr-1.5 -mt-0.5" size={14} />
              Completed issues — closed with a summary of what was done.
            </p>
          </div>

          {completedLoading ? (
            <div className="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center text-slate-400">
              <FiLoader className="mx-auto mb-2 animate-spin" size={24} />
              <p>Loading completed issues...</p>
            </div>
          ) : completedIssues.length === 0 ? (
            <div
              className="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center text-slate-400"
              data-testid="completed-empty"
            >
              <p className="text-lg mb-2">No completed issues</p>
              <p className="text-sm">Issues will appear here once they are closed with a summary</p>
            </div>
          ) : (
            <div className="space-y-2" data-testid="completed-issues-list">
              {completedIssues.map((issue) => {
                const typeInfo = getTypeInfo(issue.type);
                const priorityInfo = getPriorityInfo(issue.priority);
                const PriorityIcon = priorityInfo.icon;
                return (
                  <div
                    key={issue.id}
                    className="rounded-lg border border-slate-700 bg-slate-800 p-4 hover:border-green-500/50 transition-colors"
                    data-testid={`completed-issue-${issue.id}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <FiCheckCircle size={16} className="text-green-400 flex-shrink-0" />
                          <h3 className="font-medium text-slate-100 truncate">{issue.title}</h3>
                        </div>
                        {issue.close_summary && (
                          <div
                            className="mt-2 ml-6 rounded border border-green-500/20 bg-green-500/5 px-3 py-2"
                            data-testid={`close-summary-${issue.id}`}
                          >
                            <span className="text-xs font-medium text-green-400 uppercase tracking-wider block mb-1">
                              Close Summary
                            </span>
                            <p className="text-sm text-slate-300 whitespace-pre-wrap">
                              {issue.close_summary}
                            </p>
                          </div>
                        )}
                        <div className="flex items-center gap-3 mt-2 ml-6 text-xs text-slate-500">
                          <span className={typeInfo.color}>{typeInfo.label}</span>
                          <span className={`inline-flex items-center gap-1 ${priorityInfo.color}`}>
                            <PriorityIcon size={11} />
                            {priorityInfo.label}
                          </span>
                          {issue.assigned_agent && (
                            <span className="inline-flex items-center gap-1 text-amber-400">
                              <FiUser size={11} />
                              {issue.assigned_agent}
                            </span>
                          )}
                          {issue.closed_at && (
                            <span className="inline-flex items-center gap-1 text-green-400">
                              <FiClock size={11} />
                              Closed: {new Date(issue.closed_at).toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Close Issue with Summary Dialog */}
      {closingIssueId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div
            className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-800 p-6 shadow-xl"
            data-testid="close-issue-dialog"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-50">Close Issue</h2>
              <button
                type="button"
                onClick={() => {
                  setClosingIssueId(null);
                  setCloseSummary('');
                }}
                className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
              >
                <FiX size={18} />
              </button>
            </div>
            <div className="mb-2">
              <p className="text-sm text-slate-400">
                Closing:{' '}
                <span className="text-slate-200 font-medium">
                  {issues.find((i) => i.id === closingIssueId)?.title || closingIssueId}
                </span>
              </p>
            </div>
            <div className="space-y-4">
              <div>
                {/* biome-ignore lint/a11y/noLabelWithoutControl: textarea follows */}
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Summary / Reason <span className="text-slate-500">(optional)</span>
                </label>
                <textarea
                  value={closeSummary}
                  onChange={(e) => setCloseSummary(e.target.value)}
                  placeholder="Describe what was done or why this issue is being closed..."
                  className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none resize-y"
                  rows={4}
                  data-testid="close-summary-input"
                />
              </div>
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setClosingIssueId(null);
                    setCloseSummary('');
                  }}
                  className="rounded-md px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCloseWithSummary}
                  disabled={closingInProgress}
                  className="flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50 transition-colors"
                  data-testid="confirm-close-btn"
                >
                  {closingInProgress ? (
                    <FiLoader size={14} className="animate-spin" />
                  ) : (
                    <FiCheckCircle size={14} />
                  )}
                  Close Issue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function IssueCard({
  issue,
  statusConfig: statuses,
  getPriorityInfo,
  getTypeInfo,
  claimingId,
  claimAgent,
  setClaimAgent,
  setClaimingId,
  handleClaim,
  handleDelete,
  onSelect,
}: {
  issue: Issue;
  onSelect: (id: string) => void;
  statusConfig: Record<
    IssueStatus,
    { label: string; icon: typeof FiCircle; color: string; bg: string }
  >;
  getPriorityInfo: (p: IssuePriority) => {
    value: IssuePriority;
    label: string;
    icon: typeof FiArrowUp;
    color: string;
  };
  getTypeInfo: (t: IssueType) => { value: IssueType; label: string; color: string };
  claimingId: string | null;
  claimAgent: string;
  setClaimAgent: (val: string) => void;
  setClaimingId: (val: string | null) => void;
  handleClaim: (issueId: string) => void;
  handleDelete: (id: string) => void;
}) {
  const status = statuses[issue.status];
  const priorityInfo = getPriorityInfo(issue.priority);
  const typeInfo = getTypeInfo(issue.type);
  const PriorityIcon = priorityInfo.icon;
  const StatusIcon = status.icon;

  return (
    <div
      className="rounded-lg border border-slate-700 bg-slate-800 p-4 hover:border-blue-500/50 cursor-pointer transition-colors"
      onClick={() => onSelect(issue.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect(issue.id);
      }}
      data-testid={`issue-card-${issue.id}`}
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
            <span className={`text-xs font-medium ${typeInfo.color}`}>{typeInfo.label}</span>

            {/* Priority */}
            <span className={`inline-flex items-center gap-1 text-xs ${priorityInfo.color}`}>
              <PriorityIcon size={12} />
              {priorityInfo.label}
            </span>

            {/* Group badge */}
            {issue.group_id && (
              <span className="inline-flex items-center gap-1 text-xs text-purple-400">
                <FiFolder size={10} />
                Grouped
              </span>
            )}
          </div>

          <h3 className="text-sm font-medium text-slate-50 truncate">{issue.title}</h3>

          {issue.description && (
            <p className="text-xs text-slate-400 mt-1 line-clamp-2">{issue.description}</p>
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

        {/* biome-ignore lint/a11y/useKeyWithClickEvents: parent handles keyboard */}
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
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
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
  testId,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
  testId?: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 pr-7 text-xs text-slate-300 focus:border-blue-500 focus:outline-none"
        aria-label={placeholder}
        data-testid={testId}
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

function DependencyManager({
  issue,
  allIssues,
  statusConfig: statuses,
  onDependenciesChange,
}: {
  issue: Issue;
  allIssues: Issue[];
  statusConfig: Record<
    IssueStatus,
    { label: string; icon: typeof FiCircle; color: string; bg: string }
  >;
  onDependenciesChange: (id: string, depIds: string[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const deps: string[] = (() => {
    try {
      return JSON.parse(issue.dependencies || '[]');
    } catch {
      return [];
    }
  })();

  const depIssues = deps
    .map((depId) => allIssues.find((i) => i.id === depId))
    .filter(Boolean) as Issue[];

  const availableIssues = allIssues.filter((i) => i.id !== issue.id && !deps.includes(i.id));

  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-900/50 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
          Dependencies ({deps.length})
        </span>
        <button
          type="button"
          onClick={() => setAdding(!adding)}
          className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors"
          title="Add dependency"
        >
          {adding ? <FiX size={14} /> : <FiPlus size={14} />}
        </button>
      </div>

      {adding && availableIssues.length > 0 && (
        <div className="mb-3 max-h-32 overflow-y-auto rounded border border-slate-600 bg-slate-800">
          {availableIssues.map((i) => {
            const st = statuses[i.status];
            return (
              <button
                key={i.id}
                type="button"
                onClick={() => {
                  onDependenciesChange(issue.id, [...deps, i.id]);
                  setAdding(false);
                }}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-700 transition-colors flex items-center gap-2"
              >
                <st.icon size={12} className={st.color} />
                <span className="text-slate-300 truncate">{i.title}</span>
              </button>
            );
          })}
        </div>
      )}

      {depIssues.length === 0 ? (
        <p className="text-sm text-slate-500 italic">No dependencies</p>
      ) : (
        <div className="space-y-1">
          {depIssues.map((dep) => {
            const st = statuses[dep.status];
            const StIcon = st.icon;
            return (
              <div
                key={dep.id}
                className="flex items-center justify-between rounded px-2 py-1 bg-slate-800/50"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <StIcon size={12} className={st.color} />
                  <span className="text-sm text-slate-300 truncate">{dep.title}</span>
                  <span className={`text-[10px] ${st.color}`}>{st.label}</span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onDependenciesChange(
                      issue.id,
                      deps.filter((d) => d !== dep.id),
                    )
                  }
                  className="rounded p-0.5 text-slate-500 hover:text-red-400 transition-colors"
                  title="Remove dependency"
                >
                  <FiX size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function IssueDetailModal({
  issue,
  statusConfig: statuses,
  getPriorityInfo,
  getTypeInfo,
  onClose,
  onStatusChange,
  allIssues,
  onDependenciesChange,
}: {
  issue: Issue | null;
  statusConfig: Record<
    IssueStatus,
    { label: string; icon: typeof FiCircle; color: string; bg: string }
  >;
  getPriorityInfo: (p: IssuePriority) => {
    value: IssuePriority;
    label: string;
    icon: typeof FiArrowUp;
    color: string;
  };
  getTypeInfo: (t: IssueType) => { value: IssueType; label: string; color: string };
  onClose: () => void;
  onStatusChange: (id: string, status: IssueStatus) => void;
  allIssues: Issue[];
  onDependenciesChange: (id: string, depIds: string[]) => void;
}) {
  if (!issue) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="w-full max-w-2xl rounded-lg border border-slate-700 bg-slate-800 p-6 shadow-xl">
          <p className="text-slate-400 text-center">Issue not found</p>
          <button
            type="button"
            onClick={onClose}
            className="mt-4 mx-auto block rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const status = statuses[issue.status];
  const priorityInfo = getPriorityInfo(issue.priority);
  const typeInfo = getTypeInfo(issue.type);
  const PriorityIcon = priorityInfo.icon;
  const StatusIcon = status.icon;

  const allStatuses: IssueStatus[] = ['open', 'in_progress', 'closed', 'blocked'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="w-full max-w-2xl rounded-lg border border-slate-700 bg-slate-800 shadow-xl overflow-hidden"
        data-testid="issue-detail-modal"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1.5 text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors"
              title="Back to list"
            >
              <FiArrowLeft size={18} />
            </button>
            <h2 className="text-lg font-semibold text-slate-50">Issue Details</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors"
          >
            <FiX size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Title */}
          <div>
            <h3 className="text-xl font-semibold text-slate-50" data-testid="issue-detail-title">
              {issue.title}
            </h3>
            <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
              <FiHash size={11} />
              <span className="font-mono">{issue.id}</span>
            </div>
          </div>

          {/* Metadata grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* Status */}
            <div className="rounded-lg border border-slate-700/50 bg-slate-900/50 p-4">
              <span className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                Status
              </span>
              <div className="flex items-center gap-2" data-testid="issue-detail-status">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium ${status.color} ${status.bg}`}
                >
                  <StatusIcon size={14} />
                  {status.label}
                </span>
              </div>
              {/* Quick status change */}
              <div className="flex items-center gap-1.5 mt-3">
                {allStatuses
                  .filter((s) => s !== issue.status)
                  .map((s) => {
                    const sConf = statuses[s];
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => onStatusChange(issue.id, s)}
                        className={`rounded px-2 py-0.5 text-[10px] border border-slate-700 hover:border-slate-500 ${sConf.color} transition-colors`}
                        title={`Change to ${sConf.label}`}
                      >
                        {sConf.label}
                      </button>
                    );
                  })}
              </div>
            </div>

            {/* Type */}
            <div className="rounded-lg border border-slate-700/50 bg-slate-900/50 p-4">
              <span className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                Type
              </span>
              <span
                className={`text-sm font-medium ${typeInfo.color}`}
                data-testid="issue-detail-type"
              >
                {typeInfo.label}
              </span>
            </div>

            {/* Priority */}
            <div className="rounded-lg border border-slate-700/50 bg-slate-900/50 p-4">
              <span className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                Priority
              </span>
              <div className="flex items-center gap-2" data-testid="issue-detail-priority">
                <PriorityIcon size={16} className={priorityInfo.color} />
                <span className={`text-sm font-medium ${priorityInfo.color}`}>
                  {priorityInfo.label}
                </span>
              </div>
            </div>

            {/* Assigned Agent */}
            <div className="rounded-lg border border-slate-700/50 bg-slate-900/50 p-4">
              <span className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                Assigned Agent
              </span>
              <div data-testid="issue-detail-assigned-agent">
                {issue.assigned_agent ? (
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-400">
                    <FiUser size={14} />
                    {issue.assigned_agent}
                  </span>
                ) : (
                  <span className="text-sm text-slate-500 italic">Unassigned</span>
                )}
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="rounded-lg border border-slate-700/50 bg-slate-900/50 p-4">
            <span className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
              Description
            </span>
            <div data-testid="issue-detail-description">
              {issue.description ? (
                <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
                  {issue.description}
                </p>
              ) : (
                <p className="text-sm text-slate-500 italic">No description provided</p>
              )}
            </div>
          </div>

          {/* Close Summary (shown when issue is closed) */}
          {issue.status === 'closed' && issue.close_summary && (
            <div
              className="rounded-lg border border-green-500/20 bg-green-500/5 p-4"
              data-testid="issue-detail-close-summary"
            >
              <span className="block text-xs font-medium text-green-400 uppercase tracking-wider mb-2">
                Close Summary
              </span>
              <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
                {issue.close_summary}
              </p>
            </div>
          )}

          {/* Dependencies */}
          <DependencyManager
            issue={issue}
            allIssues={allIssues}
            statusConfig={statuses}
            onDependenciesChange={onDependenciesChange}
          />

          {/* Timestamps & metadata footer */}
          <div className="flex items-center justify-between text-xs text-slate-500 border-t border-slate-700/50 pt-4">
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1">
                <FiClock size={11} />
                Created: {new Date(issue.created_at).toLocaleString()}
              </span>
              {issue.updated_at && issue.updated_at !== issue.created_at && (
                <span className="inline-flex items-center gap-1">
                  <FiEdit3 size={11} />
                  Updated: {new Date(issue.updated_at).toLocaleString()}
                </span>
              )}
              {issue.closed_at && (
                <span className="inline-flex items-center gap-1 text-green-400">
                  <FiCheckCircle size={11} />
                  Closed: {new Date(issue.closed_at).toLocaleString()}
                </span>
              )}
            </div>
            {issue.group_id && (
              <span className="inline-flex items-center gap-1 text-purple-400">
                <FiFolder size={11} />
                Grouped
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
