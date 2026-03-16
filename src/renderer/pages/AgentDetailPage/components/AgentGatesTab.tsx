import { useCallback, useEffect, useState } from 'react';
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiClock,
  FiLoader,
  FiShield,
} from 'react-icons/fi';
import type { QualityGateResult } from '../../../../shared/types';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { Separator } from '../../../components/ui/separator';
import { formatDateTime } from '../../../lib/dateFormatting';

export function AgentGatesTab({
  agentName,
}: {
  agentName: string;
}) {
  const [results, setResults] = useState<QualityGateResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadGateResults = useCallback(async () => {
    setLoading(true);
    try {
      const res = await window.electronAPI.qualityGateResults({
        agent_name: agentName,
        limit: 100,
      });
      if (res.data) {
        setResults(res.data);
      }
    } catch (err) {
      console.error('Failed to load gate results:', err);
    } finally {
      setLoading(false);
    }
  }, [agentName]);

  useEffect(() => {
    loadGateResults();
  }, [loadGateResults]);

  const gateStatusIcon = (status: string) => {
    switch (status) {
      case 'passed':
        return <FiCheckCircle className="h-5 w-5 text-emerald-400" />;
      case 'failed':
        return <FiAlertTriangle className="h-5 w-5 text-red-400" />;
      case 'error':
        return <FiAlertTriangle className="h-5 w-5 text-amber-400" />;
      case 'running':
        return <FiLoader className="h-5 w-5 text-blue-400 animate-spin" />;
      default:
        return <FiClock className="h-5 w-5 text-slate-400" />;
    }
  };

  const gateStatusColor = (status: string) => {
    switch (status) {
      case 'passed':
        return 'border-emerald-700/50 bg-emerald-900/20';
      case 'failed':
        return 'border-red-700/50 bg-red-900/20';
      case 'error':
        return 'border-amber-700/50 bg-amber-900/20';
      case 'running':
        return 'border-blue-700/50 bg-blue-900/20';
      default:
        return 'border-slate-700 bg-slate-800';
    }
  };

  const gateStatusBadge = (status: string) => {
    switch (status) {
      case 'passed':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'failed':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'error':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'running':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      default:
        return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <FiLoader className="animate-spin text-slate-400 mr-2" size={20} />
        <span className="text-slate-400">Loading gate results...</span>
      </div>
    );
  }

  const passedCount = results.filter((r) => r.status === 'passed').length;
  const failedCount = results.filter((r) => r.status === 'failed' || r.status === 'error').length;

  return (
    <div className="p-6 overflow-y-auto h-full" data-testid="gate-status-section">
      {/* Header summary */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-slate-50 flex items-center gap-2">
            <FiShield className="text-blue-400" />
            Quality Gates
          </h3>
          <p className="text-sm text-slate-400 mt-1">
            Gate results for agent <span className="text-slate-300 font-medium">{agentName}</span>
          </p>
        </div>
        {results.length > 0 && (
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-sm">
              <FiCheckCircle className="text-emerald-400" size={14} />
              <span className="text-emerald-400 font-medium">{passedCount} passed</span>
            </span>
            {failedCount > 0 && (
              <span className="flex items-center gap-1.5 text-sm">
                <FiAlertTriangle className="text-red-400" size={14} />
                <span className="text-red-400 font-medium">{failedCount} failed</span>
              </span>
            )}
          </div>
        )}
      </div>

      {results.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <FiShield size={40} className="mb-3 opacity-50" />
          <p className="text-lg font-medium">No gate results yet</p>
          <p className="text-sm mt-1">
            Quality gate results will appear here after gates run for this agent
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {results.map((result) => {
            const isExpanded = expandedId === result.id;
            return (
              <Card
                key={result.id}
                className={`p-0 transition-colors ${gateStatusColor(result.status)}`}
                data-testid={`gate-result-${result.id}`}
              >
                <CardContent className="p-4">
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full text-left h-auto p-0 hover:bg-transparent"
                    onClick={() => setExpandedId(isExpanded ? null : result.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {gateStatusIcon(result.status)}
                        <div>
                          <span className="font-medium text-slate-50">{result.gate_name}</span>
                          <Badge variant="secondary" className="ml-2 bg-slate-800/50 text-slate-400 border-transparent text-xs">
                            {result.gate_type}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {result.duration_ms != null && (
                          <span className="text-xs text-slate-400 tabular-nums">
                            {result.duration_ms < 1000
                              ? `${result.duration_ms}ms`
                              : `${(result.duration_ms / 1000).toFixed(1)}s`}
                          </span>
                        )}
                        <Badge
                          variant="outline"
                          className={`rounded-md ${gateStatusBadge(result.status)}`}
                          data-testid={`gate-status-${result.status}`}
                        >
                          {result.status}
                        </Badge>
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-slate-400 font-mono truncate">
                      {result.command}
                    </div>
                  </Button>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="mt-3 space-y-2">
                      <Separator className="bg-slate-700/50" />
                      <div className="text-xs text-slate-400 pt-2">
                        <span className="text-slate-400">Run at:</span>{' '}
                        {formatDateTime(result.created_at)}
                      </div>
                      {result.exit_code != null && (
                        <div className="text-xs text-slate-400">
                          <span className="text-slate-400">Exit code:</span> {result.exit_code}
                        </div>
                      )}
                      {result.stdout && (
                        <div>
                          <div className="text-xs text-slate-400 mb-1">stdout:</div>
                          <pre className="text-xs text-slate-300 bg-slate-900/50 rounded p-2 overflow-x-auto max-h-40 overflow-y-auto font-mono whitespace-pre-wrap">
                            {result.stdout}
                          </pre>
                        </div>
                      )}
                      {result.stderr && (
                        <div>
                          <div className="text-xs text-slate-400 mb-1">stderr:</div>
                          <pre className="text-xs text-red-300/80 bg-slate-900/50 rounded p-2 overflow-x-auto max-h-40 overflow-y-auto font-mono whitespace-pre-wrap">
                            {result.stderr}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
