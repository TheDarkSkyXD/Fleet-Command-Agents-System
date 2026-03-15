import log from 'electron-log';
import { getDatabase } from '../db/database';

/**
 * Result of restoring a single checkpoint.
 */
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

/**
 * Overall recovery status after restore attempt.
 */
export interface RecoveryStatus {
  checkpointsFound: number;
  processesAlive: number;
  restored: CheckpointRestoreResult[];
  recoveryTimestamp: string;
}

/**
 * Check if a process with the given PID is still alive.
 */
function isProcessAlive(pid: number): boolean {
  try {
    // Sending signal 0 checks if process exists without killing it
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * CheckpointService handles restoring agent state from saved checkpoints on app restart.
 * It reads checkpoint data from the database, checks if any agent processes are still
 * alive, and provides recovery status for the UI.
 */
class CheckpointService {
  private lastRecoveryStatus: RecoveryStatus | null = null;

  /**
   * Restore checkpoints from the database on app startup.
   * Checks if any previously-running agent processes are still alive
   * and provides recovery status data.
   */
  restore(): RecoveryStatus {
    const recoveryTimestamp = new Date().toISOString();

    try {
      const db = getDatabase();
      const checkpoints = db
        .prepare('SELECT * FROM checkpoints ORDER BY timestamp DESC')
        .all() as Array<{
        agent_name: string;
        task_id: string | null;
        session_id: string | null;
        progress_summary: string | null;
        files_modified: string | null;
        current_branch: string | null;
        pending_work: string | null;
        mulch_domains: string | null;
        timestamp: string;
      }>;

      log.info(`[CheckpointService] Found ${checkpoints.length} checkpoint(s) to restore`);

      const restored: CheckpointRestoreResult[] = [];
      let processesAlive = 0;

      for (const cp of checkpoints) {
        // Try to detect if the agent's process is still alive
        // We check the progress_summary for PID info if available
        let processAlive = false;
        let pid: number | null = null;

        if (cp.progress_summary) {
          try {
            const summary = JSON.parse(cp.progress_summary);
            if (summary.pid && typeof summary.pid === 'number') {
              pid = summary.pid;
              processAlive = isProcessAlive(pid);
            }
          } catch {
            // Invalid JSON in progress_summary, skip PID check
          }
        }

        if (processAlive) {
          processesAlive++;
          log.info(
            `[CheckpointService] Agent "${cp.agent_name}" process still alive (PID: ${pid})`,
          );
        } else {
          log.info(
            `[CheckpointService] Agent "${cp.agent_name}" process not found (was ${cp.progress_summary ? 'running' : 'unknown'})`,
          );
        }

        const result: CheckpointRestoreResult = {
          agentName: cp.agent_name,
          taskId: cp.task_id,
          sessionId: cp.session_id,
          progressSummary: cp.progress_summary,
          filesModified: cp.files_modified,
          currentBranch: cp.current_branch,
          pendingWork: cp.pending_work,
          processAlive,
          restored: true,
          timestamp: cp.timestamp,
        };

        restored.push(result);
      }

      const status: RecoveryStatus = {
        checkpointsFound: checkpoints.length,
        processesAlive,
        restored,
        recoveryTimestamp,
      };

      this.lastRecoveryStatus = status;

      log.info(
        `[CheckpointService] Recovery complete: ${checkpoints.length} checkpoint(s) found, ${processesAlive} process(es) still alive`,
      );

      return status;
    } catch (error) {
      log.error('[CheckpointService] Failed to restore checkpoints:', error);

      const status: RecoveryStatus = {
        checkpointsFound: 0,
        processesAlive: 0,
        restored: [],
        recoveryTimestamp,
      };

      this.lastRecoveryStatus = status;
      return status;
    }
  }

  /**
   * Get the last recovery status (from most recent restore call).
   */
  getRecoveryStatus(): RecoveryStatus | null {
    return this.lastRecoveryStatus;
  }

  /**
   * Clear all checkpoints from the database (e.g., after successful restore).
   */
  clearCheckpoints(): number {
    try {
      const db = getDatabase();
      const result = db.prepare('DELETE FROM checkpoints').run();
      const deleted = result.changes;
      log.info(`[CheckpointService] Cleared ${deleted} checkpoint(s)`);
      return deleted;
    } catch (error) {
      log.error('[CheckpointService] Failed to clear checkpoints:', error);
      return 0;
    }
  }
}

/** Singleton instance */
export const checkpointService = new CheckpointService();
