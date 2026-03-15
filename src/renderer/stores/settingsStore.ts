import { create } from 'zustand';

export interface AppSettings {
  // Agent settings
  maxHierarchyDepth: number;
  maxConcurrentAgents: number;
  maxAgentsPerLead: number;

  // Watchdog settings
  watchdogEnabled: boolean;
  watchdogIntervalMs: number;
  watchdogStaleThresholdMs: number;
  watchdogZombieThresholdMs: number;

  // Terminal settings
  terminalFontFamily: string;
  terminalFontSize: number;

  // Theme settings
  accentColor: string;

  // UI state
  sidebarCollapsed: boolean;

  // Setup
  setupCompleted: boolean;
}

export type AccentColorKey =
  | 'blue'
  | 'purple'
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'cyan'
  | 'orange'
  | 'indigo';

export const ACCENT_COLORS: Record<
  AccentColorKey,
  {
    label: string;
    primary: string;
    hover: string;
    ring: string;
    text: string;
    border: string;
    bgSubtle: string;
  }
> = {
  blue: {
    label: 'Blue',
    primary: '#3b82f6',
    hover: '#2563eb',
    ring: '#3b82f6',
    text: '#60a5fa',
    border: '#2563eb',
    bgSubtle: '#1e3a5f',
  },
  purple: {
    label: 'Purple',
    primary: '#8b5cf6',
    hover: '#7c3aed',
    ring: '#8b5cf6',
    text: '#a78bfa',
    border: '#7c3aed',
    bgSubtle: '#3b1f6e',
  },
  emerald: {
    label: 'Emerald',
    primary: '#10b981',
    hover: '#059669',
    ring: '#10b981',
    text: '#34d399',
    border: '#059669',
    bgSubtle: '#064e3b',
  },
  amber: {
    label: 'Amber',
    primary: '#f59e0b',
    hover: '#d97706',
    ring: '#f59e0b',
    text: '#fbbf24',
    border: '#d97706',
    bgSubtle: '#78350f',
  },
  rose: {
    label: 'Rose',
    primary: '#f43f5e',
    hover: '#e11d48',
    ring: '#f43f5e',
    text: '#fb7185',
    border: '#e11d48',
    bgSubtle: '#881337',
  },
  cyan: {
    label: 'Cyan',
    primary: '#06b6d4',
    hover: '#0891b2',
    ring: '#06b6d4',
    text: '#22d3ee',
    border: '#0891b2',
    bgSubtle: '#164e63',
  },
  orange: {
    label: 'Orange',
    primary: '#f97316',
    hover: '#ea580c',
    ring: '#f97316',
    text: '#fb923c',
    border: '#ea580c',
    bgSubtle: '#7c2d12',
  },
  indigo: {
    label: 'Indigo',
    primary: '#6366f1',
    hover: '#4f46e5',
    ring: '#6366f1',
    text: '#818cf8',
    border: '#4f46e5',
    bgSubtle: '#312e81',
  },
};

export const DEFAULT_SETTINGS: AppSettings = {
  maxHierarchyDepth: 2,
  maxConcurrentAgents: 10,
  maxAgentsPerLead: 5,
  watchdogEnabled: true,
  watchdogIntervalMs: 30000,
  watchdogStaleThresholdMs: 300000,
  watchdogZombieThresholdMs: 900000,
  terminalFontFamily: 'JetBrains Mono, Fira Code, monospace',
  terminalFontSize: 14,
  accentColor: 'blue',
  sidebarCollapsed: false,
  setupCompleted: false,
};

/** Apply accent color CSS custom properties to :root */
export function applyAccentColor(colorKey: string): void {
  const colors = ACCENT_COLORS[colorKey as AccentColorKey] || ACCENT_COLORS.blue;
  const root = document.documentElement;
  root.style.setProperty('--accent-primary', colors.primary);
  root.style.setProperty('--accent-hover', colors.hover);
  root.style.setProperty('--accent-ring', colors.ring);
  root.style.setProperty('--accent-text', colors.text);
  root.style.setProperty('--accent-border', colors.border);
  root.style.setProperty('--accent-bg-subtle', colors.bgSubtle);
}

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
        const merged = { ...DEFAULT_SETTINGS, ...(result.data as Partial<AppSettings>) };
        set({
          settings: merged,
          loaded: true,
        });
        applyAccentColor(merged.accentColor);
      } else {
        set({ loaded: true });
        applyAccentColor(DEFAULT_SETTINGS.accentColor);
      }
    } catch {
      set({ loaded: true });
      applyAccentColor(DEFAULT_SETTINGS.accentColor);
    }
  },

  updateSetting: async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const current = get().settings;
    const updated = { ...current, [key]: value };
    set({ settings: updated, saving: true });
    if (key === 'accentColor') {
      applyAccentColor(value as string);
    }
    try {
      await window.electronAPI.settingsSet('app_settings', updated);
    } catch {
      // Revert on error
      set({ settings: current });
      if (key === 'accentColor') {
        applyAccentColor(current.accentColor);
      }
    } finally {
      set({ saving: false });
    }
  },
}));
