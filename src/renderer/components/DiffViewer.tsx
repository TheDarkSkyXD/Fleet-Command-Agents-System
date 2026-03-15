import { html, parse } from 'diff2html';
import type { DiffFile } from 'diff2html/lib/types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import 'diff2html/bundles/css/diff2html.min.css';

export type FileDecision = 'approved' | 'rejected' | 'pending';

export interface FileReviewState {
  [filePath: string]: FileDecision;
}

interface DiffViewerProps {
  diffString: string;
  branchName: string;
  onClose: () => void;
  /** Whether to show approve/reject buttons per file */
  reviewMode?: boolean;
  /** Callback when file decisions change */
  onFileDecisionsChange?: (decisions: FileReviewState) => void;
  /** Callback to proceed with merge of approved files */
  onProceedMerge?: (approvedFiles: string[]) => void;
}

function FileReviewHeader({
  fileName,
  decision,
  onApprove,
  onReject,
}: {
  fileName: string;
  decision: FileDecision;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-slate-700 bg-slate-800/80 px-4 py-2">
      <span className="font-mono text-sm text-slate-300 truncate mr-4" title={fileName}>
        {fileName}
      </span>
      <div className="flex items-center gap-2 shrink-0">
        {decision === 'approved' && (
          <span className="text-xs font-medium text-emerald-400 mr-2">Approved</span>
        )}
        {decision === 'rejected' && (
          <span className="text-xs font-medium text-red-400 mr-2">Rejected</span>
        )}
        <button
          type="button"
          onClick={onApprove}
          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
            decision === 'approved'
              ? 'bg-emerald-600 text-white ring-1 ring-emerald-400'
              : 'border border-emerald-600/50 bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600/20'
          }`}
          title="Approve this file"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={onReject}
          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
            decision === 'rejected'
              ? 'bg-red-600 text-white ring-1 ring-red-400'
              : 'border border-red-600/50 bg-red-600/10 text-red-400 hover:bg-red-600/20'
          }`}
          title="Reject this file"
        >
          Reject
        </button>
      </div>
    </div>
  );
}

export function DiffViewer({
  diffString,
  branchName,
  onClose,
  reviewMode = false,
  onFileDecisionsChange,
  onProceedMerge,
}: DiffViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<'side-by-side' | 'line-by-line'>('side-by-side');
  const [fileDecisions, setFileDecisions] = useState<FileReviewState>({});

  // Parse diff into individual files
  const diffFiles = useMemo(() => {
    if (!diffString) return [];
    return parse(diffString);
  }, [diffString]);

  // Initialize file decisions when files change
  useEffect(() => {
    if (reviewMode && diffFiles.length > 0) {
      setFileDecisions((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const file of diffFiles) {
          const name = file.newName || file.oldName || 'unknown';
          if (!(name in next)) {
            next[name] = 'pending';
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }
  }, [diffFiles, reviewMode]);

  // Notify parent of decision changes
  useEffect(() => {
    onFileDecisionsChange?.(fileDecisions);
  }, [fileDecisions, onFileDecisionsChange]);

  // Generate HTML for each file separately (for review mode) or all at once
  const renderDiffHtml = useCallback(
    (files: DiffFile[]) => {
      return html(files, {
        drawFileList: false,
        matching: 'lines',
        outputFormat: viewMode === 'side-by-side' ? 'side-by-side' : 'line-by-line',
        renderNothingWhenEmpty: false,
      });
    },
    [viewMode],
  );

  // Full diff HTML for non-review mode
  const fullDiffHtml = useMemo(() => {
    if (!diffString) return '';
    const diffJson = parse(diffString);
    return html(diffJson, {
      drawFileList: true,
      matching: 'lines',
      outputFormat: viewMode === 'side-by-side' ? 'side-by-side' : 'line-by-line',
      renderNothingWhenEmpty: false,
    });
  }, [diffString, viewMode]);

  // Scroll to top when content changes
  useEffect(() => {
    if (containerRef.current && fullDiffHtml !== undefined) {
      containerRef.current.scrollTop = 0;
    }
  }, [fullDiffHtml]);

  const handleApprove = useCallback((fileName: string) => {
    setFileDecisions((prev) => ({
      ...prev,
      [fileName]: prev[fileName] === 'approved' ? 'pending' : 'approved',
    }));
  }, []);

  const handleReject = useCallback((fileName: string) => {
    setFileDecisions((prev) => ({
      ...prev,
      [fileName]: prev[fileName] === 'rejected' ? 'pending' : 'rejected',
    }));
  }, []);

  const handleApproveAll = useCallback(() => {
    setFileDecisions((prev) => {
      const next: FileReviewState = {};
      for (const key of Object.keys(prev)) {
        next[key] = 'approved';
      }
      return next;
    });
  }, []);

  const handleRejectAll = useCallback(() => {
    setFileDecisions((prev) => {
      const next: FileReviewState = {};
      for (const key of Object.keys(prev)) {
        next[key] = 'rejected';
      }
      return next;
    });
  }, []);

  const approvedCount = Object.values(fileDecisions).filter((d) => d === 'approved').length;
  const rejectedCount = Object.values(fileDecisions).filter((d) => d === 'rejected').length;
  const pendingCount = Object.values(fileDecisions).filter((d) => d === 'pending').length;
  const totalFiles = diffFiles.length;

  const handleProceedMerge = useCallback(() => {
    const approvedFiles = Object.entries(fileDecisions)
      .filter(([, decision]) => decision === 'approved')
      .map(([file]) => file);
    onProceedMerge?.(approvedFiles);
  }, [fileDecisions, onProceedMerge]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/95">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700 bg-slate-800 px-6 py-3">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-slate-50">Diff Viewer</h2>
          <span className="rounded-full border border-slate-600 bg-slate-700 px-3 py-0.5 text-xs font-mono text-slate-300">
            {branchName}
          </span>
          <span className="text-xs text-slate-400">
            {totalFiles} file{totalFiles !== 1 ? 's' : ''} changed
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* View mode toggle */}
          <div className="flex rounded-md border border-slate-600 bg-slate-700">
            <button
              type="button"
              onClick={() => setViewMode('side-by-side')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === 'side-by-side'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:text-white'
              } rounded-l-md`}
            >
              Side by Side
            </button>
            <button
              type="button"
              onClick={() => setViewMode('line-by-line')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === 'line-by-line'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:text-white'
              } rounded-r-md`}
            >
              Unified
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-600 px-3 py-1.5 text-sm font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Review mode status bar */}
      {reviewMode && totalFiles > 0 && (
        <div className="flex items-center justify-between border-b border-slate-700 bg-slate-800/60 px-6 py-2">
          <div className="flex items-center gap-4 text-xs">
            <span className="text-emerald-400">{approvedCount} approved</span>
            <span className="text-red-400">{rejectedCount} rejected</span>
            <span className="text-slate-400">{pendingCount} pending</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleApproveAll}
              className="rounded-md border border-emerald-600/50 bg-emerald-600/10 px-3 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-600/20 transition-colors"
            >
              Approve All
            </button>
            <button
              type="button"
              onClick={handleRejectAll}
              className="rounded-md border border-red-600/50 bg-red-600/10 px-3 py-1 text-xs font-medium text-red-400 hover:bg-red-600/20 transition-colors"
            >
              Reject All
            </button>
            {onProceedMerge && approvedCount > 0 && (
              <button
                type="button"
                onClick={handleProceedMerge}
                className="rounded-md bg-emerald-600 px-4 py-1 text-xs font-medium text-white hover:bg-emerald-500 transition-colors"
              >
                Merge {approvedCount} Approved File{approvedCount !== 1 ? 's' : ''}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Diff content */}
      <div ref={containerRef} className="flex-1 overflow-auto diff-viewer-container">
        {reviewMode && diffFiles.length > 0 ? (
          // Review mode: render each file with approve/reject header
          <div>
            {diffFiles.map((file) => {
              const fileName = file.newName || file.oldName || 'unknown';
              const decision = fileDecisions[fileName] || 'pending';
              const fileDiffHtml = renderDiffHtml([file]);

              let borderColor = 'border-slate-700';
              if (decision === 'approved') borderColor = 'border-emerald-600/40';
              if (decision === 'rejected') borderColor = 'border-red-600/40';

              let bgColor = 'bg-transparent';
              if (decision === 'approved') bgColor = 'bg-emerald-950/20';
              if (decision === 'rejected') bgColor = 'bg-red-950/20';

              return (
                <div
                  key={fileName}
                  className={`border-b ${borderColor} ${bgColor} transition-colors`}
                >
                  <FileReviewHeader
                    fileName={fileName}
                    decision={decision}
                    onApprove={() => handleApprove(fileName)}
                    onReject={() => handleReject(fileName)}
                  />
                  <div
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: diff2html generates safe HTML from git diff output
                    dangerouslySetInnerHTML={{ __html: fileDiffHtml }}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          // Standard mode: render full diff
          <div
            // biome-ignore lint/security/noDangerouslySetInnerHtml: diff2html generates safe HTML from git diff output
            dangerouslySetInnerHTML={{
              __html:
                fullDiffHtml ||
                '<div class="p-8 text-center text-slate-400">No changes found</div>',
            }}
          />
        )}
      </div>

      {/* Dark theme overrides for diff2html */}
      <style>{`
        .diff-viewer-container .d2h-wrapper {
          background: transparent;
        }
        .diff-viewer-container .d2h-file-header {
          background-color: #1e293b;
          border-color: #334155;
          color: #e2e8f0;
          padding: 8px 12px;
        }
        .diff-viewer-container .d2h-file-name-wrapper {
          color: #e2e8f0;
        }
        .diff-viewer-container .d2h-file-name {
          color: #93c5fd;
        }
        .diff-viewer-container .d2h-tag {
          background-color: #334155;
          border-color: #475569;
          color: #94a3b8;
        }
        .diff-viewer-container .d2h-file-list-wrapper {
          background-color: #0f172a;
          border-color: #334155;
          margin-bottom: 0;
        }
        .diff-viewer-container .d2h-file-list-header {
          background-color: #1e293b;
          border-color: #334155;
          color: #e2e8f0;
        }
        .diff-viewer-container .d2h-file-list-line {
          color: #cbd5e1;
        }
        .diff-viewer-container .d2h-file-list-line a {
          color: #93c5fd;
        }
        .diff-viewer-container .d2h-file-switch {
          display: none;
        }
        .diff-viewer-container .d2h-diff-table {
          font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
          font-size: 13px;
          border-color: #334155;
        }
        .diff-viewer-container .d2h-code-line,
        .diff-viewer-container .d2h-code-side-line {
          background-color: #0f172a;
          color: #e2e8f0;
          border-color: #1e293b;
        }
        .diff-viewer-container .d2h-code-line-ctn {
          color: #e2e8f0;
        }
        /* Line numbers */
        .diff-viewer-container .d2h-code-linenumber,
        .diff-viewer-container .d2h-code-side-linenumber {
          background-color: #1e293b;
          color: #64748b;
          border-color: #334155;
        }
        /* Empty line placeholder */
        .diff-viewer-container .d2h-code-side-emptyplaceholder,
        .diff-viewer-container .d2h-emptyplaceholder {
          background-color: #1a1a2e;
          border-color: #1e293b;
        }
        /* Additions - green */
        .diff-viewer-container .d2h-ins {
          background-color: rgba(34, 197, 94, 0.12);
          border-color: rgba(34, 197, 94, 0.2);
        }
        .diff-viewer-container .d2h-ins .d2h-code-line-ctn,
        .diff-viewer-container .d2h-ins .d2h-code-side-line {
          background-color: rgba(34, 197, 94, 0.12);
        }
        .diff-viewer-container .d2h-ins .d2h-code-linenumber,
        .diff-viewer-container .d2h-ins .d2h-code-side-linenumber {
          background-color: rgba(34, 197, 94, 0.2);
          color: #86efac;
          border-color: rgba(34, 197, 94, 0.3);
        }
        .diff-viewer-container ins {
          background-color: rgba(34, 197, 94, 0.3);
          color: #bbf7d0;
          text-decoration: none;
        }
        /* Deletions - red */
        .diff-viewer-container .d2h-del {
          background-color: rgba(239, 68, 68, 0.12);
          border-color: rgba(239, 68, 68, 0.2);
        }
        .diff-viewer-container .d2h-del .d2h-code-line-ctn,
        .diff-viewer-container .d2h-del .d2h-code-side-line {
          background-color: rgba(239, 68, 68, 0.12);
        }
        .diff-viewer-container .d2h-del .d2h-code-linenumber,
        .diff-viewer-container .d2h-del .d2h-code-side-linenumber {
          background-color: rgba(239, 68, 68, 0.2);
          color: #fca5a5;
          border-color: rgba(239, 68, 68, 0.3);
        }
        .diff-viewer-container del {
          background-color: rgba(239, 68, 68, 0.3);
          color: #fecaca;
          text-decoration: none;
        }
        /* Info/hunk headers */
        .diff-viewer-container .d2h-info {
          background-color: rgba(59, 130, 246, 0.1);
          color: #93c5fd;
          border-color: rgba(59, 130, 246, 0.2);
        }
        .diff-viewer-container .d2h-info .d2h-code-linenumber,
        .diff-viewer-container .d2h-info .d2h-code-side-linenumber {
          background-color: rgba(59, 130, 246, 0.15);
          color: #60a5fa;
        }
        /* File stats */
        .diff-viewer-container .d2h-file-stats {
          color: #94a3b8;
        }
        .diff-viewer-container .d2h-lines-added {
          color: #4ade80;
        }
        .diff-viewer-container .d2h-lines-deleted {
          color: #f87171;
        }
        /* Scrollbar */
        .diff-viewer-container::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .diff-viewer-container::-webkit-scrollbar-track {
          background: #0f172a;
        }
        .diff-viewer-container::-webkit-scrollbar-thumb {
          background: #334155;
          border-radius: 4px;
        }
        .diff-viewer-container::-webkit-scrollbar-thumb:hover {
          background: #475569;
        }
      `}</style>
    </div>
  );
}
