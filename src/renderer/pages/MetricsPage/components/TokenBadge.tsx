interface TokenBadgeProps {
  label: string;
  value: string;
  color: string;
}

export function TokenBadge({ label, value, color }: TokenBadgeProps) {
  return (
    <div className="bg-slate-900/50 rounded px-2 py-1">
      <div className="text-slate-400 text-[10px] uppercase">{label}</div>
      <div className={`${color} font-medium`}>{value}</div>
    </div>
  );
}
