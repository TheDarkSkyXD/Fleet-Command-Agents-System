import { type ChildProcess, execFile } from 'node:child_process';
import { BrowserWindow } from 'electron';
import log from 'electron-log';
import { getDatabase } from '../db/database';
import { type AgentProcess, agentProcessManager } from './agentProcessManager';
import { detectClaudeCli } from './claudeCliService';
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
  /** Minimum interval in ms between nudges to the same agent (default 60000 = 1min) */
  nudgeDebounceMs: number;
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
  /** Last time a nudge was sent to this agent (for debounce) */
  lastNudgeAt?: number;
}

/**
 * Tier 1 AI triage classification result.
 */
export type TriageClassification = 'retry' | 'terminate' | 'extend';

/**
 * Tier 1 AI triage result for an agent error.
 */
export interface TriageResult {
  agentId: string;
  agentName: string;
  classification: TriageClassification;
  reason: string;
  linesAnalyzed: number;
  triageDurationMs: number;
  timedOut: boolean;
  timestamp: string;
}

/**
 * Tier 2 monitor patrol health report for an agent.
 */
export interface PatrolHealthReport {
  agentId: string;
  agentName: string;
  capability: string;
  pid: number;
  pidAlive: boolean;
  ptyRunning: boolean;
  outputLineCount: number;
  stalledDurationMs: number | null;
  escalationLevel: EscalationLevel;
  anomalies: string[];
  healthy: boolean;
  timestamp: string;
}

/**
 * Tier 2 monitor patrol result.
 */
export interface PatrolResult {
  patrolId: string;
  agentReports: PatrolHealthReport[];
  totalAgents: number;
  healthyAgents: number;
  unhealthyAgents: number;
  anomalyCount: number;
  timestamp: string;
}

/** Valid state transitions for the forward-only state machine */
export const VALID_STATE_TRANSITIONS: Record<string, string[]> = {
  booting: ['working', 'stalled', 'completed'],
  working: ['completed', 'stalled'],
  stalled: ['working', 'zombie', 'completed'],
  zombie: ['completed'],
};

/**
 * Validate that a state transition is allowed by the forward-only state machine.
 * Returns true if valid, false if invalid.
 */
export function validateStateTransition(fromState: string, toState: string): boolean {
  const allowed = VALID_STATE_TRANSITIONS[fromState];
  if (!allowed) return false;
  return allowed.includes(toState);
}

const DEFAULT_CONFIG: WatchdogConfig = {
  intervalMs: 30000, // 30 seconds
  staleThresholdMs: 300000, // 5 minutes
  zombieThresholdMs: 900000, // 15 minutes
  enabled: true,
  nudgeDebounceMs: 60000, // 1 minute
};

/**
 * Capabilities that are expected to be long-running and idle (e.g., waiting for mail).
 * These agents get a much higher stale threshold to avoid false positives.
 */
const PERSISTENT_CAPABILITIES = new Set(['coordinator', 'monitor']);

/** Stale threshold for persistent-capability agents: 30 minutes */
const PERSISTENT_STALE_THRESHOLD_MS = 1800000;

/** Zombie threshold for persistent-capability agents: 90 minutes */
const PERSISTENT_ZOMBIE_THRESHOLD_MS = 5400000;

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
  private notifiedRunCompletions: Set<string> = new Set();

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
   * Detect runs where all workers have completed and notify the coordinator.
   * Only sends one notification per run (tracked in notifiedRunCompletions set).
   */
  private detectRunCompletions(): void {
    try {
      const db = getDatabase();

      // Find runs where all non-coordinator/monitor workers have finished
      const runs = db.prepare(
        `SELECT run_id,
          SUM(CASE WHEN capability NOT IN ('coordinator', 'monitor') AND state IN ('booting', 'working', 'stalled') THEN 1 ELSE 0 END) as active_workers,
          SUM(CASE WHEN capability NOT IN ('coordinator', 'monitor') THEN 1 ELSE 0 END) as total_workers
        FROM sessions
        WHERE run_id IS NOT NULL
        GROUP BY run_id
        HAVING total_workers > 0`,
      ).all() as Array<{ run_id: string; active_workers: number; total_workers: number }>;

      for (const run of runs) {
        if (run.active_workers === 0 && run.total_workers > 0) {
          if (this.notifiedRunCompletions.has(run.run_id)) {
            continue;
          }

          // Find the coordinator for this run
          const coordinator = db.prepare(
            `SELECT agent_name FROM sessions WHERE run_id = ? AND capability = 'coordinator' AND state IN ('booting', 'working', 'stalled') LIMIT 1`,
          ).get(run.run_id) as { agent_name: string } | undefined;

          if (coordinator) {
            const msgId = `msg-wd-run-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
            const now = new Date().toISOString();

            db.prepare(
              `INSERT INTO messages (id, thread_id, from_agent, to_agent, subject, body, type, priority, payload, read, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            ).run(
              msgId,
              null,
              'watchdog',
              coordinator.agent_name,
              'All workers completed',
              `Run ${run.run_id}: all ${run.total_workers} workers have finished.`,
              'status',
              'high',
              JSON.stringify({
                run_id: run.run_id,
                total_workers: run.total_workers,
              }),
              0,
              now,
            );

            this.notifiedRunCompletions.add(run.run_id);
            log.info(
              `[Watchdog] Run completion detected: run=${run.run_id}, workers=${run.total_workers}, notified coordinator=${coordinator.agent_name}`,
            );
          }
        }
      }
    } catch (error) {
      log.error('[Watchdog] Failed to detect run completions:', error);
    }
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

    // Run completion detection: notify coordinators when all workers in a run finish
    this.detectRunCompletions();

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

    // Persistent-capability agents (coordinator, monitor) spend most of their time
    // idle waiting for mail. Use a much higher stale threshold to avoid false positives.
    const isPersistent = PERSISTENT_CAPABILITIES.has(agent.capability);
    if (isPersistent) {
      log.debug(
        `[Watchdog] Agent ${agent.agentName} has persistent capability '${agent.capability}', using extended thresholds (stale=${PERSISTENT_STALE_THRESHOLD_MS / 1000}s, zombie=${PERSISTENT_ZOMBIE_THRESHOLD_MS / 1000}s)`,
      );
    }

    const effectiveStaleThreshold = isPersistent
      ? PERSISTENT_STALE_THRESHOLD_MS
      : this.config.staleThresholdMs;
    const effectiveZombieThreshold = isPersistent
      ? PERSISTENT_ZOMBIE_THRESHOLD_MS
      : this.config.zombieThresholdMs;

    const result = this.applyProgressiveNudging(
      agent,
      state,
      stalledDuration,
      now,
      effectiveStaleThreshold,
      effectiveZombieThreshold,
    );

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
   * Detect if an agent has had recent activity using multiple signals:
   * 1. Output buffer changes (existing)
   * 2. Recent events in the events table
   * 3. Recent mail sent by the agent
   * All signals are OR'd together - any activity signal means the agent is active.
   */
  private detectActivity(agent: AgentProcess, state: AgentEscalationState, now: number): boolean {
    // If the agent just started (within the stale threshold), consider it active
    const agentAge = now - agent.createdAt.getTime();
    if (agentAge < this.config.staleThresholdMs) {
      return true;
    }

    // Signal 1: Check if the output buffer has grown since last check
    let hasOutputActivity = false;
    const bufferKey = `_bufLen_${agent.id}`;
    const prevLen = (state as unknown as Record<string, number>)[bufferKey] ?? 0;
    const curLen = agent.outputBuffer.length;
    (state as unknown as Record<string, number>)[bufferKey] = curLen;

    // If buffer wrapped (hit max), consider active if it changed at all
    if (curLen !== prevLen) {
      hasOutputActivity = true;
    }

    // Check last line content for changes
    if (!hasOutputActivity && curLen > 0) {
      const contentKey = `_lastLine_${agent.id}`;
      const lastLine = agent.outputBuffer[curLen - 1];
      const prevLine = (state as unknown as Record<string, string>)[contentKey] ?? '';
      (state as unknown as Record<string, string>)[contentKey] = lastLine;
      if (lastLine !== prevLine) {
        hasOutputActivity = true;
      }
    }

    if (hasOutputActivity) {
      return true;
    }

    // Signal 2: Check for recent events from this agent in the events table
    const hasEventActivity = this.checkRecentEvents(agent.agentName);
    if (hasEventActivity) {
      return true;
    }

    // Signal 3: Check for recent mail sent by this agent
    const hasMailActivity = this.checkRecentMail(agent.agentName);
    if (hasMailActivity) {
      return true;
    }

    return false;
  }

  /**
   * Check if the agent has emitted events in the last 5 minutes.
   */
  private checkRecentEvents(agentName: string): boolean {
    try {
      const db = getDatabase();
      const row = db
        .prepare(
          "SELECT COUNT(*) as count FROM events WHERE agent_name = ? AND created_at > datetime('now', '-5 minutes')",
        )
        .get(agentName) as { count: number } | undefined;
      return (row?.count ?? 0) > 0;
    } catch (error) {
      log.debug(`[Watchdog] Failed to check recent events for ${agentName}:`, error);
      return false;
    }
  }

  /**
   * Check if the agent has sent mail in the last 5 minutes.
   */
  private checkRecentMail(agentName: string): boolean {
    try {
      const db = getDatabase();
      const row = db
        .prepare(
          "SELECT COUNT(*) as count FROM messages WHERE from_agent = ? AND created_at > datetime('now', '-5 minutes')",
        )
        .get(agentName) as { count: number } | undefined;
      return (row?.count ?? 0) > 0;
    } catch (error) {
      log.debug(`[Watchdog] Failed to check recent mail for ${agentName}:`, error);
      return false;
    }
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
    staleThresholdOverride?: number,
    zombieThresholdOverride?: number,
  ): 'none' | 'warn' | 'nudge' | 'escalate' | 'terminate' {
    const staleThresholdMs = staleThresholdOverride ?? this.config.staleThresholdMs;
    const zombieThresholdMs = zombieThresholdOverride ?? this.config.zombieThresholdMs;

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
   * Applies debounce to prevent rapid successive nudges.
   */
  private handleNudge(agent: AgentProcess, state: AgentEscalationState, now: number): void {
    // Debounce: skip if a nudge was sent too recently
    if (state.lastNudgeAt && now - state.lastNudgeAt < this.config.nudgeDebounceMs) {
      log.info(`[Watchdog] Nudge debounced for agent ${agent.agentName}`);
      return;
    }

    const stalledMs = state.stalledSince ? now - state.stalledSince : 0;
    const stalledSec = Math.round(stalledMs / 1000);

    log.warn(
      `[Watchdog] LEVEL 2 NUDGE: Agent ${agent.agentName} (PID=${agent.pid}) nudged after ${stalledSec}s stall`,
    );

    // Send nudge prompt to the agent's terminal
    const nudgePrompt =
      'You appear to be stalled. Please continue with your current task or report your status.\n';
    agentProcessManager.write(agent.id, nudgePrompt);

    // Record the nudge timestamp for debounce
    state.lastNudgeAt = now;

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

    // Check for pending decision gate before escalating
    if (this.hasRecentDecisionGate(agent)) {
      log.info(
        `[Watchdog] Agent ${agent.agentName} is waiting on decision gate, skipping escalation`,
      );

      // Notify human about the pending decision instead of escalating
      this.sendDecisionGateNotification(agent);

      this.recordWatchdogEvent(agent, 'watchdog_escalate_skipped_decision_gate', 3, {
        stalledDurationMs: stalledMs,
        message: `Agent is waiting on decision gate, escalation skipped`,
      });
      return;
    }

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
   * Validates state transitions against the forward-only state machine.
   */
  private updateSessionState(sessionId: string, newState: string, escalationLevel: number): void {
    try {
      const db = getDatabase();
      const now = new Date().toISOString();

      // Validate state transition
      const currentSession = db.prepare('SELECT state FROM sessions WHERE id = ?').get(sessionId) as
        | { state: string }
        | undefined;

      if (currentSession && currentSession.state !== newState) {
        if (!validateStateTransition(currentSession.state, newState)) {
          log.error(
            `[Watchdog] Invalid state transition: ${currentSession.state} → ${newState} for session ${sessionId}`,
          );
          return;
        }
      }

      db.prepare(
        'UPDATE sessions SET state = ?, escalation_level = ?, stalled_at = COALESCE(stalled_at, ?), updated_at = ? WHERE id = ?',
      ).run(newState, escalationLevel, now, now, sessionId);
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
   * Check if the agent has sent a decision_gate message within the last hour.
   * If so, the agent is deliberately pausing for human input and should not be escalated.
   */
  private hasRecentDecisionGate(agent: AgentProcess): boolean {
    try {
      const db = getDatabase();
      const row = db
        .prepare(
          `SELECT id FROM messages WHERE from_agent = ? AND type = 'decision_gate' AND created_at > datetime('now', '-1 hour') LIMIT 1`,
        )
        .get(agent.agentName) as { id: string } | undefined;

      return !!row;
    } catch (error) {
      log.error(
        `[Watchdog] Failed to check decision gate for ${agent.agentName}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Send a notification to the human that an agent is waiting on a decision gate.
   * Uses the same mail pattern as escalation but with different content.
   */
  private sendDecisionGateNotification(agent: AgentProcess): void {
    try {
      const db = getDatabase();
      const msgId = `msg-wd-dg-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const now = new Date().toISOString();

      db.prepare(
        `INSERT INTO messages (id, thread_id, from_agent, to_agent, subject, body, type, priority, payload, read, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        msgId,
        null,
        'watchdog',
        'human',
        `DECISION NEEDED: Agent ${agent.agentName} needs your decision`,
        `Agent ${agent.agentName} (${agent.capability}, PID=${agent.pid}) is waiting on a decision gate. The agent has deliberately paused and requires human input to continue. Please review the pending decision and respond.`,
        'decision_needed',
        'high',
        JSON.stringify({
          agentId: agent.id,
          agentName: agent.agentName,
          capability: agent.capability,
          pid: agent.pid,
          reason: 'decision_gate_pending',
        }),
        0,
        now,
      );

      log.info(
        `[Watchdog] Decision gate notification sent to human for agent ${agent.agentName}`,
      );
    } catch (error) {
      log.error(
        `[Watchdog] Failed to send decision gate notification for ${agent.agentName}:`,
        error,
      );
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

  // ── Tier 1: AI Failure Triage ─────────────────────────────────────────

  /** Default number of output lines to analyze for triage */
  private triageLineCount = 50;
  /** Default triage timeout in milliseconds */
  private triageTimeoutMs = 30000;
  /** Active triage processes for cleanup */
  private activeTriageProcesses: Map<string, ChildProcess> = new Map();

  /**
   * Trigger Tier 1 AI triage for an agent error.
   * Analyzes the last N lines of agent output using Claude CLI
   * and classifies the error as retry/terminate/extend.
   *
   * Falls back to 'extend' on timeout (default 30s).
   */
  async triageAgentError(
    agentId: string,
    options?: { lineCount?: number; timeoutMs?: number },
  ): Promise<TriageResult> {
    const lineCount = options?.lineCount ?? this.triageLineCount;
    const timeoutMs = options?.timeoutMs ?? this.triageTimeoutMs;
    const startTime = Date.now();

    const agent = agentProcessManager.get(agentId);
    if (!agent) {
      log.warn(`[Watchdog T1] Agent ${agentId} not found for triage`);
      return {
        agentId,
        agentName: 'unknown',
        classification: 'extend',
        reason: 'Agent not found in process manager',
        linesAnalyzed: 0,
        triageDurationMs: Date.now() - startTime,
        timedOut: false,
        timestamp: new Date().toISOString(),
      };
    }

    // Extract last N lines of output
    const outputLines = agent.outputBuffer.slice(-lineCount);
    const outputText = outputLines.join('\n');
    const linesAnalyzed = outputLines.length;

    log.info(
      `[Watchdog T1] Starting AI triage for agent ${agent.agentName} (${linesAnalyzed} lines, timeout=${timeoutMs}ms)`,
    );

    try {
      const classification = await this.runAiTriage(agent, outputText, timeoutMs);
      const duration = Date.now() - startTime;

      const result: TriageResult = {
        agentId: agent.id,
        agentName: agent.agentName,
        classification: classification.classification,
        reason: classification.reason,
        linesAnalyzed,
        triageDurationMs: duration,
        timedOut: false,
        timestamp: new Date().toISOString(),
      };

      log.info(
        `[Watchdog T1] Triage complete for ${agent.agentName}: ${result.classification} (${duration}ms) - ${result.reason}`,
      );

      // Record triage event
      this.recordWatchdogEvent(agent, 'ai_triage', 1, {
        classification: result.classification,
        reason: result.reason,
        linesAnalyzed,
        triageDurationMs: duration,
        timedOut: false,
      });

      // Broadcast triage result to renderer
      this.broadcastTriageResult(result);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const isTimeout = duration >= timeoutMs - 100; // Within 100ms of timeout

      log.warn(
        `[Watchdog T1] Triage ${isTimeout ? 'timed out' : 'failed'} for ${agent.agentName} after ${duration}ms, falling back to 'extend': ${error}`,
      );

      const result: TriageResult = {
        agentId: agent.id,
        agentName: agent.agentName,
        classification: 'extend',
        reason: isTimeout
          ? `Triage timed out after ${Math.round(duration / 1000)}s, defaulting to extend`
          : `Triage failed: ${error instanceof Error ? error.message : String(error)}`,
        linesAnalyzed,
        triageDurationMs: duration,
        timedOut: isTimeout,
        timestamp: new Date().toISOString(),
      };

      this.recordWatchdogEvent(agent, 'ai_triage_fallback', 1, {
        classification: 'extend',
        reason: result.reason,
        linesAnalyzed,
        triageDurationMs: duration,
        timedOut: isTimeout,
        error: error instanceof Error ? error.message : String(error),
      });

      this.broadcastTriageResult(result);

      return result;
    }
  }

  /**
   * Run the AI triage classification using Claude CLI.
   * Returns the classification and reasoning.
   */
  private runAiTriage(
    agent: AgentProcess,
    outputText: string,
    timeoutMs: number,
  ): Promise<{ classification: TriageClassification; reason: string }> {
    return new Promise((resolve, reject) => {
      const cliResult = detectClaudeCli(false);
      if (!cliResult.found || !cliResult.path) {
        reject(new Error('Claude CLI not found'));
        return;
      }

      const prompt = `You are an AI failure triage system. Analyze the following agent output and classify the error.

Agent: ${agent.agentName} (${agent.capability})
PID: ${agent.pid}

Last output:
\`\`\`
${outputText.substring(0, 4000)}
\`\`\`

Classify this agent's state as ONE of:
- "retry" - Transient error that may resolve on retry (network timeout, rate limit, temporary file lock)
- "terminate" - Fatal error that won't recover (invalid config, missing permissions, corrupted state, auth failure)
- "extend" - Agent is working but slow, or error is ambiguous - give more time

Respond with ONLY a JSON object (no markdown, no explanation):
{"classification": "retry|terminate|extend", "reason": "brief explanation"}`;

      const args = ['--print', prompt, '--output-format', 'text', '--max-turns', '1'];

      let stdout = '';
      let stderr = '';
      let settled = false;

      const child = execFile(
        cliResult.path,
        args,
        {
          timeout: timeoutMs,
          maxBuffer: 1024 * 1024,
          env: { ...process.env },
        },
        (error, stdoutData, stderrData) => {
          // Clean up tracking
          this.activeTriageProcesses.delete(agent.id);

          if (settled) return;
          settled = true;

          stdout = stdoutData || '';
          stderr = stderrData || '';

          if (error) {
            reject(error);
            return;
          }

          // Parse the classification from Claude's response
          try {
            const parsed = this.parseTriageResponse(stdout);
            resolve(parsed);
          } catch (parseError) {
            reject(parseError);
          }
        },
      );

      // Track active triage process for cleanup
      if (child) {
        this.activeTriageProcesses.set(agent.id, child);
      }

      // Explicit timeout fallback (in case execFile timeout doesn't fire)
      setTimeout(() => {
        if (!settled) {
          settled = true;
          this.activeTriageProcesses.delete(agent.id);
          if (child && !child.killed) {
            child.kill('SIGTERM');
          }
          reject(new Error(`Triage timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs + 500);
    });
  }

  /**
   * Parse the triage response from Claude CLI output.
   */
  private parseTriageResponse(output: string): {
    classification: TriageClassification;
    reason: string;
  } {
    const trimmed = output.trim();

    // Try to extract JSON from the response
    const jsonMatch = trimmed.match(/\{[\s\S]*?"classification"[\s\S]*?\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        const classification = parsed.classification?.toLowerCase?.();
        if (
          classification === 'retry' ||
          classification === 'terminate' ||
          classification === 'extend'
        ) {
          return {
            classification,
            reason: parsed.reason || 'No reason provided',
          };
        }
      } catch {
        // Fall through to text parsing
      }
    }

    // Text-based fallback parsing
    const lower = trimmed.toLowerCase();
    if (lower.includes('terminate') || lower.includes('fatal') || lower.includes('unrecoverable')) {
      return {
        classification: 'terminate',
        reason: 'Parsed from text response: fatal/unrecoverable error detected',
      };
    }
    if (lower.includes('retry') || lower.includes('transient') || lower.includes('try again')) {
      return {
        classification: 'retry',
        reason: 'Parsed from text response: transient error detected',
      };
    }

    // Default to extend if we can't parse
    return {
      classification: 'extend',
      reason: 'Could not parse classification, defaulting to extend',
    };
  }

  /**
   * Broadcast a triage result to all renderer windows.
   */
  private broadcastTriageResult(result: TriageResult): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('watchdog:triage-result', result);
      }
    }
  }

  /**
   * Get the triage configuration.
   */
  getTriageConfig(): { lineCount: number; timeoutMs: number } {
    return {
      lineCount: this.triageLineCount,
      timeoutMs: this.triageTimeoutMs,
    };
  }

  /**
   * Update the triage configuration.
   */
  updateTriageConfig(updates: { lineCount?: number; timeoutMs?: number }): void {
    if (updates.lineCount !== undefined) {
      this.triageLineCount = Math.max(10, Math.min(200, updates.lineCount));
    }
    if (updates.timeoutMs !== undefined) {
      this.triageTimeoutMs = Math.max(5000, Math.min(120000, updates.timeoutMs));
    }
    log.info(
      `[Watchdog T1] Triage config updated: lineCount=${this.triageLineCount}, timeoutMs=${this.triageTimeoutMs}`,
    );
  }

  // ── Tier 2: Monitor Agent Patrol ──────────────────────────────────────

  /** Patrol interval handle */
  private patrolIntervalHandle: ReturnType<typeof setInterval> | null = null;
  /** Default patrol interval (60s) */
  private patrolIntervalMs = 60000;
  /** Patrol check count */
  private patrolCount = 0;
  /** Last patrol timestamp */
  private lastPatrolAt: string | null = null;
  /** Patrol history (last N results) */
  private patrolHistory: PatrolResult[] = [];
  private maxPatrolHistory = 50;

  /**
   * Start the Tier 2 monitor agent patrol.
   * Runs continuously as a sentinel, checking all active agents
   * and generating health reports.
   */
  startPatrol(intervalMs?: number): void {
    if (this.patrolIntervalHandle) {
      log.warn('[Watchdog T2] Patrol already running, stopping first...');
      this.stopPatrol();
    }

    this.patrolIntervalMs = intervalMs ?? this.patrolIntervalMs;

    log.info(`[Watchdog T2] Starting monitor patrol: interval=${this.patrolIntervalMs}ms`);

    // Run first patrol immediately
    this.runPatrol();

    // Schedule recurring patrols
    this.patrolIntervalHandle = setInterval(() => {
      this.runPatrol();
    }, this.patrolIntervalMs);
  }

  /**
   * Stop the monitor patrol.
   */
  stopPatrol(): void {
    if (this.patrolIntervalHandle) {
      clearInterval(this.patrolIntervalHandle);
      this.patrolIntervalHandle = null;
      log.info('[Watchdog T2] Monitor patrol stopped');
    }
  }

  /**
   * Check if the monitor patrol is running.
   */
  isPatrolRunning(): boolean {
    return this.patrolIntervalHandle !== null;
  }

  /**
   * Get the patrol status.
   */
  getPatrolStatus(): {
    running: boolean;
    intervalMs: number;
    patrolCount: number;
    lastPatrolAt: string | null;
    historySize: number;
  } {
    return {
      running: this.isPatrolRunning(),
      intervalMs: this.patrolIntervalMs,
      patrolCount: this.patrolCount,
      lastPatrolAt: this.lastPatrolAt,
      historySize: this.patrolHistory.length,
    };
  }

  /**
   * Get the patrol history.
   */
  getPatrolHistory(limit?: number): PatrolResult[] {
    const count = limit ?? this.patrolHistory.length;
    return this.patrolHistory.slice(-count);
  }

  /**
   * Run a single patrol check across all active agents.
   * Generates a health report for each agent and flags anomalies.
   */
  runPatrol(): PatrolResult {
    const now = Date.now();
    this.patrolCount++;
    this.lastPatrolAt = new Date(now).toISOString();

    const agents = agentProcessManager.getAll();
    const reports: PatrolHealthReport[] = [];

    for (const agent of agents) {
      const report = this.generateHealthReport(agent, now);
      reports.push(report);
    }

    const healthyCount = reports.filter((r) => r.healthy).length;
    const unhealthyCount = reports.filter((r) => !r.healthy).length;
    const anomalyCount = reports.reduce((sum, r) => sum + r.anomalies.length, 0);

    const patrolResult: PatrolResult = {
      patrolId: `patrol-${this.patrolCount}-${Date.now()}`,
      agentReports: reports,
      totalAgents: agents.length,
      healthyAgents: healthyCount,
      unhealthyAgents: unhealthyCount,
      anomalyCount,
      timestamp: new Date(now).toISOString(),
    };

    // Store in history
    this.patrolHistory.push(patrolResult);
    if (this.patrolHistory.length > this.maxPatrolHistory) {
      this.patrolHistory.shift();
    }

    // Log patrol summary
    if (anomalyCount > 0 || unhealthyCount > 0) {
      log.warn(
        `[Watchdog T2] Patrol #${this.patrolCount}: ${agents.length} agents, ${healthyCount} healthy, ${unhealthyCount} unhealthy, ${anomalyCount} anomalies`,
      );
    } else {
      log.debug(`[Watchdog T2] Patrol #${this.patrolCount}: ${agents.length} agents, all healthy`);
    }

    // Broadcast patrol result to renderer
    this.broadcastPatrolResult(patrolResult);

    // Record event if there are anomalies
    if (anomalyCount > 0) {
      this.recordPatrolEvent(patrolResult);
    }

    return patrolResult;
  }

  /**
   * Generate a health report for a single agent.
   */
  private generateHealthReport(agent: AgentProcess, now: number): PatrolHealthReport {
    const pidAlive = this.checkPidAlive(agent.pid);
    const ptyRunning = agent.isRunning;
    const escalationState = this.escalationStates.get(agent.id);
    const escalationLevel: EscalationLevel = escalationState?.level ?? 0;
    const stalledDurationMs = escalationState?.stalledSince
      ? now - escalationState.stalledSince
      : null;

    // Detect anomalies
    const anomalies: string[] = [];

    // Anomaly: Process dead but marked running
    if (!pidAlive && agent.isRunning) {
      anomalies.push('Process PID is dead but agent is marked as running');
    }

    // Anomaly: PTY not running
    if (!ptyRunning && agent.isRunning) {
      anomalies.push('PTY process is not running but agent is marked as running');
    }

    // Anomaly: High escalation level
    if (escalationLevel >= 2) {
      anomalies.push(`Escalation level ${escalationLevel} - agent may be stalled`);
    }

    // Anomaly: Empty output buffer (agent may not be producing output)
    if (agent.outputBuffer.length === 0 && now - agent.createdAt.getTime() > 60000) {
      anomalies.push('No output produced after 60s of running');
    }

    // Anomaly: Very long stall
    if (stalledDurationMs && stalledDurationMs > this.config.staleThresholdMs) {
      anomalies.push(
        `Stalled for ${Math.round(stalledDurationMs / 1000)}s (threshold: ${Math.round(this.config.staleThresholdMs / 1000)}s)`,
      );
    }

    const healthy = pidAlive && ptyRunning && anomalies.length === 0;

    return {
      agentId: agent.id,
      agentName: agent.agentName,
      capability: agent.capability,
      pid: agent.pid,
      pidAlive,
      ptyRunning,
      outputLineCount: agent.outputBuffer.length,
      stalledDurationMs,
      escalationLevel,
      anomalies,
      healthy,
      timestamp: new Date(now).toISOString(),
    };
  }

  /**
   * Broadcast patrol result to all renderer windows.
   */
  private broadcastPatrolResult(result: PatrolResult): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('watchdog:patrol-result', result);
      }
    }
  }

  /**
   * Record a patrol event with anomalies in the events table.
   */
  private recordPatrolEvent(result: PatrolResult): void {
    try {
      const db = getDatabase();
      const id = `evt-patrol-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const anomalyAgents = result.agentReports
        .filter((r) => r.anomalies.length > 0)
        .map((r) => ({ name: r.agentName, anomalies: r.anomalies }));

      db.prepare(
        `INSERT INTO events (id, run_id, agent_name, session_id, event_type, tool_name, tool_args, tool_duration_ms, level, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        null,
        'watchdog-patrol',
        null,
        'patrol_anomaly',
        null,
        null,
        null,
        'warn',
        JSON.stringify({
          patrolId: result.patrolId,
          totalAgents: result.totalAgents,
          healthyAgents: result.healthyAgents,
          unhealthyAgents: result.unhealthyAgents,
          anomalyCount: result.anomalyCount,
          anomalyAgents,
        }),
      );
    } catch (error) {
      log.error('[Watchdog T2] Failed to record patrol event:', error);
    }
  }
}

// Singleton instance
export const watchdogService = new WatchdogService();
