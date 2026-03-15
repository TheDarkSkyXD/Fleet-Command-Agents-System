import { BrowserWindow } from 'electron';
import log from 'electron-log';
import { getDatabase } from '../db/database';
import { type AgentProcess, agentProcessManager } from './agentProcessManager';
import { notificationService } from './notificationService';

/**
 * Escalation level for progressive nudging.
 * Level 0: No issue detected
 * Level 1: Warning logged (agent idle)
 * Level 2: Nudge sent (prompt to resume)
 * Level 3: Escalation (parent/coordinator notified)
 * Level 4: Terminated (agent killed)
 */
export type EscalationLevel = 0 | 1 | 2 | 3 | 4;

/**
 * Watchdog check result for a single agent.
 */
export interface WatchdogCheckResult {
  agentId: string;
  agentName: string;
  pidAlive: boolean;
  ptyRunning: boolean;
  stalledDurationMs: number | null;
  escalationLevel: EscalationLevel;
  action: 'none' | 'warn' | 'nudge' | 'escalate' | 'terminate';
  timestamp: string;
}

/**
 * Watchdog configuration.
 */
export interface WatchdogConfig {
  /** Interval in milliseconds between daemon checks (default 30000 = 30s) */
  intervalMs: number;
  /** Duration in ms after which an idle agent is considered stalled (default 300000 = 5min) */
  staleThresholdMs: number;
  /** Duration in ms after which a stalled agent becomes zombie (default 900000 = 15min) */
  zombieThresholdMs: number;
  /** Whether the watchdog daemon is enabled */
  enabled: boolean;
}

/**
 * Tracks the escalation state for each agent.
 */
interface AgentEscalationState {
  level: EscalationLevel;
  /** When the agent was first detected as stalled */
  stalledSince: number | null;
  /** When each escalation level was applied */
  levelTimestamps: Record<number, number>;
  /** Last time we saw activity from this agent */
  lastActivityAt: number;
}

const DEFAULT_CONFIG: WatchdogConfig = {
  intervalMs: 30000, // 30 seconds
  staleThresholdMs: 300000, // 5 minutes
  zombieThresholdMs: 900000, // 15 minutes
  enabled: true,
};

/**
 * WatchdogService implements Tier 0 process daemon monitoring.
 *
 * It runs at a configurable interval, checking:
 * - PID liveness (is the OS process still alive?)
 * - node-pty process running status
 * - Agent activity (has the agent produced output recently?)
 *
 * When stalled agents are detected, it applies progressive nudging:
 * - Level 1: Warning logged
 * - Level 2: Nudge sent (prompt written to pty)
 * - Level 3: Escalation (parent/coordinator notified via mail)
 * - Level 4: Terminate (agent process killed)
 */
class WatchdogService {
  private config: WatchdogConfig = { ...DEFAULT_CONFIG };
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private escalationStates: Map<string, AgentEscalationState> = new Map();
  private checkCount = 0;
  private lastCheckAt: string | null = null;

  /**
   * Start the watchdog daemon.
   */
  start(): void {
    if (this.intervalHandle) {
      log.warn('[Watchdog] Already running, stopping first...');
      this.stop();
    }

    if (!this.config.enabled) {
      log.info('[Watchdog] Disabled by configuration');
      return;
    }

    log.info(
      `[Watchdog] Starting daemon: interval=${this.config.intervalMs}ms, staleThreshold=${this.config.staleThresholdMs}ms, zombieThreshold=${this.config.zombieThresholdMs}ms`,
    );

    // Run first check immediately
    this.runCheck();

    // Schedule recurring checks
    this.intervalHandle = setInterval(() => {
      this.runCheck();
    }, this.config.intervalMs);
  }

  /**
   * Stop the watchdog daemon.
   */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      log.info('[Watchdog] Daemon stopped');
    }
  }

  /**
   * Check if the watchdog daemon is running.
   */
  isRunning(): boolean {
    return this.intervalHandle !== null;
  }

  /**
   * Get the current watchdog configuration.
   */
  getConfig(): WatchdogConfig {
    return { ...this.config };
  }

  /**
   * Update watchdog configuration. Restarts the daemon if running.
   */
  updateConfig(updates: Partial<WatchdogConfig>): void {
    const wasRunning = this.isRunning();

    if (wasRunning) {
      this.stop();
    }

    this.config = { ...this.config, ...updates };
    log.info('[Watchdog] Configuration updated:', this.config);

    if (wasRunning && this.config.enabled) {
      this.start();
    }
  }

  /**
   * Get the watchdog daemon status.
   */
  getStatus(): {
    running: boolean;
    config: WatchdogConfig;
    checkCount: number;
    lastCheckAt: string | null;
    trackedAgents: number;
  } {
    return {
      running: this.isRunning(),
      config: this.getConfig(),
      checkCount: this.checkCount,
      lastCheckAt: this.lastCheckAt,
      trackedAgents: this.escalationStates.size,
    };
  }

  /**
   * Get the escalation state for a specific agent.
   */
  getEscalationState(agentId: string): AgentEscalationState | null {
    return this.escalationStates.get(agentId) ?? null;
  }

  /**
   * Get all escalation states.
   */
  getAllEscalationStates(): Record<string, AgentEscalationState> {
    const result: Record<string, AgentEscalationState> = {};
    for (const [id, state] of this.escalationStates.entries()) {
      result[id] = { ...state, levelTimestamps: { ...state.levelTimestamps } };
    }
    return result;
  }

  /**
   * Reset escalation state for an agent (e.g., after it resumes activity).
   */
  resetEscalation(agentId: string): void {
    this.escalationStates.delete(agentId);
    log.info(`[Watchdog] Escalation reset for agent: ${agentId}`);
  }

  /**
   * Run a single watchdog check cycle across all tracked agents.
   */
  runCheck(): WatchdogCheckResult[] {
    const now = Date.now();
    this.checkCount++;
    this.lastCheckAt = new Date(now).toISOString();

    const agents = agentProcessManager.getAll();
    const results: WatchdogCheckResult[] = [];

    for (const agent of agents) {
      const result = this.checkAgent(agent, now);
      results.push(result);
    }

    // Clean up escalation states for agents that no longer exist
    for (const agentId of this.escalationStates.keys()) {
      if (!agents.some((a) => a.id === agentId)) {
        this.escalationStates.delete(agentId);
      }
    }

    // Broadcast watchdog results to renderer
    if (results.length > 0) {
      this.broadcastWatchdogUpdate(results);
    }

    log.debug(
      `[Watchdog] Check #${this.checkCount}: ${agents.length} agents checked, ${results.filter((r) => r.action !== 'none').length} actions taken`,
    );

    return results;
  }

  /**
   * Check a single agent's liveness and apply progressive nudging if needed.
   */
  private checkAgent(agent: AgentProcess, now: number): WatchdogCheckResult {
    // Check PID liveness
    const pidAlive = this.checkPidAlive(agent.pid);

    // Check node-pty process status
    const ptyRunning = agent.isRunning;

    // Get or create escalation state
    let state = this.escalationStates.get(agent.id);
    if (!state) {
      state = {
        level: 0,
        stalledSince: null,
        levelTimestamps: {},
        lastActivityAt: now,
      };
      this.escalationStates.set(agent.id, state);
    }

    // Detect recent activity by checking output buffer growth
    const hasRecentActivity = this.detectActivity(agent, state, now);

    if (hasRecentActivity) {
      // Agent is active - reset escalation
      if (state.level > 0) {
        log.info(
          `[Watchdog] Agent ${agent.agentName} resumed activity, resetting escalation from level ${state.level}`,
        );
        this.updateSessionState(agent.id, 'working', 0);
      }
      state.level = 0;
      state.stalledSince = null;
      state.levelTimestamps = {};
      state.lastActivityAt = now;

      return {
        agentId: agent.id,
        agentName: agent.agentName,
        pidAlive,
        ptyRunning,
        stalledDurationMs: null,
        escalationLevel: 0,
        action: 'none',
        timestamp: new Date(now).toISOString(),
      };
    }

    // Agent has no recent activity - process is stalled or dead
    if (!pidAlive || !ptyRunning) {
      // Process is dead - clean up
      log.warn(
        `[Watchdog] Agent ${agent.agentName} (PID=${agent.pid}) is dead: pidAlive=${pidAlive}, ptyRunning=${ptyRunning}`,
      );
      agent.isRunning = false;
      this.updateSessionState(agent.id, 'zombie', 4);
      this.escalationStates.delete(agent.id);

      // Send desktop notification for dead agent process
      notificationService.notifyAgentError(
        agent.agentName,
        `Process died unexpectedly (PID=${agent.pid}, pidAlive=${pidAlive}, ptyRunning=${ptyRunning})`,
      );

      this.recordWatchdogEvent(agent, 'process_dead', 4, {
        pidAlive,
        ptyRunning,
      });

      return {
        agentId: agent.id,
        agentName: agent.agentName,
        pidAlive,
        ptyRunning,
        stalledDurationMs: null,
        escalationLevel: 4,
        action: 'terminate',
        timestamp: new Date(now).toISOString(),
      };
    }

    // Process alive but no activity
    if (!state.stalledSince) {
      state.stalledSince = now;
    }

    const stalledDuration = now - state.stalledSince;
    const result = this.applyProgressiveNudging(agent, state, stalledDuration, now);

    return {
      agentId: agent.id,
      agentName: agent.agentName,
      pidAlive,
      ptyRunning,
      stalledDurationMs: stalledDuration,
      escalationLevel: state.level,
      action: result,
      timestamp: new Date(now).toISOString(),
    };
  }

  /**
   * Check if a process with the given PID is still alive.
   */
  private checkPidAlive(pid: number): boolean {
    try {
      // process.kill(pid, 0) tests if process exists without sending a signal
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Detect if an agent has had recent activity based on output buffer changes.
   * We track output buffer length changes between checks.
   */
  private detectActivity(agent: AgentProcess, state: AgentEscalationState, now: number): boolean {
    // If the agent just started (within the stale threshold), consider it active
    const agentAge = now - agent.createdAt.getTime();
    if (agentAge < this.config.staleThresholdMs) {
      return true;
    }

    // Check if the output buffer has grown since last check
    // We use a simple heuristic: if the buffer length or content has changed
    const bufferKey = `_bufLen_${agent.id}`;
    const prevLen = (state as unknown as Record<string, number>)[bufferKey] ?? 0;
    const curLen = agent.outputBuffer.length;
    (state as unknown as Record<string, number>)[bufferKey] = curLen;

    // If buffer wrapped (hit max), consider active if it changed at all
    if (curLen !== prevLen) {
      return true;
    }

    // Check last line content for changes
    if (curLen > 0) {
      const contentKey = `_lastLine_${agent.id}`;
      const lastLine = agent.outputBuffer[curLen - 1];
      const prevLine = (state as unknown as Record<string, string>)[contentKey] ?? '';
      (state as unknown as Record<string, string>)[contentKey] = lastLine;
      if (lastLine !== prevLine) {
        return true;
      }
    }

    return false;
  }

  /**
   * Apply progressive nudging based on stalled duration.
   * Returns the action taken.
   */
  private applyProgressiveNudging(
    agent: AgentProcess,
    state: AgentEscalationState,
    stalledDurationMs: number,
    now: number,
  ): 'none' | 'warn' | 'nudge' | 'escalate' | 'terminate' {
    const { staleThresholdMs, zombieThresholdMs } = this.config;

    // Calculate thresholds for each level
    // Level 1 (warn): At stale threshold (5 min default)
    // Level 2 (nudge): At stale threshold + 1/3 of remaining time to zombie
    // Level 3 (escalate): At stale threshold + 2/3 of remaining time to zombie
    // Level 4 (terminate): At zombie threshold (15 min default)
    const gap = zombieThresholdMs - staleThresholdMs;
    const l1Threshold = staleThresholdMs;
    const l2Threshold = staleThresholdMs + gap * 0.33;
    const l3Threshold = staleThresholdMs + gap * 0.66;
    const l4Threshold = zombieThresholdMs;

    // Level 4: Terminate
    if (stalledDurationMs >= l4Threshold && state.level < 4) {
      state.level = 4;
      state.levelTimestamps[4] = now;
      this.handleTerminate(agent, state, now);
      return 'terminate';
    }

    // Level 3: Escalate
    if (stalledDurationMs >= l3Threshold && state.level < 3) {
      state.level = 3;
      state.levelTimestamps[3] = now;
      this.handleEscalate(agent, state, now);
      return 'escalate';
    }

    // Level 2: Nudge
    if (stalledDurationMs >= l2Threshold && state.level < 2) {
      state.level = 2;
      state.levelTimestamps[2] = now;
      this.handleNudge(agent, state, now);
      return 'nudge';
    }

    // Level 1: Warn
    if (stalledDurationMs >= l1Threshold && state.level < 1) {
      state.level = 1;
      state.levelTimestamps[1] = now;
      this.handleWarn(agent, state, now);
      return 'warn';
    }

    return 'none';
  }

  /**
   * Level 1: Log a warning that the agent appears stalled.
   */
  private handleWarn(agent: AgentProcess, state: AgentEscalationState, now: number): void {
    const stalledMs = state.stalledSince ? now - state.stalledSince : 0;
    const stalledSec = Math.round(stalledMs / 1000);

    log.warn(
      `[Watchdog] LEVEL 1 WARNING: Agent ${agent.agentName} (PID=${agent.pid}) appears stalled for ${stalledSec}s`,
    );

    this.updateSessionState(agent.id, 'stalled', 1);

    // Send desktop notification for stalled agent
    notificationService.notifyAgentStalled(agent.agentName, agent.capability);

    this.recordWatchdogEvent(agent, 'watchdog_warn', 1, {
      stalledDurationMs: stalledMs,
      message: `Agent appears stalled for ${stalledSec}s`,
    });
  }

  /**
   * Level 2: Send a nudge prompt to the agent's terminal.
   */
  private handleNudge(agent: AgentProcess, state: AgentEscalationState, now: number): void {
    const stalledMs = state.stalledSince ? now - state.stalledSince : 0;
    const stalledSec = Math.round(stalledMs / 1000);

    log.warn(
      `[Watchdog] LEVEL 2 NUDGE: Agent ${agent.agentName} (PID=${agent.pid}) nudged after ${stalledSec}s stall`,
    );

    // Send nudge prompt to the agent's terminal
    const nudgePrompt =
      'You appear to be stalled. Please continue with your current task or report your status.\n';
    agentProcessManager.write(agent.id, nudgePrompt);

    this.updateSessionState(agent.id, 'stalled', 2);

    this.recordWatchdogEvent(agent, 'watchdog_nudge', 2, {
      stalledDurationMs: stalledMs,
      message: `Nudge sent to agent after ${stalledSec}s stall`,
      nudgePrompt,
    });
  }

  /**
   * Level 3: Escalate to parent agent or coordinator.
   */
  private handleEscalate(agent: AgentProcess, state: AgentEscalationState, now: number): void {
    const stalledMs = state.stalledSince ? now - state.stalledSince : 0;
    const stalledSec = Math.round(stalledMs / 1000);

    log.warn(
      `[Watchdog] LEVEL 3 ESCALATION: Agent ${agent.agentName} (PID=${agent.pid}) escalated after ${stalledSec}s stall`,
    );

    // Send escalation message via internal mail system
    this.sendEscalationMail(agent, stalledMs);

    this.updateSessionState(agent.id, 'stalled', 3);

    this.recordWatchdogEvent(agent, 'watchdog_escalate', 3, {
      stalledDurationMs: stalledMs,
      message: `Agent escalated to coordinator after ${stalledSec}s stall`,
    });
  }

  /**
   * Level 4: Terminate the agent process.
   */
  private handleTerminate(agent: AgentProcess, state: AgentEscalationState, now: number): void {
    const stalledMs = state.stalledSince ? now - state.stalledSince : 0;
    const stalledSec = Math.round(stalledMs / 1000);

    log.error(
      `[Watchdog] LEVEL 4 TERMINATE: Agent ${agent.agentName} (PID=${agent.pid}) terminated after ${stalledSec}s stall`,
    );

    this.updateSessionState(agent.id, 'zombie', 4);

    // Send desktop notification for zombie agent
    notificationService.notifyAgentZombie(agent.agentName, agent.capability);

    this.recordWatchdogEvent(agent, 'watchdog_terminate', 4, {
      stalledDurationMs: stalledMs,
      message: `Agent terminated after ${stalledSec}s stall (zombie threshold exceeded)`,
    });

    // Terminate the agent process
    agentProcessManager.stop(agent.id).catch((err) => {
      log.error(`[Watchdog] Failed to terminate agent ${agent.agentName}:`, err);
    });
  }

  /**
   * Update the session state and escalation level in the database.
   */
  private updateSessionState(sessionId: string, state: string, escalationLevel: number): void {
    try {
      const db = getDatabase();
      const now = new Date().toISOString();
      db.prepare(
        'UPDATE sessions SET state = ?, escalation_level = ?, stalled_at = COALESCE(stalled_at, ?), updated_at = ? WHERE id = ?',
      ).run(state, escalationLevel, now, now, sessionId);
    } catch (error) {
      log.error(`[Watchdog] Failed to update session state for ${sessionId}:`, error);
    }
  }

  /**
   * Record a watchdog event in the events table.
   */
  private recordWatchdogEvent(
    agent: AgentProcess,
    eventType: string,
    level: number,
    data: Record<string, unknown>,
  ): void {
    try {
      const db = getDatabase();
      const id = `evt-wd-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      db.prepare(
        `INSERT INTO events (id, run_id, agent_name, session_id, event_type, tool_name, tool_args, tool_duration_ms, level, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        null,
        agent.agentName,
        agent.id,
        eventType,
        null,
        null,
        null,
        level <= 2 ? 'warn' : 'error',
        JSON.stringify(data),
      );
    } catch (error) {
      log.error(`[Watchdog] Failed to record event for ${agent.agentName}:`, error);
    }
  }

  /**
   * Send an escalation message via the internal mail system.
   */
  private sendEscalationMail(agent: AgentProcess, stalledDurationMs: number): void {
    try {
      const db = getDatabase();
      const msgId = `msg-wd-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const stalledSec = Math.round(stalledDurationMs / 1000);
      const now = new Date().toISOString();

      db.prepare(
        `INSERT INTO messages (id, thread_id, from_agent, to_agent, subject, body, type, priority, payload, read, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        msgId,
        null,
        'watchdog',
        'coordinator',
        `ESCALATION: Agent ${agent.agentName} stalled`,
        `Agent ${agent.agentName} (${agent.capability}, PID=${agent.pid}) has been stalled for ${stalledSec}s. Escalation level 3 reached. Agent will be terminated if it does not resume within the zombie threshold. Please investigate or reassign the task.`,
        'escalation',
        'urgent',
        JSON.stringify({
          agentId: agent.id,
          agentName: agent.agentName,
          capability: agent.capability,
          pid: agent.pid,
          stalledDurationMs,
          escalationLevel: 3,
        }),
        0,
        now,
      );

      log.info(`[Watchdog] Escalation mail sent to coordinator for agent ${agent.agentName}`);
    } catch (error) {
      log.error(`[Watchdog] Failed to send escalation mail for ${agent.agentName}:`, error);
    }
  }

  /**
   * Broadcast watchdog check results to all renderer windows.
   */
  private broadcastWatchdogUpdate(results: WatchdogCheckResult[]): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('watchdog:update', {
          checkCount: this.checkCount,
          timestamp: this.lastCheckAt,
          results,
        });
      }
    }
  }
}

// Singleton instance
export const watchdogService = new WatchdogService();
