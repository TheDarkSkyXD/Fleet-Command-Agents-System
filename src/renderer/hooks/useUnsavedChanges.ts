import { useCallback, useEffect, useState } from 'react';

/**
 * Global registry for unsaved changes tracking.
 * Components register their dirty state here, and navigation
 * interceptors check before allowing page transitions.
 */

type PendingNavigation = {
  type: 'sidebar' | 'popstate' | 'agent-select';
  page?: string;
  agentId?: string;
};

// Global state - shared across all consumers
const globalDirtyForms = new Map<string, string>();
let listeners: Array<() => void> = [];

function notifyListeners() {
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Register a form as having unsaved changes.
 * @param formId Unique identifier for the form
 * @param label Human-readable label (e.g., "Agent Spawn Form")
 */
export function registerDirtyForm(formId: string, label: string) {
  globalDirtyForms.set(formId, label);
  notifyListeners();
}

/**
 * Unregister a form (no longer has unsaved changes).
 */
export function unregisterDirtyForm(formId: string) {
  globalDirtyForms.delete(formId);
  notifyListeners();
}

/**
 * Check if any form has unsaved changes.
 */
export function hasUnsavedChanges(): boolean {
  return globalDirtyForms.size > 0;
}

/**
 * Get labels of all dirty forms.
 */
export function getDirtyFormLabels(): string[] {
  return Array.from(globalDirtyForms.values());
}

/**
 * Clear all dirty form registrations (e.g., after user confirms leave).
 */
export function clearAllDirtyForms() {
  globalDirtyForms.clear();
  notifyListeners();
}

/**
 * Hook for components that have forms with unsaved changes.
 * Registers/unregisters dirty state automatically.
 */
export function useFormDirtyTracking(formId: string, label: string, isDirty: boolean) {
  useEffect(() => {
    if (isDirty) {
      registerDirtyForm(formId, label);
    } else {
      unregisterDirtyForm(formId);
    }
    return () => {
      unregisterDirtyForm(formId);
    };
  }, [formId, label, isDirty]);
}

/**
 * Hook for the navigation interceptor (used in AppLayout).
 * Returns state and handlers for the unsaved changes dialog.
 */
export function useNavigationGuard() {
  const [showDialog, setShowDialog] = useState(false);
  const [pendingNav, setPendingNav] = useState<PendingNavigation | null>(null);

  // Subscribe to dirty state changes
  const [hasDirty, setHasDirty] = useState(false);
  const [dirtyLabels, setDirtyLabels] = useState<string[]>([]);

  useEffect(() => {
    const update = () => {
      setHasDirty(hasUnsavedChanges());
      setDirtyLabels(getDirtyFormLabels());
    };
    listeners.push(update);
    update();
    return () => {
      listeners = listeners.filter((l) => l !== update);
    };
  }, []);

  /**
   * Check if navigation should be allowed. If there are unsaved changes,
   * shows a confirmation dialog and returns false (navigation blocked).
   * Call confirmLeave() or cancelLeave() to resolve.
   */
  const guardNavigation = useCallback((nav: PendingNavigation): boolean => {
    if (!hasUnsavedChanges()) {
      return true; // No unsaved changes, allow navigation
    }
    setPendingNav(nav);
    setShowDialog(true);
    return false; // Block navigation, show dialog
  }, []);

  const confirmLeave = useCallback(() => {
    clearAllDirtyForms();
    setShowDialog(false);
    const nav = pendingNav;
    setPendingNav(null);
    return nav; // Return the pending navigation so caller can execute it
  }, [pendingNav]);

  const cancelLeave = useCallback(() => {
    setShowDialog(false);
    setPendingNav(null);
  }, []);

  return {
    showDialog,
    pendingNavigation: pendingNav,
    hasDirtyForms: hasDirty,
    dirtyFormLabels: dirtyLabels,
    guardNavigation,
    confirmLeave,
    cancelLeave,
  };
}
