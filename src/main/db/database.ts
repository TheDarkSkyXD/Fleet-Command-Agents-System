import path from 'node:path';
import Database from 'better-sqlite3';
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

    CREATE TABLE IF NOT EXISTS issues (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL DEFAULT 'task' CHECK(type IN ('task', 'bug', 'feature', 'research', 'spike')),
      priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('critical', 'high', 'medium', 'low')),
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'in_progress', 'closed', 'blocked')),
      assigned_agent TEXT,
      group_id TEXT,
      dependencies TEXT,
      close_summary TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      closed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS agent_definitions (
      role TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      description TEXT NOT NULL,
      capabilities TEXT NOT NULL,
      default_model TEXT NOT NULL,
      tool_allowlist TEXT,
      bash_restrictions TEXT,
      file_scope TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      description TEXT,
      is_active INTEGER NOT NULL DEFAULT 0,
      last_opened_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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
    CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
    CREATE INDEX IF NOT EXISTS idx_issues_priority ON issues(priority);
    CREATE INDEX IF NOT EXISTS idx_issues_assigned ON issues(assigned_agent);
    CREATE INDEX IF NOT EXISTS idx_projects_active ON projects(is_active);
    CREATE INDEX IF NOT EXISTS idx_projects_path ON projects(path);
  `);

  // Seed default agent definitions if table is empty
  const defCount = db.prepare('SELECT COUNT(*) as cnt FROM agent_definitions').get() as {
    cnt: number;
  };
  if (defCount.cnt === 0) {
    const seedDefs = [
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
        bash_restrictions: JSON.stringify(['no file writes', 'no git push', 'test execution only']),
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
        tool_allowlist: JSON.stringify(['Read', 'Grep', 'Bash (read-only)', 'Mail', 'HealthCheck']),
        bash_restrictions: JSON.stringify([
          'no file writes',
          'no git operations',
          'monitoring only',
        ]),
        file_scope: 'read-only (logs and status)',
      },
    ];

    const insertDef = db.prepare(`
      INSERT INTO agent_definitions (role, display_name, description, capabilities, default_model, tool_allowlist, bash_restrictions, file_scope)
      VALUES (@role, @display_name, @description, @capabilities, @default_model, @tool_allowlist, @bash_restrictions, @file_scope)
    `);

    for (const def of seedDefs) {
      insertDef.run(def);
    }
    log.info('Seeded 7 default agent definitions');
  }

  log.info('Database schema applied successfully');
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    log.info('Database closed');
  }
}
