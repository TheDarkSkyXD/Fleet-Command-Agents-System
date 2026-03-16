/** Compact progress bar indicator for agent cards and table rows */
export function AgentProgressBar({
  percent,
  phase,
  label,
  compact,
}: {
  percent: number;
  phase: string;
  label: string;
  compact?: boolean;
}) {
  // Ongoing agents show a pulsing bar
  if (percent === -1) {
    return (
      <div
        className={`flex items-center gap-2 ${compact ? '' : 'mt-2'}`}
        data-testid="agent-progress-indicator"
      >
        <div
          className={`flex-1 ${compact ? 'h-1' : 'h-1.5'} rounded-full bg-slate-700 overflow-hidden`}
        >
          <div className="h-full w-1/3 rounded-full bg-blue-500/60 animate-pulse" />
        </div>
        <span className={`${compact ? 'text-[10px]' : 'text-xs'} text-slate-400 whitespace-nowrap`}>
          {label}
        </span>
      </div>
    );
  }

  let barColor = 'bg-blue-500';
  if (percent >= 80) barColor = 'bg-emerald-500';
  else if (percent >= 50) barColor = 'bg-cyan-500';
  if (phase === 'Stalled') barColor = 'bg-amber-500';
  if (phase === 'Error') barColor = 'bg-red-500';

  return (
    <div
      className={`flex items-center gap-2 ${compact ? '' : 'mt-2'}`}
      data-testid="agent-progress-indicator"
      title={`${phase}: ${label}`}
    >
      <div
        className={`flex-1 ${compact ? 'h-1' : 'h-1.5'} rounded-full bg-slate-700 overflow-hidden`}
        data-testid="agent-progress-bar"
      >
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-1000 ease-out`}
          style={{ width: `${percent}%` }}
          data-testid="agent-progress-fill"
        />
      </div>
      <span
        className={`${compact ? 'text-[10px]' : 'text-xs'} text-slate-400 whitespace-nowrap`}
        data-testid="agent-progress-label"
      >
        {compact ? label : `${phase} \u00B7 ${label}`}
      </span>
    </div>
  );
}
