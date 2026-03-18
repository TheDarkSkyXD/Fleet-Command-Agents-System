import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FiChevronDown,
  FiChevronRight,
  FiFile,
  FiFilePlus,
  FiGitCommit,
  FiLoader,
  FiRefreshCw,
} from 'react-icons/fi';
import { toast } from 'sonner';
import type { Prompt } from '../../../shared/types';
import { Button } from '../../components/ui/button';
import { Separator } from '../../components/ui/separator';
import {
  buildTree,
  CreatePromptDialog,
  PromptDetail,
  TreeNode,
} from './components';
import { Tooltip } from '../../components/Tooltip';
import './PromptsPage.css';

export function PromptsPage() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [showGitLog, setShowGitLog] = useState(false);
  const [gitLog, setGitLog] = useState<
    Array<{ hash: string; date: string; message: string; author: string }>
  >([]);
  const [gitLogLoading, setGitLogLoading] = useState(false);

  const loadPrompts = useCallback(async () => {
    try {
      const res = await window.electronAPI.promptList();
      if (res.data) {
        setPrompts(res.data);
      }
    } catch (err) {
      console.error('Failed to load prompts:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPrompts();
  }, [loadPrompts]);

  const tree = useMemo(() => buildTree(prompts), [prompts]);

  const selectedPrompt = useMemo(
    () => prompts.find((p) => p.id === selectedId) || null,
    [prompts, selectedId],
  );

  const handleToggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleExpandAll = useCallback(() => {
    setExpandedIds(new Set(prompts.map((p) => p.id)));
  }, [prompts]);

  const handleCollapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  const handleCreated = useCallback(() => {
    loadPrompts();
  }, [loadPrompts]);

  const handleUpdated = useCallback(() => {
    loadPrompts();
  }, [loadPrompts]);

  const handleDeleted = useCallback(() => {
    setSelectedId(null);
    loadPrompts();
  }, [loadPrompts]);

  const handleGitSync = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await window.electronAPI.promptGitSync();
      if (res.error) {
        toast.error(`Git sync failed: ${res.error}`);
        return;
      }
      if (res.data) {
        if (res.data.committedFiles === 0) {
          toast.info(res.data.message);
        } else {
          toast.success(res.data.message);
        }
      }
    } catch (err) {
      console.error('Failed to sync prompts with git:', err);
      toast.error('Failed to sync prompts with git');
    } finally {
      setSyncing(false);
    }
  }, []);

  const handleShowGitLog = useCallback(async () => {
    if (showGitLog) {
      setShowGitLog(false);
      return;
    }
    setShowGitLog(true);
    setGitLogLoading(true);
    try {
      const res = await window.electronAPI.promptGitLog();
      if (res.data) {
        setGitLog(res.data);
      }
    } catch (err) {
      console.error('Failed to load git log:', err);
    } finally {
      setGitLogLoading(false);
    }
  }, [showGitLog]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-slate-400">Loading prompts...</div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Page Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">Prompts</h1>
          <p className="mt-1 text-sm text-slate-400">
            Manage canopy prompts with inheritance hierarchy and versioning
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleShowGitLog}
            className="flex items-center gap-1.5 bg-cyan-600/15 text-cyan-400 border border-cyan-500/25 hover:bg-cyan-600/25 hover:text-cyan-300"
            data-testid="prompt-git-log-btn"
          >
            <FiGitCommit size={16} />
            Git History
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleGitSync}
            disabled={syncing}
            className="flex items-center gap-1.5 bg-blue-600/15 text-blue-400 border border-blue-500/25 hover:bg-blue-600/25 hover:text-blue-300"
            data-testid="prompt-git-sync-btn"
          >
            {syncing ? (
              <FiLoader size={16} className="animate-spin" />
            ) : (
              <FiRefreshCw size={16} />
            )}
            {syncing ? 'Syncing...' : 'Sync to Git'}
          </Button>
          <Button
            onClick={() => {
              setCreateParentId(null);
              setShowCreate(true);
            }}
            className="flex items-center gap-2 bg-blue-600/15 text-blue-400 border border-blue-500/25 hover:bg-blue-600/25 hover:text-blue-300"
          >
            <FiFilePlus size={16} />
            New Prompt
          </Button>
        </div>
      </div>

      {/* Git Log Panel */}
      {showGitLog && (
        <div
          className="mb-4 rounded-lg border border-sky-500/20 bg-slate-800/50 p-3"
          data-testid="prompt-git-log-panel"
        >
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <FiGitCommit size={14} className="text-sky-400" />
            Prompt Git History
          </h3>
          {gitLogLoading ? (
            <div className="flex items-center gap-2 py-2 text-sm text-slate-400">
              <FiLoader size={14} className="animate-spin" />
              Loading git history...
            </div>
          ) : gitLog.length === 0 ? (
            <p className="py-2 text-sm text-slate-400">
              No git history for prompts yet. Use &ldquo;Sync to Git&rdquo; to create the first
              commit.
            </p>
          ) : (
            <div className="max-h-48 space-y-1 overflow-auto">
              {gitLog.map((entry) => (
                <div
                  key={entry.hash}
                  className="flex items-center gap-3 rounded px-2 py-1 text-sm hover:bg-slate-700/50"
                  data-testid="prompt-git-log-entry"
                >
                  <code className="flex-shrink-0 font-mono text-xs text-sky-400">
                    {entry.hash}
                  </code>
                  <span className="min-w-0 flex-1 truncate text-slate-300" title={entry.message}>
                    {entry.message}
                  </span>
                  <span className="flex-shrink-0 text-xs text-slate-400">
                    {new Date(entry.date).toLocaleDateString()}
                  </span>
                  <span className="flex-shrink-0 text-xs text-slate-400">{entry.author}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main Layout */}
      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* Left: Tree Panel */}
        <div className="flex w-72 flex-shrink-0 flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-800/50">
          {/* Tree header */}
          <div className="flex items-center justify-between border-b border-slate-700 px-3 py-2">
            <h3 className="text-sm font-semibold text-slate-200">Inheritance Tree</h3>
            <div className="flex gap-1">
              <Tooltip content="Expand all">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleExpandAll}
                  aria-label="Expand all"
                  className="h-6 w-6 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                >
                  <FiChevronDown size={14} />
                </Button>
              </Tooltip>
              <Tooltip content="Collapse all">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCollapseAll}
                  aria-label="Collapse all"
                  className="h-6 w-6 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                >
                  <FiChevronRight size={14} />
                </Button>
              </Tooltip>
            </div>
          </div>

          {/* Tree content */}
          <div className="flex-1 overflow-auto p-2">
            {tree.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <FiFile size={32} className="mb-2 text-slate-400" />
                <p className="text-sm text-slate-400">No prompts yet</p>
                <Button
                  variant="link"
                  onClick={() => {
                    setCreateParentId(null);
                    setShowCreate(true);
                  }}
                  className="mt-2 text-sm text-blue-400 hover:text-blue-300"
                >
                  Create your first prompt
                </Button>
              </div>
            ) : (
              tree.map((node) => (
                <TreeNode
                  key={node.id}
                  node={node}
                  depth={0}
                  selectedId={selectedId}
                  expandedIds={expandedIds}
                  onSelect={setSelectedId}
                  onToggle={handleToggle}
                />
              ))
            )}
          </div>

          {/* Stats */}
          {prompts.length > 0 && (
            <>
              <Separator className="bg-slate-700" />
              <div className="px-3 py-2 text-xs text-slate-400">
                {prompts.length} prompt{prompts.length !== 1 ? 's' : ''} &middot; {tree.length} root
                {tree.length !== 1 ? 's' : ''}
              </div>
            </>
          )}
        </div>

        {/* Right: Detail Panel */}
        <div className="flex-1 overflow-hidden rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          {selectedPrompt ? (
            <PromptDetail
              prompt={selectedPrompt}
              prompts={prompts}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <FiFile size={48} className="mb-3 text-slate-400" />
              <h3 className="text-lg font-medium text-slate-400">Select a prompt</h3>
              <p className="mt-1 text-sm text-slate-400">
                Choose a prompt from the tree to view or edit its content
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Create Dialog */}
      {showCreate && (
        <CreatePromptDialog
          prompts={prompts}
          parentId={createParentId}
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
