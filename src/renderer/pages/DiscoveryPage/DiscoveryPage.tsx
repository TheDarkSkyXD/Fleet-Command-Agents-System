import { useCallback, useEffect, useState } from 'react';
import type { DiscoveryCategory, DiscoveryFinding, DiscoveryScan } from '../../../shared/types';
import { Button } from '../../components/ui/button';
import {
  DISCOVERY_CATEGORIES,
  DiscoveryProgressView,
  DiscoveryResultsView,
  DiscoverySetupView,
  safeJsonParse,
} from './components';
import './DiscoveryPage.css';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
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
    const categories = safeJsonParse<DiscoveryCategory[]>(scan.categories, []);
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
    const categories = safeJsonParse<DiscoveryCategory[]>(activeScan.categories, []);

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
          <Button
            variant="secondary"
            size="sm"
            onClick={backToSetup}
            className="bg-slate-700 text-slate-300 hover:bg-slate-600"
          >
            New Scan
          </Button>
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
