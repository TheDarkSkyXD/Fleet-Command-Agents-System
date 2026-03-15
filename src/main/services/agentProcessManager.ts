import { BrowserWindow } from 'electron';
import log from 'electron-log';
import * as nodePty from 'node-pty';
import { getDatabase } from '../db/database';
import { detectClaudeCli } from './claudeCliService';
import { guardEnforcementService } from './guardEnforcementService';
import { notificationService } from './notificationService';
import { runtimeRegistry } from './runtimeRegistry';
import { type StreamJsonEvent, StreamJsonParser } from './streamJsonParser';

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
  /** Claude model override (uses capability default if not specified) - explicit flag, highest priority */
  model?: string;
  /** Model from capability config/settings - medium priority in resolution chain */
  capabilityConfigModel?: string;
  /** Runtime adapter ID (uses default runtime if not specified) */
  runtime?: string;
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
  /** Session ID to resume (uses --resume flag instead of new session) */
  resumeSessionId?: string;
}

export interface AgentTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
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
  tokenUsage: AgentTokenUsage;
  jsonLineBuffer: string;
  /** Dedicated stream-json parser instance for structured event handling */
  streamParser: StreamJsonParser;
  /** Original spawn options preserved for checkpoint saving */
  spawnOptions: AgentSpawnOptions;
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
    // Resolve runtime adapter (use specified runtime or default)
    const runtimeId = options.runtime || runtimeRegistry.getDefaultRuntimeId();
    const adapter = runtimeRegistry.getAdapter(runtimeId);

    // Detect CLI via adapter or fallback
    let cliPath: string;
    if (adapter) {
      const detection = adapter.detect(false);
      if (!detection.found || !detection.path) {
        throw new Error(
          `Runtime '${adapter.displayName}' not found. Please install it and ensure it is in your PATH.`,
        );
      }
      cliPath = detection.path;
    } else {
      // Fallback to direct Claude CLI detection if no adapter
      const cliResult = detectClaudeCli(false);
      if (!cliResult.found || !cliResult.path) {
        throw new Error(
          'Claude CLI not found. Please install Claude Code CLI and ensure it is in your PATH.',
        );
      }
      cliPath = cliResult.path;
    }

    // Check if an agent with this ID already exists
    if (this.processes.has(options.id)) {
      throw new Error(`Agent with ID ${options.id} is already running.`);
    }

    // Model resolution chain: explicit flag > capability config > runtime default
    const model = runtimeRegistry.resolveModel(
      runtimeId,
      options.capability,
      options.model,
      options.capabilityConfigModel,
    );

    // Build command arguments via adapter or fallback
    let args: string[];
    if (adapter) {
      args = adapter.buildSpawnArgs({
        model,
        prompt: options.prompt,
        resumeSessionId: options.resumeSessionId,
        outputFormat: 'stream-json',
      });
      if (options.resumeSessionId) {
        log.info(
          `[AgentProcessManager] Resuming session: ${options.resumeSessionId} for agent ${options.agentName}`,
        );
      }
    } else {
      // Fallback arg building (legacy path)
      args = ['--dangerously-skip-permissions', '--output-format', 'stream-json'];
      args.push('--model', model);
      if (options.resumeSessionId) {
        args.push('--resume', options.resumeSessionId);
        log.info(
          `[AgentProcessManager] Resuming session: ${options.resumeSessionId} for agent ${options.agentName}`,
        );
      }
      if (options.prompt && !options.resumeSessionId) {
        args.push('-p', options.prompt);
      }
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

    // Use CLI path from adapter detection
    const shell = cliPath;

    log.info(
      `[AgentProcessManager] Spawning agent: ${options.agentName} (${options.capability}), runtime=${runtimeId}, model=${model}, cwd=${cwd}`,
    );
    log.info(`[AgentProcessManager] Command: ${cliPath} ${args.join(' ')}`);

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

    // Create a dedicated stream-json parser for this agent
    const streamParser = new StreamJsonParser();

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
      tokenUsage: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      },
      jsonLineBuffer: '',
      streamParser,
      spawnOptions: options,
    };

    // Register the stream-json event handler to process structured events
    streamParser.onEvent((event: StreamJsonEvent) => {
      this.handleParsedEvent(agentProcess, event);
    });

    // Store the process
    this.processes.set(options.id, agentProcess);

    // Listen for data (terminal output)
    ptyProcess.onData((data: string) => {
      // Buffer output for later retrieval
      agentProcess.outputBuffer.push(data);
      if (agentProcess.outputBuffer.length > this.maxOutputBufferLines) {
        agentProcess.outputBuffer.shift();
      }

      // Parse stream-json output via dedicated parser (token tracking + event handling)
      this.parseStreamJsonForTokens(agentProcess, data);

      // Feed data through the structured StreamJsonParser for typed event broadcasting
      agentProcess.streamParser.feed(data);

      // Forward output to renderer via IPC
      this.broadcastOutput(options.id, data);
    });

    // Listen for exit
    ptyProcess.onExit(({ exitCode, signal }) => {
      log.info(
        `[AgentProcessManager] Agent exited: ${options.agentName} (PID=${pid}), exitCode=${exitCode}, signal=${signal}`,
      );
      agentProcess.isRunning = false;

      // Send desktop notification for agent completion
      notificationService.notifyAgentCompleted(options.agentName, options.capability);

      // Save token usage metrics to database
      this.saveMetrics(agentProcess, options);

      // Record session_end event
      this.recordEvent({
        eventType: 'session_end',
        agentName: options.agentName,
        sessionId: options.id,
        runId: options.runId,
        data: JSON.stringify({ exitCode, signal, reason: 'process_exit' }),
      });

      // Notify renderer of agent exit
      this.broadcastAgentEvent(options.id, 'exit', {
        exitCode,
        signal,
      });
    });

    return agentProcess;
  }

  /**
   * Resume a previous Claude Code CLI agent session via node-pty.
   * This spawns a new process with the --resume flag pointing to the previous session ID.
   */
  resume(
    options: Omit<AgentSpawnOptions, 'resumeSessionId'> & { resumeSessionId: string },
  ): AgentProcess {
    log.info(
      `[AgentProcessManager] Resuming agent: ${options.agentName}, previous session: ${options.resumeSessionId}`,
    );
    return this.spawn(options);
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
   * Save checkpoint data for all currently tracked agents to the database.
   * Called on app close/crash to preserve agent states for recovery.
   */
  saveCheckpoints(): number {
    let saved = 0;
    try {
      const db = getDatabase();
      const upsertStmt = db.prepare(`
        INSERT INTO checkpoints (agent_name, task_id, session_id, progress_summary, files_modified, current_branch, pending_work, mulch_domains, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(agent_name) DO UPDATE SET
          task_id = excluded.task_id,
          session_id = excluded.session_id,
          progress_summary = excluded.progress_summary,
          files_modified = excluded.files_modified,
          current_branch = excluded.current_branch,
          pending_work = excluded.pending_work,
          mulch_domains = excluded.mulch_domains,
          timestamp = excluded.timestamp
      `);

      for (const agent of this.processes.values()) {
        const opts = agent.spawnOptions;

        // Build progress summary from token usage and run duration
        const durationMs = Date.now() - agent.createdAt.getTime();
        const durationMin = Math.round(durationMs / 60000);
        const progressSummary = JSON.stringify({
          state: agent.isRunning ? 'running' : 'stopped',
          capability: agent.capability,
          model: agent.model,
          durationMinutes: durationMin,
          tokenUsage: agent.tokenUsage,
        });

        // Extract files_modified from the output buffer by scanning for file paths
        const filesModified = JSON.stringify(opts.fileScope ?? []);

        // Pending work: the initial prompt or task context
        const pendingWork = agent.isRunning
          ? JSON.stringify({ prompt: opts.prompt ?? null, taskId: opts.taskId ?? null })
          : null;

        upsertStmt.run(
          agent.agentName,
          opts.taskId ?? null,
          agent.id,
          progressSummary,
          filesModified,
          opts.branchName ?? null,
          pendingWork,
          opts.worktreePath ? JSON.stringify([opts.worktreePath]) : null,
        );
        saved++;
        log.info(`[AgentProcessManager] Checkpoint saved for agent: ${agent.agentName}`);
      }

      log.info(`[AgentProcessManager] Saved ${saved} checkpoint(s) on app close`);
    } catch (error) {
      log.error('[AgentProcessManager] Failed to save checkpoints:', error);
    }
    return saved;
  }

  /**
   * Record an event in the events table.
   */
  private recordEvent(params: {
    eventType: string;
    agentName?: string;
    sessionId?: string;
    runId?: string;
    toolName?: string;
    toolArgs?: string;
    toolDurationMs?: number;
    level?: string;
    data?: string;
  }): void {
    try {
      const db = getDatabase();
      const id = `evt-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      db.prepare(
        `INSERT INTO events (id, run_id, agent_name, session_id, event_type, tool_name, tool_args, tool_duration_ms, level, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        params.runId ?? null,
        params.agentName ?? null,
        params.sessionId ?? null,
        params.eventType,
        params.toolName ?? null,
        params.toolArgs ?? null,
        params.toolDurationMs ?? null,
        params.level ?? 'info',
        params.data ?? null,
      );
    } catch (error) {
      log.error('[AgentProcessManager] Failed to record event:', error);
    }
  }

  /**
   * Parse stream-json output from Claude CLI to extract token usage and tool events.
   * Claude CLI stream-json format includes lines like:
   * {"type":"result","usage":{"input_tokens":1234,"output_tokens":567,"cache_read_input_tokens":89,"cache_creation_input_tokens":12}}
   * {"type":"tool_use","name":"Read","input":{...}}
   * {"type":"tool_result","name":"Read","duration_ms":123}
   */
  private parseStreamJsonForTokens(agent: AgentProcess, data: string): void {
    // Accumulate data - stream may split JSON across chunks
    agent.jsonLineBuffer += data;

    // Try to extract complete JSON lines
    const lines = agent.jsonLineBuffer.split('\n');
    // Keep the last incomplete line in buffer
    agent.jsonLineBuffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('{')) continue;

      try {
        const parsed = JSON.parse(trimmed);

        // Check for usage data in the parsed JSON
        if (parsed.usage) {
          const usage = parsed.usage;
          if (typeof usage.input_tokens === 'number') {
            agent.tokenUsage.inputTokens += usage.input_tokens;
          }
          if (typeof usage.output_tokens === 'number') {
            agent.tokenUsage.outputTokens += usage.output_tokens;
          }
          if (typeof usage.cache_read_input_tokens === 'number') {
            agent.tokenUsage.cacheReadTokens += usage.cache_read_input_tokens;
          }
          if (typeof usage.cache_creation_input_tokens === 'number') {
            agent.tokenUsage.cacheCreationTokens += usage.cache_creation_input_tokens;
          }

          log.debug(
            `[AgentProcessManager] Token usage update for ${agent.agentName}: in=${agent.tokenUsage.inputTokens}, out=${agent.tokenUsage.outputTokens}, cacheRead=${agent.tokenUsage.cacheReadTokens}, cacheCreate=${agent.tokenUsage.cacheCreationTokens}`,
          );
        }

        // Track tool_start events (tool_use messages from Claude CLI)
        if (parsed.type === 'tool_use' && parsed.name) {
          this.recordEvent({
            eventType: 'tool_start',
            agentName: agent.agentName,
            sessionId: agent.id,
            toolName: parsed.name,
            toolArgs: parsed.input ? JSON.stringify(parsed.input).substring(0, 500) : undefined,
          });
        }

        // Track tool_end events (tool_result messages from Claude CLI)
        if (parsed.type === 'tool_result' && parsed.name) {
          this.recordEvent({
            eventType: 'tool_end',
            agentName: agent.agentName,
            sessionId: agent.id,
            toolName: parsed.name,
            toolDurationMs: typeof parsed.duration_ms === 'number' ? parsed.duration_ms : undefined,
          });
        }

        // Also detect content_block_start with tool_use type
        if (parsed.type === 'content_block_start' && parsed.content_block?.type === 'tool_use') {
          this.recordEvent({
            eventType: 'tool_start',
            agentName: agent.agentName,
            sessionId: agent.id,
            toolName: parsed.content_block.name,
            toolArgs: parsed.content_block.input
              ? JSON.stringify(parsed.content_block.input).substring(0, 500)
              : undefined,
          });
        }

        // Detect content_block_stop after tool_use - marks tool_end
        if (parsed.type === 'content_block_stop' && parsed.content_block?.type === 'tool_result') {
          this.recordEvent({
            eventType: 'tool_end',
            agentName: agent.agentName,
            sessionId: agent.id,
            toolName: parsed.content_block.name ?? 'unknown',
            toolDurationMs: typeof parsed.duration_ms === 'number' ? parsed.duration_ms : undefined,
          });
        }
      } catch {
        // Not valid JSON, ignore - this is expected for non-JSON terminal output
      }
    }
  }

  /**
   * Save accumulated token usage metrics to the database when an agent session completes.
   */
  private saveMetrics(agent: AgentProcess, options: AgentSpawnOptions): void {
    try {
      const db = getDatabase();
      const metricId = `metric-${agent.id}-${Date.now()}`;
      const now = new Date().toISOString();
      const durationMs = Date.now() - agent.createdAt.getTime();

      db.prepare(`
        INSERT INTO metrics (id, agent_name, task_id, capability, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, model_used, estimated_cost, duration_ms, parent_agent, run_id, started_at, completed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        metricId,
        agent.agentName,
        options.taskId ?? null,
        agent.capability,
        agent.tokenUsage.inputTokens,
        agent.tokenUsage.outputTokens,
        agent.tokenUsage.cacheReadTokens,
        agent.tokenUsage.cacheCreationTokens,
        agent.model,
        0, // estimated_cost - can be calculated later based on model pricing
        durationMs,
        options.parentAgent ?? null,
        options.runId ?? null,
        agent.createdAt.toISOString(),
        now,
      );

      log.info(
        `[AgentProcessManager] Saved metrics for ${agent.agentName}: in=${agent.tokenUsage.inputTokens}, out=${agent.tokenUsage.outputTokens}, cacheRead=${agent.tokenUsage.cacheReadTokens}, cacheCreate=${agent.tokenUsage.cacheCreationTokens}, duration=${durationMs}ms`,
      );
    } catch (error) {
      log.error(`[AgentProcessManager] Failed to save metrics for ${agent.agentName}:`, error);
    }
  }

  /**
   * Handle a parsed stream-json event from the StreamJsonParser.
   * Updates token usage, records events to database, and broadcasts to renderer.
   */
  private handleParsedEvent(agent: AgentProcess, event: StreamJsonEvent): void {
    // Extract and accumulate token usage from any event that carries it
    const usage = StreamJsonParser.extractUsage(event);
    if (usage) {
      if (typeof usage.input_tokens === 'number') {
        agent.tokenUsage.inputTokens += usage.input_tokens;
      }
      if (typeof usage.output_tokens === 'number') {
        agent.tokenUsage.outputTokens += usage.output_tokens;
      }
      if (typeof usage.cache_read_input_tokens === 'number') {
        agent.tokenUsage.cacheReadTokens += usage.cache_read_input_tokens;
      }
      if (typeof usage.cache_creation_input_tokens === 'number') {
        agent.tokenUsage.cacheCreationTokens += usage.cache_creation_input_tokens;
      }
    }

    // Guard enforcement: check tool_use events against guard rules
    if (event.type === 'tool_use') {
      const toolEvent = event as {
        type: 'tool_use';
        name: string;
        input?: Record<string, unknown>;
      };
      if (toolEvent.name) {
        const result = guardEnforcementService.enforceToolCall(
          agent.agentName,
          agent.capability,
          toolEvent.name,
          toolEvent.input,
          agent.spawnOptions.worktreePath,
        );
        if (!result.allowed) {
          // Broadcast the violation to the renderer for real-time display
          this.broadcastAgentEvent(agent.id, 'guard_violation', {
            toolName: toolEvent.name,
            violation: result.violation,
            capability: agent.capability,
          });
        }
      }
    }

    // Also check content_block_start with tool_use type for streaming format
    if (event.type === 'content_block_start') {
      const blockEvent = event as {
        type: 'content_block_start';
        content_block?: { type: string; name?: string; input?: Record<string, unknown> };
      };
      if (blockEvent.content_block?.type === 'tool_use' && blockEvent.content_block.name) {
        const result = guardEnforcementService.enforceToolCall(
          agent.agentName,
          agent.capability,
          blockEvent.content_block.name,
          blockEvent.content_block.input,
          agent.spawnOptions.worktreePath,
        );
        if (!result.allowed) {
          this.broadcastAgentEvent(agent.id, 'guard_violation', {
            toolName: blockEvent.content_block.name,
            violation: result.violation,
            capability: agent.capability,
          });
        }
      }
    }

    // Broadcast the structured parsed event to the renderer
    this.broadcastParsedEvent(agent.id, event);
  }

  /**
   * Broadcast a parsed stream-json event to all renderer windows.
   * The renderer can listen on 'agent:parsed-event' for structured events.
   */
  private broadcastParsedEvent(agentId: string, event: StreamJsonEvent): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('agent:parsed-event', { agentId, event });
      }
    }
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
