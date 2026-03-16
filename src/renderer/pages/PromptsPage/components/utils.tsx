import type { Prompt, PromptTreeNode } from '../../../../shared/types';
import type { DiffLine, InheritanceLink } from './types';

// ── Build Tree ────────────────────────────────────────────────────
export function buildTree(prompts: Prompt[]): PromptTreeNode[] {
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

/** Walk up the parent chain and return the full inheritance path (root -> ... -> self) */
export function resolveInheritanceChain(prompt: Prompt, allPrompts: Prompt[]): InheritanceLink[] {
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
    const parentId: string | null = current.parent_id;
    current = parentId ? allPrompts.find((p) => p.id === parentId) : undefined;
  }

  return chain;
}

/** Merge content from the inheritance chain: parent content first, then child appends */
export function renderMergedContent(chain: InheritanceLink[]): string {
  if (chain.length === 0) return '';
  if (chain.length === 1) return chain[0].content;
  return chain.map((link) => link.content).join('\n\n---\n\n');
}

/** Regex for template variables like {{var}}, {var}, or ${var} */
export const TEMPLATE_VAR_PATTERN = /(\{\{[\w.]+\}\}|\$\{[\w.]+\}|\{[\w.]+\})/g;

/** Extract unique template variable names from content */
export function extractTemplateVars(content: string): string[] {
  const matches = content.match(TEMPLATE_VAR_PATTERN);
  if (!matches) return [];
  return [...new Set(matches)];
}

/** Render content with highlighted template variables as React nodes */
export function renderHighlightedContent(content: string): React.ReactNode[] {
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

// ── Line-level Diff Engine ────────────────────────────────────────

export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
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
