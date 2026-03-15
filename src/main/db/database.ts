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
      file_scope TEXT
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
      hook_type TEXT NOT NULL CHECK(hook_type IN ('SessionStart', 'UserPromptSubmit', 'PreToolUse')),
      name TEXT NOT NULL,
      description TEXT,
      script_content TEXT NOT NULL DEFAULT '',
      is_installed INTEGER NOT NULL DEFAULT 0,
      target_worktrees TEXT,
      installed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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
    CREATE INDEX IF NOT EXISTS idx_expertise_domain ON expertise_records(domain);
    CREATE INDEX IF NOT EXISTS idx_expertise_type ON expertise_records(type);
    CREATE INDEX IF NOT EXISTS idx_expertise_classification ON expertise_records(classification);
    CREATE INDEX IF NOT EXISTS idx_expertise_agent ON expertise_records(agent_name);
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
