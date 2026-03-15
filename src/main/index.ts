import path from 'node:path';
import { BrowserWindow, Menu, Tray, app, nativeImage } from 'electron';
import log from 'electron-log';
import windowStateKeeper from 'electron-window-state';
import { closeDatabase, initDatabase } from './db/database';
import { registerIpcHandlers } from './ipc/handlers';

// Configure logging
log.transports.file.level = 'info';
log.transports.console.level = 'debug';

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
    mainWindow?.show();
  });

  // Handle close to tray
  mainWindow.on('close', (event) => {
    if (tray && !isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  // Create a simple tray icon (placeholder)
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show/Hide',
      click: () => {
        if (mainWindow?.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow?.show();
        }
      },
    },
    { type: 'separator' },
    { label: 'Active Agents: 0', enabled: false },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('Fleet Command');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    mainWindow?.show();
  });
}

app.whenReady().then(async () => {
  log.info('Fleet Command starting...');

  // Initialize database
  try {
    await initDatabase();
    log.info('Database initialized successfully');
  } catch (error) {
    log.error('Failed to initialize database:', error);
  }

  // Register IPC handlers
  registerIpcHandlers();

  // Create window and tray
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

app.on('before-quit', () => {
  isQuitting = true;
  // Close database gracefully to ensure WAL checkpoint
  closeDatabase();
});
