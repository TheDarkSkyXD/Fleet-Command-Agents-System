import { app } from 'electron';
import log from 'electron-log';
import type { UpdateCheckResult, UpdateInfo } from 'electron-updater';
import { autoUpdater } from 'electron-updater';

export interface UpdateStatus {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string | null;
  releaseNotes: string | null;
  releaseDate: string | null;
  downloadProgress: number | null; // 0-100
  downloadedBytes: number | null;
  totalBytes: number | null;
  downloadSpeed: number | null; // bytes per second
  isDownloading: boolean;
  isDownloaded: boolean;
  error: string | null;
}

// Module-level state
const status: UpdateStatus = {
  updateAvailable: false,
  currentVersion: app.getVersion(),
  latestVersion: null,
  releaseNotes: null,
  releaseDate: null,
  downloadProgress: null,
  downloadedBytes: null,
  totalBytes: null,
  downloadSpeed: null,
  isDownloading: false,
  isDownloaded: false,
  error: null,
};

let mainWindowRef: Electron.BrowserWindow | null = null;
let initialized = false;

/**
 * Sends update status to the renderer process.
 */
function notifyRenderer(event: string, data?: unknown) {
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send(event, data ?? status);
  }
}

/**
 * Initialize the auto-updater with event handlers.
 * Must be called once after app is ready.
 */
export function initAutoUpdater(mainWindow: Electron.BrowserWindow) {
  if (initialized) return;
  initialized = true;
  mainWindowRef = mainWindow;

  // Configure auto-updater
  autoUpdater.logger = log;
  autoUpdater.autoDownload = false; // We control when to download
  autoUpdater.autoInstallOnAppQuit = true;

  // Event: checking for update
  autoUpdater.on('checking-for-update', () => {
    log.info('[AutoUpdater] Checking for updates...');
    status.error = null;
  });

  // Event: update available
  autoUpdater.on('update-available', (info: UpdateInfo) => {
    log.info(`[AutoUpdater] Update available: v${info.version}`);
    status.updateAvailable = true;
    status.latestVersion = info.version;
    status.releaseNotes =
      typeof info.releaseNotes === 'string'
        ? info.releaseNotes
        : Array.isArray(info.releaseNotes)
          ? info.releaseNotes.map((n) => (typeof n === 'string' ? n : n.note)).join('\n')
          : null;
    status.releaseDate = info.releaseDate || null;

    notifyRenderer('update:status', status);

    // Automatically start downloading to app data directory
    log.info('[AutoUpdater] Starting silent download to app data directory...');
    status.isDownloading = true;
    autoUpdater.downloadUpdate();
  });

  // Event: no update available
  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    log.info(
      `[AutoUpdater] No update available. Current: v${status.currentVersion}, Latest: v${info.version}`,
    );
    status.updateAvailable = false;
    status.latestVersion = info.version;
    notifyRenderer('update:status', status);
  });

  // Event: download progress
  autoUpdater.on('download-progress', (progress) => {
    status.isDownloading = true;
    status.downloadProgress = Math.round(progress.percent);
    status.downloadedBytes = progress.transferred;
    status.totalBytes = progress.total;
    status.downloadSpeed = progress.bytesPerSecond;

    log.debug(
      `[AutoUpdater] Download progress: ${status.downloadProgress}% (${formatBytes(progress.transferred)}/${formatBytes(progress.total)})`,
    );
    notifyRenderer('update:download-progress', {
      percent: status.downloadProgress,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    });
  });

  // Event: update downloaded (to app data, not Downloads folder)
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    log.info(`[AutoUpdater] Update downloaded: v${info.version} (stored in app data)`);
    status.isDownloading = false;
    status.isDownloaded = true;
    status.downloadProgress = 100;
    notifyRenderer('update:downloaded', {
      version: info.version,
      releaseNotes: status.releaseNotes,
    });
  });

  // Event: error
  autoUpdater.on('error', (error: Error) => {
    log.error('[AutoUpdater] Error:', error.message);
    status.error = error.message;
    status.isDownloading = false;
    notifyRenderer('update:error', { message: error.message });
  });

  log.info('[AutoUpdater] Initialized');
}

/**
 * Check for updates. Called on startup and can be triggered manually.
 * Returns current update status.
 */
export async function checkForUpdates(): Promise<UpdateStatus> {
  try {
    log.info('[AutoUpdater] Manually triggered update check');
    status.error = null;
    const result: UpdateCheckResult | null = await autoUpdater.checkForUpdates();
    if (result) {
      log.info(`[AutoUpdater] Check result: v${result.updateInfo.version}`);
    }
    return { ...status };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error('[AutoUpdater] Check failed:', message);
    status.error = message;
    return { ...status };
  }
}

/**
 * Trigger downloading the available update.
 * electron-updater downloads to a cache directory inside app data (not Downloads folder).
 */
export async function downloadUpdate(): Promise<UpdateStatus> {
  if (!status.updateAvailable) {
    return { ...status, error: 'No update available to download' };
  }
  if (status.isDownloaded) {
    return { ...status };
  }

  try {
    status.isDownloading = true;
    status.error = null;
    await autoUpdater.downloadUpdate();
    return { ...status };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error('[AutoUpdater] Download failed:', message);
    status.error = message;
    status.isDownloading = false;
    return { ...status };
  }
}

/**
 * Install the downloaded update and restart the app.
 */
export function installUpdate() {
  if (status.isDownloaded) {
    log.info('[AutoUpdater] Installing update and restarting...');
    autoUpdater.quitAndInstall(false, true);
  }
}

/**
 * Get the current update status without triggering a check.
 */
export function getUpdateStatus(): UpdateStatus {
  return { ...status };
}

/**
 * Format bytes to human-readable string.
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}
