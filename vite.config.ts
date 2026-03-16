import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import electron from 'vite-plugin-electron';
import electronRenderer from 'vite-plugin-electron-renderer';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    electron([
      {
        entry: 'src/main/index.ts',
        vite: {
          build: {
            outDir: 'dist/main',
            rollupOptions: {
              external: [
                'electron',
                'better-sqlite3',
                'node-pty',
                'chokidar',
                'simple-git',
                'graceful-fs',
                'tree-kill',
                'electron-store',
                'electron-log',
                'electron-updater',
                'electron-window-state',
              ],
            },
          },
          server: {
            watch: {
              ignored: ['**/database/**', '**/*.db', '**/*.db-wal', '**/*.db-shm'],
            },
          },
        },
      },
      {
        entry: 'src/preload/index.ts',
        onstart(args) {
          args.reload();
        },
        vite: {
          build: {
            outDir: 'dist/preload',
          },
          server: {
            watch: {
              ignored: ['**/database/**', '**/*.db', '**/*.db-wal', '**/*.db-shm'],
            },
          },
        },
      },
    ]),
    electronRenderer(),
  ],
  server: {
    watch: {
      ignored: ['**/database/**', '**/*.db', '**/*.db-wal', '**/*.db-shm'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@renderer': path.resolve(__dirname, 'src/renderer'),
      '@main': path.resolve(__dirname, 'src/main'),
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@preload': path.resolve(__dirname, 'src/preload'),
    },
  },
  build: {
    outDir: 'dist/renderer',
  },
});
