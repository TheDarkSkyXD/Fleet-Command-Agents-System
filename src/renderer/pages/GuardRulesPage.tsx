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
  FiPlus,
  FiShield,
  FiTrash2,
  FiX,
  FiXCircle,
} from 'react-icons/fi';
import type { AgentDefinition, GuardViolation } from '../../shared/types';

// All available tools in the system
const ALL_TOOLS = [
  'Read',
  'Write',
  'Edit',
  'Grep',
  'Glob',
  'Bash',
  'Bash (read-only)',
  'Bash (read-only + tests)',
  'WebSearch',
  'WebFetch',
  'Diff',
  'Git',
  'AgentSpawn',
  'Mail',
  'HealthCheck',
  'MergeAuthorize',
  'NotebookEdit',
];

const capabilityColors: Record<string, string> = {
  scout: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
  builder: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  reviewer: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
  lead: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  merger: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  coordinator: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
  monitor: 'text-teal-400 bg-teal-500/10 border-teal-500/30',
};

const severityColors: Record<string, string> = {
  info: 'text-blue-400 bg-blue-500/10',
  warning: 'text-amber-400 bg-amber-500/10',
  critical: 'text-red-400 bg-red-500/10',
};

const ruleTypeLabels: Record<string, string> = {
  tool_allowlist: 'Tool Allowlist',
  bash_restriction: 'Bash Restriction',
  file_scope: 'File Scope',
};

type TabId = 'allowlists' | 'violations';

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

  const acknowledgeViolation = useCallback(
    async (id: string) => {
      try {
        await window.electronAPI.guardViolationAcknowledge(id);
        loadViolations();
      } catch (err) {
        console.error('Failed to acknowledge violation:', err);
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
      <div className="flex gap-1 border-b border-slate-700">
        <button
          type="button"
          onClick={() => setActiveTab('allowlists')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'allowlists'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <FiShield size={14} />
            <span>Tool Allowlists</span>
          </div>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('violations')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'violations'
              ? 'border-red-500 text-red-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <FiAlertTriangle size={14} />
            <span>Violations Log</span>
            {violationStats && violationStats.unacknowledged > 0 && (
              <span className="flex items-center justify-center rounded-full bg-red-500 text-white text-xs min-w-[18px] h-[18px] px-1">
                {violationStats.unacknowledged}
              </span>
            )}
          </div>
        </button>
      </div>

      {activeTab === 'allowlists' && (
        <div className="flex gap-6">
          {/* Left: Capability list */}
          <div className="w-64 flex-shrink-0 space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
              Agent Capabilities
            </h2>
            {definitions.map((def) => {
              const colorClass =
                capabilityColors[def.role] || 'text-slate-400 bg-slate-500/10 border-slate-500/30';
              const allowlist = getCurrentAllowlist(def);
              return (
                <button
                  type="button"
                  key={def.role}
                  onClick={() => {
                    setSelectedRole(def.role);
                    cancelEditing();
                  }}
                  className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                    selectedRole === def.role
                      ? colorClass
                      : 'border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium capitalize">{def.display_name}</span>
                    <span className="text-xs text-slate-500">{allowlist.length} tools</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">
                    {def.file_scope || 'No scope set'}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Right: Guard rule detail */}
          <div className="flex-1 min-w-0">
            {selectedDef ? (
              <div className="space-y-6">
                {/* Role header */}
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-50 capitalize">
                      {selectedDef.display_name} Guard Rules
                    </h2>
                    <p className="text-sm text-slate-400 mt-1">{selectedDef.description}</p>
                  </div>
                  {!isEditing ? (
                    <button
                      type="button"
                      onClick={startEditing}
                      className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
                    >
                      <FiEdit3 size={14} />
                      Edit Rules
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={cancelEditing}
                        className="flex items-center gap-2 rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors"
                      >
                        <FiX size={14} />
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={saveChanges}
                        className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 transition-colors"
                      >
                        <FiCheck size={14} />
                        Save
                      </button>
                    </div>
                  )}
                </div>

                {/* Tool Allowlist Section */}
                <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                  <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                    <FiShield size={14} className="text-blue-400" />
                    Tool Allowlist
                  </h3>
                  <p className="text-xs text-slate-500 mb-3">
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
                            <button
                              type="button"
                              onClick={() => removeTool(tool)}
                              className="text-blue-400/60 hover:text-red-400 transition-colors"
                              title={`Remove ${tool}`}
                            >
                              <FiX size={12} />
                            </button>
                          )}
                        </span>
                      ),
                    )}
                    {(isEditing ? editingAllowlist || [] : getCurrentAllowlist(selectedDef))
                      .length === 0 && (
                      <span className="text-sm text-slate-500 italic">No tools allowed</span>
                    )}
                  </div>

                  {/* Add tool */}
                  {isEditing && (
                    <div className="flex gap-2 mt-3">
                      <select
                        value={newTool}
                        onChange={(e) => setNewTool(e.target.value)}
                        className="flex-1 rounded-lg border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm text-slate-200"
                      >
                        <option value="">Select a tool to add...</option>
                        {availableTools.map((tool) => (
                          <option key={tool} value={tool}>
                            {tool}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          if (newTool) {
                            addTool(newTool);
                            setNewTool('');
                          }
                        }}
                        disabled={!newTool}
                        className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <FiPlus size={14} />
                        Add
                      </button>
                    </div>
                  )}
                </div>

                {/* Bash Restrictions Section */}
                <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                  <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                    <FiXCircle size={14} className="text-red-400" />
                    Bash Restrictions
                  </h3>
                  <p className="text-xs text-slate-500 mb-3">
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
                          <button
                            type="button"
                            onClick={() => removeBashRestriction(restriction)}
                            className="text-red-400/60 hover:text-red-400 transition-colors"
                          >
                            <FiX size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                    {(isEditing
                      ? editingBashRestrictions || []
                      : getCurrentBashRestrictions(selectedDef)
                    ).length === 0 && (
                      <span className="text-sm text-slate-500 italic">No restrictions</span>
                    )}
                  </div>

                  {isEditing && (
                    <div className="flex gap-2 mt-3">
                      <input
                        type="text"
                        value={newBashRestriction}
                        onChange={(e) => setNewBashRestriction(e.target.value)}
                        placeholder="e.g. no git push --force"
                        className="flex-1 rounded-lg border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            addBashRestriction(newBashRestriction);
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => addBashRestriction(newBashRestriction)}
                        disabled={!newBashRestriction.trim()}
                        className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <FiPlus size={14} />
                        Add
                      </button>
                    </div>
                  )}
                </div>

                {/* File Scope Section */}
                <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                  <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                    <FiEye size={14} className="text-emerald-400" />
                    File Scope
                  </h3>
                  <p className="text-xs text-slate-500 mb-3">
                    Defines which files this capability can access or modify.
                  </p>

                  {isEditing ? (
                    <input
                      type="text"
                      value={editingFileScope}
                      onChange={(e) => setEditingFileScope(e.target.value)}
                      placeholder="e.g. read-only (entire project)"
                      className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-200 placeholder-slate-500"
                    />
                  ) : (
                    <span className="text-sm text-emerald-300">
                      {selectedDef.file_scope || 'Not configured'}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 text-slate-500">
                <p>Select a capability to view its guard rules</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'violations' && (
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
              <select
                value={violationFilter.capability || ''}
                onChange={(e) =>
                  setViolationFilter((f) => ({
                    ...f,
                    capability: e.target.value || undefined,
                  }))
                }
                className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200"
              >
                <option value="">All Capabilities</option>
                {definitions.map((d) => (
                  <option key={d.role} value={d.role}>
                    {d.display_name}
                  </option>
                ))}
              </select>
              <select
                value={violationFilter.rule_type || ''}
                onChange={(e) =>
                  setViolationFilter((f) => ({
                    ...f,
                    rule_type: e.target.value || undefined,
                  }))
                }
                className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200"
              >
                <option value="">All Rule Types</option>
                <option value="tool_allowlist">Tool Allowlist</option>
                <option value="bash_restriction">Bash Restriction</option>
                <option value="file_scope">File Scope</option>
              </select>
              <select
                value={violationFilter.severity || ''}
                onChange={(e) =>
                  setViolationFilter((f) => ({
                    ...f,
                    severity: e.target.value || undefined,
                  }))
                }
                className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200"
              >
                <option value="">All Severities</option>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            {violations.length > 0 && (
              <button
                type="button"
                onClick={purgeViolations}
                className="flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <FiTrash2 size={14} />
                Purge All
              </button>
            )}
          </div>

          {/* Violations list */}
          {violations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
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
                  <button
                    type="button"
                    onClick={() => setExpandedViolation(expandedViolation === v.id ? null : v.id)}
                    className="w-full text-left px-4 py-3 flex items-center gap-3"
                  >
                    {expandedViolation === v.id ? (
                      <FiChevronDown size={14} className="text-slate-500 flex-shrink-0" />
                    ) : (
                      <FiChevronRight size={14} className="text-slate-500 flex-shrink-0" />
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
                    <span className="text-xs text-slate-500 flex-shrink-0">
                      {ruleTypeLabels[v.rule_type] || v.rule_type}
                    </span>

                    {/* Violation text */}
                    <span
                      className={`text-sm truncate ${v.acknowledged ? 'text-slate-500' : 'text-slate-200'}`}
                    >
                      {v.violation}
                    </span>

                    {/* Timestamp and acknowledged */}
                    <div className="ml-auto flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <FiClock size={10} />
                        {new Date(v.created_at).toLocaleString()}
                      </span>
                      {!v.acknowledged && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            acknowledgeViolation(v.id);
                          }}
                          className="flex items-center gap-1 rounded bg-emerald-600/20 border border-emerald-500/30 px-2 py-0.5 text-xs text-emerald-400 hover:bg-emerald-600/30 transition-colors"
                          title="Acknowledge violation"
                        >
                          <FiCheck size={10} />
                          Ack
                        </button>
                      )}
                      {v.acknowledged === 1 && (
                        <span className="text-xs text-emerald-500/60 flex items-center gap-1">
                          <FiCheckCircle size={10} />
                          Acked
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Expanded details */}
                  {expandedViolation === v.id && (
                    <div className="px-4 pb-3 pt-1 border-t border-slate-700/50 ml-7">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-slate-500">Agent:</span>{' '}
                          <span className="text-slate-200">{v.agent_name}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Capability:</span>{' '}
                          <span className="text-slate-200 capitalize">{v.capability}</span>
                        </div>
                        {v.tool_attempted && (
                          <div>
                            <span className="text-slate-500">Tool Attempted:</span>{' '}
                            <span className="text-red-300 font-mono">{v.tool_attempted}</span>
                          </div>
                        )}
                        {v.command_attempted && (
                          <div>
                            <span className="text-slate-500">Command:</span>{' '}
                            <span className="text-red-300 font-mono">{v.command_attempted}</span>
                          </div>
                        )}
                        {v.file_attempted && (
                          <div className="col-span-2">
                            <span className="text-slate-500">File:</span>{' '}
                            <span className="text-red-300 font-mono">{v.file_attempted}</span>
                          </div>
                        )}
                        <div className="col-span-2">
                          <span className="text-slate-500">Violation:</span>{' '}
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
      )}
    </div>
  );
}
