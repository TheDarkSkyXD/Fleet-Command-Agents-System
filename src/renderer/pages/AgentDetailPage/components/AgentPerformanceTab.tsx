import { useEffect, useState } from 'react';
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiCopy,
  FiLoader,
} from 'react-icons/fi';
import { toast } from 'sonner';
import type { AgentPerformanceHistory } from '../../../../shared/types';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Tooltip } from '../../../components/Tooltip';
import { Card, CardContent } from '../../../components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../../components/ui/table';
import { formatDateTime } from '../../../lib/dateFormatting';
import { handleIpcError } from '../../../lib/ipcErrorHandler';
import { CAPABILITY_COLORS, STATE_COLORS, STATE_DOT_COLORS } from './constants';

function formatDurationMs(ms: number): string {
  if (ms <= 0) return '\u2014';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function formatSessionDuration(createdAt: string, completedAt: string | null): string {
  if (!completedAt) return 'In progress';
  const dur = new Date(completedAt).getTime() - new Date(createdAt).getTime();
  return formatDurationMs(dur);
}

export function AgentPerformanceTab({ agentName }: { agentName: string }) {
  const [perfData, setPerfData] = useState<AgentPerformanceHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const result = await window.electronAPI.agentPerformanceHistory(agentName);
        if (!mounted) return;
        if (result.error) {
          setError(result.error);
        } else {
          setPerfData(result.data);
        }
      } catch (err) {
        if (mounted) {
          const msg = handleIpcError(err, {
            context: 'loading performance data',
            showToast: false,
          });
          setError(msg);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [agentName]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        <FiLoader className="h-5 w-5 animate-spin mr-2" />
        Loading performance data...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-400 gap-2">
        <FiAlertTriangle className="h-5 w-5" />
        <span>{error}</span>
        <Tooltip content="Copy error">
          <Button
            variant="ghost"
            size="icon"
            data-testid="copy-error-performance"
            onClick={() => {
              navigator.clipboard.writeText(error);
              toast.success('Error message copied to clipboard');
            }}
            className="text-red-400/50 hover:text-red-300 hover:bg-red-500/20 h-8 w-8"
            aria-label="Copy error message"
          >
            <FiCopy size={14} />
          </Button>
        </Tooltip>
      </div>
    );
  }

  if (!perfData || perfData.totalSessions === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        No session history for this agent yet.
      </div>
    );
  }

  const { totalSessions, completedCount, failedCount, successRate, avgDurationMs, sessions } =
    perfData;
  const inProgressCount = sessions.filter(
    (s) => s.state === 'booting' || s.state === 'working',
  ).length;

  return (
    <div className="h-full overflow-y-auto p-4 space-y-6" data-testid="agent-performance-tab">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="performance-stats">
        <Card className="border-slate-700 bg-slate-800/50 p-0">
          <CardContent className="p-4">
            <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Total Sessions</div>
            <div className="text-2xl font-bold text-slate-200 tabular-nums">{totalSessions}</div>
          </CardContent>
        </Card>
        <Card className="border-slate-700 bg-slate-800/50 p-0">
          <CardContent className="p-4">
            <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Success Rate</div>
            <div className="text-2xl font-bold tabular-nums" data-testid="success-rate">
              <span
                className={
                  successRate >= 80
                    ? 'text-emerald-400'
                    : successRate >= 50
                      ? 'text-amber-400'
                      : 'text-red-400'
                }
              >
                {successRate}%
              </span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-slate-700 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  successRate >= 80
                    ? 'bg-emerald-500'
                    : successRate >= 50
                      ? 'bg-amber-500'
                      : 'bg-red-500'
                }`}
                style={{ width: `${successRate}%` }}
              />
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-700 bg-slate-800/50 p-0">
          <CardContent className="p-4">
            <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Avg Duration</div>
            <div
              className="text-2xl font-bold text-slate-200 tabular-nums"
              data-testid="avg-duration"
            >
              {formatDurationMs(avgDurationMs)}
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-700 bg-slate-800/50 p-0">
          <CardContent className="p-4">
            <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Breakdown</div>
            <div className="flex items-center gap-3 text-sm mt-1">
              <span className="flex items-center gap-1 text-emerald-400">
                <FiCheckCircle className="h-3.5 w-3.5" />
                {completedCount}
              </span>
              <span className="flex items-center gap-1 text-red-400">
                <FiAlertTriangle className="h-3.5 w-3.5" />
                {failedCount}
              </span>
              {inProgressCount > 0 && (
                <span className="flex items-center gap-1 text-blue-400">
                  <FiLoader className="h-3.5 w-3.5" />
                  {inProgressCount}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Session History Table */}
      <div>
        <h3 className="text-sm font-medium text-slate-300 mb-3">Task Completion History</h3>
        <Card
          className="border-slate-700 overflow-hidden p-0"
          data-testid="task-completion-history"
        >
          <Table className="w-full text-xs">
            <TableHeader>
              <TableRow className="bg-slate-800/80 text-slate-400 uppercase tracking-wider hover:bg-transparent">
                <TableHead className="h-auto text-left px-4 py-2.5 font-medium">Session</TableHead>
                <TableHead className="h-auto text-left px-4 py-2.5 font-medium">Capability</TableHead>
                <TableHead className="h-auto text-left px-4 py-2.5 font-medium">Model</TableHead>
                <TableHead className="h-auto text-left px-4 py-2.5 font-medium">Task</TableHead>
                <TableHead className="h-auto text-left px-4 py-2.5 font-medium">State</TableHead>
                <TableHead className="h-auto text-left px-4 py-2.5 font-medium">Duration</TableHead>
                <TableHead className="h-auto text-left px-4 py-2.5 font-medium">Started</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-slate-700/50">
              {sessions.map((s) => (
                <TableRow key={s.id} className="hover:bg-slate-800/40 transition-colors">
                  <TableCell className="px-4 py-2 text-slate-300 font-mono" title={s.id}>
                    {s.id.substring(0, 12)}...
                  </TableCell>
                  <TableCell className="px-4 py-2">
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        CAPABILITY_COLORS[s.capability] ||
                        'bg-slate-500/20 text-slate-400 border-slate-500/30'
                      }`}
                    >
                      {s.capability}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-4 py-2 text-slate-400">{s.model || '\u2014'}</TableCell>
                  <TableCell className="px-4 py-2 text-slate-400 font-mono">{s.task_id || '\u2014'}</TableCell>
                  <TableCell className="px-4 py-2">
                    <Badge
                      variant="outline"
                      className={`gap-1.5 ${STATE_COLORS[s.state] || 'bg-slate-500/20 text-slate-400'} border-transparent`}
                    >
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          STATE_DOT_COLORS[s.state] || 'bg-slate-400'
                        }`}
                      />
                      {s.state}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-4 py-2 text-slate-400 tabular-nums">
                    {formatSessionDuration(s.created_at, s.completed_at)}
                  </TableCell>
                  <TableCell className="px-4 py-2 text-slate-400">
                    {formatDateTime(s.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
