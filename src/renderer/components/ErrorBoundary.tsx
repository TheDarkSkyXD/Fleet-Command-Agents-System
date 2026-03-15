import { Component, type ErrorInfo, type ReactNode } from 'react';
import { FiAlertTriangle, FiRefreshCw } from 'react-icons/fi';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Name of the section for display in the error fallback */
  sectionName?: string;
  /** Optional custom fallback component */
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * React Error Boundary that catches crashes in major UI sections
 * without crashing the entire app. Shows a friendly error screen
 * with a retry button to attempt re-rendering the section.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(
      `[ErrorBoundary] ${this.props.sectionName || 'Section'} crashed:`,
      error,
      errorInfo.componentStack,
    );
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <ErrorFallback
          sectionName={this.props.sectionName || 'This section'}
          error={this.state.error}
          onRetry={this.handleRetry}
        />
      );
    }

    return this.props.children;
  }
}

/**
 * Friendly error fallback UI with retry button.
 * Shows a non-technical message with an option to retry.
 */
function ErrorFallback({
  sectionName,
  error,
  onRetry,
}: {
  sectionName: string;
  error: Error | null;
  onRetry: () => void;
}) {
  return (
    <div
      className="flex h-full w-full items-center justify-center p-8"
      data-testid="error-boundary-fallback"
    >
      <div className="max-w-md text-center">
        {/* Icon */}
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
          <FiAlertTriangle className="h-8 w-8 text-red-400" />
        </div>

        {/* Friendly message */}
        <h2 className="mb-2 text-xl font-semibold text-slate-100">Something went wrong</h2>
        <p className="mb-6 text-sm text-slate-400">
          {sectionName} encountered an unexpected error. The rest of the app is still working fine.
        </p>

        {/* Error name (brief, non-technical) */}
        {error && (
          <div className="mb-6 rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-3">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
              Error Details
            </p>
            <p className="text-sm text-slate-300 font-mono break-words">
              {error.message || 'Unknown error'}
            </p>
          </div>
        )}

        {/* Retry button */}
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900"
          data-testid="error-boundary-retry"
        >
          <FiRefreshCw className="h-4 w-4" />
          Try Again
        </button>

        <p className="mt-4 text-xs text-slate-500">
          If this keeps happening, try restarting the application.
        </p>
      </div>
    </div>
  );
}
