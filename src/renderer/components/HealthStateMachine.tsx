import { motion } from 'framer-motion';

export type AgentState = 'booting' | 'working' | 'stalled' | 'zombie';

interface HealthStateMachineProps {
  currentState?: AgentState;
}

const states: {
  id: AgentState;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  glowColor: string;
}[] = [
  {
    id: 'booting',
    label: 'Booting',
    color: '#38bdf8', // sky-400
    bgColor: '#0c4a6e', // sky-900
    borderColor: '#0ea5e9', // sky-500
    glowColor: 'rgba(14, 165, 233, 0.3)',
  },
  {
    id: 'working',
    label: 'Working',
    color: '#4ade80', // green-400
    bgColor: '#14532d', // green-900
    borderColor: '#22c55e', // green-500
    glowColor: 'rgba(34, 197, 94, 0.3)',
  },
  {
    id: 'stalled',
    label: 'Stalled',
    color: '#fbbf24', // amber-400
    bgColor: '#78350f', // amber-900
    borderColor: '#f59e0b', // amber-500
    glowColor: 'rgba(245, 158, 11, 0.3)',
  },
  {
    id: 'zombie',
    label: 'Zombie',
    color: '#f87171', // red-400
    bgColor: '#7f1d1d', // red-900
    borderColor: '#ef4444', // red-500
    glowColor: 'rgba(239, 68, 68, 0.3)',
  },
];

function StateNode({
  state,
  isActive,
  x,
  y,
}: {
  state: (typeof states)[number];
  isActive: boolean;
  x: number;
  y: number;
}) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      {/* Glow effect for active state */}
      {isActive && (
        <motion.circle
          r={38}
          fill="none"
          stroke={state.borderColor}
          strokeWidth={2}
          opacity={0.4}
          initial={{ r: 34, opacity: 0.6 }}
          animate={{ r: 42, opacity: 0 }}
          transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY, ease: 'easeOut' }}
        />
      )}

      {/* Main circle */}
      <circle
        r={32}
        fill={isActive ? state.bgColor : '#1e293b'}
        stroke={isActive ? state.borderColor : '#334155'}
        strokeWidth={isActive ? 2.5 : 1.5}
        style={isActive ? { filter: `drop-shadow(0 0 8px ${state.glowColor})` } : undefined}
      />

      {/* State icon */}
      <g transform="translate(0, -4)">
        {state.id === 'booting' && (
          <motion.g
            animate={isActive ? { rotate: 360 } : undefined}
            transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, ease: 'linear' }}
          >
            <path
              d="M-8,-8 A11.3,11.3 0 0,1 8,-8"
              fill="none"
              stroke={isActive ? state.color : '#64748b'}
              strokeWidth={2}
              strokeLinecap="round"
            />
            <path
              d="M8,8 A11.3,11.3 0 0,1 -8,8"
              fill="none"
              stroke={isActive ? state.color : '#64748b'}
              strokeWidth={2}
              strokeLinecap="round"
            />
          </motion.g>
        )}
        {state.id === 'working' && (
          <g>
            <motion.rect
              x={-10}
              y={-4}
              width={4}
              height={12}
              rx={1}
              fill={isActive ? state.color : '#64748b'}
              animate={isActive ? { height: [8, 14, 6, 12], y: [-2, -6, 0, -4] } : undefined}
              transition={{ duration: 1.2, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
            />
            <motion.rect
              x={-3}
              y={-6}
              width={4}
              height={14}
              rx={1}
              fill={isActive ? state.color : '#64748b'}
              animate={isActive ? { height: [14, 6, 12, 8], y: [-6, 0, -4, -2] } : undefined}
              transition={{
                duration: 1.2,
                repeat: Number.POSITIVE_INFINITY,
                ease: 'easeInOut',
                delay: 0.2,
              }}
            />
            <motion.rect
              x={4}
              y={-2}
              width={4}
              height={10}
              rx={1}
              fill={isActive ? state.color : '#64748b'}
              animate={isActive ? { height: [10, 14, 8, 6], y: [-2, -6, 0, 2] } : undefined}
              transition={{
                duration: 1.2,
                repeat: Number.POSITIVE_INFINITY,
                ease: 'easeInOut',
                delay: 0.4,
              }}
            />
          </g>
        )}
        {state.id === 'stalled' && (
          <g>
            <circle
              cx={0}
              cy={-2}
              r={9}
              fill="none"
              stroke={isActive ? state.color : '#64748b'}
              strokeWidth={2}
            />
            <line
              x1={0}
              y1={-6}
              x2={0}
              y2={-1}
              stroke={isActive ? state.color : '#64748b'}
              strokeWidth={2}
              strokeLinecap="round"
            />
            <line
              x1={0}
              y1={-2}
              x2={4}
              y2={1}
              stroke={isActive ? state.color : '#64748b'}
              strokeWidth={2}
              strokeLinecap="round"
            />
          </g>
        )}
        {state.id === 'zombie' && (
          <g>
            <circle
              cx={0}
              cy={-2}
              r={9}
              fill="none"
              stroke={isActive ? state.color : '#64748b'}
              strokeWidth={2}
            />
            <line
              x1={-4}
              y1={-5}
              x2={-1}
              y2={-2}
              stroke={isActive ? state.color : '#64748b'}
              strokeWidth={2}
              strokeLinecap="round"
            />
            <line
              x1={-1}
              y1={-5}
              x2={-4}
              y2={-2}
              stroke={isActive ? state.color : '#64748b'}
              strokeWidth={2}
              strokeLinecap="round"
            />
            <line
              x1={1}
              y1={-5}
              x2={4}
              y2={-2}
              stroke={isActive ? state.color : '#64748b'}
              strokeWidth={2}
              strokeLinecap="round"
            />
            <line
              x1={4}
              y1={-5}
              x2={1}
              y2={-2}
              stroke={isActive ? state.color : '#64748b'}
              strokeWidth={2}
              strokeLinecap="round"
            />
            <path
              d="M-4,3 Q0,7 4,3"
              fill="none"
              stroke={isActive ? state.color : '#64748b'}
              strokeWidth={1.5}
              strokeLinecap="round"
            />
          </g>
        )}
      </g>

      {/* Label */}
      <text
        y={22}
        textAnchor="middle"
        fill={isActive ? state.color : '#94a3b8'}
        fontSize={10}
        fontWeight={isActive ? 600 : 400}
        fontFamily="Inter, system-ui, sans-serif"
      >
        {state.label}
      </text>
    </g>
  );
}

function TransitionArrow({
  x1,
  y1,
  x2,
  y2,
  label,
  isActive,
  color,
  curved,
  curveDirection,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string;
  isActive: boolean;
  color: string;
  curved?: boolean;
  curveDirection?: 'up' | 'down';
}) {
  const arrowColor = isActive ? color : '#475569';
  const labelColor = isActive ? '#e2e8f0' : '#64748b';

  // Shorten arrow by circle radius + padding
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const pad = 36;
  const sx = x1 + (dx / dist) * pad;
  const sy = y1 + (dy / dist) * pad;
  const ex = x2 - (dx / dist) * pad;
  const ey = y2 - (dy / dist) * pad;

  if (curved) {
    const midX = (sx + ex) / 2;
    const midY = (sy + ey) / 2;
    const curveAmount = curveDirection === 'up' ? -30 : 30;
    const cpX = midX;
    const cpY = midY + curveAmount;

    const pathD = `M${sx},${sy} Q${cpX},${cpY} ${ex},${ey}`;

    // Arrowhead angle from curve end
    const arrowDx = ex - cpX;
    const arrowDy = ey - cpY;
    const arrowAngle = (Math.atan2(arrowDy, arrowDx) * 180) / Math.PI;

    // Label position
    const labelX = midX;
    const labelY = cpY + (curveDirection === 'up' ? -8 : 14);

    return (
      <g>
        <path
          d={pathD}
          fill="none"
          stroke={arrowColor}
          strokeWidth={1.5}
          strokeDasharray={isActive ? undefined : '4 3'}
          opacity={isActive ? 0.9 : 0.5}
        />
        <polygon
          points="-6,-3 0,0 -6,3"
          fill={arrowColor}
          transform={`translate(${ex},${ey}) rotate(${arrowAngle})`}
          opacity={isActive ? 0.9 : 0.5}
        />
        <text
          x={labelX}
          y={labelY}
          textAnchor="middle"
          fill={labelColor}
          fontSize={8}
          fontFamily="Inter, system-ui, sans-serif"
          opacity={0.8}
        >
          {label}
        </text>
      </g>
    );
  }

  // Straight arrow
  const angle = (Math.atan2(ey - sy, ex - sx) * 180) / Math.PI;
  const midX = (sx + ex) / 2;
  const midY = (sy + ey) / 2;

  return (
    <g>
      <line
        x1={sx}
        y1={sy}
        x2={ex}
        y2={ey}
        stroke={arrowColor}
        strokeWidth={1.5}
        strokeDasharray={isActive ? undefined : '4 3'}
        opacity={isActive ? 0.9 : 0.5}
      />
      <polygon
        points="-6,-3 0,0 -6,3"
        fill={arrowColor}
        transform={`translate(${ex},${ey}) rotate(${angle})`}
        opacity={isActive ? 0.9 : 0.5}
      />
      <text
        x={midX}
        y={midY - 8}
        textAnchor="middle"
        fill={labelColor}
        fontSize={8}
        fontFamily="Inter, system-ui, sans-serif"
        opacity={0.8}
      >
        {label}
      </text>
    </g>
  );
}

export function HealthStateMachine({ currentState }: HealthStateMachineProps) {
  // Layout positions for each state node
  const positions: Record<AgentState, { x: number; y: number }> = {
    booting: { x: 80, y: 80 },
    working: { x: 240, y: 80 },
    stalled: { x: 400, y: 80 },
    zombie: { x: 560, y: 80 },
  };

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Agent Health State Machine</h3>
        {currentState && (
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={{
              backgroundColor: states.find((s) => s.id === currentState)?.bgColor,
              color: states.find((s) => s.id === currentState)?.color,
              border: `1px solid ${states.find((s) => s.id === currentState)?.borderColor}`,
            }}
          >
            {currentState.charAt(0).toUpperCase() + currentState.slice(1)}
          </span>
        )}
      </div>

      <svg
        viewBox="0 0 640 160"
        className="w-full"
        style={{ maxHeight: '180px' }}
        role="img"
        aria-labelledby="health-state-machine-title"
      >
        <title id="health-state-machine-title">
          Agent health state machine diagram showing transitions between booting, working, stalled,
          and zombie states
        </title>
        {/* Transition arrows */}
        {/* booting -> working */}
        <TransitionArrow
          x1={positions.booting.x}
          y1={positions.booting.y}
          x2={positions.working.x}
          y2={positions.working.y}
          label="initialized"
          isActive={currentState === 'booting' || currentState === 'working'}
          color="#22c55e"
        />

        {/* working -> stalled */}
        <TransitionArrow
          x1={positions.working.x}
          y1={positions.working.y}
          x2={positions.stalled.x}
          y2={positions.stalled.y}
          label="no output (5min)"
          isActive={currentState === 'stalled' || currentState === 'zombie'}
          color="#f59e0b"
        />

        {/* stalled -> zombie */}
        <TransitionArrow
          x1={positions.stalled.x}
          y1={positions.stalled.y}
          x2={positions.zombie.x}
          y2={positions.zombie.y}
          label="no response (15min)"
          isActive={currentState === 'zombie'}
          color="#ef4444"
        />

        {/* stalled -> working (curved, going above) */}
        <TransitionArrow
          x1={positions.stalled.x}
          y1={positions.stalled.y}
          x2={positions.working.x}
          y2={positions.working.y}
          label="nudged / resumed"
          isActive={currentState === 'working'}
          color="#22c55e"
          curved
          curveDirection="up"
        />

        {/* State nodes */}
        {states.map((state) => (
          <StateNode
            key={state.id}
            state={state}
            isActive={currentState === state.id}
            x={positions[state.id].x}
            y={positions[state.id].y}
          />
        ))}
      </svg>

      {/* Legend */}
      <div className="mt-2 flex items-center justify-center gap-4 text-xs text-slate-400">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-sky-500" />
          <span>Booting</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          <span>Working</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-amber-500" />
          <span>Stalled</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-red-500" />
          <span>Zombie</span>
        </div>
      </div>
    </div>
  );
}
