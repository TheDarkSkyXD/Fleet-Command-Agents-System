import { BrowserWindow } from 'electron';
import log from 'electron-log';
import * as nodePty from 'node-pty';
import { detectClaudeCli } from './claudeCliService';

/**
 * Agent capability type determines model defaults and guard rules.
 */
export type AgentCapability =
  | 'scout'
  | 'builder'
  | 'reviewer'
  | 'lead'
  | 'merger'
  | 'coordinator'
  | 'monitor';

/**
 * Default model per capability type.
 * scout uses haiku (fast, read-only exploration).
 * builder/reviewer use sonnet (balanced).
 * lead/coordinator/merger use opus (highest reasoning).
 */
export function getDefaultModel(capability: AgentCapability): string {
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
      return 'sonnet';
  }
}

export interface AgentSpawnOptions {
  /** Unique session ID */
  id: string;
  /** Human-readable agent name */
  agentName: string;
  /** Agent capability/role */
  capability: AgentCapability;
  /** Claude model override (uses capability default if not specified) */
  model?: string;
  /** Working directory / worktree path */
  worktreePath?: string;
  /** Git branch name */
  branchName?: string;
  /** Task ID this agent is working on */
  taskId?: string;
  /** Parent agent name (for hierarchy) */
  parentAgent?: string;
  /** Run ID this agent belongs to */
  runId?: string;
  /** Depth in agent hierarchy */
  depth?: number;
  /** Initial prompt to send to the agent */
  prompt?: string;
  /** File scope restrictions */
  fileScope?: string[];
}

export interface AgentProcess {
  id: string;
  agentName: string;
  capability: AgentCapability;
  model: string;
  pid: number;
  ptyProcess: nodePty.IPty;
  outputBuffer: string[];
  createdAt: Date;
  isRunning: boolean;
}

/**
 * AgentProcessManager manages node-pty processes for Claude Code CLI agents.
 * It spawns, tracks, and provides terminal output streaming for each agent.
 */
class AgentProcessManager {
  private processes: Map<string, AgentProcess> = new Map();
  private maxOutputBufferLines = 1000;

  /**
   * Spawn a new Claude Code CLI agent via node-pty.
   */
  spawn(options: AgentSpawnOptions): AgentProcess {
    const cliResult = detectClaudeCli(false);
    if (!cliResult.found || !cliResult.path) {
      throw new Error(
        'Claude CLI not found. Please install Claude Code CLI and ensure it is in your PATH.',
      );
    }

    // Check if an agent with this ID already exists
    if (this.processes.has(options.id)) {
      throw new Error(`Agent with ID ${options.id} is already running.`);
    }

    const model = options.model || getDefaultModel(options.capability);
    const claudePath = cliResult.path;

    // Build command arguments
    const args: string[] = ['--dangerously-skip-permissions', '--output-format', 'stream-json'];

    // Add model flag
    args.push('--model', model);

    // Add initial prompt if provided
    if (options.prompt) {
      args.push('-p', options.prompt);
    }

    // Determine working directory
    const cwd = options.worktreePath || process.cwd();

    // Build environment - strip CLAUDECODE and CLAUDE_CODE_ENTRYPOINT
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (
        value !== undefined &&
        !key.startsWith('CLAUDECODE') &&
        key !== 'CLAUDE_CODE_ENTRYPOINT'
      ) {
        env[key] = value;
      }
    }

    // Determine shell/command based on platform
    const shell = process.platform === 'win32' ? claudePath : claudePath;

    log.info(
      `[AgentProcessManager] Spawning agent: ${options.agentName} (${options.capability}), model=${model}, cwd=${cwd}`,
    );
    log.info(`[AgentProcessManager] Command: ${claudePath} ${args.join(' ')}`);

    // Spawn the pty process
    const ptyProcess = nodePty.spawn(shell, args, {
      name: 'xterm-color',
      cols: 120,
      rows: 40,
      cwd,
      env,
    });

    const pid = ptyProcess.pid;
    log.info(`[AgentProcessManager] Agent spawned: ${options.agentName}, PID=${pid}`);

    const agentProcess: AgentProcess = {
      id: options.id,
      agentName: options.agentName,
      capability: options.capability,
      model,
      pid,
      ptyProcess,
      outputBuffer: [],
      createdAt: new Date(),
      isRunning: true,
    };

    // Store the process
    this.processes.set(options.id, agentProcess);

    // Listen for data (terminal output)
    ptyProcess.onData((data: string) => {
      // Buffer output for later retrieval
      agentProcess.outputBuffer.push(data);
      if (agentProcess.outputBuffer.length > this.maxOutputBufferLines) {
        agentProcess.outputBuffer.shift();
      }

      // Forward output to renderer via IPC
      this.broadcastOutput(options.id, data);
    });

    // Listen for exit
    ptyProcess.onExit(({ exitCode, signal }) => {
      log.info(
        `[AgentProcessManager] Agent exited: ${options.agentName} (PID=${pid}), exitCode=${exitCode}, signal=${signal}`,
      );
      agentProcess.isRunning = false;

      // Notify renderer of agent exit
      this.broadcastAgentEvent(options.id, 'exit', {
        exitCode,
        signal,
      });
    });

    return agentProcess;
  }

  /**
   * Stop an agent by killing its pty process.
   */
  async stop(id: string): Promise<boolean> {
    const agent = this.processes.get(id);
    if (!agent) {
      log.warn(`[AgentProcessManager] Cannot stop unknown agent: ${id}`);
      return false;
    }

    if (!agent.isRunning) {
      log.info(`[AgentProcessManager] Agent already stopped: ${id}`);
      this.processes.delete(id);
      return true;
    }

    log.info(`[AgentProcessManager] Stopping agent: ${agent.agentName} (PID=${agent.pid})`);

    try {
      // Use tree-kill for clean process tree termination
      const treeKill = await import('tree-kill');
      await new Promise<void>((resolve, reject) => {
        treeKill.default(agent.pid, 'SIGTERM', (err) => {
          if (err) {
            log.warn(`[AgentProcessManager] tree-kill SIGTERM failed, trying SIGKILL: ${err}`);
            // Fallback: kill the pty process directly
            try {
              agent.ptyProcess.kill();
              resolve();
            } catch (killErr) {
              reject(killErr);
            }
          } else {
            resolve();
          }
        });
      });
    } catch (error) {
      log.error(`[AgentProcessManager] Failed to stop agent ${id}:`, error);
      // Last resort: kill pty directly
      try {
        agent.ptyProcess.kill();
      } catch {
        // ignore
      }
    }

    agent.isRunning = false;
    this.processes.delete(id);
    return true;
  }

  /**
   * Stop all running agents.
   */
  async stopAll(): Promise<number> {
    const ids = Array.from(this.processes.keys());
    let stopped = 0;
    for (const id of ids) {
      const success = await this.stop(id);
      if (success) stopped++;
    }
    log.info(`[AgentProcessManager] Stopped ${stopped}/${ids.length} agents`);
    return stopped;
  }

  /**
   * Send input data to an agent's terminal.
   */
  write(id: string, data: string): boolean {
    const agent = this.processes.get(id);
    if (!agent || !agent.isRunning) {
      return false;
    }
    agent.ptyProcess.write(data);
    return true;
  }

  /**
   * Resize an agent's terminal.
   */
  resize(id: string, cols: number, rows: number): boolean {
    const agent = this.processes.get(id);
    if (!agent || !agent.isRunning) {
      return false;
    }
    agent.ptyProcess.resize(cols, rows);
    return true;
  }

  /**
   * Get an agent process by ID.
   */
  get(id: string): AgentProcess | undefined {
    return this.processes.get(id);
  }

  /**
   * Get all running agent processes.
   */
  getAll(): AgentProcess[] {
    return Array.from(this.processes.values());
  }

  /**
   * Get the PID of a running agent.
   */
  getPid(id: string): number | null {
    const agent = this.processes.get(id);
    return agent ? agent.pid : null;
  }

  /**
   * Check if an agent is running.
   */
  isRunning(id: string): boolean {
    const agent = this.processes.get(id);
    return agent?.isRunning ?? false;
  }

  /**
   * Get the terminal output buffer for an agent.
   */
  getOutput(id: string): string[] {
    const agent = this.processes.get(id);
    return agent?.outputBuffer ?? [];
  }

  /**
   * Broadcast terminal output to all renderer windows.
   */
  private broadcastOutput(agentId: string, data: string): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('agent:output', { agentId, data });
      }
    }
  }

  /**
   * Broadcast agent lifecycle events to all renderer windows.
   */
  private broadcastAgentEvent(agentId: string, event: string, data: Record<string, unknown>): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('agent:update', { agentId, event, ...data });
      }
    }
  }
}

// Singleton instance
export const agentProcessManager = new AgentProcessManager();
