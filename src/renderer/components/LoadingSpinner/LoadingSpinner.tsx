import { FiLoader } from 'react-icons/fi';
import './LoadingSpinner.css';

interface LoadingSpinnerProps {
  /** Text shown below the spinner */
  message?: string;
  /** Size of the spinner icon (default 24) */
  size?: number;
  /** Additional CSS classes for the container */
  className?: string;
  /** data-testid attribute */
  testId?: string;
}

/**
 * Reusable loading spinner component shown during IPC data fetches.
 * Displays a centered spinning loader icon with an optional message.
 */
export function LoadingSpinner({
  message = 'Loading...',
  size = 24,
  className = '',
  testId = 'loading-spinner',
}: LoadingSpinnerProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center py-12 text-slate-400 ${className}`}
      data-testid={testId}
    >
      <FiLoader className="animate-spin mb-3" size={size} />
      {message && <p className="text-sm">{message}</p>}
    </div>
  );
}

interface LoadingSkeletonProps {
  /** Number of skeleton rows to display */
  rows?: number;
  /** data-testid attribute */
  testId?: string;
}

/**
 * Reusable skeleton loading component for list views.
 * Shows animated placeholder rows while data loads.
 */
export function LoadingSkeleton({ rows = 4, testId = 'loading-skeleton' }: LoadingSkeletonProps) {
  return (
    <div className="space-y-2" data-testid={testId}>
      {Array.from({ length: rows }).map((_unused, idx) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows are static placeholders
          key={idx}
          className="flex items-center gap-4 rounded-lg border border-slate-700 bg-slate-800 p-4 animate-pulse"
        >
          <div className="h-2.5 w-2.5 rounded-full bg-slate-600" />
          <div className="h-4 w-32 rounded bg-slate-600" />
          <div className="h-4 w-24 rounded bg-slate-600 ml-auto" />
        </div>
      ))}
    </div>
  );
}
