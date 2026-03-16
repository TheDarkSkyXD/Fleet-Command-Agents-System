interface DetailRowProps {
  label: string;
  value: string;
}

export function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-300 text-right max-w-[180px] truncate" title={value}>
        {value}
      </span>
    </div>
  );
}
