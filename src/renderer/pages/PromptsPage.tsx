import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FiChevronDown,
  FiChevronRight,
  FiClock,
  FiEdit2,
  FiEye,
  FiFile,
  FiFilePlus,
  FiGitBranch,
  FiPlus,
  FiSave,
  FiTrash2,
  FiX,
} from 'react-icons/fi';
import type { Prompt, PromptTreeNode, PromptType, PromptVersion } from '../../shared/types';
import { SlidePanel } from '../components/SlidePanel';

// ── Prompt Type Badge ─────────────────────────────────────────────
const typeColors: Record<PromptType, string> = {
  system: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  user: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  agent: 'bg-green-500/20 text-green-400 border-green-500/30',
  task: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  template: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
};

function TypeBadge({ type }: { type: PromptType }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${typeColors[type] || 'bg-slate-500/20 text-slate-400'}`}
    >
      {type}
    </span>
  );
}

// ── Build Tree ────────────────────────────────────────────────────
function buildTree(prompts: Prompt[]): PromptTreeNode[] {
  const map = new Map<string, PromptTreeNode>();
  const roots: PromptTreeNode[] = [];

  // Create nodes
  for (const p of prompts) {
    map.set(p.id, { ...p, children: [] });
  }

  // Link parent-child
  for (const node of map.values()) {
    if (node.parent_id && map.has(node.parent_id)) {
      const parent = map.get(node.parent_id);
      if (parent) parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort children alphabetically
  const sortChildren = (nodes: PromptTreeNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    for (const n of nodes) sortChildren(n.children);
  };
  sortChildren(roots);

  return roots;
}

// ── Inheritance Chain Resolution ──────────────────────────────────

interface InheritanceLink {
  id: string;
  name: string;
  type: PromptType;
  content: string;
}

/** Walk up the parent chain and return the full inheritance path (root → ... → self) */
function resolveInheritanceChain(prompt: Prompt, allPrompts: Prompt[]): InheritanceLink[] {
  const chain: InheritanceLink[] = [];
  const visited = new Set<string>();
  let current: Prompt | undefined = prompt;

  while (current) {
    if (visited.has(current.id)) break; // prevent cycles
    visited.add(current.id);
    chain.unshift({
      id: current.id,
      name: current.name,
      type: current.type,
      content: current.content,
    });
    const parentId = current.parent_id;
    current = parentId ? allPrompts.find((p) => p.id === parentId) : undefined;
  }

  return chain;
}

/** Merge content from the inheritance chain: parent content first, then child appends */
function renderMergedContent(chain: InheritanceLink[]): string {
  if (chain.length === 0) return '';
  if (chain.length === 1) return chain[0].content;
  return chain.map((link) => link.content).join('\n\n---\n\n');
}

/** Regex for template variables like {{var}}, {var}, or ${var} */
const TEMPLATE_VAR_PATTERN = /(\{\{[\w.]+\}\}|\$\{[\w.]+\}|\{[\w.]+\})/g;

/** Extract unique template variable names from content */
function extractTemplateVars(content: string): string[] {
  const matches = content.match(TEMPLATE_VAR_PATTERN);
  if (!matches) return [];
  return [...new Set(matches)];
}

/** Render content with highlighted template variables as React nodes */
function renderHighlightedContent(content: string): React.ReactNode[] {
  const parts = content.split(TEMPLATE_VAR_PATTERN);
  return parts.map((part) => {
    if (TEMPLATE_VAR_PATTERN.test(part)) {
      // Reset lastIndex since we reuse the regex
      TEMPLATE_VAR_PATTERN.lastIndex = 0;
      return (
        <span
          key={`var-${part}`}
          className="rounded bg-amber-500/20 px-1 py-0.5 font-semibold text-amber-300 border border-amber-500/30"
          data-testid="template-variable"
        >
          {part}
        </span>
      );
    }
    return part;
  });
}

// ── Prompt Preview Panel ─────────────────────────────────────────

function PromptPreviewPanel({
  prompt,
  prompts,
  onClose,
}: {
  prompt: Prompt;
  prompts: Prompt[];
  onClose: () => void;
}) {
  const chain = useMemo(() => resolveInheritanceChain(prompt, prompts), [prompt, prompts]);
  const mergedContent = useMemo(() => renderMergedContent(chain), [chain]);
  const templateVars = useMemo(() => extractTemplateVars(mergedContent), [mergedContent]);
  const highlightedContent = useMemo(
    () => renderHighlightedContent(mergedContent),
    [mergedContent],
  );

  return (
    <div className="flex h-full flex-col" data-testid="prompt-preview-panel">
      {/* Preview header */}
      <div className="flex items-center justify-between border-b border-slate-700 pb-3 mb-4">
        <div className="flex items-center gap-3">
          <FiEye size={18} className="text-cyan-400" />
          <h3 className="text-lg font-semibold text-slate-100">Rendered Preview</h3>
          <span className="text-sm text-slate-400">— {prompt.name}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1.5 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700"
        >
          <FiX size={14} />
          Close Preview
        </button>
      </div>

      {/* Inheritance chain visualization */}
      {chain.length > 1 && (
        <div className="mb-4" data-testid="inheritance-chain">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Inheritance Chain ({chain.length} levels)
          </h4>
          <div className="flex items-center gap-1 flex-wrap">
            {chain.map((link, idx) => (
              <div key={link.id} className="flex items-center gap-1">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium ${
                    idx === chain.length - 1
                      ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300'
                      : 'border-slate-600 bg-slate-800 text-slate-300'
                  }`}
                >
                  <TypeBadge type={link.type} />
                  {link.name}
                </span>
                {idx < chain.length - 1 && <span className="text-slate-500 mx-1">→</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Template variables summary */}
      {templateVars.length > 0 && (
        <div className="mb-4" data-testid="template-variables-summary">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Template Variables ({templateVars.length})
          </h4>
          <div className="flex flex-wrap gap-2">
            {templateVars.map((v) => (
              <span
                key={v}
                className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-mono text-amber-300"
              >
                {v}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Rendered content */}
      <div className="flex-1 overflow-auto" data-testid="rendered-output">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          {chain.length > 1 ? 'Merged Output' : 'Rendered Output'}
        </h4>
        <pre className="flex-1 overflow-auto whitespace-pre-wrap rounded-md border border-slate-700 bg-slate-900 p-4 font-mono text-sm text-slate-300 leading-relaxed">
          {highlightedContent}
        </pre>
      </div>

      {/* Per-level breakdown for multi-level chains */}
      {chain.length > 1 && (
        <div className="mt-4 border-t border-slate-700 pt-4">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Per-Level Content
          </h4>
          <div className="space-y-3 max-h-48 overflow-auto">
            {chain.map((link, idx) => (
              <div key={link.id} className="rounded-md border border-slate-700 bg-slate-800/50 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold text-slate-400">Level {idx + 1}</span>
                  <TypeBadge type={link.type} />
                  <span className="text-xs font-medium text-slate-300">{link.name}</span>
                </div>
                <pre className="whitespace-pre-wrap text-xs text-slate-400 font-mono max-h-24 overflow-auto">
                  {link.content.substring(0, 500)}
                  {link.content.length > 500 ? '...' : ''}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tree Node Component ───────────────────────────────────────────
function TreeNode({
  node,
  depth,
  selectedId,
  expandedIds,
  onSelect,
  onToggle,
}: {
  node: PromptTreeNode;
  depth: number;
  selectedId: string | null;
  expandedIds: Set<string>;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedIds.has(node.id);
  const isSelected = selectedId === node.id;

  return (
    <div>
      <button
        type="button"
        onClick={() => onSelect(node.id)}
        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
          isSelected
            ? 'bg-blue-600/20 text-blue-300'
            : 'text-slate-300 hover:bg-slate-700/50 hover:text-slate-100'
        }`}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        {/* Expand/collapse toggle */}
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id);
            }}
            className="flex-shrink-0 rounded p-0.5 hover:bg-slate-600"
          >
            {isExpanded ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
          </button>
        ) : (
          <span className="w-5 flex-shrink-0" />
        )}

        <FiFile size={14} className="flex-shrink-0 text-slate-500" />
        <span className="truncate font-medium" title={node.name}>
          {node.name}
        </span>
        <TypeBadge type={node.type} />
        {!node.is_active && <span className="text-xs text-slate-500 italic">inactive</span>}
        {hasChildren && (
          <span className="ml-auto text-xs text-slate-500">{node.children.length}</span>
        )}
      </button>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div className="relative">
          {/* Vertical connector line */}
          <div
            className="absolute top-0 bottom-0 border-l border-slate-700"
            style={{ left: `${depth * 20 + 18}px` }}
          />
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              expandedIds={expandedIds}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Create Prompt Dialog ──────────────────────────────────────────
function CreatePromptDialog({
  prompts,
  parentId,
  onClose,
  onCreated,
}: {
  prompts: Prompt[];
  parentId: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [type, setType] = useState<PromptType>('system');
  const [selectedParent, setSelectedParent] = useState(parentId || '');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || !content.trim()) return;
    setSaving(true);
    try {
      const id = `prompt-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      await window.electronAPI.promptCreate({
        id,
        name: name.trim(),
        description: description.trim() || undefined,
        content: content.trim(),
        type,
        parent_id: selectedParent || undefined,
      });
      onCreated();
      onClose();
    } catch (err) {
      console.error('Failed to create prompt:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-xl rounded-lg border border-slate-700 bg-slate-800 p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-100">Create New Prompt</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200"
            title="Close"
          >
            <FiX size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-300">Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Builder System Prompt"
              className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-300">Description</span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </label>

          <div className="flex gap-4">
            <label className="block flex-1">
              <span className="mb-1 block text-sm font-medium text-slate-300">Type</span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as PromptType)}
                className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
              >
                <option value="system">System</option>
                <option value="user">User</option>
                <option value="agent">Agent</option>
                <option value="task">Task</option>
                <option value="template">Template</option>
              </select>
            </label>

            <label className="block flex-1">
              <span className="mb-1 block text-sm font-medium text-slate-300">Parent</span>
              <select
                value={selectedParent}
                onChange={(e) => setSelectedParent(e.target.value)}
                className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
                data-testid="prompt-parent-select"
              >
                <option value="">None (root level)</option>
                {prompts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-300">Content</span>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              placeholder="Enter prompt content..."
              className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 font-mono text-sm text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={!name.trim() || !content.trim() || saving}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            <FiPlus size={14} />
            {saving ? 'Creating...' : 'Create Prompt'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Line-level Diff Engine ────────────────────────────────────────

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
  leftNum: number | null;
  rightNum: number | null;
}

function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  // Simple LCS-based diff
  const m = oldLines.length;
  const n = newLines.length;

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to build diff
  const result: DiffLine[] = [];
  let i = m;
  let j = n;
  const stack: DiffLine[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      stack.push({ type: 'unchanged', content: oldLines[i - 1], leftNum: i, rightNum: j });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ type: 'added', content: newLines[j - 1], leftNum: null, rightNum: j });
      j--;
    } else {
      stack.push({ type: 'removed', content: oldLines[i - 1], leftNum: i, rightNum: null });
      i--;
    }
  }

  // Reverse since we built bottom-up
  for (let k = stack.length - 1; k >= 0; k--) {
    result.push(stack[k]);
  }

  return result;
}

// ── Version Diff Viewer ──────────────────────────────────────────

function VersionDiffViewer({
  promptName,
  versions,
  onClose,
}: {
  promptName: string;
  versions: PromptVersion[];
  onClose: () => void;
}) {
  const sortedVersions = useMemo(
    () => [...versions].sort((a, b) => a.version - b.version),
    [versions],
  );

  const [leftVersionId, setLeftVersionId] = useState(
    sortedVersions.length >= 2
      ? sortedVersions[sortedVersions.length - 2].id
      : sortedVersions[0]?.id || '',
  );
  const [rightVersionId, setRightVersionId] = useState(
    sortedVersions[sortedVersions.length - 1]?.id || '',
  );

  const leftVersion = sortedVersions.find((v) => v.id === leftVersionId);
  const rightVersion = sortedVersions.find((v) => v.id === rightVersionId);

  const diffLines = useMemo(() => {
    if (!leftVersion || !rightVersion) return [];
    return computeLineDiff(leftVersion.content, rightVersion.content);
  }, [leftVersion, rightVersion]);

  const addedCount = diffLines.filter((l) => l.type === 'added').length;
  const removedCount = diffLines.filter((l) => l.type === 'removed').length;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-slate-900/98"
      data-testid="version-diff-viewer"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700 bg-slate-800 px-6 py-3">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-slate-50">Compare Versions</h2>
          <span className="text-sm text-slate-400">— {promptName}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-emerald-400">+{addedCount} added</span>
          <span className="text-xs text-red-400">−{removedCount} removed</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-600 px-3 py-1.5 text-sm font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            data-testid="diff-close-btn"
          >
            Close
          </button>
        </div>
      </div>

      {/* Version selectors */}
      <div className="flex items-center gap-4 border-b border-slate-700 bg-slate-800/60 px-6 py-2.5">
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <span className="font-medium text-red-400">Old:</span>
          <select
            value={leftVersionId}
            onChange={(e) => setLeftVersionId(e.target.value)}
            className="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
            data-testid="diff-left-selector"
          >
            {sortedVersions.map((v) => (
              <option key={v.id} value={v.id}>
                v{v.version} — {new Date(v.created_at).toLocaleString()}
                {v.change_summary ? ` (${v.change_summary})` : ''}
              </option>
            ))}
          </select>
        </label>
        <span className="text-slate-500">→</span>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <span className="font-medium text-emerald-400">New:</span>
          <select
            value={rightVersionId}
            onChange={(e) => setRightVersionId(e.target.value)}
            className="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
            data-testid="diff-right-selector"
          >
            {sortedVersions.map((v) => (
              <option key={v.id} value={v.id}>
                v{v.version} — {new Date(v.created_at).toLocaleString()}
                {v.change_summary ? ` (${v.change_summary})` : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Diff content */}
      <div className="flex-1 overflow-auto font-mono text-sm" data-testid="diff-content">
        {leftVersion && rightVersion && leftVersion.id === rightVersion.id ? (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm">
            Select two different versions to compare
          </div>
        ) : diffLines.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm">
            No differences found
          </div>
        ) : (
          <table className="w-full border-collapse">
            <tbody>
              {diffLines.map((line, idx) => (
                <tr
                  key={`diff-${line.type}-${line.leftNum ?? 'n'}-${line.rightNum ?? 'n'}-${idx}`}
                  className={
                    line.type === 'added'
                      ? 'bg-emerald-500/10'
                      : line.type === 'removed'
                        ? 'bg-red-500/10'
                        : ''
                  }
                >
                  {/* Left line number */}
                  <td className="w-12 select-none border-r border-slate-700/50 px-2 py-0.5 text-right text-xs text-slate-500 align-top">
                    {line.leftNum ?? ''}
                  </td>
                  {/* Right line number */}
                  <td className="w-12 select-none border-r border-slate-700/50 px-2 py-0.5 text-right text-xs text-slate-500 align-top">
                    {line.rightNum ?? ''}
                  </td>
                  {/* Change indicator */}
                  <td
                    className={`w-6 select-none px-1 py-0.5 text-center text-xs font-bold ${
                      line.type === 'added'
                        ? 'text-emerald-400'
                        : line.type === 'removed'
                          ? 'text-red-400'
                          : 'text-slate-600'
                    }`}
                  >
                    {line.type === 'added' ? '+' : line.type === 'removed' ? '−' : ' '}
                  </td>
                  {/* Content */}
                  <td
                    className={`px-3 py-0.5 whitespace-pre-wrap ${
                      line.type === 'added'
                        ? 'text-emerald-200'
                        : line.type === 'removed'
                          ? 'text-red-200'
                          : 'text-slate-300'
                    }`}
                    data-testid={
                      line.type === 'added'
                        ? 'diff-addition'
                        : line.type === 'removed'
                          ? 'diff-deletion'
                          : undefined
                    }
                  >
                    {line.content}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Version History Panel ─────────────────────────────────────────
function VersionHistoryPanel({
  promptId,
  onSelectVersion,
  onCompareVersions,
}: {
  promptId: string;
  onSelectVersion: (version: PromptVersion) => void;
  onCompareVersions: (versions: PromptVersion[]) => void;
}) {
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    window.electronAPI
      .promptVersionList(promptId)
      .then((res) => {
        if (mounted && res.data) setVersions(res.data);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [promptId]);

  if (loading) {
    return <div className="p-4 text-sm text-slate-400">Loading versions...</div>;
  }

  if (versions.length === 0) {
    return <div className="p-4 text-sm text-slate-400">No version history found.</div>;
  }

  return (
    <div className="space-y-2">
      {versions.length >= 2 && (
        <button
          type="button"
          onClick={() => onCompareVersions(versions)}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm font-medium text-cyan-400 transition-colors hover:bg-cyan-500/20"
          data-testid="compare-versions-btn"
        >
          <FiGitBranch size={14} />
          Compare Versions
        </button>
      )}
      {versions.map((v) => (
        <button
          type="button"
          key={v.id}
          onClick={() => onSelectVersion(v)}
          className="flex w-full items-center gap-3 rounded-md border border-slate-700 bg-slate-800/50 px-3 py-2 text-left text-sm transition-colors hover:border-slate-600 hover:bg-slate-800"
        >
          <FiClock size={14} className="flex-shrink-0 text-slate-500" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-200">v{v.version}</span>
              <span className="text-xs text-slate-500">
                {new Date(v.created_at).toLocaleString()}
              </span>
            </div>
            {v.change_summary && (
              <p className="truncate text-xs text-slate-400" title={v.change_summary}>
                {v.change_summary}
              </p>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

// ── Prompt Detail / Editor ────────────────────────────────────────
function PromptDetail({
  prompt,
  prompts,
  onUpdated,
  onDeleted,
}: {
  prompt: Prompt;
  prompts: Prompt[];
  onUpdated: () => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(prompt.content);
  const [editName, setEditName] = useState(prompt.name);
  const [editDescription, setEditDescription] = useState(prompt.description || '');
  const [editType, setEditType] = useState(prompt.type);
  const [editParent, setEditParent] = useState(prompt.parent_id || '');
  const [changeSummary, setChangeSummary] = useState('');
  const [saving, setSaving] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [viewingVersion, setViewingVersion] = useState<PromptVersion | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [compareVersions, setCompareVersions] = useState<PromptVersion[] | null>(null);

  // Reset state when prompt changes
  useEffect(() => {
    setEditing(false);
    setEditContent(prompt.content);
    setEditName(prompt.name);
    setEditDescription(prompt.description || '');
    setEditType(prompt.type);
    setEditParent(prompt.parent_id || '');
    setChangeSummary('');
    setViewingVersion(null);
    setConfirmDelete(false);
    setShowPreview(false);
    setCompareVersions(null);
  }, [prompt.content, prompt.name, prompt.description, prompt.type, prompt.parent_id]);

  const parentPrompt = prompts.find((p) => p.id === prompt.parent_id);
  // Filter out self and descendants for parent selection
  const availableParents = prompts.filter((p) => p.id !== prompt.id);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates: Record<string, unknown> = {};
      if (editName !== prompt.name) updates.name = editName;
      if (editDescription !== (prompt.description || ''))
        updates.description = editDescription || null;
      if (editContent !== prompt.content) updates.content = editContent;
      if (editType !== prompt.type) updates.type = editType;
      if (editParent !== (prompt.parent_id || '')) updates.parent_id = editParent || null;
      if (changeSummary.trim()) updates.change_summary = changeSummary.trim();

      if (Object.keys(updates).length > 0) {
        await window.electronAPI.promptUpdate(prompt.id, updates);
        onUpdated();
      }
      setEditing(false);
      setChangeSummary('');
    } catch (err) {
      console.error('Failed to update prompt:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await window.electronAPI.promptDelete(prompt.id);
      onDeleted();
    } catch (err) {
      console.error('Failed to delete prompt:', err);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700 pb-4">
        <div>
          {editing ? (
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-lg font-semibold text-slate-100 focus:border-blue-500 focus:outline-none"
            />
          ) : (
            <h2 className="text-lg font-semibold text-slate-100">{prompt.name}</h2>
          )}
          <div className="mt-1 flex items-center gap-3 text-sm text-slate-400">
            <TypeBadge type={editing ? editType : prompt.type} />
            <span>v{prompt.version}</span>
            {parentPrompt && (
              <span className="flex items-center gap-1">
                <FiGitBranch size={12} />
                inherits from: {parentPrompt.name}
              </span>
            )}
            <span>Updated {new Date(prompt.updated_at).toLocaleString()}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setShowPreview(!showPreview);
              if (!showPreview) {
                setEditing(false);
                setShowVersions(false);
                setViewingVersion(null);
              }
            }}
            className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors ${
              showPreview
                ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400'
                : 'border-slate-600 text-slate-300 hover:bg-slate-700'
            }`}
            data-testid="preview-btn"
          >
            <FiEye size={14} />
            Preview
          </button>

          <button
            type="button"
            onClick={() => setShowVersions(!showVersions)}
            className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors ${
              showVersions
                ? 'border-blue-500/30 bg-blue-500/10 text-blue-400'
                : 'border-slate-600 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <FiClock size={14} />
            History
          </button>

          {editing ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setEditContent(prompt.content);
                  setEditName(prompt.name);
                  setEditDescription(prompt.description || '');
                  setEditType(prompt.type);
                  setEditParent(prompt.parent_id || '');
                  setChangeSummary('');
                }}
                className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                <FiSave size={14} />
                {saving ? 'Saving...' : 'Save'}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700"
              >
                <FiEdit2 size={14} />
                Edit
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 rounded-md border border-red-500/30 px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10"
              >
                <FiTrash2 size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="mt-3 flex items-center gap-3 rounded-md border border-red-500/30 bg-red-500/10 p-3">
          <span className="text-sm text-red-300">
            Delete this prompt? Children will be unlinked.
          </span>
          <button
            type="button"
            onClick={handleDelete}
            className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-500"
          >
            Confirm Delete
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            className="text-sm text-slate-400 hover:text-slate-200"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Edit metadata */}
      {editing && (
        <div className="mt-4 grid grid-cols-3 gap-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">Description</span>
            <input
              type="text"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="Optional description"
              className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">Type</span>
            <select
              value={editType}
              onChange={(e) => setEditType(e.target.value as PromptType)}
              className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
            >
              <option value="system">System</option>
              <option value="user">User</option>
              <option value="agent">Agent</option>
              <option value="task">Task</option>
              <option value="template">Template</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">Parent</span>
            <select
              value={editParent}
              onChange={(e) => setEditParent(e.target.value)}
              className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
            >
              <option value="">None (root level)</option>
              {availableParents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {/* Content area */}
      {showPreview ? (
        <div className="mt-4 flex-1 overflow-hidden">
          <PromptPreviewPanel
            prompt={prompt}
            prompts={prompts}
            onClose={() => setShowPreview(false)}
          />
        </div>
      ) : (
        <div className="mt-4 flex flex-1 gap-4 overflow-hidden">
          {/* Main content */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {editing && (
              <label className="mb-2 block">
                <span className="mb-1 block text-xs font-medium text-slate-400">
                  Change Summary (optional)
                </span>
                <input
                  type="text"
                  value={changeSummary}
                  onChange={(e) => setChangeSummary(e.target.value)}
                  placeholder="Describe what changed..."
                  className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                />
              </label>
            )}

            {viewingVersion ? (
              <div className="flex-1 overflow-auto">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-amber-400">
                    Viewing v{viewingVersion.version} -{' '}
                    {new Date(viewingVersion.created_at).toLocaleString()}
                  </span>
                  <button
                    type="button"
                    onClick={() => setViewingVersion(null)}
                    className="text-sm text-slate-400 hover:text-slate-200"
                  >
                    Back to current
                  </button>
                </div>
                <pre className="flex-1 overflow-auto whitespace-pre-wrap rounded-md border border-slate-700 bg-slate-900 p-4 font-mono text-sm text-slate-300">
                  {viewingVersion.content}
                </pre>
              </div>
            ) : editing ? (
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="flex-1 resize-none rounded-md border border-slate-600 bg-slate-900 p-4 font-mono text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
              />
            ) : (
              <pre className="flex-1 overflow-auto whitespace-pre-wrap rounded-md border border-slate-700 bg-slate-900 p-4 font-mono text-sm text-slate-300">
                {prompt.content}
              </pre>
            )}

            {/* Description */}
            {!editing && prompt.description && (
              <div className="mt-3 text-sm text-slate-400">
                <span className="font-medium text-slate-500">Description:</span>{' '}
                {prompt.description}
              </div>
            )}
          </div>

          {/* Version history sidebar */}
          <SlidePanel isOpen={showVersions} direction="right">
            <div className="w-72 flex-shrink-0 overflow-auto rounded-md border border-slate-700 bg-slate-800/50 p-3">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
                <FiClock size={14} />
                Version History
              </h3>
              <VersionHistoryPanel
                promptId={prompt.id}
                onSelectVersion={(v) => setViewingVersion(v)}
                onCompareVersions={(v) => setCompareVersions(v)}
              />
            </div>
          </SlidePanel>
        </div>
      )}

      {/* Version diff viewer overlay */}
      {compareVersions && compareVersions.length >= 2 && (
        <VersionDiffViewer
          promptName={prompt.name}
          versions={compareVersions}
          onClose={() => setCompareVersions(null)}
        />
      )}
    </div>
  );
}

// ── Main PromptsPage ──────────────────────────────────────────────
export function PromptsPage() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | null>(null);

  const loadPrompts = useCallback(async () => {
    try {
      const res = await window.electronAPI.promptList();
      if (res.data) {
        setPrompts(res.data);
      }
    } catch (err) {
      console.error('Failed to load prompts:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPrompts();
  }, [loadPrompts]);

  const tree = useMemo(() => buildTree(prompts), [prompts]);

  const selectedPrompt = useMemo(
    () => prompts.find((p) => p.id === selectedId) || null,
    [prompts, selectedId],
  );

  const handleToggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleExpandAll = useCallback(() => {
    setExpandedIds(new Set(prompts.map((p) => p.id)));
  }, [prompts]);

  const handleCollapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  const handleCreated = useCallback(() => {
    loadPrompts();
  }, [loadPrompts]);

  const handleUpdated = useCallback(() => {
    loadPrompts();
  }, [loadPrompts]);

  const handleDeleted = useCallback(() => {
    setSelectedId(null);
    loadPrompts();
  }, [loadPrompts]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-slate-400">Loading prompts...</div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Page Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">Prompts</h1>
          <p className="mt-1 text-sm text-slate-400">
            Manage canopy prompts with inheritance hierarchy and versioning
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreateParentId(null);
            setShowCreate(true);
          }}
          className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
        >
          <FiFilePlus size={16} />
          New Prompt
        </button>
      </div>

      {/* Main Layout */}
      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* Left: Tree Panel */}
        <div className="flex w-72 flex-shrink-0 flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-800/50">
          {/* Tree header */}
          <div className="flex items-center justify-between border-b border-slate-700 px-3 py-2">
            <h3 className="text-sm font-semibold text-slate-200">Inheritance Tree</h3>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={handleExpandAll}
                title="Expand all"
                className="rounded p-1 text-xs text-slate-400 hover:bg-slate-700 hover:text-slate-200"
              >
                <FiChevronDown size={14} />
              </button>
              <button
                type="button"
                onClick={handleCollapseAll}
                title="Collapse all"
                className="rounded p-1 text-xs text-slate-400 hover:bg-slate-700 hover:text-slate-200"
              >
                <FiChevronRight size={14} />
              </button>
            </div>
          </div>

          {/* Tree content */}
          <div className="flex-1 overflow-auto p-2">
            {tree.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <FiFile size={32} className="mb-2 text-slate-600" />
                <p className="text-sm text-slate-400">No prompts yet</p>
                <button
                  type="button"
                  onClick={() => {
                    setCreateParentId(null);
                    setShowCreate(true);
                  }}
                  className="mt-2 text-sm text-blue-400 hover:text-blue-300"
                >
                  Create your first prompt
                </button>
              </div>
            ) : (
              tree.map((node) => (
                <TreeNode
                  key={node.id}
                  node={node}
                  depth={0}
                  selectedId={selectedId}
                  expandedIds={expandedIds}
                  onSelect={setSelectedId}
                  onToggle={handleToggle}
                />
              ))
            )}
          </div>

          {/* Stats */}
          {prompts.length > 0 && (
            <div className="border-t border-slate-700 px-3 py-2 text-xs text-slate-500">
              {prompts.length} prompt{prompts.length !== 1 ? 's' : ''} &middot; {tree.length} root
              {tree.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        {/* Right: Detail Panel */}
        <div className="flex-1 overflow-hidden rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          {selectedPrompt ? (
            <PromptDetail
              prompt={selectedPrompt}
              prompts={prompts}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <FiFile size={48} className="mb-3 text-slate-600" />
              <h3 className="text-lg font-medium text-slate-400">Select a prompt</h3>
              <p className="mt-1 text-sm text-slate-500">
                Choose a prompt from the tree to view or edit its content
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Create Dialog */}
      {showCreate && (
        <CreatePromptDialog
          prompts={prompts}
          parentId={createParentId}
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
