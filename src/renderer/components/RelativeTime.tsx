import { Tooltip } from './Tooltip';

/**
 * Format an absolute date/time string with date, time, and timezone.
 * Example: "Mar 15, 2026, 2:30:45 PM EST"
 */
export function formatAbsoluteTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr.endsWith?.('Z') ? dateStr : dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    });
  } catch {
    return dateStr ?? '';
  }
}

interface RelativeTimeProps {
  /** The ISO date string or date-parseable string */
  dateStr: string | null | undefined;
  /** The relative time text to display (e.g. "5m ago") */
  relativeText: string;
  /** Additional className for the wrapper span */
  className?: string;
  /** data-testid attribute */
  'data-testid'?: string;
}

/**
 * Displays relative time text with a tooltip showing the absolute date/time.
 * Use this component to wrap any relative timestamp in the UI so users
 * can hover to see the full date, time, and timezone.
 */
export function RelativeTime({
  dateStr,
  relativeText,
  className = '',
  'data-testid': testId,
}: RelativeTimeProps) {
  const absoluteTime = dateStr ? formatAbsoluteTime(dateStr) : '';

  return (
    <Tooltip content={absoluteTime} position="top" delay={200} disabled={!absoluteTime}>
      <span
        className={className}
        data-testid={testId}
        style={{ cursor: absoluteTime ? 'default' : undefined }}
      >
        {relativeText}
      </span>
    </Tooltip>
  );
}
