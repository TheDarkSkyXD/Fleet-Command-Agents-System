import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FiAlertTriangle,
  FiLoader,
  FiPlay,
  FiZap,
} from 'react-icons/fi';
import { z } from 'zod';
import type { AgentCapability, RuntimeInfo, ScopeOverlap, Session } from '../../../../shared/types';
import { FileTreePicker } from './FileTreePicker';
import { DEFAULT_MODEL_DEFAULTS, useSettingsStore } from '../../../stores/settingsStore';
import { CAPABILITY_COLORS, CAPABILITY_DEFAULTS, MODELS } from './constants';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';
import { Label } from '../../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';

/** Zod schema for agent spawn form validation */
const spawnFormSchema = z.object({
  name: z
    .string()
    .refine((val) => val.length === 0 || val.trim().length > 0, {
      message: 'Name cannot be only whitespace',
    })
    .refine((val) => val.length === 0 || /^[a-zA-Z0-9_-][a-zA-Z0-9_ -]*$/.test(val), {
      message: 'Name can only contain letters, numbers, spaces, hyphens, and underscores',
    })
    .refine((val) => val.length === 0 || val.length <= 64, {
      message: 'Name must be 64 characters or fewer',
    }),
  taskId: z
    .string()
    .refine((val) => val.length === 0 || val.trim().length > 0, {
      message: 'Task ID cannot be only whitespace',
    })
    .refine((val) => val.length === 0 || /^[a-zA-Z0-9_-]+$/.test(val.trim()), {
      message: 'Task ID can only contain letters, numbers, hyphens, and underscores',
    }),
  prompt: z.string(),
  fileScope: z.string(),
});

type SpawnFormErrors = Partial<Record<keyof z.infer<typeof spawnFormSchema>, string>>;

export function SpawnDialog({
  capability,
  model,
  runtime,
  availableRuntimes,
  name,
  taskId,
  fileScope,
  prompt,
  parentAgent,
  availableParents,
  treePaths,
  projectPath,
  isSpawning,
  error,
  onCapabilityChange,
  onModelChange,
  onRuntimeChange,
  onNameChange,
  onTaskIdChange,
  onFileScopeChange,
  onPromptChange,
  onParentAgentChange,
  onTreePathsChange,
  onSpawn,
  onClose,
  onForceOverlapChange,
  onDispatchOverridesChange,
}: {
  capability: AgentCapability;
  model: string;
  runtime: string;
  availableRuntimes: RuntimeInfo[];
  name: string;
  taskId: string;
  fileScope: string;
  prompt: string;
  parentAgent: string;
  availableParents: Session[];
  treePaths: string[];
  projectPath: string | null;
  isSpawning: boolean;
  error: string | null;
  onCapabilityChange: (c: AgentCapability) => void;
  onModelChange: (m: string) => void;
  onRuntimeChange: (r: string) => void;
  onNameChange: (n: string) => void;
  onTaskIdChange: (t: string) => void;
  onFileScopeChange: (f: string) => void;
  onPromptChange: (p: string) => void;
  onParentAgentChange: (p: string) => void;
  onTreePathsChange: (paths: string[]) => void;
  onSpawn: () => void;
  onClose: () => void;
  onForceOverlapChange?: (force: boolean) => void;
  onDispatchOverridesChange?: (overrides: { skip_scout?: boolean; skip_review?: boolean; max_agents?: number } | undefined) => void;
}) {
  const capabilityInfo = CAPABILITY_DEFAULTS[capability];
  const { settings: spawnSettings } = useSettingsStore();
  const configuredDefault =
    (spawnSettings.modelDefaultsPerCapability ?? DEFAULT_MODEL_DEFAULTS)[
      capability as keyof typeof DEFAULT_MODEL_DEFAULTS
    ] ?? capabilityInfo.model;
  const [showTreePicker, setShowTreePicker] = useState(capability === 'builder');
  const [scopeOverlaps, setScopeOverlaps] = useState<ScopeOverlap[]>([]);
  const [checkingOverlaps, setCheckingOverlaps] = useState(false);
  const [formErrors, setFormErrors] = useState<SpawnFormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [forceOverlap, setForceOverlap] = useState(false);
  const [skipScout, setSkipScout] = useState(false);
  const [skipReview, setSkipReview] = useState(false);
  const [maxAgents, setMaxAgents] = useState('');

  // Filter capabilities based on parent agent's capability
  const allowedCapabilities = useMemo((): AgentCapability[] => {
    if (!parentAgent) {
      return ['lead', 'coordinator'];
    }
    const parent = availableParents.find((s) => s.agent_name === parentAgent);
    if (!parent) {
      return Object.keys(CAPABILITY_DEFAULTS) as AgentCapability[];
    }
    if (parent.capability === 'coordinator') {
      return ['lead'];
    }
    if (parent.capability === 'lead') {
      return ['scout', 'builder', 'reviewer', 'merger'];
    }
    return Object.keys(CAPABILITY_DEFAULTS) as AgentCapability[];
  }, [parentAgent, availableParents]);

  // Auto-select first allowed capability when parent changes and current is not allowed
  useEffect(() => {
    if (allowedCapabilities.length > 0 && !allowedCapabilities.includes(capability)) {
      onCapabilityChange(allowedCapabilities[0]);
    }
  }, [allowedCapabilities, capability, onCapabilityChange]);

  // Reset forceOverlap when scope overlaps change
  useEffect(() => {
    setForceOverlap(false);
  }, [scopeOverlaps]);

  // Notify parent of forceOverlap changes
  useEffect(() => {
    onForceOverlapChange?.(forceOverlap);
  }, [forceOverlap, onForceOverlapChange]);

  // Notify parent of dispatch override changes
  useEffect(() => {
    if (capability === 'lead') {
      const overrides: { skip_scout?: boolean; skip_review?: boolean; max_agents?: number } = {};
      if (skipScout) overrides.skip_scout = true;
      if (skipReview) overrides.skip_review = true;
      const parsed = parseInt(maxAgents, 10);
      if (!isNaN(parsed) && parsed > 0) overrides.max_agents = parsed;
      onDispatchOverridesChange?.(Object.keys(overrides).length > 0 ? overrides : undefined);
    } else {
      onDispatchOverridesChange?.(undefined);
    }
  }, [capability, skipScout, skipReview, maxAgents, onDispatchOverridesChange]);

  // Validate a single field with Zod
  const validateField = useCallback(
    (field: keyof z.infer<typeof spawnFormSchema>, value: string) => {
      const result = spawnFormSchema.shape[field].safeParse(value);
      if (!result.success) {
        setFormErrors((prev) => ({ ...prev, [field]: result.error.errors[0]?.message }));
      } else {
        setFormErrors((prev) => {
          const next = { ...prev };
          delete next[field];
          return next;
        });
      }
    },
    [],
  );

  // Validate all fields before submit
  const validateAll = useCallback((): boolean => {
    const result = spawnFormSchema.safeParse({ name, taskId, prompt, fileScope });
    if (!result.success) {
      const errors: SpawnFormErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof SpawnFormErrors;
        if (!errors[field]) {
          errors[field] = issue.message;
        }
      }
      setFormErrors(errors);
      setTouched({ name: true, taskId: true, prompt: true, fileScope: true });
      return false;
    }
    setFormErrors({});
    return true;
  }, [name, taskId, prompt, fileScope]);

  // Validated spawn handler
  const handleValidatedSpawn = useCallback(() => {
    if (validateAll()) {
      onSpawn();
    }
  }, [validateAll, onSpawn]);

  // Check for scope overlaps when file selections change
  useEffect(() => {
    const paths =
      treePaths.length > 0
        ? treePaths
        : fileScope.trim()
          ? fileScope
              .split(',')
              .map((p) => p.trim())
              .filter(Boolean)
          : [];
    if (paths.length === 0) {
      setScopeOverlaps([]);
      return;
    }

    const timer = setTimeout(async () => {
      setCheckingOverlaps(true);
      try {
        const result = await window.electronAPI.scopeCheckOverlap(paths);
        if (result.data) {
          setScopeOverlaps(result.data);
        }
      } catch {
        // Silently ignore overlap check failures
      } finally {
        setCheckingOverlaps(false);
      }
    }, 300); // Debounce 300ms

    return () => clearTimeout(timer);
  }, [treePaths, fileScope]);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="max-w-lg max-h-[90vh] overflow-y-auto border-slate-700 bg-slate-800 shadow-2xl"
        data-testid="spawn-dialog"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-50">
            <FiZap className="h-5 w-5 text-blue-400" />
            Spawn Agent
          </DialogTitle>
          <DialogDescription className="sr-only">
            Configure and spawn a new agent
          </DialogDescription>
        </DialogHeader>

        {/* Body */}
        <div className="space-y-4">
          {/* Capability selector */}
          <div>
            <span className="block text-sm font-medium text-slate-300 mb-2">Capability</span>
            <div className="grid grid-cols-4 gap-2" data-testid="spawn-capability-selector">
              {(Object.keys(CAPABILITY_DEFAULTS) as AgentCapability[]).filter((cap) => allowedCapabilities.includes(cap)).map((cap) => (
                <Button
                  key={cap}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onCapabilityChange(cap)}
                  data-testid={`spawn-capability-${cap}`}
                  aria-selected={capability === cap}
                  className={`text-center text-xs font-medium transition-colors ${
                    capability === cap
                      ? `${CAPABILITY_COLORS[cap]} border-current`
                      : 'border-white/10 bg-[#1e1e1e] text-slate-400 hover:bg-[#252525] hover:text-slate-300'
                  }`}
                >
                  {cap}
                </Button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-slate-400">{capabilityInfo.description}</p>
          </div>

          {/* Runtime selector */}
          {availableRuntimes.length > 0 && (
            <div data-testid="spawn-runtime-selector">
              <span className="block text-sm font-medium text-slate-300 mb-2">Runtime</span>
              <div className="flex gap-2">
                {availableRuntimes.map((rt) => (
                  <div
                    key={rt.id}
                    onClick={() => onRuntimeChange(rt.id)}
                    className={`flex-1 rounded-md py-2.5 px-3 ${
                      rt.detected
                        ? 'border border-emerald-500/30 bg-emerald-500/8 text-emerald-400'
                        : 'border border-red-500/30 bg-red-500/8 text-red-400'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                        rt.detected ? 'bg-emerald-400' : 'bg-red-400'
                      }`} />
                      <div className="flex flex-col items-start gap-0.5">
                        <span className="text-sm font-medium">{rt.displayName}</span>
                        <span className={`text-[10px] ${rt.detected ? 'text-emerald-400/70' : 'text-red-400/70'}`}>
                          {rt.detected ? 'Installed & ready' : 'Not installed'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Model picker */}
          <div>
            <span className="block text-sm font-medium text-slate-300 mb-2">Model</span>
            <div
              className="flex gap-2"
              data-testid="spawn-model-picker"
              data-default-model={configuredDefault}
            >
              {[
                { id: 'haiku', label: 'Haiku', version: '4.5', desc: 'Fast & light', color: 'emerald' },
                { id: 'sonnet', label: 'Sonnet', version: '4.6', desc: 'Balanced', color: 'blue' },
                { id: 'opus', label: 'Opus', version: '4.6', desc: 'Most capable', color: 'orange' },
              ].map((m) => (
                <Button
                  key={m.id}
                  type="button"
                  variant="outline"
                  onClick={() => onModelChange(m.id)}
                  data-testid={`spawn-model-${m.id}`}
                  aria-selected={model === m.id}
                  className={`flex-1 h-auto py-2.5 transition-colors ${
                    model === m.id
                      ? m.color === 'emerald'
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                        : m.color === 'orange'
                          ? 'border-orange-500/40 bg-orange-500/10 text-orange-400'
                          : 'border-blue-500/40 bg-blue-500/10 text-blue-400'
                      : 'border-white/10 bg-[#1e1e1e] text-slate-400 hover:bg-[#252525] hover:text-slate-300'
                  }`}
                >
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-sm font-semibold">{m.label}</span>
                    <span className={`text-[10px] ${model === m.id ? 'opacity-70' : 'text-slate-500'}`}>
                      v{m.version} · {m.desc}
                    </span>
                  </div>
                </Button>
              ))}
            </div>
            {model !== configuredDefault && (
              <p className="mt-1 text-xs text-amber-400" data-testid="spawn-model-default-hint">
                Default for {capability} is {configuredDefault}
              </p>
            )}
          </div>

          {/* Agent name */}
          <div>
            <Label htmlFor="spawn-name" className="text-slate-300 mb-1">
              Name{' '}
              <span className="text-slate-400 font-normal" data-testid="spawn-name-hint">
                (optional, auto-generated if empty)
              </span>
            </Label>
            <Input
              id="spawn-name"
              type="text"
              value={name}
              onChange={(e) => {
                onNameChange(e.target.value);
                if (touched.name) validateField('name', e.target.value);
              }}
              onBlur={() => {
                setTouched((prev) => ({ ...prev, name: true }));
                validateField('name', name);
              }}
              placeholder={`e.g. swift-${capability}-001`}
              data-testid="spawn-name-input"
              className={`bg-[#1e1e1e] border-white/10 text-slate-200 placeholder-slate-500 ${touched.name && formErrors.name ? 'border-red-500 focus-visible:ring-red-500' : 'focus-visible:ring-blue-500'}`}
            />
            {touched.name && formErrors.name && (
              <p className="mt-1 text-xs text-red-400" data-testid="spawn-name-error">
                {formErrors.name}
              </p>
            )}
          </div>

          {/* Task ID */}
          <div>
            <Label htmlFor="spawn-task-id" className="text-slate-300 mb-1">
              Task ID <span className="text-slate-400 font-normal">(optional)</span>
            </Label>
            <Input
              id="spawn-task-id"
              type="text"
              value={taskId}
              onChange={(e) => {
                onTaskIdChange(e.target.value);
                if (touched.taskId) validateField('taskId', e.target.value);
              }}
              onBlur={() => {
                setTouched((prev) => ({ ...prev, taskId: true }));
                validateField('taskId', taskId);
              }}
              placeholder="e.g. TASK-42"
              data-testid="spawn-task-id-input"
              className={`bg-[#1e1e1e] border-white/10 text-slate-200 placeholder-slate-500 ${touched.taskId && formErrors.taskId ? 'border-red-500 focus-visible:ring-red-500' : 'focus-visible:ring-blue-500'}`}
            />
            {touched.taskId && formErrors.taskId && (
              <p className="mt-1 text-xs text-red-400" data-testid="spawn-task-id-error">
                {formErrors.taskId}
              </p>
            )}
          </div>

          {/* Parent agent */}
          {availableParents.length > 0 && (
            <div>
              <Label htmlFor="spawn-parent-agent" className="text-slate-300 mb-1">
                Parent Agent <span className="text-slate-400 font-normal">(optional)</span>
              </Label>
              <Select
                value={parentAgent}
                onValueChange={(val) => onParentAgentChange(val === '__none__' ? '' : val)}
              >
                <SelectTrigger
                  data-testid="spawn-parent-agent"
                  className="bg-slate-700 border-slate-600 text-slate-200 focus:ring-blue-500"
                >
                  <SelectValue placeholder="No parent (top-level agent)" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="__none__" className="text-slate-300 focus:bg-slate-700 focus:text-slate-200">
                    No parent (top-level agent)
                  </SelectItem>
                  {availableParents.map((s) => (
                    <SelectItem
                      key={s.id}
                      value={s.agent_name}
                      className="text-slate-300 focus:bg-slate-700 focus:text-slate-200"
                    >
                      {s.agent_name} ({s.capability})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-slate-400">
                Assign this agent under a lead or coordinator in the hierarchy
              </p>
            </div>
          )}

          {/* File scope */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label htmlFor="spawn-file-scope" className="text-slate-300">
                File Scope <span className="text-slate-400 font-normal">(optional)</span>
              </Label>
              {projectPath && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  onClick={() => setShowTreePicker(!showTreePicker)}
                  className="text-xs text-blue-400 hover:text-blue-300 h-auto p-0"
                  data-testid="toggle-tree-picker"
                >
                  {showTreePicker ? 'Use text input' : 'Browse files'}
                </Button>
              )}
            </div>

            {showTreePicker && projectPath ? (
              <FileTreePicker
                rootPath={projectPath}
                selectedPaths={treePaths}
                onSelectionChange={onTreePathsChange}
                maxHeight="200px"
              />
            ) : (
              <>
                <Input
                  id="spawn-file-scope"
                  type="text"
                  value={fileScope}
                  onChange={(e) => onFileScopeChange(e.target.value)}
                  placeholder="e.g. src/components/**, src/utils/*.ts"
                  data-testid="spawn-file-scope"
                  className="bg-[#1e1e1e] border-white/10 text-slate-200 placeholder-slate-500 focus-visible:ring-blue-500"
                />
                <p className="mt-1 text-xs text-slate-400">
                  Glob patterns restricting which files this agent can modify
                </p>
              </>
            )}

            {/* Show selected files summary when tree picker has selections */}
            {showTreePicker && treePaths.length > 0 && (
              <p className="mt-1 text-xs text-blue-400">
                {treePaths.length} file{treePaths.length !== 1 ? 's' : ''}/folder
                {treePaths.length !== 1 ? 's' : ''} selected
              </p>
            )}

            {/* Scope overlap warning */}
            {checkingOverlaps && (
              <p className="mt-1 text-xs text-slate-400 animate-pulse">
                Checking for scope conflicts...
              </p>
            )}
            {scopeOverlaps.length > 0 && (
              <div
                className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3"
                data-testid="scope-overlap-warning"
              >
                <div className="flex items-center gap-2 mb-2">
                  <FiAlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0" />
                  <span className="text-sm font-medium text-red-400">Scope Overlap Detected</span>
                </div>
                <div className="space-y-2">
                  {scopeOverlaps.map((overlap) => (
                    <div key={overlap.sessionId} className="text-xs text-red-300/80">
                      <span className="font-medium text-red-300">{overlap.agentName}</span>{' '}
                      already owns:{' '}
                      <span className="text-red-200/70 font-mono">
                        {overlap.overlappingPaths.slice(0, 3).join(', ')}
                        {overlap.overlappingPaths.length > 3 &&
                          ` +${overlap.overlappingPaths.length - 3} more`}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-red-400/60">
                  Assigning overlapping files to multiple builders may cause merge conflicts.
                  Adjust the file scope or force spawn to override.
                </p>
                <label className="flex items-center gap-2 mt-2 text-sm text-red-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={forceOverlap}
                    onChange={(e) => setForceOverlap(e.target.checked)}
                    className="rounded border-red-600"
                    data-testid="force-overlap-checkbox"
                  />
                  Force spawn (override conflicts)
                </label>
              </div>
            )}
          </div>

          {/* Initial prompt */}
          <div>
            <Label htmlFor="spawn-prompt" className="text-slate-300 mb-1">
              Initial Prompt <span className="text-slate-400 font-normal">(optional)</span>
            </Label>
            <Textarea
              id="spawn-prompt"
              value={prompt}
              onChange={(e) => onPromptChange(e.target.value)}
              placeholder="What should this agent work on?"
              rows={3}
              className="bg-[#1e1e1e] border-white/10 text-slate-200 placeholder-slate-500 focus-visible:ring-blue-500 resize-none"
            />
          </div>

          {/* Dispatch Overrides (lead only) */}
          {capability === 'lead' && (
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-300">Dispatch Overrides</span>
                <span className="text-xs text-slate-500">(optional)</span>
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm text-slate-400">
                  <input
                    type="checkbox"
                    checked={skipScout}
                    onChange={(e) => setSkipScout(e.target.checked)}
                    className="rounded border-slate-600"
                    data-testid="dispatch-skip-scout"
                  />
                  Skip Scout phase
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-400">
                  <input
                    type="checkbox"
                    checked={skipReview}
                    onChange={(e) => setSkipReview(e.target.checked)}
                    className="rounded border-slate-600"
                    data-testid="dispatch-skip-review"
                  />
                  Skip Review phase
                </label>
                <div>
                  <Label htmlFor="max-agents" className="text-slate-400 text-sm">Max Agents</Label>
                  <Input
                    id="max-agents"
                    type="number"
                    min={1}
                    max={20}
                    value={maxAgents}
                    onChange={(e) => setMaxAgents(e.target.value)}
                    placeholder="Default (no limit)"
                    data-testid="dispatch-max-agents"
                    className="mt-1 bg-[#1e1e1e] border-white/10 text-slate-200 placeholder-slate-500 w-32"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Validation errors summary */}
          {Object.keys(formErrors).length > 0 && Object.keys(touched).length > 0 && (
            <div
              className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400"
              data-testid="spawn-validation-errors"
            >
              Please fix the validation errors above before spawning.
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            className="border-slate-600 text-slate-300 hover:bg-slate-700"
          >
            Cancel
          </Button>
          <Button
            onClick={handleValidatedSpawn}
            disabled={isSpawning || Object.keys(formErrors).length > 0 || (scopeOverlaps.length > 0 && !forceOverlap)}
            data-testid="spawn-confirm-button"
            className="bg-blue-600/15 text-blue-400 border border-blue-500/25 hover:bg-blue-600/25 hover:text-blue-300"
          >
            {isSpawning ? (
              <>
                <FiLoader className="size-4 animate-spin" />
                Spawning...
              </>
            ) : (
              <>
                <FiPlay className="size-4" />
                Spawn {capability}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
