import { create } from 'zustand';
import type { MergeQueueEntry, MergeResolutionTier } from '../../shared/types';

interface MergeState {
  queue: MergeQueueEntry[];
  history: MergeQueueEntry[];
  loading: boolean;
  error: string | null;

  // Actions
  fetchQueue: () => Promise<void>;
  fetchHistory: () => Promise<void>;
  enqueue: (entry: {
    branch_name: string;
    task_id?: string;
    agent_name?: string;
    files_modified?: string[];
  }) => Promise<MergeQueueEntry | null>;
  getNext: () => Promise<MergeQueueEntry | null>;
  execute: (id: number) => Promise<MergeQueueEntry | null>;
  complete: (id: number, resolvedTier: MergeResolutionTier) => Promise<MergeQueueEntry | null>;
  fail: (id: number) => Promise<MergeQueueEntry | null>;
  markConflict: (id: number) => Promise<MergeQueueEntry | null>;
  autoResolve: (id: number) => Promise<MergeQueueEntry | null>;
  aiResolve: (id: number) => Promise<MergeQueueEntry | null>;
  remove: (id: number) => Promise<boolean>;
}

export const useMergeStore = create<MergeState>((set, get) => ({
  queue: [],
  history: [],
  loading: false,
  error: null,

  fetchQueue: async () => {
    set({ loading: true, error: null });
    try {
      const result = await window.electronAPI.mergeQueue();
      if (result.error) {
        set({ error: result.error, loading: false });
      } else {
        set({ queue: result.data ?? [], loading: false });
      }
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  fetchHistory: async () => {
    try {
      const result = await window.electronAPI.mergeHistory();
      if (!result.error && result.data) {
        set({ history: result.data });
      }
    } catch (err) {
      set({ error: String(err) });
    }
  },

  enqueue: async (entry) => {
    try {
      const result = await window.electronAPI.mergeEnqueue(entry);
      if (result.error) {
        set({ error: result.error });
        return null;
      }
      // Refresh queue after enqueue
      await get().fetchQueue();
      return result.data;
    } catch (err) {
      set({ error: String(err) });
      return null;
    }
  },

  getNext: async () => {
    try {
      const result = await window.electronAPI.mergeNext();
      if (result.error) {
        set({ error: result.error });
        return null;
      }
      return result.data;
    } catch (err) {
      set({ error: String(err) });
      return null;
    }
  },

  execute: async (id) => {
    try {
      const result = await window.electronAPI.mergeExecute(id);
      if (result.error) {
        set({ error: result.error });
        return null;
      }
      await get().fetchQueue();
      return result.data;
    } catch (err) {
      set({ error: String(err) });
      return null;
    }
  },

  complete: async (id, resolvedTier) => {
    try {
      const result = await window.electronAPI.mergeComplete(id, resolvedTier);
      if (result.error) {
        set({ error: result.error });
        return null;
      }
      await get().fetchQueue();
      await get().fetchHistory();
      return result.data;
    } catch (err) {
      set({ error: String(err) });
      return null;
    }
  },

  fail: async (id) => {
    try {
      const result = await window.electronAPI.mergeFail(id);
      if (result.error) {
        set({ error: result.error });
        return null;
      }
      await get().fetchQueue();
      await get().fetchHistory();
      return result.data;
    } catch (err) {
      set({ error: String(err) });
      return null;
    }
  },

  markConflict: async (id) => {
    try {
      const result = await window.electronAPI.mergeConflict(id);
      if (result.error) {
        set({ error: result.error });
        return null;
      }
      await get().fetchQueue();
      return result.data;
    } catch (err) {
      set({ error: String(err) });
      return null;
    }
  },

  autoResolve: async (id) => {
    try {
      const result = await window.electronAPI.mergeAutoResolve(id);
      if (result.error) {
        set({ error: result.error });
        return null;
      }
      await get().fetchQueue();
      await get().fetchHistory();
      return result.data;
    } catch (err) {
      set({ error: String(err) });
      return null;
    }
  },

  aiResolve: async (id) => {
    try {
      const result = await window.electronAPI.mergeAiResolve(id);
      if (result.error) {
        set({ error: result.error });
        return null;
      }
      await get().fetchQueue();
      await get().fetchHistory();
      return result.data;
    } catch (err) {
      set({ error: String(err) });
      return null;
    }
  },

  remove: async (id) => {
    try {
      const result = await window.electronAPI.mergeRemove(id);
      if (result.error) {
        set({ error: result.error });
        return false;
      }
      await get().fetchQueue();
      return result.data;
    } catch (err) {
      set({ error: String(err) });
      return false;
    }
  },
}));
