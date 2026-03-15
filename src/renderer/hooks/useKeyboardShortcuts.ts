import { useEffect } from 'react';
import {
  type ShortcutAction,
  matchesKeyCombo,
  useKeyboardShortcutsStore,
} from '../stores/keyboardShortcutsStore';

type ShortcutHandlers = Partial<Record<ShortcutAction, () => void>>;

/**
 * Global keyboard shortcut handler hook.
 * Listens for all registered shortcuts and calls the appropriate handler.
 *
 * Usage:
 * ```ts
 * useKeyboardShortcuts({
 *   'command-palette': () => togglePalette(),
 *   'navigate-agents': () => navigate('agents'),
 * });
 * ```
 */
export function useKeyboardShortcuts(handlers: ShortcutHandlers): void {
  const shortcuts = useKeyboardShortcutsStore((s) => s.shortcuts);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't trigger shortcuts when typing in inputs (unless it's a modifier combo)
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      // Allow shortcuts with Ctrl/Meta even in inputs
      if (isInput && !e.ctrlKey && !e.metaKey) return;

      for (const [action, shortcut] of Object.entries(shortcuts)) {
        if (!shortcut.enabled) continue;
        if (matchesKeyCombo(e, shortcut.keys)) {
          const handler = handlers[action as ShortcutAction];
          if (handler) {
            e.preventDefault();
            e.stopPropagation();
            handler();
            return;
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [shortcuts, handlers]);
}
