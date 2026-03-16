// All available tools in the system
export const ALL_TOOLS = [
  'Read',
  'Write',
  'Edit',
  'Grep',
  'Glob',
  'Bash',
  'Bash (read-only)',
  'Bash (read-only + tests)',
  'WebSearch',
  'WebFetch',
  'Diff',
  'Git',
  'AgentSpawn',
  'Mail',
  'HealthCheck',
  'MergeAuthorize',
  'NotebookEdit',
];

export const capabilityColors: Record<string, string> = {
  scout: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
  builder: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  reviewer: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
  lead: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  merger: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  coordinator: 'text-red-400 bg-red-500/10 border-red-500/30',
  monitor: 'text-teal-400 bg-teal-500/10 border-teal-500/30',
};

// Default security posture labels per capability type
export const defaultSecurityPosture: Record<string, { label: string; color: string }> = {
  scout: { label: 'Read-Only', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  builder: { label: 'Scoped Write', color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
  reviewer: { label: 'Read + Test', color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30' },
  lead: { label: 'Full Access', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  merger: { label: 'Merge Scoped', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  coordinator: { label: 'Read + Spawn', color: 'text-red-400 bg-red-500/10 border-red-500/30' },
  monitor: { label: 'Monitor Only', color: 'text-teal-400 bg-teal-500/10 border-teal-500/30' },
};

export const severityColors: Record<string, string> = {
  info: 'text-blue-400 bg-blue-500/10',
  warning: 'text-amber-400 bg-amber-500/10',
  critical: 'text-red-400 bg-red-500/10',
};

export const ruleTypeLabels: Record<string, string> = {
  tool_allowlist: 'Tool Allowlist',
  bash_restriction: 'Bash Restriction',
  file_scope: 'File Scope',
  path_boundary: 'Path Boundary',
};

export const boundaryTypeLabels: Record<string, string> = {
  worktree: 'Worktree Root',
  directory: 'Directory',
  glob: 'Glob Pattern',
};

export const boundaryTypeColors: Record<string, string> = {
  worktree: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  directory: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  glob: 'text-sky-400 bg-sky-500/10 border-sky-500/30',
};
