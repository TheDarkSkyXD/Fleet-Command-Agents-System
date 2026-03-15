import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Health & Database
  healthCheck: () => ipcRenderer.invoke('health:check'),
  dbStatus: () => ipcRenderer.invoke('db:status'),

  // Agents
  agentList: () => ipcRenderer.invoke('agent:list'),
  agentDetail: (id: string) => ipcRenderer.invoke('agent:detail', id),
  agentSpawn: (options: Record<string, unknown>) => ipcRenderer.invoke('agent:spawn', options),
  agentStop: (name: string) => ipcRenderer.invoke('agent:stop', name),
  agentStopAll: () => ipcRenderer.invoke('agent:stop-all'),
  agentNudge: (name: string) => ipcRenderer.invoke('agent:nudge', name),
  agentResume: (options: Record<string, unknown>) => ipcRenderer.invoke('agent:resume', options),

  // Scope overlap detection
  scopeCheckOverlap: (filePaths: string[], excludeSessionId?: string) =>
    ipcRenderer.invoke('scope:checkOverlap', filePaths, excludeSessionId),

  // Mail
  mailList: (filters?: Record<string, unknown>) => ipcRenderer.invoke('mail:list', filters),
  mailUnreadCount: () => ipcRenderer.invoke('mail:unread-count'),
  mailSend: (message: Record<string, unknown>) => ipcRenderer.invoke('mail:send', message),
  mailMarkRead: (id: string) => ipcRenderer.invoke('mail:read', id),
  mailCheck: (agentId: string, agentName: string) =>
    ipcRenderer.invoke('mail:check', agentId, agentName),
  mailMarkAllRead: (agentName?: string) => ipcRenderer.invoke('mail:mark-all-read', agentName),
  mailPurge: (options?: Record<string, unknown>) => ipcRenderer.invoke('mail:purge', options),
  mailThread: (threadId: string) => ipcRenderer.invoke('mail:thread', threadId),

  // Merge
  mergeQueue: () => ipcRenderer.invoke('merge:queue'),
  mergeEnqueue: (entry: {
    branch_name: string;
    task_id?: string;
    agent_name?: string;
    files_modified?: string[];
    depends_on?: number[];
  }) => ipcRenderer.invoke('merge:enqueue', entry),
  mergeNext: () => ipcRenderer.invoke('merge:next'),
  mergeExecute: (id: number, repoPath?: string, targetBranch?: string) =>
    ipcRenderer.invoke('merge:execute', id, repoPath, targetBranch),
  mergeComplete: (id: number, resolvedTier: string) =>
    ipcRenderer.invoke('merge:complete', id, resolvedTier),
  mergeFail: (id: number) => ipcRenderer.invoke('merge:fail', id),
  mergeConflict: (id: number) => ipcRenderer.invoke('merge:conflict', id),
  mergePreview: (id: number, repoPath?: string) =>
    ipcRenderer.invoke('merge:preview', id, repoPath),
  mergeHistory: () => ipcRenderer.invoke('merge:history'),
  mergeDiff: (id: number, repoPath?: string) => ipcRenderer.invoke('merge:diff', id, repoPath),
  mergeRemove: (id: number) => ipcRenderer.invoke('merge:remove', id),
  mergeGetTargetBranch: () => ipcRenderer.invoke('merge:get-target-branch'),
  mergeSetTargetBranch: (branch: string) => ipcRenderer.invoke('merge:set-target-branch', branch),
  mergeAutoResolve: (id: number, repoPath?: string, targetBranch?: string) =>
    ipcRenderer.invoke('merge:auto-resolve', id, repoPath, targetBranch),
  mergeAiResolve: (id: number, repoPath?: string, targetBranch?: string) =>
    ipcRenderer.invoke('merge:ai-resolve', id, repoPath, targetBranch),
  mergeReimagine: (id: number, repoPath?: string, targetBranch?: string) =>
    ipcRenderer.invoke('merge:reimagine', id, repoPath, targetBranch),
  mergeRollback: (id: number, repoPath?: string) =>
    ipcRenderer.invoke('merge:rollback', id, repoPath),

  // Issues
  issueList: (filters?: { status?: string; priority?: string; type?: string }) =>
    ipcRenderer.invoke('issue:list', filters),
  issueCreate: (issue: {
    id: string;
    title: string;
    description?: string;
    type: string;
    priority: string;
  }) => ipcRenderer.invoke('issue:create', issue),
  issueGet: (id: string) => ipcRenderer.invoke('issue:get', id),
  issueUpdate: (id: string, updates: Record<string, unknown>) =>
    ipcRenderer.invoke('issue:update', id, updates),
  issueDelete: (id: string) => ipcRenderer.invoke('issue:delete', id),
  issueClaim: (id: string, agentName: string) => ipcRenderer.invoke('issue:claim', id, agentName),
  issueSetDependencies: (id: string, dependencyIds: string[]) =>
    ipcRenderer.invoke('issue:set-dependencies', id, dependencyIds),
  issueReadyQueue: () => ipcRenderer.invoke('issue:ready-queue'),
  issueBlocking: (id: string) => ipcRenderer.invoke('issue:blocking', id),
  issueByAgent: (agentName: string) => ipcRenderer.invoke('issue:by-agent', agentName),

  // Task Groups
  taskGroupList: () => ipcRenderer.invoke('taskGroup:list'),
  taskGroupCreate: (group: { id: string; name: string }) =>
    ipcRenderer.invoke('taskGroup:create', group),
  taskGroupGet: (id: string) => ipcRenderer.invoke('taskGroup:get', id),
  taskGroupDelete: (id: string) => ipcRenderer.invoke('taskGroup:delete', id),
  taskGroupAddIssue: (groupId: string, issueId: string) =>
    ipcRenderer.invoke('taskGroup:addIssue', groupId, issueId),
  taskGroupRemoveIssue: (groupId: string, issueId: string) =>
    ipcRenderer.invoke('taskGroup:removeIssue', groupId, issueId),
  taskGroupGetProgress: (groupId: string) => ipcRenderer.invoke('taskGroup:getProgress', groupId),
  taskGroupCheckAutoClose: (issueId: string) =>
    ipcRenderer.invoke('taskGroup:checkAutoClose', issueId),

  // Config Profiles
  profileList: () => ipcRenderer.invoke('profile:list'),
  profileCreate: (profile: {
    id: string;
    name: string;
    description?: string;
    max_hierarchy_depth: number;
    max_concurrent_agents: number;
    max_agents_per_lead: number;
    default_capability: string;
    default_model: string;
  }) => ipcRenderer.invoke('profile:create', profile),
  profileGet: (id: string) => ipcRenderer.invoke('profile:get', id),
  profileUpdate: (id: string, updates: Record<string, unknown>) =>
    ipcRenderer.invoke('profile:update', id, updates),
  profileDelete: (id: string) => ipcRenderer.invoke('profile:delete', id),
  profileActivate: (id: string) => ipcRenderer.invoke('profile:activate', id),
  profileGetActive: () => ipcRenderer.invoke('profile:get-active'),

  // Settings
  settingsGet: (key: string) => ipcRenderer.invoke('settings:get', key),
  settingsSet: (key: string, value: unknown) => ipcRenderer.invoke('settings:set', key, value),

  // Claude CLI
  claudeStatus: () => ipcRenderer.invoke('claude:status'),
  claudeDetect: (options?: { forceRefresh?: boolean }) =>
    ipcRenderer.invoke('claude:detect', options),

  // Agent Definitions
  agentDefList: () => ipcRenderer.invoke('agentDef:list'),
  agentDefGet: (role: string) => ipcRenderer.invoke('agentDef:get', role),
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
  ) => ipcRenderer.invoke('agentDef:import', definitions),
  agentDefExport: (roles?: string[]) => ipcRenderer.invoke('agentDef:export', roles),
  agentDefCreate: (definition: {
    role: string;
    display_name: string;
    description: string;
    capabilities: string;
    default_model: string;
    tool_allowlist?: string;
    bash_restrictions?: string;
    file_scope?: string;
  }) => ipcRenderer.invoke('agentDef:create', definition),
  agentDefDelete: (role: string) => ipcRenderer.invoke('agentDef:delete', role),
  agentDefResetDefaults: () => ipcRenderer.invoke('agentDef:reset-defaults'),
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
  ) => ipcRenderer.invoke('agentDef:update', role, updates),

  // Coordinator
  coordinatorStart: (options?: { prompt?: string; run_id?: string }) =>
    ipcRenderer.invoke('coordinator:start', options),
  coordinatorStop: () => ipcRenderer.invoke('coordinator:stop'),
  coordinatorStatus: () => ipcRenderer.invoke('coordinator:status'),
  coordinatorDispatch: (options: {
    objective: string;
    lead_name?: string;
    model?: string;
    worktree_path?: string;
    branch_name?: string;
    task_id?: string;
    file_scope?: string;
  }) => ipcRenderer.invoke('coordinator:dispatch', options),
  coordinatorAsk: (options: {
    subject: string;
    body: string;
    from?: string;
    timeout_ms?: number;
  }) => ipcRenderer.invoke('coordinator:ask', options),
  coordinatorDispatchedLeads: () => ipcRenderer.invoke('coordinator:dispatched-leads'),
  coordinatorPollMail: () => ipcRenderer.invoke('coordinator:poll-mail'),
  coordinatorDecompose: (options?: { scope?: string; coordinatorSessionId?: string }) =>
    ipcRenderer.invoke('coordinator:decompose', options),
  coordinatorWorkStreams: () => ipcRenderer.invoke('coordinator:workStreams'),
  coordinatorActivityLog: (limit?: number) => ipcRenderer.invoke('coordinator:activity-log', limit),

  // Operator dispatch messages
  operatorDispatch: (message: string) => ipcRenderer.invoke('operator:dispatch', message),
  operatorHistory: (limit?: number) => ipcRenderer.invoke('operator:history', limit),

  // Agent process management (node-pty)
  agentOutput: (id: string) => ipcRenderer.invoke('agent:output', id),
  agentWrite: (id: string, data: string) => ipcRenderer.invoke('agent:write', id, data),
  agentResize: (id: string, cols: number, rows: number) =>
    ipcRenderer.invoke('agent:resize', id, cols, rows),
  agentProcessInfo: (id: string) => ipcRenderer.invoke('agent:process-info', id),
  agentRunningList: () => ipcRenderer.invoke('agent:running-list'),
  agentChildren: (agentName: string) => ipcRenderer.invoke('agent:children', agentName),
  agentHierarchy: (agentName?: string) => ipcRenderer.invoke('agent:hierarchy', agentName),

  // Projects
  projectList: () => ipcRenderer.invoke('project:list'),
  projectCreate: (project: { id: string; name: string; path: string; description?: string }) =>
    ipcRenderer.invoke('project:create', project),
  projectGet: (id: string) => ipcRenderer.invoke('project:get', id),
  projectUpdate: (id: string, updates: Record<string, unknown>) =>
    ipcRenderer.invoke('project:update', id, updates),
  projectDelete: (id: string) => ipcRenderer.invoke('project:delete', id),
  projectSwitch: (id: string) => ipcRenderer.invoke('project:switch', id),
  projectGetActive: () => ipcRenderer.invoke('project:get-active'),
  projectFileTree: (rootPath: string, maxDepth?: number) =>
    ipcRenderer.invoke('project:file-tree', rootPath, maxDepth),

  // Worktrees
  worktreeList: (repoPath: string) => ipcRenderer.invoke('worktree:list', repoPath),
  worktreeRemove: (repoPath: string, worktreePath: string) =>
    ipcRenderer.invoke('worktree:remove', repoPath, worktreePath),
  worktreeCleanCompleted: (repoPath: string) =>
    ipcRenderer.invoke('worktree:clean-completed', repoPath),
  worktreeForceRemove: (repoPath: string, worktreePath: string) =>
    ipcRenderer.invoke('worktree:force-remove', repoPath, worktreePath),
  worktreeOpenVSCode: (worktreePath: string) =>
    ipcRenderer.invoke('worktree:open-vscode', worktreePath),
  worktreeOpenExplorer: (worktreePath: string) =>
    ipcRenderer.invoke('worktree:open-explorer', worktreePath),

  // Project initialization
  projectInitOverstory: (projectPath: string) =>
    ipcRenderer.invoke('project:init-overstory', projectPath),

  // Project configuration
  projectConfigRead: (projectPath: string) =>
    ipcRenderer.invoke('project:config-read', projectPath),
  projectConfigWrite: (projectPath: string, config: Record<string, unknown>) =>
    ipcRenderer.invoke('project:config-write', projectPath, config),

  // Metrics
  metricsList: () => ipcRenderer.invoke('metrics:list'),
  metricsCreate: (metric: Record<string, unknown>) => ipcRenderer.invoke('metrics:create', metric),
  metricsGet: (id: string) => ipcRenderer.invoke('metrics:get', id),
  metricsBySession: (agentName: string) => ipcRenderer.invoke('metrics:by-session', agentName),
  metricsByModel: () => ipcRenderer.invoke('metrics:by-model'),
  metricsSummary: () => ipcRenderer.invoke('metrics:summary'),
  metricsUpdate: (id: string, updates: Record<string, unknown>) =>
    ipcRenderer.invoke('metrics:update', id, updates),
  metricsDelete: (id: string) => ipcRenderer.invoke('metrics:delete', id),
  metricsByCapability: () => ipcRenderer.invoke('metrics:by-capability'),
  metricsExport: (format: 'csv' | 'json') => ipcRenderer.invoke('metrics:export', format),

  // Events
  eventList: (filters?: { eventType?: string; agentName?: string; limit?: number }) =>
    ipcRenderer.invoke('event:list', filters),
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
  }) => ipcRenderer.invoke('event:create', eventData),
  eventToolStats: () => ipcRenderer.invoke('event:tool-stats'),
  eventBySession: (sessionId: string) => ipcRenderer.invoke('event:by-session', sessionId),
  eventPurge: () => ipcRenderer.invoke('event:purge'),

  // Runs
  runStart: () => ipcRenderer.invoke('run:start'),
  runGetActive: () => ipcRenderer.invoke('run:get-active'),
  runList: () => ipcRenderer.invoke('run:list'),
  runStop: (id: string) => ipcRenderer.invoke('run:stop', id),
  runGet: (id: string) => ipcRenderer.invoke('run:get', id),

  // Agent Performance
  agentPerformanceHistory: (agentName: string) =>
    ipcRenderer.invoke('agent:performance-history', agentName),

  // System - Auto Update
  updateCheck: () => ipcRenderer.invoke('update:check'),
  updateStatus: () => ipcRenderer.invoke('update:status'),
  updateDownload: () => ipcRenderer.invoke('update:download'),
  updateInstall: () => ipcRenderer.invoke('update:install'),
  doctorRun: () => ipcRenderer.invoke('doctor:run'),
  doctorFix: (checkName: string) => ipcRenderer.invoke('doctor:fix', checkName),

  // Watchdog
  watchdogStart: () => ipcRenderer.invoke('watchdog:start'),
  watchdogStop: () => ipcRenderer.invoke('watchdog:stop'),
  watchdogStatus: () => ipcRenderer.invoke('watchdog:status'),
  watchdogConfigure: (config: {
    intervalMs?: number;
    staleThresholdMs?: number;
    zombieThresholdMs?: number;
    enabled?: boolean;
  }) => ipcRenderer.invoke('watchdog:configure', config),
  watchdogCheckNow: () => ipcRenderer.invoke('watchdog:check-now'),
  watchdogEscalationStates: () => ipcRenderer.invoke('watchdog:escalation-states'),
  watchdogResetEscalation: (agentId: string) =>
    ipcRenderer.invoke('watchdog:reset-escalation', agentId),
  // Watchdog Tier 1: AI Triage
  watchdogTriage: (agentId: string, options?: { lineCount?: number; timeoutMs?: number }) =>
    ipcRenderer.invoke('watchdog:triage', agentId, options),
  watchdogTriageConfig: () => ipcRenderer.invoke('watchdog:triage-config'),
  watchdogTriageConfigure: (updates: { lineCount?: number; timeoutMs?: number }) =>
    ipcRenderer.invoke('watchdog:triage-configure', updates),
  // Watchdog Tier 2: Monitor Patrol
  watchdogPatrolStart: (intervalMs?: number) =>
    ipcRenderer.invoke('watchdog:patrol-start', intervalMs),
  watchdogPatrolStop: () => ipcRenderer.invoke('watchdog:patrol-stop'),
  watchdogPatrolStatus: () => ipcRenderer.invoke('watchdog:patrol-status'),
  watchdogPatrolNow: () => ipcRenderer.invoke('watchdog:patrol-now'),
  watchdogPatrolHistory: (limit?: number) => ipcRenderer.invoke('watchdog:patrol-history', limit),

  // Events (renderer -> main)
  onAgentUpdate: (callback: (data: unknown) => void) =>
    ipcRenderer.on('agent:update', (_event, data) => callback(data)),
  onAgentOutput: (callback: (data: { agentId: string; data: string }) => void) =>
    ipcRenderer.on('agent:output', (_event, data) => callback(data)),
  onAgentParsedEvent: (
    callback: (data: { agentId: string; event: Record<string, unknown> }) => void,
  ) => ipcRenderer.on('agent:parsed-event', (_event, data) => callback(data)),
  onMailReceived: (callback: (data: unknown) => void) =>
    ipcRenderer.on('mail:received', (_event, data) => callback(data)),
  onMergeUpdate: (callback: (data: unknown) => void) =>
    ipcRenderer.on('merge:update', (_event, data) => callback(data)),

  // Update events (main -> renderer)
  onUpdateStatus: (callback: (data: unknown) => void) =>
    ipcRenderer.on('update:status', (_event, data) => callback(data)),
  onUpdateDownloadProgress: (
    callback: (data: {
      percent: number;
      transferred: number;
      total: number;
      bytesPerSecond: number;
    }) => void,
  ) => ipcRenderer.on('update:download-progress', (_event, data) => callback(data)),
  onUpdateDownloaded: (
    callback: (data: { version: string; releaseNotes: string | null }) => void,
  ) => ipcRenderer.on('update:downloaded', (_event, data) => callback(data)),
  onUpdateError: (callback: (data: { message: string }) => void) =>
    ipcRenderer.on('update:error', (_event, data) => callback(data)),

  // Watchdog events (main -> renderer)
  onWatchdogUpdate: (
    callback: (data: {
      checkCount: number;
      timestamp: string;
      results: Array<{
        agentId: string;
        agentName: string;
        pidAlive: boolean;
        ptyRunning: boolean;
        stalledDurationMs: number | null;
        escalationLevel: number;
        action: string;
        timestamp: string;
      }>;
    }) => void,
  ) => ipcRenderer.on('watchdog:update', (_event, data) => callback(data)),
  onWatchdogTriageResult: (callback: (data: unknown) => void) =>
    ipcRenderer.on('watchdog:triage-result', (_event, data) => callback(data)),
  onWatchdogPatrolResult: (callback: (data: unknown) => void) =>
    ipcRenderer.on('watchdog:patrol-result', (_event, data) => callback(data)),

  // Notification navigation events (main -> renderer)
  onNotificationNavigateToAgent: (callback: (data: { agentName: string }) => void) =>
    ipcRenderer.on('notification:navigate-to-agent', (_event, data) => callback(data)),

  // Notification event broadcast (main -> renderer, for in-app toasts)
  onNotificationEvent: (
    callback: (data: {
      title: string;
      body: string;
      eventType: string;
      agentName: string | null;
      timestamp: string;
    }) => void,
  ) => ipcRenderer.on('notification:event', (_event, data) => callback(data)),

  // Notification history
  notificationHistory: (filters?: {
    event_type?: string;
    agent_name?: string;
    limit?: number;
    offset?: number;
  }) => ipcRenderer.invoke('notification:history', filters),
  notificationClearHistory: () => ipcRenderer.invoke('notification:clear-history'),

  // App Logs
  appLogList: (filters?: {
    level?: string;
    agent_name?: string;
    search?: string;
    start_time?: string;
    end_time?: string;
    limit?: number;
    offset?: number;
  }) => ipcRenderer.invoke('appLog:list', filters),
  appLogCreate: (entry: {
    level: string;
    message: string;
    source?: string;
    agent_name?: string;
    data?: string;
  }) => ipcRenderer.invoke('appLog:create', entry),
  appLogAgents: () => ipcRenderer.invoke('appLog:agents'),
  appLogPurge: () => ipcRenderer.invoke('appLog:purge'),
  appLogImportNdjson: (ndjsonContent: string) =>
    ipcRenderer.invoke('appLog:import-ndjson', ndjsonContent),

  // Prompts
  promptList: () => ipcRenderer.invoke('prompt:list'),
  promptGet: (id: string) => ipcRenderer.invoke('prompt:get', id),
  promptCreate: (prompt: {
    id: string;
    name: string;
    description?: string;
    content: string;
    type: string;
    parent_id?: string;
    tags?: string;
  }) => ipcRenderer.invoke('prompt:create', prompt),
  promptUpdate: (id: string, updates: Record<string, unknown>) =>
    ipcRenderer.invoke('prompt:update', id, updates),
  promptDelete: (id: string) => ipcRenderer.invoke('prompt:delete', id),
  promptVersionList: (promptId: string) => ipcRenderer.invoke('prompt:version-list', promptId),
  promptVersionGet: (id: string) => ipcRenderer.invoke('prompt:version-get', id),

  // Guard Rules
  guardRuleGet: (role: string) => ipcRenderer.invoke('guardRule:get', role),
  guardRuleUpdate: (
    role: string,
    updates: {
      tool_allowlist?: string;
      bash_restrictions?: string;
      file_scope?: string;
      path_boundaries?: string;
    },
  ) => ipcRenderer.invoke('guardRule:update', role, updates),
  guardPathBoundaryValidate: (role: string, filePath: string, worktreePath?: string) =>
    ipcRenderer.invoke('guardRule:path-boundary-validate', role, filePath, worktreePath),
  guardCheckBash: (role: string, command: string) =>
    ipcRenderer.invoke('guardRule:check-bash', role, command),
  guardViolationList: (filters?: {
    capability?: string;
    rule_type?: string;
    severity?: string;
    acknowledged?: boolean;
    limit?: number;
  }) => ipcRenderer.invoke('guardViolation:list', filters),
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
  }) => ipcRenderer.invoke('guardViolation:create', violation),
  guardViolationAcknowledge: (id: string) => ipcRenderer.invoke('guardViolation:acknowledge', id),
  guardViolationPurge: () => ipcRenderer.invoke('guardViolation:purge'),
  guardViolationStats: () => ipcRenderer.invoke('guardViolation:stats'),

  // Discovery
  discoveryList: () => ipcRenderer.invoke('discovery:list'),
  discoveryGet: (id: string) => ipcRenderer.invoke('discovery:get', id),
  discoveryStart: (options: { id: string; categories: string[]; project_id?: string }) =>
    ipcRenderer.invoke('discovery:start', options),
  discoveryComplete: (id: string) => ipcRenderer.invoke('discovery:complete', id),
  discoveryDelete: (id: string) => ipcRenderer.invoke('discovery:delete', id),
  discoveryUpdateProgress: (id: string, progress: Record<string, string>) =>
    ipcRenderer.invoke('discovery:update-progress', id, progress),
  discoveryFindings: (scanId: string, category?: string) =>
    ipcRenderer.invoke('discovery:findings', scanId, category),
  discoveryAddFinding: (finding: {
    id: string;
    scan_id: string;
    category: string;
    title: string;
    description: string;
    file_path?: string;
    line_number?: number;
    severity?: string;
  }) => ipcRenderer.invoke('discovery:add-finding', finding),

  // Expertise
  expertiseList: (filters?: {
    domain?: string;
    type?: string;
    classification?: string;
    search?: string;
  }) => ipcRenderer.invoke('expertise:list', filters),
  expertiseDomains: () => ipcRenderer.invoke('expertise:domains'),
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
  }) => ipcRenderer.invoke('expertise:create', record),
  expertiseGet: (id: string) => ipcRenderer.invoke('expertise:get', id),
  expertiseDelete: (id: string) => ipcRenderer.invoke('expertise:delete', id),
  expertiseUpdate: (id: string, updates: Record<string, unknown>) =>
    ipcRenderer.invoke('expertise:update', id, updates),

  // Checkpoints
  checkpointList: () => ipcRenderer.invoke('checkpoint:list'),
  checkpointGet: (agentName: string) => ipcRenderer.invoke('checkpoint:get', agentName),
  checkpointSaveNow: () => ipcRenderer.invoke('checkpoint:save-now'),
  checkpointDelete: (agentName: string) => ipcRenderer.invoke('checkpoint:delete', agentName),
  checkpointRecoveryStatus: () => ipcRenderer.invoke('checkpoint:recovery-status'),
  checkpointClearAll: () => ipcRenderer.invoke('checkpoint:clear-all'),

  // Notifications
  notificationSend: (options: {
    title: string;
    body: string;
    eventType: string;
    agentName?: string;
  }) => ipcRenderer.invoke('notification:send', options),
  notificationSetEnabled: (enabled: boolean) =>
    ipcRenderer.invoke('notification:set-enabled', enabled),
  notificationIsSupported: () => ipcRenderer.invoke('notification:is-supported'),
  notificationSetPreferences: (prefs: Record<string, boolean>) =>
    ipcRenderer.invoke('notification:set-preferences', prefs),
  notificationGetPreferences: () => ipcRenderer.invoke('notification:get-preferences'),

  // Agent Identity
  identityGet: (name: string) => ipcRenderer.invoke('identity:get', name),
  identityList: () => ipcRenderer.invoke('identity:list'),
  identityUpsert: (identity: {
    name: string;
    capability: string;
    expertise_domains?: string;
    recent_tasks?: string;
  }) => ipcRenderer.invoke('identity:upsert', identity),
  identitySessions: (agentName: string) => ipcRenderer.invoke('identity:sessions', agentName),
  identityUpdateExpertise: (name: string, domains: string) =>
    ipcRenderer.invoke('identity:update-expertise', name, domains),

  // Quality Gates
  qualityGateList: (projectId: string) => ipcRenderer.invoke('qualityGate:list', projectId),
  qualityGateCreate: (gate: {
    id: string;
    project_id: string;
    gate_type: string;
    name: string;
    command: string;
    enabled?: boolean;
    sort_order?: number;
  }) => ipcRenderer.invoke('qualityGate:create', gate),
  qualityGateUpdate: (id: string, updates: Record<string, unknown>) =>
    ipcRenderer.invoke('qualityGate:update', id, updates),
  qualityGateDelete: (id: string) => ipcRenderer.invoke('qualityGate:delete', id),
  qualityGateReorder: (gates: Array<{ id: string; sort_order: number }>) =>
    ipcRenderer.invoke('qualityGate:reorder', gates),
  qualityGateRun: (
    projectId: string,
    options?: { agent_name?: string; session_id?: string; cwd?: string },
  ) => ipcRenderer.invoke('qualityGate:run', projectId, options),
  qualityGateResults: (filters?: {
    project_id?: string;
    agent_name?: string;
    session_id?: string;
    limit?: number;
  }) => ipcRenderer.invoke('qualityGate:results', filters),

  // Hooks
  hookList: (filters?: { project_id?: string; hook_type?: string }) =>
    ipcRenderer.invoke('hook:list', filters),
  hookGet: (id: string) => ipcRenderer.invoke('hook:get', id),
  hookCreate: (hook: {
    id: string;
    project_id?: string;
    hook_type: string;
    name: string;
    description?: string;
    script_content?: string;
  }) => ipcRenderer.invoke('hook:create', hook),
  hookUpdate: (id: string, updates: Record<string, unknown>) =>
    ipcRenderer.invoke('hook:update', id, updates),
  hookDelete: (id: string) => ipcRenderer.invoke('hook:delete', id),
  hookDeploy: (hookIds: string[], worktreePaths: string[]) =>
    ipcRenderer.invoke('hook:deploy', hookIds, worktreePaths),

  // Hook Events
  hookEventList: (filters?: {
    hook_id?: string;
    hook_type?: string;
    status?: string;
    limit?: number;
  }) => ipcRenderer.invoke('hookEvent:list', filters),
  hookEventCreate: (event: {
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
  }) => ipcRenderer.invoke('hookEvent:create', event),

  // Nuclear Cleanup
  cleanupExecute: (options?: { target?: string }) => ipcRenderer.invoke('cleanup:execute', options),

  // Dialog
  dialogSelectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),

  // Agent Instruction Files
  agentDefInstructionRead: (role: string) => ipcRenderer.invoke('agentDef:instruction-read', role),
  agentDefInstructionWrite: (role: string, content: string) =>
    ipcRenderer.invoke('agentDef:instruction-write', role, content),

  // Session Handoffs
  sessionHandoffCreate: (handoff: {
    from_session: string;
    to_session: string;
    reason?: string;
  }) => ipcRenderer.invoke('session:handoff-create', handoff),
  sessionHandoffList: () => ipcRenderer.invoke('session:handoff-list'),
  sessionHandoffGet: (id: string) => ipcRenderer.invoke('session:handoff-get', id),
  sessionHandoffBySession: (sessionId: string) =>
    ipcRenderer.invoke('session:handoff-by-session', sessionId),

  // Window management
  windowSetTitle: (title: string) => ipcRenderer.invoke('window:setTitle', title),

  // Debug Shell Terminal
  debugShellSpawn: () => ipcRenderer.invoke('debug:shell-spawn'),
  debugShellWrite: (data: string) => ipcRenderer.invoke('debug:shell-write', data),
  debugShellResize: (cols: number, rows: number) =>
    ipcRenderer.invoke('debug:shell-resize', cols, rows),
  debugShellOutput: () => ipcRenderer.invoke('debug:shell-output'),
  debugShellKill: () => ipcRenderer.invoke('debug:shell-kill'),
  onDebugShellOutput: (callback: (data: { data: string }) => void) =>
    ipcRenderer.on('debug:shell-output', (_event, data) => callback(data)),

  // Orphaned process detection
  orphanDetect: () => ipcRenderer.invoke('orphan:detect'),
  orphanKill: (sessionId: string, pid: number) => ipcRenderer.invoke('orphan:kill', sessionId, pid),
  orphanReconnect: (sessionId: string) => ipcRenderer.invoke('orphan:reconnect', sessionId),
  orphanDismiss: (sessionId: string) => ipcRenderer.invoke('orphan:dismiss', sessionId),

  // Runtime registry
  runtimeList: () => ipcRenderer.invoke('runtime:list'),
  runtimeGetDefault: () => ipcRenderer.invoke('runtime:get-default'),
  runtimeSetDefault: (runtimeId: string) => ipcRenderer.invoke('runtime:set-default', runtimeId),
  runtimeResolveModel: (params: {
    runtimeId: string;
    capability: string;
    explicitModel?: string;
    capabilityConfigModel?: string;
  }) => ipcRenderer.invoke('runtime:resolve-model', params),

  // Cleanup listeners
  removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel),
});
