import React from 'react';
import { FiChevronDown, FiChevronRight, FiCircle, FiCpu, FiUser } from 'react-icons/fi';
import type { AgentState, Session } from '../../shared/types';

interface AgentHierarchyTreeProps {
  sessions: Session[];
  onSelectAgent: (agentId: string) => void;
}

interface TreeNode {
  session: Session;
  children: TreeNode[];
}

const stateColors: Record<AgentState, string> = {
  booting: 'text-yellow-400',
  working: 'text-green-400',
  completed: 'text-slate-400',
  stalled: 'text-amber-400',
  zombie: 'text-red-400',
};

const capabilityColors: Record<string, string> = {
  scout: 'bg-purple-600/20 text-purple-300 border-purple-600/40',
  builder: 'bg-blue-600/20 text-blue-300 border-blue-600/40',
  reviewer: 'bg-cyan-600/20 text-cyan-300 border-cyan-600/40',
  lead: 'bg-amber-600/20 text-amber-300 border-amber-600/40',
  merger: 'bg-emerald-600/20 text-emerald-300 border-emerald-600/40',
  coordinator: 'bg-rose-600/20 text-rose-300 border-rose-600/40',
  monitor: 'bg-teal-600/20 text-teal-300 border-teal-600/40',
};

function buildTree(sessions: Session[]): TreeNode[] {
  const sessionMap = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  // Create nodes
  for (const session of sessions) {
    sessionMap.set(session.agent_name, {
      session,
      children: [],
    });
  }

  // Build parent-child relationships
  for (const session of sessions) {
    const node = sessionMap.get(session.agent_name);
    if (!node) continue;

    if (session.parent_agent) {
      const parent = sessionMap.get(session.parent_agent);
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function TreeNodeComponent({
  node,
  depth,
  onSelectAgent,
}: {
  node: TreeNode;
  depth: number;
  onSelectAgent: (agentId: string) => void;
}) {
  const [expanded, setExpanded] = React.useState(true);
  const { session } = node;
  const hasChildren = node.children.length > 0;
  const capColor =
    capabilityColors[session.capability] || 'bg-slate-600/20 text-slate-300 border-slate-600/40';

  return (
    <div>
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 hover:bg-slate-700/50 rounded-md cursor-pointer transition-colors group text-left"
        style={{ paddingLeft: `${depth * 24 + 12}px` }}
        onClick={() => onSelectAgent(session.id)}
      >
        {/* Expand/collapse toggle */}
        {hasChildren ? (
          <span
            className="p-0.5 text-slate-400 hover:text-slate-200 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
                setExpanded(!expanded);
              }
            }}
          >
            {expanded ? (
              <FiChevronDown className="h-4 w-4" />
            ) : (
              <FiChevronRight className="h-4 w-4" />
            )}
          </span>
        ) : (
          <span className="w-5" />
        )}

        {/* State indicator */}
        <FiCircle
          className={`h-2.5 w-2.5 fill-current ${stateColors[session.state] || 'text-slate-500'}`}
        />

        {/* Agent icon */}
        {session.capability === 'coordinator' || session.capability === 'lead' ? (
          <FiUser className="h-4 w-4 text-slate-400" />
        ) : (
          <FiCpu className="h-4 w-4 text-slate-400" />
        )}

        {/* Agent name */}
        <span className="text-sm font-medium text-slate-200 group-hover:text-white">
          {session.agent_name}
        </span>

        {/* Capability badge */}
        <span className={`text-xs px-1.5 py-0.5 rounded border ${capColor}`}>
          {session.capability}
        </span>

        {/* State */}
        <span className={`text-xs ${stateColors[session.state] || 'text-slate-500'}`}>
          {session.state}
        </span>

        {/* Depth indicator */}
        <span className="text-xs text-slate-500 ml-auto">depth {session.depth}</span>
      </button>

      {/* Children */}
      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeNodeComponent
              key={child.session.id}
              node={child}
              depth={depth + 1}
              onSelectAgent={onSelectAgent}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function AgentHierarchyTree({ sessions, onSelectAgent }: AgentHierarchyTreeProps) {
  const tree = buildTree(sessions);

  if (tree.length === 0) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center text-slate-400">
        <FiCpu className="h-12 w-12 mx-auto mb-3 text-slate-600" />
        <p className="text-lg mb-2">No agents to display</p>
        <p className="text-sm">Spawn agents to see the hierarchy tree</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 p-2">
      <div className="text-xs text-slate-500 px-3 py-1.5 border-b border-slate-700 mb-1">
        Agent Hierarchy
      </div>
      {tree.map((node) => (
        <TreeNodeComponent
          key={node.session.id}
          node={node}
          depth={0}
          onSelectAgent={onSelectAgent}
        />
      ))}
    </div>
  );
}
