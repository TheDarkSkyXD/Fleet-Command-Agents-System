import log from 'electron-log';
import type { AgentCapability } from './agentProcessManager';

/**
 * RuntimeAdapter interface - defines what each AI coding runtime must implement.
 * Adapters handle runtime-specific logic for spawning, detecting, and parsing output.
 */
export interface RuntimeAdapter {
  /** Unique identifier for this runtime (e.g. 'claude-code', 'aider', 'cursor') */
  readonly id: string;

  /** Human-readable display name */
  readonly displayName: string;

  /** Short description of the runtime */
  readonly description: string;

  /** Default model for this runtime when no other config applies */
  readonly defaultModel: string;

  /** List of models supported by this runtime */
  readonly supportedModels: string[];

  /**
   * Detect if this runtime is available on the system.
   * Returns detection result with binary path, version, and auth status.
   */
  detect(forceRefresh?: boolean): RuntimeDetectionResult;

  /**
   * Build the CLI arguments for spawning an agent with this runtime.
   * @param options - Spawn configuration
   * @returns Array of CLI argument strings
   */
  buildSpawnArgs(options: RuntimeSpawnConfig): string[];

  /**
   * Parse structured output from the runtime process.
   * @param data - Raw output data from the PTY process
   * @returns Parsed events if any, null otherwise
   */
  parseOutput(data: string): RuntimeOutputEvent[] | null;

  /**
   * Get the default model for a given capability within this runtime.
   * @param capability - The agent capability type
   * @returns The default model string
   */
  getDefaultModelForCapability(capability: AgentCapability): string;
}

/**
 * Result of runtime detection (is it installed, where, what version).
 */
export interface RuntimeDetectionResult {
  found: boolean;
  path: string | null;
  version: string | null;
  authenticated: boolean;
  error: string | null;
}

/**
 * Configuration passed to the adapter when building spawn arguments.
 */
export interface RuntimeSpawnConfig {
  model: string;
  prompt?: string;
  resumeSessionId?: string;
  outputFormat?: string;
  additionalArgs?: string[];
}

/**
 * Parsed output event from a runtime.
 */
export interface RuntimeOutputEvent {
  type: string;
  data: Record<string, unknown>;
}

/**
 * Serializable runtime info for the renderer process.
 */
export interface RuntimeInfo {
  id: string;
  displayName: string;
  description: string;
  defaultModel: string;
  supportedModels: string[];
  detected: boolean;
  version: string | null;
  authenticated: boolean;
}

/**
 * RuntimeRegistry - central registry for AI coding runtime adapters.
 * Allows registering multiple runtimes and selecting which one to use for agent spawning.
 */
class RuntimeRegistry {
  private adapters: Map<string, RuntimeAdapter> = new Map();
  private defaultRuntimeId = 'claude-code';

  /**
   * Register a runtime adapter.
   */
  register(adapter: RuntimeAdapter): void {
    if (this.adapters.has(adapter.id)) {
      log.warn(`[RuntimeRegistry] Overwriting existing adapter: ${adapter.id}`);
    }
    this.adapters.set(adapter.id, adapter);
    log.info(`[RuntimeRegistry] Registered adapter: ${adapter.id} (${adapter.displayName})`);
  }

  /**
   * Unregister a runtime adapter.
   */
  unregister(id: string): boolean {
    const removed = this.adapters.delete(id);
    if (removed) {
      log.info(`[RuntimeRegistry] Unregistered adapter: ${id}`);
    }
    return removed;
  }

  /**
   * Get a registered adapter by ID.
   */
  getAdapter(id: string): RuntimeAdapter | undefined {
    return this.adapters.get(id);
  }

  /**
   * Get the default runtime adapter.
   */
  getDefaultAdapter(): RuntimeAdapter | undefined {
    return this.adapters.get(this.defaultRuntimeId);
  }

  /**
   * Set the default runtime ID.
   */
  setDefaultRuntime(id: string): void {
    if (!this.adapters.has(id)) {
      throw new Error(`[RuntimeRegistry] Cannot set default: adapter '${id}' is not registered.`);
    }
    this.defaultRuntimeId = id;
    log.info(`[RuntimeRegistry] Default runtime set to: ${id}`);
  }

  /**
   * Get the current default runtime ID.
   */
  getDefaultRuntimeId(): string {
    return this.defaultRuntimeId;
  }

  /**
   * List all registered adapters.
   */
  listAdapters(): RuntimeAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * List all registered adapter IDs.
   */
  listAdapterIds(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Get serializable info about all registered runtimes (for renderer).
   */
  listRuntimeInfo(): RuntimeInfo[] {
    return this.listAdapters().map((adapter) => {
      const detection = adapter.detect(false);
      return {
        id: adapter.id,
        displayName: adapter.displayName,
        description: adapter.description,
        defaultModel: adapter.defaultModel,
        supportedModels: adapter.supportedModels,
        detected: detection.found,
        version: detection.version,
        authenticated: detection.authenticated,
      };
    });
  }

  /**
   * Resolve the model using the resolution chain:
   *   1. Explicit model flag (user override in spawn dialog)
   *   2. Capability config (per-capability model defaults from settings)
   *   3. Runtime default for capability
   *
   * @param runtimeId - The runtime to resolve for
   * @param capability - The agent capability
   * @param explicitModel - User-specified model override (highest priority)
   * @param capabilityConfigModel - Model from capability config/settings (medium priority)
   * @returns Resolved model string
   */
  resolveModel(
    runtimeId: string,
    capability: AgentCapability,
    explicitModel?: string,
    capabilityConfigModel?: string,
  ): string {
    const adapter = this.adapters.get(runtimeId);
    if (!adapter) {
      log.warn(
        `[RuntimeRegistry] Adapter '${runtimeId}' not found, falling back to default model 'sonnet'`,
      );
      return explicitModel || capabilityConfigModel || 'sonnet';
    }

    // Resolution chain: explicit > capability config > runtime default
    if (explicitModel) {
      log.debug(`[RuntimeRegistry] Model resolved via explicit flag: ${explicitModel}`);
      return explicitModel;
    }

    if (capabilityConfigModel) {
      log.debug(`[RuntimeRegistry] Model resolved via capability config: ${capabilityConfigModel}`);
      return capabilityConfigModel;
    }

    const runtimeDefault = adapter.getDefaultModelForCapability(capability);
    log.debug(
      `[RuntimeRegistry] Model resolved via runtime default: ${runtimeDefault} (${capability})`,
    );
    return runtimeDefault;
  }
}

/** Singleton runtime registry instance */
export const runtimeRegistry = new RuntimeRegistry();
