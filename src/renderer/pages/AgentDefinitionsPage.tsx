import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FiAlertTriangle,
  FiCheck,
  FiCpu,
  FiDownload,
  FiEdit3,
  FiEye,
  FiFileText,
  FiLayers,
  FiLock,
  FiPlus,
  FiRefreshCw,
  FiSave,
  FiSearch,
  FiShield,
  FiTerminal,
  FiTool,
  FiTrash2,
  FiUpload,
  FiUsers,
  FiX,
} from 'react-icons/fi';
import type { AgentDefinition } from '../../shared/types';
import { useFormDirtyTracking } from '../hooks/useUnsavedChanges';

// Built-in roles that cannot be deleted
const BUILT_IN_ROLES = new Set([
  'scout',
  'builder',
  'reviewer',
  'lead',
  'merger',
  'coordinator',
  'monitor',
]);

// Available capabilities that can be assigned to custom roles
const AVAILABLE_CAPABILITIES = [
  'code_analysis',
  'code_writing',
  'code_review',
  'file_reading',
  'file_writing',
  'git_operations',
  'task_management',
  'agent_spawning',
  'agent_coordination',
  'testing',
  'debugging',
  'refactoring',
  'documentation',
  'search',
  'planning',
  'monitoring',
  'merging',
  'deployment',
];

// Role color and icon mappings
const roleConfig: Record<
  string,
  { color: string; bgColor: string; borderColor: string; icon: React.ReactNode }
> = {
  scout: {
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10',
    borderColor: 'border-cyan-500/30',
    icon: <FiSearch size={20} />,
  },
  builder: {
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
    icon: <FiTool size={20} />,
  },
  reviewer: {
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    icon: <FiEye size={20} />,
  },
  lead: {
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
    icon: <FiUsers size={20} />,
  },
  merger: {
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    icon: <FiTerminal size={20} />,
  },
  coordinator: {
    color: 'text-rose-400',
    bgColor: 'bg-rose-500/10',
    borderColor: 'border-rose-500/30',
    icon: <FiCpu size={20} />,
  },
  monitor: {
    color: 'text-teal-400',
    bgColor: 'bg-teal-500/10',
    borderColor: 'border-teal-500/30',
    icon: <FiShield size={20} />,
  },
};

const modelBadgeColors: Record<string, string> = {
  haiku: 'bg-emerald-600/20 text-emerald-400 border-emerald-600/30',
  sonnet: 'bg-blue-600/20 text-blue-400 border-blue-600/30',
  opus: 'bg-purple-600/20 text-purple-400 border-purple-600/30',
};

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

function RoleCard({
  def,
  isSelected,
  onSelect,
}: {
  def: AgentDefinition;
  isSelected: boolean;
  onSelect: (role: string) => void;
}) {
  const config = roleConfig[def.role] || {
    color: 'text-slate-400',
    bgColor: 'bg-slate-500/10',
    borderColor: 'border-slate-500/30',
    icon: <FiUsers size={20} />,
  };
  const capabilities = parseJsonArray(def.capabilities);
  const modelColors =
    modelBadgeColors[def.default_model] || 'bg-slate-600/20 text-slate-400 border-slate-600/30';
  const isCustom = !BUILT_IN_ROLES.has(def.role);

  return (
    <button
      type="button"
      onClick={() => onSelect(def.role)}
      className={`w-full text-left rounded-lg border p-4 transition-all duration-150 ${
        isSelected
          ? `${config.borderColor} ${config.bgColor} ring-1 ring-${config.color.replace('text-', '')}`
          : 'border-slate-700 bg-slate-800/50 hover:bg-slate-800 hover:border-slate-600'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 ${config.color}`}>{config.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className={`font-semibold ${config.color}`}>{def.display_name}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${modelColors}`}>
              {def.default_model}
            </span>
            {isCustom && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                Custom
              </span>
            )}
          </div>
          <p className="text-sm text-slate-400 line-clamp-2">{def.description}</p>
          <div className="flex flex-wrap gap-1 mt-2">
            {capabilities.slice(0, 4).map((cap) => (
              <span
                key={cap}
                className="text-xs px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400"
              >
                {cap.replace(/_/g, ' ')}
              </span>
            ))}
            {capabilities.length > 4 && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-500">
                +{capabilities.length - 4} more
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// Markdown syntax highlighting for the editor
function highlightMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    let className = 'text-slate-300';
    if (/^#{1,6}\s/.test(line)) className = 'text-blue-400 font-bold';
    else if (/^>\s/.test(line)) className = 'text-green-400 italic';
    else if (/^[-*]\s/.test(line)) className = 'text-amber-400';
    else if (/^\d+\.\s/.test(line)) className = 'text-amber-400';
    else if (/^```/.test(line)) className = 'text-purple-400';
    else if (/^---/.test(line)) className = 'text-slate-500';

    return (
      <div key={`line-${i}-${line.slice(0, 20)}`} className="flex">
        <span className="w-10 text-right pr-3 text-slate-600 select-none text-xs leading-6">
          {i + 1}
        </span>
        <span className={className}>{line || '\u00A0'}</span>
      </div>
    );
  });
}

function InstructionEditor({
  role,
  onClose,
}: {
  role: string;
  onClose: () => void;
}) {
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDefault, setIsDefault] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Track definition editor dirty state for beforeunload warning
  const isEditorDirty = useMemo(
    () => content !== originalContent && originalContent !== '',
    [content, originalContent],
  );
  useFormDirtyTracking(`agent-def-editor-${role}`, 'Agent Definition Editor', isEditorDirty);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const result = await window.electronAPI.agentDefInstructionRead(role);
        if (result.error) {
          setError(result.error);
        } else if (result.data) {
          setContent(result.data.content);
          setOriginalContent(result.data.content);
          setIsDefault(!!result.data.isDefault);
        }
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [role]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      const result = await window.electronAPI.agentDefInstructionWrite(role, content);
      if (result.error) {
        setError(result.error);
      } else {
        setOriginalContent(content);
        setIsDefault(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = content !== originalContent;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400 flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
          Loading instructions...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Editor Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FiEdit3 size={16} className="text-blue-400" />
          <h3 className="text-sm font-medium text-slate-200">Instructions — {role}.md</h3>
          {isDefault && (
            <span className="text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
              Default Template
            </span>
          )}
          {hasChanges && (
            <span className="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/30">
              Unsaved Changes
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="text-xs text-green-400 flex items-center gap-1">
              <FiCheck size={12} />
              Saved
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
              hasChanges
                ? 'bg-blue-600 text-white hover:bg-blue-500'
                : 'bg-slate-700 text-slate-500 cursor-not-allowed'
            }`}
            data-testid="save-instruction-btn"
          >
            <FiSave size={14} />
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-700 text-slate-300 text-sm hover:bg-slate-600 transition-colors"
          >
            <FiX size={14} />
            Close
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md px-3 py-2 text-sm bg-red-500/10 text-red-400 border border-red-500/30 flex items-center justify-between gap-2" data-testid="config-editor-error">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-red-400 hover:text-red-200 transition-colors shrink-0" title="Dismiss error">
            <FiX size={14} />
          </button>
        </div>
      )}

      {/* Split Editor: Textarea + Preview */}
      <div className="grid grid-cols-2 gap-3" style={{ height: 'calc(100vh - 360px)' }}>
        {/* Left: Edit pane */}
        <div className="rounded-lg border border-slate-700 bg-slate-900 overflow-hidden flex flex-col">
          <div className="px-3 py-1.5 bg-slate-800 border-b border-slate-700 text-xs text-slate-400 font-medium">
            Edit
          </div>
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="flex-1 w-full bg-transparent text-slate-300 font-mono text-sm p-3 resize-none focus:outline-none leading-6"
            spellCheck={false}
            data-testid="instruction-editor"
          />
        </div>

        {/* Right: Syntax-highlighted preview */}
        <div className="rounded-lg border border-slate-700 bg-slate-900 overflow-hidden flex flex-col">
          <div className="px-3 py-1.5 bg-slate-800 border-b border-slate-700 text-xs text-slate-400 font-medium">
            Preview (Syntax Highlighted)
          </div>
          <div
            className="flex-1 overflow-y-auto p-3 font-mono text-sm leading-6"
            data-testid="instruction-preview"
          >
            {highlightMarkdown(content)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Agent Manifest Viewer ────────────────────────────────────────
function ManifestViewer({ def }: { def: AgentDefinition }) {
  const config = roleConfig[def.role] || {
    color: 'text-slate-400',
    bgColor: 'bg-slate-500/10',
    borderColor: 'border-slate-500/30',
    icon: <FiUsers size={20} />,
  };
  const capabilities = parseJsonArray(def.capabilities);
  const tools = parseJsonArray(def.tool_allowlist);
  const restrictions = parseJsonArray(def.bash_restrictions);
  const modelColors =
    modelBadgeColors[def.default_model] || 'bg-slate-600/20 text-slate-400 border-slate-600/30';

  return (
    <div className="space-y-4" data-testid="manifest-viewer">
      {/* Manifest Header */}
      <div className="rounded-lg border border-slate-600 bg-slate-900 overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-800 border-b border-slate-700 flex items-center gap-2">
          <FiFileText size={14} className={config.color} />
          <span className="text-sm font-medium text-slate-200">
            Agent Manifest — {def.display_name}
          </span>
          <span className="text-xs text-slate-500 ml-auto font-mono">{def.role}</span>
        </div>

        <div className="p-4 space-y-4 font-mono text-sm">
          {/* Identity Section */}
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">Identity</div>
            <div className="grid grid-cols-[140px_1fr] gap-y-1.5">
              <span className="text-slate-500">role:</span>
              <span className={config.color}>{def.role}</span>
              <span className="text-slate-500">display_name:</span>
              <span className="text-slate-300">{def.display_name}</span>
              <span className="text-slate-500">description:</span>
              <span className="text-slate-400 text-xs leading-5">{def.description}</span>
            </div>
          </div>

          <div className="border-t border-slate-700/50" />

          {/* Model Section */}
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">Model</div>
            <div className="grid grid-cols-[140px_1fr] gap-y-1.5">
              <span className="text-slate-500">default_model:</span>
              <span>
                <span className={`px-2 py-0.5 rounded-full border text-xs ${modelColors}`}>
                  {def.default_model}
                </span>
              </span>
            </div>
          </div>

          <div className="border-t border-slate-700/50" />

          {/* Capabilities Section */}
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">
              Capabilities ({capabilities.length})
            </div>
            <div className="space-y-1">
              {capabilities.map((cap, i) => (
                <div key={cap} className="flex items-center gap-2">
                  <span className="text-slate-600 w-5 text-right">{i}:</span>
                  <span className={`${config.color} flex items-center gap-1.5`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
                    {cap}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-700/50" />

          {/* Tool Permissions Section */}
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">
              Tool Permissions ({tools.length})
            </div>
            {tools.length > 0 ? (
              <div className="space-y-1">
                {tools.map((tool) => (
                  <div key={tool} className="flex items-center gap-2">
                    <span className="text-green-500 text-xs">✓</span>
                    <span className="text-green-400/80">{tool}</span>
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-slate-600 italic">
                No tool restrictions (all tools allowed)
              </span>
            )}
          </div>

          <div className="border-t border-slate-700/50" />

          {/* Constraints Section */}
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">
              Constraints & Restrictions
            </div>

            {/* Bash Restrictions */}
            <div className="mb-3">
              <div className="text-xs text-slate-500 mb-1">bash_restrictions:</div>
              {restrictions.length > 0 ? (
                <div className="space-y-1 ml-3">
                  {restrictions.map((r) => (
                    <div key={r} className="flex items-center gap-2">
                      <span className="text-red-500 text-xs">✗</span>
                      <span className="text-red-400/80">{r}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-slate-600 italic ml-3">none</span>
              )}
            </div>

            {/* File Scope */}
            <div>
              <div className="text-xs text-slate-500 mb-1">file_scope:</div>
              <span
                className={`ml-3 ${def.file_scope ? 'text-amber-400/80' : 'text-slate-600 italic'}`}
              >
                {def.file_scope || 'unrestricted'}
              </span>
            </div>
          </div>

          <div className="border-t border-slate-700/50" />

          {/* Metadata */}
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">Metadata</div>
            <div className="grid grid-cols-[140px_1fr] gap-y-1.5 text-xs">
              <span className="text-slate-500">created_at:</span>
              <span className="text-slate-500">{def.created_at}</span>
              <span className="text-slate-500">updated_at:</span>
              <span className="text-slate-500">{def.updated_at}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RoleDetail({
  def,
  onEditInstructions,
  onPreviewOverlay,
  onDelete,
}: {
  def: AgentDefinition;
  onEditInstructions: (role: string) => void;
  onPreviewOverlay: (role: string) => void;
  onDelete?: (role: string) => void;
}) {
  const [viewMode, setViewMode] = useState<'details' | 'manifest'>('details');
  const config = roleConfig[def.role] || {
    color: 'text-slate-400',
    bgColor: 'bg-slate-500/10',
    borderColor: 'border-slate-500/30',
    icon: <FiUsers size={20} />,
  };
  const capabilities = parseJsonArray(def.capabilities);
  const tools = parseJsonArray(def.tool_allowlist);
  const restrictions = parseJsonArray(def.bash_restrictions);
  const modelColors =
    modelBadgeColors[def.default_model] || 'bg-slate-600/20 text-slate-400 border-slate-600/30';
  const isCustom = !BUILT_IN_ROLES.has(def.role);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className={`p-3 rounded-lg ${config.bgColor} ${config.color}`}>{config.icon}</div>
        <div>
          <div className="flex items-center gap-2">
            <h2 className={`text-xl font-bold ${config.color}`}>{def.display_name}</h2>
            {isCustom && (
              <span className="text-xs px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                Custom Role
              </span>
            )}
          </div>
          <span className="text-sm text-slate-500">Role: {def.role}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPreviewOverlay(def.role)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-purple-600/20 text-purple-400 border border-purple-500/30 text-sm hover:bg-purple-600/30 transition-colors"
            data-testid="preview-overlay-btn"
          >
            <FiLayers size={14} />
            Preview Overlay
          </button>
          <button
            type="button"
            onClick={() => onEditInstructions(def.role)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600/20 text-blue-400 border border-blue-500/30 text-sm hover:bg-blue-600/30 transition-colors"
            data-testid="edit-instructions-btn"
          >
            <FiEdit3 size={14} />
            Edit Instructions
          </button>
          {isCustom && onDelete && (
            <button
              type="button"
              onClick={() => onDelete(def.role)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-600/20 text-red-400 border border-red-500/30 text-sm hover:bg-red-600/30 transition-colors"
              data-testid="delete-role-btn"
            >
              <FiTrash2 size={14} />
              Delete
            </button>
          )}
          <span className={`text-sm px-3 py-1 rounded-full border ${modelColors}`}>
            Default Model: {def.default_model}
          </span>
        </div>
      </div>

      {/* View Mode Tabs */}
      <div className="flex gap-1 border-b border-slate-700 pb-0">
        <button
          type="button"
          onClick={() => setViewMode('details')}
          className={`px-3 py-2 text-sm font-medium rounded-t-md border-b-2 transition-colors ${
            viewMode === 'details'
              ? 'text-slate-200 border-blue-500 bg-slate-800/50'
              : 'text-slate-500 border-transparent hover:text-slate-300'
          }`}
          data-testid="view-details-tab"
        >
          <span className="flex items-center gap-1.5">
            <FiEye size={14} />
            Details
          </span>
        </button>
        <button
          type="button"
          onClick={() => setViewMode('manifest')}
          className={`px-3 py-2 text-sm font-medium rounded-t-md border-b-2 transition-colors ${
            viewMode === 'manifest'
              ? 'text-slate-200 border-emerald-500 bg-slate-800/50'
              : 'text-slate-500 border-transparent hover:text-slate-300'
          }`}
          data-testid="view-manifest-tab"
        >
          <span className="flex items-center gap-1.5">
            <FiFileText size={14} />
            Manifest
          </span>
        </button>
      </div>

      {viewMode === 'manifest' ? (
        <ManifestViewer def={def} />
      ) : (
        <>
          {/* Description */}
          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
            <h3 className="text-sm font-medium text-slate-300 mb-2">Description</h3>
            <p className="text-sm text-slate-400 leading-relaxed">{def.description}</p>
          </div>

          {/* Capabilities */}
          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
            <h3 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
              <FiTool size={14} />
              Capabilities
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {capabilities.map((cap) => (
                <div
                  key={cap}
                  className={`flex items-center gap-2 text-sm ${config.color} ${config.bgColor} rounded px-3 py-1.5`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  {cap.replace(/_/g, ' ')}
                </div>
              ))}
            </div>
          </div>

          {/* Tool Allowlist */}
          {tools.length > 0 && (
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
              <h3 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
                <FiTerminal size={14} />
                Tool Allowlist
              </h3>
              <div className="flex flex-wrap gap-2">
                {tools.map((tool) => (
                  <span
                    key={tool}
                    className="text-sm px-2.5 py-1 rounded-md bg-slate-700 text-slate-300 border border-slate-600"
                  >
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Bash Restrictions */}
          {restrictions.length > 0 && (
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
              <h3 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
                <FiLock size={14} />
                Bash Restrictions
              </h3>
              <div className="space-y-1.5">
                {restrictions.map((restriction) => (
                  <div
                    key={restriction}
                    className="flex items-center gap-2 text-sm text-red-400/80"
                  >
                    <span className="text-red-500">&#10005;</span>
                    {restriction}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* File Scope */}
          {def.file_scope && (
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
              <h3 className="text-sm font-medium text-slate-300 mb-2">File Scope</h3>
              <p className="text-sm text-slate-400">{def.file_scope}</p>
            </div>
          )}

          {/* Timestamps */}
          <div className="text-xs text-slate-600 flex gap-4">
            <span>Created: {new Date(def.created_at).toLocaleString()}</span>
            <span>Updated: {new Date(def.updated_at).toLocaleString()}</span>
          </div>
        </>
      )}
    </div>
  );
}

// ── Create Role Modal ────────────────────────────────────────────
function CreateRoleModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (def: AgentDefinition) => void;
}) {
  const [roleName, setRoleName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [defaultModel, setDefaultModel] = useState('sonnet');
  const [selectedCapabilities, setSelectedCapabilities] = useState<Set<string>>(new Set());
  const [toolAllowlist, setToolAllowlist] = useState('');
  const [bashRestrictions, setBashRestrictions] = useState('');
  const [fileScope, setFileScope] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleCapability = (cap: string) => {
    setSelectedCapabilities((prev) => {
      const next = new Set(prev);
      if (next.has(cap)) {
        next.delete(cap);
      } else {
        next.add(cap);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!roleName.trim() || !displayName.trim() || !description.trim()) {
      setError('Role name, display name, and description are required');
      return;
    }
    if (selectedCapabilities.size === 0) {
      setError('At least one capability must be selected');
      return;
    }
    const roleKey = roleName.trim().toLowerCase().replace(/\s+/g, '_');
    if (!/^[a-z][a-z0-9_]*$/.test(roleKey)) {
      setError(
        'Role name must start with a letter and contain only lowercase letters, numbers, and underscores',
      );
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const result = await window.electronAPI.agentDefCreate({
        role: roleKey,
        display_name: displayName.trim(),
        description: description.trim(),
        capabilities: JSON.stringify(Array.from(selectedCapabilities)),
        default_model: defaultModel,
        tool_allowlist: toolAllowlist.trim()
          ? JSON.stringify(
              toolAllowlist
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean),
            )
          : undefined,
        bash_restrictions: bashRestrictions.trim()
          ? JSON.stringify(
              bashRestrictions
                .split(',')
                .map((r) => r.trim())
                .filter(Boolean),
            )
          : undefined,
        file_scope: fileScope.trim() || undefined,
      });
      if (result.error) {
        setError(result.error);
      } else if (result.data) {
        onCreated(result.data);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      data-testid="create-role-modal"
    >
      <div className="w-full max-w-2xl bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <FiPlus size={18} className="text-green-400" />
            Create Custom Agent Role
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
            title="Close"
          >
            <FiX size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {error && (
            <div className="rounded-md px-3 py-2 text-sm bg-red-500/10 text-red-400 border border-red-500/30 flex items-center justify-between gap-2" data-testid="definition-editor-error">
              <span>{error}</span>
              <button type="button" onClick={() => setError(null)} className="text-red-400 hover:text-red-200 transition-colors shrink-0" title="Dismiss error">
                <FiX size={14} />
              </button>
            </div>
          )}

          {/* Role Name */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Role Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              placeholder="e.g., architect, tester, deployer"
              className="w-full px-3 py-2 rounded-md bg-slate-900 border border-slate-600 text-slate-200 text-sm focus:outline-none focus:border-blue-500 placeholder-slate-500"
              data-testid="create-role-name"
            />
            <p className="text-xs text-slate-500 mt-1">
              Lowercase identifier (letters, numbers, underscores)
            </p>
          </div>

          {/* Display Name */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Display Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g., Architect, Test Runner"
              className="w-full px-3 py-2 rounded-md bg-slate-900 border border-slate-600 text-slate-200 text-sm focus:outline-none focus:border-blue-500 placeholder-slate-500"
              data-testid="create-role-display-name"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Description <span className="text-red-400">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this agent role does..."
              rows={3}
              className="w-full px-3 py-2 rounded-md bg-slate-900 border border-slate-600 text-slate-200 text-sm focus:outline-none focus:border-blue-500 placeholder-slate-500 resize-none"
              data-testid="create-role-description"
            />
          </div>

          {/* Default Model */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Default Model</label>
            <select
              value={defaultModel}
              onChange={(e) => setDefaultModel(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-slate-900 border border-slate-600 text-slate-200 text-sm focus:outline-none focus:border-blue-500"
              data-testid="create-role-model"
            >
              <option value="haiku">Haiku</option>
              <option value="sonnet">Sonnet</option>
              <option value="opus">Opus</option>
            </select>
          </div>

          {/* Capabilities */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Capabilities <span className="text-red-400">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {AVAILABLE_CAPABILITIES.map((cap) => (
                <button
                  key={cap}
                  type="button"
                  onClick={() => toggleCapability(cap)}
                  className={`text-xs px-2.5 py-1.5 rounded-md border text-left transition-colors ${
                    selectedCapabilities.has(cap)
                      ? 'bg-green-500/15 text-green-400 border-green-500/40'
                      : 'bg-slate-900 text-slate-400 border-slate-600 hover:border-slate-500'
                  }`}
                  data-testid={`cap-${cap}`}
                >
                  {selectedCapabilities.has(cap) ? '\u2713 ' : ''}
                  {cap.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Tool Allowlist */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Tool Allowlist{' '}
              <span className="text-slate-500 font-normal">(optional, comma-separated)</span>
            </label>
            <input
              type="text"
              value={toolAllowlist}
              onChange={(e) => setToolAllowlist(e.target.value)}
              placeholder="e.g., Read, Write, Bash, Grep"
              className="w-full px-3 py-2 rounded-md bg-slate-900 border border-slate-600 text-slate-200 text-sm focus:outline-none focus:border-blue-500 placeholder-slate-500"
            />
          </div>

          {/* Bash Restrictions */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Bash Restrictions{' '}
              <span className="text-slate-500 font-normal">(optional, comma-separated)</span>
            </label>
            <input
              type="text"
              value={bashRestrictions}
              onChange={(e) => setBashRestrictions(e.target.value)}
              placeholder="e.g., git push, rm -rf, git reset --hard"
              className="w-full px-3 py-2 rounded-md bg-slate-900 border border-slate-600 text-slate-200 text-sm focus:outline-none focus:border-blue-500 placeholder-slate-500"
            />
          </div>

          {/* File Scope */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              File Scope <span className="text-slate-500 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={fileScope}
              onChange={(e) => setFileScope(e.target.value)}
              placeholder="e.g., src/tests/**, docs/**"
              className="w-full px-3 py-2 rounded-md bg-slate-900 border border-slate-600 text-slate-200 text-sm focus:outline-none focus:border-blue-500 placeholder-slate-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-700">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-md bg-slate-700 text-slate-300 text-sm hover:bg-slate-600 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-green-600 text-white text-sm hover:bg-green-500 transition-colors disabled:opacity-50"
            data-testid="create-role-submit"
          >
            <FiPlus size={14} />
            {saving ? 'Creating...' : 'Create Role'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Overlay Preview Modal ────────────────────────────────────────
function OverlayPreviewModal({
  def,
  onClose,
}: {
  def: AgentDefinition;
  onClose: () => void;
}) {
  const config = roleConfig[def.role] || {
    color: 'text-slate-400',
    bgColor: 'bg-slate-500/10',
    borderColor: 'border-slate-500/30',
    icon: <FiUsers size={20} />,
  };
  const capabilities = parseJsonArray(def.capabilities);
  const tools = parseJsonArray(def.tool_allowlist);
  const restrictions = parseJsonArray(def.bash_restrictions);

  // Simulate 3-layer overlay rendering
  const layer1Base = [
    '# Agent Base Instructions',
    '',
    'You are an AI coding agent operating within the Fleet Command system.',
    '',
    '## Core Rules',
    '- Follow all guard rules and restrictions',
    '- Stay within your assigned worktree',
    '- Report progress through the event system',
    '- Only use allowed tools for your role',
    '',
    '## Communication',
    '- Log important decisions',
    '- Report errors immediately',
    '- Update task status as you progress',
  ].join('\n');

  const layer2Parts = [
    `# Profile Overlay: ${def.display_name}`,
    '',
    `## Role: ${def.role}`,
    def.description,
    '',
    '## Capabilities',
    ...capabilities.map((c) => `- ${c.replace(/_/g, ' ')}`),
    '',
    `## Default Model: ${def.default_model}`,
  ];
  if (tools.length > 0) {
    layer2Parts.push('', '## Allowed Tools', ...tools.map((t) => `- ${t}`));
  }
  if (restrictions.length > 0) {
    layer2Parts.push('', '## Bash Restrictions', ...restrictions.map((r) => `- BLOCKED: ${r}`));
  }
  if (def.file_scope) {
    layer2Parts.push('', '## File Scope', def.file_scope);
  }
  const layer2Profile = layer2Parts.join('\n');

  const layer3Task = [
    '# Task Overlay',
    '',
    '## Current Assignment',
    '[Task details would be injected here at runtime]',
    '',
    '## Task-Specific Context',
    '- Worktree: /path/to/worktree',
    '- Branch: feature/task-branch',
    '- Parent Agent: coordinator-1',
    '',
    '## Task Instructions',
    'The specific task instructions and objectives would appear here',
    'when an agent is spawned with a task assignment.',
  ].join('\n');

  const finalRendered = `${layer1Base}\n\n---\n\n${layer2Profile}\n\n---\n\n${layer3Task}`;

  const [activeLayer, setActiveLayer] = useState<'all' | 'layer1' | 'layer2' | 'layer3'>('all');

  const getContent = () => {
    switch (activeLayer) {
      case 'layer1':
        return layer1Base;
      case 'layer2':
        return layer2Profile;
      case 'layer3':
        return layer3Task;
      default:
        return finalRendered;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      data-testid="overlay-preview-modal"
    >
      <div className="w-full max-w-4xl bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <FiLayers size={18} className={config.color} />
            Overlay Preview — {def.display_name}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
            title="Close"
          >
            <FiX size={18} />
          </button>
        </div>

        {/* Layer Tabs */}
        <div className="flex gap-1 px-6 py-3 border-b border-slate-700 bg-slate-800/50">
          {(
            [
              { key: 'all' as const, label: 'Final Rendered', color: 'text-slate-300' },
              { key: 'layer1' as const, label: 'Layer 1: Base', color: 'text-blue-400' },
              { key: 'layer2' as const, label: 'Layer 2: Profile', color: 'text-green-400' },
              { key: 'layer3' as const, label: 'Layer 3: Task', color: 'text-amber-400' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveLayer(tab.key)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeLayer === tab.key
                  ? `${tab.color} bg-slate-700`
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/50'
              }`}
              data-testid={`overlay-tab-${tab.key}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="rounded-lg border border-slate-700 bg-slate-900 p-4 font-mono text-sm leading-6">
            {highlightMarkdown(getContent())}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-700 text-xs text-slate-500">
          <span>
            {activeLayer === 'all'
              ? 'Showing final rendered output (all 3 layers combined)'
              : activeLayer === 'layer1'
                ? 'Layer 1: Base instructions shared by all agents'
                : activeLayer === 'layer2'
                  ? 'Layer 2: Role-specific profile overlay'
                  : 'Layer 3: Task-specific overlay (injected at spawn time)'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md bg-slate-700 text-slate-300 text-sm hover:bg-slate-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────
export function AgentDefinitionsPage() {
  const [definitions, setDefinitions] = useState<AgentDefinition[]>([]);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [selectedForExport, setSelectedForExport] = useState<Set<string>>(new Set());
  const [showExportSelect, setShowExportSelect] = useState(false);
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [overlayPreviewRole, setOverlayPreviewRole] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDefinitions = useCallback(async () => {
    try {
      setLoading(true);
      const result = await window.electronAPI.agentDefList();
      if (result.error) {
        setError(result.error);
      } else if (result.data) {
        setDefinitions(result.data);
        if (!selectedRole && result.data.length > 0) {
          setSelectedRole(result.data[0].role);
        }
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [selectedRole]);

  useEffect(() => {
    loadDefinitions();
  }, [loadDefinitions]);

  const selectedDef = definitions.find((d) => d.role === selectedRole);
  const overlayPreviewDef = definitions.find((d) => d.role === overlayPreviewRole);

  const handleExport = async () => {
    try {
      const roles = selectedForExport.size > 0 ? Array.from(selectedForExport) : undefined;
      const result = await window.electronAPI.agentDefExport(roles);
      if (result.error) {
        setImportStatus(`Export error: ${result.error}`);
        return;
      }
      if (result.data) {
        // Create a downloadable JSON blob
        const exportData = {
          version: 1,
          exported_at: new Date().toISOString(),
          definitions: result.data.map((d) => ({
            role: d.role,
            display_name: d.display_name,
            description: d.description,
            capabilities: d.capabilities,
            default_model: d.default_model,
            tool_allowlist: d.tool_allowlist,
            bash_restrictions: d.bash_restrictions,
            file_scope: d.file_scope,
          })),
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `agent-definitions-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setImportStatus(`Exported ${result.data.length} definitions successfully`);
        setShowExportSelect(false);
        setSelectedForExport(new Set());
      }
    } catch (err) {
      setImportStatus(`Export failed: ${String(err)}`);
    }
    setTimeout(() => setImportStatus(null), 3000);
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      let defs: Array<{
        role: string;
        display_name: string;
        description: string;
        capabilities: string;
        default_model: string;
        tool_allowlist?: string;
        bash_restrictions?: string;
        file_scope?: string;
      }>;

      if (parsed.definitions && Array.isArray(parsed.definitions)) {
        defs = parsed.definitions;
      } else if (Array.isArray(parsed)) {
        defs = parsed;
      } else {
        setImportStatus('Invalid file format: expected JSON with definitions array');
        setTimeout(() => setImportStatus(null), 3000);
        return;
      }

      // Validate each definition has required fields
      for (const def of defs) {
        if (
          !def.role ||
          !def.display_name ||
          !def.description ||
          !def.capabilities ||
          !def.default_model
        ) {
          setImportStatus(
            `Invalid definition: missing required fields for role "${def.role || 'unknown'}"`,
          );
          setTimeout(() => setImportStatus(null), 3000);
          return;
        }
      }

      const result = await window.electronAPI.agentDefImport(defs);
      if (result.error) {
        setImportStatus(`Import error: ${result.error}`);
      } else {
        setImportStatus(`Imported ${defs.length} definitions successfully`);
        if (result.data) {
          setDefinitions(result.data);
        }
      }
    } catch (err) {
      setImportStatus(`Import failed: ${String(err)}`);
    }
    setTimeout(() => setImportStatus(null), 3000);
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (role: string) => {
    if (confirmDelete !== role) {
      setConfirmDelete(role);
      setTimeout(() => setConfirmDelete(null), 5000);
      return;
    }
    try {
      const result = await window.electronAPI.agentDefDelete(role);
      if (result.error) {
        setImportStatus(`Delete error: ${result.error}`);
      } else {
        setDefinitions((prev) => prev.filter((d) => d.role !== role));
        if (selectedRole === role) {
          setSelectedRole(definitions[0]?.role || null);
        }
        setImportStatus(`Deleted role "${role}" successfully`);
        setConfirmDelete(null);
      }
    } catch (err) {
      setImportStatus(`Delete failed: ${String(err)}`);
    }
    setTimeout(() => setImportStatus(null), 3000);
  };

  const handleRoleCreated = (def: AgentDefinition) => {
    setDefinitions((prev) => [...prev, def]);
    setSelectedRole(def.role);
    setShowCreateModal(false);
    setImportStatus(`Created custom role "${def.display_name}" successfully`);
    setTimeout(() => setImportStatus(null), 3000);
  };

  const handleResetToDefaults = async () => {
    try {
      setResetting(true);
      const result = await window.electronAPI.agentDefResetDefaults();
      if (result.error) {
        setImportStatus(`Reset error: ${result.error}`);
      } else if (result.data) {
        setDefinitions(result.data);
        setSelectedRole(result.data[0]?.role || null);
        setImportStatus('All definitions reset to factory defaults');
      }
    } catch (err) {
      setImportStatus(`Reset failed: ${String(err)}`);
    } finally {
      setResetting(false);
      setShowResetConfirm(false);
    }
    setTimeout(() => setImportStatus(null), 3000);
  };

  const toggleExportSelection = (role: string) => {
    setSelectedForExport((prev) => {
      const next = new Set(prev);
      if (next.has(role)) {
        next.delete(role);
      } else {
        next.add(role);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400 flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
          Loading agent definitions...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-6 text-center">
        <p className="text-red-400">Failed to load agent definitions: {error}</p>
        <button
          type="button"
          onClick={loadDefinitions}
          className="mt-3 px-4 py-2 rounded bg-red-600 text-white text-sm hover:bg-red-500"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with Import/Export/Create */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">Agent Definitions</h1>
          <p className="text-sm text-slate-400 mt-1">
            {definitions.length} role{definitions.length !== 1 ? 's' : ''} defined
            {definitions.filter((d) => !BUILT_IN_ROLES.has(d.role)).length > 0 && (
              <span className="text-indigo-400 ml-1">
                ({definitions.filter((d) => !BUILT_IN_ROLES.has(d.role)).length} custom)
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Reset to Defaults */}
          <button
            type="button"
            onClick={() => setShowResetConfirm(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-md bg-slate-700 text-amber-400 text-sm hover:bg-slate-600 transition-colors border border-amber-500/20"
            data-testid="reset-defaults-btn"
          >
            <FiRefreshCw size={14} />
            Reset to Defaults
          </button>
          {/* Create New Role */}
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-md bg-green-600 text-white text-sm hover:bg-green-500 transition-colors"
            data-testid="create-role-btn"
          >
            <FiPlus size={14} />
            New Role
          </button>
          {/* Import */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-3 py-2 rounded-md bg-slate-700 text-slate-300 text-sm hover:bg-slate-600 transition-colors"
          >
            <FiUpload size={14} />
            Import
          </button>
          {/* Export */}
          {showExportSelect ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExport}
                className="flex items-center gap-2 px-3 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-500 transition-colors"
              >
                <FiDownload size={14} />
                Export {selectedForExport.size > 0 ? `(${selectedForExport.size})` : 'All'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowExportSelect(false);
                  setSelectedForExport(new Set());
                }}
                className="px-3 py-2 rounded-md bg-slate-700 text-slate-300 text-sm hover:bg-slate-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowExportSelect(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-md bg-slate-700 text-slate-300 text-sm hover:bg-slate-600 transition-colors"
            >
              <FiDownload size={14} />
              Export
            </button>
          )}
        </div>
      </div>

      {/* Import/Export Status Message */}
      {importStatus && (
        <div
          className={`rounded-md px-4 py-2 text-sm ${
            importStatus.includes('error') ||
            importStatus.includes('failed') ||
            importStatus.includes('Invalid')
              ? 'bg-red-500/10 text-red-400 border border-red-500/30'
              : 'bg-green-500/10 text-green-400 border border-green-500/30'
          }`}
        >
          {importStatus}
        </div>
      )}

      {/* Main Content: Split View */}
      <div className="flex gap-4" style={{ height: 'calc(100vh - 200px)' }}>
        {/* Left: Role List */}
        <div className="w-80 flex-shrink-0 space-y-2 overflow-y-auto pr-2">
          {definitions.map((def) => (
            <div key={def.role} className="relative">
              {showExportSelect && (
                <div className="absolute top-3 right-3 z-10">
                  <input
                    type="checkbox"
                    checked={selectedForExport.has(def.role)}
                    onChange={() => toggleExportSelection(def.role)}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500 cursor-pointer"
                  />
                </div>
              )}
              <RoleCard
                def={def}
                isSelected={selectedRole === def.role}
                onSelect={setSelectedRole}
              />
            </div>
          ))}
        </div>

        {/* Right: Detail View or Instruction Editor */}
        <div className="flex-1 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800/30 p-6">
          {editingRole ? (
            <InstructionEditor role={editingRole} onClose={() => setEditingRole(null)} />
          ) : selectedDef ? (
            <RoleDetail
              def={selectedDef}
              onEditInstructions={(role) => setEditingRole(role)}
              onPreviewOverlay={(role) => setOverlayPreviewRole(role)}
              onDelete={(role) => handleDelete(role)}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-slate-500">
              Select a role to view details
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Inline */}
      {confirmDelete && (
        <div className="fixed bottom-6 right-6 z-40 bg-slate-800 border border-red-500/40 rounded-lg shadow-2xl px-5 py-3 flex items-center gap-3">
          <span className="text-sm text-slate-300">
            Delete role <strong className="text-red-400">{confirmDelete}</strong>?
          </span>
          <button
            type="button"
            onClick={() => handleDelete(confirmDelete)}
            className="px-3 py-1.5 rounded-md bg-red-600 text-white text-sm hover:bg-red-500 transition-colors"
            data-testid="confirm-delete-btn"
          >
            Confirm Delete
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(null)}
            className="px-3 py-1.5 rounded-md bg-slate-700 text-slate-300 text-sm hover:bg-slate-600 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Create Role Modal */}
      {showCreateModal && (
        <CreateRoleModal onClose={() => setShowCreateModal(false)} onCreated={handleRoleCreated} />
      )}

      {/* Overlay Preview Modal */}
      {overlayPreviewDef && (
        <OverlayPreviewModal def={overlayPreviewDef} onClose={() => setOverlayPreviewRole(null)} />
      )}

      {/* Reset to Defaults Confirmation Modal */}
      {showResetConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && !resetting && setShowResetConfirm(false)}
          onKeyDown={(e) => e.key === 'Escape' && !resetting && setShowResetConfirm(false)}
          data-testid="reset-confirm-modal"
        >
          <div className="w-full max-w-md bg-slate-800 border border-amber-500/30 rounded-xl shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-700 flex items-center gap-3">
              <div className="p-2 rounded-full bg-amber-500/10">
                <FiAlertTriangle size={20} className="text-amber-400" />
              </div>
              <h2 className="text-lg font-semibold text-slate-100">Reset to Factory Defaults</h2>
            </div>
            <div className="px-6 py-4 space-y-3">
              <p className="text-sm text-slate-300">
                This will reset <strong>all agent definitions</strong> back to their factory
                defaults.
              </p>
              <div className="rounded-md bg-amber-500/5 border border-amber-500/20 px-3 py-2 text-xs text-amber-400/80 space-y-1">
                <div>• All 7 built-in roles will be restored to defaults</div>
                <div>• Any custom roles will be removed</div>
                <div>• All modifications to built-in roles will be lost</div>
                <div>• Instruction files on disk are not affected</div>
              </div>
              <p className="text-sm text-slate-400">
                This action cannot be undone. Consider exporting your definitions first.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-700">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                disabled={resetting}
                className="px-4 py-2 rounded-md bg-slate-700 text-slate-300 text-sm hover:bg-slate-600 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResetToDefaults}
                disabled={resetting}
                className="flex items-center gap-2 px-4 py-2 rounded-md bg-amber-600 text-white text-sm hover:bg-amber-500 transition-colors disabled:opacity-50"
                data-testid="confirm-reset-btn"
              >
                <FiRefreshCw size={14} className={resetting ? 'animate-spin' : ''} />
                {resetting ? 'Resetting...' : 'Reset All Definitions'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
