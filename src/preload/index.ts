import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Health
  healthCheck: () => ipcRenderer.invoke('health:check'),

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
  mergeExecute: (id: number) => ipcRenderer.invoke('merge:execute', id),
  mergePreview: (id: number) => ipcRenderer.invoke('merge:preview', id),
  mergeHistory: () => ipcRenderer.invoke('merge:history'),

  // Settings
  settingsGet: (key: string) => ipcRenderer.invoke('settings:get', key),
  settingsSet: (key: string, value: unknown) => ipcRenderer.invoke('settings:set', key, value),

  // Claude CLI
  claudeStatus: () => ipcRenderer.invoke('claude:status'),
  claudeDetect: () => ipcRenderer.invoke('claude:detect'),

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
