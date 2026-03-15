import { create } from 'zustand';
import type { Project } from '../../shared/types';

interface ProjectState {
  projects: Project[];
  activeProject: Project | null;
  loading: boolean;
  error: string | null;

  // Actions
  loadProjects: () => Promise<void>;
  loadActiveProject: () => Promise<void>;
  createProject: (name: string, path: string, description?: string) => Promise<Project | null>;
  switchProject: (id: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  updateProject: (id: string, updates: Record<string, unknown>) => Promise<void>;
}

function generateId(): string {
  return `proj_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  activeProject: null,
  loading: false,
  error: null,

  loadProjects: async () => {
    set({ loading: true, error: null });
    try {
      const result = await window.electronAPI.projectList();
      if (result.error) {
        set({ error: result.error, loading: false });
        return;
      }
      set({ projects: result.data || [], loading: false });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  loadActiveProject: async () => {
    try {
      const result = await window.electronAPI.projectGetActive();
      if (result.data) {
        set({ activeProject: result.data });
      }
    } catch (err) {
      console.error('Failed to load active project:', err);
    }
  },

  createProject: async (name: string, path: string, description?: string) => {
    try {
      const id = generateId();
      const result = await window.electronAPI.projectCreate({ id, name, path, description });
      if (result.error) {
        set({ error: result.error });
        return null;
      }
      // Reload projects list
      await get().loadProjects();
      return result.data;
    } catch (err) {
      set({ error: String(err) });
      return null;
    }
  },

  switchProject: async (id: string) => {
    try {
      const result = await window.electronAPI.projectSwitch(id);
      if (result.error) {
        set({ error: result.error });
        return;
      }
      set({ activeProject: result.data });
      // Reload projects to update order
      await get().loadProjects();
    } catch (err) {
      set({ error: String(err) });
    }
  },

  deleteProject: async (id: string) => {
    try {
      const result = await window.electronAPI.projectDelete(id);
      if (!result.data) {
        set({ error: 'Failed to delete project' });
        return;
      }
      const { activeProject } = get();
      if (activeProject?.id === id) {
        set({ activeProject: null });
      }
      await get().loadProjects();
    } catch (err) {
      set({ error: String(err) });
    }
  },

  updateProject: async (id: string, updates: Record<string, unknown>) => {
    try {
      const result = await window.electronAPI.projectUpdate(id, updates);
      if (result.error) {
        set({ error: result.error });
        return;
      }
      const { activeProject } = get();
      if (activeProject?.id === id && result.data) {
        set({ activeProject: result.data });
      }
      await get().loadProjects();
    } catch (err) {
      set({ error: String(err) });
    }
  },
}));
