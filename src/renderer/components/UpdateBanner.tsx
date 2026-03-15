import { useCallback, useEffect, useState } from 'react';
import { FiDownload, FiFileText, FiRefreshCw, FiX } from 'react-icons/fi';
import type { UpdateStatus } from '../../shared/types';
import { formatDateOnly } from '../lib/dateFormatting';

/** Format bytes to human-readable string */
function formatBytes(bytes: number | null): string {
  if (!bytes) return '0 B';
  if (bytes > 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes > 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes > 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

/**
 * Simple markdown renderer for GitHub release notes.
 * Handles headers, bold, italic, links, code blocks, inline code, lists, and horizontal rules.
 */
function renderMarkdown(md: string): string {
  const html = md
    // Escape HTML entities first
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Code blocks (``` ... ```)
    .replace(/```[\s\S]*?```/g, (match) => {
      const code = match.slice(3, -3).replace(/^\w*\n/, '');
      return `<pre class="bg-black/30 rounded p-3 text-xs overflow-x-auto my-2"><code>${code}</code></pre>`;
    })
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="bg-black/30 rounded px-1.5 py-0.5 text-xs">$1</code>')
    // Headers
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-4 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold mt-4 mb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-4 mb-2">$1</h1>')
    // Bold and italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Links
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" class="text-blue-300 underline hover:text-blue-200" target="_blank" rel="noopener noreferrer">$1</a>',
    )
    // Horizontal rules
    .replace(/^---+$/gm, '<hr class="border-white/20 my-3" />')
    // Unordered list items
    .replace(/^[\-\*] (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    // Line breaks (double newline = paragraph break)
    .replace(/\n\n/g, '</p><p class="my-2">')
    .replace(/\n/g, '<br />');

  return `<p class="my-2">${html}</p>`;
}

/**
 * Changelog modal that renders release notes from GitHub in markdown format.
 */
function ChangelogModal({
  version,
  releaseNotes,
  releaseDate,
  onClose,
}: {
  version: string | null;
  releaseNotes: string | null;
  releaseDate: string | null;
  onClose: () => void;
}) {
  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const formattedDate = releaseDate
    ? formatDateOnly(releaseDate)
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      data-testid="changelog-modal"
    >
      <div className="relative mx-4 flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl bg-gray-900 border border-gray-700 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-700 px-6 py-4">
          <div className="flex items-center gap-3">
            <FiFileText className="h-5 w-5 text-blue-400" />
            <div>
              <h2 className="text-lg font-semibold text-white">
                {version ? `Version ${version}` : 'Release Notes'}
              </h2>
              {formattedDate && <p className="text-xs text-gray-400">Released {formattedDate}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
            title="Close"
            aria-label="Close"
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable content */}
        <div
          className="flex-1 overflow-y-auto px-6 py-4 text-sm text-gray-200 leading-relaxed changelog-content"
          data-testid="changelog-content"
        >
          {releaseNotes ? (
            <div
              // biome-ignore lint/security/noDangerouslySetInnerHtml: Rendering sanitized markdown from GitHub release notes
              dangerouslySetInnerHTML={{ __html: renderMarkdown(releaseNotes) }}
            />
          ) : (
            <p className="text-gray-400 italic">No release notes available for this version.</p>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-700 px-6 py-3 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-white hover:bg-gray-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function UpdateBanner() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    // Listen for update status events from main process
    const unsubStatus = window.electronAPI.onUpdateStatus((data: unknown) => {
      const updateStatus = data as UpdateStatus;
      setStatus(updateStatus);
      if (updateStatus.isDownloading) {
        setDownloading(true);
      }
    });

    const unsubProgress = window.electronAPI.onUpdateDownloadProgress((data) => {
      setStatus((prev) =>
        prev
          ? {
              ...prev,
              downloadProgress: data.percent,
              downloadedBytes: data.transferred,
              totalBytes: data.total,
              downloadSpeed: data.bytesPerSecond,
              isDownloading: true,
            }
          : null,
      );
    });

    const unsubDownloaded = window.electronAPI.onUpdateDownloaded((data) => {
      setDownloaded(true);
      setDownloading(false);
      setStatus((prev) =>
        prev
          ? {
              ...prev,
              isDownloaded: true,
              isDownloading: false,
              downloadProgress: 100,
              latestVersion: data.version,
              releaseNotes: data.releaseNotes ?? prev.releaseNotes,
            }
          : null,
      );
    });

    const unsubError = window.electronAPI.onUpdateError((data) => {
      setDownloading(false);
      setInstalling(false);
      setStatus((prev) => (prev ? { ...prev, error: data.message, isDownloading: false } : null));
    });

    // Also poll initial status once
    window.electronAPI.updateStatus().then((result) => {
      if (result.data) {
        setStatus(result.data);
        if (result.data.isDownloaded) setDownloaded(true);
        if (result.data.isDownloading) setDownloading(true);
      }
    });

    return () => {
      unsubStatus();
      unsubProgress();
      unsubDownloaded();
      unsubError();
    };
  }, []);

  const handleDownload = useCallback(() => {
    setDownloading(true);
    window.electronAPI.updateDownload();
  }, []);

  const handleInstall = useCallback(() => {
    setInstalling(true);
    window.electronAPI.updateInstall();
  }, []);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  const handleViewChangelog = useCallback(() => {
    setShowChangelog(true);
  }, []);

  const handleCloseChangelog = useCallback(() => {
    setShowChangelog(false);
  }, []);

  // Don't render if no update or dismissed
  if (!status?.updateAvailable || dismissed) return null;

  // Format download speed
  const formatSpeed = (bps: number | null) => {
    if (!bps) return '';
    if (bps > 1024 * 1024) return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
    if (bps > 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
    return `${bps} B/s`;
  };

  const progressPercent = status.downloadProgress != null ? Math.round(status.downloadProgress) : 0;

  return (
    <>
      <div
        className="relative flex flex-col bg-blue-600/90 text-white text-sm"
        data-testid="update-banner"
      >
        <div className="flex items-center gap-3 px-4 py-2">
          <div className="relative z-10 flex items-center gap-3 flex-1">
            {downloaded ? (
              <>
                <FiRefreshCw className={`w-4 h-4 ${installing ? 'animate-spin' : ''}`} />
                <span>
                  Fleet Command <strong>v{status.latestVersion}</strong> is ready to install.
                </span>
                <button
                  type="button"
                  onClick={handleViewChangelog}
                  className="ml-1 inline-flex items-center gap-1 rounded bg-white/10 px-3 py-1 text-xs font-medium hover:bg-white/20 transition-colors"
                  data-testid="view-changelog-btn"
                >
                  <FiFileText className="w-3 h-3" />
                  View Changelog
                </button>
                <button
                  type="button"
                  onClick={handleInstall}
                  disabled={installing}
                  className="ml-1 inline-flex items-center gap-1 rounded bg-white/20 px-3 py-1 text-xs font-medium hover:bg-white/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="update-install-btn"
                >
                  <FiRefreshCw className={`w-3 h-3 ${installing ? 'animate-spin' : ''}`} />
                  {installing ? 'Installing...' : 'Restart & Update'}
                </button>
              </>
            ) : downloading ? (
              <>
                <FiDownload className="w-4 h-4 animate-bounce" />
                <span>Downloading v{status.latestVersion}...</span>
                <span
                  className="ml-1 font-mono font-bold tabular-nums"
                  data-testid="update-download-percent"
                >
                  {progressPercent}%
                </span>
                {status.downloadedBytes != null && status.totalBytes != null && (
                  <span className="ml-1 text-blue-200 text-xs">
                    ({formatBytes(status.downloadedBytes)} / {formatBytes(status.totalBytes)})
                  </span>
                )}
                {status.downloadSpeed ? (
                  <span className="ml-1 text-blue-200 text-xs">
                    &mdash; {formatSpeed(status.downloadSpeed)}
                  </span>
                ) : null}
                {status.releaseNotes && (
                  <button
                    type="button"
                    onClick={handleViewChangelog}
                    className="ml-2 inline-flex items-center gap-1 rounded bg-white/10 px-3 py-1 text-xs font-medium hover:bg-white/20 transition-colors"
                    data-testid="view-changelog-btn"
                  >
                    <FiFileText className="w-3 h-3" />
                    Changelog
                  </button>
                )}
              </>
            ) : (
              <>
                <FiDownload className="w-4 h-4" />
                <span>
                  A new version of Fleet Command is available:{' '}
                  <strong>v{status.latestVersion}</strong>
                </span>
                <button
                  type="button"
                  onClick={handleViewChangelog}
                  className="ml-1 inline-flex items-center gap-1 rounded bg-white/10 px-3 py-1 text-xs font-medium hover:bg-white/20 transition-colors"
                  data-testid="view-changelog-btn"
                >
                  <FiFileText className="w-3 h-3" />
                  View Changelog
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="ml-1 inline-flex items-center gap-1 rounded bg-white/20 px-3 py-1 text-xs font-medium hover:bg-white/30 transition-colors"
                  data-testid="update-download-btn"
                >
                  <FiDownload className="w-3 h-3" />
                  Download
                </button>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            className="relative z-10 rounded p-1 hover:bg-white/20 transition-colors"
            title="Dismiss"
            aria-label="Dismiss"
          >
            <FiX className="w-4 h-4" />
          </button>
        </div>

        {/* Download progress bar */}
        {downloading && (
          <div className="w-full h-1.5 bg-blue-800/60" data-testid="update-progress-bar">
            <div
              className="h-full bg-blue-300 transition-all duration-300 ease-out"
              style={{ width: `${progressPercent}%` }}
              data-testid="update-progress-fill"
            />
          </div>
        )}
      </div>

      {/* Changelog Modal */}
      {showChangelog && (
        <ChangelogModal
          version={status.latestVersion}
          releaseNotes={status.releaseNotes}
          releaseDate={status.releaseDate}
          onClose={handleCloseChangelog}
        />
      )}
    </>
  );
}
