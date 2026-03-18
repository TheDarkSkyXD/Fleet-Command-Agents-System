/**
 * Centralized date formatting utilities using date-fns.
 * All timestamp formatting across the app should use these functions
 * for consistent display.
 */
import { format, formatDistanceToNow, differenceInSeconds } from 'date-fns';

/**
 * Parse a date string into a Date object safely.
 * SQLite stores dates as UTC via datetime('now') but without a timezone suffix.
 * We append 'Z' if no timezone indicator is present so JS correctly treats them as UTC
 * and converts to the user's local timezone on display.
 */
function parseDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  try {
    let normalized = dateStr;
    // SQLite datetime('now') format: "2026-03-16 04:39:00" — no TZ indicator
    // Append Z so Date() parses as UTC, then displays in user's local timezone
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(normalized) && !normalized.includes('Z') && !normalized.includes('+') && !normalized.includes('T')) {
      normalized = `${normalized.replace(' ', 'T')}Z`;
    }
    const d = new Date(normalized);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  } catch {
    return null;
  }
}

/**
 * Format a date as a full absolute datetime string.
 * Example: "Mar 15, 2026, 2:30:45 PM"
 */
export function formatAbsoluteDateTime(dateStr: string | null | undefined): string {
  const d = parseDate(dateStr);
  if (!d) return dateStr ?? '';
  return format(d, 'MMM d, yyyy, h:mm:ss a');
}

/**
 * Format a date as a short datetime (no seconds).
 * Example: "Mar 15, 2026, 2:30 PM"
 */
export function formatDateTime(dateStr: string | null | undefined): string {
  const d = parseDate(dateStr);
  if (!d) return dateStr ?? '';
  return format(d, 'MMM d, yyyy, h:mm a');
}

/**
 * Format a date as date only.
 * Example: "Mar 15, 2026"
 */
export function formatDateOnly(dateStr: string | null | undefined): string {
  const d = parseDate(dateStr);
  if (!d) return dateStr ?? '';
  return format(d, 'MMM d, yyyy');
}

/**
 * Format a date as time only.
 * Example: "2:30:45 PM"
 */
export function formatTimeOnly(dateStr: string | null | undefined): string {
  const d = parseDate(dateStr);
  if (!d) return dateStr ?? '';
  return format(d, 'h:mm:ss a');
}

/**
 * Format a date as a relative time string using date-fns formatDistanceToNow.
 * Examples: "just now", "5 minutes ago", "2 hours ago", "3 days ago"
 * Falls back to formatted date for older dates.
 */
export function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Never';
  const d = parseDate(dateStr);
  if (!d) return dateStr;
  const secondsAgo = differenceInSeconds(new Date(), d);
  if (secondsAgo < 10) return 'just now';
  return formatDistanceToNow(d, { addSuffix: true });
}

/**
 * Format uptime duration from a start time to now.
 * Example: "2h 15m 30s", "5m 12s"
 */
export function formatUptime(createdAt: string): string {
  const d = parseDate(createdAt);
  if (!d) return '0s';
  const uptime = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = uptime % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/**
 * Format a compact date for history/run logs.
 * Example: "3/15 2:30 PM"
 */
export function formatCompactDateTime(dateStr: string | null | undefined): string {
  const d = parseDate(dateStr);
  if (!d) return dateStr ?? '';
  return format(d, 'M/d h:mm a');
}
