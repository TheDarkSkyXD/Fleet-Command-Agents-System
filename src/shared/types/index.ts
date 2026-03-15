// Agent capability types
export type AgentCapability =
  | 'scout'
  | 'builder'
  | 'reviewer'
  | 'lead'
  | 'merger'
  | 'coordinator'
  | 'monitor';

// Agent state machine
export type AgentState = 'booting' | 'working' | 'completed' | 'stalled' | 'zombie';

// Message types
export type MessageType =
  | 'status'
  | 'question'
  | 'result'
  | 'error'
  | 'worker_done'
  | 'merge_ready'
  | 'merged'
  | 'merge_failed'
  | 'escalation'
  | 'health_check'
  | 'dispatch'
  | 'assign';

export type MessagePriority = 'low' | 'normal' | 'high' | 'urgent';

// Protocol message payload schemas (structured JSON per protocol type)
export interface WorkerDonePayload {
  taskId: string;
  summary: string;
  filesModified: string[];
}

export interface MergeReadyPayload {
  branch: string;
  files: string[];
  task_id?: string;
}

export interface MergedPayload {
  branch: string;
  merge_commit?: string;
  conflicts_resolved?: number;
}

export interface MergeFailedPayload {
  branch: string;
  reason: string;
  conflicting_files?: string[];
}

export interface EscalationPayload {
  level: number;
  reason: string;
  agent_session_id?: string;
}

export interface DispatchPayload {
  objective: string;
  lead_session_id?: string;
}

export interface AssignPayload {
  task_id: string;
  file_scope?: string[];
  instructions?: string;
}

export interface HealthCheckPayload {
  status: 'ok' | 'degraded' | 'failing';
  uptime_seconds?: number;
  memory_usage_mb?: number;
}

// Map of protocol types to their payload interfaces
export type ProtocolPayloadMap = {
  worker_done: WorkerDonePayload;
  merge_ready: MergeReadyPayload;
  merged: MergedPayload;
  merge_failed: MergeFailedPayload;
  escalation: EscalationPayload;
  dispatch: DispatchPayload;
  assign: AssignPayload;
  health_check: HealthCheckPayload;
};

// Protocol message type identifiers
export const PROTOCOL_TYPES: MessageType[] = [
  'worker_done',
  'merge_ready',
  'merged',
  'merge_failed',
  'escalation',
  'health_check',
  'dispatch',
  'assign',
];

// Payload template hints for compose form
export const PAYLOAD_TEMPLATES: Record<string, string> = {
  worker_done: JSON.stringify({ taskId: '', summary: '', filesModified: [] }, null, 2),
  merge_ready: JSON.stringify({ branch: '', files: [] }, null, 2),
  merged: JSON.stringify({ branch: '', merge_commit: '', conflicts_resolved: 0 }, null, 2),
  merge_failed: JSON.stringify({ branch: '', reason: '', conflicting_files: [] }, null, 2),
  escalation: JSON.stringify({ level: 1, reason: '' }, null, 2),
  dispatch: JSON.stringify({ objective: '' }, null, 2),
  assign: JSON.stringify({ task_id: '', file_scope: [], instructions: '' }, null, 2),
  health_check: JSON.stringify({ status: 'ok', uptime_seconds: 0 }, null, 2),
};

// Group broadcast addresses for mail routing
export const GROUP_BROADCAST_ADDRESSES = [
  '@all',
  '@builders',
  '@scouts',
  '@reviewers',
  '@leads',
  '@mergers',
  '@coordinator',
  '@monitor',
] as const;

export type GroupBroadcastAddress = (typeof GROUP_BROADCAST_ADDRESSES)[number];

// Merge statuses
export type MergeStatus = 'pending' | 'merging' | 'merged' | 'conflict' | 'failed';
export type MergeResolutionTier = 'clean-merge' | 'auto-resolve' | 'ai-resolve' | 'reimagine';

// Run status
export type RunStatus = 'active' | 'completed' | 'failed';

// Event types
export type EventType =
  | 'tool_start'
  | 'tool_end'
  | 'session_start'
  | 'session_end'
  | 'mail_sent'
  | 'mail_received'
  | 'spawn'
  | 'error'
  | 'custom';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// Database record types
export interface Session {
  id: string;
  run_id: string | null;
  agent_name: string;
  capability: AgentCapability;
  model: string | null;
  state: AgentState;
  pid: number | null;
  worktree_path: string | null;
  branch_name: string | null;
  task_id: string | null;
  parent_agent: string | null;
  depth: number;
  transcript_path: string | null;
  prompt_version: string | null;
  escalation_level: number;
  stalled_at: string | null;
  file_scope: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

// Scope overlap detection
export interface ScopeOverlap {
  agentName: string;
  sessionId: string;
  capability: string;
  fileScope: string;
  overlappingPaths: string[];
}

export interface Run {
  id: string;
  status: RunStatus;
  coordinator_session_id: string | null;
  agent_count: number;
  started_at: string;
  completed_at: string | null;
}

export interface AgentPerformanceSession {
  id: string;
  capability: string;
  model: string | null;
  state: string;
  task_id: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface AgentPerformanceHistory {
  agentName: string;
  totalSessions: number;
  completedCount: number;
  failedCount: number;
  successRate: number;
  avgDurationMs: number;
  sessions: AgentPerformanceSession[];
}

export interface Message {
  id: string;
  thread_id: string | null;
  from_agent: string;
  to_agent: string;
  subject: string | null;
  body: string | null;
  type: MessageType;
  priority: MessagePriority;
  payload: string | null;
  read: number;
  created_at: string;
}

export interface Event {
  id: string;
  run_id: string | null;
  agent_name: string | null;
  session_id: string | null;
  event_type: EventType;
  tool_name: string | null;
  tool_args: string | null;
  tool_duration_ms: number | null;
  level: LogLevel;
  data: string | null;
  created_at: string;
}

export interface Metric {
  id: string;
  agent_name: string | null;
  task_id: string | null;
  capability: AgentCapability | null;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  model_used: string | null;
  estimated_cost: number;
  duration_ms: number;
  parent_agent: string | null;
  run_id: string | null;
  started_at: string | null;
  completed_at: string | null;
}

// Model breakdown aggregation
export interface ModelBreakdown {
  model_used: string;
  session_count: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_read_tokens: number;
  total_cache_creation_tokens: number;
  total_cost: number;
  total_duration_ms: number;
}

// Capability breakdown aggregation
export interface CapabilityBreakdown {
  capability: string;
  session_count: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_read_tokens: number;
  total_cache_creation_tokens: number;
  total_cost: number;
  total_duration_ms: number;
}

// Metrics summary aggregation
export interface MetricsSummary {
  total_sessions: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_read_tokens: number;
  total_cache_creation_tokens: number;
  total_cost: number;
  total_duration_ms: number;
}

export interface MergeQueueEntry {
  id: number;
  branch_name: string;
  task_id: string | null;
  agent_name: string | null;
  files_modified: string | null;
  status: MergeStatus;
  resolved_tier: MergeResolutionTier | null;
  enqueued_at: string;
  completed_at: string | null;
  depends_on: string | null; // JSON array of merge queue IDs this entry depends on
  blocked?: boolean; // computed field - true if any dependency has failed status
  pre_merge_commit: string | null; // commit SHA before merge, used for rollback
  rolled_back: number; // 0 = not rolled back, 1 = rolled back
}

export interface TaskGroup {
  id: string;
  name: string;
  member_issues: string | null;
  status: 'active' | 'completed';
  created_at: string;
  closed_at: string | null;
}

export interface AgentIdentity {
  name: string;
  capability: AgentCapability | null;
  sessions_completed: number;
  expertise_domains: string | null;
  recent_tasks: string | null;
  created_at: string;
  updated_at: string;
}

export interface Checkpoint {
  agent_name: string;
  task_id: string | null;
  session_id: string | null;
  progress_summary: string | null;
  files_modified: string | null;
  current_branch: string | null;
  pending_work: string | null;
  mulch_domains: string | null;
  timestamp: string;
}

export interface CheckpointRestoreResult {
  agentName: string;
  taskId: string | null;
  sessionId: string | null;
  progressSummary: string | null;
  filesModified: string | null;
  currentBranch: string | null;
  pendingWork: string | null;
  processAlive: boolean;
  restored: boolean;
  timestamp: string;
}

export interface RecoveryStatus {
  checkpointsFound: number;
  processesAlive: number;
  restored: CheckpointRestoreResult[];
  recoveryTimestamp: string;
}

// Issue types
export type IssueType = 'task' | 'bug' | 'feature' | 'research' | 'spike';
export type IssuePriority = 'critical' | 'high' | 'medium' | 'low';
export type IssueStatus = 'open' | 'in_progress' | 'closed' | 'blocked';

export interface Issue {
  id: string;
  title: string;
  description: string | null;
  type: IssueType;
  priority: IssuePriority;
  status: IssueStatus;
  assigned_agent: string | null;
  group_id: string | null;
  dependencies: string | null;
  close_summary: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

// Project types
export interface Project {
  id: string;
  name: string;
  path: string;
  description: string | null;
  is_active: number;
  last_opened_at: string | null;
  created_at: string;
  updated_at: string;
}

// Worktree types
export interface Worktree {
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
}

// File tree node for file scope picker
export interface FileTreeNode {
  name: string;
  path: string;
  relativePath: string;
  isDirectory: boolean;
  children?: FileTreeNode[];
}

// Agent Definition types
export interface AgentDefinition {
  role: string;
  display_name: string;
  description: string;
  capabilities: string; // JSON array
  default_model: string;
  tool_allowlist: string | null; // JSON array
  bash_restrictions: string | null; // JSON array
  file_scope: string | null;
  path_boundaries: string | null; // JSON array of allowed path patterns
  created_at: string;
  updated_at: string;
}

export interface PathBoundaryRule {
  pattern: string; // glob pattern or absolute path
  type: 'worktree' | 'directory' | 'glob'; // worktree = auto-enforce worktree root
  description?: string;
}

// Configuration Profile types
export interface ConfigProfile {
  id: string;
  name: string;
  description: string | null;
  max_hierarchy_depth: number;
  max_concurrent_agents: number;
  max_agents_per_lead: number;
  default_capability: string;
  default_model: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

// Tool stats aggregation
export interface ToolStats {
  tool_name: string;
  usage_count: number;
  avg_duration_ms: number | null;
  min_duration_ms: number | null;
  max_duration_ms: number | null;
  total_duration_ms: number | null;
}

// Expertise record types
export type ExpertiseType =
  | 'convention'
  | 'pattern'
  | 'failure'
  | 'decision'
  | 'reference'
  | 'guide';
export type ExpertiseClassification = 'foundational' | 'tactical' | 'observational';

export interface ExpertiseRecord {
  id: string;
  domain: string;
  title: string;
  content: string;
  type: ExpertiseType;
  classification: ExpertiseClassification;
  agent_name: string | null;
  source_file: string | null;
  tags: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExpertiseDomainSummary {
  domain: string;
  record_count: number;
  types: Record<string, number>;
  last_updated: string | null;
}

// Prompt types
export type PromptType = 'system' | 'user' | 'agent' | 'task' | 'template';

export interface Prompt {
  id: string;
  name: string;
  description: string | null;
  content: string;
  type: PromptType;
  parent_id: string | null;
  version: number;
  is_active: number;
  tags: string | null;
  created_at: string;
  updated_at: string;
}

export interface PromptVersion {
  id: string;
  prompt_id: string;
  version: number;
  content: string;
  change_summary: string | null;
  created_at: string;
}

export interface PromptTreeNode extends Prompt {
  children: PromptTreeNode[];
}

// Guard violation types
export type GuardRuleType = 'tool_allowlist' | 'bash_restriction' | 'file_scope';
export type GuardViolationSeverity = 'info' | 'warning' | 'critical';

export interface GuardViolation {
  id: string;
  agent_name: string;
  capability: string;
  rule_type: GuardRuleType;
  violation: string;
  tool_attempted: string | null;
  command_attempted: string | null;
  file_attempted: string | null;
  severity: GuardViolationSeverity;
  acknowledged: number;
  created_at: string;
}

// Discovery types
export type DiscoveryCategory =
  | 'architecture'
  | 'dependencies'
  | 'testing'
  | 'apis'
  | 'config'
  | 'conventions';
export type DiscoveryScanStatus = 'pending' | 'running' | 'completed' | 'failed';
export type FindingSeverity = 'info' | 'warning' | 'important';

export interface DiscoveryScan {
  id: string;
  project_id: string | null;
  status: DiscoveryScanStatus;
  categories: string; // JSON array of DiscoveryCategory
  progress: string | null; // JSON object tracking per-category progress
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface DiscoveryFinding {
  id: string;
  scan_id: string;
  category: DiscoveryCategory;
  title: string;
  description: string;
  file_path: string | null;
  line_number: number | null;
  severity: FindingSeverity;
  created_at: string;
}

// Quality Gate types
export type QualityGateType = 'test' | 'lint' | 'typecheck' | 'custom';

export interface QualityGate {
  id: string;
  project_id: string;
  gate_type: QualityGateType;
  name: string;
  command: string;
  enabled: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type QualityGateResultStatus = 'pending' | 'running' | 'passed' | 'failed' | 'error';

export interface QualityGateResult {
  id: string;
  gate_id: string;
  agent_name: string | null;
  session_id: string | null;
  project_id: string;
  gate_type: string;
  gate_name: string;
  command: string;
  status: QualityGateResultStatus;
  exit_code: number | null;
  stdout: string | null;
  stderr: string | null;
  duration_ms: number | null;
  created_at: string;
}

export interface QualityGateRunSummary {
  all_passed: boolean;
  results: QualityGateResult[];
  agent_name: string | null;
  session_id: string | null;
  project_id: string;
}

// Hook types
export type HookType = 'SessionStart' | 'UserPromptSubmit' | 'PreToolUse';

export interface Hook {
  id: string;
  project_id: string | null;
  hook_type: HookType;
  name: string;
  description: string | null;
  script_content: string;
  is_installed: number;
  target_worktrees: string | null; // JSON array
  installed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface HookDeployResult {
  hookId: string;
  worktree: string;
  success: boolean;
  error?: string;
}

// App log entry
export interface AppLogEntry {
  id: number;
  level: LogLevel;
  message: string;
  source: string | null;
  agent_name: string | null;
  data: string | null;
  created_at: string;
}

// Update status
export interface UpdateStatus {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string | null;
  releaseNotes: string | null;
  releaseDate: string | null;
  downloadProgress: number | null;
  downloadedBytes: number | null;
  totalBytes: number | null;
  downloadSpeed: number | null;
  isDownloading: boolean;
  isDownloaded: boolean;
  error: string | null;
}

// Doctor check result
export interface DoctorCheck {
  name: string;
  status: 'pass' | 'fail';
  version: string | null;
  detail: string | null;
  fixable: boolean;
  fixAction?: string;
}

export interface DoctorResult {
  checks: DoctorCheck[];
  allPassing: boolean;
}

export interface DoctorFixResult {
  name: string;
  success: boolean;
  message: string;
}

// Electron API type for renderer process
// Health check response
export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  database: 'connected' | 'disconnected' | 'error';
  walMode?: string;
  foreignKeys?: boolean;
  dbPath?: string;
  timestamp: string;
  error?: string;
}

// Database status response
export interface DbStatusResponse {
  status: 'connected' | 'disconnected';
  walMode?: string;
  foreignKeys?: boolean;
  tables?: string[];
  tableDetails?: Record<string, { columns: string[]; rowCount: number }>;
  dbPath?: string;
  error?: string;
}

// Agent spawn options for the renderer
export interface AgentSpawnRequest {
  id: string;
  agent_name: string;
  capability: AgentCapability;
  model?: string;
  run_id?: string;
  task_id?: string;
  parent_agent?: string;
  worktree_path?: string;
  branch_name?: string;
  depth?: number;
  prompt?: string;
  file_scope?: string;
}

export interface AgentResumeRequest {
  id: string;
  agent_name: string;
  capability: AgentCapability;
  model?: string;
  run_id?: string;
  task_id?: string;
  parent_agent?: string;
  worktree_path?: string;
  branch_name?: string;
  depth?: number;
  resume_session_id: string;
  file_scope?: string;
}

// Running agent process info from main process
export interface AgentProcessInfo {
  id: string;
  agentName: string;
  capability: AgentCapability;
  model: string;
  pid: number;
  isRunning: boolean;
  createdAt: string;
  outputLines?: number;
}

export interface ElectronAPI {
  healthCheck: () => Promise<HealthCheckResponse>;
  dbStatus: () => Promise<DbStatusResponse>;
  agentList: () => Promise<{ data: Session[] | null; error: string | null }>;
  agentDetail: (id: string) => Promise<{ data: Session | null; error: string | null }>;
  agentSpawn: (
    options: AgentSpawnRequest,
  ) => Promise<{ data: (Session & { model: string; pid: number }) | null; error: string | null }>;
  agentStop: (name: string) => Promise<{ data: unknown; error: string | null }>;
  agentStopAll: () => Promise<{ data: unknown; error: string | null }>;
  agentNudge: (name: string) => Promise<{ data: unknown; error: string | null }>;
  agentResume: (options: AgentResumeRequest) => Promise<{
    data: (Session & { model: string; pid: number; resumed_from: string }) | null;
    error: string | null;
  }>;
  // Scope overlap detection
  scopeCheckOverlap: (
    filePaths: string[],
    excludeSessionId?: string,
  ) => Promise<{ data: ScopeOverlap[] | null; error: string | null }>;
  // Coordinator
  coordinatorStart: (options?: { prompt?: string; run_id?: string }) => Promise<{
    data: Session | null;
    error: string | null;
  }>;
  coordinatorStop: () => Promise<{ data: Session | null; error: string | null }>;
  coordinatorStatus: () => Promise<{
    data: {
      active: boolean;
      session: Session | null;
      processAlive: boolean;
      agentsDispatched?: number;
    } | null;
    error: string | null;
  }>;
  coordinatorDispatch: (options: {
    objective: string;
    lead_name?: string;
    model?: string;
    worktree_path?: string;
    branch_name?: string;
    task_id?: string;
    file_scope?: string;
  }) => Promise<{
    data: {
      session: Session;
      objective: string;
      dispatch_message_id: string;
    } | null;
    error: string | null;
  }>;
  coordinatorDispatchedLeads: () => Promise<{
    data: Array<Session & { objective?: string }> | null;
    error: string | null;
  }>;
  coordinatorPollMail: () => Promise<{
    data: {
      messages_processed: Array<{
        message_id: string;
        from_agent: string;
        type: string;
        action_taken: string;
      }>;
      unread_count: number;
      fleet_summary: {
        active_agents: number;
        stalled_agents: number;
        completed_today: number;
      };
    } | null;
    error: string | null;
  }>;

  coordinatorDecompose: (options?: { scope?: string; coordinatorSessionId?: string }) => Promise<{
    data: {
      streams: Array<{
        groupId: string;
        name: string;
        description: string;
        taskCount: number;
        tasks: Array<{ id: string; title: string }>;
      }>;
      totalTasks: number;
      scope: string;
    } | null;
    error: string | null;
  }>;
  coordinatorActivityLog: (limit?: number) => Promise<{
    data: Array<{
      id: string;
      source: string;
      type: string;
      summary: string;
      detail: string | null;
      level: string;
      timestamp: string;
    }> | null;
    error: string | null;
  }>;
  coordinatorWorkStreams: () => Promise<{
    data: Array<{
      id: string;
      name: string;
      status: string;
      total_tasks: number;
      completed_tasks: number;
      in_progress_tasks: number;
      created_at: string;
    }> | null;
    error: string | null;
  }>;

  agentOutput: (id: string) => Promise<{ data: string[] | null; error: string | null }>;
  agentWrite: (id: string, data: string) => Promise<{ data: boolean; error: string | null }>;
  agentResize: (
    id: string,
    cols: number,
    rows: number,
  ) => Promise<{ data: boolean; error: string | null }>;
  agentProcessInfo: (
    id: string,
  ) => Promise<{ data: AgentProcessInfo | null; error: string | null }>;
  agentRunningList: () => Promise<{ data: AgentProcessInfo[] | null; error: string | null }>;
  agentChildren: (agentName: string) => Promise<{ data: Session[] | null; error: string | null }>;
  agentHierarchy: (agentName?: string) => Promise<{
    data: {
      agent?: Record<string, unknown>;
      roots?: Record<string, unknown>[];
      children?: Record<string, unknown>[];
      childCount?: number;
      allSessions?: Record<string, unknown>[];
      childMap?: Record<string, Record<string, unknown>[]>;
    } | null;
    error: string | null;
  }>;
  mailList: (
    filters?: Record<string, unknown>,
  ) => Promise<{ data: Message[] | null; error: string | null }>;
  mailUnreadCount: () => Promise<{ data: number; error: string | null }>;
  mailSend: (message: Record<string, unknown>) => Promise<{ data: unknown; error: string | null }>;
  mailMarkRead: (id: string) => Promise<{ data: unknown; error: string | null }>;
  mailCheck: (
    agentId: string,
    agentName: string,
  ) => Promise<{
    data: { injected: number; messages: Message[]; contextWritten: boolean } | null;
    error: string | null;
  }>;
  mailMarkAllRead: (agentName?: string) => Promise<{ data: unknown; error: string | null }>;
  mailPurge: (
    options?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: string | null }>;
  mailThread: (threadId: string) => Promise<{
    data: { messages: Message[]; replyCount: number } | null;
    error: string | null;
  }>;
  mergeQueue: () => Promise<{ data: MergeQueueEntry[] | null; error: string | null }>;
  mergeEnqueue: (entry: {
    branch_name: string;
    task_id?: string;
    agent_name?: string;
    files_modified?: string[];
    depends_on?: number[];
  }) => Promise<{ data: MergeQueueEntry | null; error: string | null }>;
  mergeNext: () => Promise<{ data: MergeQueueEntry | null; error: string | null }>;
  mergeExecute: (
    id: number,
    repoPath?: string,
    targetBranch?: string,
  ) => Promise<{ data: MergeQueueEntry | null; error: string | null }>;
  mergeComplete: (
    id: number,
    resolvedTier: string,
  ) => Promise<{ data: MergeQueueEntry | null; error: string | null }>;
  mergeFail: (id: number) => Promise<{ data: MergeQueueEntry | null; error: string | null }>;
  mergeConflict: (id: number) => Promise<{ data: MergeQueueEntry | null; error: string | null }>;
  mergePreview: (id: number, repoPath?: string) => Promise<{ data: unknown; error: string | null }>;
  mergeHistory: () => Promise<{ data: MergeQueueEntry[] | null; error: string | null }>;
  mergeDiff: (
    id: number,
    repoPath?: string,
  ) => Promise<{ data: { diff: string; branchName: string } | null; error: string | null }>;
  mergeRemove: (id: number) => Promise<{ data: boolean; error: string | null }>;
  mergeAutoResolve: (
    id: number,
    repoPath?: string,
    targetBranch?: string,
  ) => Promise<{ data: MergeQueueEntry | null; error: string | null; conflicts?: string[] }>;
  mergeAiResolve: (
    id: number,
    repoPath?: string,
    targetBranch?: string,
  ) => Promise<{ data: MergeQueueEntry | null; error: string | null; conflicts?: string[] }>;
  mergeReimagine: (
    id: number,
    repoPath?: string,
    targetBranch?: string,
  ) => Promise<{
    data: MergeQueueEntry | null;
    error: string | null;
    reimagineBranch?: string;
  }>;
  mergeRollback: (
    id: number,
    repoPath?: string,
  ) => Promise<{ data: MergeQueueEntry | null; error: string | null }>;
  mergeGetTargetBranch: () => Promise<{ data: string | null; error: string | null }>;
  mergeSetTargetBranch: (branch: string) => Promise<{ data: boolean; error: string | null }>;
  // Issues
  issueList: (filters?: { status?: string; priority?: string; type?: string }) => Promise<{
    data: Issue[] | null;
    error: string | null;
  }>;
  issueCreate: (issue: {
    id: string;
    title: string;
    description?: string;
    type: string;
    priority: string;
  }) => Promise<{ data: Issue | null; error: string | null }>;
  issueGet: (id: string) => Promise<{ data: Issue | null; error: string | null }>;
  issueUpdate: (
    id: string,
    updates: Record<string, unknown>,
  ) => Promise<{ data: Issue | null; error: string | null }>;
  issueDelete: (id: string) => Promise<{ data: boolean; error: string | null }>;
  issueClaim: (
    id: string,
    agentName: string,
  ) => Promise<{ data: Issue | null; error: string | null }>;
  issueSetDependencies: (
    id: string,
    dependencyIds: string[],
  ) => Promise<{ data: Issue | null; error: string | null }>;
  issueReadyQueue: () => Promise<{ data: Issue[] | null; error: string | null }>;
  issueBlocking: (id: string) => Promise<{
    data: Array<{ id: string; title: string; status: string; dependencies: string | null }> | null;
    error: string | null;
  }>;
  issueByAgent: (agentName: string) => Promise<{ data: Issue[] | null; error: string | null }>;

  // Task Groups
  taskGroupList: () => Promise<{ data: TaskGroup[] | null; error: string | null }>;
  taskGroupCreate: (group: { id: string; name: string }) => Promise<{
    data: TaskGroup | null;
    error: string | null;
  }>;
  taskGroupGet: (id: string) => Promise<{ data: TaskGroup | null; error: string | null }>;
  taskGroupDelete: (id: string) => Promise<{ data: boolean; error: string | null }>;
  taskGroupAddIssue: (
    groupId: string,
    issueId: string,
  ) => Promise<{ data: TaskGroup | null; error: string | null }>;
  taskGroupRemoveIssue: (
    groupId: string,
    issueId: string,
  ) => Promise<{ data: TaskGroup | null; error: string | null }>;
  taskGroupGetProgress: (groupId: string) => Promise<{
    data: {
      total: number;
      completed: number;
      in_progress: number;
      open: number;
      blocked: number;
    } | null;
    error: string | null;
  }>;
  taskGroupCheckAutoClose: (issueId: string) => Promise<{
    data: TaskGroup | null;
    error: string | null;
  }>;

  // Agent Definitions
  agentDefList: () => Promise<{ data: AgentDefinition[] | null; error: string | null }>;
  agentDefGet: (role: string) => Promise<{ data: AgentDefinition | null; error: string | null }>;
  agentDefImport: (
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
  ) => Promise<{ data: AgentDefinition[] | null; error: string | null; imported?: number }>;
  agentDefExport: (
    roles?: string[],
  ) => Promise<{ data: AgentDefinition[] | null; error: string | null }>;
  agentDefCreate: (definition: {
    role: string;
    display_name: string;
    description: string;
    capabilities: string;
    default_model: string;
    tool_allowlist?: string;
    bash_restrictions?: string;
    file_scope?: string;
  }) => Promise<{ data: AgentDefinition | null; error: string | null }>;
  agentDefDelete: (role: string) => Promise<{ data: boolean; error: string | null }>;
  agentDefResetDefaults: () => Promise<{ data: AgentDefinition[] | null; error: string | null }>;
  agentDefUpdate: (
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
  ) => Promise<{ data: AgentDefinition | null; error: string | null }>;

  // Projects
  projectList: () => Promise<{ data: Project[] | null; error: string | null }>;
  projectCreate: (project: {
    id: string;
    name: string;
    path: string;
    description?: string;
  }) => Promise<{ data: Project | null; error: string | null }>;
  projectGet: (id: string) => Promise<{ data: Project | null; error: string | null }>;
  projectUpdate: (
    id: string,
    updates: Record<string, unknown>,
  ) => Promise<{ data: Project | null; error: string | null }>;
  projectDelete: (id: string) => Promise<{ data: boolean; error: string | null }>;
  projectSwitch: (id: string) => Promise<{ data: Project | null; error: string | null }>;
  projectGetActive: () => Promise<{ data: Project | null; error: string | null }>;
  projectFileTree: (
    rootPath: string,
    maxDepth?: number,
  ) => Promise<{ data: FileTreeNode[] | null; error: string | null }>;

  // Worktrees
  worktreeList: (repoPath: string) => Promise<{ data: Worktree[] | null; error: string | null }>;
  worktreeRemove: (
    repoPath: string,
    worktreePath: string,
  ) => Promise<{ data: { removed: boolean; path: string } | null; error: string | null }>;
  worktreeCleanCompleted: (repoPath: string) => Promise<{
    data: { removed: string[]; errors: Array<{ path: string; error: string }> } | null;
    error: string | null;
  }>;
  worktreeForceRemove: (
    repoPath: string,
    worktreePath: string,
  ) => Promise<{
    data: { removed: boolean; path: string; branchDeleted: boolean } | null;
    error: string | null;
  }>;
  worktreeOpenVSCode: (
    worktreePath: string,
  ) => Promise<{ data: { opened: boolean } | null; error: string | null }>;
  worktreeOpenExplorer: (
    worktreePath: string,
  ) => Promise<{ data: { opened: boolean } | null; error: string | null }>;

  // Project initialization
  projectInitOverstory: (projectPath: string) => Promise<{
    data: { initialized: boolean; alreadyExisted: boolean } | null;
    error: string | null;
  }>;

  // Project configuration
  projectConfigRead: (projectPath: string) => Promise<{
    data: { config: Record<string, unknown>; path: string } | null;
    error: string | null;
  }>;
  projectConfigWrite: (
    projectPath: string,
    config: Record<string, unknown>,
  ) => Promise<{ data: { saved: boolean; path: string } | null; error: string | null }>;

  // Metrics
  metricsList: () => Promise<{ data: Metric[] | null; error: string | null }>;
  metricsCreate: (
    metric: Record<string, unknown>,
  ) => Promise<{ data: Metric | null; error: string | null }>;
  metricsGet: (id: string) => Promise<{ data: Metric | null; error: string | null }>;
  metricsBySession: (agentName: string) => Promise<{ data: Metric[] | null; error: string | null }>;
  metricsByModel: () => Promise<{ data: ModelBreakdown[] | null; error: string | null }>;
  metricsSummary: () => Promise<{ data: MetricsSummary | null; error: string | null }>;
  metricsUpdate: (
    id: string,
    updates: Record<string, unknown>,
  ) => Promise<{ data: Metric | null; error: string | null }>;
  metricsDelete: (id: string) => Promise<{ data: boolean; error: string | null }>;

  // App Logs
  appLogList: (filters?: {
    level?: string;
    agent_name?: string;
    search?: string;
    start_time?: string;
    end_time?: string;
    limit?: number;
    offset?: number;
  }) => Promise<{ data: AppLogEntry[] | null; error: string | null }>;
  appLogCreate: (entry: {
    level: string;
    message: string;
    source?: string;
    agent_name?: string;
    data?: string;
  }) => Promise<{ data: boolean; error: string | null }>;
  appLogAgents: () => Promise<{ data: string[] | null; error: string | null }>;
  appLogPurge: () => Promise<{ data: boolean; error: string | null }>;
  appLogImportNdjson: (
    ndjsonContent: string,
  ) => Promise<{ data: { imported: number } | null; error: string | null }>;

  // Events
  eventList: (filters?: { eventType?: string; agentName?: string; limit?: number }) => Promise<{
    data: Event[] | null;
    error: string | null;
  }>;
  eventCreate: (eventData: {
    event_type: string;
    agent_name?: string;
    session_id?: string;
    run_id?: string;
    tool_name?: string;
    tool_args?: string;
    tool_duration_ms?: number;
    level?: string;
    data?: string;
  }) => Promise<{ data: boolean; error: string | null }>;
  eventToolStats: () => Promise<{ data: ToolStats[] | null; error: string | null }>;
  eventBySession: (sessionId: string) => Promise<{ data: Event[] | null; error: string | null }>;
  eventPurge: () => Promise<{ data: boolean; error: string | null }>;

  // Config Profiles
  profileList: () => Promise<{ data: ConfigProfile[] | null; error: string | null }>;
  profileCreate: (profile: {
    id: string;
    name: string;
    description?: string;
    max_hierarchy_depth: number;
    max_concurrent_agents: number;
    max_agents_per_lead: number;
    default_capability: string;
    default_model: string;
  }) => Promise<{ data: ConfigProfile | null; error: string | null }>;
  profileGet: (id: string) => Promise<{ data: ConfigProfile | null; error: string | null }>;
  profileUpdate: (
    id: string,
    updates: Record<string, unknown>,
  ) => Promise<{ data: ConfigProfile | null; error: string | null }>;
  profileDelete: (id: string) => Promise<{ data: boolean; error: string | null }>;
  profileActivate: (id: string) => Promise<{ data: ConfigProfile | null; error: string | null }>;
  profileGetActive: () => Promise<{ data: ConfigProfile | null; error: string | null }>;

  // Runs
  runStart: () => Promise<{ data: Run | null; error: string | null }>;
  runGetActive: () => Promise<{ data: Run | null; error: string | null }>;
  runList: () => Promise<{ data: Run[] | null; error: string | null }>;
  runStop: (id: string) => Promise<{ data: Run | null; error: string | null }>;
  runGet: (id: string) => Promise<{ data: Run | null; error: string | null }>;

  // Agent Performance
  agentPerformanceHistory: (agentName: string) => Promise<{
    data: AgentPerformanceHistory | null;
    error: string | null;
  }>;

  settingsGet: (key: string) => Promise<{ data: unknown; error: string | null }>;
  settingsSet: (key: string, value: unknown) => Promise<{ data: boolean; error: string | null }>;
  dialogSelectFolder: () => Promise<{ data: string | null; error: string | null }>;
  claudeStatus: () => Promise<{
    data: {
      installed: boolean;
      authenticated: boolean;
      version: string | null;
      path: string | null;
    };
    error: string | null;
  }>;
  claudeDetect: (options?: { forceRefresh?: boolean }) => Promise<{
    data: { found: boolean; path: string | null; version: string | null; authenticated: boolean };
    error: string | null;
  }>;
  updateCheck: () => Promise<{ data: UpdateStatus; error: string | null }>;
  updateStatus: () => Promise<{ data: UpdateStatus; error: string | null }>;
  updateDownload: () => Promise<{ data: UpdateStatus; error: string | null }>;
  updateInstall: () => Promise<{ data: boolean; error: string | null }>;
  doctorRun: () => Promise<{ data: DoctorResult | null; error: string | null }>;
  doctorFix: (checkName: string) => Promise<{ data: DoctorFixResult | null; error: string | null }>;
  // Watchdog
  watchdogStart: () => Promise<{ data: WatchdogStatus | null; error: string | null }>;
  watchdogStop: () => Promise<{ data: WatchdogStatus | null; error: string | null }>;
  watchdogStatus: () => Promise<{ data: WatchdogStatus | null; error: string | null }>;
  watchdogConfigure: (config: Partial<WatchdogConfig>) => Promise<{
    data: WatchdogStatus | null;
    error: string | null;
  }>;
  watchdogCheckNow: () => Promise<{
    data: WatchdogCheckResult[] | null;
    error: string | null;
  }>;
  watchdogEscalationStates: () => Promise<{
    data: Record<string, unknown> | null;
    error: string | null;
  }>;
  watchdogResetEscalation: (agentId: string) => Promise<{
    data: boolean;
    error: string | null;
  }>;

  // Expertise
  expertiseList: (filters?: {
    domain?: string;
    type?: string;
    classification?: string;
    search?: string;
  }) => Promise<{ data: ExpertiseRecord[] | null; error: string | null }>;
  expertiseDomains: () => Promise<{ data: ExpertiseDomainSummary[] | null; error: string | null }>;
  expertiseCreate: (record: {
    id: string;
    domain: string;
    title: string;
    content: string;
    type: string;
    classification: string;
    agent_name?: string;
    source_file?: string;
    tags?: string;
  }) => Promise<{ data: ExpertiseRecord | null; error: string | null }>;
  expertiseGet: (id: string) => Promise<{ data: ExpertiseRecord | null; error: string | null }>;
  expertiseDelete: (id: string) => Promise<{ data: boolean; error: string | null }>;
  expertiseUpdate: (
    id: string,
    updates: Record<string, unknown>,
  ) => Promise<{ data: ExpertiseRecord | null; error: string | null }>;

  // Discovery
  discoveryList: () => Promise<{ data: DiscoveryScan[] | null; error: string | null }>;
  discoveryGet: (id: string) => Promise<{ data: DiscoveryScan | null; error: string | null }>;
  discoveryStart: (options: {
    id: string;
    categories: string[];
    project_id?: string;
  }) => Promise<{ data: DiscoveryScan | null; error: string | null }>;
  discoveryComplete: (id: string) => Promise<{ data: DiscoveryScan | null; error: string | null }>;
  discoveryDelete: (id: string) => Promise<{ data: boolean; error: string | null }>;
  discoveryUpdateProgress: (
    id: string,
    progress: Record<string, string>,
  ) => Promise<{ data: DiscoveryScan | null; error: string | null }>;
  discoveryFindings: (
    scanId: string,
    category?: string,
  ) => Promise<{ data: DiscoveryFinding[] | null; error: string | null }>;
  discoveryAddFinding: (finding: {
    id: string;
    scan_id: string;
    category: string;
    title: string;
    description: string;
    file_path?: string;
    line_number?: number;
    severity?: string;
  }) => Promise<{ data: DiscoveryFinding | null; error: string | null }>;

  // Prompts
  promptList: () => Promise<{ data: Prompt[] | null; error: string | null }>;
  promptGet: (id: string) => Promise<{ data: Prompt | null; error: string | null }>;
  promptCreate: (prompt: {
    id: string;
    name: string;
    description?: string;
    content: string;
    type: string;
    parent_id?: string;
    tags?: string;
  }) => Promise<{ data: Prompt | null; error: string | null }>;
  promptUpdate: (
    id: string,
    updates: Record<string, unknown>,
  ) => Promise<{ data: Prompt | null; error: string | null }>;
  promptDelete: (id: string) => Promise<{ data: boolean; error: string | null }>;
  promptVersionList: (
    promptId: string,
  ) => Promise<{ data: PromptVersion[] | null; error: string | null }>;
  promptVersionGet: (id: string) => Promise<{ data: PromptVersion | null; error: string | null }>;

  // Guard Rules
  guardRuleGet: (role: string) => Promise<{
    data: {
      role: string;
      display_name: string;
      tool_allowlist: string | null;
      bash_restrictions: string | null;
      file_scope: string | null;
      path_boundaries: string | null;
    } | null;
    error: string | null;
  }>;
  guardRuleUpdate: (
    role: string,
    updates: {
      tool_allowlist?: string;
      bash_restrictions?: string;
      file_scope?: string;
      path_boundaries?: string;
    },
  ) => Promise<{ data: AgentDefinition | null; error: string | null }>;
  guardPathBoundaryValidate: (
    role: string,
    filePath: string,
    worktreePath?: string,
  ) => Promise<{
    data: { allowed: boolean; reason: string; boundary?: string } | null;
    error: string | null;
  }>;
  guardCheckBash: (
    role: string,
    command: string,
  ) => Promise<{
    data: { blocked: boolean; reason: string; matched_pattern?: string } | null;
    error: string | null;
  }>;
  guardViolationList: (filters?: {
    capability?: string;
    rule_type?: string;
    severity?: string;
    acknowledged?: boolean;
    limit?: number;
  }) => Promise<{ data: GuardViolation[] | null; error: string | null }>;
  guardViolationCreate: (violation: {
    id: string;
    agent_name: string;
    capability: string;
    rule_type: string;
    violation: string;
    tool_attempted?: string;
    command_attempted?: string;
    file_attempted?: string;
    severity?: string;
  }) => Promise<{ data: GuardViolation | null; error: string | null }>;
  guardViolationAcknowledge: (id: string) => Promise<{ data: boolean; error: string | null }>;
  guardViolationPurge: () => Promise<{ data: boolean; error: string | null }>;
  guardViolationStats: () => Promise<{
    data: {
      total: number;
      unacknowledged: number;
      by_type: Record<string, number>;
      by_severity: Record<string, number>;
    } | null;
    error: string | null;
  }>;

  // Quality Gates
  qualityGateList: (
    projectId: string,
  ) => Promise<{ data: QualityGate[] | null; error: string | null }>;
  qualityGateCreate: (gate: {
    id: string;
    project_id: string;
    gate_type: string;
    name: string;
    command: string;
    enabled?: boolean;
    sort_order?: number;
  }) => Promise<{ data: QualityGate | null; error: string | null }>;
  qualityGateUpdate: (
    id: string,
    updates: Record<string, unknown>,
  ) => Promise<{ data: QualityGate | null; error: string | null }>;
  qualityGateDelete: (id: string) => Promise<{ data: boolean; error: string | null }>;
  qualityGateReorder: (
    gates: Array<{ id: string; sort_order: number }>,
  ) => Promise<{ data: boolean; error: string | null }>;
  qualityGateRun: (
    projectId: string,
    options?: { agent_name?: string; session_id?: string; cwd?: string },
  ) => Promise<{ data: QualityGateRunSummary | null; error: string | null }>;
  qualityGateResults: (filters?: {
    project_id?: string;
    agent_name?: string;
    session_id?: string;
    limit?: number;
  }) => Promise<{ data: QualityGateResult[] | null; error: string | null }>;

  // Hooks
  hookList: (filters?: { project_id?: string; hook_type?: string }) => Promise<{
    data: Hook[] | null;
    error: string | null;
  }>;
  hookGet: (id: string) => Promise<{ data: Hook | null; error: string | null }>;
  hookCreate: (hook: {
    id: string;
    project_id?: string;
    hook_type: string;
    name: string;
    description?: string;
    script_content?: string;
  }) => Promise<{ data: Hook | null; error: string | null }>;
  hookUpdate: (
    id: string,
    updates: Record<string, unknown>,
  ) => Promise<{ data: Hook | null; error: string | null }>;
  hookDelete: (id: string) => Promise<{ data: boolean; error: string | null }>;
  hookDeploy: (
    hookIds: string[],
    worktreePaths: string[],
  ) => Promise<{ data: HookDeployResult[] | null; error: string | null }>;

  // Checkpoints
  checkpointList: () => Promise<{ data: Checkpoint[] | null; error: string | null }>;
  checkpointGet: (agentName: string) => Promise<{ data: Checkpoint | null; error: string | null }>;
  checkpointSaveNow: () => Promise<{ data: { saved: number } | null; error: string | null }>;
  checkpointDelete: (agentName: string) => Promise<{ data: boolean; error: string | null }>;
  checkpointRecoveryStatus: () => Promise<{
    data: RecoveryStatus | null;
    error: string | null;
  }>;
  checkpointClearAll: () => Promise<{ data: { deleted: number } | null; error: string | null }>;

  // Notifications
  notificationSend: (options: {
    title: string;
    body: string;
    eventType: string;
    agentName?: string;
  }) => Promise<{ data: boolean; error: string | null }>;
  notificationSetEnabled: (enabled: boolean) => Promise<{ data: boolean; error: string | null }>;
  notificationIsSupported: () => Promise<{ data: boolean; error: string | null }>;
  notificationSetPreferences: (
    prefs: Record<string, boolean>,
  ) => Promise<{ data: boolean; error: string | null }>;
  notificationGetPreferences: () => Promise<{
    data: Record<string, boolean> | null;
    error: string | null;
  }>;

  // Agent Identity
  identityGet: (name: string) => Promise<{ data: AgentIdentity | null; error: string | null }>;
  identityList: () => Promise<{ data: AgentIdentity[] | null; error: string | null }>;
  identityUpsert: (identity: {
    name: string;
    capability: string;
    expertise_domains?: string;
    recent_tasks?: string;
  }) => Promise<{ data: AgentIdentity | null; error: string | null }>;
  identitySessions: (
    agentName: string,
  ) => Promise<{ data: Session[] | null; error: string | null }>;
  identityUpdateExpertise: (
    name: string,
    domains: string,
  ) => Promise<{ data: AgentIdentity | null; error: string | null }>;

  onAgentUpdate: (callback: (data: unknown) => void) => void;
  onAgentOutput: (callback: (data: { agentId: string; data: string }) => void) => void;
  onAgentParsedEvent: (
    callback: (data: { agentId: string; event: Record<string, unknown> }) => void,
  ) => void;
  onMailReceived: (callback: (data: unknown) => void) => void;
  onMergeUpdate: (callback: (data: unknown) => void) => void;
  onUpdateStatus: (callback: (data: UpdateStatus) => void) => void;
  onUpdateDownloadProgress: (
    callback: (data: {
      percent: number;
      transferred: number;
      total: number;
      bytesPerSecond: number;
    }) => void,
  ) => void;
  onUpdateDownloaded: (
    callback: (data: { version: string; releaseNotes: string | null }) => void,
  ) => void;
  onUpdateError: (callback: (data: { message: string }) => void) => void;
  onWatchdogUpdate: (
    callback: (data: {
      checkCount: number;
      timestamp: string;
      results: WatchdogCheckResult[];
    }) => void,
  ) => void;
  // Notification navigation events (main -> renderer)
  onNotificationNavigateToAgent: (callback: (data: { agentName: string }) => void) => void;
  // Agent Instruction Files
  agentDefInstructionRead: (role: string) => Promise<{
    data: { role: string; content: string; filePath: string; isDefault?: boolean } | null;
    error: string | null;
  }>;
  agentDefInstructionWrite: (
    role: string,
    content: string,
  ) => Promise<{
    data: { role: string; filePath: string; written: boolean } | null;
    error: string | null;
  }>;

  // Session Handoffs
  sessionHandoffCreate: (handoff: {
    from_session: string;
    to_session: string;
    reason?: string;
  }) => Promise<{ data: SessionHandoff | null; error: string | null }>;
  sessionHandoffList: () => Promise<{ data: SessionHandoff[] | null; error: string | null }>;
  sessionHandoffGet: (id: string) => Promise<{ data: SessionHandoff | null; error: string | null }>;
  sessionHandoffBySession: (
    sessionId: string,
  ) => Promise<{ data: SessionHandoff[] | null; error: string | null }>;

  // Window management
  windowSetTitle: (title: string) => Promise<{ data: boolean; error: string | null }>;

  // Debug Shell Terminal
  debugShellSpawn: () => Promise<{
    data: { pid: number; alreadyRunning: boolean } | null;
    error: string | null;
  }>;
  debugShellWrite: (data: string) => Promise<{ data: boolean; error: string | null }>;
  debugShellResize: (
    cols: number,
    rows: number,
  ) => Promise<{ data: boolean; error: string | null }>;
  debugShellOutput: () => Promise<{ data: string[] | null; error: string | null }>;
  debugShellKill: () => Promise<{ data: boolean; error: string | null }>;
  onDebugShellOutput: (callback: (data: { data: string }) => void) => void;

  // Orphaned process detection
  orphanDetect: () => Promise<{ data: OrphanedProcess[] | null; error: string | null }>;
  orphanKill: (
    sessionId: string,
    pid: number,
  ) => Promise<{ data: { killed: boolean; sessionId: string } | null; error: string | null }>;
  orphanReconnect: (sessionId: string) => Promise<{
    data: {
      reconnected: boolean;
      sessionId?: string;
      agentName?: string;
      pid?: number;
      reason?: string;
    } | null;
    error: string | null;
  }>;
  orphanDismiss: (sessionId: string) => Promise<{
    data: { dismissed: boolean; sessionId: string } | null;
    error: string | null;
  }>;

  removeAllListeners: (channel: string) => void;
}

// Orphaned process types
export interface OrphanedProcess {
  sessionId: string;
  agentName: string;
  capability: string;
  model: string;
  pid: number;
  state: string;
  processAlive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Watchdog types
export type EscalationLevel = 0 | 1 | 2 | 3 | 4;

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

export interface WatchdogConfig {
  intervalMs: number;
  staleThresholdMs: number;
  zombieThresholdMs: number;
  enabled: boolean;
}

export interface WatchdogStatus {
  running: boolean;
  config: WatchdogConfig;
  checkCount: number;
  lastCheckAt: string | null;
  trackedAgents: number;
}

export interface SessionHandoff {
  id: string;
  from_session: string;
  to_session: string;
  reason: string | null;
  created_at: string;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
