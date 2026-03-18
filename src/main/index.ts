import path from 'node:path';
import { BrowserWindow, Menu, Tray, app, dialog, ipcMain } from 'electron';
import log from 'electron-log';

// Enable remote debugging for debug-electron-mcp integration
app.commandLine.appendSwitch('remote-debugging-port', '9233');
import windowStateKeeper from 'electron-window-state';
import {
  checkDatabaseHealth,
  closeDatabase,
  getDatabasePath,
  initDatabase,
  recreateDatabase,
} from './db/database';
import { registerIpcHandlers } from './ipc/handlers';
import { agentProcessManager } from './services/agentProcessManager';
import { checkpointService } from './services/checkpointService';
import { createClaudeCodeAdapter } from './services/claudeCodeAdapter';
import { runtimeRegistry } from './services/runtimeRegistry';
import { type TrayIconStatus, generateTrayIcon } from './services/trayIconGenerator';
import { checkForUpdates, initAutoUpdater } from './services/updateService';
import { watchdogService } from './services/watchdogService';

// Configure logging
log.transports.file.level = 'info';
log.transports.console.level = 'debug';

// Persistent key-value store for all settings (survives DB resets)
// Using a simple JSON file since electron-store v10 is ESM-only
import fs from 'node:fs';

const storeFilePath = path.join(app.getPath('userData'), 'fleet-command-settings.json');

function loadStore(): Record<string, unknown> {
  try {
    if (fs.existsSync(storeFilePath)) {
      return JSON.parse(fs.readFileSync(storeFilePath, 'utf-8'));
    }
  } catch {
    log.warn('[Store] Failed to load settings file, using defaults');
  }
  return {};
}

function saveStore(data: Record<string, unknown>) {
  try {
    fs.writeFileSync(storeFilePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    log.error('[Store] Failed to save settings file:', err);
  }
}

export const persistentStore = {
  get(key: string, defaultValue?: unknown): unknown {
    const data = loadStore();
    return key in data ? data[key] : defaultValue;
  },
  set(key: string, value: unknown) {
    const data = loadStore();
    data[key] = value;
    saveStore(data);
  },
};

// IPC handlers for persistent store (direct key access)
ipcMain.handle('store:get', (_event, key: string) => {
  return persistentStore.get(key);
});
ipcMain.handle('store:set', (_event, key: string, value: unknown) => {
  persistentStore.set(key, value);
});

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

const isDev = !app.isPackaged;

function createWindow() {
  // Load saved window state
  const mainWindowState = windowStateKeeper({
    defaultWidth: 1400,
    defaultHeight: 900,
  });

  mainWindow = new BrowserWindow({
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    frame: true,
    title: 'Fleet Command',
    backgroundColor: '#111111',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  // Track window state
  mainWindowState.manage(mainWindow);

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Minimize: check setting to decide tray vs taskbar
  mainWindow.on('minimize', (event: Electron.Event) => {
    const minimizeToTray = persistentStore.get('minimizeToTray', false);
    if (minimizeToTray) {
      event.preventDefault();
      mainWindow?.hide();
      log.info('Window minimized to system tray');
    }
    // Otherwise default minimize to taskbar
  });

  // Close = quit the app
  mainWindow.on('close', () => {
    isQuitting = true;
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/** Current tray icon status for tracking changes */
let currentTrayStatus: TrayIconStatus = 'idle';

/** Export updateTrayIcon so other modules can update tray status */
export { updateTrayIcon, updateTrayMenu };

/**
 * Updates the tray icon to reflect the current app status.
 * Called periodically or when agent state changes.
 */
function updateTrayIcon(status: TrayIconStatus) {
  if (!tray || tray.isDestroyed()) return;
  if (status === currentTrayStatus) return;

  currentTrayStatus = status;
  const icon = generateTrayIcon(status, 16);
  tray.setImage(icon);

  // Update tooltip with status
  const statusLabels: Record<TrayIconStatus, string> = {
    idle: 'Fleet Command - Idle',
    active: 'Fleet Command - Agents Active',
    warning: 'Fleet Command - Agents Stalled',
    error: 'Fleet Command - Error',
  };
  tray.setToolTip(statusLabels[status]);
  log.debug(`Tray icon status updated to: ${status}`);
}

/**
 * Updates the tray context menu with the current active agent count.
 */
function updateTrayMenu(activeAgentCount: number) {
  if (!tray || tray.isDestroyed()) return;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show/Hide Fleet Command',
      click: () => {
        if (mainWindow?.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow?.show();
          mainWindow?.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: `Active Agents: ${activeAgentCount}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Quit Fleet Command',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

function createTray() {
  // Generate a proper tray icon with status indicator
  const icon = generateTrayIcon('idle', 16);
  tray = new Tray(icon);

  // Set initial context menu
  updateTrayMenu(0);

  tray.setToolTip('Fleet Command - Idle');

  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });

  // Low-frequency tray status poll (30s) — in-memory only, no SQL
  setInterval(() => {
    if (!tray || tray.isDestroyed()) return;
    try {
      const allAgents = agentProcessManager.getAll();
      const count = allAgents.filter((a) => a.isRunning).length;
      updateTrayMenu(count);
      updateTrayIcon(count > 0 ? 'active' : 'idle');
    } catch {
      // Silently ignore errors during status check
    }
  }, 30000);

  log.info('System tray icon created');
}

// Enforce single instance
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Another instance is already running - just quit this one
  log.info('Another instance is already running. Quitting duplicate.');
  app.quit();
} else {
  app.on('second-instance', () => {
    // Focus the existing window when a second instance tries to launch
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(async () => {
  log.info('Fleet Command starting...');

  // Initialize database with graceful recovery for missing/corrupted files
  try {
    // Pre-check database health before attempting to open
    const healthCheck = checkDatabaseHealth();
    if (healthCheck.corrupted) {
      log.warn(`[DB] Database corruption detected: ${healthCheck.error}`);
      const dbPath = getDatabasePath();
      const { response } = await dialog.showMessageBox({
        type: 'warning',
        title: 'Database Issue Detected',
        message: 'Fleet Command detected a corrupted database file.',
        detail: `The database at "${dbPath}" appears to be corrupted.\n\nWould you like to recreate it? This will reset all stored data (agents, messages, settings) but allow the app to start fresh.`,
        buttons: ['Recreate Database', 'Quit'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });

      if (response === 0) {
        const success = await recreateDatabase();
        if (success) {
          log.info('[DB] Database recreated successfully after corruption');
        } else {
          log.error('[DB] Failed to recreate database');
          dialog.showErrorBox(
            'Database Error',
            'Failed to recreate the database. The application may not work correctly.',
          );
        }
      } else {
        log.info('[DB] User chose to quit after database corruption');
        app.quit();
        return;
      }
    } else {
      // Database file is missing (will be auto-created) or healthy
      if (!healthCheck.exists) {
        log.info('[DB] No existing database found - creating new database');
      }
      await initDatabase();
      log.info('Database initialized successfully');
    }
  } catch (error) {
    log.error('Failed to initialize database:', error);
    const dbPath = getDatabasePath();
    const { response } = await dialog.showMessageBox({
      type: 'error',
      title: 'Database Initialization Failed',
      message: 'Fleet Command could not initialize the database.',
      detail: `Error: ${String(error)}\n\nDatabase path: ${dbPath}\n\nWould you like to recreate the database? This will reset all stored data.`,
      buttons: ['Recreate Database', 'Continue Without Database', 'Quit'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    });

    if (response === 0) {
      try {
        const success = await recreateDatabase();
        if (success) {
          log.info('[DB] Database recreated successfully after init failure');
        } else {
          log.error('[DB] Failed to recreate database after init failure');
        }
      } catch (recreateError) {
        log.error('[DB] Recreate also failed:', recreateError);
      }
    } else if (response === 2) {
      app.quit();
      return;
    }
    // response === 1: continue without database (degraded mode)
  }

  // Register IPC handlers
  registerIpcHandlers();

  // Initialize runtime registry with Claude Code adapter
  const claudeCodeAdapter = createClaudeCodeAdapter();
  runtimeRegistry.register(claudeCodeAdapter);
  log.info('Runtime registry initialized with Claude Code adapter');

  // Restore checkpoints from previous session
  try {
    const recoveryStatus = checkpointService.restore();
    if (recoveryStatus.checkpointsFound > 0) {
      log.info(
        `[Startup] Restored ${recoveryStatus.checkpointsFound} checkpoint(s), ${recoveryStatus.processesAlive} process(es) still alive`,
      );
    }
  } catch (error) {
    log.error('[Startup] Failed to restore checkpoints:', error);
  }

  // Start watchdog daemon for agent liveness monitoring
  watchdogService.start();

  // Create window and tray
  createWindow();
  createTray();

  // Initialize auto-updater and check for updates on startup (non-intrusive)
  if (mainWindow) {
    initAutoUpdater(mainWindow);
    // Delay update check by 5 seconds to let the app finish loading
    setTimeout(() => {
      checkForUpdates().catch((err) => {
        log.warn('[AutoUpdater] Startup update check failed (non-blocking):', err);
      });
    }, 5000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  isQuitting = true;
  // Stop watchdog daemon
  watchdogService.stop();
  // Save checkpoints for all agents before stopping them
  try {
    agentProcessManager.saveCheckpoints();
    log.info('Agent checkpoints saved on app close');
  } catch (error) {
    log.error('Failed to save agent checkpoints on quit:', error);
  }
  // Stop all running agent processes before quitting
  try {
    await agentProcessManager.stopAll();
  } catch (error) {
    log.error('Failed to stop agent processes on quit:', error);
  }
  // Close database gracefully to ensure WAL checkpoint
  closeDatabase();
});
