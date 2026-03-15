import { useCallback, useEffect, useState } from 'react';
import {
  FiChevronDown,
  FiChevronRight,
  FiFile,
  FiFolder,
  FiFolderPlus,
  FiLoader,
  FiSearch,
} from 'react-icons/fi';
import type { FileTreeNode } from '../../shared/types';

interface FileTreePickerProps {
  /** Root path to scan for files */
  rootPath: string | null;
  /** Currently selected file paths (relative) */
  selectedPaths: string[];
  /** Callback when selection changes */
  onSelectionChange: (paths: string[]) => void;
  /** Max height for the tree container */
  maxHeight?: string;
}

/** Recursive tree node component with checkbox */
function TreeNode({
  node,
  selectedPaths,
  expandedDirs,
  onToggleSelect,
  onToggleExpand,
  depth,
  searchFilter,
}: {
  node: FileTreeNode;
  selectedPaths: Set<string>;
  expandedDirs: Set<string>;
  onToggleSelect: (node: FileTreeNode, checked: boolean) => void;
  onToggleExpand: (path: string) => void;
  depth: number;
  searchFilter: string;
}) {
  const isSelected = selectedPaths.has(node.relativePath);
  const isExpanded = expandedDirs.has(node.relativePath);

  // For directories, check if any children are selected (partial state)
  const hasSelectedChildren = node.isDirectory
    ? hasAnySelectedDescendant(node, selectedPaths)
    : false;
  const allChildrenSelected = node.isDirectory
    ? areAllDescendantsSelected(node, selectedPaths)
    : false;
  const isPartial = hasSelectedChildren && !allChildrenSelected && !isSelected;

  // Filter: if search is active, only show matching nodes
  if (searchFilter) {
    const matchesSelf = node.name.toLowerCase().includes(searchFilter.toLowerCase());
    const hasMatchingChild = node.isDirectory && hasMatchingDescendant(node, searchFilter);
    if (!matchesSelf && !hasMatchingChild) return null;
  }

  return (
    <div data-testid={`tree-node-${node.relativePath}`}>
      <div
        className={`flex items-center gap-1.5 py-0.5 px-1 rounded cursor-pointer hover:bg-slate-700/50 transition-colors group ${
          depth === 0 ? '' : ''
        }`}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
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

        {/* Checkbox */}
        <label className="flex items-center gap-1.5 flex-1 cursor-pointer min-w-0">
          <input
            type="checkbox"
            checked={isSelected || allChildrenSelected}
            ref={(el) => {
              if (el) el.indeterminate = isPartial;
            }}
            onChange={(e) => onToggleSelect(node, e.target.checked)}
            className="h-3.5 w-3.5 rounded border-slate-500 bg-slate-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer accent-blue-500"
          />

          {/* Icon */}
          {node.isDirectory ? (
            <FiFolder className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />
          ) : (
            <FiFile className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
          )}

          {/* Name */}
          <span
            className={`text-xs truncate ${
              isSelected || allChildrenSelected ? 'text-blue-300 font-medium' : 'text-slate-300'
            }`}
            title={node.relativePath}
          >
            {node.name}
          </span>
        </label>
      </div>

      {/* Children */}
      {node.isDirectory && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.relativePath}
              node={child}
              selectedPaths={selectedPaths}
              expandedDirs={expandedDirs}
              onToggleSelect={onToggleSelect}
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

/** Check if any descendant is selected */
function hasAnySelectedDescendant(node: FileTreeNode, selected: Set<string>): boolean {
  if (!node.children) return false;
  for (const child of node.children) {
    if (selected.has(child.relativePath)) return true;
    if (child.isDirectory && hasAnySelectedDescendant(child, selected)) return true;
  }
  return false;
}

/** Check if all leaf descendants are selected */
function areAllDescendantsSelected(node: FileTreeNode, selected: Set<string>): boolean {
  if (!node.children || node.children.length === 0) return false;
  for (const child of node.children) {
    if (!child.isDirectory && !selected.has(child.relativePath)) return false;
    if (
      child.isDirectory &&
      !selected.has(child.relativePath) &&
      !areAllDescendantsSelected(child, selected)
    )
      return false;
  }
  return true;
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

/** Collect all file paths under a directory node */
function collectAllPaths(node: FileTreeNode): string[] {
  const paths: string[] = [node.relativePath];
  if (node.children) {
    for (const child of node.children) {
      paths.push(...collectAllPaths(child));
    }
  }
  return paths;
}

export function FileTreePicker({
  rootPath,
  selectedPaths,
  onSelectionChange,
  maxHeight = '240px',
}: FileTreePickerProps) {
  const [tree, setTree] = useState<FileTreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [searchFilter, setSearchFilter] = useState('');

  const selectedSet = new Set(selectedPaths);

  // Load file tree when rootPath changes
  useEffect(() => {
    if (!rootPath) {
      setTree([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    window.electronAPI
      .projectFileTree(rootPath, 4)
      .then((result) => {
        if (cancelled) return;
        if (result.error) {
          setError(result.error);
        } else if (result.data) {
          setTree(result.data);
          // Auto-expand first level
          const firstLevel = new Set(
            result.data.filter((n) => n.isDirectory).map((n) => n.relativePath),
          );
          setExpandedDirs(firstLevel);
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

  const handleToggleSelect = useCallback(
    (node: FileTreeNode, checked: boolean) => {
      const pathsToToggle = collectAllPaths(node);
      const newSelected = new Set(selectedPaths);

      if (checked) {
        for (const p of pathsToToggle) newSelected.add(p);
        // Auto-expand selected directory
        if (node.isDirectory) {
          setExpandedDirs((prev) => new Set([...prev, node.relativePath]));
        }
      } else {
        for (const p of pathsToToggle) newSelected.delete(p);
      }

      onSelectionChange(Array.from(newSelected));
    },
    [selectedPaths, onSelectionChange],
  );

  const handleClearAll = () => {
    onSelectionChange([]);
  };

  if (!rootPath) {
    return (
      <div className="rounded-lg border border-slate-600 bg-slate-700/50 p-3 text-center">
        <FiFolderPlus className="h-5 w-5 text-slate-500 mx-auto mb-1" />
        <p className="text-xs text-slate-500">Select a project to browse files</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-600 bg-slate-700/50 p-4 flex items-center justify-center gap-2">
        <FiLoader className="h-4 w-4 text-blue-400 animate-spin" />
        <span className="text-xs text-slate-400">Loading file tree...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
        Failed to load file tree: {error}
      </div>
    );
  }

  return (
    <div
      className="rounded-lg border border-slate-600 bg-slate-700/50"
      data-testid="file-tree-picker"
    >
      {/* Header with search and count */}
      <div className="flex items-center gap-2 border-b border-slate-600 px-2 py-1.5">
        <FiSearch className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
        <input
          type="text"
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          placeholder="Filter files..."
          className="flex-1 bg-transparent text-xs text-slate-200 placeholder-slate-500 focus:outline-none"
          data-testid="file-tree-search"
        />
        {selectedPaths.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-blue-400 font-medium">
              {selectedPaths.length} selected
            </span>
            <button
              type="button"
              onClick={handleClearAll}
              className="text-xs text-slate-400 hover:text-red-400 transition-colors"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Tree */}
      <div className="overflow-y-auto p-1" style={{ maxHeight }} data-testid="file-tree-container">
        {tree.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-2">No files found</p>
        ) : (
          tree.map((node) => (
            <TreeNode
              key={node.relativePath}
              node={node}
              selectedPaths={selectedSet}
              expandedDirs={expandedDirs}
              onToggleSelect={handleToggleSelect}
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
