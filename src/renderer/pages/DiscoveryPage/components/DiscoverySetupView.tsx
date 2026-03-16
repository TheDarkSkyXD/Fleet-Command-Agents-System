import {
  FiCheckCircle,
  FiPlay,
  FiSearch,
  FiTrash2,
} from 'react-icons/fi';
import type { DiscoveryCategory, DiscoveryScan } from '../../../../shared/types';
import { AnimatedCard, AnimatedCardContainer } from '../../../components/AnimatedCard';
import { Tooltip } from '../../../components/Tooltip';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { DISCOVERY_CATEGORIES, safeJsonParse } from './types';

export function DiscoverySetupView({
  selectedCategories,
  onToggleCategory,
  onSelectAll,
  onStartDiscovery,
  scans,
  onViewScan,
  onDeleteScan,
}: {
  selectedCategories: Set<DiscoveryCategory>;
  onToggleCategory: (id: DiscoveryCategory) => void;
  onSelectAll: () => void;
  onStartDiscovery: () => void;
  scans: DiscoveryScan[];
  onViewScan: (scan: DiscoveryScan) => void;
  onDeleteScan: (scanId: string) => void;
}) {
  return (
    <>
      {/* Discovery Mode Options */}
      <Card className="border-slate-700 bg-slate-800/50 p-0">
        <CardContent className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-100">Discovery Categories</h2>
            <Button
              variant="link"
              size="sm"
              onClick={onSelectAll}
              className="text-xs text-blue-400 hover:text-blue-300 p-0 h-auto"
            >
              Select All
            </Button>
          </div>
          <p className="mb-4 text-sm text-slate-400">
            Select which categories to discover in the codebase. Each category deploys a scout agent
            to analyze specific aspects.
          </p>

          <AnimatedCardContainer className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {DISCOVERY_CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const isSelected = selectedCategories.has(cat.id);
              return (
                <AnimatedCard key={cat.id}>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onToggleCategory(cat.id)}
                  className={`flex items-start gap-3 rounded-lg border p-4 text-left transition-all h-auto whitespace-normal ${
                    isSelected
                      ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/30 hover:bg-blue-500/15'
                      : 'border-slate-600 bg-slate-800 hover:border-slate-500 hover:bg-slate-700/50'
                  }`}
                >
                  <div
                    className={`mt-0.5 rounded-md p-2 ${isSelected ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-700 text-slate-400'}`}
                  >
                    <Icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm font-medium ${isSelected ? 'text-blue-300' : 'text-slate-200'}`}
                      >
                        {cat.label}
                      </span>
                      {isSelected && <FiCheckCircle className="text-blue-400" size={14} />}
                    </div>
                    <p className="mt-1 text-xs text-slate-400 line-clamp-2">{cat.description}</p>
                  </div>
                </Button>
                </AnimatedCard>
              );
            })}
          </AnimatedCardContainer>

          <div className="mt-5 flex items-center justify-between">
            <span className="text-sm text-slate-400">
              {selectedCategories.size} of {DISCOVERY_CATEGORIES.length} categories selected
            </span>
            <Button
              onClick={onStartDiscovery}
              disabled={selectedCategories.size === 0}
              className="bg-slate-800/90 border border-blue-500/30 text-blue-300 hover:bg-slate-700/90 hover:border-blue-400/40 shadow-sm"
            >
              <FiPlay size={14} />
              Start Discovery
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Previous Scans */}
      {scans.length > 0 && (
        <Card className="border-slate-700 bg-slate-800/50 p-0">
          <CardContent className="p-5">
            <h2 className="mb-3 text-lg font-semibold text-slate-100">Previous Scans</h2>
            <div className="space-y-2">
              {scans.map((scan) => {
                const categories = safeJsonParse<string[]>(scan.categories, []);
                return (
                  <div
                    key={scan.id}
                    className="flex items-center justify-between rounded-md border border-slate-600 bg-slate-800 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`h-2 w-2 rounded-full ${
                          scan.status === 'completed'
                            ? 'bg-green-400'
                            : scan.status === 'running'
                              ? 'bg-blue-400 animate-pulse'
                              : scan.status === 'failed'
                                ? 'bg-red-400'
                                : 'bg-slate-400'
                        }`}
                      />
                      <div>
                        <span className="text-sm text-slate-200">
                          {categories.length} categories scanned
                        </span>
                        <span className="ml-2 text-xs text-slate-400">
                          {new Date(scan.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {scan.status === 'completed' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onViewScan(scan)}
                          className="text-xs text-blue-400 hover:bg-slate-700 h-auto px-2 py-1"
                        >
                          <FiSearch size={12} />
                          View Results
                        </Button>
                      )}
                      <Tooltip content="Delete scan">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onDeleteScan(scan.id)}
                          className="text-slate-400 hover:bg-slate-700 hover:text-red-400 h-8 w-8"
                        >
                          <FiTrash2 size={14} />
                        </Button>
                      </Tooltip>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
