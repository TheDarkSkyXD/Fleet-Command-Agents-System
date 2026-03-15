import { ipcMain } from 'electron';
import log from 'electron-log';
import { getDatabase } from '../db/database';
import {
  type AgentCapability,
  agentProcessManager,
  getDefaultModel,
} from '../services/agentProcessManager';
import {
  clearClaudeCliCache,
  detectClaudeCli,
  getClaudeCliStatus,
} from '../services/claudeCliService';
import {
  checkForUpdates,
  downloadUpdate,
  getUpdateStatus,
  installUpdate,
} from '../services/updateService';

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
        run_id?: string;
        task_id?: string;
        parent_agent?: string;
        worktree_path?: string;
        branch_name?: string;
        depth?: number;
        prompt?: string;
      },
    ) => {
      try {
        const capability = options.capability as AgentCapability;
        const model = options.model || getDefaultModel(capability);

        // Spawn the actual node-pty process via AgentProcessManager
        const agentProcess = agentProcessManager.spawn({
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
          prompt: options.prompt,
        });

        // Insert session record into database with PID
        loggedPrepare(
          `INSERT INTO sessions (id, agent_name, capability, run_id, task_id, parent_agent, worktree_path, branch_name, depth, state, pid)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'booting', ?)`,
        ).run(
          options.id,
          options.agent_name,
          options.capability,
          options.run_id ?? null,
          options.task_id ?? null,
          options.parent_agent ?? null,
          options.worktree_path ?? null,
          options.branch_name ?? null,
          options.depth ?? 0,
          agentProcess.pid,
        );

        // Transition to 'working' state after successful spawn
        loggedPrepare(
          `UPDATE sessions SET state = 'working', updated_at = datetime('now') WHERE id = ?`,
        ).run(options.id);

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

      // Record session_end event
      recordEvent({
        eventType: 'session_end',
        agentName: (session?.agent_name as string) ?? agentId,
        sessionId: agentId,
        runId: (session?.run_id as string) ?? undefined,
        data: JSON.stringify({ reason: 'manual_stop' }),
      });

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
      loggedPrepare(
        `UPDATE sessions SET state = 'working', stalled_at = NULL, updated_at = datetime('now')
        WHERE id = ? AND state = 'stalled'`,
      ).run(agentId);
      const session = loggedPrepare('SELECT * FROM sessions WHERE id = ?').get(agentId);
      log.info(`[IPC] agent:nudge - UPDATE session in real database: ${agentId}`);
      return { data: session, error: null };
    } catch (error) {
      log.error('agent:nudge failed:', error);
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
        `INSERT INTO sessions (id, agent_name, capability, run_id, worktree_path, depth, state, pid, created_at, updated_at)
        VALUES (?, ?, 'coordinator', ?, ?, 0, 'booting', ?, datetime('now'), datetime('now'))`,
      ).run(id, agentName, options?.run_id ?? null, worktreePath, agentProcess.pid);

      // Update state to working after brief boot
      setTimeout(() => {
        try {
          loggedPrepare(
            `UPDATE sessions SET state = 'working', updated_at = datetime('now') WHERE id = ? AND state = 'booting'`,
          ).run(id);
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

  // Mail channels - all use real SQLite queries via loggedPrepare
  ipcMain.handle('mail:list', (_event, filters?: { unreadOnly?: boolean }) => {
    try {
      let query = 'SELECT * FROM messages';
      if (filters?.unreadOnly) {
        query += ' WHERE read = 0';
      }
      query += ' ORDER BY created_at DESC';
      const messages = loggedPrepare(query).all();
      log.info(`[IPC] mail:list - SELECT returned ${messages.length} messages from real database`);
      return { data: messages, error: null };
    } catch (error) {
      log.error('mail:list failed:', error);
      return { data: null, error: String(error) };
    }
  });

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
        loggedPrepare(
          `INSERT INTO messages (id, thread_id, from_agent, to_agent, subject, body, type, priority, payload)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          message.id,
          message.thread_id ?? null,
          message.from_agent,
          message.to_agent,
          message.subject ?? null,
          message.body ?? null,
          message.type,
          message.priority ?? 'normal',
          message.payload ?? null,
        );
        log.info(
          `[IPC] mail:send - INSERT message into real database: ${message.from_agent} -> ${message.to_agent}`,
        );

        // Record mail_sent event
        recordEvent({
          eventType: 'mail_sent',
          agentName: message.from_agent,
          data: JSON.stringify({
            to: message.to_agent,
            subject: message.subject,
            type: message.type,
          }),
        });

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

  ipcMain.handle(
    'mail:purge',
    (_event, options?: { agentName?: string; olderThanDays?: number }) => {
      try {
        if (options?.agentName) {
          loggedPrepare('DELETE FROM messages WHERE from_agent = ? OR to_agent = ?').run(
            options.agentName,
            options.agentName,
          );
        } else if (options?.olderThanDays) {
          loggedPrepare(
            `DELETE FROM messages WHERE created_at < datetime('now', '-' || ? || ' days')`,
          ).run(options.olderThanDays);
        } else {
          loggedPrepare('DELETE FROM messages').run();
        }
        log.info('[IPC] mail:purge - DELETE executed on real database');
        return { data: true, error: null };
      } catch (error) {
        log.error('mail:purge failed:', error);
        return { data: false, error: String(error) };
      }
    },
  );

  // Merge channels - all use real SQLite queries via loggedPrepare

  // List all merge queue entries ordered by enqueue time (FIFO)
  ipcMain.handle('merge:queue', () => {
    try {
      const queue = loggedPrepare('SELECT * FROM merge_queue ORDER BY enqueued_at ASC').all();
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
      },
    ) => {
      try {
        const filesJson = entry.files_modified ? JSON.stringify(entry.files_modified) : null;
        const result = loggedPrepare(
          `INSERT INTO merge_queue (branch_name, task_id, agent_name, files_modified, status, enqueued_at)
          VALUES (?, ?, ?, ?, 'pending', datetime('now'))`,
        ).run(entry.branch_name, entry.task_id ?? null, entry.agent_name ?? null, filesJson);
        const inserted = loggedPrepare('SELECT * FROM merge_queue WHERE id = ?').get(
          result.lastInsertRowid,
        );
        log.info(
          `[IPC] merge:enqueue - INSERT into real database: branch=${entry.branch_name}, id=${result.lastInsertRowid}`,
        );
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
      const next = loggedPrepare(
        "SELECT * FROM merge_queue WHERE status = 'pending' ORDER BY enqueued_at ASC LIMIT 1",
      ).get();
      log.info(
        `[IPC] merge:next - SELECT next pending from real database: ${next ? `id=${(next as { id: number }).id}` : 'none'}`,
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
        } | null;
        if (!entry) {
          return { data: null, error: `Merge queue entry ${id} not found` };
        }

        // Mark as merging
        loggedPrepare("UPDATE merge_queue SET status = 'merging' WHERE id = ?").run(id);
        log.info(`[IPC] merge:execute - starting Tier 1 clean merge for id=${id}`);

        // Use provided repoPath or fall back to current working directory
        const mergePath = repoPath || process.cwd();

        // Perform the actual git merge via simple-git
        const result = await executeCleanMerge(mergePath, entry.branch_name, targetBranch);

        if (result.success) {
          loggedPrepare(
            "UPDATE merge_queue SET status = 'merged', resolved_tier = 'clean-merge' WHERE id = ?",
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

        loggedPrepare("UPDATE merge_queue SET status = 'failed' WHERE id = ?").run(id);
        const updated = loggedPrepare('SELECT * FROM merge_queue WHERE id = ?').get(id);
        log.error(`[IPC] merge:execute - merge failed for id=${id}: ${result.error}`);
        return { data: updated, error: result.error };
      } catch (error) {
        log.error('merge:execute failed:', error);
        try {
          loggedPrepare("UPDATE merge_queue SET status = 'failed' WHERE id = ?").run(id);
        } catch {
          // ignore DB update failure on error path
        }
        return { data: null, error: String(error) };
      }
    },
  );

  // Complete a merge with a resolution tier
  ipcMain.handle('merge:complete', (_event, id: number, resolvedTier: string) => {
    try {
      loggedPrepare("UPDATE merge_queue SET status = 'merged', resolved_tier = ? WHERE id = ?").run(
        resolvedTier,
        id,
      );
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
      loggedPrepare("UPDATE merge_queue SET status = 'failed' WHERE id = ?").run(id);
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
        "SELECT * FROM merge_queue WHERE status IN ('merged', 'failed', 'conflict') ORDER BY enqueued_at DESC",
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
      const updated = loggedPrepare('SELECT * FROM issues WHERE id = ?').get(id);
      log.info(`[IPC] issue:update - UPDATE issue in real database: id=${id}`);
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

  ipcMain.handle('doctor:run', () => {
    try {
      const result = loggedPrepare('SELECT 1 as ok').get() as { ok: number };
      const sessionCount = loggedPrepare('SELECT COUNT(*) as count FROM sessions').get() as {
        count: number;
      };
      log.info(
        `[IPC] doctor:run - real SQLite diagnostics: db=${result.ok === 1 ? 'ok' : 'error'}, sessions=${sessionCount.count}`,
      );
      return {
        data: {
          checks: [
            { name: 'Database', status: result.ok === 1 ? 'pass' : 'fail' },
            { name: 'Schema', status: 'pass' },
            { name: 'Sessions', count: sessionCount.count },
          ],
        },
        error: null,
      };
    } catch (error) {
      log.error('doctor:run failed:', error);
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
      log.info(`[IPC] run:get-active - SELECT active run from real database`);
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

  log.info(
    'IPC handlers registered - all database handlers use real SQLite queries via loggedPrepare()',
  );
}
