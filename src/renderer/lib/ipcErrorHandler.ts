import { toast } from 'sonner';

/**
 * Translates raw IPC/network errors into user-friendly messages.
 * Strips technical details like stack traces and error codes.
 */
function getUserFriendlyMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);

  // Connection/network errors
  if (
    raw.includes('ECONNREFUSED') ||
    raw.includes('ECONNRESET') ||
    raw.includes('ENOTFOUND') ||
    raw.includes('ETIMEDOUT') ||
    raw.includes('net::ERR_')
  ) {
    return 'Unable to connect to the application backend. Please check if the app is running properly.';
  }

  // IPC channel errors
  if (raw.includes('No handler registered') || raw.includes('ipcRenderer')) {
    return 'This feature is temporarily unavailable. Try restarting the application.';
  }

  // Database errors
  if (
    raw.includes('SQLITE') ||
    raw.includes('database') ||
    raw.includes('EBUSY') ||
    raw.includes('locked')
  ) {
    return 'A database error occurred. Please try again in a moment.';
  }

  // Permission errors
  if (raw.includes('EACCES') || raw.includes('EPERM') || raw.includes('permission')) {
    return 'Permission denied. Please check your file system permissions.';
  }

  // File system errors
  if (raw.includes('ENOENT') || raw.includes('no such file')) {
    return 'A required file or directory was not found. The project configuration may need to be updated.';
  }

  // Process errors
  if (raw.includes('ESRCH') || raw.includes('process') || raw.includes('spawn')) {
    return 'Failed to manage the agent process. The process may have already stopped.';
  }

  // Git errors
  if (raw.includes('fatal:') || raw.includes('git')) {
    return 'A Git operation failed. Please check your repository status.';
  }

  // Generic IPC invoke error
  if (raw.includes('An object could not be cloned') || raw.includes('invoke')) {
    return 'A communication error occurred between app components. Please try again.';
  }

  // Timeout
  if (raw.includes('timeout') || raw.includes('Timeout')) {
    return 'The operation timed out. Please try again.';
  }

  // If the error is short and descriptive enough, use it directly
  if (raw.length < 100 && !raw.includes('Error:') && !raw.includes('at ')) {
    return raw;
  }

  // Fallback generic message
  return 'An unexpected error occurred. Please try again.';
}

/**
 * Options for the IPC error handler
 */
interface IpcErrorOptions {
  /** Context label for the operation (e.g., "loading agents", "saving settings") */
  context: string;
  /** Optional retry function to call when user clicks retry */
  retry?: () => void | Promise<void>;
  /** Whether to show a toast notification (default: true) */
  showToast?: boolean;
  /** Whether to log to console (default: true) */
  logToConsole?: boolean;
}

/**
 * Handle IPC errors with user-friendly messages and optional retry.
 *
 * Usage:
 * ```ts
 * try {
 *   const result = await window.electronAPI.agentList();
 * } catch (err) {
 *   handleIpcError(err, {
 *     context: 'loading agents',
 *     retry: () => loadAgents(),
 *   });
 * }
 * ```
 */
export function handleIpcError(error: unknown, options: IpcErrorOptions): string {
  const { context, retry, showToast = true, logToConsole = true } = options;
  const friendlyMessage = getUserFriendlyMessage(error);

  if (logToConsole) {
    console.error(`IPC error while ${context}:`, error);
  }

  if (showToast) {
    if (retry) {
      toast.error(`Error ${context}`, {
        description: friendlyMessage,
        duration: 8000,
        action: {
          label: 'Retry',
          onClick: () => {
            retry();
          },
        },
      });
    } else {
      toast.error(`Error ${context}`, {
        description: friendlyMessage,
        duration: 6000,
      });
    }
  }

  return friendlyMessage;
}

/**
 * Wraps an async IPC call with error handling.
 * Returns { data, error } - never throws.
 *
 * Usage:
 * ```ts
 * const { data, error } = await safeIpcCall(
 *   () => window.electronAPI.agentList(),
 *   { context: 'loading agents', retry: loadAgents }
 * );
 * if (error) {
 *   setError(error);
 *   return;
 * }
 * ```
 */
export async function safeIpcCall<T>(
  call: () => Promise<T>,
  options: IpcErrorOptions,
): Promise<{ data: T | null; error: string | null }> {
  try {
    const data = await call();
    return { data, error: null };
  } catch (err) {
    const error = handleIpcError(err, options);
    return { data: null, error };
  }
}
