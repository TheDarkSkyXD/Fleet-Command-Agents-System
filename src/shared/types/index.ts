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
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface Run {
  id: string;
  status: RunStatus;
  coordinator_session_id: string | null;
  agent_count: number;
  started_at: string;
  completed_at: string | null;
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

export interface MergeQueueEntry {
  id: number;
  branch_name: string;
  task_id: string | null;
  agent_name: string | null;
  files_modified: string | null;
  status: MergeStatus;
  resolved_tier: MergeResolutionTier | null;
  enqueued_at: string;
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
  created_at: string;
  updated_at: string;
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
  mailList: (
    filters?: Record<string, unknown>,
  ) => Promise<{ data: Message[] | null; error: string | null }>;
  mailUnreadCount: () => Promise<{ data: number; error: string | null }>;
  mailSend: (message: Record<string, unknown>) => Promise<{ data: unknown; error: string | null }>;
  mailMarkRead: (id: string) => Promise<{ data: unknown; error: string | null }>;
  mailPurge: (
    options?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: string | null }>;
  mergeQueue: () => Promise<{ data: MergeQueueEntry[] | null; error: string | null }>;
  mergeEnqueue: (entry: {
    branch_name: string;
    task_id?: string;
    agent_name?: string;
    files_modified?: string[];
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
  mergeRemove: (id: number) => Promise<{ data: boolean; error: string | null }>;
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

  // Worktrees
  worktreeList: (repoPath: string) => Promise<{ data: Worktree[] | null; error: string | null }>;

  settingsGet: (key: string) => Promise<{ data: unknown; error: string | null }>;
  settingsSet: (key: string, value: unknown) => Promise<{ data: boolean; error: string | null }>;
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
  updateCheck: () => Promise<{ data: unknown; error: string | null }>;
  doctorRun: () => Promise<{ data: unknown; error: string | null }>;
  onAgentUpdate: (callback: (data: unknown) => void) => void;
  onAgentOutput: (callback: (data: { agentId: string; data: string }) => void) => void;
  onMailReceived: (callback: (data: unknown) => void) => void;
  onMergeUpdate: (callback: (data: unknown) => void) => void;
  removeAllListeners: (channel: string) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
