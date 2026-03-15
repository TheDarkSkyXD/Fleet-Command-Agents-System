import { BrowserWindow, Notification } from 'electron';
import log from 'electron-log';

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
 * NotificationService handles desktop notifications using Electron's Notification API.
 * Notifications are shown when agent events occur (completion, stalls, errors, merges).
 * Clicking a notification brings the app window to the foreground.
 */
class NotificationService {
  private enabled = true;

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
   * Show a desktop notification for an agent event.
   */
  notify(options: NotificationOptions): void {
    if (!this.enabled) {
      log.debug('[NotificationService] Notifications disabled, skipping');
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
