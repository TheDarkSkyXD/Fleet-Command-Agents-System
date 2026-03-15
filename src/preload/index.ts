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

  // Mail
  mailList: (filters?: Record<string, unknown>) => ipcRenderer.invoke('mail:list', filters),
  mailUnreadCount: () => ipcRenderer.invoke('mail:unread-count'),
  mailSend: (message: Record<string, unknown>) => ipcRenderer.invoke('mail:send', message),
  mailMarkRead: (id: string) => ipcRenderer.invoke('mail:read', id),
  mailPurge: (options?: Record<string, unknown>) => ipcRenderer.invoke('mail:purge', options),

  // Merge
  mergeQueue: () => ipcRenderer.invoke('merge:queue'),
  mergeEnqueue: (entry: {
    branch_name: string;
    task_id?: string;
    agent_name?: string;
    files_modified?: string[];
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
  mergeRemove: (id: number) => ipcRenderer.invoke('merge:remove', id),

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

  // Coordinator
  coordinatorStart: (options?: { prompt?: string; run_id?: string }) =>
    ipcRenderer.invoke('coordinator:start', options),
  coordinatorStop: () => ipcRenderer.invoke('coordinator:stop'),
  coordinatorStatus: () => ipcRenderer.invoke('coordinator:status'),

  // Agent process management (node-pty)
  agentOutput: (id: string) => ipcRenderer.invoke('agent:output', id),
  agentWrite: (id: string, data: string) => ipcRenderer.invoke('agent:write', id, data),
  agentResize: (id: string, cols: number, rows: number) =>
    ipcRenderer.invoke('agent:resize', id, cols, rows),
  agentProcessInfo: (id: string) => ipcRenderer.invoke('agent:process-info', id),
  agentRunningList: () => ipcRenderer.invoke('agent:running-list'),

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

  // Worktrees
  worktreeList: (repoPath: string) => ipcRenderer.invoke('worktree:list', repoPath),

  // System
  updateCheck: () => ipcRenderer.invoke('update:check'),
  doctorRun: () => ipcRenderer.invoke('doctor:run'),

  // Events (renderer -> main)
  onAgentUpdate: (callback: (data: unknown) => void) =>
    ipcRenderer.on('agent:update', (_event, data) => callback(data)),
  onAgentOutput: (callback: (data: { agentId: string; data: string }) => void) =>
    ipcRenderer.on('agent:output', (_event, data) => callback(data)),
  onMailReceived: (callback: (data: unknown) => void) =>
    ipcRenderer.on('mail:received', (_event, data) => callback(data)),
  onMergeUpdate: (callback: (data: unknown) => void) =>
    ipcRenderer.on('merge:update', (_event, data) => callback(data)),

  // Cleanup listeners
  removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel),
});
