import { html, parse } from 'diff2html';
import type { DiffFile } from 'diff2html/lib/types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import 'diff2html/bundles/css/diff2html.min.css';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import './DiffViewer.css';

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
          <Badge variant="outline" className="text-emerald-400 border-emerald-400/30 mr-2">Approved</Badge>
        )}
        {decision === 'rejected' && (
          <Badge variant="outline" className="text-red-400 border-red-400/30 mr-2">Rejected</Badge>
        )}
        <Button
          variant={decision === 'approved' ? 'default' : 'outline'}
          size="sm"
          onClick={onApprove}
          className={decision === 'approved'
            ? 'bg-slate-800/90 border border-emerald-500/30 text-emerald-300 hover:bg-slate-700/90 hover:border-emerald-400/40 shadow-sm'
            : 'border-emerald-600/50 bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600/20'
          }
          title="Approve this file"
        >
          Approve
        </Button>
        <Button
          variant={decision === 'rejected' ? 'destructive' : 'outline'}
          size="sm"
          onClick={onReject}
          className={decision === 'rejected'
            ? 'bg-slate-800/90 border border-red-500/30 text-red-300 hover:bg-slate-700/90 hover:border-red-400/40 shadow-sm'
            : 'border-red-600/50 bg-red-600/10 text-red-400 hover:bg-red-600/20'
          }
          title="Reject this file"
        >
          Reject
        </Button>
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
          <Badge variant="outline" className="rounded-full border-slate-600 bg-slate-700 px-3 py-0.5 font-mono text-slate-300">
            {branchName}
          </Badge>
          <span className="text-xs text-slate-400">
            {totalFiles} file{totalFiles !== 1 ? 's' : ''} changed
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* View mode toggle */}
          <div className="flex rounded-md border border-slate-600 bg-slate-700">
            <Button
              variant={viewMode === 'side-by-side' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('side-by-side')}
              className={`rounded-r-none h-auto px-3 py-1.5 text-xs ${
                viewMode === 'side-by-side'
                  ? 'bg-slate-800/90 border border-cyan-500/30 text-cyan-300 hover:bg-slate-700/90 hover:border-cyan-400/40 shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Side by Side
            </Button>
            <Button
              variant={viewMode === 'line-by-line' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('line-by-line')}
              className={`rounded-l-none h-auto px-3 py-1.5 text-xs ${
                viewMode === 'line-by-line'
                  ? 'bg-slate-800/90 border border-cyan-500/30 text-cyan-300 hover:bg-slate-700/90 hover:border-cyan-400/40 shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Unified
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
          >
            Close
          </Button>
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
            <Button
              variant="outline"
              size="sm"
              onClick={handleApproveAll}
              className="border-emerald-600/50 bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600/20"
            >
              Approve All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRejectAll}
              className="border-red-600/50 bg-red-600/10 text-red-400 hover:bg-red-600/20"
            >
              Reject All
            </Button>
            {onProceedMerge && approvedCount > 0 && (
              <Button
                size="sm"
                onClick={handleProceedMerge}
                className="bg-slate-800/90 border border-emerald-500/30 text-emerald-300 hover:bg-slate-700/90 hover:border-emerald-400/40 shadow-sm"
              >
                Merge {approvedCount} Approved File{approvedCount !== 1 ? 's' : ''}
              </Button>
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
          background-color: #1a1a1a;
          border-color: #2e2e2e;
          color: #e5e5e5;
          padding: 8px 12px;
        }
        .diff-viewer-container .d2h-file-name-wrapper {
          color: #e5e5e5;
        }
        .diff-viewer-container .d2h-file-name {
          color: #93c5fd;
        }
        .diff-viewer-container .d2h-tag {
          background-color: #2a2a2a;
          border-color: #404040;
          color: #a3a3a3;
        }
        .diff-viewer-container .d2h-file-list-wrapper {
          background-color: #111111;
          border-color: #2e2e2e;
          margin-bottom: 0;
        }
        .diff-viewer-container .d2h-file-list-header {
          background-color: #1a1a1a;
          border-color: #2e2e2e;
          color: #e5e5e5;
        }
        .diff-viewer-container .d2h-file-list-line {
          color: #d4d4d4;
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
          border-color: #2e2e2e;
        }
        .diff-viewer-container .d2h-code-line,
        .diff-viewer-container .d2h-code-side-line {
          background-color: #111111;
          color: #e5e5e5;
          border-color: #1a1a1a;
        }
        .diff-viewer-container .d2h-code-line-ctn {
          color: #e5e5e5;
        }
        /* Line numbers */
        .diff-viewer-container .d2h-code-linenumber,
        .diff-viewer-container .d2h-code-side-linenumber {
          background-color: #1a1a1a;
          color: #737373;
          border-color: #2e2e2e;
        }
        /* Empty line placeholder */
        .diff-viewer-container .d2h-code-side-emptyplaceholder,
        .diff-viewer-container .d2h-emptyplaceholder {
          background-color: #1a1a2e;
          border-color: #1a1a1a;
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
          color: #a3a3a3;
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
          background: #111111;
        }
        .diff-viewer-container::-webkit-scrollbar-thumb {
          background: #333333;
          border-radius: 4px;
        }
        .diff-viewer-container::-webkit-scrollbar-thumb:hover {
          background: #444444;
        }
      `}</style>
    </div>
  );
}
