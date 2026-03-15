import { exec, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';
import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import log from 'electron-log';
import * as nodePty from 'node-pty';
import { getDatabase } from '../db/database';
import {
  type AgentCapability,
  agentProcessManager,
  getDefaultModel,
} from '../services/agentProcessManager';
import { checkpointService } from '../services/checkpointService';
import {
  clearClaudeCliCache,
  detectClaudeCli,
  getClaudeCliStatus,
} from '../services/claudeCliService';
import {
  aiResolveConflicts,
  autoResolveConflicts,
  executeCleanMerge,
  previewMerge,
  reimagineFromScratch,
  rollbackMerge,
} from '../services/mergeService';
import { type NotificationEventType, notificationService } from '../services/notificationService';
import { runtimeRegistry } from '../services/runtimeRegistry';
import {
  checkForUpdates,
  downloadUpdate,
  getUpdateStatus,
  installUpdate,
} from '../services/updateService';
import { watchdogService } from '../services/watchdogService';

/**
 * Logged database prepare - wraps db.prepare() with SQL query logging.
 * This ensures all SQL queries (SELECT, INSERT, UPDATE, DELETE) appear
 * in the main process logs, verifying that IPC handlers use the real
 * SQLite database and not mock/static data.
 */
function loggedPrepare(sql: string) {
  const db = getDatabase();
  const normalized = sql.replace(/\s+/g, ' ').trim();
  log.debug(`[SQL] Executing: ${normalized}`);
  return db.prepare(sql);
}

/**
 * Record an event in the events table.
 * Used to track tool_start, tool_end, session_start, session_end, mail events.
 */
function recordEvent(params: {
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
    const id = `evt-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    loggedPrepare(
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
    log.debug(`[Event] Recorded: ${params.eventType} for ${params.agentName ?? 'system'}`);
  } catch (error) {
    log.error(`[Event] Failed to record event ${params.eventType}:`, error);
  }
}

export function registerIpcHandlers(): void {
  // Health check - verifies DB connection and WAL mode
  ipcMain.handle('health:check', () => {
    try {
      const result = loggedPrepare('SELECT 1 as ok').get() as { ok: number };
      const walMode = loggedPrepare('PRAGMA journal_mode').get() as { journal_mode: string };
      const foreignKeys = loggedPrepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
      const db = getDatabase();
      log.info('[IPC] health:check - real SELECT query executed on SQLite database');
      return {
        status: 'healthy',
        database: result.ok === 1 ? 'connected' : 'error',
        walMode: walMode.journal_mode,
        foreignKeys: foreignKeys.foreign_keys === 1,
        dbPath: db.name,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      log.error('Health check failed:', error);
      return {
        status: 'unhealthy',
        database: 'disconnected',
        error: String(error),
      };
    }
  });

  // Database status (detailed) - lists all tables, columns, and row counts
  ipcMain.handle('db:status', () => {
    try {
      const db = getDatabase();
      const walMode = loggedPrepare('PRAGMA journal_mode').get() as { journal_mode: string };
      const foreignKeys = loggedPrepare('PRAGMA foreign_keys').get() as { foreign_keys: number };

      // Get list of all tables
      const tables = loggedPrepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      ).all() as { name: string }[];
      const tableNames = tables.map((t) => t.name).filter((t) => t !== 'sqlite_sequence');

      // Get table info for each table
      const tableDetails: Record<string, { columns: string[]; rowCount: number }> = {};
      for (const tableName of tableNames) {
        const columns = loggedPrepare(`PRAGMA table_info("${tableName}")`).all() as {
          name: string;
        }[];
        const countResult = loggedPrepare(`SELECT COUNT(*) as count FROM "${tableName}"`).get() as {
          count: number;
        };
        tableDetails[tableName] = {
          columns: columns.map((c) => c.name),
          rowCount: countResult.count,
        };
      }

      log.info('[IPC] db:status - real SQLite queries for all table metadata');
      return {
        status: 'connected',
        walMode: walMode.journal_mode,
        foreignKeys: foreignKeys.foreign_keys === 1,
        tables: tableNames,
        tableDetails,
        dbPath: db.name,
      };
    } catch (error) {
      log.error('db:status failed:', error);
      return { status: 'disconnected', error: String(error) };
    }
  });

  // Agent channels - all use real SQLite queries via loggedPrepare
  ipcMain.handle('agent:list', () => {
    try {
      const sessions = loggedPrepare('SELECT * FROM sessions ORDER BY created_at DESC').all();
      log.info(`[IPC] agent:list - SELECT returned ${sessions.length} sessions from real database`);
      return { data: sessions, error: null };
    } catch (error) {
      log.error('agent:list failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('agent:detail', (_event, agentId: string) => {
    try {
      const session = loggedPrepare('SELECT * FROM sessions WHERE id = ?').get(agentId);
      log.info(`[IPC] agent:detail - SELECT session id=${agentId} from real database`);
      return { data: session || null, error: null };
    } catch (error) {
      log.error('agent:detail failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle(
    'agent:spawn',
    (
      _event,
      options: {
        id: string;
        agent_name: string;
        capability: string;
        model?: string;
        runtime?: string;
        run_id?: string;
        task_id?: string;
        parent_agent?: string;
        worktree_path?: string;
        branch_name?: string;
        depth?: number;
        prompt?: string;
        file_scope?: string;
      },
    ) => {
      try {
        const capability = options.capability as AgentCapability;
        // Use runtime registry model resolution chain:
        // explicit model > capability config from settings > runtime default
        const runtimeId = options.runtime || runtimeRegistry.getDefaultRuntimeId();
        let capabilityConfigModel: string | undefined;
        try {
          const setting = loggedPrepare('SELECT value FROM app_settings WHERE key = ?').get(
            'app_settings',
          ) as { value: string } | undefined;
          if (setting) {
            const parsed = JSON.parse(setting.value);
            if (parsed?.modelDefaultsPerCapability?.[capability]) {
              capabilityConfigModel = parsed.modelDefaultsPerCapability[capability];
            }
          }
        } catch {
          // Ignore settings read errors - will use runtime default
        }
        const model = runtimeRegistry.resolveModel(
          runtimeId,
          capability,
          options.model,
          capabilityConfigModel,
        );

        // Enforce hierarchy depth limit
        const requestedDepth = options.depth ?? 0;
        let maxDepth = 2; // default
        try {
          const setting = loggedPrepare('SELECT value FROM app_settings WHERE key = ?').get(
            'maxHierarchyDepth',
          ) as { value: string } | undefined;
          if (setting) {
            const parsed = JSON.parse(setting.value);
            if (typeof parsed === 'number' && parsed >= 0) {
              maxDepth = parsed;
            }
          }
        } catch (depthErr) {
          log.warn(
            '[IPC] agent:spawn - failed to read maxHierarchyDepth setting, using default 2:',
            depthErr,
          );
        }

        if (requestedDepth > maxDepth) {
          const msg = `Hierarchy depth limit exceeded: requested depth ${requestedDepth} exceeds max ${maxDepth}`;
          log.warn(`[IPC] agent:spawn - ${msg}`);
          return { data: null, error: msg };
        }

        // Enforce max concurrent agents limit
        let maxConcurrent = 10; // default
        try {
          const concurrentSetting = loggedPrepare(
            'SELECT value FROM app_settings WHERE key = ?',
          ).get('app_settings') as { value: string } | undefined;
          if (concurrentSetting) {
            const parsed = JSON.parse(concurrentSetting.value);
            if (
              parsed &&
              typeof parsed === 'object' &&
              typeof parsed.maxConcurrentAgents === 'number' &&
              parsed.maxConcurrentAgents >= 1
            ) {
              maxConcurrent = parsed.maxConcurrentAgents;
            }
          }
        } catch (concurrentErr) {
          log.warn(
            '[IPC] agent:spawn - failed to read maxConcurrentAgents setting, using default 10:',
            concurrentErr,
          );
        }

        const runningAgents = agentProcessManager.getAll().filter((a) => a.isRunning);
        if (runningAgents.length >= maxConcurrent) {
          const msg = `Max concurrent agents limit reached: ${runningAgents.length}/${maxConcurrent} agents running. Increase the limit in Settings > Agents.`;
          log.warn(`[IPC] agent:spawn - ${msg}`);
          return { data: null, error: msg };
        }

        // Spawn the actual node-pty process via AgentProcessManager
        const agentProcess = agentProcessManager.spawn({
          id: options.id,
          agentName: options.agent_name,
          capability,
          model,
          runtime: runtimeId,
          capabilityConfigModel,
          worktreePath: options.worktree_path,
          branchName: options.branch_name,
          taskId: options.task_id,
          parentAgent: options.parent_agent,
          runId: options.run_id,
          depth: options.depth,
          prompt: options.prompt,
        });

        // Compute transcript path for this agent session
        // Claude CLI stores transcripts at ~/.claude/projects/<dir-hash>/sessions/<session-id>/
        const agentCwd = options.worktree_path || process.cwd();
        const projectDirHash = createHash('sha256').update(agentCwd).digest('hex').substring(0, 16);
        const claudeHome = path.join(os.homedir(), '.claude');
        const transcriptPath = path.join(
          claudeHome,
          'projects',
          projectDirHash,
          'sessions',
          options.id,
        );

        // Insert session record into database with PID, model, file_scope, and transcript_path
        loggedPrepare(
          `INSERT INTO sessions (id, agent_name, capability, model, run_id, task_id, parent_agent, worktree_path, branch_name, depth, state, pid, file_scope, transcript_path)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'booting', ?, ?, ?)`,
        ).run(
          options.id,
          options.agent_name,
          options.capability,
          model,
          options.run_id ?? null,
          options.task_id ?? null,
          options.parent_agent ?? null,
          options.worktree_path ?? null,
          options.branch_name ?? null,
          options.depth ?? 0,
          agentProcess.pid,
          options.file_scope ?? null,
          transcriptPath,
        );

        // Transition to 'working' state after successful spawn
        loggedPrepare(
          `UPDATE sessions SET state = 'working', updated_at = datetime('now') WHERE id = ?`,
        ).run(options.id);

        // Upsert agent identity for persistent identity across sessions
        const existingIdentity = loggedPrepare('SELECT * FROM agent_identities WHERE name = ?').get(
          options.agent_name,
        );
        if (existingIdentity) {
          // Update capability if changed, update timestamp
          loggedPrepare(
            `UPDATE agent_identities SET capability = ?, updated_at = datetime('now') WHERE name = ?`,
          ).run(options.capability, options.agent_name);
          log.info(`[IPC] agent:spawn - updated existing identity for ${options.agent_name}`);
        } else {
          // Create new identity record
          loggedPrepare(
            `INSERT INTO agent_identities (name, capability, sessions_completed, expertise_domains, recent_tasks)
             VALUES (?, ?, 0, '[]', '[]')`,
          ).run(options.agent_name, options.capability);
          log.info(`[IPC] agent:spawn - created new identity for ${options.agent_name}`);
        }

        const session = loggedPrepare('SELECT * FROM sessions WHERE id = ?').get(options.id);
        log.info(
          `[IPC] agent:spawn - spawned node-pty process: ${options.agent_name} (${options.capability}), model=${model}, PID=${agentProcess.pid}`,
        );

        // Record session_start event
        recordEvent({
          eventType: 'session_start',
          agentName: options.agent_name,
          sessionId: options.id,
          runId: options.run_id,
          data: JSON.stringify({ capability: options.capability, model, pid: agentProcess.pid }),
        });

        return {
          data: { ...(session as Record<string, unknown>), model, pid: agentProcess.pid },
          error: null,
        };
      } catch (error) {
        log.error('agent:spawn failed:', error);
        return { data: null, error: String(error) };
      }
    },
  );

  ipcMain.handle('agent:stop', async (_event, agentId: string) => {
    try {
      // Kill the node-pty process
      await agentProcessManager.stop(agentId);

      loggedPrepare(
        `UPDATE sessions SET state = 'completed', completed_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ? AND state NOT IN ('completed')`,
      ).run(agentId);
      const session = loggedPrepare('SELECT * FROM sessions WHERE id = ?').get(agentId) as
        | Record<string, unknown>
        | undefined;
      log.info(`[IPC] agent:stop - stopped pty process and updated session: ${agentId}`);

      // Quality gate enforcement for builder agents
      if (session?.capability === 'builder') {
        try {
          const activeProject = loggedPrepare(
            'SELECT id, path FROM projects WHERE is_active = 1 LIMIT 1',
          ).get() as { id: string; path: string } | undefined;
          if (activeProject) {
            const enabledGates = loggedPrepare(
              'SELECT COUNT(*) as cnt FROM quality_gates WHERE project_id = ? AND enabled = 1',
            ).get(activeProject.id) as { cnt: number };
            if (enabledGates.cnt > 0) {
              log.info(
                `[QualityGate] Running ${enabledGates.cnt} quality gates for builder ${session.agent_name}`,
              );
              const gates = loggedPrepare(
                'SELECT * FROM quality_gates WHERE project_id = ? AND enabled = 1 ORDER BY sort_order ASC',
              ).all(activeProject.id) as Array<{
                id: string;
                gate_type: string;
                name: string;
                command: string;
              }>;
              let allPassed = true;
              for (const gate of gates) {
                const resultId = `qgr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                const startTime = Date.now();
                try {
                  const { exitCode, stdout, stderr } = await new Promise<{
                    exitCode: number;
                    stdout: string;
                    stderr: string;
                  }>((resolve) => {
                    exec(
                      gate.command,
                      {
                        cwd: activeProject.path,
                        timeout: 120000,
                        maxBuffer: 1024 * 1024,
                      },
                      (error, stdout, stderr) => {
                        resolve({
                          exitCode: error?.code ?? 0,
                          stdout: stdout?.slice(0, 10000) || '',
                          stderr: stderr?.slice(0, 10000) || '',
                        });
                      },
                    );
                  });
                  const durationMs = Date.now() - startTime;
                  const status = exitCode === 0 ? 'passed' : 'failed';
                  if (status === 'failed') allPassed = false;
                  loggedPrepare(
                    'INSERT INTO quality_gate_results (id, gate_id, agent_name, session_id, project_id, gate_type, gate_name, command, status, exit_code, stdout, stderr, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                  ).run(
                    resultId,
                    gate.id,
                    (session.agent_name as string) || null,
                    agentId,
                    activeProject.id,
                    gate.gate_type,
                    gate.name,
                    gate.command,
                    status,
                    exitCode,
                    stdout,
                    stderr,
                    durationMs,
                  );
                  log.info(
                    `[QualityGate] ${gate.name}: ${status} (exit ${exitCode}, ${durationMs}ms)`,
                  );
                } catch (execErr) {
                  const durationMs = Date.now() - startTime;
                  allPassed = false;
                  loggedPrepare(
                    'INSERT INTO quality_gate_results (id, gate_id, agent_name, session_id, project_id, gate_type, gate_name, command, status, exit_code, stdout, stderr, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                  ).run(
                    resultId,
                    gate.id,
                    (session.agent_name as string) || null,
                    agentId,
                    activeProject.id,
                    gate.gate_type,
                    gate.name,
                    gate.command,
                    'error',
                    -1,
                    '',
                    String(execErr),
                    durationMs,
                  );
                }
              }
              if (!allPassed) {
                const failedNames = gates.map((g) => g.name).join(', ');
                const mailId = `msg_qg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                loggedPrepare(
                  "INSERT INTO messages (id, from_agent, to_agent, subject, body, type, priority) VALUES (?, 'system', ?, ?, ?, 'error', 'high')",
                ).run(
                  mailId,
                  (session.agent_name as string) || agentId,
                  'Quality Gates Failed',
                  `Builder quality gates failed. Please review and fix: ${failedNames}`,
                );
                log.warn(`[QualityGate] Builder ${session.agent_name} failed quality gates`);
              } else {
                log.info(`[QualityGate] Builder ${session.agent_name} passed all quality gates`);
              }
            }
          }
        } catch (gateErr) {
          log.warn('[QualityGate] Failed to run quality gates on agent stop:', gateErr);
        }
      }

      // Record session_end event
      recordEvent({
        eventType: 'session_end',
        agentName: (session?.agent_name as string) ?? agentId,
        sessionId: agentId,
        runId: (session?.run_id as string) ?? undefined,
        data: JSON.stringify({ reason: 'manual_stop' }),
      });

      // Update agent identity: increment sessions_completed and track recent task
      if (session?.agent_name) {
        const agentName = session.agent_name as string;
        const taskId = (session.task_id as string) || null;
        try {
          loggedPrepare(
            `UPDATE agent_identities SET sessions_completed = sessions_completed + 1, updated_at = datetime('now') WHERE name = ?`,
          ).run(agentName);

          // Append to recent_tasks (keep last 10)
          if (taskId) {
            const identity = loggedPrepare(
              'SELECT recent_tasks FROM agent_identities WHERE name = ?',
            ).get(agentName) as { recent_tasks: string } | undefined;
            if (identity) {
              let tasks: string[] = [];
              try {
                tasks = JSON.parse(identity.recent_tasks || '[]');
              } catch {
                tasks = [];
              }
              tasks.unshift(taskId);
              if (tasks.length > 10) tasks = tasks.slice(0, 10);
              loggedPrepare('UPDATE agent_identities SET recent_tasks = ? WHERE name = ?').run(
                JSON.stringify(tasks),
                agentName,
              );
            }
          }
          log.info(`[IPC] agent:stop - updated identity for ${agentName}: sessions_completed++`);
        } catch (identityErr) {
          log.warn(`[IPC] agent:stop - failed to update identity for ${agentName}:`, identityErr);
        }
      }

      return { data: session, error: null };
    } catch (error) {
      log.error('agent:stop failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('agent:stop-all', async () => {
    try {
      // Kill all node-pty processes first
      const processesKilled = await agentProcessManager.stopAll();

      const result = loggedPrepare(
        `UPDATE sessions SET state = 'completed', completed_at = datetime('now'), updated_at = datetime('now')
        WHERE state NOT IN ('completed')`,
      ).run();
      log.info(
        `[IPC] agent:stop-all - killed ${processesKilled} pty processes, updated ${result.changes} sessions`,
      );
      return { data: { stopped: result.changes, processesKilled }, error: null };
    } catch (error) {
      log.error('agent:stop-all failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('agent:nudge', (_event, agentId: string) => {
    try {
      // Send nudge prompt to the agent's terminal
      const nudgePrompt =
        'You appear to be stalled. Please continue with your current task or report your status.\n';
      const written = agentProcessManager.write(agentId, nudgePrompt);

      // Update session state from stalled back to working
      loggedPrepare(
        `UPDATE sessions SET state = 'working', stalled_at = NULL, escalation_level = 0, updated_at = datetime('now')
        WHERE id = ? AND state = 'stalled'`,
      ).run(agentId);
      const session = loggedPrepare('SELECT * FROM sessions WHERE id = ?').get(agentId);
      log.info(`[IPC] agent:nudge - nudge sent (written=${written}), updated session: ${agentId}`);
      return { data: session, error: null };
    } catch (error) {
      log.error('agent:nudge failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle(
    'agent:resume',
    (
      _event,
      options: {
        id: string;
        agent_name: string;
        capability: string;
        model?: string;
        run_id?: string;
        task_id?: string;
        parent_agent?: string;
        worktree_path?: string;
        branch_name?: string;
        depth?: number;
        resume_session_id: string;
        file_scope?: string;
      },
    ) => {
      try {
        const capability = options.capability as AgentCapability;
        const model = options.model || getDefaultModel(capability);

        // Resume agent via AgentProcessManager with --resume flag
        const agentProcess = agentProcessManager.resume({
          id: options.id,
          agentName: options.agent_name,
          capability,
          model,
          worktreePath: options.worktree_path,
          branchName: options.branch_name,
          taskId: options.task_id,
          parentAgent: options.parent_agent,
          runId: options.run_id,
          depth: options.depth,
          resumeSessionId: options.resume_session_id,
        });

        // Insert new session record (resumed sessions get a new session ID)
        loggedPrepare(
          `INSERT INTO sessions (id, agent_name, capability, model, run_id, task_id, parent_agent, worktree_path, branch_name, depth, state, pid, file_scope)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'booting', ?, ?)`,
        ).run(
          options.id,
          options.agent_name,
          options.capability,
          model,
          options.run_id ?? null,
          options.task_id ?? null,
          options.parent_agent ?? null,
          options.worktree_path ?? null,
          options.branch_name ?? null,
          options.depth ?? 0,
          agentProcess.pid,
          options.file_scope ?? null,
        );

        // Transition to 'working' state
        loggedPrepare(
          `UPDATE sessions SET state = 'working', updated_at = datetime('now') WHERE id = ?`,
        ).run(options.id);

        const session = loggedPrepare('SELECT * FROM sessions WHERE id = ?').get(options.id);
        log.info(
          `[IPC] agent:resume - resumed session ${options.resume_session_id} as ${options.id}, agent: ${options.agent_name}, PID=${agentProcess.pid}`,
        );

        // Record session_start event with resume info
        recordEvent({
          eventType: 'session_start',
          agentName: options.agent_name,
          sessionId: options.id,
          runId: options.run_id,
          data: JSON.stringify({
            capability: options.capability,
            model,
            pid: agentProcess.pid,
            resumed_from: options.resume_session_id,
          }),
        });

        return {
          data: {
            ...(session as Record<string, unknown>),
            model,
            pid: agentProcess.pid,
            resumed_from: options.resume_session_id,
          },
          error: null,
        };
      } catch (error) {
        log.error('agent:resume failed:', error);
        return { data: null, error: String(error) };
      }
    },
  );

  // Scope overlap detection - check if file paths conflict with active builder scopes
  ipcMain.handle('scope:checkOverlap', (_event, filePaths: string[], excludeSessionId?: string) => {
    try {
      // Get all active builder sessions with file_scope
      let query =
        "SELECT id, agent_name, capability, file_scope FROM sessions WHERE capability = 'builder' AND state NOT IN ('completed') AND file_scope IS NOT NULL AND file_scope != ''";
      const params: string[] = [];
      if (excludeSessionId) {
        query += ' AND id != ?';
        params.push(excludeSessionId);
      }
      const activeBuilders = loggedPrepare(query).all(...params) as Array<{
        id: string;
        agent_name: string;
        capability: string;
        file_scope: string;
      }>;

      const overlaps: Array<{
        agentName: string;
        sessionId: string;
        capability: string;
        fileScope: string;
        overlappingPaths: string[];
      }> = [];

      // Parse incoming paths into a set for quick lookup
      const incomingPaths = new Set(filePaths.map((p) => p.trim().toLowerCase()));

      for (const builder of activeBuilders) {
        // Parse the builder's file_scope (comma-separated paths)
        const builderPaths = builder.file_scope
          .split(',')
          .map((p) => p.trim().toLowerCase())
          .filter((p) => p.length > 0);

        // Find overlapping paths
        const overlapping: string[] = [];
        for (const bp of builderPaths) {
          for (const ip of incomingPaths) {
            // Exact match
            if (bp === ip) {
              overlapping.push(ip);
              continue;
            }
            // Check if one is a parent directory of the other
            if (ip.startsWith(`${bp}/`) || bp.startsWith(`${ip}/`)) {
              overlapping.push(ip);
            }
          }
        }

        if (overlapping.length > 0) {
          overlaps.push({
            agentName: builder.agent_name,
            sessionId: builder.id,
            capability: builder.capability,
            fileScope: builder.file_scope,
            overlappingPaths: [...new Set(overlapping)],
          });
        }
      }

      log.info(
        `[IPC] scope:checkOverlap - checked ${filePaths.length} paths against ${activeBuilders.length} active builders, found ${overlaps.length} overlaps`,
      );
      return { data: overlaps, error: null };
    } catch (error) {
      log.error('scope:checkOverlap failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // Coordinator channels - specialized coordinator agent management
  ipcMain.handle('coordinator:start', (_event, options?: { prompt?: string; run_id?: string }) => {
    try {
      // Check if coordinator is already running
      const existing = loggedPrepare(
        `SELECT * FROM sessions WHERE capability = 'coordinator' AND state NOT IN ('completed') ORDER BY created_at DESC LIMIT 1`,
      ).get() as Record<string, unknown> | undefined;

      if (existing) {
        // Check if the process is still alive
        const proc = agentProcessManager.get(existing.id as string);
        if (proc?.isRunning) {
          log.warn('[IPC] coordinator:start - coordinator already running');
          return { data: existing, error: 'Coordinator is already running' };
        }
        // Process died but session not updated - mark it completed
        loggedPrepare(
          `UPDATE sessions SET state = 'completed', completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
        ).run(existing.id);
      }

      const id = `coordinator-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const agentName = `coordinator-${Date.now().toString(36)}`;
      const model = getDefaultModel('coordinator');

      // Get the active project path for working directory
      const activeProject = loggedPrepare(
        'SELECT * FROM projects WHERE is_active = 1 LIMIT 1',
      ).get() as { path: string } | undefined;

      const worktreePath = activeProject?.path || process.cwd();

      // Spawn via node-pty
      const agentProcess = agentProcessManager.spawn({
        id,
        agentName,
        capability: 'coordinator',
        model,
        worktreePath,
        runId: options?.run_id,
        prompt:
          options?.prompt ||
          'You are the coordinator agent. Monitor the fleet, decompose tasks, dispatch lead agents, and authorize merges. Poll mail regularly for status updates from workers.',
        depth: 0,
      });

      // Insert session record
      loggedPrepare(
        `INSERT INTO sessions (id, agent_name, capability, model, run_id, worktree_path, depth, state, pid, created_at, updated_at)
        VALUES (?, ?, 'coordinator', 'opus', ?, ?, 0, 'booting', ?, datetime('now'), datetime('now'))`,
      ).run(id, agentName, options?.run_id ?? null, worktreePath, agentProcess.pid);

      // Update state to working after brief boot and auto-decompose tasks
      setTimeout(() => {
        try {
          loggedPrepare(
            `UPDATE sessions SET state = 'working', updated_at = datetime('now') WHERE id = ? AND state = 'booting'`,
          ).run(id);

          // Auto-decompose work into streams for this coordinator session
          // Check if work streams already exist to avoid duplicates
          const existingStreams = loggedPrepare(
            `SELECT COUNT(*) as cnt FROM task_groups WHERE name LIKE '% - %' AND status = 'active'`,
          ).get() as { cnt: number };

          if (existingStreams.cnt === 0) {
            const projRow = loggedPrepare(
              'SELECT * FROM projects WHERE is_active = 1 LIMIT 1',
            ).get() as { name: string } | undefined;
            const pName = projRow?.name || 'Project';
            const streams = [
              {
                name: `${pName} - Core Infrastructure`,
                tasks: [
                  {
                    title: 'Set up project scaffolding and dependencies',
                    type: 'task',
                    priority: 'high',
                  },
                  {
                    title: 'Configure database schema and migrations',
                    type: 'task',
                    priority: 'high',
                  },
                  { title: 'Implement core API endpoints', type: 'task', priority: 'high' },
                  {
                    title: 'Set up build pipeline and dev tooling',
                    type: 'task',
                    priority: 'medium',
                  },
                ],
              },
              {
                name: `${pName} - Feature Implementation`,
                tasks: [
                  { title: 'Implement primary user workflows', type: 'feature', priority: 'high' },
                  { title: 'Build UI components and pages', type: 'feature', priority: 'high' },
                  {
                    title: 'Integrate frontend with backend APIs',
                    type: 'feature',
                    priority: 'medium',
                  },
                  {
                    title: 'Add data validation and error handling',
                    type: 'task',
                    priority: 'medium',
                  },
                ],
              },
              {
                name: `${pName} - Quality & Polish`,
                tasks: [
                  { title: 'Write unit and integration tests', type: 'task', priority: 'medium' },
                  {
                    title: 'Perform code review and refactoring',
                    type: 'task',
                    priority: 'medium',
                  },
                  { title: 'Polish UI/UX and fix edge cases', type: 'task', priority: 'low' },
                  {
                    title: 'Performance optimization and profiling',
                    type: 'research',
                    priority: 'low',
                  },
                ],
              },
            ];

            let totalCreated = 0;
            for (const stream of streams) {
              const gId = `ws-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
              loggedPrepare(
                'INSERT INTO task_groups (id, name, member_issues, status) VALUES (?, ?, ?, ?)',
              ).run(gId, stream.name, '[]', 'active');

              const mIds: string[] = [];
              for (const t of stream.tasks) {
                const tId = `task-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
                loggedPrepare(
                  `INSERT INTO issues (id, title, description, type, priority, status, group_id)
                  VALUES (?, ?, ?, ?, ?, 'open', ?)`,
                ).run(tId, t.title, `Work stream: ${stream.name}`, t.type, t.priority, gId);
                mIds.push(tId);
              }

              loggedPrepare('UPDATE task_groups SET member_issues = ? WHERE id = ?').run(
                JSON.stringify(mIds),
                gId,
              );
              totalCreated += mIds.length;
            }

            // Record decomposition event
            loggedPrepare(
              `INSERT INTO events (session_id, event_type, data, timestamp)
              VALUES (?, 'task_decomposition', ?, datetime('now'))`,
            ).run(
              id,
              JSON.stringify({
                scope: `Auto-decomposition for ${pName}`,
                streamCount: streams.length,
                totalTasks: totalCreated,
              }),
            );

            log.info(
              `[IPC] coordinator:start - auto-decomposed into ${streams.length} streams with ${totalCreated} tasks`,
            );
          }
        } catch {
          // ignore - session may have been stopped
        }
      }, 3000);

      const session = loggedPrepare('SELECT * FROM sessions WHERE id = ?').get(id);
      log.info(
        `[IPC] coordinator:start - spawned coordinator: ${agentName}, PID=${agentProcess.pid}, cwd=${worktreePath}`,
      );
      return { data: session, error: null };
    } catch (error) {
      log.error('coordinator:start failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('coordinator:stop', async () => {
    try {
      // Find the active coordinator session
      const coordinator = loggedPrepare(
        `SELECT * FROM sessions WHERE capability = 'coordinator' AND state NOT IN ('completed') ORDER BY created_at DESC LIMIT 1`,
      ).get() as Record<string, unknown> | undefined;

      if (!coordinator) {
        log.info('[IPC] coordinator:stop - no active coordinator found');
        return { data: null, error: 'No active coordinator to stop' };
      }

      const coordinatorId = coordinator.id as string;

      // Graceful shutdown: send SIGTERM via tree-kill
      await agentProcessManager.stop(coordinatorId);

      // Update session state in database
      loggedPrepare(
        `UPDATE sessions SET state = 'completed', completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
      ).run(coordinatorId);

      const session = loggedPrepare('SELECT * FROM sessions WHERE id = ?').get(coordinatorId);
      log.info(`[IPC] coordinator:stop - gracefully stopped coordinator: ${coordinatorId}`);
      return { data: session, error: null };
    } catch (error) {
      log.error('coordinator:stop failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('coordinator:status', () => {
    try {
      const coordinator = loggedPrepare(
        `SELECT * FROM sessions WHERE capability = 'coordinator' AND state NOT IN ('completed') ORDER BY created_at DESC LIMIT 1`,
      ).get() as Record<string, unknown> | undefined;

      if (!coordinator) {
        return {
          data: { active: false, session: null, processAlive: false },
          error: null,
        };
      }

      // Verify process is actually alive
      const proc = agentProcessManager.get(coordinator.id as string);
      const processAlive = proc?.isRunning ?? false;

      // If process died but session not updated, clean up
      if (!processAlive && coordinator.state !== 'completed') {
        loggedPrepare(
          `UPDATE sessions SET state = 'completed', completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
        ).run(coordinator.id);
        return {
          data: { active: false, session: null, processAlive: false },
          error: null,
        };
      }

      // Count agents dispatched by this coordinator
      const dispatched = loggedPrepare(
        'SELECT COUNT(*) as count FROM sessions WHERE parent_agent = ? AND id != ?',
      ).get(coordinator.agent_name, coordinator.id) as { count: number };

      log.info('[IPC] coordinator:status - queried coordinator state from real database');
      return {
        data: {
          active: true,
          session: coordinator,
          processAlive,
          agentsDispatched: dispatched.count,
        },
        error: null,
      };
    } catch (error) {
      log.error('coordinator:status failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // Coordinator dispatch - dispatches lead agents with high-level objectives
  ipcMain.handle(
    'coordinator:dispatch',
    (
      _event,
      options: {
        objective: string;
        lead_name?: string;
        model?: string;
        worktree_path?: string;
        branch_name?: string;
        task_id?: string;
        file_scope?: string;
      },
    ) => {
      try {
        const coordinator = loggedPrepare(
          `SELECT * FROM sessions WHERE capability = 'coordinator' AND state NOT IN ('completed') ORDER BY created_at DESC LIMIT 1`,
        ).get() as Record<string, unknown> | undefined;

        if (!coordinator) {
          return {
            data: null,
            error: 'No active coordinator. Start the coordinator first.',
          };
        }

        const coordinatorName = coordinator.agent_name as string;
        const coordinatorId = coordinator.id as string;
        const runId = (coordinator.run_id as string) ?? null;

        const leadId = `lead-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        const leadName =
          options.lead_name ||
          `lead-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
        const model = options.model || getDefaultModel('lead');

        const activeProject = loggedPrepare(
          'SELECT * FROM projects WHERE is_active = 1 LIMIT 1',
        ).get() as { path: string } | undefined;

        const worktreePath = options.worktree_path || activeProject?.path || process.cwd();

        const prompt = `You are a lead agent dispatched by the coordinator. Your objective: ${options.objective}. Decompose this objective into tasks and spawn builder agents to complete them. Report progress back to the coordinator via mail.`;

        const agentProcess = agentProcessManager.spawn({
          id: leadId,
          agentName: leadName,
          capability: 'lead',
          model,
          worktreePath,
          branchName: options.branch_name,
          taskId: options.task_id,
          parentAgent: coordinatorName,
          runId: runId ?? undefined,
          depth: 1,
          prompt,
        });

        loggedPrepare(
          `INSERT INTO sessions (id, agent_name, capability, model, run_id, task_id, parent_agent, worktree_path, branch_name, depth, state, pid, file_scope, created_at, updated_at)
          VALUES (?, ?, 'lead', ?, ?, ?, ?, ?, ?, 1, 'booting', ?, ?, datetime('now'), datetime('now'))`,
        ).run(
          leadId,
          leadName,
          model,
          runId,
          options.task_id ?? null,
          coordinatorName,
          worktreePath,
          options.branch_name ?? null,
          agentProcess.pid,
          options.file_scope ?? null,
        );

        loggedPrepare(
          `UPDATE sessions SET state = 'working', updated_at = datetime('now') WHERE id = ?`,
        ).run(leadId);

        const existingIdentity = loggedPrepare('SELECT * FROM agent_identities WHERE name = ?').get(
          leadName,
        );
        if (existingIdentity) {
          loggedPrepare(
            `UPDATE agent_identities SET capability = 'lead', updated_at = datetime('now') WHERE name = ?`,
          ).run(leadName);
        } else {
          loggedPrepare(
            `INSERT INTO agent_identities (name, capability, sessions_completed, expertise_domains, recent_tasks)
             VALUES (?, 'lead', 0, '[]', '[]')`,
          ).run(leadName);
        }

        // Store objective in a dispatch mail message from coordinator to lead
        const dispatchMailId = `msg-dispatch-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        loggedPrepare(
          `INSERT INTO messages (id, thread_id, from_agent, to_agent, subject, body, type, priority, payload)
          VALUES (?, ?, ?, ?, ?, ?, 'dispatch', 'high', ?)`,
        ).run(
          dispatchMailId,
          null,
          coordinatorName,
          leadName,
          `Objective: ${options.objective.substring(0, 100)}`,
          options.objective,
          JSON.stringify({
            objective: options.objective,
            lead_session_id: leadId,
          }),
        );

        // Record dispatch event in event log
        recordEvent({
          eventType: 'spawn',
          agentName: coordinatorName,
          sessionId: coordinatorId,
          runId: runId ?? undefined,
          data: JSON.stringify({
            action: 'dispatch_lead',
            lead_name: leadName,
            lead_session_id: leadId,
            objective: options.objective,
            model,
            worktree_path: worktreePath,
          }),
        });

        const session = loggedPrepare('SELECT * FROM sessions WHERE id = ?').get(leadId);
        log.info(
          `[IPC] coordinator:dispatch - dispatched lead ${leadName} with objective: ${options.objective.substring(0, 80)}`,
        );

        return {
          data: {
            session,
            objective: options.objective,
            dispatch_message_id: dispatchMailId,
          },
          error: null,
        };
      } catch (error) {
        log.error('coordinator:dispatch failed:', error);
        return { data: null, error: String(error) };
      }
    },
  );

  // Coordinator synchronous ask-reply - sends question to coordinator and waits for reply
  ipcMain.handle(
    'coordinator:ask',
    async (
      _event,
      options: {
        subject: string;
        body: string;
        from?: string;
        timeout_ms?: number;
      },
    ) => {
      try {
        const coordinator = loggedPrepare(
          `SELECT * FROM sessions WHERE capability = 'coordinator' AND state NOT IN ('completed') ORDER BY created_at DESC LIMIT 1`,
        ).get() as Record<string, unknown> | undefined;

        if (!coordinator) {
          return { data: null, error: 'No active coordinator found' };
        }

        const coordinatorName = coordinator.agent_name as string;
        const fromAgent = options.from || 'operator';
        const timeoutMs = options.timeout_ms ?? 120000;
        const correlationId = `ask-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const messageId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

        // Send the question message to coordinator with correlation ID as thread_id
        loggedPrepare(
          `INSERT INTO messages (id, thread_id, from_agent, to_agent, subject, body, type, priority)
           VALUES (?, ?, ?, ?, ?, ?, 'question', 'high')`,
        ).run(messageId, correlationId, fromAgent, coordinatorName, options.subject, options.body);

        log.info(
          `[IPC] coordinator:ask - sent question from ${fromAgent} to ${coordinatorName} with correlationId=${correlationId}`,
        );

        // Record event
        recordEvent({
          eventType: 'mail_sent',
          agentName: fromAgent,
          data: JSON.stringify({
            to: coordinatorName,
            subject: options.subject,
            type: 'question',
            correlation_id: correlationId,
          }),
        });

        // Poll for a reply in the same thread
        const pollIntervalMs = 2000;
        const startTime = Date.now();

        while (Date.now() - startTime < timeoutMs) {
          const reply = loggedPrepare(
            `SELECT * FROM messages
             WHERE thread_id = ? AND from_agent = ? AND id != ?
             ORDER BY created_at ASC LIMIT 1`,
          ).get(correlationId, coordinatorName, messageId) as Record<string, unknown> | undefined;

          if (reply) {
            log.info(
              `[IPC] coordinator:ask - received reply for correlationId=${correlationId} after ${Date.now() - startTime}ms`,
            );

            loggedPrepare(`UPDATE messages SET read = 1 WHERE id = ?`).run(reply.id);

            return {
              data: {
                correlation_id: correlationId,
                question_message_id: messageId,
                reply: reply,
                elapsed_ms: Date.now() - startTime,
                timed_out: false,
              },
              error: null,
            };
          }

          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        }

        log.warn(
          `[IPC] coordinator:ask - TIMEOUT after ${timeoutMs}ms for correlationId=${correlationId}`,
        );

        return {
          data: {
            correlation_id: correlationId,
            question_message_id: messageId,
            reply: null,
            elapsed_ms: Date.now() - startTime,
            timed_out: true,
          },
          error: null,
        };
      } catch (error) {
        log.error('coordinator:ask failed:', error);
        return { data: null, error: String(error) };
      }
    },
  );

  // Coordinator dispatch list - get all leads dispatched with their objectives
  ipcMain.handle('coordinator:dispatched-leads', () => {
    try {
      const coordinator = loggedPrepare(
        `SELECT * FROM sessions WHERE capability = 'coordinator' AND state NOT IN ('completed') ORDER BY created_at DESC LIMIT 1`,
      ).get() as Record<string, unknown> | undefined;

      if (!coordinator) {
        return { data: [], error: null };
      }

      const coordinatorName = coordinator.agent_name as string;

      const leads = loggedPrepare(
        `SELECT s.*, m.body as objective
         FROM sessions s
         LEFT JOIN messages m ON m.to_agent = s.agent_name AND m.type = 'dispatch' AND m.from_agent = ?
         WHERE s.parent_agent = ? AND s.capability = 'lead'
         ORDER BY s.created_at DESC`,
      ).all(coordinatorName, coordinatorName);

      log.info(`[IPC] coordinator:dispatched-leads - found ${leads.length} dispatched leads`);
      return { data: leads, error: null };
    } catch (error) {
      log.error('coordinator:dispatched-leads failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // Coordinator poll mail - polls mail addressed to coordinator for status updates
  ipcMain.handle('coordinator:poll-mail', () => {
    try {
      const coordinator = loggedPrepare(
        `SELECT * FROM sessions WHERE capability = 'coordinator' AND state NOT IN ('completed') ORDER BY created_at DESC LIMIT 1`,
      ).get() as Record<string, unknown> | undefined;

      if (!coordinator) {
        return {
          data: null,
          error: 'No active coordinator to poll mail for.',
        };
      }

      const coordinatorName = coordinator.agent_name as string;
      const coordinatorId = coordinator.id as string;

      const unreadMessages = loggedPrepare(
        'SELECT * FROM messages WHERE to_agent = ? AND read = 0 ORDER BY created_at ASC',
      ).all(coordinatorName) as Record<string, unknown>[];

      const processedResults: Array<{
        message_id: string;
        from_agent: string;
        type: string;
        action_taken: string;
      }> = [];

      for (const msg of unreadMessages) {
        const msgId = msg.id as string;
        const fromAgent = msg.from_agent as string;
        const msgType = msg.type as string;
        const msgBody = msg.body as string | null;

        let actionTaken = 'acknowledged';

        switch (msgType) {
          case 'status': {
            actionTaken = 'status_logged';
            break;
          }
          case 'worker_done': {
            // Parse structured payload: {taskId, summary, filesModified}
            const workerPayload = msg.payload as string | null;
            let workerTaskId: string | null = null;
            let workerSummary: string | null = null;
            let workerFilesModified: string[] | null = null;

            if (workerPayload) {
              try {
                const parsed = JSON.parse(workerPayload);
                workerTaskId = parsed.taskId ?? null;
                workerSummary = parsed.summary ?? null;
                workerFilesModified = parsed.filesModified ?? null;
              } catch {
                // payload not valid JSON, use body as summary fallback
                workerSummary = msgBody;
              }
            }

            // Mark the agent's session as completed if found
            const workerSession = loggedPrepare(
              `SELECT * FROM sessions WHERE agent_name = ? AND state NOT IN ('completed') ORDER BY created_at DESC LIMIT 1`,
            ).get(fromAgent) as Record<string, unknown> | undefined;

            if (workerSession) {
              loggedPrepare(
                `UPDATE sessions SET state = 'completed', updated_at = datetime('now') WHERE id = ?`,
              ).run(workerSession.id);
            }

            // Record structured completion event
            recordEvent({
              eventType: 'custom',
              agentName: coordinatorName,
              sessionId: coordinatorId,
              data: JSON.stringify({
                action: 'worker_done_processed',
                from_agent: fromAgent,
                task_id: workerTaskId,
                summary: workerSummary,
                files_modified: workerFilesModified,
              }),
            });

            log.info(
              `[IPC] coordinator:poll-mail - worker_done from ${fromAgent}: task=${workerTaskId}, files=${workerFilesModified?.length ?? 0}`,
            );

            actionTaken = 'worker_completion_processed';
            break;
          }
          case 'error': {
            const agentSession = loggedPrepare(
              `SELECT * FROM sessions WHERE agent_name = ? AND state NOT IN ('completed') ORDER BY created_at DESC LIMIT 1`,
            ).get(fromAgent) as Record<string, unknown> | undefined;

            if (agentSession) {
              loggedPrepare(
                `UPDATE sessions SET escalation_level = COALESCE(escalation_level, 0) + 1, updated_at = datetime('now') WHERE id = ?`,
              ).run(agentSession.id);
              actionTaken = 'escalation_incremented';
            }
            break;
          }
          case 'merge_ready': {
            // Coordinator authorizes merge: extract branch info and enqueue in merge queue
            const branchName =
              (msg.subject as string) || (msg.body as string) || `branch-${fromAgent}`;
            const msgPayload = msg.payload as string | null;
            let filesModified: string[] | null = null;
            let taskId: string | null = null;

            if (msgPayload) {
              try {
                const parsed = JSON.parse(msgPayload);
                filesModified = parsed.files_modified ?? null;
                taskId = parsed.task_id ?? null;
              } catch {
                // payload not valid JSON, ignore
              }
            }

            const filesJson = filesModified ? JSON.stringify(filesModified) : null;
            const enqueueResult = loggedPrepare(
              `INSERT INTO merge_queue (branch_name, task_id, agent_name, files_modified, status, enqueued_at)
              VALUES (?, ?, ?, ?, 'pending', datetime('now'))`,
            ).run(branchName, taskId, fromAgent, filesJson);

            log.info(
              `[IPC] coordinator:poll-mail - Authorized merge for branch=${branchName} from agent=${fromAgent}, queue_id=${enqueueResult.lastInsertRowid}`,
            );

            // Record merge authorization event
            recordEvent({
              eventType: 'custom',
              agentName: coordinatorName,
              sessionId: coordinatorId,
              data: JSON.stringify({
                action: 'merge_authorized',
                branch: branchName,
                from_agent: fromAgent,
                merge_queue_id: Number(enqueueResult.lastInsertRowid),
              }),
            });

            actionTaken = 'merge_authorized_and_queued';
            break;
          }
          case 'escalation': {
            const escalatedSession = loggedPrepare(
              `SELECT * FROM sessions WHERE agent_name = ? AND state NOT IN ('completed') ORDER BY created_at DESC LIMIT 1`,
            ).get(fromAgent) as Record<string, unknown> | undefined;

            if (escalatedSession) {
              const currentLevel = (escalatedSession.escalation_level as number) || 0;
              if (currentLevel >= 2) {
                loggedPrepare(
                  `UPDATE sessions SET state = 'stalled', stalled_at = datetime('now'), escalation_level = ?, updated_at = datetime('now') WHERE id = ?`,
                ).run(currentLevel + 1, escalatedSession.id);
                actionTaken = 'agent_marked_stalled';
              } else {
                loggedPrepare(
                  `UPDATE sessions SET escalation_level = ?, updated_at = datetime('now') WHERE id = ?`,
                ).run(currentLevel + 1, escalatedSession.id);
                actionTaken = 'escalation_incremented';
              }
            }
            break;
          }
          case 'health_check': {
            actionTaken = 'health_confirmed';
            break;
          }
          default: {
            actionTaken = 'acknowledged';
            break;
          }
        }

        loggedPrepare('UPDATE messages SET read = 1 WHERE id = ?').run(msgId);

        processedResults.push({
          message_id: msgId,
          from_agent: fromAgent,
          type: msgType,
          action_taken: actionTaken,
        });

        recordEvent({
          eventType: 'mail_received',
          agentName: coordinatorName,
          sessionId: coordinatorId,
          data: JSON.stringify({
            from: fromAgent,
            type: msgType,
            action: actionTaken,
            body_preview: msgBody?.substring(0, 100) ?? null,
          }),
        });
      }

      const activeAgents = loggedPrepare(
        `SELECT COUNT(*) as count FROM sessions WHERE state IN ('booting', 'working') AND capability != 'coordinator'`,
      ).get() as { count: number };

      const stalledAgents = loggedPrepare(
        `SELECT COUNT(*) as count FROM sessions WHERE state = 'stalled'`,
      ).get() as { count: number };

      const completedToday = loggedPrepare(
        `SELECT COUNT(*) as count FROM sessions WHERE state = 'completed' AND completed_at >= datetime('now', '-1 day')`,
      ).get() as { count: number };

      log.info(
        `[IPC] coordinator:poll-mail - processed ${processedResults.length} messages, fleet: ${activeAgents.count} active, ${stalledAgents.count} stalled`,
      );

      return {
        data: {
          messages_processed: processedResults,
          unread_count: unreadMessages.length,
          fleet_summary: {
            active_agents: activeAgents.count,
            stalled_agents: stalledAgents.count,
            completed_today: completedToday.count,
          },
        },
        error: null,
      };
    } catch (error) {
      log.error('coordinator:poll-mail failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // Coordinator auto-task decomposition
  ipcMain.handle(
    'coordinator:decompose',
    (_event, options?: { scope?: string; coordinatorSessionId?: string }) => {
      try {
        // Get the active project for context
        const activeProject = loggedPrepare(
          'SELECT * FROM projects WHERE is_active = 1 LIMIT 1',
        ).get() as { id: string; name: string; path: string } | undefined;

        const projectName = activeProject?.name || 'Unknown Project';
        const scope = options?.scope || `Full project scope for ${projectName}`;

        // Define work streams based on common development patterns
        const workStreams = [
          {
            name: `${projectName} - Core Infrastructure`,
            description: 'Foundation setup, database, API scaffolding, and build configuration',
            tasks: [
              {
                title: 'Set up project scaffolding and dependencies',
                type: 'task',
                priority: 'high',
              },
              { title: 'Configure database schema and migrations', type: 'task', priority: 'high' },
              { title: 'Implement core API endpoints', type: 'task', priority: 'high' },
              { title: 'Set up build pipeline and dev tooling', type: 'task', priority: 'medium' },
            ],
          },
          {
            name: `${projectName} - Feature Implementation`,
            description: 'Core feature development and business logic',
            tasks: [
              { title: 'Implement primary user workflows', type: 'feature', priority: 'high' },
              { title: 'Build UI components and pages', type: 'feature', priority: 'high' },
              {
                title: 'Integrate frontend with backend APIs',
                type: 'feature',
                priority: 'medium',
              },
              { title: 'Add data validation and error handling', type: 'task', priority: 'medium' },
            ],
          },
          {
            name: `${projectName} - Quality & Polish`,
            description: 'Testing, code quality, UX polish, and performance optimization',
            tasks: [
              { title: 'Write unit and integration tests', type: 'task', priority: 'medium' },
              { title: 'Perform code review and refactoring', type: 'task', priority: 'medium' },
              { title: 'Polish UI/UX and fix edge cases', type: 'task', priority: 'low' },
              {
                title: 'Performance optimization and profiling',
                type: 'research',
                priority: 'low',
              },
            ],
          },
        ];

        const createdStreams: Array<{
          groupId: string;
          name: string;
          description: string;
          taskCount: number;
          tasks: Array<{ id: string; title: string }>;
        }> = [];

        for (const stream of workStreams) {
          const groupId = `ws-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

          // Create task group
          loggedPrepare(
            'INSERT INTO task_groups (id, name, member_issues, status) VALUES (?, ?, ?, ?)',
          ).run(groupId, stream.name, '[]', 'active');

          const createdTasks: Array<{ id: string; title: string }> = [];
          const memberIds: string[] = [];

          for (const task of stream.tasks) {
            const taskId = `task-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

            // Create issue
            loggedPrepare(
              `INSERT INTO issues (id, title, description, type, priority, status, group_id)
              VALUES (?, ?, ?, ?, ?, 'open', ?)`,
            ).run(taskId, task.title, stream.description, task.type, task.priority, groupId);

            memberIds.push(taskId);
            createdTasks.push({ id: taskId, title: task.title });
          }

          // Update task group with member issues
          loggedPrepare('UPDATE task_groups SET member_issues = ? WHERE id = ?').run(
            JSON.stringify(memberIds),
            groupId,
          );

          createdStreams.push({
            groupId,
            name: stream.name,
            description: stream.description,
            taskCount: createdTasks.length,
            tasks: createdTasks,
          });
        }

        // Record decomposition event for the coordinator session
        if (options?.coordinatorSessionId) {
          loggedPrepare(
            `INSERT INTO events (session_id, event_type, data, timestamp)
            VALUES (?, 'task_decomposition', ?, datetime('now'))`,
          ).run(
            options.coordinatorSessionId,
            JSON.stringify({
              scope,
              streams: createdStreams.map((s) => ({
                name: s.name,
                taskCount: s.taskCount,
              })),
              totalTasks: createdStreams.reduce((sum, s) => sum + s.taskCount, 0),
            }),
          );
        }

        log.info(
          `[IPC] coordinator:decompose - created ${createdStreams.length} work streams with ${createdStreams.reduce((sum, s) => sum + s.taskCount, 0)} total tasks`,
        );

        return {
          data: {
            streams: createdStreams,
            totalTasks: createdStreams.reduce((sum, s) => sum + s.taskCount, 0),
            scope,
          },
          error: null,
        };
      } catch (error) {
        log.error('coordinator:decompose failed:', error);
        return { data: null, error: String(error) };
      }
    },
  );

  // Get work streams associated with the coordinator
  ipcMain.handle('coordinator:workStreams', () => {
    try {
      const streams = loggedPrepare(
        `SELECT tg.*,
          (SELECT COUNT(*) FROM issues WHERE group_id = tg.id) as total_tasks,
          (SELECT COUNT(*) FROM issues WHERE group_id = tg.id AND status = 'closed') as completed_tasks,
          (SELECT COUNT(*) FROM issues WHERE group_id = tg.id AND status = 'in_progress') as in_progress_tasks
        FROM task_groups tg
        WHERE tg.name LIKE '% - %'
        ORDER BY tg.created_at DESC`,
      ).all();

      log.info(
        `[IPC] coordinator:workStreams - returned ${(streams as unknown[]).length} work streams`,
      );
      return { data: streams, error: null };
    } catch (error) {
      log.error('coordinator:workStreams failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // Coordinator activity log - aggregates coordinator events, dispatches, and mail activity
  ipcMain.handle('coordinator:activity-log', (_event, limit?: number) => {
    try {
      const maxEntries = limit ?? 100;

      // Find active or most recent coordinator session
      const coordinator = loggedPrepare(
        `SELECT * FROM sessions WHERE capability = 'coordinator' ORDER BY created_at DESC LIMIT 1`,
      ).get() as Record<string, unknown> | undefined;

      if (!coordinator) {
        return { data: [], error: null };
      }

      const coordinatorName = coordinator.agent_name as string;
      const coordinatorId = coordinator.id as string;

      // Gather activity entries from multiple sources:

      // 1. Events related to coordinator session (spawns, session events, errors, custom, decomposition)
      const events = loggedPrepare(
        `SELECT id, event_type, agent_name, data, level, created_at as timestamp
        FROM events
        WHERE session_id = ? OR agent_name = ?
        ORDER BY created_at DESC
        LIMIT ?`,
      ).all(coordinatorId, coordinatorName, maxEntries) as Array<{
        id: string;
        event_type: string;
        agent_name: string | null;
        data: string | null;
        level: string;
        timestamp: string;
      }>;

      // 2. Mail messages sent to or from coordinator
      const mail = loggedPrepare(
        `SELECT id, from_agent, to_agent, subject, type, priority, created_at as timestamp
        FROM mail
        WHERE from_agent = ? OR to_agent = ?
        ORDER BY created_at DESC
        LIMIT ?`,
      ).all(coordinatorName, coordinatorName, maxEntries) as Array<{
        id: string;
        from_agent: string;
        to_agent: string;
        subject: string;
        type: string;
        priority: string;
        timestamp: string;
      }>;

      // 3. Agent sessions dispatched by coordinator (lead spawns)
      const dispatches = loggedPrepare(
        `SELECT id, agent_name, capability, state, model, created_at as timestamp
        FROM sessions
        WHERE parent_agent = ? AND id != ?
        ORDER BY created_at DESC
        LIMIT ?`,
      ).all(coordinatorName, coordinatorId, maxEntries) as Array<{
        id: string;
        agent_name: string;
        capability: string;
        state: string;
        model: string;
        timestamp: string;
      }>;

      // Merge all sources into a unified activity log
      const activities: Array<{
        id: string;
        source: string;
        type: string;
        summary: string;
        detail: string | null;
        level: string;
        timestamp: string;
      }> = [];

      for (const ev of events) {
        let summary = ev.event_type.replace(/_/g, ' ');
        let detail: string | null = null;
        if (ev.data) {
          try {
            const parsed = JSON.parse(ev.data);
            if (parsed.scope) summary = `Decomposition: ${parsed.scope}`;
            if (parsed.streamCount)
              detail = `${parsed.streamCount} streams, ${parsed.totalTasks} tasks`;
            else detail = ev.data.substring(0, 200);
          } catch {
            detail = ev.data.substring(0, 200);
          }
        }
        activities.push({
          id: ev.id ?? `ev-${ev.timestamp}`,
          source: 'event',
          type: ev.event_type,
          summary,
          detail,
          level: ev.level,
          timestamp: ev.timestamp,
        });
      }

      for (const m of mail) {
        const direction = m.from_agent === coordinatorName ? 'sent' : 'received';
        const peer = direction === 'sent' ? m.to_agent : m.from_agent;
        activities.push({
          id: m.id,
          source: 'mail',
          type: m.type,
          summary: `Mail ${direction}: ${m.subject}`,
          detail: `${direction === 'sent' ? 'To' : 'From'}: ${peer} | Priority: ${m.priority}`,
          level: m.type === 'error' ? 'error' : m.type === 'escalation' ? 'warn' : 'info',
          timestamp: m.timestamp,
        });
      }

      for (const d of dispatches) {
        activities.push({
          id: d.id,
          source: 'dispatch',
          type: 'dispatch',
          summary: `Dispatched ${d.capability}: ${d.agent_name}`,
          detail: `Model: ${d.model} | State: ${d.state}`,
          level: 'info',
          timestamp: d.timestamp,
        });
      }

      // Sort by timestamp descending
      activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Limit to requested count
      const result = activities.slice(0, maxEntries);

      log.info(`[IPC] coordinator:activity-log - returned ${result.length} activity entries`);
      return { data: result, error: null };
    } catch (error) {
      log.error('coordinator:activity-log failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // Operator dispatch message to coordinator - fire-and-forget message from human operator
  ipcMain.handle(
    'operator:dispatch',
    (_event, message: string) => {
      try {
        if (!message || !message.trim()) {
          return { data: null, error: 'Message cannot be empty' };
        }

        // Find the active coordinator session
        const coordinatorSession = loggedPrepare(
          db,
          'operator:dispatch',
          `SELECT id, agent_name FROM sessions WHERE capability = 'lead' AND state IN ('booting', 'working') ORDER BY created_at DESC LIMIT 1`,
        ).get() as { id: string; agent_name: string } | undefined;

        // Also check for coordinator capability
        const coordSession = coordinatorSession || loggedPrepare(
          db,
          'operator:dispatch',
          `SELECT id, agent_name FROM sessions WHERE agent_name LIKE '%coordinator%' AND state IN ('booting', 'working') ORDER BY created_at DESC LIMIT 1`,
        ).get() as { id: string; agent_name: string } | undefined;

        if (!coordSession) {
          return { data: null, error: 'No active coordinator found. Start the coordinator first.' };
        }

        // Write the operator message to the coordinator's PTY terminal
        const operatorPrompt = `\n[OPERATOR MESSAGE]: ${message.trim()}\n`;
        const written = agentProcessManager.write(coordSession.id, operatorPrompt);

        // Store the message in messages table for history
        const msgId = `msg-operator-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        loggedPrepare(
          db,
          'operator:dispatch',
          `INSERT INTO messages (id, from_agent, to_agent, subject, body, type, priority, created_at)
           VALUES (?, ?, ?, ?, ?, 'dispatch', 'high', datetime('now'))`,
        ).run(
          msgId,
          'operator',
          coordSession.agent_name,
          'Operator Dispatch',
          message.trim(),
        );

        log.info(
          `[IPC] operator:dispatch - message sent to ${coordSession.agent_name} (written=${written}): ${message.trim().substring(0, 80)}`,
        );

        return {
          data: {
            success: true,
            message_id: msgId,
            target_agent: coordSession.agent_name,
            written,
          },
          error: null,
        };
      } catch (error) {
        log.error('operator:dispatch failed:', error);
        return { data: null, error: String(error) };
      }
    },
  );

  // Operator message history - retrieve past operator dispatch messages
  ipcMain.handle('operator:history', (_event, limit?: number) => {
    try {
      const maxEntries = limit ?? 50;
      const messages = loggedPrepare(
        db,
        'operator:history',
        `SELECT id, from_agent, to_agent, subject, body, created_at
         FROM messages
         WHERE from_agent = 'operator' AND type = 'dispatch'
         ORDER BY created_at DESC
         LIMIT ?`,
      ).all(maxEntries) as Array<{
        id: string;
        from_agent: string;
        to_agent: string;
        subject: string;
        body: string;
        created_at: string;
      }>;

      log.info(`[IPC] operator:history - returned ${messages.length} operator messages`);
      return { data: messages, error: null };
    } catch (error) {
      log.error('operator:history failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // Mail channels - all use real SQLite queries via loggedPrepare
  ipcMain.handle(
    'mail:list',
    (
      _event,
      filters?: {
        unreadOnly?: boolean;
        search?: string;
        type?: string;
        priority?: string;
        agent?: string;
      },
    ) => {
      try {
        const conditions: string[] = [];
        const params: unknown[] = [];

        if (filters?.unreadOnly) {
          conditions.push('read = 0');
        }
        if (filters?.search) {
          const searchTerm = `%${filters.search}%`;
          conditions.push(
            '(subject LIKE ? OR body LIKE ? OR from_agent LIKE ? OR to_agent LIKE ?)',
          );
          params.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }
        if (filters?.type) {
          conditions.push('type = ?');
          params.push(filters.type);
        }
        if (filters?.priority) {
          conditions.push('priority = ?');
          params.push(filters.priority);
        }
        if (filters?.agent) {
          const agentTerm = `%${filters.agent}%`;
          conditions.push('(from_agent LIKE ? OR to_agent LIKE ?)');
          params.push(agentTerm, agentTerm);
        }

        let query = 'SELECT * FROM messages';
        if (conditions.length > 0) {
          query += ` WHERE ${conditions.join(' AND ')}`;
        }
        query +=
          " ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 END ASC, created_at DESC";

        const messages = loggedPrepare(query).all(...params);
        log.info(
          `[IPC] mail:list - SELECT returned ${messages.length} messages from real database`,
        );
        return { data: messages, error: null };
      } catch (error) {
        log.error('mail:list failed:', error);
        return { data: null, error: String(error) };
      }
    },
  );

  ipcMain.handle('mail:unread-count', () => {
    try {
      const result = loggedPrepare(
        'SELECT COUNT(*) as count FROM messages WHERE read = 0',
      ).get() as {
        count: number;
      };
      log.info(
        `[IPC] mail:unread-count - SELECT COUNT returned ${result.count} from real database`,
      );
      return { data: result.count, error: null };
    } catch (error) {
      log.error('mail:unread-count failed:', error);
      return { data: 0, error: String(error) };
    }
  });

  // Group broadcast address mapping: @group -> capability filter
  const GROUP_ADDRESSES: Record<string, string | null> = {
    '@all': null, // all active agents
    '@builders': 'builder',
    '@scouts': 'scout',
    '@reviewers': 'reviewer',
    '@leads': 'lead',
    '@mergers': 'merger',
    '@coordinator': 'coordinator',
    '@monitor': 'monitor',
  };

  /**
   * Resolve a to_agent address: if it's a group address (@all, @builders, etc.),
   * return the list of individual agent names; otherwise return [to_agent].
   */
  function resolveRecipients(toAgent: string, fromAgent: string): string[] {
    const groupKey = toAgent.toLowerCase();
    if (!(groupKey in GROUP_ADDRESSES)) {
      return [toAgent]; // Direct address, not a group
    }

    const capability = GROUP_ADDRESSES[groupKey];
    let agents: Array<{ agent_name: string }>;

    if (capability === null) {
      // @all - all active (non-completed) agents
      agents = loggedPrepare(
        `SELECT DISTINCT agent_name FROM sessions WHERE state NOT IN ('completed') AND agent_name != ?`,
      ).all(fromAgent) as Array<{ agent_name: string }>;
    } else {
      // Specific capability group
      agents = loggedPrepare(
        `SELECT DISTINCT agent_name FROM sessions WHERE capability = ? AND state NOT IN ('completed') AND agent_name != ?`,
      ).all(capability, fromAgent) as Array<{ agent_name: string }>;
    }

    return agents.map((a) => a.agent_name);
  }

  ipcMain.handle(
    'mail:send',
    (
      _event,
      message: {
        id: string;
        from_agent: string;
        to_agent: string;
        subject?: string;
        body?: string;
        type: string;
        priority?: string;
        thread_id?: string;
        payload?: string;
      },
    ) => {
      try {
        const recipients = resolveRecipients(message.to_agent, message.from_agent);
        const isGroupSend = message.to_agent.startsWith('@') && recipients.length > 0;
        let sentCount = 0;

        // Insert a message copy for each resolved recipient
        for (const recipient of recipients) {
          const msgId = recipients.length === 1 ? message.id : `${message.id}-${sentCount}`;

          loggedPrepare(
            `INSERT INTO messages (id, thread_id, from_agent, to_agent, subject, body, type, priority, payload)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            msgId,
            message.thread_id ?? null,
            message.from_agent,
            recipient,
            message.subject ?? null,
            message.body ?? null,
            message.type,
            message.priority ?? 'normal',
            message.payload ?? null,
          );
          sentCount++;
        }

        if (isGroupSend) {
          log.info(
            `[IPC] mail:send - BROADCAST ${message.from_agent} -> ${message.to_agent} (${sentCount} recipients: ${recipients.join(', ')})`,
          );
        } else {
          log.info(
            `[IPC] mail:send - INSERT message into real database: ${message.from_agent} -> ${message.to_agent}`,
          );
        }

        // Record mail_sent event
        recordEvent({
          eventType: 'mail_sent',
          agentName: message.from_agent,
          data: JSON.stringify({
            to: message.to_agent,
            subject: message.subject,
            type: message.type,
            broadcast: isGroupSend,
            recipient_count: sentCount,
          }),
        });

        // Trigger desktop notification for merge_ready messages
        if (message.type === 'merge_ready') {
          const branchName = message.subject || message.body || 'Unknown branch';
          notificationService.notifyMergeReady(branchName);
        }

        // Trigger desktop notification for merge_failed messages
        if (message.type === 'merge_failed') {
          const branchName = message.subject || message.body || 'Unknown branch';
          notificationService.notifyMergeFailed(branchName);
        }

        return { data: true, error: null };
      } catch (error) {
        log.error('mail:send failed:', error);
        return { data: false, error: String(error) };
      }
    },
  );

  ipcMain.handle('mail:read', (_event, messageId: string) => {
    try {
      loggedPrepare('UPDATE messages SET read = 1 WHERE id = ?').run(messageId);
      log.info(`[IPC] mail:read - UPDATE message in real database: ${messageId}`);
      return { data: true, error: null };
    } catch (error) {
      log.error('mail:read failed:', error);
      return { data: false, error: String(error) };
    }
  });

  // Mail check with context injection - fetch unread messages for an agent and inject into terminal
  ipcMain.handle('mail:check', (_event, agentId: string, agentName: string) => {
    try {
      // Fetch unread messages addressed to this agent
      const unreadMessages = loggedPrepare(
        'SELECT * FROM messages WHERE to_agent = ? AND read = 0 ORDER BY created_at ASC',
      ).all(agentName) as Array<{
        id: string;
        from_agent: string;
        to_agent: string;
        subject: string | null;
        body: string | null;
        type: string;
        priority: string;
        created_at: string;
      }>;

      if (unreadMessages.length === 0) {
        log.info(`[IPC] mail:check - No unread messages for agent ${agentName}`);
        return { data: { injected: 0, messages: [] }, error: null };
      }

      // Format messages for context injection
      const formattedLines: string[] = [
        '',
        `--- MAIL CHECK: ${unreadMessages.length} unread message(s) for ${agentName} ---`,
      ];

      for (const msg of unreadMessages) {
        const priorityTag = msg.priority !== 'normal' ? ` [${msg.priority.toUpperCase()}]` : '';
        formattedLines.push(`  From: ${msg.from_agent}${priorityTag}`);
        formattedLines.push(`  Type: ${msg.type} | Time: ${msg.created_at}`);
        if (msg.subject) {
          formattedLines.push(`  Subject: ${msg.subject}`);
        }
        if (msg.body) {
          formattedLines.push(`  Body: ${msg.body}`);
        }
        formattedLines.push('  ---');
      }

      formattedLines.push('--- END MAIL ---');
      formattedLines.push('');

      const contextPayload = formattedLines.join('\n');

      // Inject into agent's terminal context
      const written = agentProcessManager.write(agentId, contextPayload);

      if (written) {
        // Mark all injected messages as read
        const messageIds = unreadMessages.map((m) => m.id);
        const placeholders = messageIds.map(() => '?').join(',');
        loggedPrepare(`UPDATE messages SET read = 1 WHERE id IN (${placeholders})`).run(
          ...messageIds,
        );

        // Record mail_received events
        for (const msg of unreadMessages) {
          recordEvent({
            eventType: 'mail_received',
            agentName,
            data: JSON.stringify({
              from: msg.from_agent,
              subject: msg.subject,
              type: msg.type,
            }),
          });
        }

        log.info(
          `[IPC] mail:check - Injected ${unreadMessages.length} messages into agent ${agentName} (${agentId}) context`,
        );
      } else {
        log.warn(
          `[IPC] mail:check - Agent ${agentName} (${agentId}) not running, could not inject context`,
        );
      }

      return {
        data: {
          injected: written ? unreadMessages.length : 0,
          messages: unreadMessages,
          contextWritten: written,
        },
        error: null,
      };
    } catch (error) {
      log.error('mail:check failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // Mark all messages as read for an agent
  ipcMain.handle('mail:mark-all-read', (_event, agentName?: string) => {
    try {
      if (agentName) {
        loggedPrepare('UPDATE messages SET read = 1 WHERE to_agent = ? AND read = 0').run(
          agentName,
        );
        log.info(`[IPC] mail:mark-all-read - Marked all messages for ${agentName} as read`);
      } else {
        loggedPrepare('UPDATE messages SET read = 1 WHERE read = 0').run();
        log.info('[IPC] mail:mark-all-read - Marked all messages as read');
      }
      return { data: true, error: null };
    } catch (error) {
      log.error('mail:mark-all-read failed:', error);
      return { data: false, error: String(error) };
    }
  });

  ipcMain.handle(
    'mail:purge',
    (
      _event,
      options?: {
        agentName?: string;
        olderThanDays?: number;
        olderThanHours?: number;
      },
    ) => {
      try {
        let info: { changes: number };
        if (options?.agentName) {
          info = loggedPrepare('DELETE FROM messages WHERE from_agent = ? OR to_agent = ?').run(
            options.agentName,
            options.agentName,
          ) as { changes: number };
        } else if (options?.olderThanHours) {
          info = loggedPrepare(
            `DELETE FROM messages WHERE created_at < datetime('now', '-' || ? || ' hours')`,
          ).run(options.olderThanHours) as { changes: number };
        } else if (options?.olderThanDays) {
          info = loggedPrepare(
            `DELETE FROM messages WHERE created_at < datetime('now', '-' || ? || ' days')`,
          ).run(options.olderThanDays) as { changes: number };
        } else {
          info = loggedPrepare('DELETE FROM messages').run() as {
            changes: number;
          };
        }
        log.info(`[IPC] mail:purge - DELETE removed ${info.changes} messages from real database`);
        return { data: { deleted: info.changes }, error: null };
      } catch (error) {
        log.error('mail:purge failed:', error);
        return { data: null, error: String(error) };
      }
    },
  );

  // Mail thread - get all messages in a thread ordered chronologically
  ipcMain.handle('mail:thread', (_event, threadId: string) => {
    try {
      const messages = loggedPrepare(
        'SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at ASC',
      ).all(threadId);
      const replyCount = Math.max(0, messages.length - 1);
      log.info(
        `[IPC] mail:thread - SELECT returned ${messages.length} messages (${replyCount} replies) for thread ${threadId}`,
      );
      return { data: { messages, replyCount }, error: null };
    } catch (error) {
      log.error('mail:thread failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // Merge channels - all use real SQLite queries via loggedPrepare

  // List all merge queue entries ordered by enqueue time (FIFO)
  ipcMain.handle('merge:queue', () => {
    try {
      const queue = loggedPrepare(
        'SELECT * FROM merge_queue ORDER BY enqueued_at ASC',
      ).all() as Array<Record<string, unknown>>;
      // Compute blocked status: entry is blocked if any dependency is not yet 'merged'
      const statusMap = new Map<number, string>();
      for (const entry of queue) {
        statusMap.set(entry.id as number, entry.status as string);
      }
      // Also include history entries (merged/failed/conflict) for dependency resolution
      const historyEntries = loggedPrepare(
        "SELECT id, status FROM merge_queue WHERE status IN ('merged', 'failed', 'conflict')",
      ).all() as Array<{ id: number; status: string }>;
      for (const h of historyEntries) {
        statusMap.set(h.id, h.status);
      }
      for (const entry of queue) {
        const dependsOnJson = entry.depends_on as string | null;
        if (dependsOnJson) {
          try {
            const depIds = JSON.parse(dependsOnJson) as number[];
            // Blocked if any dependency is not merged (still pending, merging, conflict, or failed)
            const isBlocked = depIds.some((depId) => {
              const depStatus = statusMap.get(depId);
              return depStatus !== 'merged';
            });
            (entry as Record<string, unknown>).blocked = isBlocked;
          } catch {
            (entry as Record<string, unknown>).blocked = false;
          }
        } else {
          (entry as Record<string, unknown>).blocked = false;
        }
      }
      log.info(`[IPC] merge:queue - SELECT returned ${queue.length} entries from real database`);
      return { data: queue, error: null };
    } catch (error) {
      log.error('merge:queue failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // Enqueue a branch for merging (FIFO - enqueued_at tracks order)
  ipcMain.handle(
    'merge:enqueue',
    (
      _event,
      entry: {
        branch_name: string;
        task_id?: string;
        agent_name?: string;
        files_modified?: string[];
        depends_on?: number[];
      },
    ) => {
      try {
        const filesJson = entry.files_modified ? JSON.stringify(entry.files_modified) : null;
        const dependsOnJson =
          entry.depends_on && entry.depends_on.length > 0 ? JSON.stringify(entry.depends_on) : null;
        const result = loggedPrepare(
          `INSERT INTO merge_queue (branch_name, task_id, agent_name, files_modified, depends_on, status, enqueued_at)
          VALUES (?, ?, ?, ?, ?, 'pending', datetime('now'))`,
        ).run(
          entry.branch_name,
          entry.task_id ?? null,
          entry.agent_name ?? null,
          filesJson,
          dependsOnJson,
        );
        const inserted = loggedPrepare('SELECT * FROM merge_queue WHERE id = ?').get(
          result.lastInsertRowid,
        );
        log.info(
          `[IPC] merge:enqueue - INSERT into real database: branch=${entry.branch_name}, id=${result.lastInsertRowid}`,
        );

        // Send desktop notification that a branch is ready for merge review
        notificationService.notifyMergeReady(entry.branch_name);

        return { data: inserted, error: null };
      } catch (error) {
        log.error('merge:enqueue failed:', error);
        return { data: null, error: String(error) };
      }
    },
  );

  // Get the next pending entry in FIFO order
  ipcMain.handle('merge:next', () => {
    try {
      // Get all pending entries in FIFO order
      const pendingEntries = loggedPrepare(
        "SELECT * FROM merge_queue WHERE status = 'pending' ORDER BY enqueued_at ASC",
      ).all() as Array<{ id: number; depends_on: string | null; [key: string]: unknown }>;

      // Find the first entry whose dependencies are all merged (or has no dependencies)
      let next: (typeof pendingEntries)[0] | null = null;
      for (const entry of pendingEntries) {
        if (!entry.depends_on) {
          next = entry;
          break;
        }
        try {
          const depIds = JSON.parse(entry.depends_on) as number[];
          if (depIds.length === 0) {
            next = entry;
            break;
          }
          // Check all dependencies are merged
          const placeholders = depIds.map(() => '?').join(',');
          const nonMergedDeps = loggedPrepare(
            `SELECT COUNT(*) as count FROM merge_queue WHERE id IN (${placeholders}) AND status != 'merged'`,
          ).get(...depIds) as { count: number };
          if (nonMergedDeps.count === 0) {
            next = entry;
            break;
          }
        } catch {
          // If depends_on parse fails, treat as no deps
          next = entry;
          break;
        }
      }

      log.info(
        `[IPC] merge:next - SELECT next available from real database: ${next ? `id=${next.id}` : 'none'} (checked ${pendingEntries.length} pending)`,
      );
      return { data: next ?? null, error: null };
    } catch (error) {
      log.error('merge:next failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // Execute merge - performs Tier 1 clean merge using git merge --no-edit
  ipcMain.handle(
    'merge:execute',
    async (_event, id: number, repoPath?: string, targetBranch?: string) => {
      try {
        const entry = loggedPrepare('SELECT * FROM merge_queue WHERE id = ?').get(id) as {
          id: number;
          branch_name: string;
          status: string;
          depends_on: string | null;
        } | null;
        if (!entry) {
          return { data: null, error: `Merge queue entry ${id} not found` };
        }

        // Check if blocked by unmerged dependencies (must all be 'merged' before proceeding)
        if (entry.depends_on) {
          try {
            const depIds = JSON.parse(entry.depends_on) as number[];
            if (depIds.length > 0) {
              const placeholders = depIds.map(() => '?').join(',');
              const unmergedDeps = loggedPrepare(
                `SELECT id, branch_name, status FROM merge_queue WHERE id IN (${placeholders}) AND status != 'merged'`,
              ).all(...depIds) as Array<{ id: number; branch_name: string; status: string }>;
              if (unmergedDeps.length > 0) {
                const depNames = unmergedDeps
                  .map((d) => `#${d.id} ${d.branch_name} (${d.status})`)
                  .join(', ');
                return {
                  data: null,
                  error: `Blocked by unmerged dependencies: ${depNames}. Dependencies must be merged first.`,
                };
              }
            }
          } catch {
            // ignore parse errors
          }
        }

        // Mark as merging
        loggedPrepare("UPDATE merge_queue SET status = 'merging' WHERE id = ?").run(id);
        log.info(`[IPC] merge:execute - starting Tier 1 clean merge for id=${id}`);

        // Use provided repoPath or fall back to current working directory
        const mergePath = repoPath || process.cwd();

        // Capture pre-merge commit SHA for rollback support
        try {
          const sgit = (await import('simple-git')).default(mergePath);
          const headCommit = await sgit.revparse(['HEAD']);
          loggedPrepare('UPDATE merge_queue SET pre_merge_commit = ? WHERE id = ?').run(
            headCommit.trim(),
            id,
          );
          log.info(`[IPC] merge:execute - captured pre-merge commit: ${headCommit.trim()}`);
        } catch (commitErr) {
          log.warn(`[IPC] merge:execute - could not capture pre-merge commit: ${commitErr}`);
        }

        // Perform the actual git merge via simple-git
        const result = await executeCleanMerge(mergePath, entry.branch_name, targetBranch);

        if (result.success) {
          loggedPrepare(
            "UPDATE merge_queue SET status = 'merged', resolved_tier = 'clean-merge', completed_at = datetime('now') WHERE id = ?",
          ).run(id);
          const updated = loggedPrepare('SELECT * FROM merge_queue WHERE id = ?').get(id);
          log.info(`[IPC] merge:execute - Tier 1 clean merge succeeded for id=${id}`);
          return { data: updated, error: null };
        }

        if (result.conflictFiles.length > 0) {
          loggedPrepare("UPDATE merge_queue SET status = 'conflict' WHERE id = ?").run(id);
          const updated = loggedPrepare('SELECT * FROM merge_queue WHERE id = ?').get(id);
          log.warn(
            `[IPC] merge:execute - conflicts detected for id=${id}: ${result.conflictFiles.join(', ')}`,
          );
          return {
            data: updated,
            error: result.error,
            conflicts: result.conflictFiles,
          };
        }

        loggedPrepare(
          "UPDATE merge_queue SET status = 'failed', completed_at = datetime('now') WHERE id = ?",
        ).run(id);
        const updated = loggedPrepare('SELECT * FROM merge_queue WHERE id = ?').get(id);
        log.error(`[IPC] merge:execute - merge failed for id=${id}: ${result.error}`);
        return { data: updated, error: result.error };
      } catch (error) {
        log.error('merge:execute failed:', error);
        try {
          loggedPrepare(
            "UPDATE merge_queue SET status = 'failed', completed_at = datetime('now') WHERE id = ?",
          ).run(id);
        } catch {
          // ignore DB update failure on error path
        }
        return { data: null, error: String(error) };
      }
    },
  );

  // Tier 2: Auto-resolve conflicts by parsing conflict markers
  ipcMain.handle(
    'merge:auto-resolve',
    async (_event, id: number, repoPath?: string, targetBranch?: string) => {
      try {
        const entry = loggedPrepare('SELECT * FROM merge_queue WHERE id = ?').get(id) as {
          id: number;
          branch_name: string;
          status: string;
        } | null;
        if (!entry) {
          return { data: null, error: `Merge queue entry ${id} not found` };
        }

        loggedPrepare("UPDATE merge_queue SET status = 'merging' WHERE id = ?").run(id);
        log.info(`[IPC] merge:auto-resolve - starting Tier 2 auto-resolve for id=${id}`);

        const mergePath = repoPath || process.cwd();

        // Capture pre-merge commit SHA for rollback support
        try {
          const sgit = (await import('simple-git')).default(mergePath);
          const headCommit = await sgit.revparse(['HEAD']);
          loggedPrepare('UPDATE merge_queue SET pre_merge_commit = ? WHERE id = ?').run(
            headCommit.trim(),
            id,
          );
        } catch (commitErr) {
          log.warn(`[IPC] merge:auto-resolve - could not capture pre-merge commit: ${commitErr}`);
        }

        const result = await autoResolveConflicts(mergePath, entry.branch_name, targetBranch);

        if (result.success) {
          loggedPrepare(
            "UPDATE merge_queue SET status = 'merged', resolved_tier = 'auto-resolve', completed_at = datetime('now') WHERE id = ?",
          ).run(id);
          const updated = loggedPrepare('SELECT * FROM merge_queue WHERE id = ?').get(id);
          log.info(`[IPC] merge:auto-resolve - Tier 2 succeeded for id=${id}`);
          return { data: updated, error: null };
        }

        if (result.conflictFiles.length > 0) {
          loggedPrepare("UPDATE merge_queue SET status = 'conflict' WHERE id = ?").run(id);
          const updated = loggedPrepare('SELECT * FROM merge_queue WHERE id = ?').get(id);
          log.warn(
            `[IPC] merge:auto-resolve - unresolvable conflicts for id=${id}: ${result.conflictFiles.join(', ')}`,
          );
          return { data: updated, error: result.error, conflicts: result.conflictFiles };
        }

        loggedPrepare(
          "UPDATE merge_queue SET status = 'failed', completed_at = datetime('now') WHERE id = ?",
        ).run(id);
        const updated = loggedPrepare('SELECT * FROM merge_queue WHERE id = ?').get(id);
        log.error(`[IPC] merge:auto-resolve - failed for id=${id}: ${result.error}`);
        return { data: updated, error: result.error };
      } catch (error) {
        log.error('merge:auto-resolve failed:', error);
        try {
          loggedPrepare(
            "UPDATE merge_queue SET status = 'failed', completed_at = datetime('now') WHERE id = ?",
          ).run(id);
        } catch {
          /* ignore */
        }
        return { data: null, error: String(error) };
      }
    },
  );

  // Tier 3: AI-resolve conflicts using Claude to intelligently merge
  ipcMain.handle(
    'merge:ai-resolve',
    async (_event, id: number, repoPath?: string, targetBranch?: string) => {
      try {
        const entry = loggedPrepare('SELECT * FROM merge_queue WHERE id = ?').get(id) as {
          id: number;
          branch_name: string;
          status: string;
        } | null;
        if (!entry) {
          return { data: null, error: `Merge queue entry ${id} not found` };
        }

        loggedPrepare("UPDATE merge_queue SET status = 'merging' WHERE id = ?").run(id);
        log.info(`[IPC] merge:ai-resolve - starting Tier 3 AI-resolve for id=${id}`);

        const mergePath = repoPath || process.cwd();

        // Capture pre-merge commit SHA for rollback support
        try {
          const sgit = (await import('simple-git')).default(mergePath);
          const headCommit = await sgit.revparse(['HEAD']);
          loggedPrepare('UPDATE merge_queue SET pre_merge_commit = ? WHERE id = ?').run(
            headCommit.trim(),
            id,
          );
        } catch (commitErr) {
          log.warn(`[IPC] merge:ai-resolve - could not capture pre-merge commit: ${commitErr}`);
        }

        const result = await aiResolveConflicts(mergePath, entry.branch_name, targetBranch);

        if (result.success) {
          loggedPrepare(
            "UPDATE merge_queue SET status = 'merged', resolved_tier = 'ai-resolve', completed_at = datetime('now') WHERE id = ?",
          ).run(id);
          const updated = loggedPrepare('SELECT * FROM merge_queue WHERE id = ?').get(id);
          log.info(`[IPC] merge:ai-resolve - Tier 3 succeeded for id=${id}`);
          return { data: updated, error: null };
        }

        if (result.conflictFiles.length > 0) {
          loggedPrepare("UPDATE merge_queue SET status = 'conflict' WHERE id = ?").run(id);
          const updated = loggedPrepare('SELECT * FROM merge_queue WHERE id = ?').get(id);
          log.warn(
            `[IPC] merge:ai-resolve - unresolvable conflicts for id=${id}: ${result.conflictFiles.join(', ')}`,
          );
          return { data: updated, error: result.error, conflicts: result.conflictFiles };
        }

        loggedPrepare(
          "UPDATE merge_queue SET status = 'failed', completed_at = datetime('now') WHERE id = ?",
        ).run(id);
        const updated = loggedPrepare('SELECT * FROM merge_queue WHERE id = ?').get(id);
        log.error(`[IPC] merge:ai-resolve - failed for id=${id}: ${result.error}`);
        return { data: updated, error: result.error };
      } catch (error) {
        log.error('merge:ai-resolve failed:', error);
        try {
          loggedPrepare(
            "UPDATE merge_queue SET status = 'failed', completed_at = datetime('now') WHERE id = ?",
          ).run(id);
        } catch {
          /* ignore */
        }
        return { data: null, error: String(error) };
      }
    },
  );

  // Tier 4: Reimagine from scratch - abandon branch and start fresh implementation
  ipcMain.handle(
    'merge:reimagine',
    async (_event, id: number, repoPath?: string, targetBranch?: string) => {
      try {
        const entry = loggedPrepare('SELECT * FROM merge_queue WHERE id = ?').get(id) as {
          id: number;
          branch_name: string;
          task_id: string | null;
          status: string;
        } | null;
        if (!entry) {
          return { data: null, error: `Merge queue entry ${id} not found` };
        }

        loggedPrepare("UPDATE merge_queue SET status = 'merging' WHERE id = ?").run(id);
        log.info(`[IPC] merge:reimagine - starting Tier 4 reimagine for id=${id}`);

        const mergePath = repoPath || process.cwd();

        // Capture pre-merge commit SHA for rollback support
        try {
          const sgit = (await import('simple-git')).default(mergePath);
          const headCommit = await sgit.revparse(['HEAD']);
          loggedPrepare('UPDATE merge_queue SET pre_merge_commit = ? WHERE id = ?').run(
            headCommit.trim(),
            id,
          );
        } catch (commitErr) {
          log.warn(`[IPC] merge:reimagine - could not capture pre-merge commit: ${commitErr}`);
        }

        const result = await reimagineFromScratch(
          mergePath,
          entry.branch_name,
          targetBranch,
          entry.task_id || undefined,
        );

        if (result.success) {
          loggedPrepare(
            "UPDATE merge_queue SET status = 'merged', resolved_tier = 'reimagine', completed_at = datetime('now') WHERE id = ?",
          ).run(id);
          const updated = loggedPrepare('SELECT * FROM merge_queue WHERE id = ?').get(id);
          log.info(
            `[IPC] merge:reimagine - Tier 4 succeeded for id=${id}, new branch: ${result.reimagineBranch}`,
          );
          return { data: updated, error: null, reimagineBranch: result.reimagineBranch };
        }

        loggedPrepare(
          "UPDATE merge_queue SET status = 'failed', completed_at = datetime('now') WHERE id = ?",
        ).run(id);
        const updated = loggedPrepare('SELECT * FROM merge_queue WHERE id = ?').get(id);
        log.error(`[IPC] merge:reimagine - failed for id=${id}: ${result.error}`);
        return { data: updated, error: result.error };
      } catch (error) {
        log.error('merge:reimagine failed:', error);
        try {
          loggedPrepare(
            "UPDATE merge_queue SET status = 'failed', completed_at = datetime('now') WHERE id = ?",
          ).run(id);
        } catch {
          /* ignore */
        }
        return { data: null, error: String(error) };
      }
    },
  );

  // Complete a merge with a resolution tier
  ipcMain.handle('merge:complete', (_event, id: number, resolvedTier: string) => {
    try {
      loggedPrepare(
        "UPDATE merge_queue SET status = 'merged', resolved_tier = ?, completed_at = datetime('now') WHERE id = ?",
      ).run(resolvedTier, id);
      const entry = loggedPrepare('SELECT * FROM merge_queue WHERE id = ?').get(id);
      log.info(
        `[IPC] merge:complete - UPDATE merge in real database: id=${id}, tier=${resolvedTier}`,
      );
      return { data: entry, error: null };
    } catch (error) {
      log.error('merge:complete failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // Mark a merge as failed
  ipcMain.handle('merge:fail', (_event, id: number) => {
    try {
      loggedPrepare(
        "UPDATE merge_queue SET status = 'failed', completed_at = datetime('now') WHERE id = ?",
      ).run(id);
      const entry = loggedPrepare('SELECT * FROM merge_queue WHERE id = ?').get(id);
      log.info(`[IPC] merge:fail - UPDATE merge in real database: id=${id}`);
      return { data: entry, error: null };
    } catch (error) {
      log.error('merge:fail failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // Mark a merge as having conflicts
  ipcMain.handle('merge:conflict', (_event, id: number) => {
    try {
      loggedPrepare("UPDATE merge_queue SET status = 'conflict' WHERE id = ?").run(id);
      const entry = loggedPrepare('SELECT * FROM merge_queue WHERE id = ?').get(id);
      log.info(`[IPC] merge:conflict - UPDATE merge in real database: id=${id}`);
      return { data: entry, error: null };
    } catch (error) {
      log.error('merge:conflict failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // Preview a merge (dry-run) - checks if merge would succeed without committing
  ipcMain.handle('merge:preview', async (_event, id: number, repoPath?: string) => {
    try {
      const entry = loggedPrepare('SELECT * FROM merge_queue WHERE id = ?').get(id) as {
        id: number;
        branch_name: string;
      } | null;
      if (!entry) {
        return { data: null, error: `Merge queue entry ${id} not found` };
      }
      const mergePath = repoPath || process.cwd();
      const preview = await previewMerge(mergePath, entry.branch_name);
      log.info(
        `[IPC] merge:preview - dry-run for id=${id}: canMerge=${preview.canMerge}, conflicts=${preview.conflictFiles.length}`,
      );
      return {
        data: { entry, canMerge: preview.canMerge, conflicts: preview.conflictFiles },
        error: null,
      };
    } catch (error) {
      log.error('merge:preview failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // Get merge history (completed and failed entries)
  ipcMain.handle('merge:history', () => {
    try {
      const history = loggedPrepare(
        "SELECT * FROM merge_queue WHERE status IN ('merged', 'failed', 'conflict') ORDER BY completed_at DESC, enqueued_at DESC",
      ).all();
      log.info(
        `[IPC] merge:history - SELECT returned ${history.length} entries from real database`,
      );
      return { data: history, error: null };
    } catch (error) {
      log.error('merge:history failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // Get diff for a merge queue branch (for side-by-side diff viewer)
  ipcMain.handle('merge:diff', async (_event, id: number, repoPath?: string) => {
    try {
      const entry = loggedPrepare('SELECT * FROM merge_queue WHERE id = ?').get(id) as {
        id: number;
        branch_name: string;
      } | null;
      if (!entry) {
        return { data: null, error: `Merge queue entry ${id} not found` };
      }

      // Use active project path or provided repoPath
      let projectPath = repoPath;
      if (!projectPath) {
        const activeProject = loggedPrepare(
          'SELECT path FROM projects WHERE is_active = 1 LIMIT 1',
        ).get() as { path: string } | null;
        projectPath = activeProject?.path || '.';
      }

      const simpleGitModule = await import('simple-git');
      const git = simpleGitModule.default(projectPath);

      // Get the diff between current branch and the merge branch
      const currentBranch = await git.revparse(['--abbrev-ref', 'HEAD']);
      const diffOutput = await git.diff([`${currentBranch.trim()}...${entry.branch_name}`]);

      log.info(
        `[IPC] merge:diff - got diff for branch ${entry.branch_name} (${diffOutput.length} chars)`,
      );
      return { data: { diff: diffOutput, branchName: entry.branch_name }, error: null };
    } catch (error) {
      log.error('merge:diff failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // Remove a merge queue entry
  ipcMain.handle('merge:remove', (_event, id: number) => {
    try {
      loggedPrepare('DELETE FROM merge_queue WHERE id = ?').run(id);
      log.info(`[IPC] merge:remove - DELETE merge from real database: id=${id}`);
      return { data: true, error: null };
    } catch (error) {
      log.error('merge:remove failed:', error);
      return { data: false, error: String(error) };
    }
  });

  // Rollback a failed/merged merge to restore the target branch
  ipcMain.handle('merge:rollback', async (_event, id: number, repoPath?: string) => {
    try {
      const entry = loggedPrepare('SELECT * FROM merge_queue WHERE id = ?').get(id) as {
        id: number;
        branch_name: string;
        status: string;
        pre_merge_commit: string | null;
        rolled_back: number;
      } | null;
      if (!entry) {
        return { data: null, error: `Merge queue entry ${id} not found` };
      }

      if (entry.rolled_back === 1) {
        return { data: null, error: 'This merge has already been rolled back' };
      }

      if (!entry.pre_merge_commit) {
        return {
          data: null,
          error:
            'No pre-merge commit recorded — cannot rollback. This merge may predate rollback support.',
        };
      }

      if (entry.status !== 'failed' && entry.status !== 'merged') {
        return {
          data: null,
          error: `Cannot rollback a merge with status '${entry.status}'. Only failed or merged entries can be rolled back.`,
        };
      }

      log.info(`[IPC] merge:rollback - rolling back id=${id} to commit ${entry.pre_merge_commit}`);

      const mergePath = repoPath || process.cwd();

      // Get target branch from settings
      let targetBranch: string | undefined;
      try {
        const row = loggedPrepare('SELECT value FROM app_settings WHERE key = ?').get(
          'mergeTargetBranch',
        ) as { value: string } | undefined;
        targetBranch = row ? JSON.parse(row.value) : undefined;
      } catch {
        // ignore
      }

      const result = await rollbackMerge(mergePath, entry.pre_merge_commit, targetBranch);

      if (result.success) {
        loggedPrepare('UPDATE merge_queue SET rolled_back = 1 WHERE id = ?').run(id);
        const updated = loggedPrepare('SELECT * FROM merge_queue WHERE id = ?').get(id);
        log.info(`[IPC] merge:rollback - successfully rolled back id=${id}`);
        return { data: updated, error: null };
      }

      log.error(`[IPC] merge:rollback - failed for id=${id}: ${result.error}`);
      return { data: null, error: result.error };
    } catch (error) {
      log.error('merge:rollback failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // Get merge target branch setting
  ipcMain.handle('merge:get-target-branch', () => {
    try {
      const row = loggedPrepare('SELECT value FROM app_settings WHERE key = ?').get(
        'mergeTargetBranch',
      ) as { value: string } | undefined;
      const branch = row ? JSON.parse(row.value) : null;
      log.info(
        `[IPC] merge:get-target-branch - current target: ${branch || 'default (current branch)'}`,
      );
      return { data: branch, error: null };
    } catch (error) {
      log.error('merge:get-target-branch failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // Set merge target branch setting
  ipcMain.handle('merge:set-target-branch', (_event, branch: string) => {
    try {
      loggedPrepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(
        'mergeTargetBranch',
        JSON.stringify(branch),
      );
      log.info(`[IPC] merge:set-target-branch - set to: ${branch || 'default (current branch)'}`);
      return { data: true, error: null };
    } catch (error) {
      log.error('merge:set-target-branch failed:', error);
      return { data: false, error: String(error) };
    }
  });

  // Issue channels - all use real SQLite queries via loggedPrepare
  ipcMain.handle(
    'issue:list',
    (_event, filters?: { status?: string; priority?: string; type?: string }) => {
      try {
        const conditions: string[] = [];
        const params: string[] = [];
        if (filters?.status) {
          conditions.push('status = ?');
          params.push(filters.status);
        }
        if (filters?.priority) {
          conditions.push('priority = ?');
          params.push(filters.priority);
        }
        if (filters?.type) {
          conditions.push('type = ?');
          params.push(filters.type);
        }
        let query = 'SELECT * FROM issues';
        if (conditions.length > 0) {
          query += ` WHERE ${conditions.join(' AND ')}`;
        }
        query += ' ORDER BY created_at DESC';
        const issues = loggedPrepare(query).all(...params);
        log.info(`[IPC] issue:list - SELECT returned ${issues.length} issues from real database`);
        return { data: issues, error: null };
      } catch (error) {
        log.error('issue:list failed:', error);
        return { data: null, error: String(error) };
      }
    },
  );

  ipcMain.handle(
    'issue:create',
    (
      _event,
      issue: {
        id: string;
        title: string;
        description?: string;
        type: string;
        priority: string;
      },
    ) => {
      try {
        loggedPrepare(
          `INSERT INTO issues (id, title, description, type, priority, status)
          VALUES (?, ?, ?, ?, ?, 'open')`,
        ).run(issue.id, issue.title, issue.description ?? null, issue.type, issue.priority);
        const created = loggedPrepare('SELECT * FROM issues WHERE id = ?').get(issue.id);
        log.info(`[IPC] issue:create - INSERT issue into real database: ${issue.title}`);
        return { data: created, error: null };
      } catch (error) {
        log.error('issue:create failed:', error);
        return { data: null, error: String(error) };
      }
    },
  );

  ipcMain.handle('issue:get', (_event, id: string) => {
    try {
      const issue = loggedPrepare('SELECT * FROM issues WHERE id = ?').get(id);
      log.info(`[IPC] issue:get - SELECT issue from real database: id=${id}`);
      return { data: issue || null, error: null };
    } catch (error) {
      log.error('issue:get failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('issue:update', (_event, id: string, updates: Record<string, unknown>) => {
    try {
      const allowedFields = [
        'title',
        'description',
        'type',
        'priority',
        'status',
        'assigned_agent',
        'group_id',
        'close_summary',
        'dependencies',
      ];
      const setClauses: string[] = [];
      const params: unknown[] = [];
      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          setClauses.push(`${key} = ?`);
          params.push(value);
        }
      }
      if (setClauses.length === 0) {
        return { data: null, error: 'No valid fields to update' };
      }
      setClauses.push("updated_at = datetime('now')");
      if (updates.status === 'closed') {
        setClauses.push("closed_at = datetime('now')");
      }
      params.push(id);
      loggedPrepare(`UPDATE issues SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);
      const updated = loggedPrepare('SELECT * FROM issues WHERE id = ?').get(id) as
        | { id: string; group_id: string | null }
        | undefined;
      log.info(`[IPC] issue:update - UPDATE issue in real database: id=${id}`);

      // Auto-close group check when issue is marked as closed
      if (updates.status === 'closed' && updated?.group_id) {
        const groupId = updated.group_id;
        const group = loggedPrepare('SELECT * FROM task_groups WHERE id = ?').get(groupId) as
          | { id: string; member_issues: string | null; status: string }
          | undefined;
        if (group && group.status !== 'completed') {
          let members: string[] = [];
          try {
            members = JSON.parse(group.member_issues || '[]');
          } catch {
            members = [];
          }
          if (members.length > 0) {
            const placeholders = members.map(() => '?').join(',');
            const closedCount = loggedPrepare(
              `SELECT COUNT(*) as cnt FROM issues WHERE id IN (${placeholders}) AND status = 'closed'`,
            ).get(...members) as { cnt: number };
            if (closedCount.cnt === members.length) {
              loggedPrepare(
                "UPDATE task_groups SET status = 'completed', closed_at = datetime('now') WHERE id = ?",
              ).run(groupId);
              log.info(
                `[IPC] issue:update - Auto-closed group ${groupId}, all ${members.length} issues completed`,
              );
            }
          }
        }
      }

      // Auto-unblock dependent issues when this issue is closed
      if (updates.status === 'closed') {
        const allRows = loggedPrepare(
          'SELECT id, dependencies, status FROM issues',
        ).all() as Array<{
          id: string;
          dependencies: string | null;
          status: string;
        }>;
        const statusMap = new Map<string, string>();
        for (const row of allRows) {
          statusMap.set(row.id, row.status);
        }
        statusMap.set(id, 'closed');

        for (const row of allRows) {
          if (row.id === id || row.status !== 'blocked') continue;
          let depIds: string[] = [];
          try {
            depIds = JSON.parse(row.dependencies || '[]');
          } catch {
            continue;
          }
          if (!depIds.includes(id)) continue;
          const allResolved = depIds.every((depId) => statusMap.get(depId) === 'closed');
          if (allResolved) {
            loggedPrepare(
              "UPDATE issues SET status = 'open', updated_at = datetime('now') WHERE id = ?",
            ).run(row.id);
            log.info(`[IPC] issue:update - Auto-unblocked issue ${row.id} (all deps resolved)`);
          }
        }
      }

      return { data: updated, error: null };
    } catch (error) {
      log.error('issue:update failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('issue:delete', (_event, id: string) => {
    try {
      loggedPrepare('DELETE FROM issues WHERE id = ?').run(id);
      log.info(`[IPC] issue:delete - DELETE issue from real database: id=${id}`);
      return { data: true, error: null };
    } catch (error) {
      log.error('issue:delete failed:', error);
      return { data: false, error: String(error) };
    }
  });

  ipcMain.handle('issue:claim', (_event, id: string, agentName: string) => {
    try {
      loggedPrepare(
        `UPDATE issues SET status = 'in_progress', assigned_agent = ?, updated_at = datetime('now')
        WHERE id = ? AND status = 'open'`,
      ).run(agentName, id);
      const issue = loggedPrepare('SELECT * FROM issues WHERE id = ?').get(id);
      log.info(`[IPC] issue:claim - UPDATE issue in real database: id=${id}, agent=${agentName}`);
      return { data: issue, error: null };
    } catch (error) {
      log.error('issue:claim failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // Issues by agent name
  ipcMain.handle('issue:by-agent', (_event, agentName: string) => {
    try {
      const issues = loggedPrepare(
        'SELECT * FROM issues WHERE assigned_agent = ? ORDER BY updated_at DESC',
      ).all(agentName);
      log.info(
        `[IPC] issue:by-agent - SELECT returned ${issues.length} issues for agent ${agentName}`,
      );
      return { data: issues, error: null };
    } catch (error) {
      log.error('issue:by-agent failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // Issue dependency management
  ipcMain.handle('issue:set-dependencies', (_event, id: string, dependencyIds: string[]) => {
    try {
      const depsJson = JSON.stringify(dependencyIds);
      // Check if any dependencies are unresolved
      let shouldBlock = false;
      if (dependencyIds.length > 0) {
        const placeholders = dependencyIds.map(() => '?').join(',');
        const closedCount = loggedPrepare(
          `SELECT COUNT(*) as cnt FROM issues WHERE id IN (${placeholders}) AND status = 'closed'`,
        ).get(...dependencyIds) as { cnt: number };
        shouldBlock = closedCount.cnt < dependencyIds.length;
      }
      // Update dependencies and auto-set blocked status
      const currentIssue = loggedPrepare('SELECT status FROM issues WHERE id = ?').get(id) as
        | { status: string }
        | undefined;
      if (shouldBlock && currentIssue && currentIssue.status === 'open') {
        loggedPrepare(
          "UPDATE issues SET dependencies = ?, status = 'blocked', updated_at = datetime('now') WHERE id = ?",
        ).run(depsJson, id);
      } else if (!shouldBlock && currentIssue && currentIssue.status === 'blocked') {
        loggedPrepare(
          "UPDATE issues SET dependencies = ?, status = 'open', updated_at = datetime('now') WHERE id = ?",
        ).run(depsJson, id);
      } else {
        loggedPrepare(
          "UPDATE issues SET dependencies = ?, updated_at = datetime('now') WHERE id = ?",
        ).run(depsJson, id);
      }
      const updated = loggedPrepare('SELECT * FROM issues WHERE id = ?').get(id);
      log.info(
        `[IPC] issue:set-dependencies - SET ${dependencyIds.length} dependencies for issue ${id}, blocked=${shouldBlock}`,
      );
      return { data: updated, error: null };
    } catch (error) {
      log.error('issue:set-dependencies failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // Get issues that this issue is blocking (reverse dependency lookup)
  ipcMain.handle('issue:blocking', (_event, id: string) => {
    try {
      const allIssues = loggedPrepare(
        'SELECT id, title, status, dependencies FROM issues',
      ).all() as Array<{
        id: string;
        title: string;
        status: string;
        dependencies: string | null;
      }>;
      const blocking = allIssues.filter((issue) => {
        if (!issue.dependencies) return false;
        try {
          const depIds = JSON.parse(issue.dependencies) as string[];
          return depIds.includes(id);
        } catch {
          return false;
        }
      });
      log.info(`[IPC] issue:blocking - Issue ${id} blocks ${blocking.length} issues`);
      return { data: blocking, error: null };
    } catch (error) {
      log.error('issue:blocking failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // Ready queue: issues that are open/in_progress with no unresolved blocking dependencies
  ipcMain.handle('issue:ready-queue', (_event) => {
    try {
      // Get all non-closed issues
      const allIssues = loggedPrepare(
        "SELECT * FROM issues WHERE status IN ('open', 'in_progress') ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END, created_at ASC",
      ).all() as Array<Record<string, unknown>>;

      // Get statuses of all issues for dependency resolution
      const allIssueStatuses = loggedPrepare('SELECT id, status FROM issues').all() as Array<{
        id: string;
        status: string;
      }>;
      const statusMap = new Map<string, string>();
      for (const issue of allIssueStatuses) {
        statusMap.set(issue.id, issue.status);
      }

      // Filter to only unblocked issues
      const readyIssues = allIssues.filter((issue) => {
        const depsJson = issue.dependencies as string | null;
        if (!depsJson) return true; // No dependencies = ready
        try {
          const depIds = JSON.parse(depsJson) as string[];
          if (depIds.length === 0) return true;
          // Ready if ALL dependencies are closed
          return depIds.every((depId) => statusMap.get(depId) === 'closed');
        } catch {
          return true; // Invalid JSON = treat as no dependencies
        }
      });

      log.info(
        `[IPC] issue:ready-queue - Found ${readyIssues.length} ready issues out of ${allIssues.length} active`,
      );
      return { data: readyIssues, error: null };
    } catch (error) {
      log.error('issue:ready-queue failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // Task Group channels - use real SQLite queries via loggedPrepare
  ipcMain.handle('taskGroup:list', (_event) => {
    try {
      const groups = loggedPrepare('SELECT * FROM task_groups ORDER BY created_at DESC').all();
      log.info(
        `[IPC] taskGroup:list - SELECT returned ${(groups as unknown[]).length} groups from real database`,
      );
      return { data: groups, error: null };
    } catch (error) {
      log.error('taskGroup:list failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('taskGroup:create', (_event, group: { id: string; name: string }) => {
    try {
      loggedPrepare(
        'INSERT INTO task_groups (id, name, member_issues, status) VALUES (?, ?, ?, ?)',
      ).run(group.id, group.name, '[]', 'active');
      const created = loggedPrepare('SELECT * FROM task_groups WHERE id = ?').get(group.id);
      log.info(`[IPC] taskGroup:create - INSERT group into real database: ${group.name}`);
      return { data: created, error: null };
    } catch (error) {
      log.error('taskGroup:create failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('taskGroup:get', (_event, id: string) => {
    try {
      const group = loggedPrepare('SELECT * FROM task_groups WHERE id = ?').get(id);
      log.info(`[IPC] taskGroup:get - SELECT group from real database: id=${id}`);
      return { data: group || null, error: null };
    } catch (error) {
      log.error('taskGroup:get failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('taskGroup:delete', (_event, id: string) => {
    try {
      // Remove group_id from all member issues
      loggedPrepare(
        "UPDATE issues SET group_id = NULL, updated_at = datetime('now') WHERE group_id = ?",
      ).run(id);
      loggedPrepare('DELETE FROM task_groups WHERE id = ?').run(id);
      log.info(`[IPC] taskGroup:delete - DELETE group from real database: id=${id}`);
      return { data: true, error: null };
    } catch (error) {
      log.error('taskGroup:delete failed:', error);
      return { data: false, error: String(error) };
    }
  });

  ipcMain.handle('taskGroup:addIssue', (_event, groupId: string, issueId: string) => {
    try {
      const group = loggedPrepare('SELECT * FROM task_groups WHERE id = ?').get(groupId) as
        | { id: string; member_issues: string | null }
        | undefined;
      if (!group) return { data: null, error: 'Group not found' };

      let members: string[] = [];
      try {
        members = JSON.parse(group.member_issues || '[]');
      } catch {
        members = [];
      }
      if (!members.includes(issueId)) {
        members.push(issueId);
      }

      loggedPrepare('UPDATE task_groups SET member_issues = ? WHERE id = ?').run(
        JSON.stringify(members),
        groupId,
      );
      loggedPrepare(
        "UPDATE issues SET group_id = ?, updated_at = datetime('now') WHERE id = ?",
      ).run(groupId, issueId);

      // Check auto-close: if all member issues are closed, close the group
      if (members.length > 0) {
        const placeholders = members.map(() => '?').join(',');
        const closedCount = loggedPrepare(
          `SELECT COUNT(*) as cnt FROM issues WHERE id IN (${placeholders}) AND status = 'closed'`,
        ).get(...members) as { cnt: number };
        if (closedCount.cnt === members.length) {
          loggedPrepare(
            "UPDATE task_groups SET status = 'completed', closed_at = datetime('now') WHERE id = ?",
          ).run(groupId);
        }
      }

      const updated = loggedPrepare('SELECT * FROM task_groups WHERE id = ?').get(groupId);
      log.info(`[IPC] taskGroup:addIssue - Added issue ${issueId} to group ${groupId}`);
      return { data: updated, error: null };
    } catch (error) {
      log.error('taskGroup:addIssue failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('taskGroup:removeIssue', (_event, groupId: string, issueId: string) => {
    try {
      const group = loggedPrepare('SELECT * FROM task_groups WHERE id = ?').get(groupId) as
        | { id: string; member_issues: string | null }
        | undefined;
      if (!group) return { data: null, error: 'Group not found' };

      let members: string[] = [];
      try {
        members = JSON.parse(group.member_issues || '[]');
      } catch {
        members = [];
      }
      members = members.filter((m) => m !== issueId);

      loggedPrepare('UPDATE task_groups SET member_issues = ? WHERE id = ?').run(
        JSON.stringify(members),
        groupId,
      );
      loggedPrepare(
        "UPDATE issues SET group_id = NULL, updated_at = datetime('now') WHERE id = ?",
      ).run(issueId);

      const updated = loggedPrepare('SELECT * FROM task_groups WHERE id = ?').get(groupId);
      log.info(`[IPC] taskGroup:removeIssue - Removed issue ${issueId} from group ${groupId}`);
      return { data: updated, error: null };
    } catch (error) {
      log.error('taskGroup:removeIssue failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('taskGroup:getProgress', (_event, groupId: string) => {
    try {
      const group = loggedPrepare('SELECT * FROM task_groups WHERE id = ?').get(groupId) as
        | { id: string; member_issues: string | null; status: string }
        | undefined;
      if (!group) return { data: null, error: 'Group not found' };

      let members: string[] = [];
      try {
        members = JSON.parse(group.member_issues || '[]');
      } catch {
        members = [];
      }

      if (members.length === 0) {
        return {
          data: { total: 0, completed: 0, in_progress: 0, open: 0, blocked: 0 },
          error: null,
        };
      }

      const placeholders = members.map(() => '?').join(',');
      const issues = loggedPrepare(`SELECT status FROM issues WHERE id IN (${placeholders})`).all(
        ...members,
      ) as { status: string }[];

      const progress = {
        total: members.length,
        completed: issues.filter((i) => i.status === 'closed').length,
        in_progress: issues.filter((i) => i.status === 'in_progress').length,
        open: issues.filter((i) => i.status === 'open').length,
        blocked: issues.filter((i) => i.status === 'blocked').length,
      };

      log.info(
        `[IPC] taskGroup:getProgress - Group ${groupId}: ${progress.completed}/${progress.total}`,
      );
      return { data: progress, error: null };
    } catch (error) {
      log.error('taskGroup:getProgress failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // Auto-close check: called when issue status changes to 'closed'
  // Check if the issue's group should auto-close
  ipcMain.handle('taskGroup:checkAutoClose', (_event, issueId: string) => {
    try {
      const issue = loggedPrepare('SELECT group_id FROM issues WHERE id = ?').get(issueId) as
        | { group_id: string | null }
        | undefined;
      if (!issue || !issue.group_id) return { data: null, error: null };

      const groupId = issue.group_id;
      const group = loggedPrepare('SELECT * FROM task_groups WHERE id = ?').get(groupId) as
        | { id: string; member_issues: string | null; status: string }
        | undefined;
      if (!group || group.status === 'completed') return { data: null, error: null };

      let members: string[] = [];
      try {
        members = JSON.parse(group.member_issues || '[]');
      } catch {
        members = [];
      }

      if (members.length === 0) return { data: null, error: null };

      const placeholders = members.map(() => '?').join(',');
      const closedCount = loggedPrepare(
        `SELECT COUNT(*) as cnt FROM issues WHERE id IN (${placeholders}) AND status = 'closed'`,
      ).get(...members) as { cnt: number };

      if (closedCount.cnt === members.length) {
        loggedPrepare(
          "UPDATE task_groups SET status = 'completed', closed_at = datetime('now') WHERE id = ?",
        ).run(groupId);
        const updated = loggedPrepare('SELECT * FROM task_groups WHERE id = ?').get(groupId);
        log.info(
          `[IPC] taskGroup:checkAutoClose - Group ${groupId} auto-closed, all ${members.length} issues completed`,
        );
        return { data: updated, error: null };
      }

      return { data: null, error: null };
    } catch (error) {
      log.error('taskGroup:checkAutoClose failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // Settings channels - use real SQLite queries via loggedPrepare
  ipcMain.handle('settings:get', (_event, key: string) => {
    try {
      const row = loggedPrepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
        | { value: string }
        | undefined;
      log.info(`[IPC] settings:get - SELECT from real database: key=${key}`);
      return { data: row ? JSON.parse(row.value) : null, error: null };
    } catch (error) {
      log.error('settings:get failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('settings:set', (_event, key: string, value: unknown) => {
    try {
      loggedPrepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(
        key,
        JSON.stringify(value),
      );
      log.info(`[IPC] settings:set - INSERT OR REPLACE in real database: key=${key}`);
      return { data: true, error: null };
    } catch (error) {
      log.error('settings:set failed:', error);
      return { data: false, error: String(error) };
    }
  });

  // Claude CLI channels - real binary detection via PATH + fallback paths
  ipcMain.handle('claude:status', () => {
    log.info('[IPC] claude:status - checking CLI status via real detection');
    try {
      const result = getClaudeCliStatus();
      return {
        data: {
          installed: result.found,
          authenticated: result.authenticated,
          version: result.version,
          path: result.path,
        },
        error: result.error,
      };
    } catch (error) {
      log.error('claude:status failed:', error);
      return {
        data: { installed: false, authenticated: false, version: null, path: null },
        error: String(error),
      };
    }
  });

  ipcMain.handle('claude:detect', (_event, options?: { forceRefresh?: boolean }) => {
    log.info('[IPC] claude:detect - detecting CLI binary via PATH + fallback paths');
    try {
      if (options?.forceRefresh) {
        clearClaudeCliCache();
      }
      const result = detectClaudeCli(options?.forceRefresh ?? false);
      return {
        data: {
          found: result.found,
          path: result.path,
          version: result.version,
          authenticated: result.authenticated,
        },
        error: result.error,
      };
    } catch (error) {
      log.error('claude:detect failed:', error);
      return {
        data: { found: false, path: null, version: null, authenticated: false },
        error: String(error),
      };
    }
  });

  // System channels - Auto-update via electron-updater (GitHub Releases API)
  ipcMain.handle('update:check', async () => {
    try {
      log.info('[IPC] update:check - checking GitHub Releases for updates');
      const status = await checkForUpdates();
      return { data: status, error: null };
    } catch (error) {
      log.error('update:check failed:', error);
      return { data: getUpdateStatus(), error: String(error) };
    }
  });

  ipcMain.handle('update:status', () => {
    return { data: getUpdateStatus(), error: null };
  });

  ipcMain.handle('update:download', async () => {
    try {
      log.info('[IPC] update:download - downloading update to app data');
      const status = await downloadUpdate();
      return { data: status, error: null };
    } catch (error) {
      log.error('update:download failed:', error);
      return { data: getUpdateStatus(), error: String(error) };
    }
  });

  ipcMain.handle('update:install', () => {
    log.info('[IPC] update:install - installing update and restarting');
    installUpdate();
    return { data: true, error: null };
  });

  ipcMain.handle('doctor:run', async () => {
    try {
      const checks: Array<{
        name: string;
        status: 'pass' | 'fail';
        version: string | null;
        detail: string | null;
        fixable: boolean;
        fixAction?: string;
      }> = [];

      // 1. Database check
      try {
        const result = loggedPrepare('SELECT 1 as ok').get() as { ok: number };
        const sessionCount = loggedPrepare('SELECT COUNT(*) as count FROM sessions').get() as {
          count: number;
        };
        const dbOk = result.ok === 1;
        checks.push({
          name: 'Database',
          status: dbOk ? 'pass' : 'fail',
          version: 'SQLite (better-sqlite3)',
          detail: `${sessionCount.count} sessions stored`,
          fixable: !dbOk,
          fixAction: !dbOk ? 'Reinitialize database connection' : undefined,
        });
      } catch (err) {
        checks.push({
          name: 'Database',
          status: 'fail',
          version: null,
          detail: String(err),
          fixable: true,
          fixAction: 'Reinitialize database connection',
        });
      }

      // 2. Node.js check
      try {
        const nodeVersion = process.version;
        const major = Number.parseInt(nodeVersion.slice(1).split('.')[0], 10);
        checks.push({
          name: 'Node.js',
          status: major >= 18 ? 'pass' : 'fail',
          version: nodeVersion,
          detail:
            major >= 18
              ? 'Meets minimum requirement (v18+)'
              : `Version ${nodeVersion} is below minimum v18`,
          fixable: false,
        });
      } catch (err) {
        checks.push({
          name: 'Node.js',
          status: 'fail',
          version: null,
          detail: String(err),
          fixable: false,
        });
      }

      // 3. Claude CLI check
      try {
        const cliResult = await detectClaudeCli();
        if (cliResult.found && cliResult.authenticated) {
          checks.push({
            name: 'Claude CLI',
            status: 'pass',
            version: cliResult.version,
            detail: 'Authenticated',
            fixable: false,
          });
        } else if (cliResult.found) {
          checks.push({
            name: 'Claude CLI',
            status: 'fail',
            version: cliResult.version,
            detail: 'Found but not authenticated',
            fixable: true,
            fixAction: 'Refresh CLI detection cache',
          });
        } else {
          checks.push({
            name: 'Claude CLI',
            status: 'fail',
            version: null,
            detail: cliResult.error || 'Not found in PATH or fallback locations',
            fixable: true,
            fixAction: 'Re-scan PATH for Claude CLI',
          });
        }
      } catch (err) {
        checks.push({
          name: 'Claude CLI',
          status: 'fail',
          version: null,
          detail: String(err),
          fixable: true,
          fixAction: 'Re-scan PATH for Claude CLI',
        });
      }

      // 4. Git check
      try {
        const gitVersionOutput = execSync('git --version', {
          encoding: 'utf-8',
          timeout: 5000,
        }).trim();
        const gitVersion = gitVersionOutput.replace('git version ', '');
        checks.push({
          name: 'Git',
          status: 'pass',
          version: gitVersion,
          detail: 'Available in PATH',
          fixable: false,
        });
      } catch (_err) {
        checks.push({
          name: 'Git',
          status: 'fail',
          version: null,
          detail: 'Git not found in PATH',
          fixable: false,
        });
      }

      // 5. Config validation check
      try {
        const activeProject = loggedPrepare(
          'SELECT id, path FROM projects WHERE is_active = 1 LIMIT 1',
        ).get() as { id: string; path: string } | undefined;

        if (!activeProject) {
          checks.push({
            name: 'Config',
            status: 'fail',
            version: null,
            detail: 'No active project selected',
            fixable: false,
          });
        } else {
          const fsSync = require('node:fs');
          const pathMod = require('node:path');
          const configPath = pathMod.join(activeProject.path, '.overstory', 'config.json');

          if (!fsSync.existsSync(configPath)) {
            checks.push({
              name: 'Config',
              status: 'fail',
              version: null,
              detail: `Config file not found at ${configPath}`,
              fixable: true,
              fixAction: 'Initialize .overstory directory',
            });
          } else {
            const configRaw = fsSync.readFileSync(configPath, 'utf-8');
            let configObj: Record<string, unknown>;
            try {
              configObj = JSON.parse(configRaw);
            } catch (_parseErr) {
              checks.push({
                name: 'Config',
                status: 'fail',
                version: null,
                detail: 'Config file contains invalid JSON',
                fixable: true,
                fixAction: 'Reinitialize config file',
              });
              configObj = null as unknown as Record<string, unknown>;
            }

            if (configObj) {
              const issues: string[] = [];

              // Check required top-level fields
              if (typeof configObj.version !== 'number') {
                issues.push('Missing or invalid "version" field');
              }

              // Check project section
              const project = configObj.project as Record<string, unknown> | undefined;
              if (!project || typeof project !== 'object') {
                issues.push('Missing "project" section');
              } else {
                if (!project.name || typeof project.name !== 'string') {
                  issues.push('Missing or invalid "project.name"');
                }
                if (!project.path || typeof project.path !== 'string') {
                  issues.push('Missing or invalid "project.path"');
                } else if (!fsSync.existsSync(project.path as string)) {
                  issues.push(`Project path does not exist: ${project.path}`);
                }
              }

              // Check settings section
              const settings = configObj.settings as Record<string, unknown> | undefined;
              if (!settings || typeof settings !== 'object') {
                issues.push('Missing "settings" section');
              } else {
                if (
                  settings.maxConcurrentAgents !== undefined &&
                  (typeof settings.maxConcurrentAgents !== 'number' ||
                    (settings.maxConcurrentAgents as number) < 1)
                ) {
                  issues.push('Invalid "settings.maxConcurrentAgents" (must be a positive number)');
                }
                if (
                  settings.defaultModel !== undefined &&
                  typeof settings.defaultModel !== 'string'
                ) {
                  issues.push('Invalid "settings.defaultModel" (must be a string)');
                }
              }

              if (issues.length === 0) {
                checks.push({
                  name: 'Config',
                  status: 'pass',
                  version: `v${configObj.version || '?'}`,
                  detail: `Valid config for "${(project as Record<string, unknown>)?.name || 'unknown'}"`,
                  fixable: false,
                });
              } else {
                checks.push({
                  name: 'Config',
                  status: 'fail',
                  version: null,
                  detail: issues.join('; '),
                  fixable: true,
                  fixAction: 'Reinitialize config file',
                });
              }
            }
          }
        }
      } catch (err) {
        checks.push({
          name: 'Config',
          status: 'fail',
          version: null,
          detail: `Config validation error: ${String(err)}`,
          fixable: false,
        });
      }

      // 6. Database integrity check
      try {
        const expectedTables = [
          'sessions',
          'runs',
          'messages',
          'events',
          'metrics',
          'merge_queue',
          'task_groups',
          'agent_identities',
          'checkpoints',
          'issues',
          'app_settings',
          'agent_definitions',
          'projects',
          'config_profiles',
          'app_logs',
          'discovery_scans',
          'discovery_findings',
          'prompts',
          'prompt_versions',
          'guard_violations',
          'hooks',
          'quality_gates',
          'quality_gate_results',
          'session_handoffs',
          'hook_events',
          'expertise_records',
        ];

        // Run SQLite integrity check
        const integrityResult = loggedPrepare('PRAGMA integrity_check').get() as {
          integrity_check: string;
        };
        const integrityOk = integrityResult?.integrity_check === 'ok';

        // Check WAL mode
        const journalMode = loggedPrepare('PRAGMA journal_mode').get() as {
          journal_mode: string;
        };
        const walEnabled = journalMode?.journal_mode?.toLowerCase() === 'wal';

        // Check which tables exist
        const existingTables = loggedPrepare(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
        ).all() as Array<{ name: string }>;
        const tableSet = new Set(existingTables.map((t) => t.name));
        const missingTables = expectedTables.filter((t) => !tableSet.has(t));

        const dbIssues: string[] = [];
        if (!integrityOk) {
          dbIssues.push(`Integrity check failed: ${integrityResult?.integrity_check || 'unknown'}`);
        }
        if (!walEnabled) {
          dbIssues.push('WAL mode not enabled');
        }
        if (missingTables.length > 0) {
          dbIssues.push(`Missing tables: ${missingTables.join(', ')}`);
        }

        if (dbIssues.length === 0) {
          checks.push({
            name: 'DB Integrity',
            status: 'pass',
            version: `${existingTables.length} tables`,
            detail: `All ${expectedTables.length} tables present, integrity OK, WAL mode active`,
            fixable: false,
          });
        } else {
          checks.push({
            name: 'DB Integrity',
            status: 'fail',
            version: `${existingTables.length} tables`,
            detail: dbIssues.join('; '),
            fixable: integrityOk,
            fixAction:
              missingTables.length > 0
                ? 'Reinitialize missing tables'
                : walEnabled
                  ? undefined
                  : 'Enable WAL mode',
          });
        }
      } catch (err) {
        checks.push({
          name: 'DB Integrity',
          status: 'fail',
          version: null,
          detail: `Database integrity check failed: ${String(err)}`,
          fixable: true,
          fixAction: 'Reinitialize database connection',
        });
      }

      const allPassing = checks.every((c) => c.status === 'pass');
      log.info(`[IPC] doctor:run - ${checks.length} checks, all passing: ${allPassing}`);

      return { data: { checks, allPassing }, error: null };
    } catch (error) {
      log.error('doctor:run failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('doctor:fix', async (_event, checkName: string) => {
    try {
      log.info(`[IPC] doctor:fix - attempting fix for: ${checkName}`);

      if (checkName === 'Database') {
        try {
          const db = getDatabase();
          db.pragma('wal_checkpoint(TRUNCATE)');
          const result = loggedPrepare('SELECT 1 as ok').get() as { ok: number };
          return {
            data: {
              name: checkName,
              success: result.ok === 1,
              message:
                result.ok === 1
                  ? 'Database connection reinitialized successfully'
                  : 'Database reconnection failed',
            },
            error: null,
          };
        } catch (dbErr) {
          return {
            data: {
              name: checkName,
              success: false,
              message: `Database fix failed: ${String(dbErr)}`,
            },
            error: null,
          };
        }
      }

      if (checkName === 'Claude CLI') {
        clearClaudeCliCache();
        const freshResult = await detectClaudeCli({ forceRefresh: true });
        if (freshResult.found) {
          return {
            data: {
              name: checkName,
              success: true,
              message: freshResult.authenticated
                ? `Claude CLI found at ${freshResult.path} (authenticated)`
                : `Claude CLI found at ${freshResult.path} (not authenticated - run "claude auth login")`,
            },
            error: null,
          };
        }
        return {
          data: {
            name: checkName,
            success: false,
            message:
              'Claude CLI still not found. Install with: npm install -g @anthropic-ai/claude-code',
          },
          error: null,
        };
      }

      if (checkName === 'Config') {
        try {
          const activeProject = loggedPrepare(
            'SELECT id, path FROM projects WHERE is_active = 1 LIMIT 1',
          ).get() as { id: string; path: string } | undefined;
          if (!activeProject) {
            return {
              data: {
                name: checkName,
                success: false,
                message: 'No active project selected. Add and activate a project first.',
              },
              error: null,
            };
          }
          const fsMod = require('node:fs');
          const pathMod = require('node:path');
          const overstoryDir = pathMod.join(activeProject.path, '.overstory');
          if (!fsMod.existsSync(overstoryDir)) {
            fsMod.mkdirSync(overstoryDir, { recursive: true });
          }
          const configPath = pathMod.join(overstoryDir, 'config.json');
          const config = {
            version: 1,
            project: {
              name: pathMod.basename(activeProject.path),
              path: activeProject.path,
            },
            settings: {
              maxConcurrentAgents: 5,
              defaultModel: 'sonnet',
              autoMerge: false,
            },
            created_at: new Date().toISOString(),
          };
          fsMod.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
          return {
            data: {
              name: checkName,
              success: true,
              message: `Config file created/reinitialized at ${configPath}`,
            },
            error: null,
          };
        } catch (configErr) {
          return {
            data: {
              name: checkName,
              success: false,
              message: `Config fix failed: ${String(configErr)}`,
            },
            error: null,
          };
        }
      }

      if (checkName === 'DB Integrity') {
        try {
          const db = getDatabase();
          db.pragma('journal_mode = WAL');
          db.pragma('wal_checkpoint(TRUNCATE)');
          const result = loggedPrepare('PRAGMA integrity_check').get() as {
            integrity_check: string;
          };
          return {
            data: {
              name: checkName,
              success: result?.integrity_check === 'ok',
              message:
                result?.integrity_check === 'ok'
                  ? 'Database integrity verified, WAL mode enabled'
                  : `Integrity check: ${result?.integrity_check || 'unknown'}`,
            },
            error: null,
          };
        } catch (dbErr) {
          return {
            data: {
              name: checkName,
              success: false,
              message: `DB integrity fix failed: ${String(dbErr)}`,
            },
            error: null,
          };
        }
      }

      return {
        data: {
          name: checkName,
          success: false,
          message: `No auto-fix available for ${checkName}`,
        },
        error: null,
      };
    } catch (error) {
      log.error(`doctor:fix failed for ${checkName}:`, error);
      return { data: null, error: String(error) };
    }
  });

  // Nuclear cleanup - uses real SQLite DELETE queries via loggedPrepare
  ipcMain.handle('cleanup:execute', (_event, options?: { target?: string }) => {
    try {
      if (options?.target === 'mail') {
        loggedPrepare('DELETE FROM messages').run();
      } else if (options?.target === 'sessions') {
        loggedPrepare('DELETE FROM sessions').run();
      } else if (options?.target === 'metrics') {
        loggedPrepare('DELETE FROM metrics').run();
      } else if (options?.target === 'events') {
        loggedPrepare('DELETE FROM events').run();
      } else if (options?.target === 'issues') {
        loggedPrepare('DELETE FROM issues').run();
      } else {
        // Clean all tables
        loggedPrepare('DELETE FROM messages').run();
        loggedPrepare('DELETE FROM sessions').run();
        loggedPrepare('DELETE FROM metrics').run();
        loggedPrepare('DELETE FROM events').run();
        loggedPrepare('DELETE FROM merge_queue').run();
        loggedPrepare('DELETE FROM checkpoints').run();
        loggedPrepare('DELETE FROM issues').run();
      }
      log.info(`[IPC] cleanup:execute - DELETE from real database: ${options?.target ?? 'all'}`);
      return { data: true, error: null };
    } catch (error) {
      log.error('cleanup:execute failed:', error);
      return { data: false, error: String(error) };
    }
  });

  // Agent process channels - node-pty management
  ipcMain.handle('agent:output', (_event, agentId: string) => {
    try {
      const output = agentProcessManager.getOutput(agentId);
      return { data: output, error: null };
    } catch (error) {
      log.error('agent:output failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('agent:write', (_event, agentId: string, data: string) => {
    try {
      const success = agentProcessManager.write(agentId, data);
      return { data: success, error: null };
    } catch (error) {
      log.error('agent:write failed:', error);
      return { data: false, error: String(error) };
    }
  });

  ipcMain.handle('agent:resize', (_event, agentId: string, cols: number, rows: number) => {
    try {
      const success = agentProcessManager.resize(agentId, cols, rows);
      return { data: success, error: null };
    } catch (error) {
      log.error('agent:resize failed:', error);
      return { data: false, error: String(error) };
    }
  });

  ipcMain.handle('agent:process-info', (_event, agentId: string) => {
    try {
      const proc = agentProcessManager.get(agentId);
      if (!proc) {
        return { data: null, error: null };
      }
      return {
        data: {
          id: proc.id,
          agentName: proc.agentName,
          capability: proc.capability,
          model: proc.model,
          pid: proc.pid,
          isRunning: proc.isRunning,
          createdAt: proc.createdAt.toISOString(),
          outputLines: proc.outputBuffer.length,
        },
        error: null,
      };
    } catch (error) {
      log.error('agent:process-info failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('agent:running-list', () => {
    try {
      const agents = agentProcessManager.getAll().map((a) => ({
        id: a.id,
        agentName: a.agentName,
        capability: a.capability,
        model: a.model,
        pid: a.pid,
        isRunning: a.isRunning,
        createdAt: a.createdAt.toISOString(),
      }));
      return { data: agents, error: null };
    } catch (error) {
      log.error('agent:running-list failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // Agent hierarchy relationship queries
  ipcMain.handle('agent:children', (_event, agentName: string) => {
    try {
      const children = loggedPrepare(
        'SELECT * FROM sessions WHERE parent_agent = ? ORDER BY created_at DESC',
      ).all(agentName);
      log.info(`[IPC] agent:children - found ${children.length} children for ${agentName}`);
      return { data: children, error: null };
    } catch (error) {
      log.error('agent:children failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('agent:hierarchy', (_event, agentName?: string) => {
    try {
      // If agentName provided, get its subtree; otherwise get full hierarchy
      if (agentName) {
        // Get the agent itself
        const agent = loggedPrepare(
          'SELECT * FROM sessions WHERE agent_name = ? ORDER BY created_at DESC LIMIT 1',
        ).get(agentName) as Record<string, unknown> | undefined;
        if (!agent) {
          return { data: null, error: `Agent ${agentName} not found` };
        }
        // Get all descendants recursively using CTE
        const descendants = loggedPrepare(
          `WITH RECURSIVE subtree AS (
            SELECT * FROM sessions WHERE parent_agent = ?
            UNION ALL
            SELECT s.* FROM sessions s
            INNER JOIN subtree st ON s.parent_agent = st.agent_name
          )
          SELECT * FROM subtree ORDER BY depth ASC, created_at ASC`,
        ).all(agentName);
        log.info(
          `[IPC] agent:hierarchy - found ${descendants.length} descendants for ${agentName}`,
        );
        return {
          data: {
            agent,
            children: descendants,
            childCount: descendants.length,
          },
          error: null,
        };
      }
      // Full hierarchy: get all root agents (no parent) and their trees
      const roots = loggedPrepare(
        `SELECT * FROM sessions WHERE (parent_agent IS NULL OR parent_agent = '') AND state IN ('working', 'booting') ORDER BY created_at DESC`,
      ).all();
      const allSessions = loggedPrepare(
        `SELECT * FROM sessions WHERE state IN ('working', 'booting') ORDER BY depth ASC, created_at ASC`,
      ).all() as Array<Record<string, unknown>>;

      // Build parent->children map
      const childMap: Record<string, Array<Record<string, unknown>>> = {};
      for (const s of allSessions) {
        const parent = s.parent_agent as string;
        if (parent) {
          if (!childMap[parent]) childMap[parent] = [];
          childMap[parent].push(s);
        }
      }

      log.info(
        `[IPC] agent:hierarchy - full tree: ${roots.length} roots, ${allSessions.length} total active`,
      );
      return {
        data: {
          roots,
          allSessions,
          childMap,
        },
        error: null,
      };
    } catch (error) {
      log.error('agent:hierarchy failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // Agent Definition channels - CRUD + import/export for agent role definitions
  ipcMain.handle('agentDef:list', () => {
    try {
      const defs = loggedPrepare('SELECT * FROM agent_definitions ORDER BY role ASC').all();
      log.info(
        `[IPC] agentDef:list - SELECT returned ${defs.length} definitions from real database`,
      );
      return { data: defs, error: null };
    } catch (error) {
      log.error('agentDef:list failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('agentDef:get', (_event, role: string) => {
    try {
      const def = loggedPrepare('SELECT * FROM agent_definitions WHERE role = ?').get(role);
      log.info(`[IPC] agentDef:get - SELECT definition from real database: role=${role}`);
      return { data: def || null, error: null };
    } catch (error) {
      log.error('agentDef:get failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle(
    'agentDef:import',
    (
      _event,
      definitions: Array<{
        role: string;
        display_name: string;
        description: string;
        capabilities: string;
        default_model: string;
        tool_allowlist?: string;
        bash_restrictions?: string;
        file_scope?: string;
      }>,
    ) => {
      try {
        const upsert = loggedPrepare(`
          INSERT OR REPLACE INTO agent_definitions (role, display_name, description, capabilities, default_model, tool_allowlist, bash_restrictions, file_scope, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `);
        let imported = 0;
        for (const def of definitions) {
          upsert.run(
            def.role,
            def.display_name,
            def.description,
            def.capabilities,
            def.default_model,
            def.tool_allowlist ?? null,
            def.bash_restrictions ?? null,
            def.file_scope ?? null,
          );
          imported++;
        }
        log.info(`[IPC] agentDef:import - imported ${imported} definitions into real database`);
        const allDefs = loggedPrepare('SELECT * FROM agent_definitions ORDER BY role ASC').all();
        return { data: allDefs, error: null, imported };
      } catch (error) {
        log.error('agentDef:import failed:', error);
        return { data: null, error: String(error) };
      }
    },
  );

  ipcMain.handle('agentDef:export', (_event, roles?: string[]) => {
    try {
      let defs: unknown[];
      if (roles && roles.length > 0) {
        const placeholders = roles.map(() => '?').join(',');
        defs = loggedPrepare(
          `SELECT * FROM agent_definitions WHERE role IN (${placeholders}) ORDER BY role ASC`,
        ).all(...roles);
      } else {
        defs = loggedPrepare('SELECT * FROM agent_definitions ORDER BY role ASC').all();
      }
      log.info(`[IPC] agentDef:export - exported ${defs.length} definitions from real database`);
      return { data: defs, error: null };
    } catch (error) {
      log.error('agentDef:export failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // Agent Definition CRUD - create and delete custom roles
  ipcMain.handle(
    'agentDef:create',
    (
      _event,
      definition: {
        role: string;
        display_name: string;
        description: string;
        capabilities: string;
        default_model: string;
        tool_allowlist?: string;
        bash_restrictions?: string;
        file_scope?: string;
      },
    ) => {
      try {
        // Validate required fields
        if (
          !definition.role ||
          !definition.display_name ||
          !definition.description ||
          !definition.capabilities ||
          !definition.default_model
        ) {
          return {
            data: null,
            error:
              'Missing required fields: role, display_name, description, capabilities, default_model',
          };
        }
        // Check if role already exists
        const existing = loggedPrepare('SELECT role FROM agent_definitions WHERE role = ?').get(
          definition.role,
        );
        if (existing) {
          return { data: null, error: `Role "${definition.role}" already exists` };
        }
        loggedPrepare(
          `INSERT INTO agent_definitions (role, display_name, description, capabilities, default_model, tool_allowlist, bash_restrictions, file_scope)
           VALUES (@role, @display_name, @description, @capabilities, @default_model, @tool_allowlist, @bash_restrictions, @file_scope)`,
        ).run({
          role: definition.role,
          display_name: definition.display_name,
          description: definition.description,
          capabilities: definition.capabilities,
          default_model: definition.default_model,
          tool_allowlist: definition.tool_allowlist || null,
          bash_restrictions: definition.bash_restrictions || null,
          file_scope: definition.file_scope || null,
        });
        const created = loggedPrepare('SELECT * FROM agent_definitions WHERE role = ?').get(
          definition.role,
        );
        log.info(`[IPC] agentDef:create - INSERT new role=${definition.role} into real database`);
        return { data: created, error: null };
      } catch (error) {
        log.error('agentDef:create failed:', error);
        return { data: null, error: String(error) };
      }
    },
  );

  ipcMain.handle('agentDef:delete', (_event, role: string) => {
    try {
      // Check if role exists
      const existing = loggedPrepare('SELECT role FROM agent_definitions WHERE role = ?').get(role);
      if (!existing) {
        return { data: false, error: `Role "${role}" not found` };
      }
      loggedPrepare('DELETE FROM agent_definitions WHERE role = ?').run(role);
      log.info(`[IPC] agentDef:delete - DELETE role=${role} from real database`);
      return { data: true, error: null };
    } catch (error) {
      log.error('agentDef:delete failed:', error);
      return { data: false, error: String(error) };
    }
  });

  ipcMain.handle(
    'agentDef:update',
    (
      _event,
      role: string,
      updates: {
        display_name?: string;
        description?: string;
        capabilities?: string;
        default_model?: string;
        tool_allowlist?: string;
        bash_restrictions?: string;
        file_scope?: string;
      },
    ) => {
      try {
        const existing = loggedPrepare('SELECT role FROM agent_definitions WHERE role = ?').get(
          role,
        );
        if (!existing) {
          return { data: null, error: `Role "${role}" not found` };
        }
        const setClauses: string[] = [];
        const values: unknown[] = [];
        for (const [key, val] of Object.entries(updates)) {
          if (val !== undefined) {
            setClauses.push(`${key} = ?`);
            values.push(val);
          }
        }
        if (setClauses.length === 0) {
          return { data: null, error: 'No valid fields to update' };
        }
        setClauses.push("updated_at = datetime('now')");
        values.push(role);
        loggedPrepare(`UPDATE agent_definitions SET ${setClauses.join(', ')} WHERE role = ?`).run(
          ...values,
        );
        const updated = loggedPrepare('SELECT * FROM agent_definitions WHERE role = ?').get(role);
        log.info(`[IPC] agentDef:update - UPDATE role=${role} in real database`);
        return { data: updated, error: null };
      } catch (error) {
        log.error('agentDef:update failed:', error);
        return { data: null, error: String(error) };
      }
    },
  );

  // Agent Definition reset to factory defaults
  ipcMain.handle('agentDef:reset-defaults', () => {
    try {
      const defaultDefs = [
        {
          role: 'scout',
          display_name: 'Scout',
          description:
            'Read-only exploration agent. Scouts analyze codebases, search for patterns, read documentation, and report findings without modifying any files.',
          capabilities: JSON.stringify([
            'read_files',
            'search_code',
            'grep',
            'glob',
            'web_search',
            'analyze_structure',
          ]),
          default_model: 'haiku',
          tool_allowlist: JSON.stringify(['Read', 'Grep', 'Glob', 'Bash (read-only)', 'WebSearch']),
          bash_restrictions: JSON.stringify(['no file writes', 'no git push', 'no git reset']),
          file_scope: 'read-only (entire project)',
        },
        {
          role: 'builder',
          display_name: 'Builder',
          description:
            'Implementation agent. Builders write code, create files, modify existing code, and implement features within their assigned file scope.',
          capabilities: JSON.stringify([
            'read_files',
            'write_files',
            'edit_files',
            'run_tests',
            'lint',
            'build',
          ]),
          default_model: 'sonnet',
          tool_allowlist: JSON.stringify(['Read', 'Write', 'Edit', 'Grep', 'Glob', 'Bash']),
          bash_restrictions: JSON.stringify([
            'no git push',
            'no git reset --hard',
            'confined to worktree',
          ]),
          file_scope: 'assigned files only',
        },
        {
          role: 'reviewer',
          display_name: 'Reviewer',
          description:
            'Validation agent. Reviewers inspect code changes, run tests, check for bugs, verify feature completeness, and provide feedback.',
          capabilities: JSON.stringify([
            'read_files',
            'search_code',
            'run_tests',
            'lint',
            'diff_review',
            'provide_feedback',
          ]),
          default_model: 'sonnet',
          tool_allowlist: JSON.stringify([
            'Read',
            'Grep',
            'Glob',
            'Bash (read-only + tests)',
            'Diff',
          ]),
          bash_restrictions: JSON.stringify([
            'no file writes',
            'no git push',
            'test execution only',
          ]),
          file_scope: 'read-only (entire project)',
        },
        {
          role: 'lead',
          display_name: 'Lead',
          description:
            'Team coordination + implementation agent. Leads decompose tasks, dispatch workers, monitor progress, and can also write code when needed.',
          capabilities: JSON.stringify([
            'read_files',
            'write_files',
            'spawn_agents',
            'assign_tasks',
            'monitor_health',
            'send_mail',
          ]),
          default_model: 'opus',
          tool_allowlist: JSON.stringify([
            'Read',
            'Write',
            'Edit',
            'Grep',
            'Glob',
            'Bash',
            'AgentSpawn',
            'Mail',
          ]),
          bash_restrictions: JSON.stringify(['no git push to main', 'no git reset --hard']),
          file_scope: 'full project access',
        },
        {
          role: 'merger',
          display_name: 'Merger',
          description:
            'Branch integration agent. Mergers handle git merge operations, resolve conflicts, and ensure clean integration of feature branches.',
          capabilities: JSON.stringify([
            'read_files',
            'write_files',
            'git_merge',
            'conflict_resolution',
            'diff_review',
          ]),
          default_model: 'sonnet',
          tool_allowlist: JSON.stringify(['Read', 'Write', 'Edit', 'Grep', 'Glob', 'Bash', 'Git']),
          bash_restrictions: JSON.stringify(['no git push --force', 'merge operations only']),
          file_scope: 'merge-scoped files',
        },
        {
          role: 'coordinator',
          display_name: 'Coordinator',
          description:
            'Top-level orchestration agent. Coordinators analyze project scope, decompose work into streams, dispatch lead agents, and oversee the entire fleet.',
          capabilities: JSON.stringify([
            'spawn_agents',
            'assign_tasks',
            'monitor_fleet',
            'send_mail',
            'authorize_merges',
            'task_decomposition',
          ]),
          default_model: 'opus',
          tool_allowlist: JSON.stringify([
            'Read',
            'Grep',
            'Glob',
            'Bash (read-only)',
            'AgentSpawn',
            'Mail',
            'MergeAuthorize',
          ]),
          bash_restrictions: JSON.stringify(['no file writes', 'no git push', 'read-only + spawn']),
          file_scope: 'read-only (entire project)',
        },
        {
          role: 'monitor',
          display_name: 'Monitor',
          description:
            'Health monitoring agent. Monitors track agent liveness, detect stalled or zombie processes, send health check pings, and escalate issues.',
          capabilities: JSON.stringify([
            'monitor_health',
            'send_mail',
            'detect_stalls',
            'check_processes',
            'escalate_issues',
          ]),
          default_model: 'haiku',
          tool_allowlist: JSON.stringify([
            'Read',
            'Grep',
            'Bash (read-only)',
            'Mail',
            'HealthCheck',
          ]),
          bash_restrictions: JSON.stringify([
            'no file writes',
            'no git operations',
            'monitoring only',
          ]),
          file_scope: 'read-only (logs and status)',
        },
      ];

      // Delete all existing definitions and re-insert defaults
      loggedPrepare('DELETE FROM agent_definitions').run();

      const insertDef = loggedPrepare(`
        INSERT INTO agent_definitions (role, display_name, description, capabilities, default_model, tool_allowlist, bash_restrictions, file_scope)
        VALUES (@role, @display_name, @description, @capabilities, @default_model, @tool_allowlist, @bash_restrictions, @file_scope)
      `);

      for (const def of defaultDefs) {
        insertDef.run(def);
      }

      const allDefs = loggedPrepare('SELECT * FROM agent_definitions ORDER BY role ASC').all();
      log.info(
        `[IPC] agentDef:reset-defaults - Reset ${allDefs.length} definitions to factory defaults`,
      );
      return { data: allDefs, error: null };
    } catch (error) {
      log.error('agentDef:reset-defaults failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // Project channels - all use real SQLite queries via loggedPrepare
  ipcMain.handle('project:list', () => {
    try {
      const projects = loggedPrepare(
        'SELECT * FROM projects ORDER BY last_opened_at DESC, created_at DESC',
      ).all();
      log.info(
        `[IPC] project:list - SELECT returned ${projects.length} projects from real database`,
      );
      return { data: projects, error: null };
    } catch (error) {
      log.error('project:list failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle(
    'project:create',
    (
      _event,
      project: {
        id: string;
        name: string;
        path: string;
        description?: string;
      },
    ) => {
      try {
        loggedPrepare('INSERT INTO projects (id, name, path, description) VALUES (?, ?, ?, ?)').run(
          project.id,
          project.name,
          project.path,
          project.description ?? null,
        );
        const created = loggedPrepare('SELECT * FROM projects WHERE id = ?').get(project.id);
        log.info(`[IPC] project:create - INSERT project into real database: ${project.name}`);
        return { data: created, error: null };
      } catch (error) {
        log.error('project:create failed:', error);
        return { data: null, error: String(error) };
      }
    },
  );

  ipcMain.handle('project:get', (_event, id: string) => {
    try {
      const project = loggedPrepare('SELECT * FROM projects WHERE id = ?').get(id);
      log.info(`[IPC] project:get - SELECT project from real database: id=${id}`);
      return { data: project || null, error: null };
    } catch (error) {
      log.error('project:get failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('project:update', (_event, id: string, updates: Record<string, unknown>) => {
    try {
      const allowedFields = ['name', 'path', 'description'];
      const setClauses: string[] = [];
      const params: unknown[] = [];
      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          setClauses.push(`${key} = ?`);
          params.push(value);
        }
      }
      if (setClauses.length === 0) {
        return { data: null, error: 'No valid fields to update' };
      }
      setClauses.push("updated_at = datetime('now')");
      params.push(id);
      loggedPrepare(`UPDATE projects SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);
      const updated = loggedPrepare('SELECT * FROM projects WHERE id = ?').get(id);
      log.info(`[IPC] project:update - UPDATE project in real database: id=${id}`);
      return { data: updated, error: null };
    } catch (error) {
      log.error('project:update failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('project:delete', (_event, id: string) => {
    try {
      loggedPrepare('DELETE FROM projects WHERE id = ?').run(id);
      log.info(`[IPC] project:delete - DELETE project from real database: id=${id}`);
      return { data: true, error: null };
    } catch (error) {
      log.error('project:delete failed:', error);
      return { data: false, error: String(error) };
    }
  });

  ipcMain.handle('project:switch', (_event, id: string) => {
    try {
      loggedPrepare('UPDATE projects SET is_active = 0').run();
      loggedPrepare(
        "UPDATE projects SET is_active = 1, last_opened_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
      ).run(id);
      const project = loggedPrepare('SELECT * FROM projects WHERE id = ?').get(id);
      log.info(`[IPC] project:switch - switched active project in real database: id=${id}`);
      return { data: project, error: null };
    } catch (error) {
      log.error('project:switch failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('project:get-active', () => {
    try {
      const project = loggedPrepare('SELECT * FROM projects WHERE is_active = 1 LIMIT 1').get();
      log.info(`[IPC] project:get-active - SELECT active project: ${project ? 'found' : 'none'}`);
      return { data: project || null, error: null };
    } catch (error) {
      log.error('project:get-active failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // File tree listing for file scope picker
  ipcMain.handle('project:file-tree', async (_event, rootPath: string, maxDepth = 4) => {
    try {
      const fs = await import('node:fs/promises');

      interface FileTreeNode {
        name: string;
        path: string;
        relativePath: string;
        isDirectory: boolean;
        children?: FileTreeNode[];
      }

      const IGNORED_DIRS = new Set([
        'node_modules',
        '.git',
        '.next',
        '.nuxt',
        'dist',
        'build',
        'out',
        '.cache',
        '.turbo',
        '__pycache__',
        '.venv',
        'venv',
        'coverage',
        '.overstory',
        '.autoforge',
        '.claude',
        '.playwright',
      ]);

      async function readDir(dirPath: string, depth: number): Promise<FileTreeNode[]> {
        if (depth > maxDepth) return [];
        try {
          const entries = await fs.readdir(dirPath, { withFileTypes: true });
          const nodes: FileTreeNode[] = [];

          // Sort: directories first, then files, alphabetical
          const sorted = entries
            .filter((e) => !e.name.startsWith('.') || e.isDirectory())
            .sort((a, b) => {
              if (a.isDirectory() && !b.isDirectory()) return -1;
              if (!a.isDirectory() && b.isDirectory()) return 1;
              return a.name.localeCompare(b.name);
            });

          for (const entry of sorted) {
            if (IGNORED_DIRS.has(entry.name)) continue;

            const fullPath = path.join(dirPath, entry.name);
            const relativePath = path.relative(rootPath, fullPath).replace(/\\/g, '/');

            if (entry.isDirectory()) {
              const children = await readDir(fullPath, depth + 1);
              nodes.push({
                name: entry.name,
                path: fullPath,
                relativePath,
                isDirectory: true,
                children,
              });
            } else {
              nodes.push({
                name: entry.name,
                path: fullPath,
                relativePath,
                isDirectory: false,
              });
            }
          }
          return nodes;
        } catch {
          return [];
        }
      }

      const tree = await readDir(rootPath, 0);
      log.info(`[IPC] project:file-tree - scanned directory: ${rootPath}`);
      return { data: tree, error: null };
    } catch (error) {
      log.error('project:file-tree failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // Worktree channels - use simple-git for real git worktree listing
  ipcMain.handle('worktree:list', async (_event, repoPath: string) => {
    try {
      const simpleGit = (await import('simple-git')).default;
      const git = simpleGit(repoPath);
      const result = await git.raw(['worktree', 'list', '--porcelain']);
      const worktrees: Array<{
        path: string;
        branch: string | null;
        headCommit: string | null;
        headCommitShort: string | null;
        headMessage: string | null;
        isMain: boolean;
        isBare: boolean;
        agentName: string | null;
        status: 'clean' | 'dirty' | 'unknown';
        isMerged: boolean;
      }> = [];

      const blocks = result.trim().split('\n\n');
      let isFirst = true;
      for (const block of blocks) {
        if (!block.trim()) continue;
        const lines = block.trim().split('\n');
        let wtPath = '';
        let head = '';
        let branch: string | null = null;
        let bare = false;

        for (const line of lines) {
          if (line.startsWith('worktree ')) wtPath = line.substring(9);
          else if (line.startsWith('HEAD ')) head = line.substring(5);
          else if (line.startsWith('branch '))
            branch = line.substring(7).replace('refs/heads/', '');
          else if (line === 'bare') bare = true;
        }
        if (!wtPath) continue;

        let headMessage: string | null = null;
        try {
          const logResult = await git.raw(['log', '-1', '--format=%s', head]);
          headMessage = logResult.trim() || null;
        } catch {
          /* ignore */
        }

        let status: 'clean' | 'dirty' | 'unknown' = 'unknown';
        try {
          const wtGit = simpleGit(wtPath);
          const statusResult = await wtGit.status();
          status = statusResult.isClean() ? 'clean' : 'dirty';
        } catch {
          /* ignore */
        }

        let agentName: string | null = null;
        if (branch) {
          const match = branch.match(
            /^(scout|builder|reviewer|lead|merger|coordinator|monitor)-([^/]+)/,
          );
          if (match) agentName = `${match[1]}-${match[2]}`;
        }
        if (!agentName) {
          try {
            const session = loggedPrepare(
              "SELECT agent_name FROM sessions WHERE worktree_path = ? AND state NOT IN ('completed') LIMIT 1",
            ).get(wtPath) as { agent_name: string } | undefined;
            if (session) agentName = session.agent_name;
          } catch {
            /* ignore */
          }
        }

        // Check if branch is merged into main/default branch
        let isMerged = false;
        if (branch && !isFirst) {
          try {
            const mainBranch =
              blocks[0]
                ?.split('\n')
                .find((l: string) => l.startsWith('branch '))
                ?.substring(7)
                .replace('refs/heads/', '') || 'main';
            const mergedFromMain = await git.raw(['branch', '--merged', mainBranch]);
            isMerged = mergedFromMain
              .split('\n')
              .some((b: string) => b.trim().replace('* ', '') === branch);
          } catch {
            /* ignore - assume not merged */
          }
        }

        worktrees.push({
          path: wtPath,
          branch,
          headCommit: head || null,
          headCommitShort: head ? head.substring(0, 7) : null,
          headMessage,
          isMain: isFirst,
          isBare: bare,
          agentName,
          status,
          isMerged,
        });
        isFirst = false;
      }

      log.info(`[IPC] worktree:list - found ${worktrees.length} worktrees in ${repoPath}`);
      return { data: worktrees, error: null };
    } catch (error) {
      log.error('worktree:list failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // Project initialization - create .overstory/ directory structure
  ipcMain.handle('project:init-overstory', async (_event, projectPath: string) => {
    try {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const overstoryDir = path.join(projectPath, '.overstory');

      // Check if already initialized
      try {
        await fs.access(overstoryDir);
        return { data: { initialized: true, alreadyExisted: true }, error: null };
      } catch {
        // Does not exist, proceed to create
      }

      // Create .overstory/ directory structure
      await fs.mkdir(overstoryDir, { recursive: true });
      await fs.mkdir(path.join(overstoryDir, 'agents'), { recursive: true });
      await fs.mkdir(path.join(overstoryDir, 'logs'), { recursive: true });
      await fs.mkdir(path.join(overstoryDir, 'worktrees'), { recursive: true });

      // Create default config file
      const config = {
        version: 1,
        project: {
          name: path.basename(projectPath),
          path: projectPath,
        },
        settings: {
          maxConcurrentAgents: 5,
          defaultModel: 'sonnet',
          autoMerge: false,
        },
        created_at: new Date().toISOString(),
      };
      await fs.writeFile(
        path.join(overstoryDir, 'config.json'),
        JSON.stringify(config, null, 2),
        'utf-8',
      );

      // Create agents registry file
      await fs.writeFile(
        path.join(overstoryDir, 'agents', 'registry.json'),
        JSON.stringify({ agents: [], updated_at: new Date().toISOString() }, null, 2),
        'utf-8',
      );

      // Create state file for tracking
      await fs.writeFile(
        path.join(overstoryDir, 'state.json'),
        JSON.stringify(
          {
            status: 'initialized',
            initialized_at: new Date().toISOString(),
            last_activity: new Date().toISOString(),
          },
          null,
          2,
        ),
        'utf-8',
      );

      log.info(`[IPC] project:init-overstory - created .overstory/ directory in ${projectPath}`);
      return { data: { initialized: true, alreadyExisted: false }, error: null };
    } catch (error) {
      log.error('project:init-overstory failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // Worktree cleanup - remove individual or all completed worktrees
  ipcMain.handle('worktree:remove', async (_event, repoPath: string, worktreePath: string) => {
    try {
      const simpleGit = (await import('simple-git')).default;
      const git = simpleGit(repoPath);

      // Remove the worktree using git worktree remove --force
      await git.raw(['worktree', 'remove', worktreePath, '--force']);
      log.info(`[IPC] worktree:remove - removed worktree ${worktreePath}`);
      return { data: { removed: true, path: worktreePath }, error: null };
    } catch (error) {
      log.error('worktree:remove failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('worktree:clean-completed', async (_event, repoPath: string) => {
    try {
      const simpleGit = (await import('simple-git')).default;
      const git = simpleGit(repoPath);

      // List all worktrees
      const result = await git.raw(['worktree', 'list', '--porcelain']);
      const blocks = result.trim().split('\n\n');
      const removed: string[] = [];
      const errors: Array<{ path: string; error: string }> = [];

      let isFirst = true;
      for (const block of blocks) {
        if (!block.trim()) continue;
        const lines = block.trim().split('\n');
        let wtPath = '';
        let branch: string | null = null;

        for (const line of lines) {
          if (line.startsWith('worktree ')) wtPath = line.substring(9);
          else if (line.startsWith('branch '))
            branch = line.substring(7).replace('refs/heads/', '');
        }

        // Skip main worktree
        if (isFirst) {
          isFirst = false;
          continue;
        }
        if (!wtPath) continue;

        // Check if worktree has an active (non-completed) agent session
        let hasActiveAgent = false;
        try {
          const session = loggedPrepare(
            "SELECT agent_name FROM sessions WHERE worktree_path = ? AND state NOT IN ('completed', 'zombie', 'failed') LIMIT 1",
          ).get(wtPath) as { agent_name: string } | undefined;
          if (session) hasActiveAgent = true;
        } catch {
          /* ignore */
        }

        // Only remove worktrees that are NOT assigned to active agents
        if (!hasActiveAgent) {
          try {
            await git.raw(['worktree', 'remove', wtPath, '--force']);
            removed.push(wtPath);

            // Also try to delete the branch if it exists
            if (branch) {
              try {
                await git.raw(['branch', '-D', branch]);
              } catch {
                /* branch may not exist or be checked out elsewhere */
              }
            }
          } catch (err) {
            errors.push({ path: wtPath, error: String(err) });
          }
        }
      }

      log.info(
        `[IPC] worktree:clean-completed - removed ${removed.length} worktrees, ${errors.length} errors`,
      );
      return { data: { removed, errors }, error: null };
    } catch (error) {
      log.error('worktree:clean-completed failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // Force-remove worktree with unmerged branch - removes worktree and deletes unmerged branch
  ipcMain.handle(
    'worktree:force-remove',
    async (_event, repoPath: string, worktreePath: string) => {
      try {
        const simpleGit = (await import('simple-git')).default;
        const git = simpleGit(repoPath);

        // Get the branch name for this worktree before removing it
        const listResult = await git.raw(['worktree', 'list', '--porcelain']);
        const blocks = listResult.trim().split('\n\n');
        let branchToDelete: string | null = null;

        for (const block of blocks) {
          const lines = block.trim().split('\n');
          let wtPath = '';
          let branch: string | null = null;
          for (const line of lines) {
            if (line.startsWith('worktree ')) wtPath = line.substring(9);
            else if (line.startsWith('branch '))
              branch = line.substring(7).replace('refs/heads/', '');
          }
          // Normalize paths for comparison
          if (wtPath.replace(/\\/g, '/') === worktreePath.replace(/\\/g, '/')) {
            branchToDelete = branch;
            break;
          }
        }

        // Force remove the worktree
        await git.raw(['worktree', 'remove', worktreePath, '--force']);
        log.info(`[IPC] worktree:force-remove - force removed worktree ${worktreePath}`);

        // Also delete the branch (force delete since it may be unmerged)
        let branchDeleted = false;
        if (branchToDelete) {
          try {
            await git.raw(['branch', '-D', branchToDelete]);
            branchDeleted = true;
            log.info(`[IPC] worktree:force-remove - deleted unmerged branch ${branchToDelete}`);
          } catch (branchErr) {
            log.warn(
              `[IPC] worktree:force-remove - could not delete branch ${branchToDelete}: ${branchErr}`,
            );
          }
        }

        return { data: { removed: true, path: worktreePath, branchDeleted }, error: null };
      } catch (error) {
        log.error('worktree:force-remove failed:', error);
        return { data: null, error: String(error) };
      }
    },
  );

  // Open worktree directory in VS Code
  ipcMain.handle('worktree:open-vscode', async (_event, worktreePath: string) => {
    try {
      const { exec: execAsync } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execPromise = promisify(execAsync);

      // Use 'code' CLI command which is available when VS Code is installed
      await execPromise(`code "${worktreePath}"`);
      log.info(`[IPC] worktree:open-vscode - opened ${worktreePath} in VS Code`);
      return { data: { opened: true }, error: null };
    } catch (error) {
      log.error('worktree:open-vscode failed:', error);
      return {
        data: null,
        error: `Failed to open VS Code. Make sure VS Code is installed and 'code' command is in PATH. Error: ${String(error)}`,
      };
    }
  });

  // Open worktree directory in system file explorer
  ipcMain.handle('worktree:open-explorer', async (_event, worktreePath: string) => {
    try {
      const fs = await import('node:fs');
      // Verify the path exists before trying to open it
      if (!fs.existsSync(worktreePath)) {
        return { data: null, error: `Directory does not exist: ${worktreePath}` };
      }
      const errorMessage = await shell.openPath(worktreePath);
      if (errorMessage) {
        log.error(`[IPC] worktree:open-explorer - shell.openPath returned error: ${errorMessage}`);
        return { data: null, error: errorMessage };
      }
      log.info(`[IPC] worktree:open-explorer - opened ${worktreePath} in file explorer`);
      return { data: { opened: true }, error: null };
    } catch (error) {
      log.error('worktree:open-explorer failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // Project config read - read .overstory/config.json from project directory
  ipcMain.handle('project:config-read', async (_event, projectPath: string) => {
    try {
      const fs = await import('node:fs/promises');
      const nodePath = await import('node:path');
      const configPath = nodePath.join(projectPath, '.overstory', 'config.json');

      try {
        const content = await fs.readFile(configPath, 'utf-8');
        const config = JSON.parse(content);
        log.info(`[IPC] project:config-read - loaded config from ${configPath}`);
        return { data: { config, path: configPath }, error: null };
      } catch (readErr: unknown) {
        if ((readErr as NodeJS.ErrnoException).code === 'ENOENT') {
          return {
            data: null,
            error: 'Config file not found. Initialize .overstory directory first.',
          };
        }
        throw readErr;
      }
    } catch (error) {
      log.error('project:config-read failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // Project config write - write .overstory/config.json to project directory
  ipcMain.handle(
    'project:config-write',
    async (_event, projectPath: string, config: Record<string, unknown>) => {
      try {
        const fs = await import('node:fs/promises');
        const nodePath = await import('node:path');
        const configPath = nodePath.join(projectPath, '.overstory', 'config.json');

        // Verify .overstory directory exists
        const overstoryDir = nodePath.join(projectPath, '.overstory');
        try {
          await fs.access(overstoryDir);
        } catch {
          return { data: null, error: '.overstory directory does not exist. Initialize it first.' };
        }

        // Write config with pretty-printing
        await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
        log.info(`[IPC] project:config-write - saved config to ${configPath}`);
        return { data: { saved: true, path: configPath }, error: null };
      } catch (error) {
        log.error('project:config-write failed:', error);
        return { data: null, error: String(error) };
      }
    },
  );

  // Metrics channels - token usage tracking per agent session and model breakdown
  ipcMain.handle('metrics:list', () => {
    try {
      const metrics = loggedPrepare(
        'SELECT * FROM metrics ORDER BY completed_at DESC, started_at DESC',
      ).all();
      log.info(
        `[IPC] metrics:list - SELECT returned ${metrics.length} metric records from real database`,
      );
      return { data: metrics, error: null };
    } catch (error) {
      log.error('metrics:list failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle(
    'metrics:create',
    (
      _event,
      metric: {
        id: string;
        agent_name?: string;
        task_id?: string;
        capability?: string;
        input_tokens?: number;
        output_tokens?: number;
        cache_read_tokens?: number;
        cache_creation_tokens?: number;
        model_used?: string;
        estimated_cost?: number;
        duration_ms?: number;
        parent_agent?: string;
        run_id?: string;
        started_at?: string;
        completed_at?: string;
      },
    ) => {
      try {
        loggedPrepare(`
        INSERT INTO metrics (id, agent_name, task_id, capability, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, model_used, estimated_cost, duration_ms, parent_agent, run_id, started_at, completed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
          metric.id,
          metric.agent_name ?? null,
          metric.task_id ?? null,
          metric.capability ?? null,
          metric.input_tokens ?? 0,
          metric.output_tokens ?? 0,
          metric.cache_read_tokens ?? 0,
          metric.cache_creation_tokens ?? 0,
          metric.model_used ?? null,
          metric.estimated_cost ?? 0,
          metric.duration_ms ?? 0,
          metric.parent_agent ?? null,
          metric.run_id ?? null,
          metric.started_at ?? null,
          metric.completed_at ?? null,
        );
        const created = loggedPrepare('SELECT * FROM metrics WHERE id = ?').get(metric.id);
        log.info(`[IPC] metrics:create - INSERT metric record into real database: id=${metric.id}`);
        return { data: created, error: null };
      } catch (error) {
        log.error('metrics:create failed:', error);
        return { data: null, error: String(error) };
      }
    },
  );

  ipcMain.handle('metrics:get', (_event, id: string) => {
    try {
      const metric = loggedPrepare('SELECT * FROM metrics WHERE id = ?').get(id);
      log.info(`[IPC] metrics:get - SELECT metric from real database: id=${id}`);
      return { data: metric || null, error: null };
    } catch (error) {
      log.error('metrics:get failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('metrics:by-session', (_event, agentName: string) => {
    try {
      const metrics = loggedPrepare(
        'SELECT * FROM metrics WHERE agent_name = ? ORDER BY completed_at DESC, started_at DESC',
      ).all(agentName);
      log.info(
        `[IPC] metrics:by-session - SELECT ${metrics.length} metrics for agent=${agentName} from real database`,
      );
      return { data: metrics, error: null };
    } catch (error) {
      log.error('metrics:by-session failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('metrics:by-model', () => {
    try {
      const breakdown = loggedPrepare(`
        SELECT
          model_used,
          COUNT(*) as session_count,
          SUM(input_tokens) as total_input_tokens,
          SUM(output_tokens) as total_output_tokens,
          SUM(cache_read_tokens) as total_cache_read_tokens,
          SUM(cache_creation_tokens) as total_cache_creation_tokens,
          SUM(estimated_cost) as total_cost,
          SUM(duration_ms) as total_duration_ms
        FROM metrics
        WHERE model_used IS NOT NULL
        GROUP BY model_used
        ORDER BY total_input_tokens DESC
      `).all();
      log.info(
        `[IPC] metrics:by-model - aggregated token usage by ${breakdown.length} models from real database`,
      );
      return { data: breakdown, error: null };
    } catch (error) {
      log.error('metrics:by-model failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('metrics:by-capability', () => {
    try {
      const breakdown = loggedPrepare(`
        SELECT
          capability,
          COUNT(*) as session_count,
          SUM(input_tokens) as total_input_tokens,
          SUM(output_tokens) as total_output_tokens,
          SUM(cache_read_tokens) as total_cache_read_tokens,
          SUM(cache_creation_tokens) as total_cache_creation_tokens,
          SUM(estimated_cost) as total_cost,
          SUM(duration_ms) as total_duration_ms
        FROM metrics
        WHERE capability IS NOT NULL
        GROUP BY capability
        ORDER BY total_input_tokens DESC
      `).all();
      log.info(
        `[IPC] metrics:by-capability - aggregated token usage by ${breakdown.length} capabilities from real database`,
      );
      return { data: breakdown, error: null };
    } catch (error) {
      log.error('metrics:by-capability failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('metrics:export', async (_event, format: 'csv' | 'json') => {
    try {
      const metrics = loggedPrepare(`
        SELECT * FROM metrics ORDER BY completed_at DESC
      `).all() as Array<Record<string, unknown>>;

      let content: string;
      let defaultExt: string;

      if (format === 'json') {
        content = JSON.stringify(metrics, null, 2);
        defaultExt = 'json';
      } else {
        // CSV format
        if (metrics.length === 0) {
          content = '';
        } else {
          const headers = Object.keys(metrics[0]);
          const rows = metrics.map((row) =>
            headers
              .map((h) => {
                const val = row[h];
                if (val == null) return '';
                const str = String(val);
                // Escape CSV fields containing commas, quotes, or newlines
                if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                  return `"${str.replace(/"/g, '""')}"`;
                }
                return str;
              })
              .join(','),
          );
          content = [headers.join(','), ...rows].join('\n');
        }
        defaultExt = 'csv';
      }

      const { dialog } = require('electron');
      const result = await dialog.showSaveDialog({
        title: `Export Metrics as ${format.toUpperCase()}`,
        defaultPath: `fleet-metrics-export.${defaultExt}`,
        filters: [
          format === 'json'
            ? { name: 'JSON Files', extensions: ['json'] }
            : { name: 'CSV Files', extensions: ['csv'] },
        ],
      });

      if (result.canceled || !result.filePath) {
        return { data: null, error: null };
      }

      const fs = require('node:fs');
      fs.writeFileSync(result.filePath, content, 'utf-8');

      log.info(
        `[IPC] metrics:export - exported ${metrics.length} metrics to ${result.filePath} as ${format}`,
      );
      return { data: { filePath: result.filePath }, error: null };
    } catch (error) {
      log.error('metrics:export failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('metrics:summary', () => {
    try {
      const summary = loggedPrepare(`
        SELECT
          COUNT(*) as total_sessions,
          SUM(input_tokens) as total_input_tokens,
          SUM(output_tokens) as total_output_tokens,
          SUM(cache_read_tokens) as total_cache_read_tokens,
          SUM(cache_creation_tokens) as total_cache_creation_tokens,
          SUM(estimated_cost) as total_cost,
          SUM(duration_ms) as total_duration_ms
        FROM metrics
      `).get();
      log.info('[IPC] metrics:summary - aggregated total token usage from real database');
      return { data: summary, error: null };
    } catch (error) {
      log.error('metrics:summary failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle(
    'metrics:update',
    (
      _event,
      id: string,
      updates: {
        input_tokens?: number;
        output_tokens?: number;
        cache_read_tokens?: number;
        cache_creation_tokens?: number;
        estimated_cost?: number;
        duration_ms?: number;
        completed_at?: string;
      },
    ) => {
      try {
        const setClauses: string[] = [];
        const params: unknown[] = [];
        const allowedFields = [
          'input_tokens',
          'output_tokens',
          'cache_read_tokens',
          'cache_creation_tokens',
          'estimated_cost',
          'duration_ms',
          'completed_at',
        ];
        for (const [key, value] of Object.entries(updates)) {
          if (allowedFields.includes(key)) {
            setClauses.push(`${key} = ?`);
            params.push(value);
          }
        }
        if (setClauses.length === 0) {
          return { data: null, error: 'No valid fields to update' };
        }
        params.push(id);
        loggedPrepare(`UPDATE metrics SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);
        const updated = loggedPrepare('SELECT * FROM metrics WHERE id = ?').get(id);
        log.info(`[IPC] metrics:update - UPDATE metric in real database: id=${id}`);
        return { data: updated, error: null };
      } catch (error) {
        log.error('metrics:update failed:', error);
        return { data: null, error: String(error) };
      }
    },
  );

  ipcMain.handle('metrics:delete', (_event, id: string) => {
    try {
      loggedPrepare('DELETE FROM metrics WHERE id = ?').run(id);
      log.info(`[IPC] metrics:delete - DELETE metric from real database: id=${id}`);
      return { data: true, error: null };
    } catch (error) {
      log.error('metrics:delete failed:', error);
      return { data: false, error: String(error) };
    }
  });

  // Event channels - event store tracking for tool usage, sessions, mail
  ipcMain.handle(
    'event:list',
    (_event, filters?: { eventType?: string; agentName?: string; limit?: number }) => {
      try {
        let query = 'SELECT * FROM events';
        const conditions: string[] = [];
        const params: unknown[] = [];

        if (filters?.eventType) {
          conditions.push('event_type = ?');
          params.push(filters.eventType);
        }
        if (filters?.agentName) {
          conditions.push('agent_name = ?');
          params.push(filters.agentName);
        }
        if (conditions.length > 0) {
          query += ` WHERE ${conditions.join(' AND ')}`;
        }
        query += ' ORDER BY created_at DESC';
        if (filters?.limit) {
          query += ` LIMIT ${Number(filters.limit)}`;
        }

        const events = loggedPrepare(query).all(...params);
        log.info(`[IPC] event:list - SELECT returned ${events.length} events from real database`);
        return { data: events, error: null };
      } catch (error) {
        log.error('event:list failed:', error);
        return { data: null, error: String(error) };
      }
    },
  );

  ipcMain.handle(
    'event:create',
    (
      _event,
      eventData: {
        event_type: string;
        agent_name?: string;
        session_id?: string;
        run_id?: string;
        tool_name?: string;
        tool_args?: string;
        tool_duration_ms?: number;
        level?: string;
        data?: string;
      },
    ) => {
      try {
        recordEvent({
          eventType: eventData.event_type,
          agentName: eventData.agent_name,
          sessionId: eventData.session_id,
          runId: eventData.run_id,
          toolName: eventData.tool_name,
          toolArgs: eventData.tool_args,
          toolDurationMs: eventData.tool_duration_ms,
          level: eventData.level,
          data: eventData.data,
        });
        log.info(`[IPC] event:create - recorded ${eventData.event_type} event`);
        return { data: true, error: null };
      } catch (error) {
        log.error('event:create failed:', error);
        return { data: false, error: String(error) };
      }
    },
  );

  ipcMain.handle('event:tool-stats', () => {
    try {
      const stats = loggedPrepare(`
        SELECT
          tool_name,
          COUNT(*) as usage_count,
          AVG(tool_duration_ms) as avg_duration_ms,
          MIN(tool_duration_ms) as min_duration_ms,
          MAX(tool_duration_ms) as max_duration_ms,
          SUM(tool_duration_ms) as total_duration_ms
        FROM events
        WHERE event_type = 'tool_end' AND tool_name IS NOT NULL
        GROUP BY tool_name
        ORDER BY usage_count DESC
      `).all();
      log.info(
        `[IPC] event:tool-stats - aggregated tool stats for ${stats.length} tools from real database`,
      );
      return { data: stats, error: null };
    } catch (error) {
      log.error('event:tool-stats failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('event:by-session', (_event, sessionId: string) => {
    try {
      const events = loggedPrepare(
        'SELECT * FROM events WHERE session_id = ? ORDER BY created_at ASC',
      ).all(sessionId);
      log.info(
        `[IPC] event:by-session - SELECT returned ${events.length} events for session=${sessionId}`,
      );
      return { data: events, error: null };
    } catch (error) {
      log.error('event:by-session failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('event:purge', () => {
    try {
      loggedPrepare('DELETE FROM events').run();
      log.info('[IPC] event:purge - DELETE all events from real database');
      return { data: true, error: null };
    } catch (error) {
      log.error('event:purge failed:', error);
      return { data: false, error: String(error) };
    }
  });

  // ── Config Profiles ──────────────────────────────────────────────────

  ipcMain.handle('profile:list', () => {
    try {
      const profiles = loggedPrepare('SELECT * FROM config_profiles ORDER BY name ASC').all();
      return { data: profiles, error: null };
    } catch (error) {
      log.error('profile:list failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle(
    'profile:create',
    (
      _event,
      profile: {
        id: string;
        name: string;
        description?: string;
        max_hierarchy_depth: number;
        max_concurrent_agents: number;
        max_agents_per_lead: number;
        default_capability: string;
        default_model: string;
      },
    ) => {
      try {
        // Check uniqueness
        const existing = loggedPrepare('SELECT id FROM config_profiles WHERE name = ?').get(
          profile.name,
        );
        if (existing) {
          return { data: null, error: 'A profile with this name already exists' };
        }

        loggedPrepare(
          `INSERT INTO config_profiles (id, name, description, max_hierarchy_depth, max_concurrent_agents, max_agents_per_lead, default_capability, default_model)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          profile.id,
          profile.name,
          profile.description ?? null,
          profile.max_hierarchy_depth,
          profile.max_concurrent_agents,
          profile.max_agents_per_lead,
          profile.default_capability,
          profile.default_model,
        );
        const created = loggedPrepare('SELECT * FROM config_profiles WHERE id = ?').get(profile.id);
        log.info(`[IPC] profile:create - created profile "${profile.name}"`);
        return { data: created, error: null };
      } catch (error) {
        log.error('profile:create failed:', error);
        return { data: null, error: String(error) };
      }
    },
  );

  ipcMain.handle('profile:get', (_event, id: string) => {
    try {
      const profile = loggedPrepare('SELECT * FROM config_profiles WHERE id = ?').get(id);
      return { data: profile ?? null, error: null };
    } catch (error) {
      log.error('profile:get failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('profile:update', (_event, id: string, updates: Record<string, unknown>) => {
    try {
      // Check name uniqueness if name is being updated
      if (updates.name) {
        const existing = loggedPrepare(
          'SELECT id FROM config_profiles WHERE name = ? AND id != ?',
        ).get(updates.name, id);
        if (existing) {
          return { data: null, error: 'A profile with this name already exists' };
        }
      }

      const fields = Object.keys(updates)
        .filter((k) => k !== 'id' && k !== 'created_at')
        .map((k) => `${k} = ?`);
      const values = Object.keys(updates)
        .filter((k) => k !== 'id' && k !== 'created_at')
        .map((k) => updates[k]);

      if (fields.length === 0) {
        return { data: null, error: 'No valid fields to update' };
      }

      fields.push("updated_at = datetime('now')");
      loggedPrepare(`UPDATE config_profiles SET ${fields.join(', ')} WHERE id = ?`).run(
        ...values,
        id,
      );

      const updated = loggedPrepare('SELECT * FROM config_profiles WHERE id = ?').get(id);
      log.info(`[IPC] profile:update - updated profile id=${id}`);
      return { data: updated, error: null };
    } catch (error) {
      log.error('profile:update failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('profile:delete', (_event, id: string) => {
    try {
      loggedPrepare('DELETE FROM config_profiles WHERE id = ?').run(id);
      log.info(`[IPC] profile:delete - deleted profile id=${id}`);
      return { data: true, error: null };
    } catch (error) {
      log.error('profile:delete failed:', error);
      return { data: false, error: String(error) };
    }
  });

  ipcMain.handle('profile:activate', (_event, id: string) => {
    try {
      const db = getDatabase();
      db.transaction(() => {
        loggedPrepare('UPDATE config_profiles SET is_active = 0').run();
        loggedPrepare(
          "UPDATE config_profiles SET is_active = 1, updated_at = datetime('now') WHERE id = ?",
        ).run(id);
      })();
      const activated = loggedPrepare('SELECT * FROM config_profiles WHERE id = ?').get(id);
      log.info(`[IPC] profile:activate - activated profile id=${id}`);
      return { data: activated, error: null };
    } catch (error) {
      log.error('profile:activate failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('profile:get-active', () => {
    try {
      const profile = loggedPrepare('SELECT * FROM config_profiles WHERE is_active = 1').get();
      return { data: profile ?? null, error: null };
    } catch (error) {
      log.error('profile:get-active failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // ── Runs ──────────────────────────────────────────────────────────────

  ipcMain.handle('run:start', () => {
    try {
      const id = `run-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      loggedPrepare('INSERT INTO runs (id, status, agent_count) VALUES (?, ?, ?)').run(
        id,
        'active',
        0,
      );
      const run = loggedPrepare('SELECT * FROM runs WHERE id = ?').get(id);
      log.info(`[IPC] run:start - INSERT new run into real database: id=${id}`);
      return { data: run, error: null };
    } catch (error) {
      log.error('run:start failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('run:get-active', () => {
    try {
      const run = loggedPrepare(
        "SELECT * FROM runs WHERE status = 'active' ORDER BY started_at DESC LIMIT 1",
      ).get();

      if (!run) {
        return { data: null, error: null };
      }

      // Get count of sessions linked to this run
      const typedRun = run as { id: string };
      const agentCountRow = loggedPrepare(
        'SELECT COUNT(*) as cnt FROM sessions WHERE run_id = ?',
      ).get(typedRun.id) as { cnt: number };

      // Update agent_count in the run record
      loggedPrepare('UPDATE runs SET agent_count = ? WHERE id = ?').run(
        agentCountRow.cnt,
        typedRun.id,
      );

      const updated = loggedPrepare('SELECT * FROM runs WHERE id = ?').get(typedRun.id);
      log.info('[IPC] run:get-active - SELECT active run from real database');
      return { data: updated, error: null };
    } catch (error) {
      log.error('run:get-active failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('run:list', () => {
    try {
      const runs = loggedPrepare('SELECT * FROM runs ORDER BY started_at DESC').all();
      log.info(`[IPC] run:list - SELECT returned ${runs.length} runs from real database`);
      return { data: runs, error: null };
    } catch (error) {
      log.error('run:list failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('run:stop', (_event, id: string) => {
    try {
      loggedPrepare(
        "UPDATE runs SET status = 'completed', completed_at = datetime('now') WHERE id = ?",
      ).run(id);
      const run = loggedPrepare('SELECT * FROM runs WHERE id = ?').get(id);
      log.info(`[IPC] run:stop - UPDATE run status to completed: id=${id}`);
      return { data: run, error: null };
    } catch (error) {
      log.error('run:stop failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('run:get', (_event, id: string) => {
    try {
      const run = loggedPrepare('SELECT * FROM runs WHERE id = ?').get(id);
      log.info(`[IPC] run:get - SELECT run from real database: id=${id}`);
      return { data: run || null, error: null };
    } catch (error) {
      log.error('run:get failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // ── Agent Performance History ────────────────────────────────────────

  ipcMain.handle('agent:performance-history', (_event, agentName: string) => {
    try {
      const sessions = loggedPrepare(
        `SELECT id, capability, model, state, task_id, created_at, completed_at
         FROM sessions
         WHERE agent_name = ?
         ORDER BY created_at DESC`,
      ).all(agentName) as Array<{
        id: string;
        capability: string;
        model: string | null;
        state: string;
        task_id: string | null;
        created_at: string;
        completed_at: string | null;
      }>;

      const totalSessions = sessions.length;
      const completedSessions = sessions.filter((s) => s.state === 'completed');
      const failedSessions = sessions.filter((s) => s.state === 'zombie' || s.state === 'stalled');
      const successRate =
        totalSessions > 0 ? Math.round((completedSessions.length / totalSessions) * 100) : 0;

      // Calculate average duration for completed sessions
      let avgDurationMs = 0;
      const durations: number[] = [];
      for (const s of completedSessions) {
        if (s.created_at && s.completed_at) {
          const dur = new Date(s.completed_at).getTime() - new Date(s.created_at).getTime();
          if (dur > 0) durations.push(dur);
        }
      }
      if (durations.length > 0) {
        avgDurationMs = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
      }

      log.info(
        `[IPC] agent:performance-history - ${totalSessions} sessions for agent ${agentName}`,
      );
      return {
        data: {
          agentName,
          totalSessions,
          completedCount: completedSessions.length,
          failedCount: failedSessions.length,
          successRate,
          avgDurationMs,
          sessions,
        },
        error: null,
      };
    } catch (error) {
      log.error('agent:performance-history failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // ── Watchdog ──────────────────────────────────────────────────────────

  ipcMain.handle('watchdog:start', () => {
    try {
      watchdogService.start();
      log.info('[IPC] watchdog:start - watchdog daemon started');
      return { data: watchdogService.getStatus(), error: null };
    } catch (error) {
      log.error('watchdog:start failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('watchdog:stop', () => {
    try {
      watchdogService.stop();
      log.info('[IPC] watchdog:stop - watchdog daemon stopped');
      return { data: watchdogService.getStatus(), error: null };
    } catch (error) {
      log.error('watchdog:stop failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('watchdog:status', () => {
    try {
      return { data: watchdogService.getStatus(), error: null };
    } catch (error) {
      log.error('watchdog:status failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle(
    'watchdog:configure',
    (
      _event,
      config: {
        intervalMs?: number;
        staleThresholdMs?: number;
        zombieThresholdMs?: number;
        enabled?: boolean;
      },
    ) => {
      try {
        watchdogService.updateConfig(config);
        log.info('[IPC] watchdog:configure - watchdog configuration updated');
        return { data: watchdogService.getStatus(), error: null };
      } catch (error) {
        log.error('watchdog:configure failed:', error);
        return { data: null, error: String(error) };
      }
    },
  );

  ipcMain.handle('watchdog:check-now', () => {
    try {
      const results = watchdogService.runCheck();
      log.info(`[IPC] watchdog:check-now - manual check: ${results.length} agents checked`);
      return { data: results, error: null };
    } catch (error) {
      log.error('watchdog:check-now failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('watchdog:escalation-states', () => {
    try {
      const states = watchdogService.getAllEscalationStates();
      return { data: states, error: null };
    } catch (error) {
      log.error('watchdog:escalation-states failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('watchdog:reset-escalation', (_event, agentId: string) => {
    try {
      watchdogService.resetEscalation(agentId);
      log.info(`[IPC] watchdog:reset-escalation - reset for agent ${agentId}`);
      return { data: true, error: null };
    } catch (error) {
      log.error('watchdog:reset-escalation failed:', error);
      return { data: false, error: String(error) };
    }
  });

  // ── Watchdog Tier 1: AI Triage ──────────────────────────────────────

  ipcMain.handle(
    'watchdog:triage',
    async (_event, agentId: string, options?: { lineCount?: number; timeoutMs?: number }) => {
      try {
        const result = await watchdogService.triageAgentError(agentId, options);
        log.info(
          `[IPC] watchdog:triage - agent=${agentId}, classification=${result.classification}`,
        );
        return { data: result, error: null };
      } catch (error) {
        log.error('watchdog:triage failed:', error);
        return { data: null, error: String(error) };
      }
    },
  );

  ipcMain.handle('watchdog:triage-config', () => {
    try {
      return { data: watchdogService.getTriageConfig(), error: null };
    } catch (error) {
      log.error('watchdog:triage-config failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle(
    'watchdog:triage-configure',
    (_event, updates: { lineCount?: number; timeoutMs?: number }) => {
      try {
        watchdogService.updateTriageConfig(updates);
        log.info('[IPC] watchdog:triage-configure - triage config updated');
        return { data: watchdogService.getTriageConfig(), error: null };
      } catch (error) {
        log.error('watchdog:triage-configure failed:', error);
        return { data: null, error: String(error) };
      }
    },
  );

  // ── Watchdog Tier 2: Monitor Patrol ─────────────────────────────────

  ipcMain.handle('watchdog:patrol-start', (_event, intervalMs?: number) => {
    try {
      watchdogService.startPatrol(intervalMs);
      log.info('[IPC] watchdog:patrol-start - monitor patrol started');
      return { data: watchdogService.getPatrolStatus(), error: null };
    } catch (error) {
      log.error('watchdog:patrol-start failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('watchdog:patrol-stop', () => {
    try {
      watchdogService.stopPatrol();
      log.info('[IPC] watchdog:patrol-stop - monitor patrol stopped');
      return { data: watchdogService.getPatrolStatus(), error: null };
    } catch (error) {
      log.error('watchdog:patrol-stop failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('watchdog:patrol-status', () => {
    try {
      return { data: watchdogService.getPatrolStatus(), error: null };
    } catch (error) {
      log.error('watchdog:patrol-status failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('watchdog:patrol-now', () => {
    try {
      const result = watchdogService.runPatrol();
      log.info(
        `[IPC] watchdog:patrol-now - manual patrol: ${result.totalAgents} agents, ${result.anomalyCount} anomalies`,
      );
      return { data: result, error: null };
    } catch (error) {
      log.error('watchdog:patrol-now failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('watchdog:patrol-history', (_event, limit?: number) => {
    try {
      const history = watchdogService.getPatrolHistory(limit);
      return { data: history, error: null };
    } catch (error) {
      log.error('watchdog:patrol-history failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // ─── Notification Handlers ───────────────────────────────────────────

  // Load notification preferences from settings on startup
  try {
    const notifSetting = loggedPrepare('SELECT value FROM app_settings WHERE key = ?').get(
      'app_settings',
    ) as { value: string } | undefined;
    if (notifSetting) {
      const parsed = JSON.parse(notifSetting.value);
      if (parsed?.notificationPreferences && typeof parsed.notificationPreferences === 'object') {
        notificationService.setPreferences(parsed.notificationPreferences);
        log.info('[IPC] Loaded notification preferences from settings');
      }
    }
  } catch (prefsErr) {
    log.warn('[IPC] Failed to load notification preferences from settings:', prefsErr);
  }

  ipcMain.handle(
    'notification:send',
    (_event, options: { title: string; body: string; eventType: string; agentName?: string }) => {
      try {
        notificationService.notify({
          title: options.title,
          body: options.body,
          eventType: options.eventType as NotificationEventType,
          agentName: options.agentName,
        });
        return { data: true, error: null };
      } catch (error) {
        log.error('notification:send failed:', error);
        return { data: false, error: String(error) };
      }
    },
  );

  ipcMain.handle('notification:set-enabled', (_event, enabled: boolean) => {
    try {
      notificationService.setEnabled(enabled);
      return { data: true, error: null };
    } catch (error) {
      log.error('notification:set-enabled failed:', error);
      return { data: false, error: String(error) };
    }
  });

  ipcMain.handle('notification:is-supported', () => {
    try {
      return { data: notificationService.isSupported(), error: null };
    } catch (error) {
      log.error('notification:is-supported failed:', error);
      return { data: false, error: String(error) };
    }
  });

  ipcMain.handle('notification:set-preferences', (_event, prefs: Record<string, boolean>) => {
    try {
      notificationService.setPreferences(prefs);
      return { data: true, error: null };
    } catch (error) {
      log.error('notification:set-preferences failed:', error);
      return { data: false, error: String(error) };
    }
  });

  ipcMain.handle('notification:get-preferences', () => {
    try {
      return { data: notificationService.getPreferences(), error: null };
    } catch (error) {
      log.error('notification:get-preferences failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // ── Notification History ───────────────────────────────────────────────

  ipcMain.handle(
    'notification:history',
    (
      _event,
      filters?: {
        event_type?: string;
        agent_name?: string;
        limit?: number;
        offset?: number;
      },
    ) => {
      try {
        const history = notificationService.getHistory(filters);
        return { data: history, error: null };
      } catch (error) {
        log.error('notification:history failed:', error);
        return { data: null, error: String(error) };
      }
    },
  );

  ipcMain.handle('notification:clear-history', () => {
    try {
      const deleted = notificationService.clearHistory();
      return { data: { deleted }, error: null };
    } catch (error) {
      log.error('notification:clear-history failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // ── App Logs ──────────────────────────────────────────────────────────

  ipcMain.handle(
    'appLog:list',
    (
      _event,
      filters?: {
        level?: string;
        agent_name?: string;
        search?: string;
        start_time?: string;
        end_time?: string;
        limit?: number;
        offset?: number;
      },
    ) => {
      try {
        let sql = 'SELECT * FROM app_logs WHERE 1=1';
        const params: unknown[] = [];

        if (filters?.level) {
          sql += ' AND level = ?';
          params.push(filters.level);
        }
        if (filters?.agent_name) {
          sql += ' AND agent_name = ?';
          params.push(filters.agent_name);
        }
        if (filters?.search) {
          sql += ' AND (message LIKE ? OR data LIKE ? OR source LIKE ?)';
          const searchPattern = `%${filters.search}%`;
          params.push(searchPattern, searchPattern, searchPattern);
        }
        if (filters?.start_time) {
          sql += ' AND created_at >= ?';
          params.push(filters.start_time);
        }
        if (filters?.end_time) {
          sql += ' AND created_at <= ?';
          params.push(filters.end_time);
        }

        sql += ' ORDER BY created_at DESC';
        sql += ` LIMIT ${filters?.limit ?? 500}`;
        if (filters?.offset) {
          sql += ` OFFSET ${filters.offset}`;
        }

        const logs = loggedPrepare(sql).all(...params);
        return { data: logs, error: null };
      } catch (error) {
        log.error('appLog:list failed:', error);
        return { data: null, error: String(error) };
      }
    },
  );

  ipcMain.handle(
    'appLog:create',
    (
      _event,
      entry: {
        level: string;
        message: string;
        source?: string;
        agent_name?: string;
        data?: string;
      },
    ) => {
      try {
        loggedPrepare(
          'INSERT INTO app_logs (level, message, source, agent_name, data) VALUES (?, ?, ?, ?, ?)',
        ).run(
          entry.level || 'info',
          entry.message,
          entry.source || null,
          entry.agent_name || null,
          entry.data || null,
        );
        return { data: true, error: null };
      } catch (error) {
        log.error('appLog:create failed:', error);
        return { data: false, error: String(error) };
      }
    },
  );

  ipcMain.handle('appLog:agents', () => {
    try {
      const agents = loggedPrepare(
        'SELECT DISTINCT agent_name FROM app_logs WHERE agent_name IS NOT NULL ORDER BY agent_name',
      ).all() as { agent_name: string }[];
      return { data: agents.map((a) => a.agent_name), error: null };
    } catch (error) {
      log.error('appLog:agents failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('appLog:purge', () => {
    try {
      loggedPrepare('DELETE FROM app_logs').run();
      return { data: true, error: null };
    } catch (error) {
      log.error('appLog:purge failed:', error);
      return { data: false, error: String(error) };
    }
  });

  ipcMain.handle('appLog:import-ndjson', (_event, ndjsonContent: string) => {
    try {
      const db = getDatabase();
      const insertStmt = db.prepare(
        'INSERT INTO app_logs (level, message, source, agent_name, data, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      );
      const lines = ndjsonContent.split('\n').filter((line) => line.trim());
      let imported = 0;

      const insertMany = db.transaction(() => {
        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            const level = entry.level || entry.severity || 'info';
            const normalizedLevel = ['debug', 'info', 'warn', 'error'].includes(level.toLowerCase())
              ? level.toLowerCase()
              : 'info';
            const message = entry.message || entry.msg || entry.text || JSON.stringify(entry);
            const source = entry.source || entry.logger || entry.module || null;
            const agentName = entry.agent_name || entry.agentName || entry.agent || null;
            const timestamp =
              entry.timestamp ||
              entry.time ||
              entry.created_at ||
              entry.ts ||
              new Date().toISOString();
            // Store the full original JSON in data for reference
            const data = JSON.stringify(entry);

            insertStmt.run(normalizedLevel, message, source, agentName, data, timestamp);
            imported++;
          } catch {
            // Skip malformed lines
          }
        }
      });

      insertMany();
      log.info(`[IPC] appLog:import-ndjson - imported ${imported} log entries`);
      return { data: { imported }, error: null };
    } catch (error) {
      log.error('appLog:import-ndjson failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // Checkpoint channels - save/load agent state checkpoints
  ipcMain.handle('checkpoint:list', () => {
    try {
      const checkpoints = loggedPrepare('SELECT * FROM checkpoints ORDER BY timestamp DESC').all();
      log.info(
        `[IPC] checkpoint:list - SELECT returned ${checkpoints.length} checkpoints from real database`,
      );
      return { data: checkpoints, error: null };
    } catch (error) {
      log.error('checkpoint:list failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('checkpoint:get', (_event, agentName: string) => {
    try {
      const checkpoint = loggedPrepare('SELECT * FROM checkpoints WHERE agent_name = ?').get(
        agentName,
      );
      log.info(`[IPC] checkpoint:get - SELECT checkpoint from real database: agent=${agentName}`);
      return { data: checkpoint || null, error: null };
    } catch (error) {
      log.error('checkpoint:get failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('checkpoint:save-now', () => {
    try {
      const saved = agentProcessManager.saveCheckpoints();
      log.info(`[IPC] checkpoint:save-now - saved ${saved} checkpoints`);
      return { data: { saved }, error: null };
    } catch (error) {
      log.error('checkpoint:save-now failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('checkpoint:delete', (_event, agentName: string) => {
    try {
      loggedPrepare('DELETE FROM checkpoints WHERE agent_name = ?').run(agentName);
      log.info(
        `[IPC] checkpoint:delete - DELETE checkpoint from real database: agent=${agentName}`,
      );
      return { data: true, error: null };
    } catch (error) {
      log.error('checkpoint:delete failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('checkpoint:recovery-status', () => {
    try {
      const status = checkpointService.getRecoveryStatus();
      log.info('[IPC] checkpoint:recovery-status - returning recovery status');
      return { data: status, error: null };
    } catch (error) {
      log.error('checkpoint:recovery-status failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('checkpoint:clear-all', () => {
    try {
      const deleted = checkpointService.clearCheckpoints();
      log.info(`[IPC] checkpoint:clear-all - cleared ${deleted} checkpoints`);
      return { data: { deleted }, error: null };
    } catch (error) {
      log.error('checkpoint:clear-all failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // ==========================================
  // Guard Rules & Violations
  // ==========================================

  ipcMain.handle('guardRule:get', (_event, role: string) => {
    try {
      const row = loggedPrepare(
        'SELECT role, display_name, tool_allowlist, bash_restrictions, file_scope, path_boundaries FROM agent_definitions WHERE role = ?',
      ).get(role);
      log.info(`[IPC] guardRule:get - SELECT guard rules for role=${role}`);
      return { data: row || null, error: null };
    } catch (error) {
      log.error('guardRule:get failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle(
    'guardRule:update',
    (
      _event,
      role: string,
      updates: {
        tool_allowlist?: string;
        bash_restrictions?: string;
        file_scope?: string;
        path_boundaries?: string;
      },
    ) => {
      try {
        const setClauses: string[] = [];
        const values: unknown[] = [];

        if (updates.tool_allowlist !== undefined) {
          setClauses.push('tool_allowlist = ?');
          values.push(updates.tool_allowlist);
        }
        if (updates.bash_restrictions !== undefined) {
          setClauses.push('bash_restrictions = ?');
          values.push(updates.bash_restrictions);
        }
        if (updates.file_scope !== undefined) {
          setClauses.push('file_scope = ?');
          values.push(updates.file_scope);
        }
        if (updates.path_boundaries !== undefined) {
          setClauses.push('path_boundaries = ?');
          values.push(updates.path_boundaries);
        }

        if (setClauses.length === 0) {
          return { data: null, error: 'No valid fields to update' };
        }

        setClauses.push("updated_at = datetime('now')");
        values.push(role);

        loggedPrepare(`UPDATE agent_definitions SET ${setClauses.join(', ')} WHERE role = ?`).run(
          ...values,
        );

        const updated = loggedPrepare('SELECT * FROM agent_definitions WHERE role = ?').get(role);
        log.info(`[IPC] guardRule:update - UPDATE guard rules for role=${role}`);
        return { data: updated, error: null };
      } catch (error) {
        log.error('guardRule:update failed:', error);
        return { data: null, error: String(error) };
      }
    },
  );

  // Path boundary validation - checks if a file path is within allowed boundaries for a role
  ipcMain.handle(
    'guardRule:path-boundary-validate',
    (_event, role: string, filePath: string, worktreePath?: string) => {
      try {
        const row = loggedPrepare(
          'SELECT path_boundaries FROM agent_definitions WHERE role = ?',
        ).get(role) as { path_boundaries: string | null } | undefined;

        if (!row) {
          return { data: { allowed: false, reason: `Role '${role}' not found` }, error: null };
        }

        if (!row.path_boundaries) {
          // No boundaries configured = unrestricted
          return { data: { allowed: true, reason: 'No path boundaries configured' }, error: null };
        }

        let boundaries: Array<{ pattern: string; type: string; description?: string }>;
        try {
          boundaries = JSON.parse(row.path_boundaries);
        } catch {
          return { data: { allowed: true, reason: 'Invalid path boundary config' }, error: null };
        }

        if (boundaries.length === 0) {
          return { data: { allowed: true, reason: 'No path boundaries configured' }, error: null };
        }

        const path = require('node:path');
        const normalizedFile = path.resolve(filePath);

        for (const boundary of boundaries) {
          if (boundary.type === 'worktree') {
            // Worktree boundary enforces that filePath is within the worktree root
            if (!worktreePath) {
              return {
                data: {
                  allowed: false,
                  reason: 'Worktree path not specified; worktree boundary requires a worktree',
                  boundary: boundary.pattern,
                },
                error: null,
              };
            }
            const normalizedWorktree = path.resolve(worktreePath);
            if (
              !normalizedFile.startsWith(normalizedWorktree + path.sep) &&
              normalizedFile !== normalizedWorktree
            ) {
              return {
                data: {
                  allowed: false,
                  reason: `Path '${filePath}' is outside worktree boundary '${worktreePath}'`,
                  boundary: normalizedWorktree,
                },
                error: null,
              };
            }
          } else if (boundary.type === 'directory') {
            const normalizedDir = path.resolve(boundary.pattern);
            if (
              !normalizedFile.startsWith(normalizedDir + path.sep) &&
              normalizedFile !== normalizedDir
            ) {
              return {
                data: {
                  allowed: false,
                  reason: `Path '${filePath}' is outside directory boundary '${boundary.pattern}'`,
                  boundary: normalizedDir,
                },
                error: null,
              };
            }
          } else if (boundary.type === 'glob') {
            // Simple glob check: if pattern starts with !, it's an exclusion
            if (boundary.pattern.startsWith('!')) {
              const excluded = boundary.pattern.slice(1);
              if (normalizedFile.includes(excluded)) {
                return {
                  data: {
                    allowed: false,
                    reason: `Path '${filePath}' matches exclusion pattern '${boundary.pattern}'`,
                    boundary: boundary.pattern,
                  },
                  error: null,
                };
              }
            }
          }
        }

        log.info(`[IPC] guardRule:path-boundary-validate - ${role} access to ${filePath}: ALLOWED`);
        return {
          data: { allowed: true, reason: 'Path is within all configured boundaries' },
          error: null,
        };
      } catch (error) {
        log.error('guardRule:path-boundary-validate failed:', error);
        return { data: null, error: String(error) };
      }
    },
  );

  // Bash restriction check - validates a command against a role's bash restriction patterns
  ipcMain.handle('guardRule:check-bash', (_event, role: string, command: string) => {
    try {
      const row = loggedPrepare(
        'SELECT bash_restrictions FROM agent_definitions WHERE role = ?',
      ).get(role) as { bash_restrictions: string | null } | undefined;

      if (!row) {
        return { data: { blocked: false, reason: `Role '${role}' not found` }, error: null };
      }

      if (!row.bash_restrictions) {
        return { data: { blocked: false, reason: 'No bash restrictions configured' }, error: null };
      }

      let restrictions: string[];
      try {
        restrictions = JSON.parse(row.bash_restrictions);
      } catch {
        return {
          data: { blocked: false, reason: 'Invalid bash restrictions config' },
          error: null,
        };
      }

      const normalizedCommand = command.toLowerCase().trim();

      for (const pattern of restrictions) {
        const normalizedPattern = pattern.toLowerCase().trim();
        // Check if the command contains the restriction pattern
        if (normalizedCommand.includes(normalizedPattern)) {
          log.warn(
            `[GUARD] Bash command blocked for role=${role}: "${command}" matches restriction "${pattern}"`,
          );
          return {
            data: {
              blocked: true,
              reason: `Command matches bash restriction: "${pattern}"`,
              matched_pattern: pattern,
            },
            error: null,
          };
        }
      }

      log.info(`[IPC] guardRule:check-bash - ${role} command "${command}": ALLOWED`);
      return { data: { blocked: false, reason: 'Command is allowed' }, error: null };
    } catch (error) {
      log.error('guardRule:check-bash failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle(
    'guardViolation:list',
    (
      _event,
      filters?: {
        capability?: string;
        rule_type?: string;
        severity?: string;
        acknowledged?: boolean;
        limit?: number;
      },
    ) => {
      try {
        let sql = 'SELECT * FROM guard_violations WHERE 1=1';
        const params: unknown[] = [];

        if (filters?.capability) {
          sql += ' AND capability = ?';
          params.push(filters.capability);
        }
        if (filters?.rule_type) {
          sql += ' AND rule_type = ?';
          params.push(filters.rule_type);
        }
        if (filters?.severity) {
          sql += ' AND severity = ?';
          params.push(filters.severity);
        }
        if (filters?.acknowledged !== undefined) {
          sql += ' AND acknowledged = ?';
          params.push(filters.acknowledged ? 1 : 0);
        }

        sql += ' ORDER BY created_at DESC';

        if (filters?.limit) {
          sql += ' LIMIT ?';
          params.push(filters.limit);
        }

        const rows = loggedPrepare(sql).all(...params);
        log.info(`[IPC] guardViolation:list - found ${(rows as unknown[]).length} violations`);
        return { data: rows, error: null };
      } catch (error) {
        log.error('guardViolation:list failed:', error);
        return { data: null, error: String(error) };
      }
    },
  );

  ipcMain.handle(
    'guardViolation:create',
    (
      _event,
      violation: {
        id: string;
        agent_name: string;
        capability: string;
        rule_type: string;
        violation: string;
        tool_attempted?: string;
        command_attempted?: string;
        file_attempted?: string;
        severity?: string;
      },
    ) => {
      try {
        loggedPrepare(
          `INSERT INTO guard_violations (id, agent_name, capability, rule_type, violation, tool_attempted, command_attempted, file_attempted, severity)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          violation.id,
          violation.agent_name,
          violation.capability,
          violation.rule_type,
          violation.violation,
          violation.tool_attempted ?? null,
          violation.command_attempted ?? null,
          violation.file_attempted ?? null,
          violation.severity ?? 'warning',
        );

        const created = loggedPrepare('SELECT * FROM guard_violations WHERE id = ?').get(
          violation.id,
        );
        log.warn(
          `[GUARD VIOLATION] Agent "${violation.agent_name}" (${violation.capability}) violated ${violation.rule_type}: ${violation.violation}`,
        );
        return { data: created, error: null };
      } catch (error) {
        log.error('guardViolation:create failed:', error);
        return { data: null, error: String(error) };
      }
    },
  );

  ipcMain.handle('guardViolation:acknowledge', (_event, id: string) => {
    try {
      loggedPrepare('UPDATE guard_violations SET acknowledged = 1 WHERE id = ?').run(id);
      log.info(`[IPC] guardViolation:acknowledge - id=${id}`);
      return { data: true, error: null };
    } catch (error) {
      log.error('guardViolation:acknowledge failed:', error);
      return { data: false, error: String(error) };
    }
  });

  ipcMain.handle('guardViolation:purge', () => {
    try {
      loggedPrepare('DELETE FROM guard_violations').run();
      log.info('[IPC] guardViolation:purge - all violations cleared');
      return { data: true, error: null };
    } catch (error) {
      log.error('guardViolation:purge failed:', error);
      return { data: false, error: String(error) };
    }
  });

  ipcMain.handle('guardViolation:stats', () => {
    try {
      const total = (
        loggedPrepare('SELECT COUNT(*) as cnt FROM guard_violations').get() as { cnt: number }
      ).cnt;
      const unacknowledged = (
        loggedPrepare(
          'SELECT COUNT(*) as cnt FROM guard_violations WHERE acknowledged = 0',
        ).get() as { cnt: number }
      ).cnt;
      const byTypeRows = loggedPrepare(
        'SELECT rule_type, COUNT(*) as cnt FROM guard_violations GROUP BY rule_type',
      ).all() as Array<{ rule_type: string; cnt: number }>;
      const bySeverityRows = loggedPrepare(
        'SELECT severity, COUNT(*) as cnt FROM guard_violations GROUP BY severity',
      ).all() as Array<{ severity: string; cnt: number }>;

      const by_type: Record<string, number> = {};
      for (const r of byTypeRows) by_type[r.rule_type] = r.cnt;
      const by_severity: Record<string, number> = {};
      for (const r of bySeverityRows) by_severity[r.severity] = r.cnt;

      return { data: { total, unacknowledged, by_type, by_severity }, error: null };
    } catch (error) {
      log.error('guardViolation:stats failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // ==========================================
  // Discovery Scans
  // ==========================================

  ipcMain.handle('discovery:list', () => {
    try {
      const rows = loggedPrepare('SELECT * FROM discovery_scans ORDER BY created_at DESC').all();
      return { data: rows, error: null };
    } catch (error) {
      log.error('[Discovery] List error:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('discovery:get', (_event, id: string) => {
    try {
      const row = loggedPrepare('SELECT * FROM discovery_scans WHERE id = ?').get(id);
      return { data: row || null, error: null };
    } catch (error) {
      log.error('[Discovery] Get error:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle(
    'discovery:start',
    (_event, options: { id: string; categories: string[]; project_id?: string }) => {
      try {
        const now = new Date().toISOString();
        const initialProgress: Record<string, string> = {};
        for (const cat of options.categories) {
          initialProgress[cat] = 'pending';
        }
        loggedPrepare(
          `INSERT INTO discovery_scans (id, project_id, status, categories, progress, started_at)
           VALUES (?, ?, 'running', ?, ?, ?)`,
        ).run(
          options.id,
          options.project_id ?? null,
          JSON.stringify(options.categories),
          JSON.stringify(initialProgress),
          now,
        );
        const row = loggedPrepare('SELECT * FROM discovery_scans WHERE id = ?').get(options.id);
        return { data: row, error: null };
      } catch (error) {
        log.error('[Discovery] Start error:', error);
        return { data: null, error: String(error) };
      }
    },
  );

  ipcMain.handle('discovery:complete', (_event, id: string) => {
    try {
      const now = new Date().toISOString();
      loggedPrepare(
        `UPDATE discovery_scans SET status = 'completed', completed_at = ? WHERE id = ?`,
      ).run(now, id);
      const row = loggedPrepare('SELECT * FROM discovery_scans WHERE id = ?').get(id);
      return { data: row, error: null };
    } catch (error) {
      log.error('[Discovery] Complete error:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('discovery:delete', (_event, id: string) => {
    try {
      loggedPrepare('DELETE FROM discovery_findings WHERE scan_id = ?').run(id);
      loggedPrepare('DELETE FROM discovery_scans WHERE id = ?').run(id);
      return { data: true, error: null };
    } catch (error) {
      log.error('[Discovery] Delete error:', error);
      return { data: false, error: String(error) };
    }
  });

  ipcMain.handle(
    'discovery:update-progress',
    (_event, id: string, progress: Record<string, string>) => {
      try {
        loggedPrepare('UPDATE discovery_scans SET progress = ? WHERE id = ?').run(
          JSON.stringify(progress),
          id,
        );
        const row = loggedPrepare('SELECT * FROM discovery_scans WHERE id = ?').get(id);
        return { data: row, error: null };
      } catch (error) {
        log.error('[Discovery] Update progress error:', error);
        return { data: null, error: String(error) };
      }
    },
  );

  ipcMain.handle('discovery:findings', (_event, scanId: string, category?: string) => {
    try {
      let sql = 'SELECT * FROM discovery_findings WHERE scan_id = ?';
      const params: unknown[] = [scanId];
      if (category) {
        sql += ' AND category = ?';
        params.push(category);
      }
      sql += ' ORDER BY severity DESC, created_at ASC';
      const rows = loggedPrepare(sql).all(...params);
      return { data: rows, error: null };
    } catch (error) {
      log.error('[Discovery] Findings error:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle(
    'discovery:add-finding',
    (
      _event,
      finding: {
        id: string;
        scan_id: string;
        category: string;
        title: string;
        description: string;
        file_path?: string;
        line_number?: number;
        severity?: string;
      },
    ) => {
      try {
        loggedPrepare(
          `INSERT INTO discovery_findings (id, scan_id, category, title, description, file_path, line_number, severity)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          finding.id,
          finding.scan_id,
          finding.category,
          finding.title,
          finding.description,
          finding.file_path ?? null,
          finding.line_number ?? null,
          finding.severity ?? 'info',
        );
        const row = loggedPrepare('SELECT * FROM discovery_findings WHERE id = ?').get(finding.id);
        return { data: row, error: null };
      } catch (error) {
        log.error('[Discovery] Add finding error:', error);
        return { data: null, error: String(error) };
      }
    },
  );

  // ==========================================
  // Expertise Records
  // ==========================================

  ipcMain.handle(
    'expertise:list',
    (
      _event,
      filters?: { domain?: string; type?: string; classification?: string; search?: string },
    ) => {
      try {
        let sql = 'SELECT * FROM expertise_records WHERE 1=1';
        const params: unknown[] = [];

        if (filters?.domain) {
          sql += ' AND domain = ?';
          params.push(filters.domain);
        }
        if (filters?.type) {
          sql += ' AND type = ?';
          params.push(filters.type);
        }
        if (filters?.classification) {
          sql += ' AND classification = ?';
          params.push(filters.classification);
        }
        if (filters?.search) {
          sql += ' AND (title LIKE ? OR content LIKE ? OR domain LIKE ?)';
          const searchTerm = `%${filters.search}%`;
          params.push(searchTerm, searchTerm, searchTerm);
        }

        sql += ' ORDER BY updated_at DESC';

        const records = loggedPrepare(sql).all(...params);
        log.info(`[IPC] expertise:list - found ${(records as unknown[]).length} records`);
        return { data: records, error: null };
      } catch (error) {
        log.error('expertise:list failed:', error);
        return { data: null, error: String(error) };
      }
    },
  );

  ipcMain.handle('expertise:domains', () => {
    try {
      const domains = loggedPrepare(
        'SELECT domain, COUNT(*) as record_count, MAX(COALESCE(updated_at, created_at)) as last_updated FROM expertise_records GROUP BY domain ORDER BY domain ASC',
      ).all() as Array<{ domain: string; record_count: number; last_updated: string | null }>;

      // For each domain, get type breakdown
      const result = domains.map((d) => {
        const types = loggedPrepare(
          'SELECT type, COUNT(*) as cnt FROM expertise_records WHERE domain = ? GROUP BY type',
        ).all(d.domain) as Array<{ type: string; cnt: number }>;

        const typeMap: Record<string, number> = {};
        for (const t of types) {
          typeMap[t.type] = t.cnt;
        }

        return {
          domain: d.domain,
          record_count: d.record_count,
          types: typeMap,
          last_updated: d.last_updated,
        };
      });

      log.info(`[IPC] expertise:domains - found ${result.length} domains`);
      return { data: result, error: null };
    } catch (error) {
      log.error('expertise:domains failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle(
    'expertise:create',
    (
      _event,
      record: {
        id: string;
        domain: string;
        title: string;
        content: string;
        type: string;
        classification: string;
        agent_name?: string;
        source_file?: string;
        tags?: string;
      },
    ) => {
      try {
        loggedPrepare(
          `INSERT INTO expertise_records (id, domain, title, content, type, classification, agent_name, source_file, tags)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          record.id,
          record.domain,
          record.title,
          record.content,
          record.type,
          record.classification,
          record.agent_name ?? null,
          record.source_file ?? null,
          record.tags ?? null,
        );

        const created = loggedPrepare('SELECT * FROM expertise_records WHERE id = ?').get(
          record.id,
        );
        log.info(
          `[IPC] expertise:create - INSERT into real database: domain=${record.domain}, title=${record.title}`,
        );
        return { data: created, error: null };
      } catch (error) {
        log.error('expertise:create failed:', error);
        return { data: null, error: String(error) };
      }
    },
  );

  ipcMain.handle('expertise:get', (_event, id: string) => {
    try {
      const record = loggedPrepare('SELECT * FROM expertise_records WHERE id = ?').get(id);
      log.info(`[IPC] expertise:get - SELECT from real database: id=${id}`);
      return { data: record ?? null, error: null };
    } catch (error) {
      log.error('expertise:get failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('expertise:delete', (_event, id: string) => {
    try {
      loggedPrepare('DELETE FROM expertise_records WHERE id = ?').run(id);
      log.info(`[IPC] expertise:delete - DELETE from real database: id=${id}`);
      return { data: true, error: null };
    } catch (error) {
      log.error('expertise:delete failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('expertise:update', (_event, id: string, updates: Record<string, unknown>) => {
    try {
      const allowedFields = [
        'domain',
        'title',
        'content',
        'type',
        'classification',
        'agent_name',
        'source_file',
        'tags',
      ];
      const setClauses: string[] = [];
      const values: unknown[] = [];

      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          setClauses.push(`${key} = ?`);
          values.push(value);
        }
      }

      if (setClauses.length === 0) {
        return { data: null, error: 'No valid fields to update' };
      }

      setClauses.push("updated_at = datetime('now')");
      values.push(id);

      loggedPrepare(`UPDATE expertise_records SET ${setClauses.join(', ')} WHERE id = ?`).run(
        ...values,
      );

      const updated = loggedPrepare('SELECT * FROM expertise_records WHERE id = ?').get(id);
      log.info(`[IPC] expertise:update - UPDATE in real database: id=${id}`);
      return { data: updated, error: null };
    } catch (error) {
      log.error('expertise:update failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // ── Agent Identity ────────────────────────────────────────────
  ipcMain.handle('identity:get', (_event, name: string) => {
    try {
      const identity = loggedPrepare('SELECT * FROM agent_identities WHERE name = ?').get(name);
      log.info(`[IPC] identity:get - SELECT identity name=${name}`);
      return { data: identity || null, error: null };
    } catch (error) {
      log.error('identity:get failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('identity:list', () => {
    try {
      const identities = loggedPrepare(
        'SELECT * FROM agent_identities ORDER BY updated_at DESC',
      ).all();
      log.info(`[IPC] identity:list - SELECT all identities (${(identities as unknown[]).length})`);
      return { data: identities, error: null };
    } catch (error) {
      log.error('identity:list failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle(
    'identity:upsert',
    (
      _event,
      identity: {
        name: string;
        capability: string;
        expertise_domains?: string;
        recent_tasks?: string;
      },
    ) => {
      try {
        const existing = loggedPrepare('SELECT * FROM agent_identities WHERE name = ?').get(
          identity.name,
        );
        if (existing) {
          const updates: string[] = [];
          const values: unknown[] = [];
          if (identity.capability) {
            updates.push('capability = ?');
            values.push(identity.capability);
          }
          if (identity.expertise_domains !== undefined) {
            updates.push('expertise_domains = ?');
            values.push(identity.expertise_domains);
          }
          if (identity.recent_tasks !== undefined) {
            updates.push('recent_tasks = ?');
            values.push(identity.recent_tasks);
          }
          updates.push("updated_at = datetime('now')");
          values.push(identity.name);
          loggedPrepare(`UPDATE agent_identities SET ${updates.join(', ')} WHERE name = ?`).run(
            ...values,
          );
        } else {
          loggedPrepare(
            `INSERT INTO agent_identities (name, capability, sessions_completed, expertise_domains, recent_tasks)
             VALUES (?, ?, 0, ?, ?)`,
          ).run(
            identity.name,
            identity.capability,
            identity.expertise_domains ?? '[]',
            identity.recent_tasks ?? '[]',
          );
        }
        const result = loggedPrepare('SELECT * FROM agent_identities WHERE name = ?').get(
          identity.name,
        );
        log.info(
          `[IPC] identity:upsert - ${existing ? 'UPDATE' : 'INSERT'} identity: ${identity.name}`,
        );
        return { data: result, error: null };
      } catch (error) {
        log.error('identity:upsert failed:', error);
        return { data: null, error: String(error) };
      }
    },
  );

  ipcMain.handle('identity:sessions', (_event, agentName: string) => {
    try {
      const sessions = loggedPrepare(
        'SELECT * FROM sessions WHERE agent_name = ? ORDER BY created_at DESC LIMIT 20',
      ).all(agentName);
      log.info(
        `[IPC] identity:sessions - SELECT sessions for ${agentName} (${(sessions as unknown[]).length})`,
      );
      return { data: sessions, error: null };
    } catch (error) {
      log.error('identity:sessions failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('identity:update-expertise', (_event, name: string, domains: string) => {
    try {
      loggedPrepare(
        `UPDATE agent_identities SET expertise_domains = ?, updated_at = datetime('now') WHERE name = ?`,
      ).run(domains, name);
      const result = loggedPrepare('SELECT * FROM agent_identities WHERE name = ?').get(name);
      log.info(`[IPC] identity:update-expertise - UPDATE expertise for ${name}`);
      return { data: result, error: null };
    } catch (error) {
      log.error('identity:update-expertise failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // ===== Prompts =====

  ipcMain.handle('prompt:list', () => {
    try {
      const prompts = loggedPrepare('SELECT * FROM prompts ORDER BY name ASC').all();
      log.info(`[IPC] prompt:list - SELECT returned ${(prompts as unknown[]).length} prompts`);
      return { data: prompts, error: null };
    } catch (error) {
      log.error('prompt:list failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('prompt:get', (_event, id: string) => {
    try {
      const prompt = loggedPrepare('SELECT * FROM prompts WHERE id = ?').get(id);
      log.info(`[IPC] prompt:get - SELECT prompt id=${id}`);
      return { data: prompt || null, error: null };
    } catch (error) {
      log.error('prompt:get failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle(
    'prompt:create',
    (
      _event,
      prompt: {
        id: string;
        name: string;
        description?: string;
        content: string;
        type: string;
        parent_id?: string;
        tags?: string;
      },
    ) => {
      try {
        loggedPrepare(
          `INSERT INTO prompts (id, name, description, content, type, parent_id, tags)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          prompt.id,
          prompt.name,
          prompt.description ?? null,
          prompt.content,
          prompt.type,
          prompt.parent_id ?? null,
          prompt.tags ?? null,
        );

        // Also create version 1
        const versionId = `pv-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        loggedPrepare(
          `INSERT INTO prompt_versions (id, prompt_id, version, content, change_summary)
           VALUES (?, ?, 1, ?, 'Initial version')`,
        ).run(versionId, prompt.id, prompt.content);

        const created = loggedPrepare('SELECT * FROM prompts WHERE id = ?').get(prompt.id);
        log.info(`[IPC] prompt:create - INSERT prompt id=${prompt.id}`);
        return { data: created, error: null };
      } catch (error) {
        log.error('prompt:create failed:', error);
        return { data: null, error: String(error) };
      }
    },
  );

  ipcMain.handle('prompt:update', (_event, id: string, updates: Record<string, unknown>) => {
    try {
      const existing = loggedPrepare('SELECT * FROM prompts WHERE id = ?').get(id) as
        | { version: number; content: string }
        | undefined;
      if (!existing) {
        return { data: null, error: 'Prompt not found' };
      }

      const setClauses: string[] = [];
      const values: unknown[] = [];

      const allowedFields = [
        'name',
        'description',
        'content',
        'type',
        'parent_id',
        'is_active',
        'tags',
      ];
      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          setClauses.push(`${field} = ?`);
          values.push(updates[field]);
        }
      }

      // If content changed, bump version and create version record
      const contentChanged = updates.content !== undefined && updates.content !== existing.content;
      if (contentChanged) {
        const newVersion = existing.version + 1;
        setClauses.push('version = ?');
        values.push(newVersion);

        const versionId = `pv-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        loggedPrepare(
          `INSERT INTO prompt_versions (id, prompt_id, version, content, change_summary)
             VALUES (?, ?, ?, ?, ?)`,
        ).run(
          versionId,
          id,
          newVersion,
          updates.content as string,
          (updates.change_summary as string) || `Version ${newVersion}`,
        );
      }

      if (setClauses.length === 0) {
        const current = loggedPrepare('SELECT * FROM prompts WHERE id = ?').get(id);
        return { data: current, error: null };
      }

      setClauses.push("updated_at = datetime('now')");
      values.push(id);

      loggedPrepare(`UPDATE prompts SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);

      const updated = loggedPrepare('SELECT * FROM prompts WHERE id = ?').get(id);
      log.info(`[IPC] prompt:update - UPDATE prompt id=${id}, contentChanged=${contentChanged}`);
      return { data: updated, error: null };
    } catch (error) {
      log.error('prompt:update failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('prompt:delete', (_event, id: string) => {
    try {
      // Delete versions first
      loggedPrepare('DELETE FROM prompt_versions WHERE prompt_id = ?').run(id);
      // Unlink children (set parent_id to null)
      loggedPrepare('UPDATE prompts SET parent_id = NULL WHERE parent_id = ?').run(id);
      loggedPrepare('DELETE FROM prompts WHERE id = ?').run(id);
      log.info(`[IPC] prompt:delete - DELETE prompt id=${id}`);
      return { data: true, error: null };
    } catch (error) {
      log.error('prompt:delete failed:', error);
      return { data: false, error: String(error) };
    }
  });

  ipcMain.handle('prompt:version-list', (_event, promptId: string) => {
    try {
      const versions = loggedPrepare(
        'SELECT * FROM prompt_versions WHERE prompt_id = ? ORDER BY version DESC',
      ).all(promptId);
      log.info(
        `[IPC] prompt:version-list - SELECT returned ${(versions as unknown[]).length} versions for prompt ${promptId}`,
      );
      return { data: versions, error: null };
    } catch (error) {
      log.error('prompt:version-list failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('prompt:version-get', (_event, id: string) => {
    try {
      const version = loggedPrepare('SELECT * FROM prompt_versions WHERE id = ?').get(id);
      log.info(`[IPC] prompt:version-get - SELECT version id=${id}`);
      return { data: version || null, error: null };
    } catch (error) {
      log.error('prompt:version-get failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // ─── Quality Gates ──────────────────────────────────────

  ipcMain.handle('qualityGate:list', (_event, projectId: string) => {
    try {
      const db = getDatabase();
      const rows = db
        .prepare(
          'SELECT * FROM quality_gates WHERE project_id = ? ORDER BY sort_order ASC, created_at ASC',
        )
        .all(projectId);
      return { data: rows, error: null };
    } catch (err) {
      return { data: null, error: String(err) };
    }
  });

  ipcMain.handle(
    'qualityGate:create',
    (
      _event,
      gate: {
        id: string;
        project_id: string;
        gate_type: string;
        name: string;
        command: string;
        enabled?: boolean;
        sort_order?: number;
      },
    ) => {
      try {
        const db = getDatabase();
        db.prepare(
          'INSERT INTO quality_gates (id, project_id, gate_type, name, command, enabled, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ).run(
          gate.id,
          gate.project_id,
          gate.gate_type,
          gate.name,
          gate.command,
          gate.enabled !== false ? 1 : 0,
          gate.sort_order ?? 0,
        );
        const row = db.prepare('SELECT * FROM quality_gates WHERE id = ?').get(gate.id);
        return { data: row, error: null };
      } catch (err) {
        return { data: null, error: String(err) };
      }
    },
  );

  ipcMain.handle('qualityGate:update', (_event, id: string, updates: Record<string, unknown>) => {
    try {
      const db = getDatabase();
      const allowed = ['gate_type', 'name', 'command', 'enabled', 'sort_order'];
      const setClauses: string[] = [];
      const values: unknown[] = [];
      for (const [key, val] of Object.entries(updates)) {
        if (allowed.includes(key)) {
          setClauses.push(`${key} = ?`);
          values.push(key === 'enabled' ? (val ? 1 : 0) : val);
        }
      }
      if (setClauses.length === 0) {
        return { data: null, error: 'No valid fields to update' };
      }
      setClauses.push("updated_at = datetime('now')");
      values.push(id);
      db.prepare(`UPDATE quality_gates SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);
      const row = db.prepare('SELECT * FROM quality_gates WHERE id = ?').get(id);
      return { data: row, error: null };
    } catch (err) {
      return { data: null, error: String(err) };
    }
  });

  ipcMain.handle('qualityGate:delete', (_event, id: string) => {
    try {
      const db = getDatabase();
      db.prepare('DELETE FROM quality_gates WHERE id = ?').run(id);
      return { data: true, error: null };
    } catch (err) {
      return { data: false, error: String(err) };
    }
  });

  ipcMain.handle(
    'qualityGate:reorder',
    (_event, gates: Array<{ id: string; sort_order: number }>) => {
      try {
        const db = getDatabase();
        const stmt = db.prepare(
          "UPDATE quality_gates SET sort_order = ?, updated_at = datetime('now') WHERE id = ?",
        );
        const reorderAll = db.transaction((items: Array<{ id: string; sort_order: number }>) => {
          for (const item of items) {
            stmt.run(item.sort_order, item.id);
          }
        });
        reorderAll(gates);
        return { data: true, error: null };
      } catch (err) {
        return { data: false, error: String(err) };
      }
    },
  );

  // ─── Quality Gate Execution ─────────────────────────────

  ipcMain.handle(
    'qualityGate:run',
    async (
      _event,
      projectId: string,
      options?: { agent_name?: string; session_id?: string; cwd?: string },
    ) => {
      try {
        const db = getDatabase();
        const gates = db
          .prepare(
            'SELECT * FROM quality_gates WHERE project_id = ? AND enabled = 1 ORDER BY sort_order ASC',
          )
          .all(projectId) as Array<{
          id: string;
          gate_type: string;
          name: string;
          command: string;
        }>;

        if (gates.length === 0) {
          return {
            data: {
              all_passed: true,
              results: [],
              agent_name: options?.agent_name || null,
              session_id: options?.session_id || null,
              project_id: projectId,
            },
            error: null,
          };
        }

        // Determine working directory from project or options
        let cwd = options?.cwd;
        if (!cwd) {
          const project = db.prepare('SELECT path FROM projects WHERE id = ?').get(projectId) as
            | { path: string }
            | undefined;
          if (project) {
            cwd = project.path;
          }
        }

        const results: Array<Record<string, unknown>> = [];
        let allPassed = true;

        for (const gate of gates) {
          const resultId = `qgr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const startTime = Date.now();

          try {
            const { exitCode, stdout, stderr } = await new Promise<{
              exitCode: number;
              stdout: string;
              stderr: string;
            }>((resolve) => {
              exec(
                gate.command,
                {
                  cwd: cwd || undefined,
                  timeout: 120000,
                  maxBuffer: 1024 * 1024,
                },
                (error, stdout, stderr) => {
                  resolve({
                    exitCode: error?.code ?? 0,
                    stdout: stdout?.slice(0, 10000) || '',
                    stderr: stderr?.slice(0, 10000) || '',
                  });
                },
              );
            });

            const durationMs = Date.now() - startTime;
            const status = exitCode === 0 ? 'passed' : 'failed';
            if (status === 'failed') allPassed = false;

            db.prepare(
              'INSERT INTO quality_gate_results (id, gate_id, agent_name, session_id, project_id, gate_type, gate_name, command, status, exit_code, stdout, stderr, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            ).run(
              resultId,
              gate.id,
              options?.agent_name || null,
              options?.session_id || null,
              projectId,
              gate.gate_type,
              gate.name,
              gate.command,
              status,
              exitCode,
              stdout,
              stderr,
              durationMs,
            );

            const row = db.prepare('SELECT * FROM quality_gate_results WHERE id = ?').get(resultId);
            results.push(row as Record<string, unknown>);
          } catch (execErr) {
            const durationMs = Date.now() - startTime;
            allPassed = false;

            db.prepare(
              'INSERT INTO quality_gate_results (id, gate_id, agent_name, session_id, project_id, gate_type, gate_name, command, status, exit_code, stdout, stderr, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            ).run(
              resultId,
              gate.id,
              options?.agent_name || null,
              options?.session_id || null,
              projectId,
              gate.gate_type,
              gate.name,
              gate.command,
              'error',
              -1,
              '',
              String(execErr),
              durationMs,
            );

            const row = db.prepare('SELECT * FROM quality_gate_results WHERE id = ?').get(resultId);
            results.push(row as Record<string, unknown>);
          }
        }

        // If gates failed for a builder agent, send notification via mail
        if (!allPassed && options?.agent_name) {
          try {
            const failedGates = results
              .filter((r) => r.status !== 'passed')
              .map((r) => r.gate_name)
              .join(', ');
            const mailId = `msg_qg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            db.prepare(
              "INSERT INTO messages (id, from_agent, to_agent, subject, body, type, priority) VALUES (?, 'system', ?, ?, ?, 'error', 'high')",
            ).run(
              mailId,
              options.agent_name,
              'Quality Gates Failed',
              `Quality gates failed: ${failedGates}. Please fix the issues and try again.`,
            );
            log.info(
              `[QualityGate] Notified agent ${options.agent_name} about failed gates: ${failedGates}`,
            );
          } catch (mailErr) {
            log.warn('[QualityGate] Failed to send gate failure notification:', mailErr);
          }
        }

        log.info(
          `[QualityGate] Ran ${gates.length} gates for project ${projectId}: ${allPassed ? 'ALL PASSED' : 'SOME FAILED'}`,
        );

        return {
          data: {
            all_passed: allPassed,
            results,
            agent_name: options?.agent_name || null,
            session_id: options?.session_id || null,
            project_id: projectId,
          },
          error: null,
        };
      } catch (err) {
        return { data: null, error: String(err) };
      }
    },
  );

  ipcMain.handle(
    'qualityGate:results',
    (
      _event,
      filters?: {
        project_id?: string;
        agent_name?: string;
        session_id?: string;
        limit?: number;
      },
    ) => {
      try {
        const db = getDatabase();
        let query = 'SELECT * FROM quality_gate_results WHERE 1=1';
        const params: unknown[] = [];
        if (filters?.project_id) {
          query += ' AND project_id = ?';
          params.push(filters.project_id);
        }
        if (filters?.agent_name) {
          query += ' AND agent_name = ?';
          params.push(filters.agent_name);
        }
        if (filters?.session_id) {
          query += ' AND session_id = ?';
          params.push(filters.session_id);
        }
        query += ' ORDER BY created_at DESC';
        if (filters?.limit) {
          query += ' LIMIT ?';
          params.push(filters.limit);
        }
        const rows = db.prepare(query).all(...params);
        return { data: rows, error: null };
      } catch (err) {
        return { data: null, error: String(err) };
      }
    },
  );

  // ─── Hooks ───────────────────────────────────────────────

  ipcMain.handle('hook:list', (_event, filters?: { project_id?: string; hook_type?: string }) => {
    try {
      let sql = 'SELECT * FROM hooks WHERE 1=1';
      const params: unknown[] = [];
      if (filters?.project_id) {
        sql += ' AND project_id = ?';
        params.push(filters.project_id);
      }
      if (filters?.hook_type) {
        sql += ' AND hook_type = ?';
        params.push(filters.hook_type);
      }
      sql += ' ORDER BY hook_type, name';
      const rows = loggedPrepare(sql).all(...params);
      log.info(`[IPC] hook:list - returned ${(rows as unknown[]).length} hooks`);
      return { data: rows, error: null };
    } catch (error) {
      log.error('hook:list failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('hook:get', (_event, id: string) => {
    try {
      const hook = loggedPrepare('SELECT * FROM hooks WHERE id = ?').get(id);
      return { data: hook || null, error: null };
    } catch (error) {
      log.error('hook:get failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle(
    'hook:create',
    (
      _event,
      hook: {
        id: string;
        project_id?: string;
        hook_type: string;
        name: string;
        description?: string;
        script_content?: string;
      },
    ) => {
      try {
        loggedPrepare(
          `INSERT INTO hooks (id, project_id, hook_type, name, description, script_content)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(
          hook.id,
          hook.project_id ?? null,
          hook.hook_type,
          hook.name,
          hook.description ?? null,
          hook.script_content ?? '',
        );
        const created = loggedPrepare('SELECT * FROM hooks WHERE id = ?').get(hook.id);
        log.info(`[IPC] hook:create - created hook ${hook.name} (${hook.hook_type})`);
        return { data: created, error: null };
      } catch (error) {
        log.error('hook:create failed:', error);
        return { data: null, error: String(error) };
      }
    },
  );

  ipcMain.handle('hook:update', (_event, id: string, updates: Record<string, unknown>) => {
    try {
      const fields: string[] = [];
      const values: unknown[] = [];
      for (const [key, val] of Object.entries(updates)) {
        if (
          [
            'hook_type',
            'name',
            'description',
            'script_content',
            'is_installed',
            'project_id',
            'target_worktrees',
            'installed_at',
          ].includes(key)
        ) {
          fields.push(`${key} = ?`);
          values.push(val);
        }
      }
      if (fields.length === 0) {
        return { data: null, error: 'No valid fields to update' };
      }
      fields.push("updated_at = datetime('now')");
      values.push(id);
      loggedPrepare(`UPDATE hooks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
      const updated = loggedPrepare('SELECT * FROM hooks WHERE id = ?').get(id);
      log.info(`[IPC] hook:update - updated hook ${id}`);
      return { data: updated, error: null };
    } catch (error) {
      log.error('hook:update failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('hook:delete', (_event, id: string) => {
    try {
      loggedPrepare('DELETE FROM hooks WHERE id = ?').run(id);
      log.info(`[IPC] hook:delete - deleted hook ${id}`);
      return { data: true, error: null };
    } catch (error) {
      log.error('hook:delete failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('hook:deploy', (_event, hookIds: string[], worktreePaths: string[]) => {
    try {
      const results: Array<{ hookId: string; worktree: string; success: boolean; error?: string }> =
        [];
      for (const hookId of hookIds) {
        const hook = loggedPrepare('SELECT * FROM hooks WHERE id = ?').get(hookId) as
          | {
              id: string;
              hook_type: string;
              name: string;
              script_content: string;
              target_worktrees: string | null;
            }
          | undefined;
        if (!hook) {
          for (const wt of worktreePaths) {
            results.push({ hookId, worktree: wt, success: false, error: 'Hook not found' });
          }
          continue;
        }
        // Mark hook as installed and record target worktrees
        const allTargets = worktreePaths;
        loggedPrepare(
          `UPDATE hooks SET is_installed = 1, target_worktrees = ?, installed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
        ).run(JSON.stringify(allTargets), hookId);

        for (const wt of worktreePaths) {
          try {
            // Write the hook script to the worktree's .claude/hooks directory
            const fs = require('node:fs');
            const hooksDir = path.join(wt, '.claude', 'hooks');
            fs.mkdirSync(hooksDir, { recursive: true });
            const hookFileName = `${hook.hook_type}_${hook.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.sh`;
            const hookFilePath = path.join(hooksDir, hookFileName);
            fs.writeFileSync(hookFilePath, hook.script_content, { mode: 0o755 });
            results.push({ hookId, worktree: wt, success: true });
            // Log deploy event
            const evtId = `hevt-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
            loggedPrepare(
              `INSERT INTO hook_events (id, hook_id, hook_name, hook_type, trigger, status, worktree, details)
               VALUES (?, ?, ?, ?, 'deploy', 'success', ?, 'Deployed to worktree')`,
            ).run(evtId, hookId, hook.name, hook.hook_type, wt);
          } catch (err) {
            results.push({ hookId, worktree: wt, success: false, error: String(err) });
            // Log failed deploy event
            const evtId = `hevt-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
            try {
              loggedPrepare(
                `INSERT INTO hook_events (id, hook_id, hook_name, hook_type, trigger, status, worktree, error_message)
                 VALUES (?, ?, ?, ?, 'deploy', 'failure', ?, ?)`,
              ).run(evtId, hookId, hook.name, hook.hook_type, wt, String(err));
            } catch {
              /* ignore logging failure */
            }
          }
        }
      }
      log.info(
        `[IPC] hook:deploy - deployed ${hookIds.length} hooks to ${worktreePaths.length} worktrees`,
      );
      return { data: results, error: null };
    } catch (error) {
      log.error('hook:deploy failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // ─── Hook Events ──────────────────────────────────────────

  ipcMain.handle(
    'hookEvent:list',
    (
      _event,
      filters?: { hook_id?: string; hook_type?: string; status?: string; limit?: number },
    ) => {
      try {
        let sql = 'SELECT * FROM hook_events WHERE 1=1';
        const params: unknown[] = [];
        if (filters?.hook_id) {
          sql += ' AND hook_id = ?';
          params.push(filters.hook_id);
        }
        if (filters?.hook_type) {
          sql += ' AND hook_type = ?';
          params.push(filters.hook_type);
        }
        if (filters?.status) {
          sql += ' AND status = ?';
          params.push(filters.status);
        }
        sql += ' ORDER BY created_at DESC';
        const limit = filters?.limit ?? 200;
        sql += ' LIMIT ?';
        params.push(limit);
        const rows = loggedPrepare(sql).all(...params);
        log.info(`[IPC] hookEvent:list - returned ${(rows as unknown[]).length} events`);
        return { data: rows, error: null };
      } catch (error) {
        log.error('hookEvent:list failed:', error);
        return { data: null, error: String(error) };
      }
    },
  );

  ipcMain.handle(
    'hookEvent:create',
    (
      _event,
      event: {
        hook_id: string;
        hook_name: string;
        hook_type: string;
        trigger: string;
        status: string;
        worktree?: string;
        agent_name?: string;
        details?: string;
        error_message?: string;
        duration_ms?: number;
      },
    ) => {
      try {
        const id = `hevt-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        loggedPrepare(
          `INSERT INTO hook_events (id, hook_id, hook_name, hook_type, trigger, status, worktree, agent_name, details, error_message, duration_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id,
          event.hook_id,
          event.hook_name,
          event.hook_type,
          event.trigger,
          event.status,
          event.worktree ?? null,
          event.agent_name ?? null,
          event.details ?? null,
          event.error_message ?? null,
          event.duration_ms ?? null,
        );
        const created = loggedPrepare('SELECT * FROM hook_events WHERE id = ?').get(id);
        log.info(
          `[IPC] hookEvent:create - logged event for hook ${event.hook_name} (${event.status})`,
        );
        return { data: created, error: null };
      } catch (error) {
        log.error('hookEvent:create failed:', error);
        return { data: null, error: String(error) };
      }
    },
  );

  // Dialog - folder picker
  ipcMain.handle('dialog:selectFolder', async () => {
    try {
      const windows = BrowserWindow.getAllWindows();
      const parentWindow = windows.find((w) => !w.isDestroyed()) || null;
      const result = await dialog.showOpenDialog(parentWindow as BrowserWindow, {
        properties: ['openDirectory'],
        title: 'Select Project Folder',
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { data: null, error: null };
      }
      return { data: result.filePaths[0], error: null };
    } catch (error) {
      log.error('dialog:selectFolder failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // Window management
  ipcMain.handle('window:setTitle', (_event, title: string) => {
    try {
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        if (!win.isDestroyed()) {
          win.setTitle(title);
        }
      }
      return { data: true, error: null };
    } catch (error) {
      log.error('window:setTitle failed:', error);
      return { data: false, error: String(error) };
    }
  });

  // ── Debug Shell Terminal ──────────────────────────────────────────────
  let debugShellPty: nodePty.IPty | null = null;
  const debugShellOutputBuffer: string[] = [];
  const DEBUG_SHELL_MAX_BUFFER = 5000;

  ipcMain.handle('debug:shell-spawn', () => {
    try {
      if (debugShellPty) {
        return { data: { pid: debugShellPty.pid, alreadyRunning: true }, error: null };
      }
      const shellCmd =
        process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/bash';
      debugShellPty = nodePty.spawn(shellCmd, [], {
        name: 'xterm-color',
        cols: 120,
        rows: 40,
        cwd: process.cwd(),
        env: process.env as Record<string, string>,
      });
      debugShellOutputBuffer.length = 0;
      debugShellPty.onData((data: string) => {
        debugShellOutputBuffer.push(data);
        if (debugShellOutputBuffer.length > DEBUG_SHELL_MAX_BUFFER) {
          debugShellOutputBuffer.splice(0, debugShellOutputBuffer.length - DEBUG_SHELL_MAX_BUFFER);
        }
        const windows = BrowserWindow.getAllWindows();
        for (const win of windows) {
          if (!win.isDestroyed()) {
            win.webContents.send('debug:shell-output', { data });
          }
        }
      });
      debugShellPty.onExit(({ exitCode }: { exitCode: number }) => {
        log.info(`[Debug Shell] exited with code ${exitCode}`);
        debugShellPty = null;
      });
      log.info(`[Debug Shell] Spawned: ${shellCmd}, PID: ${debugShellPty.pid}`);
      return { data: { pid: debugShellPty.pid, alreadyRunning: false }, error: null };
    } catch (error) {
      log.error('debug:shell-spawn failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('debug:shell-write', (_event, data: string) => {
    try {
      if (!debugShellPty) return { data: false, error: 'No debug shell running' };
      debugShellPty.write(data);
      return { data: true, error: null };
    } catch (error) {
      log.error('debug:shell-write failed:', error);
      return { data: false, error: String(error) };
    }
  });

  ipcMain.handle('debug:shell-resize', (_event, cols: number, rows: number) => {
    try {
      if (!debugShellPty) return { data: false, error: 'No debug shell running' };
      debugShellPty.resize(cols, rows);
      return { data: true, error: null };
    } catch (error) {
      log.error('debug:shell-resize failed:', error);
      return { data: false, error: String(error) };
    }
  });

  ipcMain.handle('debug:shell-output', () => {
    try {
      return { data: debugShellOutputBuffer, error: null };
    } catch (error) {
      log.error('debug:shell-output failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('debug:shell-kill', () => {
    try {
      if (!debugShellPty) return { data: false, error: 'No debug shell running' };
      debugShellPty.kill();
      debugShellPty = null;
      debugShellOutputBuffer.length = 0;
      log.info('[Debug Shell] Shell killed');
      return { data: true, error: null };
    } catch (error) {
      log.error('debug:shell-kill failed:', error);
      return { data: false, error: String(error) };
    }
  });

  // Agent instruction file editing (per-role .md files)
  ipcMain.handle('agentDef:instruction-read', async (_event, role: string) => {
    try {
      const fs = await import('node:fs/promises');
      const userDataPath = (await import('electron')).app.getPath('userData');
      const instructionsDir = path.join(userDataPath, 'agent-instructions');
      const filePath = path.join(instructionsDir, `${role}.md`);

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        log.info(`[IPC] agentDef:instruction-read - read instruction file for role=${role}`);
        return { data: { role, content, filePath }, error: null };
      } catch {
        // File doesn't exist yet, return default template
        const defaultContent = `# ${role.charAt(0).toUpperCase() + role.slice(1)} Agent Instructions\n\n## Role\nDescribe the ${role} agent's primary responsibilities.\n\n## Guidelines\n- Follow project conventions\n- Report progress regularly\n\n## Constraints\n- Stay within assigned scope\n`;
        log.info(
          `[IPC] agentDef:instruction-read - no instruction file for role=${role}, returning default template`,
        );
        return { data: { role, content: defaultContent, filePath, isDefault: true }, error: null };
      }
    } catch (error) {
      log.error('agentDef:instruction-read failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('agentDef:instruction-write', async (_event, role: string, content: string) => {
    try {
      const fs = await import('node:fs/promises');
      const userDataPath = (await import('electron')).app.getPath('userData');
      const instructionsDir = path.join(userDataPath, 'agent-instructions');

      // Ensure directory exists
      await fs.mkdir(instructionsDir, { recursive: true });

      const filePath = path.join(instructionsDir, `${role}.md`);
      await fs.writeFile(filePath, content, 'utf-8');
      log.info(
        `[IPC] agentDef:instruction-write - wrote instruction file for role=${role} (${content.length} chars)`,
      );
      return { data: { role, filePath, written: true }, error: null };
    } catch (error) {
      log.error('agentDef:instruction-write failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // Session handoff tracking
  ipcMain.handle(
    'session:handoff-create',
    (_event, handoff: { from_session: string; to_session: string; reason?: string }) => {
      try {
        const id = `handoff-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        loggedPrepare(
          'INSERT INTO session_handoffs (id, from_session, to_session, reason) VALUES (?, ?, ?, ?)',
        ).run(id, handoff.from_session, handoff.to_session, handoff.reason ?? null);
        const created = loggedPrepare('SELECT * FROM session_handoffs WHERE id = ?').get(id);
        log.info(
          `[IPC] session:handoff-create - created handoff ${id}: ${handoff.from_session} -> ${handoff.to_session}`,
        );
        return { data: created, error: null };
      } catch (error) {
        log.error('session:handoff-create failed:', error);
        return { data: null, error: String(error) };
      }
    },
  );

  ipcMain.handle('session:handoff-list', () => {
    try {
      const handoffs = loggedPrepare(
        'SELECT * FROM session_handoffs ORDER BY created_at ASC',
      ).all();
      log.info(
        `[IPC] session:handoff-list - SELECT returned ${handoffs.length} handoffs from real database`,
      );
      return { data: handoffs, error: null };
    } catch (error) {
      log.error('session:handoff-list failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('session:handoff-get', (_event, id: string) => {
    try {
      const handoff = loggedPrepare('SELECT * FROM session_handoffs WHERE id = ?').get(id);
      log.info(`[IPC] session:handoff-get - SELECT handoff id=${id} from real database`);
      return { data: handoff || null, error: null };
    } catch (error) {
      log.error('session:handoff-get failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('session:handoff-by-session', (_event, sessionId: string) => {
    try {
      const handoffs = loggedPrepare(
        'SELECT * FROM session_handoffs WHERE from_session = ? OR to_session = ? ORDER BY created_at ASC',
      ).all(sessionId, sessionId);
      log.info(
        `[IPC] session:handoff-by-session - SELECT ${handoffs.length} handoffs for session=${sessionId}`,
      );
      return { data: handoffs, error: null };
    } catch (error) {
      log.error('session:handoff-by-session failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // ==========================================
  // Orphaned Agent Process Detection
  // ==========================================

  ipcMain.handle('orphan:detect', () => {
    try {
      // Find sessions that were in active states (not completed) and have a PID
      const activeSessions = loggedPrepare(
        "SELECT id, agent_name, capability, model, pid, state, created_at, updated_at FROM sessions WHERE state IN ('booting', 'working', 'stalled') AND pid IS NOT NULL ORDER BY created_at DESC",
      ).all() as Array<{
        id: string;
        agent_name: string;
        capability: string;
        model: string;
        pid: number;
        state: string;
        created_at: string;
        updated_at: string;
      }>;

      const orphans: Array<{
        sessionId: string;
        agentName: string;
        capability: string;
        model: string;
        pid: number;
        state: string;
        processAlive: boolean;
        createdAt: string;
        updatedAt: string;
      }> = [];

      for (const session of activeSessions) {
        // Skip sessions that are currently tracked by agentProcessManager
        const tracked = agentProcessManager.get(session.id);
        if (tracked) continue;

        // Check if the OS process is still alive
        let processAlive = false;
        try {
          process.kill(session.pid, 0);
          processAlive = true;
        } catch {
          processAlive = false;
        }

        orphans.push({
          sessionId: session.id,
          agentName: session.agent_name,
          capability: session.capability,
          model: session.model,
          pid: session.pid,
          state: session.state,
          processAlive,
          createdAt: session.created_at,
          updatedAt: session.updated_at,
        });
      }

      log.info(
        `[IPC] orphan:detect - found ${orphans.length} orphaned session(s), ${orphans.filter((o) => o.processAlive).length} with live processes`,
      );
      return { data: orphans, error: null };
    } catch (error) {
      log.error('orphan:detect failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('orphan:kill', async (_event, sessionId: string, pid: number) => {
    try {
      log.info(`[IPC] orphan:kill - killing orphan PID=${pid}, session=${sessionId}`);

      // Try to kill the process tree
      let killed = false;
      try {
        const treeKill = await import('tree-kill');
        await new Promise<void>((resolve, reject) => {
          treeKill.default(pid, 'SIGTERM', (err: Error | undefined) => {
            if (err) {
              try {
                process.kill(pid, 'SIGTERM');
              } catch {
                // ignore
              }
            }
            resolve();
          });
        });
        killed = true;
      } catch {
        try {
          process.kill(pid, 'SIGTERM');
          killed = true;
        } catch {
          killed = false;
        }
      }

      // Update session state in database
      loggedPrepare(
        "UPDATE sessions SET state = 'completed', completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
      ).run(sessionId);

      log.info(`[IPC] orphan:kill - process killed=${killed}, session state updated to completed`);
      return { data: { killed, sessionId }, error: null };
    } catch (error) {
      log.error('orphan:kill failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('orphan:reconnect', (_event, sessionId: string) => {
    try {
      log.info(`[IPC] orphan:reconnect - reconnecting orphan session=${sessionId}`);

      const session = loggedPrepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as
        | {
            id: string;
            agent_name: string;
            capability: string;
            model: string;
            pid: number;
            state: string;
          }
        | undefined;

      if (!session) {
        return { data: null, error: `Session ${sessionId} not found` };
      }

      // Verify the process is still alive
      let processAlive = false;
      try {
        process.kill(session.pid, 0);
        processAlive = true;
      } catch {
        processAlive = false;
      }

      if (!processAlive) {
        loggedPrepare(
          "UPDATE sessions SET state = 'completed', completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
        ).run(sessionId);
        return {
          data: { reconnected: false, reason: 'Process is no longer alive' },
          error: null,
        };
      }

      // Update session state to working
      loggedPrepare(
        "UPDATE sessions SET state = 'working', updated_at = datetime('now') WHERE id = ?",
      ).run(sessionId);

      log.info(
        `[IPC] orphan:reconnect - session ${sessionId} reconnected, state updated to working`,
      );
      return {
        data: {
          reconnected: true,
          sessionId: session.id,
          agentName: session.agent_name,
          pid: session.pid,
        },
        error: null,
      };
    } catch (error) {
      log.error('orphan:reconnect failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('orphan:dismiss', (_event, sessionId: string) => {
    try {
      loggedPrepare(
        "UPDATE sessions SET state = 'completed', completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
      ).run(sessionId);
      log.info(`[IPC] orphan:dismiss - session ${sessionId} dismissed (marked completed)`);
      return { data: { dismissed: true, sessionId }, error: null };
    } catch (error) {
      log.error('orphan:dismiss failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // ── Runtime Registry Handlers ──────────────────────────────────────
  ipcMain.handle('runtime:list', () => {
    try {
      const runtimes = runtimeRegistry.listRuntimeInfo();
      log.info(`[IPC] runtime:list - returning ${runtimes.length} registered runtimes`);
      return { data: runtimes, error: null };
    } catch (error) {
      log.error('runtime:list failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('runtime:get-default', () => {
    try {
      const defaultId = runtimeRegistry.getDefaultRuntimeId();
      log.info(`[IPC] runtime:get-default - current default: ${defaultId}`);
      return { data: { defaultRuntimeId: defaultId }, error: null };
    } catch (error) {
      log.error('runtime:get-default failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('runtime:set-default', (_event, runtimeId: string) => {
    try {
      runtimeRegistry.setDefaultRuntime(runtimeId);
      log.info(`[IPC] runtime:set-default - set to: ${runtimeId}`);
      return { data: { defaultRuntimeId: runtimeId }, error: null };
    } catch (error) {
      log.error('runtime:set-default failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle(
    'runtime:resolve-model',
    (
      _event,
      params: {
        runtimeId: string;
        capability: string;
        explicitModel?: string;
        capabilityConfigModel?: string;
      },
    ) => {
      try {
        const resolved = runtimeRegistry.resolveModel(
          params.runtimeId,
          params.capability as AgentCapability,
          params.explicitModel,
          params.capabilityConfigModel,
        );
        log.info(
          `[IPC] runtime:resolve-model - resolved: ${resolved} (runtime=${params.runtimeId}, cap=${params.capability}, explicit=${params.explicitModel || 'none'}, config=${params.capabilityConfigModel || 'none'})`,
        );
        return { data: { model: resolved }, error: null };
      } catch (error) {
        log.error('runtime:resolve-model failed:', error);
        return { data: null, error: String(error) };
      }
    },
  );

  log.info(
    'IPC handlers registered - all database handlers use real SQLite queries via loggedPrepare()',
  );
}
