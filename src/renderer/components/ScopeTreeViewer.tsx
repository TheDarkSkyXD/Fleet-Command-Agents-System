import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FiChevronDown,
  FiChevronRight,
  FiFile,
  FiFolder,
  FiLoader,
  FiMap,
  FiSearch,
  FiUser,
} from 'react-icons/fi';
import type { FileTreeNode, Session } from '../../shared/types';
import { useProjectStore } from '../stores/projectStore';

/** Distinct colors for up to 10 agents - after that, colors recycle */
const AGENT_COLORS = [
  { bg: 'bg-blue-500/15', text: 'text-blue-400', dot: 'bg-blue-400', border: 'border-blue-500/30', label: 'Blue' },
  { bg: 'bg-emerald-500/15', text: 'text-emerald-400', dot: 'bg-emerald-400', border: 'border-emerald-500/30', label: 'Green' },
  { bg: 'bg-purple-500/15', text: 'text-purple-400', dot: 'bg-purple-400', border: 'border-purple-500/30', label: 'Purple' },
  { bg: 'bg-amber-500/15', text: 'text-amber-400', dot: 'bg-amber-400', border: 'border-amber-500/30', label: 'Amber' },
  { bg: 'bg-cyan-500/15', text: 'text-cyan-400', dot: 'bg-cyan-400', border: 'border-cyan-500/30', label: 'Cyan' },
  { bg: 'bg-rose-500/15', text: 'text-rose-400', dot: 'bg-rose-400', border: 'border-rose-500/30', label: 'Rose' },
  { bg: 'bg-teal-500/15', text: 'text-teal-400', dot: 'bg-teal-400', border: 'border-teal-500/30', label: 'Teal' },
  { bg: 'bg-orange-500/15', text: 'text-orange-400', dot: 'bg-orange-400', border: 'border-orange-500/30', label: 'Orange' },
  { bg: 'bg-indigo-500/15', text: 'text-indigo-400', dot: 'bg-indigo-400', border: 'border-indigo-500/30', label: 'Indigo' },
  { bg: 'bg-pink-500/15', text: 'text-pink-400', dot: 'bg-pink-400', border: 'border-pink-500/30', label: 'Pink' },
];

interface AgentScope {
  agentName: string;
  sessionId: string;
  capability: string;
  paths: string[];
  colorIndex: number;
}

/** Check if a file path matches an agent's scope (exact match or within a scoped directory) */
function pathMatchesScope(filePath: string, scopePaths: string[]): boolean {
  const fp = filePath.toLowerCase();
  for (const sp of scopePaths) {
    const scope = sp.toLowerCase().trim();
    if (!scope) continue;
    // Exact match
    if (fp === scope) return true;
    // File is inside scoped directory
    if (fp.startsWith(`${scope}/`)) return true;
    // Scope is inside this file's directory (the scope is more specific)
    if (scope.startsWith(`${fp}/`)) return true;
    // Glob pattern: scope ends with /** or /*
    const cleanScope = scope.replace(/\/\*\*?$/, '');
    if (cleanScope && fp.startsWith(`${cleanScope}/`)) return true;
    if (cleanScope && fp === cleanScope) return true;
  }
  return false;
}

/** Find which agent owns a given file path */
function findOwnerAgent(filePath: string, agentScopes: AgentScope[]): AgentScope | null {
  for (const agent of agentScopes) {
    if (pathMatchesScope(filePath, agent.paths)) return agent;
  }
  return null;
}

/** Check if directory contains any scoped files */
function dirContainsScopedFiles(node: FileTreeNode, agentScopes: AgentScope[]): boolean {
  if (!node.isDirectory || !node.children) return false;
  for (const child of node.children) {
    if (!child.isDirectory) {
      if (findOwnerAgent(child.relativePath, agentScopes)) return true;
    } else {
      if (dirContainsScopedFiles(child, agentScopes)) return true;
    }
  }
  return false;
}

/** Scope-aware tree node (read-only, no checkboxes) */
function ScopeTreeNode({
  node,
  agentScopes,
  expandedDirs,
  onToggleExpand,
  depth,
  searchFilter,
}: {
  node: FileTreeNode;
  agentScopes: AgentScope[];
  expandedDirs: Set<string>;
  onToggleExpand: (path: string) => void;
  depth: number;
  searchFilter: string;
}) {
  const isExpanded = expandedDirs.has(node.relativePath);
  const ownerAgent = findOwnerAgent(node.relativePath, agentScopes);
  const colorScheme = ownerAgent ? AGENT_COLORS[ownerAgent.colorIndex % AGENT_COLORS.length] : null;

  // Filter: if search is active, only show matching nodes
  if (searchFilter) {
    const matchesSelf = node.name.toLowerCase().includes(searchFilter.toLowerCase());
    const hasMatchingChild = node.isDirectory && hasMatchingDescendant(node, searchFilter);
    if (!matchesSelf && !hasMatchingChild) return null;
  }

  return (
    <div data-testid={`scope-tree-node-${node.relativePath}`}>
      <div
        className={`flex items-center gap-1.5 py-0.5 px-1 rounded transition-colors group ${
          colorScheme ? `${colorScheme.bg} hover:brightness-110` : 'hover:bg-slate-700/50'
        }`}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
        title={
          ownerAgent
            ? `Assigned to: ${ownerAgent.agentName} (${ownerAgent.capability})`
            : 'Unassigned'
        }
      >
        {/* Expand/collapse for directories */}
        {node.isDirectory ? (
          <button
            type="button"
            onClick={() => onToggleExpand(node.relativePath)}
            className="p-0.5 text-slate-400 hover:text-slate-200"
          >
            {isExpanded ? (
              <FiChevronDown className="h-3.5 w-3.5" />
            ) : (
              <FiChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        ) : (
          <span className="w-[18px]" />
        )}

        {/* Color dot indicator */}
        {colorScheme && (
          <span
            className={`h-2 w-2 rounded-full flex-shrink-0 ${colorScheme.dot}`}
            data-testid={`scope-dot-${node.relativePath}`}
          />
        )}

        {/* Icon */}
        {node.isDirectory ? (
          <FiFolder
            className={`h-3.5 w-3.5 flex-shrink-0 ${colorScheme ? colorScheme.text : 'text-amber-400'}`}
          />
        ) : (
          <FiFile
            className={`h-3.5 w-3.5 flex-shrink-0 ${colorScheme ? colorScheme.text : 'text-slate-400'}`}
          />
        )}

        {/* Name */}
        <span
          className={`text-xs truncate ${colorScheme ? `${colorScheme.text} font-medium` : 'text-slate-400'}`}
          title={node.relativePath}
        >
          {node.name}
        </span>

        {/* Agent tag on hover */}
        {ownerAgent && (
          <span
            className={`ml-auto text-[10px] opacity-0 group-hover:opacity-100 transition-opacity px-1.5 py-0.5 rounded ${colorScheme?.bg} ${colorScheme?.text} border ${colorScheme?.border}`}
          >
            {ownerAgent.agentName}
          </span>
        )}
      </div>

      {/* Children */}
      {node.isDirectory && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <ScopeTreeNode
              key={child.relativePath}
              node={child}
              agentScopes={agentScopes}
              expandedDirs={expandedDirs}
              onToggleExpand={onToggleExpand}
              depth={depth + 1}
              searchFilter={searchFilter}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Check if any descendant matches search */
function hasMatchingDescendant(node: FileTreeNode, search: string): boolean {
  if (!node.children) return false;
  for (const child of node.children) {
    if (child.name.toLowerCase().includes(search.toLowerCase())) return true;
    if (child.isDirectory && hasMatchingDescendant(child, search)) return true;
  }
  return false;
}

interface ScopeTreeViewerProps {
  /** Max height for the tree container */
  maxHeight?: string;
}

export function ScopeTreeViewer({ maxHeight = '400px' }: ScopeTreeViewerProps) {
  const { activeProject } = useProjectStore();
  const [tree, setTree] = useState<FileTreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [searchFilter, setSearchFilter] = useState('');
  const [agentScopes, setAgentScopes] = useState<AgentScope[]>([]);

  const rootPath = activeProject?.path || null;

  // Load file tree and agent scopes
  useEffect(() => {
    if (!rootPath) {
      setTree([]);
      setAgentScopes([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      window.electronAPI.projectFileTree(rootPath, 4),
      window.electronAPI.agentList(),
    ])
      .then(([treeResult, agentsResult]) => {
        if (cancelled) return;

        if (treeResult.error) {
          setError(treeResult.error);
          return;
        }

        if (treeResult.data) {
          setTree(treeResult.data);
          // Auto-expand first level
          const firstLevel = new Set(
            treeResult.data.filter((n) => n.isDirectory).map((n) => n.relativePath),
          );
          setExpandedDirs(firstLevel);
        }

        // Extract builder scopes from active sessions
        if (agentsResult.data) {
          const activeSessions = agentsResult.data.filter(
            (s: Session) =>
              s.state !== 'completed' &&
              s.file_scope &&
              s.file_scope.trim() !== '',
          );

          const scopes: AgentScope[] = activeSessions.map((s: Session, idx: number) => ({
            agentName: s.agent_name,
            sessionId: s.id,
            capability: s.capability,
            paths: (s.file_scope || '')
              .split(',')
              .map((p: string) => p.trim())
              .filter(Boolean),
            colorIndex: idx,
          }));

          setAgentScopes(scopes);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [rootPath]);

  const handleToggleExpand = useCallback((path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // Count scoped vs unscoped files
  const scopeStats = useMemo(() => {
    let scoped = 0;
    let unscoped = 0;

    function countFiles(nodes: FileTreeNode[]) {
      for (const node of nodes) {
        if (!node.isDirectory) {
          if (findOwnerAgent(node.relativePath, agentScopes)) {
            scoped++;
          } else {
            unscoped++;
          }
        }
        if (node.children) countFiles(node.children);
      }
    }

    countFiles(tree);
    return { scoped, unscoped, total: scoped + unscoped };
  }, [tree, agentScopes]);

  if (!rootPath) {
    return (
      <div
        className="rounded-lg border border-slate-600 bg-slate-800/50 p-4 text-center"
        data-testid="scope-tree-viewer"
      >
        <FiMap className="h-6 w-6 text-slate-400 mx-auto mb-2" />
        <p className="text-sm text-slate-400">No active project</p>
        <p className="text-xs text-slate-400 mt-1">Select a project to view scope assignments</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className="rounded-lg border border-slate-600 bg-slate-800/50 p-6 flex items-center justify-center gap-2"
        data-testid="scope-tree-viewer"
      >
        <FiLoader className="h-4 w-4 text-blue-400 animate-spin" />
        <span className="text-sm text-slate-400">Loading scope map...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400"
        data-testid="scope-tree-viewer"
      >
        Failed to load scope map: {error}
      </div>
    );
  }

  return (
    <div
      className="rounded-lg border border-slate-600 bg-slate-800/50"
      data-testid="scope-tree-viewer"
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-slate-600 px-3 py-2">
        <FiMap className="h-4 w-4 text-blue-400 flex-shrink-0" />
        <span className="text-sm font-medium text-slate-200">Scope Map</span>
        <span className="text-xs text-slate-400 ml-auto">
          {scopeStats.scoped} assigned / {scopeStats.total} files
        </span>
      </div>

      {/* Legend - Agent to color mapping */}
      {agentScopes.length > 0 && (
        <div
          className="flex flex-wrap gap-2 px-3 py-2 border-b border-slate-600 bg-slate-900/30"
          data-testid="scope-tree-legend"
        >
          {agentScopes.map((agent) => {
            const color = AGENT_COLORS[agent.colorIndex % AGENT_COLORS.length];
            return (
              <div
                key={agent.sessionId}
                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ${color.bg} ${color.text} border ${color.border}`}
                title={`${agent.agentName} (${agent.capability}): ${agent.paths.join(', ')}`}
                data-testid={`scope-legend-${agent.agentName}`}
              >
                <span className={`h-2 w-2 rounded-full ${color.dot}`} />
                <FiUser className="h-2.5 w-2.5" />
                <span className="font-medium">{agent.agentName}</span>
                <span className="opacity-60">({agent.paths.length} paths)</span>
              </div>
            );
          })}
          <div
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs bg-slate-500/15 text-slate-400 border border-slate-500/30"
            data-testid="scope-legend-unassigned"
          >
            <span className="h-2 w-2 rounded-full bg-slate-500" />
            <span>Unassigned</span>
          </div>
        </div>
      )}

      {agentScopes.length === 0 && (
        <div className="px-3 py-2 border-b border-slate-600 bg-slate-900/30">
          <p className="text-xs text-slate-400">
            No agents with file scopes assigned. Spawn builder agents with file scopes to see scope visualization.
          </p>
        </div>
      )}

      {/* Search */}
      <div className="flex items-center gap-2 border-b border-slate-600 px-2 py-1.5">
        <FiSearch className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
        <input
          type="text"
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          placeholder="Filter files..."
          className="flex-1 bg-transparent text-xs text-slate-200 placeholder-slate-500 focus:outline-none"
          data-testid="scope-tree-search"
        />
      </div>

      {/* Tree */}
      <div
        className="overflow-y-auto p-1"
        style={{ maxHeight }}
        data-testid="scope-tree-container"
      >
        {tree.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-2">No files found</p>
        ) : (
          tree.map((node) => (
            <ScopeTreeNode
              key={node.relativePath}
              node={node}
              agentScopes={agentScopes}
              expandedDirs={expandedDirs}
              onToggleExpand={handleToggleExpand}
              depth={0}
              searchFilter={searchFilter}
            />
          ))
        )}
      </div>
    </div>
  );
}
