/** Skeleton rows for table loading state */
export function AgentTableSkeleton() {
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 overflow-hidden" data-testid="agent-list-skeleton">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-b border-slate-700/30 last:border-b-0 px-4 py-3.5"
          style={{ animationDelay: `${i * 100}ms` }}
        >
          <div className="h-3 w-3 rounded-full animate-shimmer" />
          <div className="h-4 w-28 rounded animate-shimmer" style={{ animationDelay: `${i * 50}ms` }} />
          <div className="h-5 w-16 rounded-full animate-shimmer" style={{ animationDelay: `${i * 80}ms` }} />
          <div className="h-5 w-14 rounded-full animate-shimmer" style={{ animationDelay: `${i * 110}ms` }} />
          <div className="flex-1" />
          <div className="h-4 w-16 rounded animate-shimmer" style={{ animationDelay: `${i * 60}ms` }} />
          <div className="h-4 w-12 rounded animate-shimmer" style={{ animationDelay: `${i * 90}ms` }} />
          <div className="h-7 w-7 rounded animate-shimmer" />
        </div>
      ))}
    </div>
  );
}
