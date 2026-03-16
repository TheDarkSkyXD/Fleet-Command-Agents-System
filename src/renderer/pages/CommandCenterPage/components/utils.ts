import type { AgentCapability, AgentProcessInfo, Session } from '../../../../shared/types';

export function generateId(): string {
  return `agent-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

export function generateName(capability: AgentCapability): string {
  const adjectives = ['swift', 'keen', 'bold', 'sharp', 'steady', 'bright', 'calm', 'quick'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  return `${adj}-${capability}-${Math.floor(Math.random() * 1000)}`;
}

export function formatUptime(createdAt: string): string {
  const uptime = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = uptime % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

/**
 * Estimate progress for an agent based on its state, uptime, and output lines.
 * Uses heuristic-based estimation since agents don't report exact progress.
 */
export function estimateAgentProgress(
  session: Session,
  processInfo?: AgentProcessInfo,
): { percent: number; label: string; phase: string } {
  if (session.state === 'completed') {
    return { percent: 100, label: 'Complete', phase: 'Done' };
  }
  if (session.state === 'zombie') {
    return { percent: 0, label: 'Process died', phase: 'Error' };
  }
  if (session.state === 'booting') {
    return { percent: 5, label: 'Starting up\u2026', phase: 'Booting' };
  }
  // Ongoing roles don't have a completion point
  if (session.capability === 'coordinator' || session.capability === 'monitor') {
    const minutes = Math.floor((Date.now() - new Date(session.created_at).getTime()) / 60000);
    return { percent: -1, label: `Active ${minutes}m`, phase: 'Ongoing' };
  }

  const uptimeMin = (Date.now() - new Date(session.created_at).getTime()) / 60000;
  const outputCount = processInfo?.outputLines || 0;

  // Expected durations per capability (minutes)
  const expectedDurations: Record<string, number> = {
    scout: 4,
    builder: 12,
    reviewer: 5,
    lead: 15,
    merger: 7,
  };
  const expectedDuration = expectedDurations[session.capability] || 10;

  const timeProgress = Math.min((uptimeMin / expectedDuration) * 100, 95);
  const outputProgress = Math.min((outputCount / 200) * 60, 60);
  const percent = Math.round(Math.min(Math.max(timeProgress, outputProgress), 95));

  let phase: string;
  if (percent < 15) phase = 'Initializing';
  else if (percent < 40) phase = 'Analyzing';
  else if (percent < 70) phase = 'Implementing';
  else if (percent < 90) phase = 'Finalizing';
  else phase = 'Wrapping up';

  if (session.state === 'stalled') phase = 'Stalled';

  return { percent, label: `~${percent}%`, phase };
}
