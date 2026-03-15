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

  // System
  updateCheck: () => ipcRenderer.invoke('update:check'),
  doctorRun: () => ipcRenderer.invoke('doctor:run'),

  // Events (renderer -> main)
  onAgentUpdate: (callback: (data: unknown) => void) =>
    ipcRenderer.on('agent:update', (_event, data) => callback(data)),
  onMailReceived: (callback: (data: unknown) => void) =>
    ipcRenderer.on('mail:received', (_event, data) => callback(data)),
  onMergeUpdate: (callback: (data: unknown) => void) =>
    ipcRenderer.on('merge:update', (_event, data) => callback(data)),

  // Cleanup listeners
  removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel),
});
