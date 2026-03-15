import { useCallback, useEffect, useState } from 'react';
import {
  FiActivity,
  FiAlertCircle,
  FiAlertTriangle,
  FiBookOpen,
  FiCheckCircle,
  FiChevronRight,
  FiCode,
  FiFile,
  FiFolder,
  FiInfo,
  FiLayers,
  FiLoader,
  FiPackage,
  FiPlay,
  FiSearch,
  FiSettings,
  FiTrash2,
} from 'react-icons/fi';
import type { DiscoveryCategory, DiscoveryFinding, DiscoveryScan } from '../../shared/types';

const DISCOVERY_CATEGORIES: {
  id: DiscoveryCategory;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  description: string;
}[] = [
  {
    id: 'architecture',
    label: 'Architecture',
    icon: FiLayers,
    description: 'Project structure, folder layout, design patterns, and component organization',
  },
  {
    id: 'dependencies',
    label: 'Dependencies',
    icon: FiPackage,
    description: 'Package dependencies, version compatibility, and third-party integrations',
  },
  {
    id: 'testing',
    label: 'Testing',
    icon: FiCheckCircle,
    description: 'Test frameworks, coverage, test patterns, and testing conventions',
  },
  {
    id: 'apis',
    label: 'APIs',
    icon: FiCode,
    description: 'API endpoints, data contracts, communication protocols, and integrations',
  },
  {
    id: 'config',
    label: 'Configuration',
    icon: FiSettings,
    description: 'Build tools, environment variables, deployment configs, and CI/CD',
  },
  {
    id: 'conventions',
    label: 'Conventions',
    icon: FiFolder,
    description: 'Coding style, naming conventions, file patterns, and implicit rules',
  },
];

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

function SeverityIcon({ severity }: { severity: string }) {
  switch (severity) {
    case 'important':
      return <FiAlertCircle className="text-red-400" size={14} />;
    case 'warning':
      return <FiAlertTriangle className="text-amber-400" size={14} />;
    default:
      return <FiInfo className="text-blue-400" size={14} />;
  }
}

export function DiscoveryPage() {
  const [scans, setScans] = useState<DiscoveryScan[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<Set<DiscoveryCategory>>(new Set());
  const [activeScan, setActiveScan] = useState<DiscoveryScan | null>(null);
  const [findings, setFindings] = useState<DiscoveryFinding[]>([]);
  const [selectedResultCategory, setSelectedResultCategory] = useState<DiscoveryCategory | null>(
    null,
  );
  const [view, setView] = useState<'setup' | 'progress' | 'results'>('setup');

  // Load scans on mount
  useEffect(() => {
    loadScans();
  }, []);

  const loadScans = async () => {
    const result = await window.electronAPI.discoveryList();
    if (result.data) {
      setScans(result.data);
    }
  };

  const toggleCategory = (id: DiscoveryCategory) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllCategories = () => {
    setSelectedCategories(new Set(DISCOVERY_CATEGORIES.map((c) => c.id)));
  };

  const startDiscovery = async () => {
    if (selectedCategories.size === 0) return;
    const scanId = `scan-${generateId()}`;
    const categories = Array.from(selectedCategories);
    const result = await window.electronAPI.discoveryStart({
      id: scanId,
      categories,
    });
    if (result.data) {
      setActiveScan(result.data);
      setView('progress');
      // Simulate progress through categories
      simulateDiscovery(scanId, categories);
    }
  };

  const simulateDiscovery = async (scanId: string, categories: string[]) => {
    const progress: Record<string, string> = {};
    for (const cat of categories) {
      progress[cat] = 'pending';
    }

    for (const cat of categories) {
      // Mark category as running
      progress[cat] = 'running';
      await window.electronAPI.discoveryUpdateProgress(scanId, { ...progress });
      // Refresh scan
      const scanResult = await window.electronAPI.discoveryGet(scanId);
      if (scanResult.data) setActiveScan(scanResult.data);

      // Simulate work: add sample findings for each category
      const sampleFindings = getSampleFindings(cat as DiscoveryCategory);
      for (const f of sampleFindings) {
        await window.electronAPI.discoveryAddFinding({
          id: `finding-${generateId()}`,
          scan_id: scanId,
          category: cat,
          title: f.title,
          description: f.description,
          file_path: f.file_path,
          line_number: f.line_number,
          severity: f.severity,
        });
      }

      // Mark category as completed
      progress[cat] = 'completed';
      await window.electronAPI.discoveryUpdateProgress(scanId, { ...progress });
      const updatedScan = await window.electronAPI.discoveryGet(scanId);
      if (updatedScan.data) setActiveScan(updatedScan.data);

      // Brief pause between categories
      await new Promise((resolve) => setTimeout(resolve, 800));
    }

    // Mark scan as completed
    await window.electronAPI.discoveryComplete(scanId);
    const finalScan = await window.electronAPI.discoveryGet(scanId);
    if (finalScan.data) setActiveScan(finalScan.data);
    await loadScans();
    setView('results');
    // Load findings for the first category
    if (categories.length > 0) {
      setSelectedResultCategory(categories[0] as DiscoveryCategory);
      const findingsResult = await window.electronAPI.discoveryFindings(scanId, categories[0]);
      if (findingsResult.data) setFindings(findingsResult.data);
    }
  };

  const viewScanResults = async (scan: DiscoveryScan) => {
    setActiveScan(scan);
    const categories = JSON.parse(scan.categories) as DiscoveryCategory[];
    if (categories.length > 0) {
      setSelectedResultCategory(categories[0]);
      const findingsResult = await window.electronAPI.discoveryFindings(scan.id, categories[0]);
      if (findingsResult.data) setFindings(findingsResult.data);
    }
    setView('results');
  };

  const selectCategory = async (category: DiscoveryCategory) => {
    if (!activeScan) return;
    setSelectedResultCategory(category);
    const findingsResult = await window.electronAPI.discoveryFindings(activeScan.id, category);
    if (findingsResult.data) setFindings(findingsResult.data);
  };

  const deleteScan = async (scanId: string) => {
    await window.electronAPI.discoveryDelete(scanId);
    if (activeScan?.id === scanId) {
      setActiveScan(null);
      setView('setup');
    }
    await loadScans();
  };

  const backToSetup = useCallback(() => {
    setActiveScan(null);
    setFindings([]);
    setSelectedResultCategory(null);
    setView('setup');
  }, []);

  const generateExpertiseFromScan = async (): Promise<number> => {
    if (!activeScan) return 0;
    const categories = JSON.parse(activeScan.categories) as DiscoveryCategory[];

    // Map discovery category to expertise domain
    const domainMap: Record<DiscoveryCategory, string> = {
      architecture: 'Architecture',
      dependencies: 'Dependencies',
      testing: 'Testing',
      apis: 'APIs',
      config: 'Configuration',
      conventions: 'Conventions',
    };

    // Map discovery severity to expertise type
    const typeMap: Record<string, string> = {
      important: 'decision',
      warning: 'failure',
      info: 'convention',
    };

    // Map discovery severity to expertise classification
    const classificationMap: Record<string, string> = {
      important: 'foundational',
      warning: 'tactical',
      info: 'observational',
    };

    let created = 0;

    for (const catId of categories) {
      const findingsResult = await window.electronAPI.discoveryFindings(activeScan.id, catId);
      if (!findingsResult.data) continue;

      for (const finding of findingsResult.data) {
        const domain = domainMap[catId] || catId;
        const expertiseType = typeMap[finding.severity] || 'convention';
        const classification = classificationMap[finding.severity] || 'observational';

        const content = [
          finding.description,
          finding.file_path
            ? `\nSource: ${finding.file_path}${finding.line_number ? `:${finding.line_number}` : ''}`
            : '',
        ]
          .filter(Boolean)
          .join('');

        const result = await window.electronAPI.expertiseCreate({
          id: `expertise-${generateId()}`,
          domain,
          title: finding.title,
          content,
          type: expertiseType,
          classification,
          agent_name: 'discovery-scanner',
          source_file: finding.file_path || undefined,
          tags: JSON.stringify([catId, 'auto-generated', `scan:${activeScan.id}`]),
        });

        if (result.data) created++;
      }
    }

    return created;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">Codebase Discovery</h1>
          <p className="mt-1 text-sm text-slate-400">
            Explore existing codebases before building with category-based discovery
          </p>
        </div>
        {view !== 'setup' && (
          <button
            type="button"
            onClick={backToSetup}
            className="rounded-md bg-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-600 transition-colors"
          >
            New Scan
          </button>
        )}
      </div>

      {view === 'setup' && (
        <DiscoverySetupView
          selectedCategories={selectedCategories}
          onToggleCategory={toggleCategory}
          onSelectAll={selectAllCategories}
          onStartDiscovery={startDiscovery}
          scans={scans}
          onViewScan={viewScanResults}
          onDeleteScan={deleteScan}
        />
      )}

      {view === 'progress' && activeScan && <DiscoveryProgressView scan={activeScan} />}

      {view === 'results' && activeScan && (
        <DiscoveryResultsView
          scan={activeScan}
          findings={findings}
          selectedCategory={selectedResultCategory}
          onSelectCategory={selectCategory}
          onGenerateExpertise={generateExpertiseFromScan}
        />
      )}
    </div>
  );
}

function DiscoverySetupView({
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
      <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">Discovery Categories</h2>
          <button
            type="button"
            onClick={onSelectAll}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            Select All
          </button>
        </div>
        <p className="mb-4 text-sm text-slate-400">
          Select which categories to discover in the codebase. Each category deploys a scout agent
          to analyze specific aspects.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {DISCOVERY_CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isSelected = selectedCategories.has(cat.id);
            return (
              <button
                type="button"
                key={cat.id}
                onClick={() => onToggleCategory(cat.id)}
                className={`flex items-start gap-3 rounded-lg border p-4 text-left transition-all ${
                  isSelected
                    ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/30'
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
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex items-center justify-between">
          <span className="text-sm text-slate-400">
            {selectedCategories.size} of {DISCOVERY_CATEGORIES.length} categories selected
          </span>
          <button
            type="button"
            onClick={onStartDiscovery}
            disabled={selectedCategories.size === 0}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FiPlay size={14} />
            Start Discovery
          </button>
        </div>
      </div>

      {/* Previous Scans */}
      {scans.length > 0 && (
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-5">
          <h2 className="mb-3 text-lg font-semibold text-slate-100">Previous Scans</h2>
          <div className="space-y-2">
            {scans.map((scan) => {
              const categories = JSON.parse(scan.categories) as string[];
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
                      <span className="ml-2 text-xs text-slate-500">
                        {new Date(scan.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {scan.status === 'completed' && (
                      <button
                        type="button"
                        onClick={() => onViewScan(scan)}
                        className="flex items-center gap-1 rounded px-2 py-1 text-xs text-blue-400 hover:bg-slate-700 transition-colors"
                      >
                        <FiSearch size={12} />
                        View Results
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onDeleteScan(scan.id)}
                      className="rounded p-1 text-slate-500 hover:bg-slate-700 hover:text-red-400 transition-colors"
                    >
                      <FiTrash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

function DiscoveryProgressView({ scan }: { scan: DiscoveryScan }) {
  const categories = JSON.parse(scan.categories) as DiscoveryCategory[];
  const progress: Record<string, string> = scan.progress ? JSON.parse(scan.progress) : {};

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
    <div
      className="rounded-lg border border-slate-700 bg-slate-800/50 p-5"
      data-testid="discovery-progress"
    >
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
      <div className="mb-6 flex items-center justify-between text-xs text-slate-500">
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
                          : 'text-slate-500'
                    }`}
                    data-testid={`category-percent-${catId}`}
                  >
                    {catPercent}%
                  </span>
                  <div className="w-20">
                    {status === 'running' && (
                      <div className="flex items-center gap-1.5">
                        <FiActivity className="animate-pulse text-blue-400" size={12} />
                        <span className="text-xs text-blue-400">Scanning</span>
                      </div>
                    )}
                    {status === 'completed' && (
                      <div className="flex items-center gap-1.5">
                        <FiCheckCircle className="text-green-400" size={12} />
                        <span className="text-xs text-green-400">Complete</span>
                      </div>
                    )}
                    {status === 'pending' && (
                      <span className="text-xs text-slate-500">Pending</span>
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
    </div>
  );
}

function DiscoveryResultsView({
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
  const categories = JSON.parse(scan.categories) as DiscoveryCategory[];
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
      <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/50 px-5 py-3">
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
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            data-testid="generate-expertise-btn"
            className="flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
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
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Category sidebar */}
        <div className="col-span-3 space-y-1">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Categories
          </h3>
          {categories.map((catId) => {
            const cat = DISCOVERY_CATEGORIES.find((c) => c.id === catId);
            if (!cat) return null;
            const Icon = cat.icon;
            const isActive = selectedCategory === catId;

            return (
              <button
                type="button"
                key={catId}
                onClick={() => onSelectCategory(catId)}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-blue-600/20 text-blue-400'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <Icon size={14} />
                <span>{cat.label}</span>
                <FiChevronRight
                  size={12}
                  className={`ml-auto transition-transform ${isActive ? 'rotate-90' : ''}`}
                />
              </button>
            );
          })}
        </div>

        {/* Findings panel */}
        <div className="col-span-9">
          {selectedCategory ? (
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-100">
                  {DISCOVERY_CATEGORIES.find((c) => c.id === selectedCategory)?.label} Findings
                </h2>
                <span className="text-sm text-slate-400">{findings.length} findings</span>
              </div>

              {findings.length === 0 ? (
                <div className="py-8 text-center text-slate-500">
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
                            <div className="mt-2 flex items-center gap-1 text-xs text-slate-500">
                              <FiFile size={10} />
                              <span className="font-mono">
                                {finding.file_path}
                                {finding.line_number ? `:${finding.line_number}` : ''}
                              </span>
                            </div>
                          )}
                        </div>
                        <span
                          className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                            finding.severity === 'important'
                              ? 'bg-red-500/10 text-red-400'
                              : finding.severity === 'warning'
                                ? 'bg-amber-500/10 text-amber-400'
                                : 'bg-blue-500/10 text-blue-400'
                          }`}
                        >
                          {finding.severity}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center rounded-lg border border-dashed border-slate-600 py-16">
              <p className="text-sm text-slate-500">Select a category to view findings</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Sample findings for discovery simulation
function getSampleFindings(category: DiscoveryCategory): Array<{
  title: string;
  description: string;
  file_path?: string;
  line_number?: number;
  severity: string;
}> {
  switch (category) {
    case 'architecture':
      return [
        {
          title: 'Electron IPC Architecture',
          description:
            'Main process communicates with renderer via typed IPC handlers with context bridge isolation.',
          file_path: 'src/main/ipc/handlers.ts',
          severity: 'info',
        },
        {
          title: 'Component Structure',
          description:
            'React components organized into pages/ and components/ directories with shared types.',
          file_path: 'src/renderer/',
          severity: 'info',
        },
      ];
    case 'dependencies':
      return [
        {
          title: 'SQLite Database',
          description:
            'Uses better-sqlite3 for persistent storage with WAL mode enabled for concurrent access.',
          file_path: 'package.json',
          severity: 'info',
        },
        {
          title: 'React 19 Framework',
          description: 'Frontend built with React 19, Vite bundler, and Tailwind CSS v4 styling.',
          file_path: 'package.json',
          severity: 'info',
        },
      ];
    case 'testing':
      return [
        {
          title: 'No Test Framework Detected',
          description:
            'No testing framework (Jest, Vitest, Playwright) found in dependencies or config.',
          severity: 'warning',
        },
      ];
    case 'apis':
      return [
        {
          title: 'IPC Channels Detected',
          description:
            'Application uses Electron IPC channels for internal API communication between main and renderer processes.',
          file_path: 'src/preload/index.ts',
          severity: 'info',
        },
        {
          title: 'Claude CLI Integration',
          description:
            'External CLI tool integration for agent spawning via claude command-line interface.',
          file_path: 'src/main/services/claudeCliService.ts',
          severity: 'important',
        },
      ];
    case 'config':
      return [
        {
          title: 'Vite Build Configuration',
          description:
            'Multi-target Vite config building renderer, main process, and preload scripts.',
          file_path: 'vite.config.ts',
          severity: 'info',
        },
        {
          title: 'Biome Linter',
          description:
            'Using Biome v1.9.4 for linting and formatting instead of ESLint + Prettier.',
          file_path: 'biome.json',
          severity: 'info',
        },
      ];
    case 'conventions':
      return [
        {
          title: 'TypeScript Strict Mode',
          description: 'Project enforces TypeScript strict mode for type safety.',
          file_path: 'tsconfig.json',
          severity: 'info',
        },
        {
          title: 'Shared Types Pattern',
          description:
            'Types are centralized in src/shared/types/index.ts and shared between main and renderer.',
          file_path: 'src/shared/types/index.ts',
          severity: 'info',
        },
      ];
    default:
      return [];
  }
}
