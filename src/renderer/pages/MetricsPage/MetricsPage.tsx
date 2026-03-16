import { useCallback, useEffect, useState } from 'react';
import { AnimatedCard, AnimatedCardContainer } from '../../components/AnimatedCard';
import {
  FiActivity,
  FiBarChart2,
  FiCpu,
  FiDatabase,
  FiDownload,
  FiRefreshCw,
  FiUsers,
  FiZap,
} from 'react-icons/fi';
import type {
  CapabilityBreakdown,
  Metric,
  MetricsSummary,
  ModelBreakdown,
} from '../../../shared/types';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';
import './MetricsPage.css';
import {
  SummaryCard,
  TokenBar,
  SessionsTab,
  ModelBreakdownTab,
  CapabilityBreakdownTab,
} from './components';

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
        toast.error(`Export failed: ${result.error}`);
      } else {
        toast.success(`Metrics exported as ${format.toUpperCase()}`);
      }
    } catch (err) {
      console.error('Export failed:', err);
      toast.error('Export failed');
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
    if (m.includes('opus')) return 'text-orange-400';
    return 'text-slate-400';
  };

  const modelBgColor = (model: string | null | undefined): string => {
    if (!model) return 'bg-slate-700';
    const m = model.toLowerCase();
    if (m.includes('haiku')) return 'bg-emerald-900/40 border-emerald-700/50';
    if (m.includes('sonnet')) return 'bg-blue-900/40 border-blue-700/50';
    if (m.includes('opus')) return 'bg-orange-900/40 border-orange-700/50';
    return 'bg-slate-700';
  };

  const totalTokens = summary
    ? (summary.total_input_tokens || 0) +
      (summary.total_output_tokens || 0) +
      (summary.total_cache_read_tokens || 0) +
      (summary.total_cache_creation_tokens || 0)
    : 0;

  return (
    <div className="space-y-6" data-testid="metrics-dashboard">
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
            <Button
              variant="outline"
              size="sm"
              disabled={exporting || metrics.length === 0}
              className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
              data-testid="export-metrics-btn"
              onClick={() => {
                /* toggle dropdown via group-focus-within */
              }}
            >
              <FiDownload size={14} className={exporting ? 'animate-bounce' : ''} />
              Export
            </Button>
            <div className="absolute right-0 mt-1 w-40 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-10 hidden group-focus-within:block">
              <Button
                variant="ghost"
                className="w-full justify-start rounded-b-none text-slate-300 hover:bg-slate-700"
                onClick={() => handleExport('csv')}
                data-testid="export-csv-btn"
              >
                Export as CSV
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start rounded-t-none text-slate-300 hover:bg-slate-700"
                onClick={() => handleExport('json')}
                data-testid="export-json-btn"
              >
                Export as JSON
              </Button>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
          >
            <FiRefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <AnimatedCardContainer className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="metrics-summary">
        <AnimatedCard><SummaryCard
          icon={<FiDatabase className="text-blue-400" />}
          label="Total Sessions"
          value={String(summary?.total_sessions ?? 0)}
          testId="summary-total-sessions"
        /></AnimatedCard>
        <AnimatedCard><SummaryCard
          icon={<FiZap className="text-amber-400" />}
          label="Total Tokens"
          value={formatTokenCount(totalTokens)}
          testId="summary-total-tokens"
        /></AnimatedCard>
        <AnimatedCard><SummaryCard
          icon={<FiActivity className="text-emerald-400" />}
          label="Total Duration"
          value={formatDuration(summary?.total_duration_ms)}
          testId="summary-total-duration"
        /></AnimatedCard>
        <AnimatedCard><SummaryCard
          icon={<FiBarChart2 className="text-sky-400" />}
          label="Estimated Cost"
          value={formatCost(summary?.total_cost)}
          testId="summary-estimated-cost"
        /></AnimatedCard>
      </AnimatedCardContainer>

      {/* Token Usage Chart */}
      {summary && totalTokens > 0 && (
        <Card
          className="border-slate-700 bg-slate-800"
          data-testid="metrics-chart"
        >
          <CardContent className="p-5 pt-5">
            <h3 className="text-sm font-semibold text-slate-50 mb-4 flex items-center gap-2">
              <FiBarChart2 className="text-blue-400" />
              Token Usage Breakdown
            </h3>
            <div className="space-y-3">
              <TokenBar
                label="Input Tokens"
                value={summary.total_input_tokens || 0}
                max={totalTokens}
                color="bg-blue-500"
                textColor="text-blue-400"
                formatTokenCount={formatTokenCount}
              />
              <TokenBar
                label="Output Tokens"
                value={summary.total_output_tokens || 0}
                max={totalTokens}
                color="bg-emerald-500"
                textColor="text-emerald-400"
                formatTokenCount={formatTokenCount}
              />
              <TokenBar
                label="Cache Read Tokens"
                value={summary.total_cache_read_tokens || 0}
                max={totalTokens}
                color="bg-amber-500"
                textColor="text-amber-400"
                formatTokenCount={formatTokenCount}
              />
              <TokenBar
                label="Cache Creation Tokens"
                value={summary.total_cache_creation_tokens || 0}
                max={totalTokens}
                color="bg-sky-500"
                textColor="text-sky-400"
                formatTokenCount={formatTokenCount}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabId)}>
        <TabsList className="bg-transparent border-b border-slate-700 rounded-none w-full justify-start h-auto p-0">
          <TabsTrigger
            value="sessions"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-400 data-[state=active]:text-blue-400 data-[state=active]:bg-transparent data-[state=active]:shadow-none text-slate-400 hover:text-slate-200 px-4 py-2"
          >
            <FiActivity size={14} className="mr-2" />
            Per Session
          </TabsTrigger>
          <TabsTrigger
            value="models"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-400 data-[state=active]:text-blue-400 data-[state=active]:bg-transparent data-[state=active]:shadow-none text-slate-400 hover:text-slate-200 px-4 py-2"
          >
            <FiCpu size={14} className="mr-2" />
            Model Breakdown
          </TabsTrigger>
          <TabsTrigger
            value="capabilities"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-400 data-[state=active]:text-blue-400 data-[state=active]:bg-transparent data-[state=active]:shadow-none text-slate-400 hover:text-slate-200 px-4 py-2"
          >
            <FiUsers size={14} className="mr-2" />
            By Capability
          </TabsTrigger>
        </TabsList>

        {/* Tab Content */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <FiRefreshCw className="animate-spin text-slate-400 mr-2" size={20} />
            <span className="text-slate-400">Loading metrics...</span>
          </div>
        ) : (
          <>
            <TabsContent value="sessions">
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
            </TabsContent>
            <TabsContent value="models">
              <ModelBreakdownTab
                breakdown={modelBreakdown}
                formatTokenCount={formatTokenCount}
                formatDuration={formatDuration}
                formatCost={formatCost}
                modelColor={modelColor}
                modelBgColor={modelBgColor}
              />
            </TabsContent>
            <TabsContent value="capabilities">
              <CapabilityBreakdownTab
                breakdown={capabilityBreakdown}
                formatTokenCount={formatTokenCount}
                formatDuration={formatDuration}
                formatCost={formatCost}
              />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
