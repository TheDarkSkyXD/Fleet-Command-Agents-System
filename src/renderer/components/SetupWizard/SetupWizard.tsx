import './SetupWizard.css';
import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiCheck,
  FiCpu,
  FiExternalLink,
  FiKey,
  FiLoader,
  FiSettings,
  FiX,
  FiAnchor,
  FiZap,
  FiArrowRight,
} from 'react-icons/fi';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

type WizardStep = 'cli-detect' | 'version' | 'auth' | 'complete';

interface StepStatus {
  status: 'pending' | 'loading' | 'success' | 'error';
  message?: string;
  detail?: string;
}

interface CliDetectionResult {
  found: boolean;
  path: string | null;
  version: string | null;
  authenticated: boolean;
}

interface SetupWizardProps {
  onComplete: () => void;
}

const STEPS: { key: WizardStep; label: string; description: string; icon: React.ElementType }[] = [
  { key: 'cli-detect', label: 'CLI Detection', description: 'Locate Claude CLI binary', icon: FiCpu },
  { key: 'version', label: 'Version Check', description: 'Verify compatibility', icon: FiSettings },
  { key: 'auth', label: 'Authentication', description: 'Validate OAuth session', icon: FiKey },
];

/* ─── Ambient background ─── */
function WizardBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_50%,_rgba(59,130,246,0.08)_0%,_transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_20%,_rgba(34,211,238,0.05)_0%,_transparent_50%)]" />
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(148,163,184,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.4) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />
    </div>
  );
}

/* ─── Vertical step indicator ─── */
function StepIndicator({
  step,
  index,
  currentIndex,
  status,
}: {
  step: (typeof STEPS)[0];
  index: number;
  currentIndex: number;
  status: StepStatus;
}) {
  const isActive = index === currentIndex;
  const isPast = index < currentIndex;
  const isLast = index === STEPS.length - 1;
  const Icon = step.icon;

  const getOrbClasses = () => {
    if (isPast && status.status === 'success')
      return 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400 shadow-[0_0_16px_rgba(16,185,129,0.12)]';
    if (isPast && status.status === 'error')
      return 'bg-amber-500/15 border-amber-500/40 text-amber-400';
    if (isActive)
      return 'bg-blue-500/15 border-blue-500/40 text-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.15)]';
    return 'bg-slate-800/50 border-slate-700/40 text-slate-500';
  };

  return (
    <div className="flex items-start gap-3">
      {/* Orb + connector */}
      <div className="flex flex-col items-center">
        <motion.div
          className={`relative flex h-8 w-8 items-center justify-center rounded-lg border transition-all duration-500 ${getOrbClasses()}`}
          animate={isActive ? { scale: [1, 1.06, 1] } : {}}
          transition={isActive ? { duration: 2.5, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' } : {}}
        >
          {isPast && status.status === 'success' ? (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400 }}>
              <FiCheck size={13} />
            </motion.div>
          ) : isPast && status.status === 'error' ? (
            <FiX size={13} />
          ) : (
            <Icon size={13} />
          )}
        </motion.div>
        {!isLast && (
          <div className="relative my-1 h-6 w-px">
            <div className="absolute inset-0 bg-slate-700/25" />
            {(isPast || isActive) && (
              <motion.div
                className="absolute inset-x-0 top-0 bg-gradient-to-b from-blue-500/50 to-blue-500/10"
                initial={{ height: 0 }}
                animate={{ height: isPast ? '100%' : '50%' }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            )}
          </div>
        )}
      </div>

      {/* Label */}
      <div className="pt-1 min-w-0">
        <span
          className={`text-[13px] font-medium transition-colors duration-300 block leading-tight ${
            isActive ? 'text-slate-100' : isPast ? 'text-slate-300' : 'text-slate-500'
          }`}
        >
          {step.label}
        </span>
        <p
          className={`text-[11px] mt-0.5 transition-colors duration-300 ${
            isActive ? 'text-slate-500' : 'text-slate-600'
          }`}
        >
          {step.description}
        </p>
      </div>
    </div>
  );
}

/* ─── Step content transition ─── */
const stepContentVariants = {
  enter: { opacity: 0, x: 16, filter: 'blur(3px)' },
  center: { opacity: 1, x: 0, filter: 'blur(0px)' },
  exit: { opacity: 0, x: -16, filter: 'blur(3px)' },
};

/* ─── Status display ─── */
function StatusDisplay({ status }: { status: StepStatus }) {
  if (status.status === 'pending') return null;

  const variants = {
    loading: {
      container: 'bg-blue-500/[0.07] border-blue-500/20 text-blue-300',
      icon: <FiLoader className="mt-0.5 h-4 w-4 animate-spin shrink-0" />,
    },
    success: {
      container: 'bg-emerald-500/[0.07] border-emerald-500/20 text-emerald-300',
      icon: <FiCheck className="mt-0.5 h-4 w-4 shrink-0" />,
    },
    error: {
      container: 'bg-red-500/[0.07] border-red-500/20 text-red-300',
      icon: <FiX className="mt-0.5 h-4 w-4 shrink-0" />,
    },
  };

  const v = variants[status.status];

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`flex items-start gap-3 rounded-xl border px-4 py-3.5 text-sm ${v.container}`}
    >
      {v.icon}
      <div className="min-w-0">
        <span className="font-medium">{status.message}</span>
        {status.detail && <p className="mt-0.5 text-xs opacity-70 truncate">{status.detail}</p>}
      </div>
    </motion.div>
  );
}

/* ─── Main wizard ─── */
export function SetupWizard({ onComplete }: SetupWizardProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>('cli-detect');
  const [stepStatuses, setStepStatuses] = useState<Record<WizardStep, StepStatus>>({
    'cli-detect': { status: 'pending' },
    version: { status: 'pending' },
    auth: { status: 'pending' },
    complete: { status: 'pending' },
  });
  const [cliResult, setCliResult] = useState<CliDetectionResult | null>(null);
  const [showComplete, setShowComplete] = useState(false);

  const updateStatus = useCallback((step: WizardStep, status: StepStatus) => {
    setStepStatuses((prev) => ({ ...prev, [step]: status }));
  }, []);

  const runCliDetection = useCallback(async () => {
    updateStatus('cli-detect', { status: 'loading', message: 'Scanning system for Claude CLI...' });
    try {
      const result = await window.electronAPI.claudeDetect({ forceRefresh: true });
      if (result.error) {
        updateStatus('cli-detect', { status: 'error', message: 'Detection failed', detail: result.error });
        return;
      }
      const data = result.data;
      setCliResult(data);
      if (data.found) {
        updateStatus('cli-detect', { status: 'success', message: 'Claude CLI located', detail: data.path || undefined });
      } else {
        updateStatus('cli-detect', { status: 'error', message: 'Claude CLI not found', detail: 'Install Claude Code CLI and try again' });
      }
    } catch (err) {
      updateStatus('cli-detect', { status: 'error', message: 'Detection error', detail: String(err) });
    }
  }, [updateStatus]);

  useEffect(() => {
    if (currentStep === 'cli-detect') runCliDetection();
  }, [currentStep, runCliDetection]);

  const runVersionCheck = useCallback(() => {
    if (!cliResult) return;
    updateStatus('version', { status: 'loading', message: 'Verifying version...' });
    setTimeout(() => {
      if (cliResult.version) {
        updateStatus('version', { status: 'success', message: `Version ${cliResult.version}`, detail: 'Compatible version confirmed' });
      } else {
        updateStatus('version', { status: 'error', message: 'Version unknown', detail: 'Could not determine CLI version' });
      }
    }, 400);
  }, [cliResult, updateStatus]);

  const runAuthCheck = useCallback(() => {
    if (!cliResult) return;
    updateStatus('auth', { status: 'loading', message: 'Validating session...' });
    setTimeout(() => {
      if (cliResult.authenticated) {
        updateStatus('auth', { status: 'success', message: 'Session active', detail: 'OAuth authentication verified' });
      } else {
        updateStatus('auth', { status: 'error', message: 'Not authenticated', detail: 'Run "claude auth login" in your terminal' });
      }
    }, 400);
  }, [cliResult, updateStatus]);

  const goToNext = useCallback(() => {
    const stepOrder: WizardStep[] = ['cli-detect', 'version', 'auth', 'complete'];
    const currentIndex = stepOrder.indexOf(currentStep);
    if (currentIndex < stepOrder.length - 1) {
      const next = stepOrder[currentIndex + 1];
      setCurrentStep(next);
      if (next === 'version') setTimeout(runVersionCheck, 300);
      else if (next === 'auth') setTimeout(runAuthCheck, 300);
      else if (next === 'complete') setShowComplete(true);
    }
  }, [currentStep, runVersionCheck, runAuthCheck]);

  const canProceed = useCallback(
    (step: WizardStep): boolean => {
      const status = stepStatuses[step];
      return status.status === 'success' || status.status === 'error';
    },
    [stepStatuses],
  );

  const currentStepIndex = STEPS.findIndex((s) => s.key === currentStep);

  /* ─── Completion screen ─── */
  if (showComplete) {
    return (
      <div data-testid="setup-wizard" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 backdrop-blur-md">
        <WizardBackground />

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          className="relative z-10 flex flex-col items-center text-center px-12"
        >
          {/* Success orb */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.15 }}
            className="relative mb-10"
          >
            <div className="absolute inset-0 rounded-full bg-emerald-500/20 blur-2xl scale-[2.5]" />
            <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/25 shadow-[0_0_48px_rgba(16,185,129,0.12)]">
              <motion.div
                initial={{ scale: 0, rotate: -45 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 400, delay: 0.35 }}
              >
                <FiCheck className="h-10 w-10 text-emerald-400" strokeWidth={2.5} />
              </motion.div>
            </div>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-3xl font-bold text-slate-50 tracking-[-0.02em] mb-3"
            data-testid="setup-complete-title"
          >
            All Systems Online
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-slate-400 mb-12 max-w-md leading-relaxed"
          >
            Fleet Command is fully configured. You're ready to orchestrate
            AI coding agents across your projects.
          </motion.p>

          <motion.button
            type="button"
            onClick={onComplete}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="group inline-flex items-center gap-3 rounded-xl bg-slate-800/90 border border-blue-500/30 text-blue-300 hover:bg-slate-700/90 hover:border-blue-400/40 shadow-sm px-8 py-4 text-[15px] font-semibold transition-all cursor-pointer"
            data-testid="setup-complete-btn"
          >
            <FiZap size={18} className="transition-transform group-hover:rotate-12" />
            Launch Fleet Command
            <FiArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
          </motion.button>

          {/* Step summary chips */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.65 }}
            className="mt-12 flex items-center gap-3"
          >
            {STEPS.map((step) => {
              const s = stepStatuses[step.key];
              const isOk = s.status === 'success';
              return (
                <Badge
                  key={step.key}
                  variant="outline"
                  className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium ${
                    isOk
                      ? 'border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400'
                      : 'border-amber-500/20 bg-amber-500/[0.06] text-amber-400'
                  }`}
                >
                  {isOk ? <FiCheck size={11} /> : <FiX size={11} />}
                  {step.label}
                </Badge>
              );
            })}
          </motion.div>
        </motion.div>
      </div>
    );
  }

  /* ─── Main wizard layout ─── */
  return (
    <div data-testid="setup-wizard" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 backdrop-blur-md px-12 py-10">
      <WizardBackground />

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        className="relative z-10 flex w-full max-w-[780px] min-h-[540px] rounded-2xl border border-slate-600/30 bg-slate-900/90 shadow-2xl shadow-black/50 backdrop-blur-xl overflow-hidden ring-1 ring-white/[0.03]"
      >
        {/* ── Left panel: stepper ── */}
        <div className="relative flex w-[232px] shrink-0 flex-col border-r border-slate-700/30 bg-slate-800/30 p-8">
          {/* Ambient glow */}
          <div className="pointer-events-none absolute -left-20 top-1/4 h-48 w-48 rounded-full bg-blue-600/[0.06] blur-[80px]" />

          {/* Logo area */}
          <div className="pb-6 mb-6 border-b border-slate-700/20">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/15 to-cyan-500/10 border border-blue-500/20">
                <FiAnchor size={16} className="text-blue-400" />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-100 tracking-[-0.01em]">Fleet Command</div>
                <div className="text-[10px] uppercase tracking-[0.1em] text-slate-500 font-medium">Setup Wizard</div>
              </div>
            </div>
          </div>

          {/* Steps */}
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-[0.15em] text-slate-600 font-medium mb-5">Configuration</div>
            <div className="flex flex-col gap-0.5">
              {STEPS.map((step, i) => (
                <StepIndicator
                  key={step.key}
                  step={step}
                  index={i}
                  currentIndex={currentStepIndex}
                  status={stepStatuses[step.key]}
                />
              ))}
            </div>
          </div>

          {/* Progress bar */}
          <div className="pt-6 mt-6 border-t border-slate-700/20">
            <div className="flex items-center justify-between text-[11px] text-slate-500 mb-2.5">
              <span className="font-medium">Progress</span>
              <span className="tabular-nums font-medium">{currentStepIndex + 1} of {STEPS.length}</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-800/80 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400"
                initial={{ width: 0 }}
                animate={{ width: `${((currentStepIndex + 1) / STEPS.length) * 100}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            </div>
          </div>
        </div>

        {/* ── Right panel: content ── */}
        <div className="flex flex-1 flex-col min-w-0">
          {/* Content area */}
          <div className="flex-1 px-10 pt-9 pb-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                variants={stepContentVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.25, ease: 'easeOut' }}
              >
                {currentStep === 'cli-detect' && (
                  <StepCliDetect status={stepStatuses['cli-detect']} onRetry={runCliDetection} />
                )}
                {currentStep === 'version' && (
                  <StepVersion status={stepStatuses.version} cliResult={cliResult} />
                )}
                {currentStep === 'auth' && (
                  <StepAuth status={stepStatuses.auth} cliResult={cliResult} />
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-slate-700/20 px-10 py-8">
            <div className="flex items-center gap-2.5 text-[13px] text-slate-500">
              <div className={`h-2 w-2 rounded-full transition-colors ${
                stepStatuses[currentStep]?.status === 'loading' ? 'bg-blue-400 animate-pulse' :
                stepStatuses[currentStep]?.status === 'success' ? 'bg-emerald-400' :
                stepStatuses[currentStep]?.status === 'error' ? 'bg-amber-400' : 'bg-slate-600'
              }`} />
              <span>
                {stepStatuses[currentStep]?.status === 'loading' ? 'Processing...' :
                 stepStatuses[currentStep]?.status === 'success' ? 'Ready to continue' :
                 stepStatuses[currentStep]?.status === 'error' ? 'Issue detected — you can still continue' : 'Waiting...'}
              </span>
            </div>
            <motion.button
              type="button"
              onClick={goToNext}
              disabled={!canProceed(currentStep)}
              whileHover={canProceed(currentStep) ? { scale: 1.03, y: -1 } : {}}
              whileTap={canProceed(currentStep) ? { scale: 0.97 } : {}}
              className="group relative flex items-center gap-3 rounded-[14px] bg-slate-800/90 border border-blue-500/30 text-blue-300 hover:bg-slate-700/90 hover:border-blue-400/40 shadow-sm px-10 py-[14px] text-[14px] font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none cursor-pointer"
              data-testid="setup-next-btn"
            >
              {/* Subtle top shine */}
              <span className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-xl bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              {currentStep === 'auth' ? 'Complete Setup' : 'Continue'}
              <FiArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-1" />
            </motion.button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/* ─── Step content components ─── */

function StepCliDetect({ status, onRetry }: { status: StepStatus; onRetry: () => void }) {
  return (
    <div data-testid="step-cli-detect" className="space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 border border-blue-500/15">
            <FiCpu size={16} className="text-blue-400" />
          </div>
          <h2 className="text-xl font-bold text-slate-50 tracking-[-0.02em]">CLI Binary Detection</h2>
        </div>
        <p className="text-sm text-slate-400 leading-relaxed pl-12">
          Scanning your system PATH and common installation directories for the Claude Code CLI binary.
        </p>
      </div>

      <div className="pl-12 space-y-4">
        <StatusDisplay status={status} />

        {status.status === 'error' && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3"
          >
            <Button
              variant="outline"
              onClick={onRetry}
              className="rounded-lg bg-slate-800 border-slate-700/60 text-slate-200 hover:bg-slate-700 hover:border-slate-600"
            >
              Retry Detection
            </Button>
            <a
              href="https://docs.anthropic.com/en/docs/claude-code"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors"
              data-testid="setup-guide-link"
            >
              <FiExternalLink size={13} />
              Installation Guide
            </a>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function StepVersion({ status, cliResult }: { status: StepStatus; cliResult: CliDetectionResult | null }) {
  return (
    <div data-testid="step-version" className="space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 border border-blue-500/15">
            <FiSettings size={16} className="text-blue-400" />
          </div>
          <h2 className="text-xl font-bold text-slate-50 tracking-[-0.02em]">Version Verification</h2>
        </div>
        <p className="text-sm text-slate-400 leading-relaxed pl-12">
          Confirming the installed CLI version meets compatibility requirements.
        </p>
      </div>

      <div className="pl-12 space-y-4">
        <StatusDisplay status={status} />

        {cliResult?.version && status.status === 'success' && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="rounded-xl bg-slate-800/50 border border-slate-700/40 px-5 py-4"
          >
            <div className="text-[11px] uppercase tracking-[0.1em] text-slate-500 mb-1.5 font-medium">Installed Version</div>
            <div className="font-mono text-lg text-emerald-400 font-semibold tracking-wide">{cliResult.version}</div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function StepAuth({ status, cliResult }: { status: StepStatus; cliResult: CliDetectionResult | null }) {
  return (
    <div data-testid="step-auth" className="space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 border border-blue-500/15">
            <FiKey size={16} className="text-blue-400" />
          </div>
          <h2 className="text-xl font-bold text-slate-50 tracking-[-0.02em]">Authentication Status</h2>
        </div>
        <p className="text-sm text-slate-400 leading-relaxed pl-12">
          Validating your Claude Code CLI has an active OAuth session for API access.
        </p>
      </div>

      <div className="pl-12 space-y-4">
        <StatusDisplay status={status} />

        {!cliResult?.authenticated && status.status === 'error' && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-5 py-4 text-sm text-amber-300/90 leading-relaxed"
          >
            Open your terminal and run{' '}
            <code className="rounded-md bg-slate-800/80 border border-slate-700/50 px-2 py-0.5 font-mono text-amber-200 text-xs">
              claude auth login
            </code>{' '}
            to authenticate, then click Continue.
          </motion.div>
        )}
      </div>
    </div>
  );
}
