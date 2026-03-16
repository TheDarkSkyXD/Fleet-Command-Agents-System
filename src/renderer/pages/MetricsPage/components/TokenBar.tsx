import type { FormatTokenCount } from './types';

interface TokenBarProps {
  label: string;
  value: number;
  max: number;
  color: string;
  textColor: string;
  formatTokenCount: FormatTokenCount;
}

export function TokenBar({ label, value, max, color, textColor, formatTokenCount }: TokenBarProps) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-slate-400">{label}</span>
        <span className={`${textColor} font-mono font-medium`}>
          {formatTokenCount(value)} ({pct.toFixed(1)}%)
        </span>
      </div>
      <div className="h-3 bg-slate-900/50 rounded-full overflow-hidden">
        <div
          className={`${color} h-full rounded-full transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
