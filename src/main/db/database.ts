import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { app } from 'electron';
import log from 'electron-log';

let db: Database.Database | null = null;
let dbInitialized = false;

function getDbPath(): string {
  return path.join(app.getAppPath(), 'database', 'fleet-command.db');
}

/** Returns whether the database has been successfully initialized */
export function isDatabaseInitialized(): boolean {
  return dbInitialized && db !== null;
}

/** Returns the path to the database file */
export function getDatabasePath(): string {
  return getDbPath();
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Checks if the database file exists and is not corrupted.
 * Returns { exists, corrupted, error } status.
 */
export function checkDatabaseHealth(): {
  exists: boolean;
  corrupted: boolean;
  error: string | null;
} {
  const dbPath = getDbPath();

  // Check if file exists
  if (!fs.existsSync(dbPath)) {
    return { exists: false, corrupted: false, error: null };
  }

  // Try to open and run integrity check
  try {
    const testDb = new Database(dbPath);
    try {
      const result = testDb.pragma('integrity_check') as Array<{ integrity_check: string }>;
      const isOk = result.length > 0 && result[0].integrity_check === 'ok';
      testDb.close();
      if (!isOk) {
        return { exists: true, corrupted: true, error: 'Integrity check failed' };
      }
      return { exists: true, corrupted: false, error: null };
    } catch (innerError) {
      try {
        testDb.close();
      } catch {
        // ignore close error
      }
      return { exists: true, corrupted: true, error: String(innerError) };
    }
  } catch (openError) {
    return { exists: true, corrupted: true, error: String(openError) };
  }
}

/**
 * Removes the existing (corrupted) database file and its WAL/SHM companions,
 * then reinitializes a fresh database. Returns true on success.
 */
export async function recreateDatabase(): Promise<boolean> {
  const dbPath = getDbPath();
  log.warn(`[DB Recovery] Recreating database at: ${dbPath}`);

  // Close existing connection if any
  if (db) {
    try {
      db.close();
    } catch {
      // ignore
    }
    db = null;
    dbInitialized = false;
  }

  // Remove corrupted files
  const filesToRemove = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
  for (const file of filesToRemove) {
    try {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        log.info(`[DB Recovery] Removed: ${file}`);
      }
    } catch (err) {
      log.error(`[DB Recovery] Failed to remove ${file}:`, err);
    }
  }

  // Reinitialize
  try {
    await initDatabase();
    log.info('[DB Recovery] Database recreated successfully');
    return true;
  } catch (error) {
    log.error('[DB Recovery] Failed to recreate database:', error);
    return false;
  }
}

export async function initDatabase(): Promise<void> {
  const dbPath = getDbPath();
  log.info(`Initializing database at: ${dbPath}`);

  // Ensure the database directory exists
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(dbPath);
  dbInitialized = false;

  // Enable WAL mode for concurrent access and set busy timeout
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      run_id TEXT,
      agent_name TEXT NOT NULL,
      capability TEXT NOT NULL,
      model TEXT,
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
      completed_at TEXT,
      file_scope TEXT,
      project_id TEXT
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
      type TEXT NOT NULL CHECK(type IN ('status', 'question', 'result', 'error', 'worker_done', 'merge_ready', 'merged', 'merge_failed', 'escalation', 'health_check', 'dispatch', 'assign', 'decision_gate')),
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
      enqueued_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
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

    CREATE TABLE IF NOT EXISTS config_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      max_hierarchy_depth INTEGER NOT NULL DEFAULT 2,
      max_concurrent_agents INTEGER NOT NULL DEFAULT 10,
      max_agents_per_lead INTEGER NOT NULL DEFAULT 5,
      default_capability TEXT NOT NULL DEFAULT 'builder',
      default_model TEXT NOT NULL DEFAULT 'sonnet',
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS app_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT NOT NULL DEFAULT 'info' CHECK(level IN ('debug', 'info', 'warn', 'error')),
      message TEXT NOT NULL,
      source TEXT,
      agent_name TEXT,
      data TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS discovery_scans (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'completed', 'failed')),
      categories TEXT NOT NULL,
      progress TEXT,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS discovery_findings (
      id TEXT PRIMARY KEY,
      scan_id TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('architecture', 'dependencies', 'testing', 'apis', 'config', 'conventions')),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      file_path TEXT,
      line_number INTEGER,
      severity TEXT NOT NULL DEFAULT 'info' CHECK(severity IN ('info', 'warning', 'important')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS prompts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      content TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'system' CHECK(type IN ('system', 'user', 'agent', 'task', 'template')),
      parent_id TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1,
      tags TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS prompt_versions (
      id TEXT PRIMARY KEY,
      prompt_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      content TEXT NOT NULL,
      change_summary TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS guard_violations (
      id TEXT PRIMARY KEY,
      agent_name TEXT NOT NULL,
      capability TEXT NOT NULL,
      rule_type TEXT NOT NULL CHECK(rule_type IN ('tool_allowlist', 'bash_restriction', 'file_scope')),
      violation TEXT NOT NULL,
      tool_attempted TEXT,
      command_attempted TEXT,
      file_attempted TEXT,
      severity TEXT NOT NULL DEFAULT 'warning' CHECK(severity IN ('info', 'warning', 'critical')),
      acknowledged INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS hooks (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      hook_type TEXT NOT NULL CHECK(hook_type IN ('SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop', 'PreCompact')),
      name TEXT NOT NULL,
      description TEXT,
      script_content TEXT NOT NULL DEFAULT '',
      is_installed INTEGER NOT NULL DEFAULT 0,
      target_worktrees TEXT,
      installed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quality_gates (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      gate_type TEXT NOT NULL CHECK(gate_type IN ('test', 'lint', 'typecheck', 'custom')),
      name TEXT NOT NULL,
      command TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quality_gate_results (
      id TEXT PRIMARY KEY,
      gate_id TEXT NOT NULL,
      agent_name TEXT,
      session_id TEXT,
      project_id TEXT NOT NULL,
      gate_type TEXT NOT NULL,
      gate_name TEXT NOT NULL,
      command TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'passed', 'failed', 'error')),
      exit_code INTEGER,
      stdout TEXT,
      stderr TEXT,
      duration_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS session_handoffs (
      id TEXT PRIMARY KEY,
      from_session TEXT NOT NULL,
      to_session TEXT NOT NULL,
      reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS hook_events (
      id TEXT PRIMARY KEY,
      hook_id TEXT NOT NULL,
      hook_name TEXT NOT NULL,
      hook_type TEXT NOT NULL,
      trigger TEXT NOT NULL DEFAULT 'manual',
      status TEXT NOT NULL DEFAULT 'success' CHECK(status IN ('success', 'failure', 'error')),
      worktree TEXT,
      agent_name TEXT,
      details TEXT,
      error_message TEXT,
      duration_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS expertise_records (
      id TEXT PRIMARY KEY,
      domain TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'convention' CHECK(type IN ('convention', 'pattern', 'failure', 'decision', 'reference', 'guide')),
      classification TEXT NOT NULL DEFAULT 'tactical' CHECK(classification IN ('foundational', 'tactical', 'observational')),
      agent_name TEXT,
      source_file TEXT,
      tags TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS specs (
      id TEXT PRIMARY KEY,
      task_id TEXT,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      author_agent TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'approved', 'implemented', 'rejected')),
      approved_by TEXT,
      file_scope TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notification_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      event_type TEXT NOT NULL,
      agent_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Create indexes for common queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_state ON sessions(state);
    CREATE INDEX IF NOT EXISTS idx_sessions_run_id ON sessions(run_id);
    CREATE INDEX IF NOT EXISTS idx_messages_to_agent ON messages(to_agent);
    CREATE INDEX IF NOT EXISTS idx_messages_from_agent ON messages(from_agent);
    CREATE INDEX IF NOT EXISTS idx_messages_read ON messages(read);
    CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(type);
    CREATE INDEX IF NOT EXISTS idx_messages_priority ON messages(priority);
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
    CREATE INDEX IF NOT EXISTS idx_config_profiles_name ON config_profiles(name);
    CREATE INDEX IF NOT EXISTS idx_config_profiles_active ON config_profiles(is_active);
    CREATE INDEX IF NOT EXISTS idx_app_logs_level ON app_logs(level);
    CREATE INDEX IF NOT EXISTS idx_app_logs_agent ON app_logs(agent_name);
    CREATE INDEX IF NOT EXISTS idx_app_logs_created ON app_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_discovery_scans_status ON discovery_scans(status);
    CREATE INDEX IF NOT EXISTS idx_discovery_scans_project ON discovery_scans(project_id);
    CREATE INDEX IF NOT EXISTS idx_discovery_findings_scan ON discovery_findings(scan_id);
    CREATE INDEX IF NOT EXISTS idx_discovery_findings_category ON discovery_findings(category);
    CREATE INDEX IF NOT EXISTS idx_prompts_parent ON prompts(parent_id);
    CREATE INDEX IF NOT EXISTS idx_prompts_type ON prompts(type);
    CREATE INDEX IF NOT EXISTS idx_prompts_active ON prompts(is_active);
    CREATE INDEX IF NOT EXISTS idx_prompt_versions_prompt ON prompt_versions(prompt_id);
    CREATE INDEX IF NOT EXISTS idx_prompt_versions_version ON prompt_versions(prompt_id, version);
    CREATE INDEX IF NOT EXISTS idx_guard_violations_agent ON guard_violations(agent_name);
    CREATE INDEX IF NOT EXISTS idx_guard_violations_capability ON guard_violations(capability);
    CREATE INDEX IF NOT EXISTS idx_guard_violations_type ON guard_violations(rule_type);
    CREATE INDEX IF NOT EXISTS idx_guard_violations_severity ON guard_violations(severity);
    CREATE INDEX IF NOT EXISTS idx_guard_violations_created ON guard_violations(created_at);
    CREATE INDEX IF NOT EXISTS idx_hooks_project ON hooks(project_id);
    CREATE INDEX IF NOT EXISTS idx_hooks_type ON hooks(hook_type);
    CREATE INDEX IF NOT EXISTS idx_hooks_installed ON hooks(is_installed);
    CREATE INDEX IF NOT EXISTS idx_quality_gates_project ON quality_gates(project_id);
    CREATE INDEX IF NOT EXISTS idx_quality_gates_type ON quality_gates(gate_type);
    CREATE INDEX IF NOT EXISTS idx_quality_gates_enabled ON quality_gates(enabled);
    CREATE INDEX IF NOT EXISTS idx_quality_gate_results_gate ON quality_gate_results(gate_id);
    CREATE INDEX IF NOT EXISTS idx_quality_gate_results_agent ON quality_gate_results(agent_name);
    CREATE INDEX IF NOT EXISTS idx_quality_gate_results_session ON quality_gate_results(session_id);
    CREATE INDEX IF NOT EXISTS idx_quality_gate_results_project ON quality_gate_results(project_id);
    CREATE INDEX IF NOT EXISTS idx_quality_gate_results_status ON quality_gate_results(status);
    CREATE INDEX IF NOT EXISTS idx_session_handoffs_from ON session_handoffs(from_session);
    CREATE INDEX IF NOT EXISTS idx_session_handoffs_to ON session_handoffs(to_session);
    CREATE INDEX IF NOT EXISTS idx_session_handoffs_created ON session_handoffs(created_at);
    CREATE INDEX IF NOT EXISTS idx_expertise_domain ON expertise_records(domain);
    CREATE INDEX IF NOT EXISTS idx_expertise_type ON expertise_records(type);
    CREATE INDEX IF NOT EXISTS idx_expertise_classification ON expertise_records(classification);
    CREATE INDEX IF NOT EXISTS idx_expertise_agent ON expertise_records(agent_name);
    CREATE INDEX IF NOT EXISTS idx_expertise_source_file ON expertise_records(source_file);
    CREATE INDEX IF NOT EXISTS idx_expertise_expires_at ON expertise_records(expires_at);
    CREATE INDEX IF NOT EXISTS idx_specs_task_id ON specs(task_id);
    CREATE INDEX IF NOT EXISTS idx_specs_status ON specs(status);
    CREATE INDEX IF NOT EXISTS idx_specs_author ON specs(author_agent);
    CREATE INDEX IF NOT EXISTS idx_notification_history_type ON notification_history(event_type);
    CREATE INDEX IF NOT EXISTS idx_notification_history_created ON notification_history(created_at);
    CREATE INDEX IF NOT EXISTS idx_notification_history_agent ON notification_history(agent_name);
    CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions(project_id);
  `);

  // Migrations: add model column to sessions if not present
  try {
    db.prepare('SELECT model FROM sessions LIMIT 1').get();
  } catch {
    db.exec('ALTER TABLE sessions ADD COLUMN model TEXT');
  }

  // Migration: add file_scope column to sessions if not present
  try {
    db.prepare('SELECT file_scope FROM sessions LIMIT 1').get();
  } catch {
    db.exec('ALTER TABLE sessions ADD COLUMN file_scope TEXT');
  }

  // Migration: add project_id column to sessions for data isolation between projects
  try {
    db.prepare('SELECT project_id FROM sessions LIMIT 1').get();
  } catch {
    db.exec('ALTER TABLE sessions ADD COLUMN project_id TEXT');
  }

  // Migration: add completed_at column to merge_queue if not present
  try {
    db.prepare('SELECT completed_at FROM merge_queue LIMIT 1').get();
  } catch {
    db.exec('ALTER TABLE merge_queue ADD COLUMN completed_at TEXT');
  }

  // Migration: add depends_on column to merge_queue for dependency tracking
  try {
    db.prepare('SELECT depends_on FROM merge_queue LIMIT 1').get();
  } catch {
    db.exec('ALTER TABLE merge_queue ADD COLUMN depends_on TEXT');
  }

  // Migration: add pre_merge_commit column for rollback support
  try {
    db.prepare('SELECT pre_merge_commit FROM merge_queue LIMIT 1').get();
  } catch {
    db.exec('ALTER TABLE merge_queue ADD COLUMN pre_merge_commit TEXT');
  }

  // Migration: add rolled_back flag for rollback status display
  try {
    db.prepare('SELECT rolled_back FROM merge_queue LIMIT 1').get();
  } catch {
    db.exec('ALTER TABLE merge_queue ADD COLUMN rolled_back INTEGER DEFAULT 0');
  }

  // Migration: add session_branch column to runs for merge target tracking
  try {
    db.prepare('SELECT session_branch FROM runs LIMIT 1').get();
  } catch {
    db.exec('ALTER TABLE runs ADD COLUMN session_branch TEXT');
  }

  // Migration: add path_boundaries column for path boundary enforcement
  try {
    db.prepare('SELECT path_boundaries FROM agent_definitions LIMIT 1').get();
  } catch {
    db.exec('ALTER TABLE agent_definitions ADD COLUMN path_boundaries TEXT');
  }

  // Migration: extend guard_violations rule_type CHECK to include 'tracker_closure'
  try {
    const tableInfo = db
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='guard_violations'")
      .get() as { sql: string } | undefined;
    if (tableInfo?.sql && !tableInfo.sql.includes('tracker_closure')) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS guard_violations_new (
          id TEXT PRIMARY KEY,
          agent_name TEXT NOT NULL,
          capability TEXT NOT NULL,
          rule_type TEXT NOT NULL CHECK(rule_type IN ('tool_allowlist', 'bash_restriction', 'file_scope', 'tracker_closure')),
          violation TEXT NOT NULL,
          tool_attempted TEXT,
          command_attempted TEXT,
          file_attempted TEXT,
          severity TEXT NOT NULL DEFAULT 'warning' CHECK(severity IN ('info', 'warning', 'critical')),
          acknowledged INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO guard_violations_new SELECT * FROM guard_violations;
        DROP TABLE guard_violations;
        ALTER TABLE guard_violations_new RENAME TO guard_violations;
      `);
    }
  } catch {
    // Table already migrated or doesn't exist yet
  }

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
        path_boundaries: JSON.stringify([
          { pattern: '.', type: 'worktree', description: 'Confined to assigned worktree' },
        ]),
        can_spawn: 0,
        constraints: JSON.stringify(['read-only']),
        definition_file: '.fleetcommand/agent-defs/scout.md',
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
        path_boundaries: JSON.stringify([
          { pattern: '.', type: 'worktree', description: 'Confined to assigned worktree' },
        ]),
        can_spawn: 0,
        constraints: JSON.stringify([]),
        definition_file: '.fleetcommand/agent-defs/builder.md',
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
        path_boundaries: JSON.stringify([
          { pattern: '.', type: 'worktree', description: 'Confined to assigned worktree' },
        ]),
        can_spawn: 0,
        constraints: JSON.stringify(['read-only']),
        definition_file: '.fleetcommand/agent-defs/reviewer.md',
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
        path_boundaries: JSON.stringify([
          { pattern: '.', type: 'worktree', description: 'Confined to assigned worktree' },
        ]),
        can_spawn: 1,
        constraints: JSON.stringify([]),
        definition_file: '.fleetcommand/agent-defs/lead.md',
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
        path_boundaries: JSON.stringify([
          { pattern: '.', type: 'worktree', description: 'Confined to assigned worktree' },
        ]),
        can_spawn: 0,
        constraints: JSON.stringify([]),
        definition_file: '.fleetcommand/agent-defs/merger.md',
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
        path_boundaries: JSON.stringify([
          { pattern: '.', type: 'worktree', description: 'Confined to assigned worktree' },
        ]),
        can_spawn: 1,
        constraints: JSON.stringify(['read-only', 'no-worktree']),
        definition_file: '.fleetcommand/agent-defs/coordinator.md',
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
        path_boundaries: JSON.stringify([
          { pattern: '.', type: 'worktree', description: 'Confined to assigned worktree' },
        ]),
        can_spawn: 0,
        constraints: JSON.stringify(['read-only', 'no-worktree']),
        definition_file: '.fleetcommand/agent-defs/monitor.md',
      },
    ];

    const insertDef = db.prepare(`
      INSERT INTO agent_definitions (role, display_name, description, capabilities, default_model, tool_allowlist, bash_restrictions, file_scope, path_boundaries, can_spawn, constraints, definition_file)
      VALUES (@role, @display_name, @description, @capabilities, @default_model, @tool_allowlist, @bash_restrictions, @file_scope, @path_boundaries, @can_spawn, @constraints, @definition_file)
    `);

    for (const def of seedDefs) {
      insertDef.run(def);
    }
    log.info('Seeded 7 default agent definitions');
  }

  // Migration: expand hooks table hook_type CHECK to include PostToolUse, Stop, PreCompact
  try {
    const hooksTableInfo = db
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='hooks'")
      .get() as { sql: string } | undefined;
    if (hooksTableInfo?.sql && !hooksTableInfo.sql.includes('PostToolUse')) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS hooks_new (
          id TEXT PRIMARY KEY,
          project_id TEXT,
          hook_type TEXT NOT NULL CHECK(hook_type IN ('SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop', 'PreCompact')),
          name TEXT NOT NULL,
          description TEXT,
          script_content TEXT NOT NULL DEFAULT '',
          is_installed INTEGER NOT NULL DEFAULT 0,
          target_worktrees TEXT,
          installed_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO hooks_new SELECT * FROM hooks;
        DROP TABLE hooks;
        ALTER TABLE hooks_new RENAME TO hooks;
      `);
      log.info('[Migration] Expanded hooks table hook_type CHECK constraint');
    }
  } catch {
    // Table already migrated or doesn't exist yet
  }

  // Migration: expand messages table type CHECK to include decision_gate
  try {
    const messagesTableInfo = db
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='messages'")
      .get() as { sql: string } | undefined;
    if (messagesTableInfo?.sql && !messagesTableInfo.sql.includes('decision_gate')) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS messages_new (
          id TEXT PRIMARY KEY,
          thread_id TEXT,
          from_agent TEXT NOT NULL,
          to_agent TEXT NOT NULL,
          subject TEXT,
          body TEXT,
          type TEXT NOT NULL CHECK(type IN ('status', 'question', 'result', 'error', 'worker_done', 'merge_ready', 'merged', 'merge_failed', 'escalation', 'health_check', 'dispatch', 'assign', 'decision_gate')),
          priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'urgent')),
          payload TEXT,
          read INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO messages_new SELECT * FROM messages;
        DROP TABLE messages;
        ALTER TABLE messages_new RENAME TO messages;
      `);
      log.info('[Migration] Expanded messages table type CHECK constraint');
    }
  } catch {
    // Table already migrated or doesn't exist yet
  }

  // Migration: add expires_at column to expertise_records for shelf-life/decay
  try {
    db.prepare('SELECT expires_at FROM expertise_records LIMIT 1').get();
  } catch {
    db.exec('ALTER TABLE expertise_records ADD COLUMN expires_at TEXT');
  }

  // Migration: add dispatch_issue_id column to sessions for coordinator↔task board linking
  try {
    db.prepare('SELECT dispatch_issue_id FROM sessions LIMIT 1').get();
  } catch {
    db.exec('ALTER TABLE sessions ADD COLUMN dispatch_issue_id TEXT');
  }

  // Migration: add can_spawn and constraints columns to agent_definitions
  try {
    db.prepare('SELECT can_spawn FROM agent_definitions LIMIT 1').get();
  } catch {
    db.exec('ALTER TABLE agent_definitions ADD COLUMN can_spawn INTEGER NOT NULL DEFAULT 0');
    db.exec('ALTER TABLE agent_definitions ADD COLUMN constraints TEXT');
    // Update seed data with proper values
    db.exec(`UPDATE agent_definitions SET can_spawn = 1, constraints = '["read-only","no-worktree"]' WHERE role = 'coordinator'`);
    db.exec(`UPDATE agent_definitions SET can_spawn = 1, constraints = '[]' WHERE role = 'lead'`);
    db.exec(`UPDATE agent_definitions SET can_spawn = 0, constraints = '["read-only"]' WHERE role = 'scout'`);
    db.exec(`UPDATE agent_definitions SET can_spawn = 0, constraints = '[]' WHERE role = 'builder'`);
    db.exec(`UPDATE agent_definitions SET can_spawn = 0, constraints = '["read-only"]' WHERE role = 'reviewer'`);
    db.exec(`UPDATE agent_definitions SET can_spawn = 0, constraints = '[]' WHERE role = 'merger'`);
    db.exec(`UPDATE agent_definitions SET can_spawn = 0, constraints = '["read-only","no-worktree"]' WHERE role = 'monitor'`);
  }

  // Migration: add definition_file column to agent_definitions (Phase 6.1)
  try {
    db.prepare('SELECT definition_file FROM agent_definitions LIMIT 1').get();
  } catch {
    db.exec('ALTER TABLE agent_definitions ADD COLUMN definition_file TEXT');
    // Set default definition file paths for all roles
    db.exec(`UPDATE agent_definitions SET definition_file = '.fleetcommand/agent-defs/coordinator.md' WHERE role = 'coordinator'`);
    db.exec(`UPDATE agent_definitions SET definition_file = '.fleetcommand/agent-defs/lead.md' WHERE role = 'lead'`);
    db.exec(`UPDATE agent_definitions SET definition_file = '.fleetcommand/agent-defs/scout.md' WHERE role = 'scout'`);
    db.exec(`UPDATE agent_definitions SET definition_file = '.fleetcommand/agent-defs/builder.md' WHERE role = 'builder'`);
    db.exec(`UPDATE agent_definitions SET definition_file = '.fleetcommand/agent-defs/reviewer.md' WHERE role = 'reviewer'`);
    db.exec(`UPDATE agent_definitions SET definition_file = '.fleetcommand/agent-defs/merger.md' WHERE role = 'merger'`);
    db.exec(`UPDATE agent_definitions SET definition_file = '.fleetcommand/agent-defs/monitor.md' WHERE role = 'monitor'`);
  }

  // Seed default stagger delay if not present
  try {
    const staggerSetting = db.prepare("SELECT value FROM app_settings WHERE key = 'stagger_delay_ms'").get();
    if (!staggerSetting) {
      db.prepare("INSERT INTO app_settings (key, value) VALUES ('stagger_delay_ms', '2000')").run();
    }
  } catch { /* ignore */ }

  dbInitialized = true;
  log.info('Database schema applied successfully');
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    dbInitialized = false;
    log.info('Database closed');
  }
}
