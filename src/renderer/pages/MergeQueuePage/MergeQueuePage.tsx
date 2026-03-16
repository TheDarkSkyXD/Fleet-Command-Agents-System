import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { DiffViewer } from '../../components/DiffViewer';
import { Tooltip } from '../../components/Tooltip';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';
import { useMergeStore } from '../../stores/mergeStore';
import {
  EnqueueDialog,
  HistoryEntryRow,
  QueueEntryRow,
  TargetBranchSelector,
} from './components';
import type { PreviewResult } from './components';
import './MergeQueuePage.css';

export function MergeQueuePage() {
  const {
    queue,
    history,
    loading,
    error,
    fetchQueue,
    fetchHistory,
    enqueue,
    execute,
    complete,
    fail,
    remove,
    autoResolve,
    aiResolve,
    reimagine,
    rollback,
  } = useMergeStore();

  const [showEnqueue, setShowEnqueue] = useState(false);
  const [activeTab, setActiveTab] = useState<'queue' | 'history'>('queue');
  const [diffData, setDiffData] = useState<{ diff: string; branchName: string } | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [previewResults, setPreviewResults] = useState<Record<number, PreviewResult>>({});
  const [previewLoadingId, setPreviewLoadingId] = useState<number | null>(null);
  const [targetBranch, setTargetBranch] = useState('');

  useEffect(() => {
    fetchQueue();
    fetchHistory();
    // Load merge target branch, falling back to active run's session branch
    window.electronAPI.mergeGetTargetBranch().then(async (result) => {
      if (!result.error && result.data) {
        setTargetBranch(result.data);
      } else {
        // Fall back to active run's session branch
        try {
          const runResult = await window.electronAPI.runGetActive();
          if (!runResult.error && runResult.data?.session_branch) {
            setTargetBranch(runResult.data.session_branch);
            // Persist it as the merge target
            await window.electronAPI.mergeSetTargetBranch(runResult.data.session_branch);
          }
        } catch {
          // Silently fail - target will be empty (current branch)
        }
      }
    });
  }, [fetchQueue, fetchHistory]);

  const allEntries = [...queue, ...history];
  const pendingCount = allEntries.filter((e) => e.status === 'pending').length;
  const mergingCount = allEntries.filter((e) => e.status === 'merging').length;
  const mergedCount = allEntries.filter((e) => e.status === 'merged').length;
  const conflictCount = allEntries.filter((e) => e.status === 'conflict').length;
  const failedCount = allEntries.filter((e) => e.status === 'failed').length;
  const blockedCount = queue.filter((e) => e.blocked === true).length;

  const handleEnqueue = async (entry: {
    branch_name: string;
    task_id?: string;
    agent_name?: string;
    files_modified?: string[];
    depends_on?: number[];
  }) => {
    await enqueue(entry);
  };

  const handleExecute = async (id: number) => {
    const entry = queue.find((e) => e.id === id);
    const result = await execute(id, undefined, targetBranch || undefined);
    if (result) {
      if (result.status === 'merged') {
        toast.success(`Merge completed: ${entry?.branch_name ?? `#${id}`}`);
      } else if (result.status === 'conflict') {
        toast.warning(`Merge conflicts detected: ${entry?.branch_name ?? `#${id}`}`);
      } else {
        toast.info(`Merge started: ${entry?.branch_name ?? `#${id}`}`);
      }
    }
  };

  const handleComplete = async (id: number) => {
    const entry = queue.find((e) => e.id === id);
    const branchName = entry?.branch_name ?? `#${id}`;
    const result = await complete(id, 'clean-merge');
    if (result) {
      toast.success(`Merge completed successfully: ${branchName}`, {
        description: entry?.agent_name ? `Agent ${entry.agent_name} session updated` : undefined,
      });
    }
  };

  const handleFail = async (id: number) => {
    const entry = queue.find((e) => e.id === id);
    const result = await fail(id);
    if (result) {
      toast.error(`Merge failed: ${entry?.branch_name ?? `#${id}`}`);
    }
  };

  const handleRemove = async (id: number) => {
    const entry = queue.find((e) => e.id === id);
    const success = await remove(id);
    if (success) {
      toast.info(`Removed from queue: ${entry?.branch_name ?? `#${id}`}`);
    }
  };

  const handleAutoResolve = async (id: number) => {
    const entry = queue.find((e) => e.id === id);
    const result = await autoResolve(id, undefined, targetBranch || undefined);
    if (result) {
      toast.success(`Auto-resolved: ${entry?.branch_name ?? `#${id}`}`);
    }
  };

  const handleAiResolve = async (id: number) => {
    const entry = queue.find((e) => e.id === id);
    const result = await aiResolve(id, undefined, targetBranch || undefined);
    if (result) {
      toast.success(`AI-resolved: ${entry?.branch_name ?? `#${id}`}`);
    }
  };

  const handleReimagine = async (id: number) => {
    const entry = queue.find((e) => e.id === id);
    const result = await reimagine(id, undefined, targetBranch || undefined);
    if (result) {
      toast.info(`Reimagine branch created: ${entry?.branch_name ?? `#${id}`}`);
    }
  };

  const handleRollback = async (id: number) => {
    const entry = history.find((e) => e.id === id);
    const result = await rollback(id);
    if (result) {
      toast.info(`Rolled back: ${entry?.branch_name ?? `#${id}`}`);
    }
  };

  const handleChangeTargetBranch = async (branch: string) => {
    setTargetBranch(branch);
    await window.electronAPI.mergeSetTargetBranch(branch);
  };

  const handlePreview = async (id: number) => {
    setPreviewLoadingId(id);
    try {
      const result = await window.electronAPI.mergePreview(id);
      if (result.error) {
        console.error('Preview failed:', result.error);
        toast.error('Merge preview failed');
      } else if (result.data) {
        const { canMerge, conflicts } = result.data as {
          canMerge: boolean;
          conflicts: string[];
        };
        setPreviewResults((prev) => ({
          ...prev,
          [id]: { canMerge, conflicts },
        }));
      }
    } catch (err) {
      console.error('Preview error:', err);
    } finally {
      setPreviewLoadingId(null);
    }
  };

  const handleViewDiff = useCallback(
    async (id: number) => {
      setDiffLoading(true);
      try {
        const result = await window.electronAPI.mergeDiff(id);
        if (result.error) {
          console.error('Failed to get diff:', result.error);
          setDiffData({
            diff: '',
            branchName:
              queue.find((e) => e.id === id)?.branch_name ||
              history.find((e) => e.id === id)?.branch_name ||
              'unknown',
          });
        } else if (result.data) {
          setDiffData(result.data);
        }
      } catch (err) {
        console.error('Failed to load diff:', err);
        toast.error('Failed to load diff');
      } finally {
        setDiffLoading(false);
      }
    },
    [queue, history],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">Merge Queue</h1>
          <div className="mt-2">
            <TargetBranchSelector
              targetBranch={targetBranch}
              onChangeTarget={handleChangeTargetBranch}
            />
          </div>
        </div>
        <Button
          onClick={() => setShowEnqueue(true)}
          className="bg-slate-800/90 border border-blue-500/30 text-blue-300 hover:bg-slate-700/90 hover:border-blue-400/40 shadow-sm"
        >
          Enqueue Branch
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-6 gap-4" data-testid="merge-stats">
        <Card className="border-slate-700 bg-slate-800" data-testid="merge-stat-pending">
          <CardContent className="p-4 pt-4">
            <div className="text-2xl font-bold text-slate-300">{pendingCount}</div>
            <div className="text-xs text-slate-400 mt-1">Pending</div>
          </CardContent>
        </Card>
        <Card className="border-slate-700 bg-slate-800" data-testid="merge-stat-merging">
          <CardContent className="p-4 pt-4">
            <div className="text-2xl font-bold text-blue-400">{mergingCount}</div>
            <div className="text-xs text-slate-400 mt-1">Merging</div>
          </CardContent>
        </Card>
        <Card className="border-slate-700 bg-slate-800" data-testid="merge-stat-merged">
          <CardContent className="p-4 pt-4">
            <div className="text-2xl font-bold text-emerald-400">{mergedCount}</div>
            <div className="text-xs text-slate-400 mt-1">Merged</div>
          </CardContent>
        </Card>
        <Card className="border-slate-700 bg-slate-800" data-testid="merge-stat-conflict">
          <CardContent className="p-4 pt-4">
            <div className="text-2xl font-bold text-amber-400">{conflictCount}</div>
            <div className="text-xs text-slate-400 mt-1">Conflict</div>
          </CardContent>
        </Card>
        <Card className="border-slate-700 bg-slate-800" data-testid="merge-stat-failed">
          <CardContent className="p-4 pt-4">
            <div className="text-2xl font-bold text-red-400">{failedCount}</div>
            <div className="text-xs text-slate-400 mt-1">Failed</div>
          </CardContent>
        </Card>
        <Card className="border-slate-700 bg-slate-800" data-testid="merge-stat-blocked">
          <CardContent className="p-4 pt-4">
            <div className="text-2xl font-bold text-orange-400">{blockedCount}</div>
            <div className="text-xs text-slate-400 mt-1">Blocked</div>
          </CardContent>
        </Card>
      </div>

      {/* Error display */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400 flex items-center justify-between gap-3" data-testid="merge-queue-error">
          <span>{error}</span>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchQueue}
              className="bg-slate-800/90 border border-amber-500/30 text-amber-300 hover:bg-slate-700/90 hover:border-amber-400/40 shadow-sm"
              data-testid="merge-queue-error-retry"
            >
              Retry
            </Button>
            <Tooltip content="Dismiss error">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => useMergeStore.setState({ error: null })}
                className="h-6 w-6 text-red-400 hover:text-red-200"
              >
                &#10005;
              </Button>
            </Tooltip>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'queue' | 'history')} data-testid="merge-tabs">
        <TabsList className="bg-transparent border-b border-slate-700 rounded-none w-full justify-start h-auto p-0">
          <TabsTrigger
            value="queue"
            data-testid="merge-tab-queue"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:text-blue-400 data-[state=active]:bg-transparent data-[state=active]:shadow-none text-slate-400 hover:text-slate-300 px-4 py-2"
          >
            Queue ({queue.length})
          </TabsTrigger>
          <TabsTrigger
            value="history"
            data-testid="merge-tab-history"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:text-blue-400 data-[state=active]:bg-transparent data-[state=active]:shadow-none text-slate-400 hover:text-slate-300 px-4 py-2"
          >
            History ({history.length})
          </TabsTrigger>
        </TabsList>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        ) : (
          <>
            <TabsContent value="queue">
              {queue.length === 0 ? (
                <Card className="border-slate-700 bg-slate-800">
                  <CardContent className="p-8 text-center text-slate-400">
                    <p className="text-lg mb-2">No merges in queue</p>
                    <p className="text-sm">Enqueue a branch to start the merge process</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2" data-testid="merge-queue-list">
                  {queue.map((entry, index) => (
                    <QueueEntryRow
                      key={entry.id}
                      entry={entry}
                      position={index + 1}
                      allEntries={allEntries}
                      onExecute={handleExecute}
                      onComplete={handleComplete}
                      onFail={handleFail}
                      onRemove={handleRemove}
                      onViewDiff={handleViewDiff}
                      onAutoResolve={handleAutoResolve}
                      onAiResolve={handleAiResolve}
                      onReimagine={handleReimagine}
                      onPreview={handlePreview}
                      previewResult={previewResults[entry.id] || null}
                      previewLoading={previewLoadingId === entry.id}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
            <TabsContent value="history">
              {history.length === 0 ? (
                <Card className="border-slate-700 bg-slate-800">
                  <CardContent className="p-8 text-center text-slate-400">
                    <p className="text-lg mb-2">No merge history</p>
                    <p className="text-sm">Completed and failed merges will appear here</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3" data-testid="merge-history-list">
                  <div className="flex items-center gap-4 text-xs text-slate-400 pb-2 border-b border-slate-700/50">
                    <span className="font-medium text-slate-300">
                      {history.length} merge{history.length !== 1 ? 's' : ''} total
                    </span>
                    <span className="text-emerald-400">
                      {history.filter((e) => e.status === 'merged').length} succeeded
                    </span>
                    <span className="text-red-400">
                      {history.filter((e) => e.status === 'failed').length} failed
                    </span>
                    {history.filter((e) => e.resolved_tier === 'clean-merge').length > 0 && (
                      <span className="text-emerald-400/70">
                        {history.filter((e) => e.resolved_tier === 'clean-merge').length} clean
                      </span>
                    )}
                    {history.filter((e) => e.resolved_tier === 'auto-resolve').length > 0 && (
                      <span className="text-amber-400/70">
                        {history.filter((e) => e.resolved_tier === 'auto-resolve').length} auto-resolved
                      </span>
                    )}
                    {history.filter((e) => e.resolved_tier === 'ai-resolve').length > 0 && (
                      <span className="text-violet-400/70">
                        {history.filter((e) => e.resolved_tier === 'ai-resolve').length} AI-resolved
                      </span>
                    )}
                    {history.filter((e) => e.resolved_tier === 'reimagine').length > 0 && (
                      <span className="text-red-400/70">
                        {history.filter((e) => e.resolved_tier === 'reimagine').length} reimagined
                      </span>
                    )}
                  </div>
                  {history.map((entry) => (
                    <HistoryEntryRow
                      key={entry.id}
                      entry={entry}
                      onViewDiff={handleViewDiff}
                      onRollback={handleRollback}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          </>
        )}
      </Tabs>

      {/* Enqueue Dialog */}
      <EnqueueDialog
        open={showEnqueue}
        onClose={() => setShowEnqueue(false)}
        onEnqueue={handleEnqueue}
        existingEntries={queue}
      />

      {/* Diff Loading Overlay */}
      {diffLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="flex flex-col items-center gap-3 rounded-lg border border-slate-700 bg-slate-800 p-8">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <span className="text-sm text-slate-300">Loading diff...</span>
          </div>
        </div>
      )}

      {/* Diff Viewer with file-level review */}
      {diffData && (
        <DiffViewer
          diffString={diffData.diff}
          branchName={diffData.branchName}
          onClose={() => setDiffData(null)}
          reviewMode={true}
          onProceedMerge={(approvedFiles) => {
            console.log('Proceeding with merge of approved files:', approvedFiles);
            setDiffData(null);
          }}
        />
      )}
    </div>
  );
}
