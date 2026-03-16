import { motion } from 'framer-motion';

/** Skeleton cards for card view loading state */
export function AgentCardSkeleton() {
  return (
    <div className="grid gap-3" data-testid="agent-card-skeleton">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: i * 0.08 }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 rounded-full animate-shimmer" />
              <div className="h-5 w-28 rounded animate-shimmer" style={{ animationDelay: `${i * 50}ms` }} />
              <div className="h-5 w-16 rounded-full animate-shimmer" style={{ animationDelay: `${i * 80}ms` }} />
              <div className="h-5 w-14 rounded-full animate-shimmer" style={{ animationDelay: `${i * 110}ms` }} />
            </div>
            <div className="flex items-center gap-3">
              <div className="h-4 w-12 rounded animate-shimmer" />
              <div className="h-4 w-14 rounded animate-shimmer" />
              <div className="h-7 w-7 rounded animate-shimmer" />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-4">
            <div className="h-3 w-20 rounded animate-shimmer" />
            <div className="h-3 w-32 rounded animate-shimmer" />
          </div>
          <div className="mt-3 h-1.5 w-full rounded-full animate-shimmer" />
        </motion.div>
      ))}
    </div>
  );
}
