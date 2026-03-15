import { ipcMain } from 'electron';
import log from 'electron-log';
import { getDatabase } from '../db/database';

export function registerIpcHandlers(): void {
  // Health check
  ipcMain.handle('health:check', () => {
    try {
      const db = getDatabase();
      const result = db.prepare("SELECT 1 as ok").get() as { ok: number };
      return {
        status: 'healthy',
        database: result.ok === 1 ? 'connected' : 'error',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      log.error('Health check failed:', error);
      return {
        status: 'unhealthy',
        database: 'disconnected',
        error: String(error),
      };
    }
  });

  // Agent channels
  ipcMain.handle('agent:list', () => {
    try {
      const db = getDatabase();
      const sessions = db.prepare('SELECT * FROM sessions ORDER BY created_at DESC').all();
      return { data: sessions, error: null };
    } catch (error) {
      log.error('agent:list failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('agent:detail', (_event, agentId: string) => {
    try {
      const db = getDatabase();
      const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(agentId);
      return { data: session, error: null };
    } catch (error) {
      log.error('agent:detail failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // Mail channels
  ipcMain.handle('mail:list', (_event, filters?: { unreadOnly?: boolean }) => {
    try {
      const db = getDatabase();
      let query = 'SELECT * FROM messages';
      if (filters?.unreadOnly) {
        query += ' WHERE read = 0';
      }
      query += ' ORDER BY created_at DESC';
      const messages = db.prepare(query).all();
      return { data: messages, error: null };
    } catch (error) {
      log.error('mail:list failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('mail:unread-count', () => {
    try {
      const db = getDatabase();
      const result = db.prepare('SELECT COUNT(*) as count FROM messages WHERE read = 0').get() as { count: number };
      return { data: result.count, error: null };
    } catch (error) {
      log.error('mail:unread-count failed:', error);
      return { data: 0, error: String(error) };
    }
  });

  // Merge channels
  ipcMain.handle('merge:queue', () => {
    try {
      const db = getDatabase();
      const queue = db.prepare('SELECT * FROM merge_queue ORDER BY enqueued_at ASC').all();
      return { data: queue, error: null };
    } catch (error) {
      log.error('merge:queue failed:', error);
      return { data: null, error: String(error) };
    }
  });

  // Settings channels
  ipcMain.handle('settings:get', (_event, key: string) => {
    try {
      const db = getDatabase();
      const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined;
      return { data: row ? JSON.parse(row.value) : null, error: null };
    } catch (error) {
      log.error('settings:get failed:', error);
      return { data: null, error: String(error) };
    }
  });

  ipcMain.handle('settings:set', (_event, key: string, value: unknown) => {
    try {
      const db = getDatabase();
      db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(key, JSON.stringify(value));
      return { data: true, error: null };
    } catch (error) {
      log.error('settings:set failed:', error);
      return { data: false, error: String(error) };
    }
  });

  log.info('IPC handlers registered');
}
