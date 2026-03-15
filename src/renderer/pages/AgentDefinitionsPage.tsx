import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FiCpu,
  FiDownload,
  FiEye,
  FiLock,
  FiSearch,
  FiShield,
  FiTerminal,
  FiTool,
  FiUpload,
  FiUsers,
} from 'react-icons/fi';
import type { AgentDefinition } from '../../shared/types';

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

function RoleDetail({ def }: { def: AgentDefinition }) {
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className={`p-3 rounded-lg ${config.bgColor} ${config.color}`}>{config.icon}</div>
        <div>
          <h2 className={`text-xl font-bold ${config.color}`}>{def.display_name}</h2>
          <span className="text-sm text-slate-500">Role: {def.role}</span>
        </div>
        <span className={`ml-auto text-sm px-3 py-1 rounded-full border ${modelColors}`}>
          Default Model: {def.default_model}
        </span>
      </div>

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
              <div key={restriction} className="flex items-center gap-2 text-sm text-red-400/80">
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
    </div>
  );
}

export function AgentDefinitionsPage() {
  const [definitions, setDefinitions] = useState<AgentDefinition[]>([]);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [selectedForExport, setSelectedForExport] = useState<Set<string>>(new Set());
  const [showExportSelect, setShowExportSelect] = useState(false);
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
      {/* Header with Import/Export */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">Agent Definitions</h1>
          <p className="text-sm text-slate-400 mt-1">
            {definitions.length} role{definitions.length !== 1 ? 's' : ''} defined
          </p>
        </div>
        <div className="flex items-center gap-2">
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

        {/* Right: Detail View */}
        <div className="flex-1 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800/30 p-6">
          {selectedDef ? (
            <RoleDetail def={selectedDef} />
          ) : (
            <div className="flex items-center justify-center h-full text-slate-500">
              Select a role to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
