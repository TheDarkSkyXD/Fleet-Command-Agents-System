import './AuthDecisionTree.css';
import { useCallback, useEffect, useState } from 'react';
import {
  FiAlertTriangle,
  FiCheck,
  FiCheckCircle,
  FiChevronRight,
  FiCpu,
  FiExternalLink,
  FiKey,
  FiRefreshCw,
  FiX,
  FiXCircle,
} from 'react-icons/fi';
import { Button } from '../../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';

type AuthState = 'checking' | 'not-installed' | 'installed-broken' | 'not-authenticated' | 'ready';

interface CliDetectionData {
  found: boolean;
  path: string | null;
  version: string | null;
  authenticated: boolean;
}

function deriveAuthState(data: CliDetectionData | null, loading: boolean): AuthState {
  if (loading || !data) return 'checking';
  if (!data.found) return 'not-installed';
  if (!data.version) return 'installed-broken';
  if (!data.authenticated) return 'not-authenticated';
  return 'ready';
}

const STATE_META: Record<
  AuthState,
  {
    label: string;
    description: string;
    color: string;
    bgColor: string;
    borderColor: string;
    icon: React.ElementType;
  }
> = {
  checking: {
    label: 'Checking...',
    description: 'Detecting CLI installation status',
    color: 'text-slate-400',
    bgColor: 'bg-slate-800',
    borderColor: 'border-slate-700',
    icon: FiRefreshCw,
  },
  'not-installed': {
    label: 'Not Installed',
    description: 'Claude Code CLI was not found on this system',
    color: 'text-red-400',
    bgColor: 'bg-red-900/20',
    borderColor: 'border-red-800',
    icon: FiXCircle,
  },
  'installed-broken': {
    label: 'Installed (Broken)',
    description: 'CLI binary found but version check failed',
    color: 'text-amber-400',
    bgColor: 'bg-amber-900/20',
    borderColor: 'border-amber-800',
    icon: FiAlertTriangle,
  },
  'not-authenticated': {
    label: 'Not Authenticated',
    description: 'CLI installed but no active OAuth session',
    color: 'text-amber-400',
    bgColor: 'bg-amber-900/20',
    borderColor: 'border-amber-800',
    icon: FiKey,
  },
  ready: {
    label: 'Ready',
    description: 'CLI installed, verified, and authenticated',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-900/20',
    borderColor: 'border-emerald-800',
    icon: FiCheckCircle,
  },
};

const TREE_STEPS = [
  { key: 'installed', label: 'CLI Installed', failState: 'not-installed' as const },
  { key: 'version', label: 'Version OK', failState: 'installed-broken' as const },
  { key: 'authenticated', label: 'Authenticated', failState: 'not-authenticated' as const },
  { key: 'ready', label: 'Ready', failState: null },
];

export function AuthDecisionTree() {
  const [cliData, setCliData] = useState<CliDetectionData | null>(null);
  const [loading, setLoading] = useState(true);

  const detect = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.electronAPI.claudeDetect({ forceRefresh: true });
      if (result.data) {
        setCliData(result.data);
      }
    } catch {
      setCliData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    detect();
  }, [detect]);

  const authState = deriveAuthState(cliData, loading);
  const meta = STATE_META[authState];
  const StateIcon = meta.icon;

  // Determine how far along the tree we are
  const passedSteps = (() => {
    if (authState === 'checking') return -1;
    if (authState === 'not-installed') return 0;
    if (authState === 'installed-broken') return 1;
    if (authState === 'not-authenticated') return 2;
    return 4; // ready - all passed
  })();

  return (
    <div data-testid="auth-decision-tree">
      {/* Current status banner */}
      <div
        className={`mb-6 flex items-center gap-3 rounded-lg border px-4 py-3 ${meta.bgColor} ${meta.borderColor}`}
      >
        <StateIcon
          className={`h-5 w-5 ${meta.color} ${authState === 'checking' ? 'animate-spin' : ''}`}
        />
        <div className="flex-1">
          <span className={`font-medium ${meta.color}`}>{meta.label}</span>
          <p className="text-xs text-slate-400">{meta.description}</p>
        </div>
        <Button
          type="button"
          onClick={detect}
          disabled={loading}
          variant="secondary"
          size="sm"
          className="gap-1 text-xs"
          data-testid="auth-refresh-btn"
        >
          <FiRefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Decision tree visualization */}
      <div className="space-y-1">
        {TREE_STEPS.map((step, i) => {
          const isPassed = i < passedSteps;
          const isFailed = !isPassed && passedSteps === i;
          const isPending = i > passedSteps;

          return (
            <div key={step.key}>
              {i > 0 && (
                <div className="ml-4 flex h-5 items-center">
                  <div
                    className={`h-full w-0.5 ${isPassed ? 'bg-emerald-600' : isFailed ? 'bg-red-600' : 'bg-slate-700'}`}
                  />
                </div>
              )}
              <div
                className={`flex items-center gap-3 rounded-lg px-3 py-2 ${
                  isFailed ? 'bg-slate-800 border border-slate-700' : ''
                }`}
                data-testid={`auth-step-${step.key}`}
              >
                {/* Step indicator */}
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full border-2 ${
                    isPassed
                      ? 'border-emerald-500 bg-emerald-500/20'
                      : isFailed
                        ? 'border-red-500 bg-red-500/20'
                        : 'border-slate-600 bg-slate-800'
                  }`}
                >
                  {isPassed && <FiCheck className="h-3.5 w-3.5 text-emerald-400" />}
                  {isFailed && <FiX className="h-3.5 w-3.5 text-red-400" />}
                  {isPending && <span className="text-xs text-slate-400">{i + 1}</span>}
                </div>

                {/* Step label */}
                <span
                  className={`text-sm font-medium ${
                    isPassed ? 'text-emerald-400' : isFailed ? 'text-red-400' : 'text-slate-400'
                  }`}
                >
                  {step.label}
                </span>

                {/* Chevron for passed */}
                {isPassed && <FiChevronRight className="h-3 w-3 text-emerald-600" />}
              </div>

              {/* Action area for failed step */}
              {isFailed && (
                <div className="ml-10 mt-2 mb-1">
                  <ActionPanel state={authState} cliData={cliData} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* CLI details when ready */}
      {authState === 'ready' && cliData && (
        <Card className="mt-4 border-slate-700 bg-slate-800">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-medium text-slate-300">CLI Details</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="space-y-1 text-xs text-slate-400">
              <div className="flex gap-2">
                <FiCpu className="mt-0.5 h-3 w-3 text-slate-400" />
                <span>
                  Path: <span className="font-mono text-slate-300">{cliData.path}</span>
                </span>
              </div>
              <div className="flex gap-2">
                <FiCheck className="mt-0.5 h-3 w-3 text-slate-400" />
                <span>
                  Version: <span className="font-mono text-emerald-400">{cliData.version}</span>
                </span>
              </div>
              <div className="flex gap-2">
                <FiKey className="mt-0.5 h-3 w-3 text-slate-400" />
                <span>
                  Auth: <span className="text-emerald-400">Authenticated</span>
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** Action buttons per auth state */
function ActionPanel({
  state,
  cliData,
}: {
  state: AuthState;
  cliData: CliDetectionData | null;
}) {
  if (state === 'not-installed') {
    return (
      <div className="space-y-2">
        <p className="text-xs text-slate-400">
          Install the Claude Code CLI to get started with Fleet Command.
        </p>
        <div className="flex items-center gap-2">
          <Button
            asChild
            size="sm"
            className="gap-1 text-xs"
          >
            <a
              href="https://docs.anthropic.com/en/docs/claude-code"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="setup-guide-link"
            >
              <FiExternalLink className="h-3 w-3" />
              Setup Guide
            </a>
          </Button>
          <span className="text-xs text-slate-400">or run:</span>
          <code className="rounded bg-slate-900 px-2 py-1 font-mono text-xs text-slate-300">
            npm install -g @anthropic-ai/claude-code
          </code>
        </div>
      </div>
    );
  }

  if (state === 'installed-broken') {
    return (
      <div className="space-y-2">
        <p className="text-xs text-slate-400">
          CLI binary found{cliData?.path ? ` at ${cliData.path}` : ''} but version check failed. The
          installation may be corrupt.
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Try reinstalling:</span>
          <code className="rounded bg-slate-900 px-2 py-1 font-mono text-xs text-slate-300">
            npm install -g @anthropic-ai/claude-code
          </code>
        </div>
      </div>
    );
  }

  if (state === 'not-authenticated') {
    return (
      <div className="space-y-2">
        <p className="text-xs text-slate-400">
          CLI v{cliData?.version} is installed but needs authentication. Log in with your Anthropic
          account.
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Run in terminal:</span>
          <code className="rounded bg-slate-900 px-2 py-1 font-mono text-amber-300">
            claude auth login
          </code>
        </div>
      </div>
    );
  }

  return null;
}
