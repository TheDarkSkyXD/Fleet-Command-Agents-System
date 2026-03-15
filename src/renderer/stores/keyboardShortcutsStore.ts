import { create } from 'zustand';

export interface KeyboardShortcut {
  id: string;
  label: string;
  category: string;
  /** Key combo string e.g. "Ctrl+K", "Ctrl+Shift+A" */
  keys: string;
  /** Whether this shortcut is enabled */
  enabled: boolean;
}

export type ShortcutAction =
  | 'command-palette'
  | 'navigate-agents'
  | 'navigate-tasks'
  | 'navigate-mail'
  | 'navigate-settings'
  | 'navigate-metrics'
  | 'navigate-merge'
  | 'navigate-worktrees'
  | 'navigate-notifications'
  | 'navigate-debug';

export const DEFAULT_SHORTCUTS: Record<ShortcutAction, KeyboardShortcut> = {
  'command-palette': {
    id: 'command-palette',
    label: 'Open Command Palette',
    category: 'General',
    keys: 'Ctrl+K',
    enabled: true,
  },
  'navigate-agents': {
    id: 'navigate-agents',
    label: 'Go to Agents',
    category: 'Navigation',
    keys: 'Ctrl+1',
    enabled: true,
  },
  'navigate-tasks': {
    id: 'navigate-tasks',
    label: 'Go to Tasks',
    category: 'Navigation',
    keys: 'Ctrl+2',
    enabled: true,
  },
  'navigate-mail': {
    id: 'navigate-mail',
    label: 'Go to Mail',
    category: 'Navigation',
    keys: 'Ctrl+3',
    enabled: true,
  },
  'navigate-merge': {
    id: 'navigate-merge',
    label: 'Go to Merge Queue',
    category: 'Navigation',
    keys: 'Ctrl+4',
    enabled: true,
  },
  'navigate-worktrees': {
    id: 'navigate-worktrees',
    label: 'Go to Worktrees',
    category: 'Navigation',
    keys: 'Ctrl+5',
    enabled: true,
  },
  'navigate-metrics': {
    id: 'navigate-metrics',
    label: 'Go to Metrics',
    category: 'Navigation',
    keys: 'Ctrl+6',
    enabled: true,
  },
  'navigate-notifications': {
    id: 'navigate-notifications',
    label: 'Go to Notifications',
    category: 'Navigation',
    keys: 'Ctrl+7',
    enabled: true,
  },
  'navigate-settings': {
    id: 'navigate-settings',
    label: 'Go to Settings',
    category: 'Navigation',
    keys: 'Ctrl+,',
    enabled: true,
  },
  'navigate-debug': {
    id: 'navigate-debug',
    label: 'Go to Debug',
    category: 'Navigation',
    keys: 'Ctrl+Shift+D',
    enabled: true,
  },
};

const STORAGE_KEY = 'keyboard_shortcuts';

/**
 * Parse a key combo string like "Ctrl+Shift+K" into a structured object
 */
export function parseKeyCombo(keys: string): {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  key: string;
} {
  const parts = keys.split('+').map((p) => p.trim());
  const key = parts[parts.length - 1].toLowerCase();
  return {
    ctrl: parts.some((p) => p.toLowerCase() === 'ctrl'),
    shift: parts.some((p) => p.toLowerCase() === 'shift'),
    alt: parts.some((p) => p.toLowerCase() === 'alt'),
    meta: parts.some((p) => p.toLowerCase() === 'meta'),
    key,
  };
}

/**
 * Check if a KeyboardEvent matches a key combo string
 */
export function matchesKeyCombo(event: KeyboardEvent, keys: string): boolean {
  const combo = parseKeyCombo(keys);
  const eventKey = event.key.toLowerCase();

  // For number keys, also check the code (e.g., Digit1)
  const keyMatches =
    eventKey === combo.key ||
    (combo.key.match(/^\d$/) && event.code === `Digit${combo.key}`);

  // Ctrl or Meta (Cmd on Mac) both count as "Ctrl" in our system
  const ctrlMatches = combo.ctrl ? event.ctrlKey || event.metaKey : !event.ctrlKey && !event.metaKey;
  const shiftMatches = combo.shift ? event.shiftKey : !event.shiftKey;
  const altMatches = combo.alt ? event.altKey : !event.altKey;

  return !!(keyMatches && ctrlMatches && shiftMatches && altMatches);
}

/**
 * Format a key combo for display (e.g., show ⌘ on Mac)
 */
export function formatKeyCombo(keys: string): string {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  if (isMac) {
    return keys
      .replace(/Ctrl/gi, '⌘')
      .replace(/Alt/gi, '⌥')
      .replace(/Shift/gi, '⇧');
  }
  return keys;
}

/**
 * Convert a KeyboardEvent to a key combo string for recording
 */
export function eventToKeyCombo(event: KeyboardEvent): string | null {
  const key = event.key;
  // Skip modifier-only keys
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return null;

  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push('Ctrl');
  if (event.shiftKey) parts.push('Shift');
  if (event.altKey) parts.push('Alt');

  // Must have at least one modifier
  if (parts.length === 0) return null;

  // Normalize key display
  let displayKey = key.length === 1 ? key.toUpperCase() : key;
  // Handle special keys
  if (key === ',') displayKey = ',';
  if (key === '.') displayKey = '.';
  if (key === '/') displayKey = '/';
  if (key === '`') displayKey = '`';

  parts.push(displayKey);
  return parts.join('+');
}

interface KeyboardShortcutsState {
  shortcuts: Record<ShortcutAction, KeyboardShortcut>;
  loaded: boolean;

  loadShortcuts: () => Promise<void>;
  updateShortcut: (id: ShortcutAction, keys: string) => Promise<void>;
  toggleShortcut: (id: ShortcutAction, enabled: boolean) => Promise<void>;
  resetToDefaults: () => Promise<void>;
  resetShortcut: (id: ShortcutAction) => Promise<void>;
}

export const useKeyboardShortcutsStore = create<KeyboardShortcutsState>((set, get) => ({
  shortcuts: { ...DEFAULT_SHORTCUTS },
  loaded: false,

  loadShortcuts: async () => {
    try {
      const result = await window.electronAPI.settingsGet(STORAGE_KEY);
      if (result.data && typeof result.data === 'object') {
        const stored = result.data as Record<string, Partial<KeyboardShortcut>>;
        const merged = { ...DEFAULT_SHORTCUTS };
        for (const [key, value] of Object.entries(stored)) {
          if (key in merged) {
            const action = key as ShortcutAction;
            merged[action] = {
              ...merged[action],
              ...value,
            };
          }
        }
        set({ shortcuts: merged, loaded: true });
      } else {
        set({ loaded: true });
      }
    } catch {
      set({ loaded: true });
    }
  },

  updateShortcut: async (id: ShortcutAction, keys: string) => {
    const current = get().shortcuts;
    const updated = {
      ...current,
      [id]: { ...current[id], keys },
    };
    set({ shortcuts: updated });
    try {
      await window.electronAPI.settingsSet(STORAGE_KEY, updated);
    } catch {
      set({ shortcuts: current });
    }
  },

  toggleShortcut: async (id: ShortcutAction, enabled: boolean) => {
    const current = get().shortcuts;
    const updated = {
      ...current,
      [id]: { ...current[id], enabled },
    };
    set({ shortcuts: updated });
    try {
      await window.electronAPI.settingsSet(STORAGE_KEY, updated);
    } catch {
      set({ shortcuts: current });
    }
  },

  resetToDefaults: async () => {
    const defaults = { ...DEFAULT_SHORTCUTS };
    set({ shortcuts: defaults });
    try {
      await window.electronAPI.settingsSet(STORAGE_KEY, defaults);
    } catch {
      // ignore
    }
  },

  resetShortcut: async (id: ShortcutAction) => {
    const current = get().shortcuts;
    const updated = {
      ...current,
      [id]: { ...DEFAULT_SHORTCUTS[id] },
    };
    set({ shortcuts: updated });
    try {
      await window.electronAPI.settingsSet(STORAGE_KEY, updated);
    } catch {
      set({ shortcuts: current });
    }
  },
}));
