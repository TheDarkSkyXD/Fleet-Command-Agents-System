import React from 'react';
import {
  FiActivity,
  FiAlertTriangle,
  FiCheckCircle,
  FiChevronDown,
  FiChevronRight,
  FiCpu,
  FiLoader,
  FiUser,
  FiUsers,
  FiXCircle,
} from 'react-icons/fi';
import type { AgentState, Session } from '../../shared/types';

interface AgentHierarchyTreeProps {
  sessions: Session[];
  onSelectAgent: (agentId: string) => void;
}

interface TreeNode {
  session: Session;
  children: TreeNode[];
}

/** Status dot colors matching spec: green=working, amber=stalled, red=zombie, sky=booting, gray=completed */
const stateDotBg: Record<AgentState, string> = {
  booting: 'bg-sky-400',
  working: 'bg-emerald-400',
  completed: 'bg-slate-400',
  stalled: 'bg-amber-400',
  zombie: 'bg-red-400',
};

const stateTextColor: Record<AgentState, string> = {
  booting: 'text-sky-400',
  working: 'text-emerald-400',
  completed: 'text-slate-500',
  stalled: 'text-amber-400',
  zombie: 'text-red-400',
};

/** Glow/pulse animation for active states */
const statePulse: Record<AgentState, string> = {
  booting: 'animate-pulse',
  working: 'animate-pulse',
  completed: '',
  stalled: 'animate-pulse',
  zombie: '',
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

const capabilityIcon: Record<string, React.ReactNode> = {
  coordinator: <FiUsers className="h-4 w-4" />,
  lead: <FiUser className="h-4 w-4" />,
  scout: <FiCpu className="h-4 w-4" />,
  builder: <FiCpu className="h-4 w-4" />,
  reviewer: <FiCpu className="h-4 w-4" />,
  merger: <FiCpu className="h-4 w-4" />,
  monitor: <FiCpu className="h-4 w-4" />,
};

/** State-specific icons for visual distinction */
const stateIcon: Record<AgentState, React.ReactNode> = {
  booting: <FiLoader className="h-3 w-3 animate-spin" />,
  working: <FiActivity className="h-3 w-3" />,
  completed: <FiCheckCircle className="h-3 w-3" />,
  stalled: <FiAlertTriangle className="h-3 w-3" />,
  zombie: <FiXCircle className="h-3 w-3" />,
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

  // Sort: coordinators first, then leads, then others
  const capOrder: Record<string, number> = {
    coordinator: 0,
    lead: 1,
    builder: 2,
    reviewer: 3,
    scout: 4,
    merger: 5,
    monitor: 6,
  };
  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort(
      (a, b) => (capOrder[a.session.capability] ?? 9) - (capOrder[b.session.capability] ?? 9),
    );
    for (const n of nodes) sortNodes(n.children);
  };
  sortNodes(roots);

  return roots;
}

/**
 * A single node in the tree with visual connection lines.
 */
function TreeNodeComponent({
  node,
  depth,
  isLast,
  parentLines,
  onSelectAgent,
}: {
  node: TreeNode;
  depth: number;
  isLast: boolean;
  parentLines: boolean[];
  onSelectAgent: (agentId: string) => void;
}) {
  const [expanded, setExpanded] = React.useState(true);
  const { session } = node;
  const hasChildren = node.children.length > 0;
  const capColor =
    capabilityColors[session.capability] || 'bg-slate-600/20 text-slate-300 border-slate-600/40';
  const dotBg = stateDotBg[session.state] || 'bg-slate-400';
  const textColor = stateTextColor[session.state] || 'text-slate-500';
  const pulse = statePulse[session.state] || '';
  const icon = capabilityIcon[session.capability] || <FiCpu className="h-4 w-4" />;

  return (
    <div data-testid={`tree-node-${session.id}`}>
      <div className="flex items-stretch">
        {/* Connection lines for parent levels */}
        {parentLines.map((showLine, i) => (
          <div key={`line-${session.id}-${i}`} className="w-6 flex-shrink-0 relative">
            {showLine && <div className="absolute left-3 top-0 bottom-0 w-px bg-slate-600/50" />}
          </div>
        ))}

        {/* Current level connector */}
        {depth > 0 && (
          <div className="w-6 flex-shrink-0 relative">
            {/* Vertical line from top to middle */}
            <div
              className={`absolute left-3 top-0 w-px bg-slate-600/50 ${isLast ? 'h-1/2' : 'h-full'}`}
            />
            {/* Horizontal line from middle to right */}
            <div className="absolute left-3 top-1/2 w-3 h-px bg-slate-600/50" />
          </div>
        )}

        {/* Node content */}
        <button
          type="button"
          className="flex flex-1 items-center gap-2 px-2 py-1.5 hover:bg-slate-700/40 rounded-md cursor-pointer transition-colors group text-left min-w-0"
          onClick={() => onSelectAgent(session.id)}
          data-testid={`tree-node-button-${session.id}`}
        >
          {/* Expand/collapse toggle */}
          {hasChildren ? (
            <span
              className="p-0.5 text-slate-400 hover:text-slate-200 transition-colors flex-shrink-0"
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
                <FiChevronDown className="h-3.5 w-3.5" />
              ) : (
                <FiChevronRight className="h-3.5 w-3.5" />
              )}
            </span>
          ) : (
            <span className="w-[18px] flex-shrink-0" />
          )}

          {/* State icon with animation */}
          <span className={`flex-shrink-0 ${textColor} ${pulse}`}>
            {stateIcon[session.state] || (
              <span className={`block h-2.5 w-2.5 rounded-full ${dotBg}`} />
            )}
          </span>

          {/* Agent icon colored by capability */}
          <span className={`flex-shrink-0 ${textColor}`}>{icon}</span>

          {/* Agent name */}
          <span
            className="text-sm font-medium text-slate-200 group-hover:text-white truncate"
            title={session.agent_name}
          >
            {session.agent_name}
          </span>

          {/* Capability badge */}
          <span className={`text-xs px-1.5 py-0.5 rounded border flex-shrink-0 ${capColor}`}>
            {session.capability}
          </span>

          {/* State label */}
          <span className={`text-xs flex-shrink-0 ${textColor}`}>{session.state}</span>

          {/* Child count for leads/coordinators */}
          {hasChildren && (
            <span className="text-xs text-slate-500 ml-auto flex-shrink-0">
              {node.children.length} child{node.children.length !== 1 ? 'ren' : ''}
            </span>
          )}
        </button>
      </div>

      {/* Children with connection lines */}
      {expanded && hasChildren && (
        <div>
          {node.children.map((child, i) => {
            const childIsLast = i === node.children.length - 1;
            // Pass down which parent levels should show a continuing vertical line
            const nextParentLines =
              depth > 0 ? [...parentLines, !isLast] : !isLast ? [!isLast] : [false];
            return (
              <TreeNodeComponent
                key={child.session.id}
                node={child}
                depth={depth + 1}
                isLast={childIsLast}
                parentLines={depth === 0 ? [] : nextParentLines}
                onSelectAgent={onSelectAgent}
              />
            );
          })}
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
        <FiUsers className="h-12 w-12 mx-auto mb-3 text-slate-600" />
        <p className="text-lg mb-2">No agents to display</p>
        <p className="text-sm text-slate-500">
          Spawn agents to see the hierarchy tree.
          <br />
          Coordinator → Leads → Workers
        </p>
      </div>
    );
  }

  // Legend with state icons
  const legendItems: { state: AgentState; label: string; textColor: string }[] = [
    { state: 'working', label: 'Working', textColor: 'text-emerald-400' },
    { state: 'booting', label: 'Booting', textColor: 'text-sky-400' },
    { state: 'stalled', label: 'Stalled', textColor: 'text-amber-400' },
    { state: 'zombie', label: 'Zombie', textColor: 'text-red-400' },
    { state: 'completed', label: 'Completed', textColor: 'text-slate-400' },
  ];

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 overflow-hidden">
      {/* Header with legend */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700">
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
          Agent Hierarchy
        </span>
        <div className="flex items-center gap-3">
          {legendItems.map((item) => (
            <div key={item.label} className="flex items-center gap-1">
              <span className={`${item.textColor}`}>{stateIcon[item.state]}</span>
              <span className="text-xs text-slate-500">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tree content */}
      <div className="p-2">
        {tree.map((node, i) => (
          <TreeNodeComponent
            key={node.session.id}
            node={node}
            depth={0}
            isLast={i === tree.length - 1}
            parentLines={[]}
            onSelectAgent={onSelectAgent}
          />
        ))}
      </div>

      {/* Footer stats */}
      <div className="border-t border-slate-700 px-4 py-2 flex items-center gap-4 text-xs text-slate-500">
        <span>Total: {sessions.length} agents</span>
        <span>Roots: {tree.length}</span>
        <span>Max depth: {sessions.reduce((max, s) => Math.max(max, s.depth || 0), 0)}</span>
      </div>
    </div>
  );
}
