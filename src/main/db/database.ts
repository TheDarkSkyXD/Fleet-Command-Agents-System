import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import log from 'electron-log';

let db: Database.Database | null = null;

function getDbPath(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'fleet-command.db');
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export async function initDatabase(): Promise<void> {
  const dbPath = getDbPath();
  log.info(`Initializing database at: ${dbPath}`);

  db = new Database(dbPath);

  // Enable WAL mode for concurrent access
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      run_id TEXT,
      agent_name TEXT NOT NULL,
      capability TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'booting' CHECK(state IN ('booting', 'working', 'completed', 'stalled', 'zombie')),
      pid INTEGER,
      worktree_path TEXT,
      branch_name TEXT,
      task_id TEXT,
      parent_agent TEXT,
      depth INTEGER DEFAULT 0,
      transcript_path TEXT,
      prompt_version TEXT,
      escalation_level INTEGER DEFAULT 0,
      stalled_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed', 'failed')),
      coordinator_session_id TEXT,
      agent_count INTEGER DEFAULT 0,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT,
      from_agent TEXT NOT NULL,
      to_agent TEXT NOT NULL,
      subject TEXT,
      body TEXT,
      type TEXT NOT NULL CHECK(type IN ('status', 'question', 'result', 'error', 'worker_done', 'merge_ready', 'merged', 'merge_failed', 'escalation', 'health_check', 'dispatch', 'assign')),
      priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'urgent')),
      payload TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      run_id TEXT,
      agent_name TEXT,
      session_id TEXT,
      event_type TEXT NOT NULL CHECK(event_type IN ('tool_start', 'tool_end', 'session_start', 'session_end', 'mail_sent', 'mail_received', 'spawn', 'error', 'custom')),
      tool_name TEXT,
      tool_args TEXT,
      tool_duration_ms INTEGER,
      level TEXT NOT NULL DEFAULT 'info' CHECK(level IN ('debug', 'info', 'warn', 'error')),
      data TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS metrics (
      id TEXT PRIMARY KEY,
      agent_name TEXT,
      task_id TEXT,
      capability TEXT,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      cache_read_tokens INTEGER DEFAULT 0,
      cache_creation_tokens INTEGER DEFAULT 0,
      model_used TEXT,
      estimated_cost REAL DEFAULT 0,
      duration_ms INTEGER DEFAULT 0,
      parent_agent TEXT,
      run_id TEXT,
      started_at TEXT,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS merge_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      branch_name TEXT NOT NULL,
      task_id TEXT,
      agent_name TEXT,
      files_modified TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'merging', 'merged', 'conflict', 'failed')),
      resolved_tier TEXT CHECK(resolved_tier IN ('clean-merge', 'auto-resolve', 'ai-resolve', 'reimagine')),
      enqueued_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS task_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      member_issues TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      closed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS agent_identities (
      name TEXT PRIMARY KEY,
      capability TEXT,
      sessions_completed INTEGER DEFAULT 0,
      expertise_domains TEXT,
      recent_tasks TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS checkpoints (
      agent_name TEXT PRIMARY KEY,
      task_id TEXT,
      session_id TEXT,
      progress_summary TEXT,
      files_modified TEXT,
      current_branch TEXT,
      pending_work TEXT,
      mulch_domains TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Create indexes for common queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_state ON sessions(state);
    CREATE INDEX IF NOT EXISTS idx_sessions_run_id ON sessions(run_id);
    CREATE INDEX IF NOT EXISTS idx_messages_to_agent ON messages(to_agent);
    CREATE INDEX IF NOT EXISTS idx_messages_read ON messages(read);
    CREATE INDEX IF NOT EXISTS idx_events_run_id ON events(run_id);
    CREATE INDEX IF NOT EXISTS idx_events_agent ON events(agent_name);
    CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
    CREATE INDEX IF NOT EXISTS idx_merge_queue_status ON merge_queue(status);
    CREATE INDEX IF NOT EXISTS idx_metrics_agent ON metrics(agent_name);
  `);

  log.info('Database schema applied successfully');
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    log.info('Database closed');
  }
}
