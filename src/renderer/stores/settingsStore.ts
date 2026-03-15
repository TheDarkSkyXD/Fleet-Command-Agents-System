import { create } from 'zustand';

export interface AppSettings {
  // Agent settings
  maxHierarchyDepth: number;
  maxConcurrentAgents: number;
  maxAgentsPerLead: number;

  // Terminal settings
  terminalFontFamily: string;
  terminalFontSize: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  maxHierarchyDepth: 2,
  maxConcurrentAgents: 10,
  maxAgentsPerLead: 5,
  terminalFontFamily: 'JetBrains Mono, Fira Code, monospace',
  terminalFontSize: 14,
};

interface SettingsState {
  settings: AppSettings;
  loaded: boolean;
  saving: boolean;

  // Actions
  loadSettings: () => Promise<void>;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: { ...DEFAULT_SETTINGS },
  loaded: false,
  saving: false,

  loadSettings: async () => {
    try {
      const result = await window.electronAPI.settingsGet('app_settings');
      if (result.data && typeof result.data === 'object') {
        set({
          settings: { ...DEFAULT_SETTINGS, ...(result.data as Partial<AppSettings>) },
          loaded: true,
        });
      } else {
        set({ loaded: true });
      }
    } catch {
      set({ loaded: true });
    }
  },

  updateSetting: async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const current = get().settings;
    const updated = { ...current, [key]: value };
    set({ settings: updated, saving: true });
    try {
      await window.electronAPI.settingsSet('app_settings', updated);
    } catch {
      // Revert on error
      set({ settings: current });
    } finally {
      set({ saving: false });
    }
  },
}));
