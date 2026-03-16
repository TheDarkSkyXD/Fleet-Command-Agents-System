import { FiActivity, FiCheckCircle } from 'react-icons/fi';
import type { DiscoveryCategory, DiscoveryScan } from '../../../../shared/types';
import { Badge } from '../../../components/ui/badge';
import { Card, CardContent } from '../../../components/ui/card';
import { DISCOVERY_CATEGORIES, safeJsonParse } from './types';

export function DiscoveryProgressView({ scan }: { scan: DiscoveryScan }) {
  const categories = safeJsonParse<DiscoveryCategory[]>(scan.categories, []);
  const progress: Record<string, string> = safeJsonParse<Record<string, string>>(scan.progress, {});

  const completedCount = Object.values(progress).filter((s) => s === 'completed').length;
  const runningCount = Object.values(progress).filter((s) => s === 'running').length;
  const totalCount = categories.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Compute per-category progress percentage (pending=0%, running=50%, completed=100%)
  const getCategoryPercent = (status: string): number => {
    if (status === 'completed') return 100;
    if (status === 'running') return 50;
    return 0;
  };

  return (
    <Card
      className="border-slate-700 bg-slate-800/50 p-0"
      data-testid="discovery-progress"
    >
      <CardContent className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">Discovery in Progress</h2>
          <div className="flex items-center gap-3">
            <span
              className="text-sm font-mono font-bold text-blue-400"
              data-testid="overall-percentage"
            >
              {progressPercent}%
            </span>
            <span className="text-sm text-slate-400" data-testid="category-counter">
              {completedCount}/{totalCount} categories
            </span>
          </div>
        </div>

        {/* Overall progress bar */}
        <div
          className="mb-2 h-3 overflow-hidden rounded-full bg-slate-700"
          data-testid="overall-progress-bar"
        >
          <div
            className="h-full rounded-full bg-blue-500 transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="mb-6 flex items-center justify-between text-xs text-slate-400">
          <span>
            {completedCount} complete{runningCount > 0 ? `, ${runningCount} scanning` : ''},{' '}
            {totalCount - completedCount - runningCount} pending
          </span>
          <span>{scan.status === 'completed' ? 'Scan complete' : 'Scanning...'}</span>
        </div>

        <div className="space-y-3">
          {categories.map((catId) => {
            const cat = DISCOVERY_CATEGORIES.find((c) => c.id === catId);
            if (!cat) return null;
            const Icon = cat.icon;
            const status = progress[catId] || 'pending';
            const catPercent = getCategoryPercent(status);

            return (
              <div
                key={catId}
                data-testid={`category-progress-${catId}`}
                className={`rounded-md border px-4 py-3 transition-all ${
                  status === 'running'
                    ? 'border-blue-500/50 bg-blue-500/5'
                    : status === 'completed'
                      ? 'border-green-500/30 bg-green-500/5'
                      : 'border-slate-600 bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className={`rounded-md p-2 ${
                      status === 'running'
                        ? 'bg-blue-500/20 text-blue-400'
                        : status === 'completed'
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-slate-700 text-slate-400'
                    }`}
                  >
                    <Icon size={16} />
                  </div>
                  <div className="flex-1">
                    <span
                      className={`text-sm font-medium ${
                        status === 'running'
                          ? 'text-blue-300'
                          : status === 'completed'
                            ? 'text-green-300'
                            : 'text-slate-300'
                      }`}
                    >
                      {cat.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs font-mono font-semibold tabular-nums ${
                        status === 'completed'
                          ? 'text-green-400'
                          : status === 'running'
                            ? 'text-blue-400'
                            : 'text-slate-400'
                      }`}
                      data-testid={`category-percent-${catId}`}
                    >
                      {catPercent}%
                    </span>
                    <div className="w-20">
                      {status === 'running' && (
                        <Badge variant="outline" className="bg-transparent border-transparent text-blue-400 gap-1.5 px-0">
                          <FiActivity className="animate-pulse" size={12} />
                          <span className="text-xs">Scanning</span>
                        </Badge>
                      )}
                      {status === 'completed' && (
                        <Badge variant="outline" className="bg-transparent border-transparent text-green-400 gap-1.5 px-0">
                          <FiCheckCircle size={12} />
                          <span className="text-xs">Complete</span>
                        </Badge>
                      )}
                      {status === 'pending' && (
                        <span className="text-xs text-slate-400">Pending</span>
                      )}
                    </div>
                  </div>
                </div>
                {/* Per-category progress bar */}
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-slate-700/50"
                  data-testid={`category-bar-${catId}`}
                >
                  <div
                    className={`h-full rounded-full transition-all duration-700 ease-out ${
                      status === 'completed'
                        ? 'bg-green-500'
                        : status === 'running'
                          ? 'bg-blue-500 animate-pulse'
                          : 'bg-slate-600'
                    }`}
                    style={{ width: `${catPercent}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
