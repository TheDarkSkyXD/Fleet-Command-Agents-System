import { useCallback, useEffect, useState } from 'react';
import {
  FiAlertCircle,
  FiAlertTriangle,
  FiArrowDown,
  FiArrowUp,
  FiCheckCircle,
  FiChevronDown,
  FiChevronRight,
  FiCircle,
  FiClock,
  FiFolder,
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

type ActiveTab = 'issues' | 'groups';

export function TasksPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('issues');
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

  useEffect(() => {
    loadIssues();
  }, [loadIssues]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

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
      </div>

      {/* Issues Tab */}
      {activeTab === 'issues' && (
        <>
          {/* Filters */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Filter:
            </span>
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
                />
              ))}
            </div>
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
}: {
  issue: Issue;
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
    <div className="rounded-lg border border-slate-700 bg-slate-800 p-4 hover:border-slate-600 transition-colors">
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
