import { formatAbsoluteDateTime } from '../../lib/dateFormatting';
import { Tooltip } from '../Tooltip';
import './RelativeTime.css';

/**
 * Format an absolute date/time string with date, time, and timezone.
 * Re-exported for backward compatibility.
 */
export const formatAbsoluteTime = formatAbsoluteDateTime;

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
  const absoluteTime = dateStr ? formatAbsoluteDateTime(dateStr) : '';

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
