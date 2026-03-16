import { FiChevronDown, FiChevronRight, FiFile } from 'react-icons/fi';
import type { PromptTreeNode } from '../../../../shared/types';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Tooltip } from '../../../components/Tooltip';
import { TypeBadge } from './TypeBadge';

export function TreeNode({
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
      <Button
        variant="ghost"
        type="button"
        onClick={() => onSelect(node.id)}
        className={`flex h-auto w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
          isSelected
            ? 'bg-blue-600/20 text-blue-300'
            : 'text-slate-300 hover:bg-slate-700/50 hover:text-slate-100'
        }`}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        {/* Expand/collapse toggle */}
        {hasChildren ? (
          <Tooltip content="Toggle">
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                onToggle(node.id);
              }}
              className="h-5 w-5 flex-shrink-0 p-0.5"
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
            </Button>
          </Tooltip>
        ) : (
          <span className="w-5 flex-shrink-0" />
        )}

        <FiFile size={14} className="flex-shrink-0 text-slate-400" />
        <span className="truncate font-medium" title={node.name}>
          {node.name}
        </span>
        <TypeBadge type={node.type} />
        {!node.is_active && <span className="text-xs text-slate-400 italic">inactive</span>}
        {hasChildren && (
          <Badge variant="secondary" className="ml-auto bg-transparent text-slate-400 border-0 px-1 py-0">
            {node.children.length}
          </Badge>
        )}
      </Button>

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
