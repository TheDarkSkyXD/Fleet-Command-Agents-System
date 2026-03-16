import { useState } from 'react';
import {
  FiBookOpen,
  FiCheckCircle,
  FiChevronRight,
  FiFile,
  FiLoader,
  FiSearch,
} from 'react-icons/fi';
import type { DiscoveryCategory, DiscoveryFinding, DiscoveryScan } from '../../../../shared/types';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Card, CardContent } from '../../../components/ui/card';
import { SeverityIcon } from './SeverityIcon';
import { DISCOVERY_CATEGORIES, safeJsonParse } from './types';

export function DiscoveryResultsView({
  scan,
  findings,
  selectedCategory,
  onSelectCategory,
  onGenerateExpertise,
}: {
  scan: DiscoveryScan;
  findings: DiscoveryFinding[];
  selectedCategory: DiscoveryCategory | null;
  onSelectCategory: (category: DiscoveryCategory) => void;
  onGenerateExpertise: () => Promise<number>;
}) {
  const categories = safeJsonParse<DiscoveryCategory[]>(scan.categories, []);
  const [generating, setGenerating] = useState(false);
  const [generatedCount, setGeneratedCount] = useState<number | null>(null);

  const handleGenerate = async () => {
    setGenerating(true);
    setGeneratedCount(null);
    try {
      const count = await onGenerateExpertise();
      setGeneratedCount(count);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Auto-generate expertise bar */}
      <Card className="border-slate-700 bg-slate-800/50 p-0">
        <CardContent className="flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3">
            <FiBookOpen className="text-emerald-400" size={18} />
            <div>
              <span className="text-sm font-medium text-slate-200">Generate Expertise Records</span>
              <p className="text-xs text-slate-400">
                Automatically create expertise entries from all discovery findings
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {generatedCount !== null && (
              <span
                className="flex items-center gap-1.5 text-xs text-emerald-400"
                data-testid="generated-count"
              >
                <FiCheckCircle size={12} />
                {generatedCount} records created
              </span>
            )}
            <Button
              onClick={handleGenerate}
              disabled={generating}
              data-testid="generate-expertise-btn"
              className="bg-slate-800/90 border border-blue-500/30 text-blue-300 hover:bg-slate-700/90 hover:border-blue-400/40 shadow-sm"
              size="sm"
            >
              {generating ? (
                <>
                  <FiLoader className="animate-spin" size={14} />
                  Generating...
                </>
              ) : (
                <>
                  <FiBookOpen size={14} />
                  Generate Expertise
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-12 gap-4">
        {/* Category sidebar */}
        <div className="col-span-3 space-y-1">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Categories
          </h3>
          {categories.map((catId) => {
            const cat = DISCOVERY_CATEGORIES.find((c) => c.id === catId);
            if (!cat) return null;
            const Icon = cat.icon;
            const isActive = selectedCategory === catId;

            return (
              <Button
                key={catId}
                variant="ghost"
                onClick={() => onSelectCategory(catId)}
                className={`flex w-full items-center justify-start gap-2 px-3 py-2 text-sm h-auto ${
                  isActive
                    ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 hover:text-blue-400'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <Icon size={14} />
                <span className="flex-1 text-left">{cat.label}</span>
                <FiChevronRight
                  size={12}
                  className={`transition-transform ${isActive ? 'rotate-90' : ''}`}
                />
              </Button>
            );
          })}
        </div>

        {/* Findings panel */}
        <div className="col-span-9">
          {selectedCategory ? (
            <Card className="border-slate-700 bg-slate-800/50 p-0">
              <CardContent className="p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-slate-100">
                    {DISCOVERY_CATEGORIES.find((c) => c.id === selectedCategory)?.label} Findings
                  </h2>
                  <span className="text-sm text-slate-400">{findings.length} findings</span>
                </div>

                {findings.length === 0 ? (
                  <div className="py-8 text-center text-slate-400">
                    <FiSearch className="mx-auto mb-2" size={24} />
                    <p className="text-sm">No findings in this category</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {findings.map((finding) => (
                      <div
                        key={finding.id}
                        className="rounded-md border border-slate-600 bg-slate-800 p-4"
                      >
                        <div className="flex items-start gap-2">
                          <SeverityIcon severity={finding.severity} />
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-medium text-slate-200">{finding.title}</h4>
                            <p className="mt-1 text-xs text-slate-400">{finding.description}</p>
                            {finding.file_path && (
                              <div className="mt-2 flex items-center gap-1 text-xs text-slate-400">
                                <FiFile size={10} />
                                <span className="font-mono">
                                  {finding.file_path}
                                  {finding.line_number ? `:${finding.line_number}` : ''}
                                </span>
                              </div>
                            )}
                          </div>
                          <Badge
                            variant="outline"
                            className={`text-xs ${
                              finding.severity === 'important'
                                ? 'bg-red-500/10 text-red-400 border-red-500/30'
                                : finding.severity === 'warning'
                                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                  : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                            }`}
                          >
                            {finding.severity}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="flex items-center justify-center rounded-lg border border-dashed border-slate-600 py-16">
              <p className="text-sm text-slate-400">Select a category to view findings</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
