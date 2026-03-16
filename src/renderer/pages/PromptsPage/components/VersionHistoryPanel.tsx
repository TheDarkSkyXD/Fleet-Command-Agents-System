import { useEffect, useState } from 'react';
import { FiClock, FiGitBranch } from 'react-icons/fi';
import type { PromptVersion } from '../../../../shared/types';
import { Button } from '../../../components/ui/button';

export function VersionHistoryPanel({
  promptId,
  onSelectVersion,
  onCompareVersions,
}: {
  promptId: string;
  onSelectVersion: (version: PromptVersion) => void;
  onCompareVersions: (versions: PromptVersion[]) => void;
}) {
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    window.electronAPI
      .promptVersionList(promptId)
      .then((res) => {
        if (mounted && res.data) setVersions(res.data);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [promptId]);

  if (loading) {
    return <div className="p-4 text-sm text-slate-400">Loading versions...</div>;
  }

  if (versions.length === 0) {
    return <div className="p-4 text-sm text-slate-400">No version history found.</div>;
  }

  return (
    <div className="space-y-2">
      {versions.length >= 2 && (
        <Button
          variant="outline"
          onClick={() => onCompareVersions(versions)}
          className="flex w-full items-center justify-center gap-2 border-cyan-500/30 bg-cyan-500/10 text-sm font-medium text-cyan-400 hover:bg-cyan-500/20"
          data-testid="compare-versions-btn"
        >
          <FiGitBranch size={14} />
          Compare Versions
        </Button>
      )}
      {versions.map((v) => (
        <Button
          type="button"
          variant="outline"
          key={v.id}
          onClick={() => onSelectVersion(v)}
          className="flex w-full items-center gap-3 rounded-md border border-slate-700 bg-slate-800/50 px-3 py-2 text-left text-sm transition-colors hover:border-slate-600 hover:bg-slate-800 h-auto whitespace-normal justify-start font-normal"
        >
          <FiClock size={14} className="flex-shrink-0 text-slate-400" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-200">v{v.version}</span>
              <span className="text-xs text-slate-400">
                {new Date(v.created_at).toLocaleString()}
              </span>
            </div>
            {v.change_summary && (
              <p className="truncate text-xs text-slate-400" title={v.change_summary}>
                {v.change_summary}
              </p>
            )}
          </div>
        </Button>
      ))}
    </div>
  );
}
