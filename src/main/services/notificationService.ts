import { BrowserWindow, Notification } from 'electron';
import log from 'electron-log';
import { getDatabase } from '../db/database';

/**
 * Notification event types that trigger desktop notifications.
 */
export type NotificationEventType =
  | 'agent_completed'
  | 'agent_stalled'
  | 'agent_zombie'
  | 'agent_error'
  | 'merge_ready'
  | 'merge_failed'
  | 'health_alert';

interface NotificationOptions {
  title: string;
  body: string;
  eventType: NotificationEventType;
  agentName?: string;
}

/**
 * Stored notification history record from the database.
 */
export interface NotificationHistoryRecord {
  id: number;
  title: string;
  body: string;
  event_type: string;
  agent_name: string | null;
  created_at: string;
}

/**
 * NotificationService handles desktop notifications using Electron's Notification API.
 * Notifications are shown when agent events occur (completion, stalls, errors, merges).
 * Clicking a notification brings the app window to the foreground.
 * All notifications are stored in the database for history viewing.
 */
/**
 * Per-event-type notification preferences.
 */
export interface NotificationPreferencesMap {
  agent_completed: boolean;
  agent_stalled: boolean;
  agent_zombie: boolean;
  agent_error: boolean;
  merge_ready: boolean;
  merge_failed: boolean;
  health_alert: boolean;
}

class NotificationService {
  private enabled = true;
  private preferences: NotificationPreferencesMap = {
    agent_completed: true,
    agent_stalled: true,
    agent_zombie: true,
    agent_error: true,
    merge_ready: true,
    merge_failed: true,
    health_alert: true,
  };

  /**
   * Check if notifications are supported on this platform.
   */
  isSupported(): boolean {
    return Notification.isSupported();
  }

  /**
   * Enable or disable notifications.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    log.info(`[NotificationService] Notifications ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Update per-event-type notification preferences.
   */
  setPreferences(prefs: Partial<NotificationPreferencesMap>): void {
    this.preferences = { ...this.preferences, ...prefs };
    log.info('[NotificationService] Updated notification preferences:', this.preferences);
  }

  /**
   * Get current notification preferences.
   */
  getPreferences(): NotificationPreferencesMap {
    return { ...this.preferences };
  }

  /**
   * Store a notification in the database for history tracking.
   */
  private storeNotification(options: NotificationOptions): void {
    try {
      const db = getDatabase();
      db.prepare(
        'INSERT INTO notification_history (title, body, event_type, agent_name) VALUES (?, ?, ?, ?)',
      ).run(options.title, options.body, options.eventType, options.agentName || null);
      log.debug(`[NotificationService] Stored notification in history: ${options.eventType}`);
    } catch (error) {
      log.warn('[NotificationService] Failed to store notification in history:', error);
    }
  }

  /**
   * Broadcast a notification event to the renderer process for in-app display.
   */
  private broadcastToRenderer(options: NotificationOptions): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('notification:event', {
          title: options.title,
          body: options.body,
          eventType: options.eventType,
          agentName: options.agentName || null,
          timestamp: new Date().toISOString(),
        });
        break;
      }
    }
  }

  /**
   * Show a desktop notification for an agent event.
   */
  notify(options: NotificationOptions): void {
    // Always store in history and broadcast to renderer, regardless of desktop notification preferences
    this.storeNotification(options);
    this.broadcastToRenderer(options);

    if (!this.enabled) {
      log.debug('[NotificationService] Notifications disabled, skipping desktop notification');
      return;
    }

    // Check per-event-type preference
    const eventType = options.eventType as keyof NotificationPreferencesMap;
    if (eventType in this.preferences && !this.preferences[eventType]) {
      log.debug(
        `[NotificationService] Notification for ${eventType} disabled by preferences, skipping desktop notification`,
      );
      return;
    }

    if (!Notification.isSupported()) {
      log.warn('[NotificationService] Notifications not supported on this platform');
      return;
    }

    try {
      const notification = new Notification({
        title: options.title,
        body: options.body,
        silent: false,
      });

      // Clicking the notification brings the app window to the foreground
      // and navigates to the agent if applicable
      notification.on('click', () => {
        log.debug('[NotificationService] Notification clicked, focusing app window');
        this.focusMainWindow();
        if (options.agentName) {
          this.navigateToAgent(options.agentName);
        }
      });

      notification.show();
      log.info(
        `[NotificationService] Showed notification: ${options.eventType} - ${options.title}`,
      );
    } catch (error) {
      log.error('[NotificationService] Failed to show notification:', error);
    }
  }

  /**
   * Notify that an agent has completed its work.
   */
  notifyAgentCompleted(agentName: string, capability: string): void {
    this.notify({
      title: 'Agent Completed',
      body: `${agentName} (${capability}) has finished its work.`,
      eventType: 'agent_completed',
      agentName,
    });
  }

  /**
   * Notify that an agent has become stalled.
   */
  notifyAgentStalled(agentName: string, capability: string): void {
    this.notify({
      title: 'Agent Stalled',
      body: `${agentName} (${capability}) appears to be stalled. Consider nudging it.`,
      eventType: 'agent_stalled',
      agentName,
    });
  }

  /**
   * Notify that an agent has become a zombie (unresponsive).
   */
  notifyAgentZombie(agentName: string, capability: string): void {
    this.notify({
      title: 'Zombie Agent Detected',
      body: `${agentName} (${capability}) is unresponsive and may need to be terminated.`,
      eventType: 'agent_zombie',
      agentName,
    });
  }

  /**
   * Notify that an agent encountered an error.
   */
  notifyAgentError(agentName: string, errorMessage: string): void {
    this.notify({
      title: 'Agent Error',
      body: `${agentName}: ${errorMessage}`,
      eventType: 'agent_error',
      agentName,
    });
  }

  /**
   * Notify that a merge is ready for review.
   */
  notifyMergeReady(branchName: string): void {
    this.notify({
      title: 'Merge Ready',
      body: `Branch "${branchName}" is ready for merge review.`,
      eventType: 'merge_ready',
    });
  }

  /**
   * Notify that a merge has failed.
   */
  notifyMergeFailed(branchName: string): void {
    this.notify({
      title: 'Merge Failed',
      body: `Merge of branch "${branchName}" has failed. Check the merge queue for details.`,
      eventType: 'merge_failed',
    });
  }

  /**
   * Notify a health alert (e.g., multiple agents stalled).
   */
  notifyHealthAlert(message: string): void {
    this.notify({
      title: 'Fleet Health Alert',
      body: message,
      eventType: 'health_alert',
    });
  }

  /**
   * Get notification history from the database.
   */
  getHistory(filters?: {
    event_type?: string;
    agent_name?: string;
    limit?: number;
    offset?: number;
  }): NotificationHistoryRecord[] {
    try {
      const db = getDatabase();
      let sql = 'SELECT * FROM notification_history WHERE 1=1';
      const params: (string | number)[] = [];

      if (filters?.event_type) {
        sql += ' AND event_type = ?';
        params.push(filters.event_type);
      }
      if (filters?.agent_name) {
        sql += ' AND agent_name = ?';
        params.push(filters.agent_name);
      }

      sql += ' ORDER BY created_at DESC';

      if (filters?.limit) {
        sql += ' LIMIT ?';
        params.push(filters.limit);
      } else {
        sql += ' LIMIT 200';
      }
      if (filters?.offset) {
        sql += ' OFFSET ?';
        params.push(filters.offset);
      }

      return db.prepare(sql).all(...params) as NotificationHistoryRecord[];
    } catch (error) {
      log.error('[NotificationService] Failed to get notification history:', error);
      return [];
    }
  }

  /**
   * Clear all notification history.
   */
  clearHistory(): number {
    try {
      const db = getDatabase();
      const result = db.prepare('DELETE FROM notification_history').run();
      log.info(`[NotificationService] Cleared ${result.changes} notification history entries`);
      return result.changes;
    } catch (error) {
      log.error('[NotificationService] Failed to clear notification history:', error);
      return 0;
    }
  }

  /**
   * Send a navigation request to the renderer to navigate to a specific agent.
   */
  private navigateToAgent(agentName: string): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('notification:navigate-to-agent', { agentName });
        break;
      }
    }
  }

  /**
   * Focus the main application window (bring to foreground).
   */
  private focusMainWindow(): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        if (win.isMinimized()) {
          win.restore();
        }
        win.show();
        win.focus();
        break;
      }
    }
  }
}

// Singleton instance
export const notificationService = new NotificationService();
