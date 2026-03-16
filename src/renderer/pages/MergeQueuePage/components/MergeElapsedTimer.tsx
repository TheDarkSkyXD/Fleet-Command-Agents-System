import { useEffect, useState } from 'react';

export function MergeElapsedTimer({ startTime }: { startTime: string }) {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    const start = new Date(startTime).getTime();
    const update = () => {
      const diff = Math.max(0, Math.floor((Date.now() - start) / 1000));
      const mins = Math.floor(diff / 60);
      const secs = diff % 60;
      setElapsed(mins > 0 ? `${mins}m ${secs}s` : `${secs}s`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  return <span className="text-xs font-mono text-slate-400 tabular-nums">{elapsed}</span>;
}
