import { useCallback, useEffect, useState } from 'react';
import {
  FiActivity,
  FiCheckCircle,
  FiCpu,
  FiDatabase,
  FiFileText,
  FiGitBranch,
  FiHardDrive,
  FiRefreshCw,
  FiTerminal,
  FiTool,
  FiX,
  FiXCircle,
} from 'react-icons/fi';
import type { DoctorCheck, DoctorResult } from '../../../shared/types';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { handleIpcError } from '../../lib/ipcErrorHandler';
import './DoctorPage.css';

const checkIcons: Record<string, React.ReactNode> = {
  Database: <FiDatabase className="h-5 w-5" />,
  'Node.js': <FiCpu className="h-5 w-5" />,
  'Claude CLI': <FiTerminal className="h-5 w-5" />,
  Git: <FiGitBranch className="h-5 w-5" />,
  Config: <FiFileText className="h-5 w-5" />,
  'DB Integrity': <FiHardDrive className="h-5 w-5" />,
};

export function DoctorPage() {
  const [result, setResult] = useState<DoctorResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fixingCheck, setFixingCheck] = useState<string | null>(null);
  const [fixMessage, setFixMessage] = useState<{
    text: string;
    success: boolean;
  } | null>(null);

  const runChecks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setFixMessage(null);
    try {
      const res = await window.electronAPI.doctorRun();
      if (res.error) {
        setError(res.error);
      } else if (res.data) {
        setResult(res.data);
      }
    } catch (err) {
      const msg = handleIpcError(err, { context: 'running diagnostics', showToast: false });
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleFix = useCallback(
    async (checkName: string) => {
      setFixingCheck(checkName);
      setFixMessage(null);
      try {
        const res = await window.electronAPI.doctorFix(checkName);
        if (res.error) {
          setFixMessage({ text: res.error, success: false });
        } else if (res.data) {
          setFixMessage({ text: res.data.message, success: res.data.success });
          // Re-run checks after fix attempt
          await runChecks();
        }
      } catch (err) {
        setFixMessage({ text: String(err), success: false });
      } finally {
        setFixingCheck(null);
      }
    },
    [runChecks],
  );

  useEffect(() => {
    runChecks();
  }, [runChecks]);

  const passCount = result ? result.checks.filter((c) => c.status === 'pass').length : 0;
  const totalCount = result ? result.checks.length : 0;
  const fixableCount = result
    ? result.checks.filter((c) => c.status === 'fail' && c.fixable).length
    : 0;

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FiActivity className="h-7 w-7 text-cyan-400" />
          <h1 className="text-2xl font-bold text-slate-50">Doctor</h1>
        </div>
        <Button
          onClick={runChecks}
          disabled={isLoading}
          className="bg-blue-600/15 text-blue-400 border border-blue-500/25 hover:bg-blue-600/25 hover:text-blue-300"
        >
          <FiRefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          {isLoading ? 'Running...' : 'Run Health Check'}
        </Button>
      </div>

      {/* Summary */}
      {result && (
        <div
          className={`mb-6 flex items-center gap-3 rounded-lg border p-4 ${
            result.allPassing
              ? 'border-emerald-700 bg-emerald-900/20'
              : 'border-amber-700 bg-amber-900/20'
          }`}
        >
          {result.allPassing ? (
            <FiCheckCircle
              className="h-6 w-6 text-emerald-400"
              title="All system health checks are passing"
            />
          ) : (
            <FiXCircle
              className="h-6 w-6 text-amber-400"
              title={`${totalCount - passCount} health check(s) need attention`}
            />
          )}
          <div className="flex-1">
            <div
              className={`text-lg font-semibold ${result.allPassing ? 'text-emerald-300' : 'text-amber-300'}`}
            >
              {result.allPassing ? 'All checks passed' : 'Some checks failed'}
            </div>
            <div className="text-sm text-slate-400">
              {passCount}/{totalCount} dependencies verified
              {fixableCount > 0 && (
                <span className="ml-2 text-amber-400">
                  ({fixableCount} fixable issue{fixableCount > 1 ? 's' : ''})
                </span>
              )}
            </div>
          </div>
          {fixableCount > 0 && (
            <Button
              onClick={async () => {
                const fixableChecks = result.checks.filter((c) => c.status === 'fail' && c.fixable);
                for (const check of fixableChecks) {
                  await handleFix(check.name);
                }
              }}
              disabled={fixingCheck !== null}
              className="bg-emerald-600/15 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-600/25 hover:text-emerald-300"
            >
              <FiTool className="h-4 w-4" />
              Fix All
            </Button>
          )}
        </div>
      )}

      {/* Fix result message */}
      {fixMessage && (
        <div
          className={`mb-4 rounded-lg border p-3 text-sm ${
            fixMessage.success
              ? 'border-emerald-700 bg-emerald-900/20 text-emerald-300'
              : 'border-red-700 bg-red-900/20 text-red-300'
          }`}
        >
          {fixMessage.success ? (
            <FiCheckCircle className="mr-2 inline h-4 w-4" />
          ) : (
            <FiXCircle className="mr-2 inline h-4 w-4" />
          )}
          {fixMessage.text}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-6 rounded-lg border border-red-700 bg-red-900/20 p-4 text-sm text-red-300 flex items-center justify-between gap-3" data-testid="doctor-error">
          <span>{error}</span>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={runChecks}
              className="bg-red-500/20 text-xs text-red-300 hover:bg-red-500/30"
              data-testid="doctor-error-retry"
            >
              Retry
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-200 h-8 w-8"
              title="Dismiss error"
            >
              <FiX className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Check cards */}
      {isLoading && !result ? (
        <DoctorSkeleton />
      ) : result ? (
        <div className="space-y-3">
          {result.checks.map((check) => (
            <DoctorCheckCard
              key={check.name}
              check={check}
              isFixing={fixingCheck === check.name}
              onFix={() => handleFix(check.name)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DoctorCheckCard({
  check,
  isFixing,
  onFix,
}: {
  check: DoctorCheck;
  isFixing: boolean;
  onFix: () => void;
}) {
  const isPassing = check.status === 'pass';

  return (
    <div
      className={`flex items-center gap-4 rounded-lg border p-4 transition-colors ${
        isPassing ? 'border-slate-700 bg-slate-800' : 'border-red-800/50 bg-red-950/20'
      }`}
      data-testid={`doctor-check-${check.name.toLowerCase().replace(/\s+/g, '-')}`}
    >
      {/* Icon */}
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-lg ${
          isPassing ? 'bg-emerald-900/30 text-emerald-400' : 'bg-red-900/30 text-red-400'
        }`}
        title={`${check.name}: ${isPassing ? 'Healthy' : 'Failed'}${check.detail ? ` — ${check.detail}` : ''}`}
      >
        {checkIcons[check.name] || <FiActivity className="h-5 w-5" />}
      </div>

      {/* Info */}
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-200">{check.name}</span>
          {check.version && (
            <Badge variant="secondary" className="bg-slate-700 text-slate-300 border-transparent font-mono text-xs">
              {check.version}
            </Badge>
          )}
        </div>
        {check.detail && <div className="mt-0.5 text-xs text-slate-400">{check.detail}</div>}
        {!isPassing && check.fixable && check.fixAction && (
          <div className="mt-1 text-xs text-amber-400">Auto-fix: {check.fixAction}</div>
        )}
      </div>

      {/* Fix button (for failed + fixable) */}
      {!isPassing && check.fixable && (
        <Button
          size="sm"
          onClick={onFix}
          disabled={isFixing}
          className="bg-emerald-600/15 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-600/25 hover:text-emerald-300 text-xs"
        >
          {isFixing ? (
            <FiRefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FiTool className="h-3.5 w-3.5" />
          )}
          {isFixing ? 'Fixing...' : 'Auto-Fix'}
        </Button>
      )}

      {/* Status badge */}
      <Badge
        variant="outline"
        className={`gap-1.5 ${
          isPassing ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700/50' : 'bg-red-900/40 text-red-300 border-red-700/50'
        }`}
        title={
          isPassing
            ? `${check.name} check passed${check.version ? ` (v${check.version})` : ''}`
            : `${check.name} check failed${check.fixable ? ' — auto-fix available' : ''}${check.detail ? `: ${check.detail}` : ''}`
        }
      >
        {isPassing ? (
          <FiCheckCircle className="h-3.5 w-3.5" />
        ) : (
          <FiXCircle className="h-3.5 w-3.5" />
        )}
        {isPassing ? 'Pass' : 'Fail'}
      </Badge>
    </div>
  );
}

function DoctorSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-lg border border-slate-700 bg-slate-800 p-4 animate-pulse"
        >
          <div className="h-10 w-10 rounded-lg bg-slate-700" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-24 rounded bg-slate-700" />
            <div className="h-3 w-40 rounded bg-slate-700" />
          </div>
          <div className="h-6 w-16 rounded-full bg-slate-700" />
        </div>
      ))}
    </div>
  );
}
