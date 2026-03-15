import { useCallback, useEffect, useState } from 'react';
import {
  FiCheck,
  FiChevronRight,
  FiCpu,
  FiExternalLink,
  FiFolder,
  FiKey,
  FiLoader,
  FiSettings,
  FiShield,
  FiX,
} from 'react-icons/fi';
import { useSettingsStore } from '../stores/settingsStore';

type WizardStep = 'cli-detect' | 'version' | 'auth' | 'project' | 'config' | 'complete';

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

const STEPS: { key: WizardStep; label: string; icon: React.ElementType }[] = [
  { key: 'cli-detect', label: 'CLI Detection', icon: FiCpu },
  { key: 'version', label: 'Version Check', icon: FiSettings },
  { key: 'auth', label: 'Authentication', icon: FiKey },
  { key: 'project', label: 'Project Folder', icon: FiFolder },
  { key: 'config', label: 'Configuration', icon: FiShield },
];

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>('cli-detect');
  const [stepStatuses, setStepStatuses] = useState<Record<WizardStep, StepStatus>>({
    'cli-detect': { status: 'pending' },
    version: { status: 'pending' },
    auth: { status: 'pending' },
    project: { status: 'pending' },
    config: { status: 'pending' },
    complete: { status: 'pending' },
  });
  const [cliResult, setCliResult] = useState<CliDetectionResult | null>(null);
  const defaultProjectPath = useSettingsStore((s) => s.settings.defaultProjectPath);
  const [projectPath, setProjectPath] = useState('');
  const [projectName, setProjectName] = useState('');

  // Pre-fill project path from default setting
  useEffect(() => {
    if (defaultProjectPath && !projectPath) {
      setProjectPath(defaultProjectPath);
    }
  }, [defaultProjectPath]); // eslint-disable-line react-hooks/exhaustive-deps
  const [showComplete, setShowComplete] = useState(false);

  const updateStatus = useCallback((step: WizardStep, status: StepStatus) => {
    setStepStatuses((prev) => ({ ...prev, [step]: status }));
  }, []);

  // Step 1: CLI Detection
  const runCliDetection = useCallback(async () => {
    updateStatus('cli-detect', { status: 'loading', message: 'Searching for Claude CLI...' });
    try {
      const result = await window.electronAPI.claudeDetect({ forceRefresh: true });
      if (result.error) {
        updateStatus('cli-detect', {
          status: 'error',
          message: 'Detection failed',
          detail: result.error,
        });
        return;
      }
      const data = result.data;
      setCliResult(data);
      if (data.found) {
        updateStatus('cli-detect', {
          status: 'success',
          message: 'Claude CLI found',
          detail: data.path || undefined,
        });
      } else {
        updateStatus('cli-detect', {
          status: 'error',
          message: 'Claude CLI not found',
          detail: 'Install Claude Code CLI and try again',
        });
      }
    } catch (err) {
      updateStatus('cli-detect', {
        status: 'error',
        message: 'Detection error',
        detail: String(err),
      });
    }
  }, [updateStatus]);

  // Auto-run step 1 on mount
  useEffect(() => {
    if (currentStep === 'cli-detect') {
      runCliDetection();
    }
  }, [currentStep, runCliDetection]);

  // Step 2: Version verification
  const runVersionCheck = useCallback(() => {
    if (!cliResult) return;
    updateStatus('version', { status: 'loading', message: 'Checking version...' });
    if (cliResult.version) {
      updateStatus('version', {
        status: 'success',
        message: `Version ${cliResult.version}`,
        detail: 'CLI version verified',
      });
    } else {
      updateStatus('version', {
        status: 'error',
        message: 'Version unknown',
        detail: 'Could not determine CLI version',
      });
    }
  }, [cliResult, updateStatus]);

  // Step 3: Auth check
  const runAuthCheck = useCallback(() => {
    if (!cliResult) return;
    updateStatus('auth', { status: 'loading', message: 'Checking authentication...' });
    if (cliResult.authenticated) {
      updateStatus('auth', {
        status: 'success',
        message: 'Authenticated',
        detail: 'OAuth session active',
      });
    } else {
      updateStatus('auth', {
        status: 'error',
        message: 'Not authenticated',
        detail: 'Run "claude auth login" in your terminal to authenticate',
      });
    }
  }, [cliResult, updateStatus]);

  // Step 4: Folder picker
  const handleBrowseFolder = useCallback(async () => {
    try {
      const result = await window.electronAPI.dialogSelectFolder();
      if (result.data) {
        setProjectPath(result.data);
        // Auto-derive project name from folder name
        const folderName = result.data.split(/[\\/]/).filter(Boolean).pop() || 'My Project';
        if (!projectName) {
          setProjectName(folderName);
        }
      }
    } catch {
      // User cancelled
    }
  }, [projectName]);

  const handleProjectSubmit = useCallback(async () => {
    if (!projectPath.trim()) {
      updateStatus('project', {
        status: 'error',
        message: 'No folder selected',
        detail: 'Please select a project folder',
      });
      return;
    }
    updateStatus('project', { status: 'loading', message: 'Validating folder...' });

    try {
      // Create the project
      const name = projectName.trim() || 'My Project';
      const id = `proj_${Date.now()}`;
      const result = await window.electronAPI.projectCreate({
        id,
        name,
        path: projectPath,
      });
      if (result.error) {
        updateStatus('project', {
          status: 'error',
          message: 'Project creation failed',
          detail: result.error,
        });
        return;
      }
      // Switch to it
      await window.electronAPI.projectSwitch(id);
      updateStatus('project', {
        status: 'success',
        message: `Project "${name}" created`,
        detail: projectPath,
      });
    } catch (err) {
      updateStatus('project', {
        status: 'error',
        message: 'Error creating project',
        detail: String(err),
      });
    }
  }, [projectPath, projectName, updateStatus]);

  // Step 5: Config generation
  const runConfigGeneration = useCallback(async () => {
    updateStatus('config', { status: 'loading', message: 'Generating initial configuration...' });
    try {
      // Save default settings
      const defaultConfig = {
        maxHierarchyDepth: 2,
        maxConcurrentAgents: 10,
        maxAgentsPerLead: 5,
        watchdogEnabled: true,
        watchdogIntervalMs: 30000,
        watchdogStaleThresholdMs: 300000,
        watchdogZombieThresholdMs: 900000,
        terminalFontFamily: 'JetBrains Mono, Fira Code, monospace',
        terminalFontSize: 14,
        accentColor: 'blue',
        sidebarCollapsed: false,
        setupCompleted: true,
      };
      await window.electronAPI.settingsSet('app_settings', defaultConfig);
      updateStatus('config', {
        status: 'success',
        message: 'Configuration saved',
        detail: 'Default settings applied',
      });
    } catch (err) {
      updateStatus('config', {
        status: 'error',
        message: 'Config error',
        detail: String(err),
      });
    }
  }, [updateStatus]);

  // Navigate to next step
  const goToNext = useCallback(() => {
    const stepOrder: WizardStep[] = [
      'cli-detect',
      'version',
      'auth',
      'project',
      'config',
      'complete',
    ];
    const currentIndex = stepOrder.indexOf(currentStep);
    if (currentIndex < stepOrder.length - 1) {
      const next = stepOrder[currentIndex + 1];
      setCurrentStep(next);

      // Auto-run certain steps
      if (next === 'version') {
        setTimeout(runVersionCheck, 300);
      } else if (next === 'auth') {
        setTimeout(runAuthCheck, 300);
      } else if (next === 'config') {
        setTimeout(runConfigGeneration, 300);
      } else if (next === 'complete') {
        setShowComplete(true);
      }
    }
  }, [currentStep, runVersionCheck, runAuthCheck, runConfigGeneration]);

  // Can proceed to next?
  const canProceed = useCallback(
    (step: WizardStep): boolean => {
      const status = stepStatuses[step];
      // Allow proceeding even on error for CLI steps (user may want to skip)
      if (step === 'cli-detect') return status.status === 'success' || status.status === 'error';
      if (step === 'version') return status.status === 'success' || status.status === 'error';
      if (step === 'auth') return status.status === 'success' || status.status === 'error';
      if (step === 'project') return status.status === 'success';
      if (step === 'config') return status.status === 'success';
      return false;
    },
    [stepStatuses],
  );

  // Completion screen
  if (showComplete) {
    return (
      <div
        data-testid="setup-wizard"
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 backdrop-blur-sm"
      >
        <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-8 shadow-2xl">
          <div className="flex flex-col items-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20">
              <FiCheck className="h-8 w-8 text-emerald-400" />
            </div>
            <h2
              className="mb-2 text-2xl font-bold text-slate-50"
              data-testid="setup-complete-title"
            >
              Setup Complete!
            </h2>
            <p className="mb-6 text-slate-400">
              Fleet Command is ready. You can start spawning agents and orchestrating your coding
              fleet.
            </p>
            <button
              type="button"
              onClick={onComplete}
              className="rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-500"
              data-testid="setup-complete-btn"
            >
              Get Started
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentStepIndex = STEPS.findIndex((s) => s.key === currentStep);

  return (
    <div
      data-testid="setup-wizard"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 backdrop-blur-sm"
    >
      <div className="w-full max-w-2xl rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="border-b border-slate-700 p-6">
          <h1 className="text-xl font-bold text-slate-50">Welcome to Fleet Command</h1>
          <p className="mt-1 text-sm text-slate-400">
            Let&apos;s set up your environment for multi-agent coding orchestration.
          </p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-2 border-b border-slate-800 px-6 py-3">
          {STEPS.map((step, i) => {
            const status = stepStatuses[step.key];
            const isActive = step.key === currentStep;
            const isPast = i < currentStepIndex;
            const Icon = step.icon;
            return (
              <div key={step.key} className="flex items-center gap-2">
                {i > 0 && <FiChevronRight className="h-3 w-3 text-slate-500" />}
                <div
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-600/20 text-blue-400'
                      : isPast && status.status === 'success'
                        ? 'bg-emerald-600/20 text-emerald-400'
                        : isPast && status.status === 'error'
                          ? 'bg-amber-600/20 text-amber-400'
                          : 'bg-slate-800 text-slate-400'
                  }`}
                  data-testid={`setup-step-${step.key}`}
                >
                  <Icon className="h-3 w-3" />
                  <span className="hidden sm:inline">{step.label}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Step content */}
        <div className="min-h-[240px] p-6">
          {currentStep === 'cli-detect' && (
            <StepCliDetect status={stepStatuses['cli-detect']} onRetry={runCliDetection} />
          )}
          {currentStep === 'version' && (
            <StepVersion status={stepStatuses.version} cliResult={cliResult} />
          )}
          {currentStep === 'auth' && <StepAuth status={stepStatuses.auth} cliResult={cliResult} />}
          {currentStep === 'project' && (
            <StepProject
              status={stepStatuses.project}
              projectPath={projectPath}
              projectName={projectName}
              onPathChange={setProjectPath}
              onNameChange={setProjectName}
              onBrowse={handleBrowseFolder}
              onSubmit={handleProjectSubmit}
            />
          )}
          {currentStep === 'config' && <StepConfig status={stepStatuses.config} />}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-700 px-6 py-4">
          <span className="text-xs text-slate-400">
            Step {currentStepIndex + 1} of {STEPS.length}
          </span>
          <button
            type="button"
            onClick={goToNext}
            disabled={!canProceed(currentStep)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="setup-next-btn"
          >
            {currentStep === 'config' ? 'Finish' : 'Next'}
            <FiChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Step 1: CLI Detection */
function StepCliDetect({
  status,
  onRetry,
}: {
  status: StepStatus;
  onRetry: () => void;
}) {
  return (
    <div data-testid="step-cli-detect">
      <h2 className="mb-2 text-lg font-semibold text-slate-100">CLI Binary Detection</h2>
      <p className="mb-4 text-sm text-slate-400">
        Searching for the Claude Code CLI binary on your system via PATH and common install
        locations.
      </p>
      <StatusDisplay status={status} />
      {status.status === 'error' && (
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={onRetry}
            className="rounded bg-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-600"
          >
            Retry Detection
          </button>
          <a
            href="https://docs.anthropic.com/en/docs/claude-code"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"
            data-testid="setup-guide-link"
          >
            <FiExternalLink className="h-3 w-3" />
            Setup Guide
          </a>
        </div>
      )}
    </div>
  );
}

/** Step 2: Version */
function StepVersion({
  status,
  cliResult,
}: {
  status: StepStatus;
  cliResult: CliDetectionResult | null;
}) {
  return (
    <div data-testid="step-version">
      <h2 className="mb-2 text-lg font-semibold text-slate-100">Version Verification</h2>
      <p className="mb-4 text-sm text-slate-400">
        Verifying the installed CLI version is compatible.
      </p>
      <StatusDisplay status={status} />
      {cliResult?.version && (
        <div className="mt-3 rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-300">
          <span className="text-slate-400">Installed version: </span>
          <span className="font-mono text-emerald-400">{cliResult.version}</span>
        </div>
      )}
    </div>
  );
}

/** Step 3: Auth */
function StepAuth({
  status,
  cliResult,
}: {
  status: StepStatus;
  cliResult: CliDetectionResult | null;
}) {
  return (
    <div data-testid="step-auth">
      <h2 className="mb-2 text-lg font-semibold text-slate-100">Authentication Status</h2>
      <p className="mb-4 text-sm text-slate-400">
        Checking if your Claude Code CLI has an active OAuth session.
      </p>
      <StatusDisplay status={status} />
      {!cliResult?.authenticated && status.status === 'error' && (
        <div className="mt-3 rounded-lg border border-amber-800 bg-amber-900/20 px-4 py-3 text-sm text-amber-300">
          Run{' '}
          <code className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-amber-200">
            claude auth login
          </code>{' '}
          in your terminal, then click Next to continue.
        </div>
      )}
    </div>
  );
}

/** Step 4: Project folder picker */
function StepProject({
  status,
  projectPath,
  projectName,
  onPathChange,
  onNameChange,
  onBrowse,
  onSubmit,
}: {
  status: StepStatus;
  projectPath: string;
  projectName: string;
  onPathChange: (path: string) => void;
  onNameChange: (name: string) => void;
  onBrowse: () => void;
  onSubmit: () => void;
}) {
  return (
    <div data-testid="step-project">
      <h2 className="mb-2 text-lg font-semibold text-slate-100">Project Folder</h2>
      <p className="mb-4 text-sm text-slate-400">
        Select the root folder of your project that agents will work on.
      </p>

      <div className="space-y-3">
        <div>
          <label
            className="mb-1 block text-xs font-medium text-slate-400"
            htmlFor="project-name-input"
          >
            Project Name
          </label>
          <input
            id="project-name-input"
            type="text"
            value={projectName}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="My Project"
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-blue-500"
            data-testid="project-name-input"
          />
        </div>
        <div>
          <label
            className="mb-1 block text-xs font-medium text-slate-400"
            htmlFor="project-path-input"
          >
            Project Path
          </label>
          <div className="flex gap-2">
            <input
              id="project-path-input"
              type="text"
              value={projectPath}
              onChange={(e) => onPathChange(e.target.value)}
              placeholder="/path/to/your/project"
              className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-blue-500"
              data-testid="project-path-input"
            />
            <button
              type="button"
              onClick={onBrowse}
              className="flex items-center gap-1 rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-600"
              data-testid="browse-folder-btn"
            >
              <FiFolder className="h-4 w-4" />
              Browse
            </button>
          </div>
        </div>

        {status.status !== 'success' && (
          <button
            type="button"
            onClick={onSubmit}
            disabled={!projectPath.trim()}
            className="mt-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="create-project-btn"
          >
            Create Project
          </button>
        )}

        <StatusDisplay status={status} />
      </div>
    </div>
  );
}

/** Step 5: Config generation */
function StepConfig({ status }: { status: StepStatus }) {
  return (
    <div data-testid="step-config">
      <h2 className="mb-2 text-lg font-semibold text-slate-100">Initial Configuration</h2>
      <p className="mb-4 text-sm text-slate-400">
        Generating default configuration for agent hierarchy, watchdog, and terminal settings.
      </p>
      <StatusDisplay status={status} />
      {status.status === 'success' && (
        <div className="mt-3 space-y-1 text-sm text-slate-400">
          <p>✓ Agent hierarchy: 2 levels deep, 10 max concurrent, 5 per lead</p>
          <p>✓ Watchdog: enabled with 30s interval</p>
          <p>✓ Terminal: JetBrains Mono, 14px</p>
          <p>✓ Theme: Blue accent color</p>
        </div>
      )}
    </div>
  );
}

/** Status display for each step */
function StatusDisplay({ status }: { status: StepStatus }) {
  if (status.status === 'pending') return null;

  return (
    <div
      className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
        status.status === 'loading'
          ? 'bg-blue-900/20 text-blue-300'
          : status.status === 'success'
            ? 'bg-emerald-900/20 text-emerald-300'
            : 'bg-red-900/20 text-red-300'
      }`}
    >
      {status.status === 'loading' && <FiLoader className="mt-0.5 h-4 w-4 animate-spin" />}
      {status.status === 'success' && <FiCheck className="mt-0.5 h-4 w-4" />}
      {status.status === 'error' && <FiX className="mt-0.5 h-4 w-4" />}
      <div>
        <span className="font-medium">{status.message}</span>
        {status.detail && <p className="mt-0.5 text-xs opacity-75">{status.detail}</p>}
      </div>
    </div>
  );
}
