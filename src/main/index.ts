import path from 'node:path';
import { BrowserWindow, Menu, Tray, app, dialog } from 'electron';
import log from 'electron-log';
import windowStateKeeper from 'electron-window-state';
import { closeDatabase, initDatabase } from './db/database';
import { registerIpcHandlers } from './ipc/handlers';
import { agentProcessManager } from './services/agentProcessManager';
import { type TrayIconStatus, generateTrayIcon } from './services/trayIconGenerator';

// Configure logging
log.transports.file.level = 'info';
log.transports.console.level = 'debug';

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

const isDev = !app.isPackaged;

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 420,
    height: 360,
    frame: false,
    transparent: false,
    resizable: false,
    movable: true,
    center: true,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#0f172a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Load the splash HTML
  const splashPath = isDev
    ? path.join(__dirname, '../../resources/splash.html')
    : path.join(process.resourcesPath, 'resources/splash.html');

  splashWindow.loadFile(splashPath);

  splashWindow.once('ready-to-show', () => {
    splashWindow?.show();
  });

  splashWindow.on('closed', () => {
    splashWindow = null;
  });
}

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
    backgroundColor: '#0f172a', // slate-900
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
    // Close splash screen and show main window
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow?.show();
  });

  // Handle close with dialog offering three options
  mainWindow.on('close', (event) => {
    if (!isQuitting && mainWindow) {
      event.preventDefault();

      const activeAgentCount = agentProcessManager.getAll().filter((a) => a.isRunning).length;
      const agentInfo =
        activeAgentCount > 0 ? `\n\n${activeAgentCount} agent(s) currently running.` : '';

      dialog
        .showMessageBox(mainWindow, {
          type: 'question',
          title: 'Close Fleet Command',
          message: `What would you like to do?${agentInfo}`,
          buttons: ['Keep Running in Tray', 'Stop All Agents & Close', 'Cancel'],
          defaultId: 2,
          cancelId: 2,
          noLink: true,
        })
        .then(async ({ response }) => {
          if (response === 0) {
            // Keep running in tray - hide window
            mainWindow?.hide();
            log.info('App minimized to tray (agents continue running)');
          } else if (response === 1) {
            // Stop all agents and close
            log.info('Stopping all agents and closing app...');
            try {
              await agentProcessManager.stopAll();
              log.info('All agents stopped');
            } catch (error) {
              log.error('Error stopping agents on close:', error);
            }
            isQuitting = true;
            app.quit();
          }
          // response === 2 is Cancel - do nothing, dialog closes
        })
        .catch((err) => {
          log.error('Close dialog error:', err);
        });
    }
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

  // Periodically check agent status and update tray icon + menu
  setInterval(() => {
    if (!tray || tray.isDestroyed()) return;
    try {
      const allAgents = agentProcessManager.getAll();
      const count = allAgents.filter((a) => a.isRunning).length;
      updateTrayMenu(count);

      if (count > 0) {
        updateTrayIcon('active');
      } else {
        updateTrayIcon('idle');
      }
    } catch {
      // Silently ignore errors during status check
    }
  }, 5000);

  log.info('System tray icon created');
}

app.whenReady().then(async () => {
  log.info('Fleet Command starting...');

  // Show splash screen immediately
  createSplashWindow();

  // Initialize database
  try {
    await initDatabase();
    log.info('Database initialized successfully');
  } catch (error) {
    log.error('Failed to initialize database:', error);
  }

  // Register IPC handlers
  registerIpcHandlers();

  // Create window and tray (splash closes when main window is ready)
  createWindow();
  createTray();

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
  // Stop all running agent processes before quitting
  try {
    await agentProcessManager.stopAll();
  } catch (error) {
    log.error('Failed to stop agent processes on quit:', error);
  }
  // Close database gracefully to ensure WAL checkpoint
  closeDatabase();
});
