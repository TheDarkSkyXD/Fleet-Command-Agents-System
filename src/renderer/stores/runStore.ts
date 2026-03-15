import { create } from 'zustand';
import type { Run } from '../../shared/types';

interface RunState {
  activeRun: Run | null;
  runs: Run[];
  isLoading: boolean;
  error: string | null;

  // Actions
  startRun: () => Promise<Run | null>;
  stopRun: (id: string) => Promise<void>;
  completeRun: (id: string) => Promise<void>;
  fetchActiveRun: () => Promise<void>;
  fetchRuns: () => Promise<void>;
}

export const useRunStore = create<RunState>((set) => ({
  activeRun: null,
  runs: [],
  isLoading: false,
  error: null,

  startRun: async () => {
    set({ isLoading: true, error: null });
    try {
      const result = await window.electronAPI.runStart();
      if (result.error) {
        set({ error: result.error, isLoading: false });
        return null;
      }
      set({ activeRun: result.data, isLoading: false });
      return result.data;
    } catch (err) {
      set({ error: String(err), isLoading: false });
      return null;
    }
  },

  stopRun: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const result = await window.electronAPI.runStop(id);
      if (result.error) {
        set({ error: result.error, isLoading: false });
        return;
      }
      set({ activeRun: null, isLoading: false });
      // Refresh runs list so completed run appears in history
      const listResult = await window.electronAPI.runList();
      if (!listResult.error && listResult.data) {
        set({ runs: listResult.data });
      }
    } catch (err) {
      set({ error: String(err), isLoading: false });
    }
  },

  completeRun: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const result = await window.electronAPI.runStop(id);
      if (result.error) {
        set({ error: result.error, isLoading: false });
        return;
      }
      set({ activeRun: null, isLoading: false });
      // Refresh runs list so completed run appears in history
      const listResult = await window.electronAPI.runList();
      if (!listResult.error && listResult.data) {
        set({ runs: listResult.data });
      }
    } catch (err) {
      set({ error: String(err), isLoading: false });
    }
  },

  fetchActiveRun: async () => {
    try {
      const result = await window.electronAPI.runGetActive();
      if (!result.error) {
        set({ activeRun: result.data });
      }
    } catch {
      // Silently fail on polling
    }
  },

  fetchRuns: async () => {
    set({ isLoading: true });
    try {
      const result = await window.electronAPI.runList();
      if (!result.error && result.data) {
        set({ runs: result.data, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },
}));
