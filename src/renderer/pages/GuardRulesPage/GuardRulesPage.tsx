import { useCallback, useEffect, useState } from 'react';
import {
  FiAlertTriangle,
  FiCheck,
  FiCheckCircle,
  FiChevronDown,
  FiChevronRight,
  FiClock,
  FiEdit3,
  FiEye,
  FiFolder,
  FiLock,
  FiPlus,
  FiShield,
  FiTrash2,
  FiX,
  FiXCircle,
} from 'react-icons/fi';
import { toast } from 'sonner';
import type { AgentDefinition, GuardViolation, PathBoundaryRule } from '../../../shared/types';
import { BashRestrictionTester, ToolAllowlistTester } from './components';
import type { AddRuleForm, DeleteConfirmation, RuleType, TabId } from './components';
import {
  ALL_TOOLS,
  boundaryTypeColors,
  boundaryTypeLabels,
  capabilityColors,
  defaultSecurityPosture,
  ruleTypeLabels,
  severityColors,
} from './constants';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Tooltip } from '../../components/Tooltip';
import './GuardRulesPage.css';

export function GuardRulesPage() {
  const [activeTab, setActiveTab] = useState<TabId>('allowlists');
  const [definitions, setDefinitions] = useState<AgentDefinition[]>([]);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [editingAllowlist, setEditingAllowlist] = useState<string[] | null>(null);
  const [editingBashRestrictions, setEditingBashRestrictions] = useState<string[] | null>(null);
  const [editingFileScope, setEditingFileScope] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);
  const [newTool, setNewTool] = useState('');
  const [newBashRestriction, setNewBashRestriction] = useState('');
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Add Rule modal state
  const [showAddRuleModal, setShowAddRuleModal] = useState(false);
  const [addRuleForm, setAddRuleForm] = useState<AddRuleForm>({
    ruleType: 'tool_allowlist',
    value: '',
  });

  // Delete confirmation state
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmation | null>(null);

  // Path boundaries state
  const [editingBoundaries, setEditingBoundaries] = useState<PathBoundaryRule[] | null>(null);
  const [boundarySelectedRole, setBoundarySelectedRole] = useState<string | null>(null);
  const [isBoundaryEditing, setIsBoundaryEditing] = useState(false);
  const [newBoundary, setNewBoundary] = useState<PathBoundaryRule>({
    pattern: '',
    type: 'worktree',
    description: '',
  });
  const [testPath, setTestPath] = useState('');
  const [testWorktree, setTestWorktree] = useState('');
  const [testResult, setTestResult] = useState<{
    allowed: boolean;
    reason: string;
    boundary?: string;
  } | null>(null);

  // Violations state
  const [violations, setViolations] = useState<GuardViolation[]>([]);
  const [violationStats, setViolationStats] = useState<{
    total: number;
    unacknowledged: number;
    by_type: Record<string, number>;
    by_severity: Record<string, number>;
  } | null>(null);
  const [violationFilter, setViolationFilter] = useState<{
    capability?: string;
    rule_type?: string;
    severity?: string;
  }>({});
  const [expandedViolation, setExpandedViolation] = useState<string | null>(null);

  const loadDefinitions = useCallback(async () => {
    try {
      const result = await window.electronAPI.agentDefList();
      if (result.data) {
        setDefinitions(result.data);
        if (!selectedRole && result.data.length > 0) {
          setSelectedRole(result.data[0].role);
        }
      }
    } catch (err) {
      console.error('Failed to load definitions:', err);
    }
  }, [selectedRole]);

  const loadViolations = useCallback(async () => {
    try {
      const [listResult, statsResult] = await Promise.all([
        window.electronAPI.guardViolationList({
          ...violationFilter,
          limit: 100,
        }),
        window.electronAPI.guardViolationStats(),
      ]);
      if (listResult.data) setViolations(listResult.data);
      if (statsResult.data) setViolationStats(statsResult.data);
    } catch (err) {
      console.error('Failed to load violations:', err);
    }
  }, [violationFilter]);

  useEffect(() => {
    loadDefinitions();
  }, [loadDefinitions]);

  useEffect(() => {
    if (activeTab === 'violations') {
      loadViolations();
    }
  }, [activeTab, loadViolations]);

  const selectedDef = definitions.find((d) => d.role === selectedRole);

  const startEditing = useCallback(() => {
    if (!selectedDef) return;
    try {
      setEditingAllowlist(selectedDef.tool_allowlist ? JSON.parse(selectedDef.tool_allowlist) : []);
      setEditingBashRestrictions(
        selectedDef.bash_restrictions ? JSON.parse(selectedDef.bash_restrictions) : [],
      );
      setEditingFileScope(selectedDef.file_scope || '');
      setIsEditing(true);
    } catch {
      setEditingAllowlist([]);
      setEditingBashRestrictions([]);
      setEditingFileScope('');
      setIsEditing(true);
    }
  }, [selectedDef]);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
    setEditingAllowlist(null);
    setEditingBashRestrictions(null);
    setEditingFileScope('');
    setNewTool('');
    setNewBashRestriction('');
  }, []);

  const saveChanges = useCallback(async () => {
    if (!selectedRole || !editingAllowlist) return;
    try {
      const result = await window.electronAPI.guardRuleUpdate(selectedRole, {
        tool_allowlist: JSON.stringify(editingAllowlist),
        bash_restrictions: editingBashRestrictions
          ? JSON.stringify(editingBashRestrictions)
          : undefined,
        file_scope: editingFileScope || undefined,
      });
      if (result.error) {
        setStatusMessage({ type: 'error', text: result.error });
      } else {
        setStatusMessage({ type: 'success', text: `Guard rules updated for ${selectedRole}` });
        toast.success(`Guard rules updated for ${selectedRole}`);
        setIsEditing(false);
        setEditingAllowlist(null);
        setEditingBashRestrictions(null);
        loadDefinitions();
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: String(err) });
    }
    setTimeout(() => setStatusMessage(null), 3000);
  }, [selectedRole, editingAllowlist, editingBashRestrictions, editingFileScope, loadDefinitions]);

  const addTool = useCallback(
    (tool: string) => {
      if (!editingAllowlist || editingAllowlist.includes(tool)) return;
      setEditingAllowlist([...editingAllowlist, tool]);
    },
    [editingAllowlist],
  );

  const removeTool = useCallback(
    (tool: string) => {
      if (!editingAllowlist) return;
      setEditingAllowlist(editingAllowlist.filter((t) => t !== tool));
    },
    [editingAllowlist],
  );

  const addBashRestriction = useCallback(
    (restriction: string) => {
      if (!editingBashRestrictions || !restriction.trim()) return;
      setEditingBashRestrictions([...editingBashRestrictions, restriction.trim()]);
      setNewBashRestriction('');
    },
    [editingBashRestrictions],
  );

  const removeBashRestriction = useCallback(
    (restriction: string) => {
      if (!editingBashRestrictions) return;
      setEditingBashRestrictions(editingBashRestrictions.filter((r) => r !== restriction));
    },
    [editingBashRestrictions],
  );

  // Add Rule modal handlers
  const openAddRuleModal = useCallback(() => {
    setAddRuleForm({ ruleType: 'tool_allowlist', value: '' });
    setShowAddRuleModal(true);
  }, []);

  const closeAddRuleModal = useCallback(() => {
    setShowAddRuleModal(false);
    setAddRuleForm({ ruleType: 'tool_allowlist', value: '' });
  }, []);

  const handleAddRule = useCallback(() => {
    if (!addRuleForm.value.trim()) return;

    // Ensure we're in editing mode
    if (!isEditing) {
      startEditing();
    }

    switch (addRuleForm.ruleType) {
      case 'tool_allowlist':
        if (editingAllowlist && !editingAllowlist.includes(addRuleForm.value)) {
          setEditingAllowlist([...editingAllowlist, addRuleForm.value]);
        }
        break;
      case 'bash_restriction':
        if (editingBashRestrictions) {
          setEditingBashRestrictions([...editingBashRestrictions, addRuleForm.value.trim()]);
        }
        break;
      case 'file_scope':
        setEditingFileScope(addRuleForm.value.trim());
        break;
    }

    closeAddRuleModal();
  }, [
    addRuleForm,
    isEditing,
    startEditing,
    editingAllowlist,
    editingBashRestrictions,
    closeAddRuleModal,
  ]);

  // Delete confirmation handlers
  const requestDelete = useCallback((ruleType: RuleType, value: string) => {
    setDeleteConfirmation({ ruleType, value });
  }, []);

  const confirmDelete = useCallback(() => {
    if (!deleteConfirmation) return;

    switch (deleteConfirmation.ruleType) {
      case 'tool_allowlist':
        removeTool(deleteConfirmation.value);
        break;
      case 'bash_restriction':
        removeBashRestriction(deleteConfirmation.value);
        break;
      case 'file_scope':
        setEditingFileScope('');
        break;
    }

    setDeleteConfirmation(null);
  }, [deleteConfirmation, removeTool, removeBashRestriction]);

  const cancelDelete = useCallback(() => {
    setDeleteConfirmation(null);
  }, []);

  const acknowledgeViolation = useCallback(
    async (id: string) => {
      try {
        await window.electronAPI.guardViolationAcknowledge(id);
        toast.success('Violation acknowledged');
        loadViolations();
      } catch (err) {
        console.error('Failed to acknowledge violation:', err);
        toast.error('Failed to acknowledge violation');
      }
    },
    [loadViolations],
  );

  const purgeViolations = useCallback(async () => {
    if (!confirm('Are you sure you want to delete all guard rule violations?')) return;
    try {
      await window.electronAPI.guardViolationPurge();
      loadViolations();
      setStatusMessage({ type: 'success', text: 'All violations cleared' });
      toast.success('All violations cleared');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      console.error('Failed to purge violations:', err);
    }
  }, [loadViolations]);

  const getCurrentAllowlist = (def: AgentDefinition): string[] => {
    try {
      return def.tool_allowlist ? JSON.parse(def.tool_allowlist) : [];
    } catch {
      return [];
    }
  };

  const getCurrentBashRestrictions = (def: AgentDefinition): string[] => {
    try {
      return def.bash_restrictions ? JSON.parse(def.bash_restrictions) : [];
    } catch {
      return [];
    }
  };

  const getCurrentBoundaries = (def: AgentDefinition): PathBoundaryRule[] => {
    try {
      return def.path_boundaries ? JSON.parse(def.path_boundaries) : [];
    } catch {
      return [];
    }
  };

  const boundarySelectedDef = definitions.find((d) => d.role === boundarySelectedRole);

  const startBoundaryEditing = useCallback(() => {
    if (!boundarySelectedDef) return;
    try {
      setEditingBoundaries(
        boundarySelectedDef.path_boundaries ? JSON.parse(boundarySelectedDef.path_boundaries) : [],
      );
      setIsBoundaryEditing(true);
    } catch {
      setEditingBoundaries([]);
      setIsBoundaryEditing(true);
    }
  }, [boundarySelectedDef]);

  const cancelBoundaryEditing = useCallback(() => {
    setIsBoundaryEditing(false);
    setEditingBoundaries(null);
    setNewBoundary({ pattern: '', type: 'worktree', description: '' });
  }, []);

  const saveBoundaryChanges = useCallback(async () => {
    if (!boundarySelectedRole || !editingBoundaries) return;
    try {
      const result = await window.electronAPI.guardRuleUpdate(boundarySelectedRole, {
        path_boundaries: JSON.stringify(editingBoundaries),
      });
      if (result.error) {
        setStatusMessage({ type: 'error', text: result.error });
      } else {
        setStatusMessage({
          type: 'success',
          text: `Path boundaries updated for ${boundarySelectedRole}`,
        });
        setIsBoundaryEditing(false);
        setEditingBoundaries(null);
        loadDefinitions();
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: String(err) });
    }
    setTimeout(() => setStatusMessage(null), 3000);
  }, [boundarySelectedRole, editingBoundaries, loadDefinitions]);

  const addBoundaryRule = useCallback(() => {
    if (!editingBoundaries || (!newBoundary.pattern.trim() && newBoundary.type !== 'worktree'))
      return;
    const pattern = newBoundary.type === 'worktree' ? '.' : newBoundary.pattern.trim();
    setEditingBoundaries([
      ...editingBoundaries,
      {
        pattern,
        type: newBoundary.type,
        description: newBoundary.description?.trim() || undefined,
      },
    ]);
    setNewBoundary({ pattern: '', type: 'worktree', description: '' });
  }, [editingBoundaries, newBoundary]);

  const removeBoundaryRule = useCallback(
    (index: number) => {
      if (!editingBoundaries) return;
      setEditingBoundaries(editingBoundaries.filter((_, i) => i !== index));
    },
    [editingBoundaries],
  );

  const validateTestPath = useCallback(async () => {
    if (!boundarySelectedRole || !testPath.trim()) return;
    try {
      const result = await window.electronAPI.guardPathBoundaryValidate(
        boundarySelectedRole,
        testPath.trim(),
        testWorktree.trim() || undefined,
      );
      if (result.data) {
        setTestResult(result.data);
      } else {
        setTestResult({ allowed: false, reason: result.error || 'Validation failed' });
      }
    } catch (err) {
      setTestResult({ allowed: false, reason: String(err) });
    }
  }, [boundarySelectedRole, testPath, testWorktree]);

  // Available tools not yet in the allowlist
  const availableTools = editingAllowlist
    ? ALL_TOOLS.filter((t) => !editingAllowlist.includes(t))
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FiShield className="text-amber-400" size={24} />
          <div>
            <h1 className="text-xl font-bold text-slate-50">Guard Rules</h1>
            <p className="text-sm text-slate-400">
              Configure tool allowlists, bash restrictions, and file scope per agent capability
            </p>
          </div>
        </div>
        {violationStats && violationStats.unacknowledged > 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-1.5">
            <FiAlertTriangle className="text-red-400" size={14} />
            <span className="text-sm font-medium text-red-400">
              {violationStats.unacknowledged} unacknowledged violation
              {violationStats.unacknowledged !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      {/* Status message */}
      {statusMessage && (
        <div
          className={`rounded-lg border px-4 py-2 text-sm ${
            statusMessage.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              : 'border-red-500/30 bg-red-500/10 text-red-400'
          }`}
        >
          {statusMessage.text}
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabId)}>
        <TabsList className="bg-transparent border-b border-slate-700 rounded-none w-full justify-start h-auto p-0 gap-1">
          <TabsTrigger
            value="allowlists"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:text-blue-400 data-[state=active]:bg-transparent data-[state=active]:shadow-none text-slate-400 hover:text-slate-200 px-4 py-2"
          >
            <div className="flex items-center gap-2">
              <FiShield size={14} />
              <span>Tool Allowlists</span>
            </div>
          </TabsTrigger>
          <TabsTrigger
            value="boundaries"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-amber-500 data-[state=active]:text-amber-400 data-[state=active]:bg-transparent data-[state=active]:shadow-none text-slate-400 hover:text-slate-200 px-4 py-2"
          >
            <div className="flex items-center gap-2">
              <FiFolder size={14} />
              <span>Path Boundaries</span>
            </div>
          </TabsTrigger>
          <TabsTrigger
            value="violations"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-red-500 data-[state=active]:text-red-400 data-[state=active]:bg-transparent data-[state=active]:shadow-none text-slate-400 hover:text-slate-200 px-4 py-2"
          >
            <div className="flex items-center gap-2">
              <FiAlertTriangle size={14} />
              <span>Violations Log</span>
              {violationStats && violationStats.unacknowledged > 0 && (
                <Badge className="bg-red-500 text-white text-xs min-w-[18px] h-[18px] px-1 rounded-full">
                  {violationStats.unacknowledged}
                </Badge>
              )}
            </div>
          </TabsTrigger>
          <TabsTrigger
            value="preview"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-cyan-500 data-[state=active]:text-cyan-400 data-[state=active]:bg-transparent data-[state=active]:shadow-none text-slate-400 hover:text-slate-200 px-4 py-2"
            data-testid="guard-preview-tab"
          >
            <div className="flex items-center gap-2">
              <FiEye size={14} />
              <span>Preview Permissions</span>
            </div>
          </TabsTrigger>
        </TabsList>

      <TabsContent value="allowlists">
        <div className="flex gap-6">
          {/* Left: Capability list */}
          <div className="w-64 flex-shrink-0 space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
              Agent Capabilities
            </h2>
            {definitions.map((def) => {
              const colorClass =
                capabilityColors[def.role] || 'text-slate-400 bg-slate-500/10 border-slate-500/30';
              const allowlist = getCurrentAllowlist(def);
              const posture = defaultSecurityPosture[def.role];
              return (
                <Button
                  variant="ghost"
                  type="button"
                  key={def.role}
                  onClick={() => {
                    setSelectedRole(def.role);
                    cancelEditing();
                  }}
                  data-testid={`guard-role-${def.role}`}
                  data-security-posture={posture?.label || 'Custom'}
                  className={`h-auto w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                    selectedRole === def.role
                      ? colorClass
                      : 'border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium capitalize">{def.display_name}</span>
                    <span className="text-xs text-slate-400">{allowlist.length} tools</span>
                  </div>
                  {posture && (
                    <span
                      className={`inline-block mt-1 text-[10px] font-semibold uppercase tracking-wider rounded-full border px-2 py-0.5 ${posture.color}`}
                      data-testid={`guard-posture-${def.role}`}
                    >
                      {posture.label}
                    </span>
                  )}
                  <p
                    className="text-xs text-slate-400 mt-0.5 truncate"
                    title={def.file_scope || 'No scope set'}
                  >
                    {def.file_scope || 'No scope set'}
                  </p>
                </Button>
              );
            })}
          </div>

          {/* Right: Guard rule detail */}
          <div className="flex-1 min-w-0" data-testid="guard-rules-detail">
            {selectedDef ? (
              <div className="space-y-6" data-testid={`guard-rules-for-${selectedDef.role}`}>
                {/* Role header */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-lg font-semibold text-slate-50 capitalize">
                        {selectedDef.display_name} Guard Rules
                      </h2>
                      {defaultSecurityPosture[selectedDef.role] && (
                        <span
                          className={`text-xs font-semibold uppercase tracking-wider rounded-full border px-2.5 py-0.5 ${defaultSecurityPosture[selectedDef.role].color}`}
                          data-testid="guard-security-posture"
                        >
                          {defaultSecurityPosture[selectedDef.role].label}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-400 mt-1">{selectedDef.description}</p>
                  </div>
                  {!isEditing ? (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          startEditing();
                          openAddRuleModal();
                        }}
                        data-testid="add-rule-btn"
                        className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                      >
                        <FiPlus size={14} />
                        Add Rule
                      </Button>
                      <Button
                        type="button"
                        onClick={startEditing}
                        className="bg-slate-800/90 border border-sky-500/30 text-sky-300 hover:bg-slate-700/90 hover:border-sky-400/40 shadow-sm"
                      >
                        <FiEdit3 size={14} />
                        Edit Rules
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={openAddRuleModal}
                        className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                        data-testid="add-rule-editing-btn"
                      >
                        <FiPlus size={14} />
                        Add Rule
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={cancelEditing}
                        className="border-slate-600 text-slate-300 hover:bg-slate-800"
                      >
                        <FiX size={14} />
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        onClick={saveChanges}
                        className="bg-slate-800/90 border border-emerald-500/30 text-emerald-300 hover:bg-slate-700/90 hover:border-emerald-400/40 shadow-sm"
                      >
                        <FiCheck size={14} />
                        Save
                      </Button>
                    </div>
                  )}
                </div>

                {/* Tool Allowlist Section */}
                <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4" data-testid="guard-tool-allowlist">
                  <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                    <FiShield size={14} className="text-blue-400" />
                    Tool Allowlist
                  </h3>
                  <p className="text-xs text-slate-400 mb-3">
                    Tools this capability is allowed to use. Any tool not in this list will be
                    blocked.
                  </p>

                  {/* Current tools */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    {(isEditing ? editingAllowlist || [] : getCurrentAllowlist(selectedDef)).map(
                      (tool) => (
                        <span
                          key={tool}
                          className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 border border-blue-500/30 px-3 py-1 text-sm text-blue-400"
                        >
                          {tool}
                          {isEditing && (
                            <Tooltip content={`Remove ${tool}`}>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => requestDelete('tool_allowlist', tool)}
                                className="h-5 w-5 text-blue-400/60 hover:text-red-400 transition-colors"
                                data-testid={`remove-tool-${tool}`}
                              >
                                <FiX size={12} />
                              </Button>
                            </Tooltip>
                          )}
                        </span>
                      ),
                    )}
                    {(isEditing ? editingAllowlist || [] : getCurrentAllowlist(selectedDef))
                      .length === 0 && (
                      <span className="text-sm text-slate-400 italic">No tools allowed</span>
                    )}
                  </div>

                  {/* Add tool */}
                  {isEditing && (
                    <div className="flex gap-2 mt-3">
                      <Select
                        value={newTool}
                        onValueChange={(value) => setNewTool(value)}
                      >
                        <SelectTrigger
                          className="flex-1 h-9 border-slate-600 bg-slate-700 text-slate-200"
                          aria-label="Select tool to add"
                        >
                          <SelectValue placeholder="Select a tool to add..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableTools.map((tool) => (
                            <SelectItem key={tool} value={tool}>
                              {tool}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          if (newTool) {
                            addTool(newTool);
                            setNewTool('');
                          }
                        }}
                        disabled={!newTool}
                        className="bg-slate-800/90 border border-blue-500/30 text-blue-300 hover:bg-slate-700/90 hover:border-blue-400/40 shadow-sm"
                      >
                        <FiPlus size={14} />
                        Add
                      </Button>
                    </div>
                  )}

                  {/* Test tool against allowlist */}
                  <ToolAllowlistTester role={selectedRole || ''} />
                </div>

                {/* Bash Restrictions Section */}
                <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4" data-testid="guard-bash-restrictions">
                  <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                    <FiXCircle size={14} className="text-red-400" />
                    Bash Restrictions
                  </h3>
                  <p className="text-xs text-slate-400 mb-3">
                    Bash commands or patterns that are blocked for this capability.
                  </p>

                  <div className="space-y-1.5 mb-3">
                    {(isEditing
                      ? editingBashRestrictions || []
                      : getCurrentBashRestrictions(selectedDef)
                    ).map((restriction) => (
                      <div
                        key={restriction}
                        className="flex items-center justify-between rounded bg-red-500/5 border border-red-500/20 px-3 py-1.5"
                      >
                        <span className="text-sm text-red-300 font-mono">{restriction}</span>
                        {isEditing && (
                          <Tooltip content="Remove restriction">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => requestDelete('bash_restriction', restriction)}
                              className="h-5 w-5 text-red-400/60 hover:text-red-400 transition-colors"
                              data-testid={`remove-restriction-${restriction}`}
                            >
                              <FiX size={12} />
                            </Button>
                          </Tooltip>
                        )}
                      </div>
                    ))}
                    {(isEditing
                      ? editingBashRestrictions || []
                      : getCurrentBashRestrictions(selectedDef)
                    ).length === 0 && (
                      <span className="text-sm text-slate-400 italic">No restrictions</span>
                    )}
                  </div>

                  {isEditing && (
                    <div className="flex gap-2 mt-3">
                      <Input
                        type="text"
                        value={newBashRestriction}
                        onChange={(e) => setNewBashRestriction(e.target.value)}
                        placeholder="e.g. git push"
                        aria-label="Add bash restriction"
                        className="flex-1 h-9 border-slate-600 bg-slate-700 text-slate-200 placeholder-slate-500"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            addBashRestriction(newBashRestriction);
                          }
                        }}
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => addBashRestriction(newBashRestriction)}
                        disabled={!newBashRestriction.trim()}
                        className="bg-slate-800/90 border border-blue-500/30 text-blue-300 hover:bg-slate-700/90 hover:border-blue-400/40 shadow-sm"
                      >
                        <FiPlus size={14} />
                        Add
                      </Button>
                    </div>
                  )}

                  {/* Test Command against restrictions */}
                  <BashRestrictionTester role={selectedRole || ''} />
                </div>

                {/* File Scope Section */}
                <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4" data-testid="guard-file-scope">
                  <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                    <FiEye size={14} className="text-emerald-400" />
                    File Scope
                  </h3>
                  <p className="text-xs text-slate-400 mb-3">
                    Defines which files this capability can access or modify.
                  </p>

                  {isEditing ? (
                    <Input
                      type="text"
                      value={editingFileScope}
                      onChange={(e) => setEditingFileScope(e.target.value)}
                      placeholder="e.g. read-only (entire project)"
                      aria-label="File scope"
                      className="border-slate-600 bg-slate-700 text-slate-200 placeholder-slate-500"
                    />
                  ) : (
                    <span className="text-sm text-emerald-300" data-testid="guard-file-scope-value">
                      {selectedDef.file_scope || 'Not configured'}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 text-slate-400">
                <p>Select a capability to view its guard rules</p>
              </div>
            )}
          </div>
        </div>
      </TabsContent>

      <TabsContent value="boundaries">
        <div className="flex gap-6">
          {/* Left: Capability list */}
          <div className="w-64 flex-shrink-0 space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
              Agent Capabilities
            </h2>
            {definitions.map((def) => {
              const colorClass =
                capabilityColors[def.role] || 'text-slate-400 bg-slate-500/10 border-slate-500/30';
              const boundaries = getCurrentBoundaries(def);
              return (
                <Button
                  variant="ghost"
                  type="button"
                  key={def.role}
                  onClick={() => {
                    setBoundarySelectedRole(def.role);
                    cancelBoundaryEditing();
                    setTestResult(null);
                  }}
                  className={`h-auto w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                    boundarySelectedRole === def.role
                      ? colorClass
                      : 'border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium capitalize">{def.display_name}</span>
                    <span className="text-xs text-slate-400">
                      {boundaries.length} {boundaries.length === 1 ? 'rule' : 'rules'}
                    </span>
                  </div>
                  <p
                    className="text-xs text-slate-400 mt-0.5 truncate"
                    title={
                      boundaries.length > 0
                        ? boundaries.map((b) => boundaryTypeLabels[b.type] || b.type).join(', ')
                        : 'No boundaries set'
                    }
                  >
                    {boundaries.length > 0
                      ? boundaries.map((b) => boundaryTypeLabels[b.type] || b.type).join(', ')
                      : 'No boundaries set'}
                  </p>
                </Button>
              );
            })}
          </div>

          {/* Right: Path boundary detail */}
          <div className="flex-1 min-w-0">
            {boundarySelectedDef ? (
              <div className="space-y-6">
                {/* Role header */}
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-50 capitalize">
                      {boundarySelectedDef.display_name} Path Boundaries
                    </h2>
                    <p className="text-sm text-slate-400 mt-1">
                      Configure path boundaries to confine this agent to its worktree
                    </p>
                  </div>
                  {!isBoundaryEditing ? (
                    <Button
                      type="button"
                      onClick={startBoundaryEditing}
                      className="bg-slate-800/90 border border-sky-500/30 text-sky-300 hover:bg-slate-700/90 hover:border-sky-400/40 shadow-sm"
                    >
                      <FiEdit3 size={14} />
                      Edit Boundaries
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={cancelBoundaryEditing}
                        className="border-slate-600 text-slate-300 hover:bg-slate-800"
                      >
                        <FiX size={14} />
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        onClick={saveBoundaryChanges}
                        className="bg-slate-800/90 border border-emerald-500/30 text-emerald-300 hover:bg-slate-700/90 hover:border-emerald-400/40 shadow-sm"
                      >
                        <FiCheck size={14} />
                        Save
                      </Button>
                    </div>
                  )}
                </div>

                {/* Worktree enforcement info */}
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                  <div className="flex items-start gap-3">
                    <FiLock className="text-amber-400 mt-0.5 flex-shrink-0" size={16} />
                    <div>
                      <h3 className="text-sm font-semibold text-amber-300">
                        Worktree Root Enforcement
                      </h3>
                      <p className="text-xs text-slate-400 mt-1">
                        When a worktree boundary is active, agents are confined to their assigned
                        worktree directory. Any file access outside the worktree root will be
                        blocked and logged as a violation.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Current boundaries */}
                <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                  <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                    <FiFolder size={14} className="text-amber-400" />
                    Configured Boundaries
                  </h3>
                  <p className="text-xs text-slate-400 mb-3">
                    Path boundaries restrict where agents can access files. Worktree boundaries
                    auto-enforce the worktree root.
                  </p>

                  <div className="space-y-2 mb-3">
                    {(isBoundaryEditing
                      ? editingBoundaries || []
                      : getCurrentBoundaries(boundarySelectedDef)
                    ).map((boundary, index) => (
                      <div
                        key={`${boundary.type}-${boundary.pattern}-${index}`}
                        className={`flex items-center justify-between rounded-lg border px-3 py-2.5 ${
                          boundaryTypeColors[boundary.type] || 'border-slate-600 bg-slate-700/50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {boundary.type === 'worktree' ? (
                            <FiLock size={14} />
                          ) : boundary.type === 'directory' ? (
                            <FiFolder size={14} />
                          ) : (
                            <FiEye size={14} />
                          )}
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-slate-700/50">
                                {boundaryTypeLabels[boundary.type] || boundary.type}
                              </span>
                              {boundary.type !== 'worktree' && (
                                <span className="text-sm font-mono">{boundary.pattern}</span>
                              )}
                              {boundary.type === 'worktree' && (
                                <span className="text-sm">Agent&apos;s assigned worktree root</span>
                              )}
                            </div>
                            {boundary.description && (
                              <p className="text-xs text-slate-400 mt-0.5">
                                {boundary.description}
                              </p>
                            )}
                          </div>
                        </div>
                        {isBoundaryEditing && (
                          <Tooltip content="Remove boundary">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeBoundaryRule(index)}
                              className="h-6 w-6 text-slate-400 hover:text-red-400 transition-colors"
                              data-testid={`remove-boundary-${index}`}
                            >
                              <FiX size={14} />
                            </Button>
                          </Tooltip>
                        )}
                      </div>
                    ))}
                    {(isBoundaryEditing
                      ? editingBoundaries || []
                      : getCurrentBoundaries(boundarySelectedDef)
                    ).length === 0 && (
                      <span className="text-sm text-slate-400 italic">
                        No boundaries configured - agent has unrestricted path access
                      </span>
                    )}
                  </div>

                  {/* Add boundary */}
                  {isBoundaryEditing && (
                    <div className="mt-4 rounded-lg border border-slate-600 bg-slate-700/30 p-3 space-y-3">
                      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Add Boundary Rule
                      </h4>
                      <div className="flex gap-2">
                        <Select
                          value={newBoundary.type}
                          onValueChange={(value) =>
                            setNewBoundary((b) => ({
                              ...b,
                              type: value as PathBoundaryRule['type'],
                            }))
                          }
                        >
                          <SelectTrigger
                            className="border-slate-600 bg-slate-700 text-slate-200 h-9"
                            aria-label="Boundary rule type"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="worktree">Worktree Root (auto-enforced)</SelectItem>
                            <SelectItem value="directory">Specific Directory</SelectItem>
                            <SelectItem value="glob">Glob Pattern</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {newBoundary.type !== 'worktree' && (
                        <Input
                          type="text"
                          value={newBoundary.pattern}
                          onChange={(e) =>
                            setNewBoundary((b) => ({ ...b, pattern: e.target.value }))
                          }
                          placeholder={
                            newBoundary.type === 'directory'
                              ? 'e.g. /home/user/project/src'
                              : 'e.g. !node_modules'
                          }
                          aria-label="Boundary pattern"
                          className="border-slate-600 bg-slate-700 text-slate-200 placeholder-slate-500 h-9"
                        />
                      )}
                      <Input
                        type="text"
                        value={newBoundary.description || ''}
                        onChange={(e) =>
                          setNewBoundary((b) => ({ ...b, description: e.target.value }))
                        }
                        placeholder="Description (optional)"
                        aria-label="Boundary description"
                        className="border-slate-600 bg-slate-700 text-slate-200 placeholder-slate-500 h-9"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={addBoundaryRule}
                        disabled={newBoundary.type !== 'worktree' && !newBoundary.pattern.trim()}
                        className="bg-slate-800/90 border border-blue-500/30 text-blue-300 hover:bg-slate-700/90 hover:border-blue-400/40 shadow-sm"
                      >
                        <FiPlus size={14} />
                        Add Boundary
                      </Button>
                    </div>
                  )}
                </div>

                {/* Path Validation Test */}
                <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                  <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                    <FiCheckCircle size={14} className="text-blue-400" />
                    Test Path Access
                  </h3>
                  <p className="text-xs text-slate-400 mb-3">
                    Verify if a file path would be allowed or blocked by the current boundary rules.
                  </p>
                  <div className="space-y-2">
                    <Input
                      type="text"
                      value={testWorktree}
                      onChange={(e) => {
                        setTestWorktree(e.target.value);
                        setTestResult(null);
                      }}
                      placeholder="Worktree path, e.g. /home/user/project/worktrees/feature-1"
                      aria-label="Worktree path for testing"
                      className="border-slate-600 bg-slate-700 text-slate-200 placeholder-slate-500"
                    />
                    <div className="flex gap-2">
                      <Input
                        type="text"
                        value={testPath}
                        onChange={(e) => {
                          setTestPath(e.target.value);
                          setTestResult(null);
                        }}
                        placeholder="File path to test, e.g. /home/user/other-project/secret.txt"
                        aria-label="File path to test access"
                        className="flex-1 border-slate-600 bg-slate-700 text-slate-200 placeholder-slate-500"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') validateTestPath();
                        }}
                      />
                      <Button
                        type="button"
                        onClick={validateTestPath}
                        disabled={!testPath.trim()}
                        className="bg-slate-800/90 border border-blue-500/30 text-blue-300 hover:bg-slate-700/90 hover:border-blue-400/40 shadow-sm"
                      >
                        Test
                      </Button>
                    </div>
                    {testResult && (
                      <div
                        className={`mt-2 rounded-lg border px-3 py-2 text-sm ${
                          testResult.allowed
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                            : 'border-red-500/30 bg-red-500/10 text-red-400'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {testResult.allowed ? (
                            <FiCheckCircle size={14} />
                          ) : (
                            <FiXCircle size={14} />
                          )}
                          <span className="font-medium">
                            {testResult.allowed ? 'ALLOWED' : 'BLOCKED'}
                          </span>
                        </div>
                        <p className="text-xs mt-1 opacity-80">{testResult.reason}</p>
                        {testResult.boundary && (
                          <p className="text-xs mt-0.5 opacity-60">
                            Boundary: {testResult.boundary}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 text-slate-400">
                <p>Select a capability to view its path boundaries</p>
              </div>
            )}
          </div>
        </div>
      </TabsContent>

      <TabsContent value="violations">
        <div className="space-y-4">
          {/* Violation stats cards */}
          {violationStats && (
            <div className="grid grid-cols-4 gap-4">
              <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                <div className="text-2xl font-bold text-slate-50">{violationStats.total}</div>
                <div className="text-xs text-slate-400 mt-1">Total Violations</div>
              </div>
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
                <div className="text-2xl font-bold text-red-400">
                  {violationStats.unacknowledged}
                </div>
                <div className="text-xs text-red-400/60 mt-1">Unacknowledged</div>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                <div className="text-2xl font-bold text-amber-400">
                  {violationStats.by_severity?.critical || 0}
                </div>
                <div className="text-xs text-slate-400 mt-1">Critical</div>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                <div className="text-2xl font-bold text-blue-400">
                  {Object.keys(violationStats.by_type || {}).length}
                </div>
                <div className="text-xs text-slate-400 mt-1">Rule Types Hit</div>
              </div>
            </div>
          )}

          {/* Filters and actions */}
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Select
                value={violationFilter.capability || 'all'}
                onValueChange={(value) =>
                  setViolationFilter((f) => ({
                    ...f,
                    capability: value === 'all' ? undefined : value,
                  }))
                }
              >
                <SelectTrigger className="h-9 w-[160px] border-slate-600 bg-slate-800 text-slate-200" aria-label="Filter by capability">
                  <SelectValue placeholder="All Capabilities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Capabilities</SelectItem>
                  {definitions.map((d) => (
                    <SelectItem key={d.role} value={d.role}>
                      {d.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={violationFilter.rule_type || 'all'}
                onValueChange={(value) =>
                  setViolationFilter((f) => ({
                    ...f,
                    rule_type: value === 'all' ? undefined : value,
                  }))
                }
              >
                <SelectTrigger className="h-9 w-[160px] border-slate-600 bg-slate-800 text-slate-200" aria-label="Filter by rule type">
                  <SelectValue placeholder="All Rule Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Rule Types</SelectItem>
                  <SelectItem value="tool_allowlist">Tool Allowlist</SelectItem>
                  <SelectItem value="bash_restriction">Bash Restriction</SelectItem>
                  <SelectItem value="file_scope">File Scope</SelectItem>
                  <SelectItem value="path_boundary">Path Boundary</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={violationFilter.severity || 'all'}
                onValueChange={(value) =>
                  setViolationFilter((f) => ({
                    ...f,
                    severity: value === 'all' ? undefined : value,
                  }))
                }
              >
                <SelectTrigger className="h-9 w-[140px] border-slate-600 bg-slate-800 text-slate-200" aria-label="Filter by severity">
                  <SelectValue placeholder="All Severities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severities</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {violations.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={purgeViolations}
                className="border-red-500/30 text-red-400 hover:bg-red-500/10"
              >
                <FiTrash2 size={14} />
                Purge All
              </Button>
            )}
          </div>

          {/* Violations list */}
          {violations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <FiCheckCircle size={48} className="mb-4 text-emerald-500/40" />
              <p className="text-lg font-medium text-slate-400">No violations recorded</p>
              <p className="text-sm mt-1">
                Guard rule violations will appear here when agents attempt unauthorized actions
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {violations.map((v) => (
                <div
                  key={v.id}
                  className={`rounded-lg border transition-colors ${
                    v.acknowledged
                      ? 'border-slate-700/50 bg-slate-800/30'
                      : 'border-slate-700 bg-slate-800/50'
                  }`}
                >
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => setExpandedViolation(expandedViolation === v.id ? null : v.id)}
                    className="h-auto w-full rounded-none text-left px-4 py-3 flex items-center gap-3"
                  >
                    {expandedViolation === v.id ? (
                      <FiChevronDown size={14} className="text-slate-400 flex-shrink-0" />
                    ) : (
                      <FiChevronRight size={14} className="text-slate-400 flex-shrink-0" />
                    )}

                    {/* Severity badge */}
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${
                        severityColors[v.severity] || 'text-slate-400 bg-slate-500/10'
                      }`}
                    >
                      {v.severity}
                    </span>

                    {/* Capability badge */}
                    <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-700/50 text-slate-300 capitalize flex-shrink-0">
                      {v.capability}
                    </span>

                    {/* Rule type */}
                    <span className="text-xs text-slate-400 flex-shrink-0">
                      {ruleTypeLabels[v.rule_type] || v.rule_type}
                    </span>

                    {/* Violation text */}
                    <span
                      className={`text-sm truncate ${v.acknowledged ? 'text-slate-400' : 'text-slate-200'}`}
                    >
                      {v.violation}
                    </span>

                    {/* Timestamp and acknowledged */}
                    <div className="ml-auto flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <FiClock size={10} />
                        {new Date(v.created_at).toLocaleString()}
                      </span>
                      {!v.acknowledged && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            acknowledgeViolation(v.id);
                          }}
                          className="h-6 flex items-center gap-1 bg-emerald-600/20 border-emerald-500/30 px-2 py-0.5 text-xs text-emerald-400 hover:bg-emerald-600/30 transition-colors"
                          title="Acknowledge violation"
                        >
                          <FiCheck size={10} />
                          Ack
                        </Button>
                      )}
                      {v.acknowledged === 1 && (
                        <span className="text-xs text-emerald-500/60 flex items-center gap-1">
                          <FiCheckCircle size={10} />
                          Acked
                        </span>
                      )}
                    </div>
                  </Button>

                  {/* Expanded details */}
                  {expandedViolation === v.id && (
                    <div className="px-4 pb-3 pt-1 border-t border-slate-700/50 ml-7">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-slate-400">Agent:</span>{' '}
                          <span className="text-slate-200">{v.agent_name}</span>
                        </div>
                        <div>
                          <span className="text-slate-400">Capability:</span>{' '}
                          <span className="text-slate-200 capitalize">{v.capability}</span>
                        </div>
                        {v.tool_attempted && (
                          <div>
                            <span className="text-slate-400">Tool Attempted:</span>{' '}
                            <span className="text-red-300 font-mono">{v.tool_attempted}</span>
                          </div>
                        )}
                        {v.command_attempted && (
                          <div>
                            <span className="text-slate-400">Command:</span>{' '}
                            <span className="text-red-300 font-mono">{v.command_attempted}</span>
                          </div>
                        )}
                        {v.file_attempted && (
                          <div className="col-span-2">
                            <span className="text-slate-400">File:</span>{' '}
                            <span className="text-red-300 font-mono">{v.file_attempted}</span>
                          </div>
                        )}
                        <div className="col-span-2">
                          <span className="text-slate-400">Violation:</span>{' '}
                          <span className="text-slate-200">{v.violation}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </TabsContent>

      <TabsContent value="preview">
        <div className="flex gap-6" data-testid="guard-preview-panel">
          {/* Left: Capability list */}
          <div className="w-64 flex-shrink-0 space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
              Select Agent Type
            </h2>
            {definitions.map((def) => {
              const colorClass =
                capabilityColors[def.role] || 'text-slate-400 bg-slate-500/10 border-slate-500/30';
              return (
                <Button
                  variant="ghost"
                  type="button"
                  key={def.role}
                  onClick={() => setSelectedRole(def.role)}
                  data-testid={`preview-role-${def.role}`}
                  className={`h-auto w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                    selectedRole === def.role
                      ? colorClass
                      : 'border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <span className="text-sm font-medium capitalize">{def.display_name}</span>
                  {defaultSecurityPosture[def.role] && (
                    <span
                      className={`inline-block mt-1 text-[10px] font-semibold uppercase tracking-wider rounded-full border px-2 py-0.5 ${defaultSecurityPosture[def.role].color}`}
                    >
                      {defaultSecurityPosture[def.role].label}
                    </span>
                  )}
                </Button>
              );
            })}
          </div>

          {/* Right: Effective permissions preview */}
          <div className="flex-1 min-w-0" data-testid="guard-preview-detail">
            {selectedDef ? (
              <div className="space-y-5">
                {/* Header */}
                <div>
                  <h2 className="text-lg font-semibold text-slate-50 capitalize flex items-center gap-2">
                    <FiEye size={18} className="text-cyan-400" />
                    {selectedDef.display_name} — Effective Permissions
                  </h2>
                  <p className="text-sm text-slate-400 mt-1">{selectedDef.description}</p>
                </div>

                {/* Allowed Tools */}
                <div
                  className="rounded-lg border border-slate-700 bg-slate-800/50 p-4"
                  data-testid="preview-allowed-tools"
                >
                  <h3 className="text-sm font-semibold text-emerald-400 mb-3 flex items-center gap-2">
                    <FiCheckCircle size={14} />
                    Allowed Tools
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {getCurrentAllowlist(selectedDef).length > 0 ? (
                      getCurrentAllowlist(selectedDef).map((tool) => (
                        <span
                          key={tool}
                          className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 text-sm text-emerald-400"
                          data-testid="preview-allowed-tool"
                        >
                          <FiCheckCircle size={12} />
                          {tool}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-slate-400 italic">No tools configured</span>
                    )}
                  </div>
                </div>

                {/* Blocked Tools */}
                <div
                  className="rounded-lg border border-slate-700 bg-slate-800/50 p-4"
                  data-testid="preview-blocked-tools"
                >
                  <h3 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
                    <FiXCircle size={14} />
                    Blocked Tools
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {(() => {
                      const allowed = new Set(
                        getCurrentAllowlist(selectedDef).map((t) => t.split(' ')[0]),
                      );
                      const blocked = ALL_TOOLS.filter((t) => !allowed.has(t.split(' ')[0]));
                      return blocked.length > 0 ? (
                        blocked.map((tool) => (
                          <span
                            key={tool}
                            className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 border border-red-500/30 px-3 py-1 text-sm text-red-400"
                            data-testid="preview-blocked-tool"
                          >
                            <FiXCircle size={12} />
                            {tool}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-emerald-400 italic">
                          All tools are allowed
                        </span>
                      );
                    })()}
                  </div>
                </div>

                {/* Bash Restrictions */}
                <div
                  className="rounded-lg border border-slate-700 bg-slate-800/50 p-4"
                  data-testid="preview-bash-restrictions"
                >
                  <h3 className="text-sm font-semibold text-amber-400 mb-3 flex items-center gap-2">
                    <FiLock size={14} />
                    Bash Restrictions
                  </h3>
                  {getCurrentBashRestrictions(selectedDef).length > 0 ? (
                    <div className="space-y-1.5">
                      {getCurrentBashRestrictions(selectedDef).map((restriction) => (
                        <div
                          key={restriction}
                          className="flex items-center gap-2 rounded bg-red-500/5 border border-red-500/20 px-3 py-1.5"
                          data-testid="preview-bash-restriction"
                        >
                          <FiXCircle size={12} className="text-red-400 flex-shrink-0" />
                          <span className="text-sm text-red-300 font-mono">{restriction}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-sm text-slate-400 italic">No bash restrictions</span>
                  )}
                </div>

                {/* Path Boundaries */}
                <div
                  className="rounded-lg border border-slate-700 bg-slate-800/50 p-4"
                  data-testid="preview-path-boundaries"
                >
                  <h3 className="text-sm font-semibold text-blue-400 mb-3 flex items-center gap-2">
                    <FiFolder size={14} />
                    Path Boundaries
                  </h3>
                  {getCurrentBoundaries(selectedDef).length > 0 ? (
                    <div className="space-y-1.5">
                      {getCurrentBoundaries(selectedDef).map((boundary, idx) => (
                        <div
                          key={`${boundary.pattern}-${idx}`}
                          className="flex items-center gap-2 rounded bg-blue-500/5 border border-blue-500/20 px-3 py-1.5"
                          data-testid="preview-path-boundary"
                        >
                          <span
                            className={`text-[10px] font-semibold uppercase rounded-full border px-2 py-0.5 ${
                              boundaryTypeColors[boundary.type] || 'text-slate-400 bg-slate-500/10 border-slate-500/30'
                            }`}
                          >
                            {boundaryTypeLabels[boundary.type] || boundary.type}
                          </span>
                          <span className="text-sm text-blue-300 font-mono">{boundary.pattern}</span>
                          {boundary.description && (
                            <span className="text-xs text-slate-400">— {boundary.description}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-sm text-slate-400 italic">No path boundaries set</span>
                  )}
                </div>

                {/* File Scope */}
                <div
                  className="rounded-lg border border-slate-700 bg-slate-800/50 p-4"
                  data-testid="preview-file-scope"
                >
                  <h3 className="text-sm font-semibold text-emerald-400 mb-3 flex items-center gap-2">
                    <FiEye size={14} />
                    File Scope
                  </h3>
                  <span
                    className={`text-sm ${selectedDef.file_scope ? 'text-emerald-300' : 'text-slate-400 italic'}`}
                  >
                    {selectedDef.file_scope || 'No file scope configured'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 text-slate-400">
                <p>Select an agent type to preview its effective permissions</p>
              </div>
            )}
          </div>
        </div>
      </TabsContent>
      </Tabs>

      {/* Add Rule Modal */}
      <Dialog open={showAddRuleModal} onOpenChange={(open) => { if (!open) closeAddRuleModal(); }}>
        <DialogContent className="max-w-md border-slate-600 bg-slate-800" data-testid="add-rule-modal">
          <DialogHeader>
            <DialogTitle className="text-slate-100">Add New Rule</DialogTitle>
            <DialogDescription className="sr-only">Add a new guard rule</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Rule Type Selector */}
            <div>
              <span className="block text-sm font-medium text-slate-300 mb-2">Rule Type</span>
              <div className="space-y-2">
                {(
                  [
                    {
                      id: 'tool_allowlist' as RuleType,
                      label: 'Tool Allowlist',
                      desc: 'Add a tool to the allowed tools list',
                      icon: FiShield,
                      color: 'text-blue-400',
                    },
                    {
                      id: 'bash_restriction' as RuleType,
                      label: 'Bash Restriction',
                      desc: 'Block a bash command pattern',
                      icon: FiXCircle,
                      color: 'text-red-400',
                    },
                    {
                      id: 'file_scope' as RuleType,
                      label: 'File Scope',
                      desc: 'Set file access scope',
                      icon: FiEye,
                      color: 'text-emerald-400',
                    },
                  ] as const
                ).map((rt) => {
                  const Icon = rt.icon;
                  return (
                    <Button
                      variant="ghost"
                      type="button"
                      key={rt.id}
                      onClick={() =>
                        setAddRuleForm((f) => ({ ...f, ruleType: rt.id, value: '' }))
                      }
                      className={`h-auto w-full text-left flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                        addRuleForm.ruleType === rt.id
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-slate-600 bg-slate-700/50 hover:border-slate-500'
                      }`}
                    >
                      <Icon size={16} className={rt.color} />
                      <div>
                        <div className="text-sm font-medium text-slate-200">{rt.label}</div>
                        <div className="text-xs text-slate-400">{rt.desc}</div>
                      </div>
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* Value Input */}
            <div>
              <span className="block text-sm font-medium text-slate-300 mb-2">
                {addRuleForm.ruleType === 'tool_allowlist'
                  ? 'Select Tool'
                  : addRuleForm.ruleType === 'bash_restriction'
                    ? 'Bash Pattern'
                    : 'File Scope'}
              </span>
              {addRuleForm.ruleType === 'tool_allowlist' ? (
                <Select
                  value={addRuleForm.value}
                  onValueChange={(value) => setAddRuleForm((f) => ({ ...f, value }))}
                >
                  <SelectTrigger
                    className="w-full border-slate-600 bg-slate-700 text-slate-200"
                    data-testid="add-rule-tool-select"
                    aria-label="Select tool"
                  >
                    <SelectValue placeholder="Select a tool..." />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_TOOLS.filter(
                      (t) => !editingAllowlist || !editingAllowlist.includes(t),
                    ).map((tool) => (
                      <SelectItem key={tool} value={tool}>
                        {tool}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  type="text"
                  value={addRuleForm.value}
                  onChange={(e) => setAddRuleForm((f) => ({ ...f, value: e.target.value }))}
                  placeholder={
                    addRuleForm.ruleType === 'bash_restriction'
                      ? 'e.g. git push --force'
                      : 'e.g. src/**/*.ts'
                  }
                  aria-label={addRuleForm.ruleType === 'bash_restriction' ? 'Bash pattern' : 'File scope pattern'}
                  className="border-slate-600 bg-slate-700 text-slate-200 placeholder-slate-500"
                  data-testid="add-rule-value-input"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && addRuleForm.value.trim()) {
                      handleAddRule();
                    }
                  }}
                />
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closeAddRuleModal}
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleAddRule}
              disabled={!addRuleForm.value.trim()}
              data-testid="add-rule-save-btn"
              className="bg-slate-800/90 border border-blue-500/30 text-blue-300 hover:bg-slate-700/90 hover:border-blue-400/40 shadow-sm"
            >
              <FiPlus size={14} />
              Add Rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmation} onOpenChange={(open) => { if (!open) cancelDelete(); }}>
        <DialogContent className="max-w-sm border-slate-600 bg-slate-800" data-testid="delete-confirm-dialog">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-red-500/10 p-2">
                <FiTrash2 className="text-red-400" size={18} />
              </div>
              <DialogTitle className="text-slate-100">Delete Rule</DialogTitle>
            </div>
            <DialogDescription className="text-slate-300 pt-2">
              Are you sure you want to remove this{' '}
              <span className="font-medium text-slate-100">
                {deleteConfirmation ? ruleTypeLabels[deleteConfirmation.ruleType] : ''}
              </span>{' '}
              rule?
            </DialogDescription>
          </DialogHeader>
          {deleteConfirmation && (
            <div className="rounded-md bg-slate-700/50 border border-slate-600 px-3 py-2">
              <code className="text-sm text-red-300">{deleteConfirmation.value}</code>
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={cancelDelete}
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
              data-testid="delete-cancel-btn"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmDelete}
              data-testid="delete-confirm-btn"
            >
              <FiTrash2 size={14} />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
