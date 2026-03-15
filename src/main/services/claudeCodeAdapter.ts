import log from 'electron-log';
import type { AgentCapability } from './agentProcessManager';
import { detectClaudeCli } from './claudeCliService';
import type {
  RuntimeAdapter,
  RuntimeDetectionResult,
  RuntimeOutputEvent,
  RuntimeSpawnConfig,
} from './runtimeRegistry';

/**
 * Claude Code CLI runtime adapter.
 * Implements the RuntimeAdapter interface for the Claude Code CLI.
 */
export class ClaudeCodeAdapter implements RuntimeAdapter {
  readonly id = 'claude-code';
  readonly displayName = 'Claude Code';
  readonly description =
    'Anthropic Claude Code CLI - AI coding assistant with subscription-based authentication';
  readonly defaultModel = 'sonnet';
  readonly supportedModels = ['haiku', 'sonnet', 'opus'];

  /**
   * Detect Claude Code CLI installation and authentication status.
   */
  detect(forceRefresh = false): RuntimeDetectionResult {
    const result = detectClaudeCli(forceRefresh);
    return {
      found: result.found,
      path: result.path,
      version: result.version,
      authenticated: result.authenticated,
      error: result.error,
    };
  }

  /**
   * Build CLI spawn arguments for Claude Code.
   */
  buildSpawnArgs(options: RuntimeSpawnConfig): string[] {
    const args: string[] = [
      '--dangerously-skip-permissions',
      '--output-format',
      options.outputFormat || 'stream-json',
    ];

    // Add model flag
    args.push('--model', options.model);

    // Add resume flag if resuming a previous session
    if (options.resumeSessionId) {
      args.push('--resume', options.resumeSessionId);
    }

    // Add initial prompt if provided (only when not resuming)
    if (options.prompt && !options.resumeSessionId) {
      args.push('-p', options.prompt);
    }

    // Add any additional arguments
    if (options.additionalArgs) {
      args.push(...options.additionalArgs);
    }

    return args;
  }

  /**
   * Parse Claude Code stream-json output.
   * Note: Primary parsing is handled by StreamJsonParser.
   * This method provides a secondary hook for adapter-specific parsing.
   */
  parseOutput(data: string): RuntimeOutputEvent[] | null {
    // The main parsing is done by StreamJsonParser in agentProcessManager.
    // This adapter method can be used for runtime-specific pre-processing.
    try {
      const lines = data
        .split('\n')
        .filter((line) => line.trim().length > 0);
      const events: RuntimeOutputEvent[] = [];

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.type) {
            events.push({
              type: parsed.type,
              data: parsed,
            });
          }
        } catch {
          // Not JSON, skip (normal for terminal output)
        }
      }

      return events.length > 0 ? events : null;
    } catch {
      return null;
    }
  }

  /**
   * Get the default model for a given capability in Claude Code.
   * scout = haiku (fast, cheap, read-only tasks)
   * builder/reviewer = sonnet (balanced capability)
   * lead/coordinator/merger/monitor = opus (highest reasoning)
   */
  getDefaultModelForCapability(capability: AgentCapability): string {
    switch (capability) {
      case 'scout':
        return 'haiku';
      case 'builder':
      case 'reviewer':
        return 'sonnet';
      case 'lead':
      case 'coordinator':
      case 'merger':
      case 'monitor':
        return 'opus';
      default:
        return this.defaultModel;
    }
  }
}

/**
 * Create and return the singleton Claude Code adapter instance.
 */
export function createClaudeCodeAdapter(): ClaudeCodeAdapter {
  log.info('[ClaudeCodeAdapter] Creating Claude Code runtime adapter');
  return new ClaudeCodeAdapter();
}
