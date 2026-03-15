import { toast } from 'sonner';
import { create } from 'zustand';
import type { Project } from '../../shared/types';
import { handleIpcError } from '../lib/ipcErrorHandler';

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
      const msg = handleIpcError(err, { context: 'loading projects' });
      set({ error: msg, loading: false });
    }
  },

  loadActiveProject: async () => {
    try {
      const result = await window.electronAPI.projectGetActive();
      if (result.data) {
        set({ activeProject: result.data });
      }
    } catch (err) {
      handleIpcError(err, { context: 'loading active project', showToast: false });
    }
  },

  createProject: async (name: string, path: string, description?: string) => {
    try {
      const id = generateId();
      const result = await window.electronAPI.projectCreate({ id, name, path, description });
      if (result.error) {
        set({ error: result.error });
        toast.error(result.error);
        return null;
      }
      toast.success(`Project "${name}" created`);
      // Reload projects list
      await get().loadProjects();
      return result.data;
    } catch (err) {
      const msg = handleIpcError(err, { context: 'creating project' });
      set({ error: msg });
      return null;
    }
  },

  switchProject: async (id: string) => {
    try {
      const result = await window.electronAPI.projectSwitch(id);
      if (result.error) {
        set({ error: result.error });
        toast.error(result.error);
        return;
      }
      set({ activeProject: result.data });
      toast.success(`Switched to project "${result.data?.name || id}"`);
      // Reload projects to update order
      await get().loadProjects();
    } catch (err) {
      const msg = handleIpcError(err, { context: 'switching project' });
      set({ error: msg });
    }
  },

  deleteProject: async (id: string) => {
    try {
      const result = await window.electronAPI.projectDelete(id);
      if (!result.data) {
        set({ error: 'Failed to delete project' });
        toast.error('Failed to delete project');
        return;
      }
      const { activeProject } = get();
      if (activeProject?.id === id) {
        set({ activeProject: null });
      }
      toast.success('Project deleted');
      await get().loadProjects();
    } catch (err) {
      const msg = handleIpcError(err, { context: 'deleting project' });
      set({ error: msg });
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
      const msg = handleIpcError(err, { context: 'updating project' });
      set({ error: msg });
    }
  },
}));
