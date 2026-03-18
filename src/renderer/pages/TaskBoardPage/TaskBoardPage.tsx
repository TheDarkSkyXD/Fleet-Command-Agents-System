import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FiCheckCircle,
  FiChevronDown,
  FiChevronRight,
  FiClock,
  FiColumns,
  FiEdit3,
  FiFolder,
  FiLink,
  FiList,
  FiLoader,
  FiMinus,
  FiPlus,
  FiTrash2,
  FiUser,
  FiX,
} from 'react-icons/fi';
import { toast } from 'sonner';
import type { Issue, IssuePriority, IssueStatus, IssueType, TaskGroup } from '../../../shared/types';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Textarea } from '../../components/ui/textarea';
import { useFormDirtyTracking } from '../../hooks/useUnsavedChanges';
import { formatDateTime } from '../../lib/dateFormatting';
import { handleIpcError } from '../../lib/ipcErrorHandler';
import { useFilterStore } from '../../stores/filterStore';
import {
  FilterSelect,
  IssueCard,
  IssueDetailModal,
  KanbanBoard,
  generateId,
  issueTypes,
  priorities,
  statusConfig,
} from './components';
import type { ActiveTab, CreateIssueForm, GroupProgress, ViewMode } from './components';
import { Tooltip } from '../../components/Tooltip';
import './TaskBoardPage.css';

export function TaskBoardPage() {
  const { tasksFilters, setTasksFilters } = useFilterStore();
  const [activeTab, setActiveTab] = useState<ActiveTab>(tasksFilters.activeTab);
  const [viewMode, setViewMode] = useState<ViewMode>(tasksFilters.viewMode);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [readyIssues, setReadyIssues] = useState<Issue[]>([]);
  const [readyLoading, setReadyLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>(tasksFilters.filterStatus);
  const [filterPriority, setFilterPriority] = useState<string>(tasksFilters.filterPriority);
  const [filterType, setFilterType] = useState<string>(tasksFilters.filterType);

  // Sync filter state back to store on changes
  useEffect(() => {
    setTasksFilters({ activeTab, viewMode, filterStatus, filterPriority, filterType });
  }, [activeTab, viewMode, filterStatus, filterPriority, filterType, setTasksFilters]);
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
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renameGroupName, setRenameGroupName] = useState('');

  // Form validation error state
  const [issueTitleError, setIssueTitleError] = useState<string | null>(null);
  const [groupNameError, setGroupNameError] = useState<string | null>(null);

  // Track form dirty state for beforeunload warning
  const isIssueFormDirty = useMemo(
    () => showCreateForm && (form.title.trim() !== '' || form.description.trim() !== ''),
    [showCreateForm, form.title, form.description],
  );
  useFormDirtyTracking('task-create-issue-form', 'Create Issue Form', isIssueFormDirty);

  const isGroupFormDirty = useMemo(
    () => showCreateGroupForm && groupName.trim() !== '',
    [showCreateGroupForm, groupName],
  );
  useFormDirtyTracking('task-create-group-form', 'Create Group Form', isGroupFormDirty);

  // Close with summary state
  const [closingIssueId, setClosingIssueId] = useState<string | null>(null);
  const [closeSummary, setCloseSummary] = useState('');
  const [closingInProgress, setClosingInProgress] = useState(false);
  // Guards against rapid delete/stop clicks
  const deleteLockRef = useRef<Set<string>>(new Set());
  const deleteGroupLockRef = useRef<Set<string>>(new Set());
  // Guard against form resubmission (back+resubmit prevention)
  const createLockRef = useRef(false);
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
      handleIpcError(err, { context: 'loading issues', retry: () => loadIssues() });
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
    if (!form.title.trim()) {
      setIssueTitleError('Title is required');
      return;
    }
    setIssueTitleError(null);
    // Ref-based guard prevents duplicate submissions (back+resubmit, rapid clicks)
    if (createLockRef.current) return;
    createLockRef.current = true;
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
        toast.success(`Issue "${(result.data as Issue).title}" created`);
      }
    } catch (err) {
      handleIpcError(err, { context: 'creating issue' });
    } finally {
      setCreating(false);
      createLockRef.current = false;
    }
  };

  const handleDelete = async (id: string) => {
    // Guard against rapid delete clicks on same item
    if (deleteLockRef.current.has(id)) return;
    deleteLockRef.current.add(id);
    try {
      // Find the issue before deletion to check group membership
      const deletedIssue = issues.find((i) => i.id === id);
      await window.electronAPI.issueDelete(id);
      setIssues((prev) => prev.filter((i) => i.id !== id));
      // Also remove from ready queue if present
      setReadyIssues((prev) => prev.filter((i) => i.id !== id));
      // Close detail modal if the deleted issue was being viewed
      if (selectedIssueId === id) {
        setSelectedIssueId(null);
      }
      // Refresh group progress if the deleted issue belonged to a group
      if (deletedIssue?.group_id) {
        const gid = deletedIssue.group_id;
        const progResult = await window.electronAPI.taskGroupGetProgress(gid);
        if (progResult.data) {
          setGroupProgress((prev) => ({ ...prev, [gid]: progResult.data as GroupProgress }));
        }
      }
    } catch (err) {
      handleIpcError(err, { context: 'deleting issue' });
    } finally {
      deleteLockRef.current.delete(id);
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
      handleIpcError(err, { context: 'claiming issue' });
    }
  };

  // Task Group handlers
  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      setGroupNameError('Group name is required');
      return;
    }
    setGroupNameError(null);
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
      toast.error('Failed to create group');
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleDeleteGroup = async (id: string) => {
    // Guard against rapid delete clicks on same group
    if (deleteGroupLockRef.current.has(id)) return;
    deleteGroupLockRef.current.add(id);
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
      toast.error('Failed to delete group');
    } finally {
      deleteGroupLockRef.current.delete(id);
    }
  };

  const handleRenameGroup = async (id: string, newName: string) => {
    if (!newName.trim()) return;
    try {
      const result = await window.electronAPI.taskGroupUpdate(id, { name: newName.trim() });
      if (result.data) {
        setGroups((prev) => prev.map((g) => (g.id === id ? (result.data as TaskGroup) : g)));
        toast.success(`Group renamed to "${newName.trim()}"`);
      }
      setRenamingGroupId(null);
      setRenameGroupName('');
    } catch (err) {
      console.error('Failed to rename group:', err);
      toast.error('Failed to rename group');
    }
  };

  const handleCloseGroup = async (id: string) => {
    try {
      const result = await window.electronAPI.taskGroupUpdate(id, { status: 'completed' });
      if (result.data) {
        setGroups((prev) => prev.map((g) => (g.id === id ? (result.data as TaskGroup) : g)));
        toast.success('Group closed');
      }
    } catch (err) {
      console.error('Failed to close group:', err);
      toast.error('Failed to close group');
    }
  };

  const handleReopenGroup = async (id: string) => {
    try {
      const result = await window.electronAPI.taskGroupUpdate(id, { status: 'active' });
      if (result.data) {
        setGroups((prev) => prev.map((g) => (g.id === id ? (result.data as TaskGroup) : g)));
        toast.success('Group reopened');
      }
    } catch (err) {
      console.error('Failed to reopen group:', err);
      toast.error('Failed to reopen group');
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
      toast.error('Failed to add issue to group');
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
      toast.error('Failed to remove issue from group');
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
      toast.error('Failed to close issue');
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
      toast.error('Failed to update issue status');
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-50">Task Board</h1>
          {issues.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                if (!window.confirm(`Delete all ${issues.length} tasks and ${groups.length} groups? This cannot be undone.`)) return;
                try {
                  for (const issue of issues) {
                    await window.electronAPI.issueDelete(issue.id);
                  }
                  for (const group of groups) {
                    await window.electronAPI.taskGroupDelete(group.id);
                  }
                  setIssues([]);
                  setGroups([]);
                  setCompletedIssues([]);
                  toast.success('All tasks cleared');
                } catch {
                  toast.error('Failed to clear tasks');
                }
              }}
              className="bg-red-600/15 text-red-400 border border-red-500/25 hover:bg-red-600/25 hover:text-red-300"
            >
              <FiTrash2 size={14} />
              Clear All
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'groups' && (
            <Button
              onClick={() => setShowCreateGroupForm(true)}
              className="bg-blue-600/15 text-blue-400 border border-blue-500/25 hover:bg-blue-600/25 hover:text-blue-300"
              data-testid="create-group-btn"
            >
              <FiFolder size={16} />
              Create Group
            </Button>
          )}
          {activeTab === 'issues' && (
            <div className="flex items-center gap-2">
              {/* View mode toggle */}
              <div
                className="flex items-center rounded-md border border-slate-700 bg-slate-800"
                data-testid="view-mode-toggle"
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setViewMode('list')}
                  className={`rounded-r-none ${
                    viewMode === 'list'
                      ? 'bg-blue-600/15 text-blue-400 border border-blue-500/25 hover:bg-blue-600/25 hover:text-blue-300'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                  }`}
                  title="List view"
                  data-testid="view-mode-list"
                >
                  <FiList size={16} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setViewMode('kanban')}
                  className={`rounded-l-none ${
                    viewMode === 'kanban'
                      ? 'bg-blue-600/15 text-blue-400 border border-blue-500/25 hover:bg-blue-600/25 hover:text-blue-300'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                  }`}
                  title="Kanban board"
                  data-testid="view-mode-kanban"
                >
                  <FiColumns size={16} />
                </Button>
              </div>
              <Button
                onClick={() => setShowCreateForm(true)}
                className="bg-blue-600/15 text-blue-400 border border-blue-500/25 hover:bg-blue-600/25 hover:text-blue-300"
              >
                <FiPlus size={16} />
                Create Issue
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as ActiveTab)}>
        <TabsList className="bg-slate-800/50 border border-slate-700">
          <TabsTrigger value="issues" data-testid="tab-issues">
            Issues ({issues.length})
          </TabsTrigger>
          <TabsTrigger value="groups" data-testid="tab-groups">
            Groups ({groups.length})
          </TabsTrigger>
          <TabsTrigger value="ready" data-testid="tab-ready-queue">
            Ready Queue ({readyIssues.length})
          </TabsTrigger>
          <TabsTrigger value="completed" data-testid="tab-completed">
            <span className="inline-flex items-center gap-1.5">
              <FiCheckCircle size={14} />
              Done ({completedIssues.length})
            </span>
          </TabsTrigger>
        </TabsList>

        {/* Issues Tab */}
        <TabsContent value="issues">
          {/* Filters */}
          <div className="flex items-center gap-3 mb-4" data-testid="issue-filters">
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
                { value: 'closed', label: 'Done' },
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFilterStatus('');
                  setFilterPriority('');
                  setFilterType('');
                }}
                className="border-slate-600 bg-slate-700/50 text-slate-300 hover:bg-slate-600 hover:text-slate-100"
                data-testid="clear-filters-btn"
              >
                <FiX size={12} />
                Clear Filters
              </Button>
            )}
          </div>

          {/* Create Issue Modal */}
          <Dialog open={showCreateForm} onOpenChange={setShowCreateForm}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create Issue</DialogTitle>
                <DialogDescription className="sr-only">Create a new issue</DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Title */}
                <div>
                  <Label htmlFor="issue-title" className="mb-1 block text-slate-300">
                    Title <span className="text-red-400">*</span>
                  </Label>
                  <Input
                    id="issue-title"
                    type="text"
                    value={form.title}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, title: e.target.value }));
                      if (e.target.value.trim()) setIssueTitleError(null);
                    }}
                    placeholder="Issue title..."
                    className={issueTitleError ? 'border-red-500 focus-visible:ring-red-500' : ''}
                    // biome-ignore lint/a11y/noAutofocus: intentional for modal/inline input UX
                    autoFocus
                  />
                  {issueTitleError && (
                    <p className="mt-1 text-xs text-red-400" data-testid="issue-title-error">
                      {issueTitleError}
                    </p>
                  )}
                </div>

                {/* Type & Priority row */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="issue-type" className="mb-1 block text-slate-300">
                      Type
                    </Label>
                    <Select
                      value={form.type}
                      onValueChange={(val) =>
                        setForm((f) => ({ ...f, type: val as IssueType }))
                      }
                    >
                      <SelectTrigger id="issue-type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {issueTypes.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="issue-priority" className="mb-1 block text-slate-300">
                      Priority
                    </Label>
                    <Select
                      value={form.priority}
                      onValueChange={(val) =>
                        setForm((f) => ({ ...f, priority: val as IssuePriority }))
                      }
                    >
                      <SelectTrigger id="issue-priority">
                        <SelectValue placeholder="Select priority" />
                      </SelectTrigger>
                      <SelectContent>
                        {priorities.map((p) => (
                          <SelectItem key={p.value} value={p.value}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <Label htmlFor="issue-description" className="mb-1 block text-slate-300">
                    Description
                  </Label>
                  <Textarea
                    id="issue-description"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Describe the issue..."
                    rows={4}
                    className="resize-none"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowCreateForm(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={!form.title.trim() || creating}
                  className="bg-blue-600/15 text-blue-400 border border-blue-500/25 hover:bg-blue-600/25 hover:text-blue-300"
                >
                  {creating ? (
                    <>
                      <FiLoader size={14} className="animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Issue'
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Issue Views */}
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
          ) : viewMode === 'kanban' ? (
            <KanbanBoard
              issues={issues}
              statusConfig={statusConfig}
              getPriorityInfo={getPriorityInfo}
              getTypeInfo={getTypeInfo}
              onStatusChange={handleStatusChangeWithClose}
              onSelect={(id) => setSelectedIssueId(id)}
            />
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
              onDelete={async (id) => {
                try {
                  const result = await window.electronAPI.issueDelete(id);
                  if (result.data) {
                    setIssues((prev) => prev.filter((i) => i.id !== id));
                    toast.success('Task deleted');
                  } else if (result.error) {
                    toast.error(`Failed to delete: ${result.error}`);
                  }
                } catch (err) {
                  toast.error('Failed to delete task');
                }
              }}
              onAssignAgent={async (issueId, agentName) => {
                try {
                  const issue = issues.find((i) => i.id === issueId);
                  const result = await window.electronAPI.issueUpdate(issueId, {
                    assigned_agent: agentName,
                    ...(agentName ? { status: 'in_progress' } : {}),
                  });
                  if (result.data) {
                    setIssues((prev) =>
                      prev.map((i) => (i.id === issueId ? (result.data as Issue) : i)),
                    );
                    if (agentName && issue) {
                      // 1. Send mail for audit trail and agent-to-agent communication
                      await window.electronAPI.mailSend({
                        from_agent: 'operator',
                        to_agent: agentName,
                        subject: `Task assigned: ${issue.title}`,
                        body: `You have been assigned a new task.\n\nTask ID: ${issueId}\nTitle: ${issue.title}\nPriority: ${issue.priority}\nType: ${issue.type}\n\n${issue.description || 'No additional description.'}\n\nPlease begin working on this task.`,
                        type: 'assign',
                        priority: issue.priority === 'critical' ? 'high' : 'normal',
                      });

                      // 2. Write task directly to agent terminal for immediate action
                      const agentSessions = await window.electronAPI.agentList();
                      const agentSession = agentSessions.data?.find(
                        (s: { agent_name: string; state: string }) =>
                          s.agent_name === agentName && s.state !== 'completed'
                      );
                      if (agentSession) {
                        const taskPrompt = [
                          issue.title,
                          '',
                          issue.description || '',
                          '',
                          `Task ID: ${issueId}`,
                          `Priority: ${issue.priority}`,
                          `Type: ${issue.type}`,
                        ]
                          .filter(Boolean)
                          .join('\n');

                        await window.electronAPI.agentWrite(agentSession.id, taskPrompt + '\n');
                        toast.success(`Assigned to ${agentName}`, {
                          description: 'Task sent via mail and written to agent terminal',
                        });
                      } else {
                        toast.success(`Assigned to ${agentName}`, {
                          description: 'Task sent via mail — agent will pick it up when active',
                        });
                      }
                    } else {
                      toast.success('Agent unassigned');
                    }
                  }
                } catch {
                  toast.error('Failed to assign agent');
                }
              }}
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
                  toast.error('Failed to update dependencies');
                }
              }}
            />
          )}
        </TabsContent>

        {/* Groups Tab */}
        <TabsContent value="groups">
          {/* Create Group Modal */}
          <Dialog open={showCreateGroupForm} onOpenChange={setShowCreateGroupForm}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Create Task Group</DialogTitle>
                <DialogDescription className="sr-only">Create a new task group</DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="group-name" className="mb-1 block text-slate-300">
                    Group Name <span className="text-red-400">*</span>
                  </Label>
                  <Input
                    id="group-name"
                    type="text"
                    value={groupName}
                    onChange={(e) => {
                      setGroupName(e.target.value);
                      if (e.target.value.trim()) setGroupNameError(null);
                    }}
                    placeholder="e.g., Sprint 1 Tasks, Auth Module..."
                    className={groupNameError ? 'border-red-500 focus-visible:ring-red-500' : ''}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateGroup();
                    }}
                    // biome-ignore lint/a11y/noAutofocus: intentional for modal/inline input UX
                    autoFocus
                  />
                  {groupNameError && (
                    <p className="mt-1 text-xs text-red-400" data-testid="group-name-error">
                      {groupNameError}
                    </p>
                  )}
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowCreateGroupForm(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateGroup}
                  disabled={!groupName.trim() || creatingGroup}
                  className="bg-blue-600/15 text-blue-400 border border-blue-500/25 hover:bg-blue-600/25 hover:text-blue-300"
                  data-testid="confirm-create-group"
                >
                  {creatingGroup ? (
                    <>
                      <FiLoader size={14} className="animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Group'
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Groups List */}
          {groupsLoading ? (
            <div className="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center text-slate-400">
              <FiLoader className="mx-auto mb-2 animate-spin" size={24} />
              <p>Loading groups...</p>
            </div>
          ) : groups.length === 0 ? (
            <div
              className="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center text-slate-400"
              data-testid="groups-empty-state"
            >
              <FiFolder className="mx-auto mb-2" size={32} />
              <p className="text-lg mb-2">No task groups yet</p>
              <p className="text-sm mb-4">Create a group to batch related issues together</p>
              <Button
                onClick={() => setShowCreateGroupForm(true)}
                className="bg-blue-600/15 text-blue-400 border border-blue-500/25 hover:bg-blue-600/25 hover:text-blue-300"
                data-testid="groups-empty-cta"
              >
                <FiPlus size={14} />
                Create Group
              </Button>
            </div>
          ) : (
            <div className="space-y-3" data-testid="groups-list">
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
                          <Tooltip content={isExpanded ? 'Collapse group' : 'Expand group'}>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setExpandedGroupId(isExpanded ? null : group.id)}
                              className="h-7 w-7 text-slate-400 hover:text-slate-200"
                            >
                              {isExpanded ? (
                                <FiChevronDown size={16} />
                              ) : (
                                <FiChevronRight size={16} />
                              )}
                            </Button>
                          </Tooltip>

                          <FiFolder
                            size={18}
                            className={isCompleted ? 'text-green-400' : 'text-sky-400'}
                          />

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              {renamingGroupId === group.id ? (
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="text"
                                    value={renameGroupName}
                                    onChange={(e) => setRenameGroupName(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter')
                                        handleRenameGroup(group.id, renameGroupName);
                                      if (e.key === 'Escape') {
                                        setRenamingGroupId(null);
                                        setRenameGroupName('');
                                      }
                                    }}
                                    className="h-7 text-sm"
                                    data-testid={`group-rename-input-${group.id}`}
                                    // biome-ignore lint/a11y/noAutofocus: intentional for inline rename
                                    autoFocus
                                  />
                                  <Button
                                    size="sm"
                                    onClick={() => handleRenameGroup(group.id, renameGroupName)}
                                    className="h-7 bg-emerald-600/15 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-600/25 hover:text-emerald-300 text-xs"
                                    data-testid={`group-rename-save-${group.id}`}
                                  >
                                    Save
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      setRenamingGroupId(null);
                                      setRenameGroupName('');
                                    }}
                                    className="h-7 w-7 text-slate-400 hover:text-slate-200"
                                  >
                                    <FiX size={14} />
                                  </Button>
                                </div>
                              ) : (
                                <h3
                                  className="text-sm font-medium text-slate-50 truncate"
                                  title={group.name}
                                  data-testid={`group-name-${group.id}`}
                                >
                                  {group.name}
                                </h3>
                              )}
                              <Badge
                                variant="outline"
                                className={`border-transparent ${
                                  isCompleted
                                    ? 'bg-green-400/10 text-green-400'
                                    : 'bg-sky-400/10 text-sky-400'
                                }`}
                                data-testid={`group-status-${group.id}`}
                              >
                                {isCompleted ? 'Completed' : 'Active'}
                              </Badge>
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
                                  <span className="text-xs text-slate-400">|</span>
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
                            <>
                              <Tooltip content="Add issue to group">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setAddingIssueToGroup(group.id)}
                                  className="h-8 w-8 text-slate-400 hover:text-sky-400"
                                  data-testid={`add-issue-to-group-${group.id}`}
                                >
                                  <FiLink size={14} />
                                </Button>
                              </Tooltip>
                              <Tooltip content="Rename group">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    setRenamingGroupId(group.id);
                                    setRenameGroupName(group.name);
                                  }}
                                  className="h-8 w-8 text-slate-400 hover:text-blue-400"
                                  data-testid={`rename-group-${group.id}`}
                                >
                                  <FiEdit3 size={14} />
                                </Button>
                              </Tooltip>
                              <Tooltip content="Close group">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleCloseGroup(group.id)}
                                  className="h-8 w-8 text-slate-400 hover:text-green-400"
                                  data-testid={`close-group-${group.id}`}
                                >
                                  <FiCheckCircle size={14} />
                                </Button>
                              </Tooltip>
                            </>
                          )}
                          {isCompleted && (
                            <Tooltip content="Reopen group">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleReopenGroup(group.id)}
                                className="h-8 w-8 text-slate-400 hover:text-amber-400"
                                data-testid={`reopen-group-${group.id}`}
                              >
                                <FiLoader size={14} />
                              </Button>
                            </Tooltip>
                          )}
                          <Tooltip content="Delete group">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteGroup(group.id)}
                              className="h-8 w-8 text-slate-400 hover:text-red-400"
                              data-testid={`delete-group-${group.id}`}
                            >
                              <FiTrash2 size={14} />
                            </Button>
                          </Tooltip>
                        </div>
                      </div>

                      {/* Add Issue to Group UI */}
                      {addingIssueToGroup === group.id && (
                        <div className="mt-3 flex items-center gap-2 pl-10">
                          <div className="flex-1">
                            <Select
                              value={selectedIssueForGroup || undefined}
                              onValueChange={(val) => setSelectedIssueForGroup(val)}
                            >
                              <SelectTrigger
                                className="h-8 text-xs"
                                aria-label="Select issue to add"
                              >
                                <SelectValue placeholder="Select an issue..." />
                              </SelectTrigger>
                              <SelectContent>
                                {getUnassignedIssues().map((issue) => (
                                  <SelectItem key={issue.id} value={issue.id}>
                                    {issue.title} ({issue.status})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => {
                              if (selectedIssueForGroup) {
                                handleAddIssueToGroup(group.id, selectedIssueForGroup);
                              }
                            }}
                            disabled={!selectedIssueForGroup}
                            className="h-8 bg-blue-600/15 text-blue-400 border border-blue-500/25 hover:bg-blue-600/25 hover:text-blue-300 text-xs"
                          >
                            Add
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setAddingIssueToGroup(null);
                              setSelectedIssueForGroup('');
                            }}
                            className="h-8 w-8 text-slate-400 hover:text-slate-200"
                          >
                            <FiX size={14} />
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Expanded: Member Issues */}
                    {isExpanded && (
                      <div className="border-t border-slate-700/50 p-3 pl-12 space-y-1.5">
                        {memberIssues.length === 0 ? (
                          <p className="text-xs text-slate-400 py-2">
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
                                  <Badge
                                    variant="outline"
                                    className={`gap-1 border-transparent ${status.color} ${status.bg}`}
                                  >
                                    <StatusIcon size={10} />
                                    {status.label}
                                  </Badge>
                                  <span
                                    className="text-xs text-slate-200 truncate"
                                    title={issue.title}
                                  >
                                    {issue.title}
                                  </span>
                                </div>
                                <Tooltip content="Remove from group">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleRemoveIssueFromGroup(group.id, issue.id)}
                                    className="h-6 w-6 text-slate-400 hover:text-red-400"
                                  >
                                    <FiMinus size={12} />
                                  </Button>
                                </Tooltip>
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
        </TabsContent>

        {/* Ready Queue Tab */}
        <TabsContent value="ready">
          <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3 mb-4">
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
        </TabsContent>

        {/* Completed Tab */}
        <TabsContent value="completed">
          <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3 mb-4">
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
                          <h3 className="font-medium text-slate-100 truncate" title={issue.title}>
                            {issue.title}
                          </h3>
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
                        <div className="flex items-center gap-3 mt-2 ml-6 text-xs text-slate-400">
                          <Badge variant="outline" className={`border-transparent ${typeInfo.color}`}>
                            {typeInfo.label}
                          </Badge>
                          <Badge variant="outline" className={`gap-1 border-transparent ${priorityInfo.color}`}>
                            <PriorityIcon size={11} />
                            {priorityInfo.label}
                          </Badge>
                          {issue.assigned_agent && (
                            <span className="inline-flex items-center gap-1 text-amber-400">
                              <FiUser size={11} />
                              {issue.assigned_agent}
                            </span>
                          )}
                          {issue.closed_at && (
                            <span className="inline-flex items-center gap-1 text-green-400">
                              <FiClock size={11} />
                              Done: {formatDateTime(issue.closed_at)}
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
        </TabsContent>
      </Tabs>

      {/* Close Issue with Summary Dialog */}
      <Dialog
        open={!!closingIssueId}
        onOpenChange={(open) => {
          if (!open) {
            setClosingIssueId(null);
            setCloseSummary('');
          }
        }}
      >
        <DialogContent className="max-w-md" data-testid="close-issue-dialog">
          <DialogHeader>
            <DialogTitle>Close Issue</DialogTitle>
            <DialogDescription>
              Closing:{' '}
              <span className="text-slate-200 font-medium">
                {issues.find((i) => i.id === closingIssueId)?.title || closingIssueId}
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="mb-1.5 block text-slate-300">
                Summary / Reason <span className="text-slate-400">(optional)</span>
              </Label>
              <Textarea
                value={closeSummary}
                onChange={(e) => setCloseSummary(e.target.value)}
                placeholder="Describe what was done or why this issue is being closed..."
                className="resize-y"
                rows={4}
                data-testid="close-summary-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setClosingIssueId(null);
                setCloseSummary('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCloseWithSummary}
              disabled={closingInProgress}
              className="bg-emerald-600/15 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-600/25 hover:text-emerald-300"
              data-testid="confirm-close-btn"
            >
              {closingInProgress ? (
                <FiLoader size={14} className="animate-spin" />
              ) : (
                <FiCheckCircle size={14} />
              )}
              Close Issue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
