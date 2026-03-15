import { useCallback, useEffect, useState } from 'react';
import {
  FiActivity,
  FiBarChart2,
  FiCpu,
  FiDatabase,
  FiDownload,
  FiRefreshCw,
  FiTrash2,
  FiUsers,
  FiZap,
} from 'react-icons/fi';
import type {
  CapabilityBreakdown,
  Metric,
  MetricsSummary,
  ModelBreakdown,
} from '../../shared/types';

type TabId = 'sessions' | 'models' | 'capabilities';

export function MetricsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('sessions');
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [modelBreakdown, setModelBreakdown] = useState<ModelBreakdown[]>([]);
  const [capabilityBreakdown, setCapabilityBreakdown] = useState<CapabilityBreakdown[]>([]);
  const [summary, setSummary] = useState<MetricsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMetric, setSelectedMetric] = useState<Metric | null>(null);
  const [exporting, setExporting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [metricsRes, modelRes, capabilityRes, summaryRes] = await Promise.all([
        window.electronAPI.metricsList(),
        window.electronAPI.metricsByModel(),
        window.electronAPI.metricsByCapability(),
        window.electronAPI.metricsSummary(),
      ]);
      if (metricsRes.data) setMetrics(metricsRes.data);
      if (modelRes.data) setModelBreakdown(modelRes.data);
      if (capabilityRes.data) setCapabilityBreakdown(capabilityRes.data);
      if (summaryRes.data) setSummary(summaryRes.data);
    } catch (err) {
      console.error('Failed to load metrics:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleExport = async (format: 'csv' | 'json') => {
    setExporting(true);
    try {
      const result = await window.electronAPI.metricsExport(format);
      if (result.error) {
        console.error('Export failed:', result.error);
      }
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  const formatTokenCount = (n: number | null | undefined): string => {
    if (n == null || n === 0) return '0';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  };

  const formatDuration = (ms: number | null | undefined): string => {
    if (ms == null || ms === 0) return '0s';
    if (ms < 1000) return `${ms}ms`;
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}m ${rem}s`;
  };

  const formatCost = (cost: number | null | undefined): string => {
    if (cost == null || cost === 0) return '$0.00';
    return `$${cost.toFixed(4)}`;
  };

  const modelColor = (model: string | null | undefined): string => {
    if (!model) return 'text-slate-400';
    const m = model.toLowerCase();
    if (m.includes('haiku')) return 'text-emerald-400';
    if (m.includes('sonnet')) return 'text-blue-400';
    if (m.includes('opus')) return 'text-purple-400';
    return 'text-slate-400';
  };

  const modelBgColor = (model: string | null | undefined): string => {
    if (!model) return 'bg-slate-700';
    const m = model.toLowerCase();
    if (m.includes('haiku')) return 'bg-emerald-900/40 border-emerald-700/50';
    if (m.includes('sonnet')) return 'bg-blue-900/40 border-blue-700/50';
    if (m.includes('opus')) return 'bg-purple-900/40 border-purple-700/50';
    return 'bg-slate-700';
  };

  const tabs: { id: TabId; label: string; icon: typeof FiActivity }[] = [
    { id: 'sessions', label: 'Per Session', icon: FiActivity },
    { id: 'models', label: 'Model Breakdown', icon: FiCpu },
    { id: 'capabilities', label: 'By Capability', icon: FiUsers },
  ];

  const totalTokens = summary
    ? (summary.total_input_tokens || 0) +
      (summary.total_output_tokens || 0) +
      (summary.total_cache_read_tokens || 0) +
      (summary.total_cache_creation_tokens || 0)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-50 flex items-center gap-2">
            <FiBarChart2 className="text-blue-400" />
            Metrics
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Token usage tracking per agent session and model breakdown
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative group">
            <button
              type="button"
              disabled={exporting || metrics.length === 0}
              className="flex items-center gap-2 rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="export-metrics-btn"
              onClick={() => {
                /* toggle dropdown via group-focus-within */
              }}
            >
              <FiDownload size={14} className={exporting ? 'animate-bounce' : ''} />
              Export
            </button>
            <div className="absolute right-0 mt-1 w-40 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-10 hidden group-focus-within:block">
              <button
                type="button"
                onClick={() => handleExport('csv')}
                className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 rounded-t-lg transition-colors"
                data-testid="export-csv-btn"
              >
                Export as CSV
              </button>
              <button
                type="button"
                onClick={() => handleExport('json')}
                className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 rounded-b-lg transition-colors"
                data-testid="export-json-btn"
              >
                Export as JSON
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={loadData}
            className="flex items-center gap-2 rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
          >
            <FiRefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          icon={<FiDatabase className="text-blue-400" />}
          label="Total Sessions"
          value={String(summary?.total_sessions ?? 0)}
        />
        <SummaryCard
          icon={<FiZap className="text-amber-400" />}
          label="Total Tokens"
          value={formatTokenCount(totalTokens)}
        />
        <SummaryCard
          icon={<FiActivity className="text-emerald-400" />}
          label="Total Duration"
          value={formatDuration(summary?.total_duration_ms)}
        />
        <SummaryCard
          icon={<FiBarChart2 className="text-purple-400" />}
          label="Estimated Cost"
          value={formatCost(summary?.total_cost)}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-700 pb-0">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-blue-400 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'
              }`}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <FiRefreshCw className="animate-spin text-slate-500 mr-2" size={20} />
          <span className="text-slate-500">Loading metrics...</span>
        </div>
      ) : activeTab === 'sessions' ? (
        <SessionsTab
          metrics={metrics}
          selectedMetric={selectedMetric}
          onSelectMetric={setSelectedMetric}
          formatTokenCount={formatTokenCount}
          formatDuration={formatDuration}
          formatCost={formatCost}
          modelColor={modelColor}
          onRefresh={loadData}
        />
      ) : activeTab === 'models' ? (
        <ModelBreakdownTab
          breakdown={modelBreakdown}
          formatTokenCount={formatTokenCount}
          formatDuration={formatDuration}
          formatCost={formatCost}
          modelColor={modelColor}
          modelBgColor={modelBgColor}
        />
      ) : (
        <CapabilityBreakdownTab
          breakdown={capabilityBreakdown}
          formatTokenCount={formatTokenCount}
          formatDuration={formatDuration}
          formatCost={formatCost}
        />
      )}
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
      <div className="flex items-center gap-2 text-sm text-slate-400 mb-1">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold text-slate-50">{value}</div>
    </div>
  );
}

function SessionsTab({
  metrics,
  selectedMetric,
  onSelectMetric,
  formatTokenCount,
  formatDuration,
  formatCost,
  modelColor,
  onRefresh,
}: {
  metrics: Metric[];
  selectedMetric: Metric | null;
  onSelectMetric: (m: Metric | null) => void;
  formatTokenCount: (n: number | null | undefined) => string;
  formatDuration: (ms: number | null | undefined) => string;
  formatCost: (cost: number | null | undefined) => string;
  modelColor: (model: string | null | undefined) => string;
  onRefresh: () => void;
}) {
  const handleDelete = async (id: string) => {
    try {
      await window.electronAPI.metricsDelete(id);
      if (selectedMetric?.id === id) onSelectMetric(null);
      onRefresh();
    } catch (err) {
      console.error('Failed to delete metric:', err);
    }
  };

  if (metrics.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
        <FiActivity size={40} className="mb-3 opacity-50" />
        <p className="text-lg font-medium">No session metrics yet</p>
        <p className="text-sm mt-1">Token usage will appear here after agent sessions complete</p>
      </div>
    );
  }

  return (
    <div className="flex gap-6">
      {/* Session list */}
      <div className="flex-1 space-y-2">
        {metrics.map((m) => {
          const totalTokens =
            (m.input_tokens || 0) +
            (m.output_tokens || 0) +
            (m.cache_read_tokens || 0) +
            (m.cache_creation_tokens || 0);
          const isSelected = selectedMetric?.id === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelectMetric(isSelected ? null : m)}
              className={`w-full text-left rounded-lg border p-4 transition-colors ${
                isSelected
                  ? 'border-blue-500 bg-blue-900/20'
                  : 'border-slate-700 bg-slate-800 hover:bg-slate-750 hover:border-slate-600'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-50">
                    {m.agent_name || 'Unknown Agent'}
                  </span>
                  {m.model_used && (
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border ${modelColor(m.model_used)} bg-slate-900/50 border-slate-700`}
                    >
                      {m.model_used}
                    </span>
                  )}
                  {m.capability && (
                    <span className="text-xs text-slate-500 bg-slate-700/50 px-2 py-0.5 rounded">
                      {m.capability}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span>{formatDuration(m.duration_ms)}</span>
                  <span>{formatCost(m.estimated_cost)}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(m.id);
                    }}
                    className="text-slate-600 hover:text-red-400 transition-colors"
                    title="Delete metric"
                  >
                    <FiTrash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 text-xs">
                <TokenBadge
                  label="Input"
                  value={formatTokenCount(m.input_tokens)}
                  color="text-blue-400"
                />
                <TokenBadge
                  label="Output"
                  value={formatTokenCount(m.output_tokens)}
                  color="text-emerald-400"
                />
                <TokenBadge
                  label="Cache Read"
                  value={formatTokenCount(m.cache_read_tokens)}
                  color="text-amber-400"
                />
                <TokenBadge
                  label="Cache Create"
                  value={formatTokenCount(m.cache_creation_tokens)}
                  color="text-purple-400"
                />
              </div>
              <div className="flex items-center justify-between mt-2 text-xs text-slate-500">
                <span>Total: {formatTokenCount(totalTokens)} tokens</span>
                <span>{m.completed_at || m.started_at || ''}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Detail panel */}
      {selectedMetric && (
        <div className="w-80 rounded-lg border border-slate-700 bg-slate-800 p-5 h-fit sticky top-6">
          <h3 className="text-sm font-semibold text-slate-50 mb-4 flex items-center gap-2">
            <FiActivity className="text-blue-400" />
            Session Detail
          </h3>

          <div className="space-y-3 text-sm">
            <DetailRow label="Agent" value={selectedMetric.agent_name || '—'} />
            <DetailRow label="Model" value={selectedMetric.model_used || '—'} />
            <DetailRow label="Capability" value={selectedMetric.capability || '—'} />
            <DetailRow label="Task ID" value={selectedMetric.task_id || '—'} />
            <DetailRow label="Run ID" value={selectedMetric.run_id || '—'} />
            <DetailRow label="Parent" value={selectedMetric.parent_agent || '—'} />

            <div className="border-t border-slate-700 pt-3 mt-3">
              <h4 className="text-xs font-semibold text-slate-400 uppercase mb-2">
                Token Breakdown
              </h4>
              <div className="space-y-2">
                <TokenRow
                  label="Input Tokens"
                  value={selectedMetric.input_tokens}
                  color="text-blue-400"
                />
                <TokenRow
                  label="Output Tokens"
                  value={selectedMetric.output_tokens}
                  color="text-emerald-400"
                />
                <TokenRow
                  label="Cache Read Tokens"
                  value={selectedMetric.cache_read_tokens}
                  color="text-amber-400"
                />
                <TokenRow
                  label="Cache Creation Tokens"
                  value={selectedMetric.cache_creation_tokens}
                  color="text-purple-400"
                />
              </div>
            </div>

            <div className="border-t border-slate-700 pt-3 mt-3">
              <DetailRow label="Duration" value={formatDuration(selectedMetric.duration_ms)} />
              <DetailRow label="Est. Cost" value={formatCost(selectedMetric.estimated_cost)} />
              <DetailRow label="Started" value={selectedMetric.started_at || '—'} />
              <DetailRow label="Completed" value={selectedMetric.completed_at || '—'} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ModelBreakdownTab({
  breakdown,
  formatTokenCount,
  formatDuration,
  formatCost,
  modelColor,
  modelBgColor,
}: {
  breakdown: ModelBreakdown[];
  formatTokenCount: (n: number | null | undefined) => string;
  formatDuration: (ms: number | null | undefined) => string;
  formatCost: (cost: number | null | undefined) => string;
  modelColor: (model: string | null | undefined) => string;
  modelBgColor: (model: string | null | undefined) => string;
}) {
  if (breakdown.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
        <FiCpu size={40} className="mb-3 opacity-50" />
        <p className="text-lg font-medium">No model usage data yet</p>
        <p className="text-sm mt-1">
          Model breakdown will appear after sessions with different models complete
        </p>
      </div>
    );
  }

  // Find max for bar charts
  const maxTokens = Math.max(
    ...breakdown.map(
      (b) =>
        (b.total_input_tokens || 0) +
        (b.total_output_tokens || 0) +
        (b.total_cache_read_tokens || 0) +
        (b.total_cache_creation_tokens || 0),
    ),
  );

  return (
    <div className="space-y-4">
      {breakdown.map((b) => {
        const totalTokens =
          (b.total_input_tokens || 0) +
          (b.total_output_tokens || 0) +
          (b.total_cache_read_tokens || 0) +
          (b.total_cache_creation_tokens || 0);
        const pct = maxTokens > 0 ? (totalTokens / maxTokens) * 100 : 0;
        const inputPct = totalTokens > 0 ? ((b.total_input_tokens || 0) / totalTokens) * 100 : 0;
        const outputPct = totalTokens > 0 ? ((b.total_output_tokens || 0) / totalTokens) * 100 : 0;
        const cacheReadPct =
          totalTokens > 0 ? ((b.total_cache_read_tokens || 0) / totalTokens) * 100 : 0;
        const cacheCreatePct =
          totalTokens > 0 ? ((b.total_cache_creation_tokens || 0) / totalTokens) * 100 : 0;

        return (
          <div key={b.model_used} className={`rounded-lg border p-5 ${modelBgColor(b.model_used)}`}>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <FiCpu className={`${modelColor(b.model_used)}`} size={20} />
                <span className={`text-lg font-bold ${modelColor(b.model_used)}`}>
                  {b.model_used}
                </span>
                <span className="text-xs text-slate-500 bg-slate-800/50 px-2 py-0.5 rounded">
                  {b.session_count} session{b.session_count !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-slate-400">{formatDuration(b.total_duration_ms)}</span>
                <span className="text-slate-300 font-medium">{formatCost(b.total_cost)}</span>
              </div>
            </div>

            {/* Token usage bar */}
            <div className="mb-3">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span>Total: {formatTokenCount(totalTokens)} tokens</span>
                <span>{pct.toFixed(0)}% of max</span>
              </div>
              <div className="h-4 bg-slate-900/50 rounded-full overflow-hidden flex">
                <div
                  className="bg-blue-500/70 h-full transition-all"
                  style={{ width: `${inputPct}%` }}
                  title={`Input: ${formatTokenCount(b.total_input_tokens)}`}
                />
                <div
                  className="bg-emerald-500/70 h-full transition-all"
                  style={{ width: `${outputPct}%` }}
                  title={`Output: ${formatTokenCount(b.total_output_tokens)}`}
                />
                <div
                  className="bg-amber-500/70 h-full transition-all"
                  style={{ width: `${cacheReadPct}%` }}
                  title={`Cache Read: ${formatTokenCount(b.total_cache_read_tokens)}`}
                />
                <div
                  className="bg-purple-500/70 h-full transition-all"
                  style={{ width: `${cacheCreatePct}%` }}
                  title={`Cache Create: ${formatTokenCount(b.total_cache_creation_tokens)}`}
                />
              </div>
            </div>

            {/* Token breakdown grid */}
            <div className="grid grid-cols-4 gap-3 text-sm">
              <div>
                <div className="text-xs text-slate-500 mb-0.5">Input</div>
                <div className="text-blue-400 font-medium">
                  {formatTokenCount(b.total_input_tokens)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-0.5">Output</div>
                <div className="text-emerald-400 font-medium">
                  {formatTokenCount(b.total_output_tokens)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-0.5">Cache Read</div>
                <div className="text-amber-400 font-medium">
                  {formatTokenCount(b.total_cache_read_tokens)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-0.5">Cache Create</div>
                <div className="text-purple-400 font-medium">
                  {formatTokenCount(b.total_cache_creation_tokens)}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-slate-500 pt-2">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-blue-500/70" /> Input
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-emerald-500/70" /> Output
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-amber-500/70" /> Cache Read
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-purple-500/70" /> Cache Create
        </span>
      </div>
    </div>
  );
}

const capabilityColor = (cap: string | null | undefined): string => {
  if (!cap) return 'text-slate-400';
  switch (cap) {
    case 'scout':
      return 'text-emerald-400';
    case 'builder':
      return 'text-blue-400';
    case 'reviewer':
      return 'text-amber-400';
    case 'lead':
      return 'text-purple-400';
    case 'merger':
      return 'text-cyan-400';
    case 'coordinator':
      return 'text-rose-400';
    case 'monitor':
      return 'text-teal-400';
    default:
      return 'text-slate-400';
  }
};

const capabilityBgColor = (cap: string | null | undefined): string => {
  if (!cap) return 'bg-slate-700';
  switch (cap) {
    case 'scout':
      return 'bg-emerald-900/40 border-emerald-700/50';
    case 'builder':
      return 'bg-blue-900/40 border-blue-700/50';
    case 'reviewer':
      return 'bg-amber-900/40 border-amber-700/50';
    case 'lead':
      return 'bg-purple-900/40 border-purple-700/50';
    case 'merger':
      return 'bg-cyan-900/40 border-cyan-700/50';
    case 'coordinator':
      return 'bg-rose-900/40 border-rose-700/50';
    case 'monitor':
      return 'bg-teal-900/40 border-teal-700/50';
    default:
      return 'bg-slate-700';
  }
};

function CapabilityBreakdownTab({
  breakdown,
  formatTokenCount,
  formatDuration,
  formatCost,
}: {
  breakdown: CapabilityBreakdown[];
  formatTokenCount: (n: number | null | undefined) => string;
  formatDuration: (ms: number | null | undefined) => string;
  formatCost: (cost: number | null | undefined) => string;
}) {
  if (breakdown.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
        <FiUsers size={40} className="mb-3 opacity-50" />
        <p className="text-lg font-medium">No capability usage data yet</p>
        <p className="text-sm mt-1">
          Capability breakdown will appear after sessions with assigned capabilities complete
        </p>
      </div>
    );
  }

  const maxTokens = Math.max(
    ...breakdown.map(
      (b) =>
        (b.total_input_tokens || 0) +
        (b.total_output_tokens || 0) +
        (b.total_cache_read_tokens || 0) +
        (b.total_cache_creation_tokens || 0),
    ),
  );

  return (
    <div className="space-y-4" data-testid="capability-breakdown">
      {breakdown.map((b) => {
        const totalTokens =
          (b.total_input_tokens || 0) +
          (b.total_output_tokens || 0) +
          (b.total_cache_read_tokens || 0) +
          (b.total_cache_creation_tokens || 0);
        const pct = maxTokens > 0 ? (totalTokens / maxTokens) * 100 : 0;
        const inputPct = totalTokens > 0 ? ((b.total_input_tokens || 0) / totalTokens) * 100 : 0;
        const outputPct = totalTokens > 0 ? ((b.total_output_tokens || 0) / totalTokens) * 100 : 0;
        const cacheReadPct =
          totalTokens > 0 ? ((b.total_cache_read_tokens || 0) / totalTokens) * 100 : 0;
        const cacheCreatePct =
          totalTokens > 0 ? ((b.total_cache_creation_tokens || 0) / totalTokens) * 100 : 0;

        return (
          <div
            key={b.capability}
            className={`rounded-lg border p-5 ${capabilityBgColor(b.capability)}`}
            data-testid={`capability-row-${b.capability}`}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <FiUsers className={capabilityColor(b.capability)} size={20} />
                <span className={`text-lg font-bold ${capabilityColor(b.capability)} capitalize`}>
                  {b.capability}
                </span>
                <span className="text-xs text-slate-500 bg-slate-800/50 px-2 py-0.5 rounded">
                  {b.session_count} session{b.session_count !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-slate-400">{formatDuration(b.total_duration_ms)}</span>
                <span className="text-slate-300 font-medium">{formatCost(b.total_cost)}</span>
              </div>
            </div>

            {/* Token usage bar */}
            <div className="mb-3">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span>Total: {formatTokenCount(totalTokens)} tokens</span>
                <span>{pct.toFixed(0)}% of max</span>
              </div>
              <div className="h-4 bg-slate-900/50 rounded-full overflow-hidden flex">
                <div
                  className="bg-blue-500/70 h-full transition-all"
                  style={{ width: `${inputPct}%` }}
                  title={`Input: ${formatTokenCount(b.total_input_tokens)}`}
                />
                <div
                  className="bg-emerald-500/70 h-full transition-all"
                  style={{ width: `${outputPct}%` }}
                  title={`Output: ${formatTokenCount(b.total_output_tokens)}`}
                />
                <div
                  className="bg-amber-500/70 h-full transition-all"
                  style={{ width: `${cacheReadPct}%` }}
                  title={`Cache Read: ${formatTokenCount(b.total_cache_read_tokens)}`}
                />
                <div
                  className="bg-purple-500/70 h-full transition-all"
                  style={{ width: `${cacheCreatePct}%` }}
                  title={`Cache Create: ${formatTokenCount(b.total_cache_creation_tokens)}`}
                />
              </div>
            </div>

            {/* Token breakdown grid */}
            <div className="grid grid-cols-4 gap-3 text-sm">
              <div>
                <div className="text-xs text-slate-500 mb-0.5">Input</div>
                <div className="text-blue-400 font-medium">
                  {formatTokenCount(b.total_input_tokens)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-0.5">Output</div>
                <div className="text-emerald-400 font-medium">
                  {formatTokenCount(b.total_output_tokens)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-0.5">Cache Read</div>
                <div className="text-amber-400 font-medium">
                  {formatTokenCount(b.total_cache_read_tokens)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-0.5">Cache Create</div>
                <div className="text-purple-400 font-medium">
                  {formatTokenCount(b.total_cache_creation_tokens)}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-slate-500 pt-2">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-blue-500/70" /> Input
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-emerald-500/70" /> Output
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-amber-500/70" /> Cache Read
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-purple-500/70" /> Cache Create
        </span>
      </div>
    </div>
  );
}

function TokenBadge({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="bg-slate-900/50 rounded px-2 py-1">
      <div className="text-slate-500 text-[10px] uppercase">{label}</div>
      <div className={`${color} font-medium`}>{value}</div>
    </div>
  );
}

function TokenRow({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-400">{label}</span>
      <span className={`${color} font-mono font-medium`}>{value.toLocaleString()}</span>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-300 text-right max-w-[180px] truncate" title={value}>
        {value}
      </span>
    </div>
  );
}
