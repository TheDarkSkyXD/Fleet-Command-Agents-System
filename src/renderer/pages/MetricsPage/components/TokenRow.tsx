interface TokenRowProps {
  label: string;
  value: number;
  color: string;
}

export function TokenRow({ label, value, color }: TokenRowProps) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-400">{label}</span>
      <span className={`${color} font-mono font-medium`}>{value.toLocaleString()}</span>
    </div>
  );
}
