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
  FiXCircle,
} from 'react-icons/fi';
import type { DoctorCheck, DoctorResult } from '../../shared/types';

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
      setError(String(err));
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
        <button
          type="button"
          onClick={runChecks}
          disabled={isLoading}
          className="flex items-center gap-2 rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50 transition-colors"
        >
          <FiRefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          {isLoading ? 'Running...' : 'Run Health Check'}
        </button>
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
            <FiCheckCircle className="h-6 w-6 text-emerald-400" />
          ) : (
            <FiXCircle className="h-6 w-6 text-amber-400" />
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
            <button
              type="button"
              onClick={async () => {
                const fixableChecks = result.checks.filter((c) => c.status === 'fail' && c.fixable);
                for (const check of fixableChecks) {
                  await handleFix(check.name);
                }
              }}
              disabled={fixingCheck !== null}
              className="flex items-center gap-2 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50 transition-colors"
            >
              <FiTool className="h-4 w-4" />
              Fix All
            </button>
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
        <div className="mb-6 rounded-lg border border-red-700 bg-red-900/20 p-4 text-sm text-red-300">
          {error}
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
      >
        {checkIcons[check.name] || <FiActivity className="h-5 w-5" />}
      </div>

      {/* Info */}
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-200">{check.name}</span>
          {check.version && (
            <span className="rounded bg-slate-700 px-2 py-0.5 font-mono text-xs text-slate-300">
              {check.version}
            </span>
          )}
        </div>
        {check.detail && <div className="mt-0.5 text-xs text-slate-400">{check.detail}</div>}
        {!isPassing && check.fixable && check.fixAction && (
          <div className="mt-1 text-xs text-amber-400">Auto-fix: {check.fixAction}</div>
        )}
      </div>

      {/* Fix button (for failed + fixable) */}
      {!isPassing && check.fixable && (
        <button
          type="button"
          onClick={onFix}
          disabled={isFixing}
          className="flex items-center gap-1.5 rounded-md bg-amber-600/80 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-50 transition-colors"
        >
          {isFixing ? (
            <FiRefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FiTool className="h-3.5 w-3.5" />
          )}
          {isFixing ? 'Fixing...' : 'Auto-Fix'}
        </button>
      )}

      {/* Status badge */}
      <div
        className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
          isPassing ? 'bg-emerald-900/40 text-emerald-300' : 'bg-red-900/40 text-red-300'
        }`}
      >
        {isPassing ? (
          <FiCheckCircle className="h-3.5 w-3.5" />
        ) : (
          <FiXCircle className="h-3.5 w-3.5" />
        )}
        {isPassing ? 'Pass' : 'Fail'}
      </div>
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
