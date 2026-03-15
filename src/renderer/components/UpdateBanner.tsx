import { useCallback, useEffect, useState } from 'react';
import { FiDownload, FiRefreshCw, FiX } from 'react-icons/fi';
import type { UpdateStatus } from '../../shared/types';

export function UpdateBanner() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    // Listen for update status events from main process
    window.electronAPI.onUpdateStatus((data: unknown) => {
      const updateStatus = data as UpdateStatus;
      setStatus(updateStatus);
      if (updateStatus.isDownloading) {
        setDownloading(true);
      }
    });

    window.electronAPI.onUpdateDownloadProgress((data) => {
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

    window.electronAPI.onUpdateDownloaded((data) => {
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
            }
          : null,
      );
    });

    window.electronAPI.onUpdateError((data) => {
      setDownloading(false);
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
      window.electronAPI.removeAllListeners('update:status');
      window.electronAPI.removeAllListeners('update:download-progress');
      window.electronAPI.removeAllListeners('update:downloaded');
      window.electronAPI.removeAllListeners('update:error');
    };
  }, []);

  const handleInstall = useCallback(() => {
    window.electronAPI.updateInstall();
  }, []);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
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

  return (
    <div className="relative flex items-center gap-3 bg-blue-600/90 px-4 py-2 text-white text-sm">
      {/* Download progress bar background */}
      {downloading && status.downloadProgress != null && (
        <div
          className="absolute inset-0 bg-blue-500/50 transition-all duration-300"
          style={{ width: `${status.downloadProgress}%` }}
        />
      )}

      <div className="relative z-10 flex items-center gap-3 flex-1">
        {downloaded ? (
          <>
            <FiRefreshCw className="w-4 h-4" />
            <span>
              Fleet Command <strong>v{status.latestVersion}</strong> is ready to install.
            </span>
            <button
              type="button"
              onClick={handleInstall}
              className="ml-2 inline-flex items-center gap-1 rounded bg-white/20 px-3 py-1 text-xs font-medium hover:bg-white/30 transition-colors"
            >
              <FiRefreshCw className="w-3 h-3" />
              Restart & Update
            </button>
          </>
        ) : downloading ? (
          <>
            <FiDownload className="w-4 h-4 animate-bounce" />
            <span>
              Downloading v{status.latestVersion}...{' '}
              {status.downloadProgress != null && `${status.downloadProgress}%`}
              {status.downloadSpeed ? ` (${formatSpeed(status.downloadSpeed)})` : ''}
            </span>
          </>
        ) : (
          <>
            <FiDownload className="w-4 h-4" />
            <span>
              A new version of Fleet Command is available: <strong>v{status.latestVersion}</strong>
            </span>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={handleDismiss}
        className="relative z-10 rounded p-1 hover:bg-white/20 transition-colors"
        title="Dismiss"
      >
        <FiX className="w-4 h-4" />
      </button>
    </div>
  );
}
