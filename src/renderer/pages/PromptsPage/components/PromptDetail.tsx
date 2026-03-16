import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FiClock,
  FiDownload,
  FiEdit2,
  FiEye,
  FiGitBranch,
  FiLoader,
  FiSave,
  FiTrash2,
} from 'react-icons/fi';
import { toast } from 'sonner';
import type { Prompt, PromptType, PromptVersion } from '../../../../shared/types';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';
import { Label } from '../../../components/ui/label';
import { Separator } from '../../../components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { SlidePanel } from '../../../components/SlidePanel';
import { Tooltip } from '../../../components/Tooltip';
import { useFormDirtyTracking } from '../../../hooks/useUnsavedChanges';
import { PromptPreviewPanel } from './PromptPreviewPanel';
import { TypeBadge } from './TypeBadge';
import { VersionDiffViewer } from './VersionDiffViewer';
import { VersionHistoryPanel } from './VersionHistoryPanel';

export function PromptDetail({
  prompt,
  prompts,
  onUpdated,
  onDeleted,
}: {
  prompt: Prompt;
  prompts: Prompt[];
  onUpdated: () => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(prompt.content);
  const [editName, setEditName] = useState(prompt.name);
  const [editDescription, setEditDescription] = useState(prompt.description || '');
  const [editType, setEditType] = useState(prompt.type);
  const [editParent, setEditParent] = useState(prompt.parent_id || '');
  const [changeSummary, setChangeSummary] = useState('');
  const [saving, setSaving] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [viewingVersion, setViewingVersion] = useState<PromptVersion | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [compareVersions, setCompareVersions] = useState<PromptVersion[] | null>(null);
  const [emitting, setEmitting] = useState(false);

  // Track edit form dirty state for beforeunload warning
  const isEditDirty = useMemo(
    () =>
      editing &&
      (editContent !== prompt.content ||
        editName !== prompt.name ||
        editDescription !== (prompt.description || '') ||
        editType !== prompt.type ||
        editParent !== (prompt.parent_id || '')),
    [editing, editContent, editName, editDescription, editType, editParent, prompt],
  );
  useFormDirtyTracking('prompt-edit-form', 'Edit Prompt Form', isEditDirty);

  // Reset state when prompt changes
  useEffect(() => {
    setEditing(false);
    setEditContent(prompt.content);
    setEditName(prompt.name);
    setEditDescription(prompt.description || '');
    setEditType(prompt.type);
    setEditParent(prompt.parent_id || '');
    setChangeSummary('');
    setViewingVersion(null);
    setConfirmDelete(false);
    setShowPreview(false);
    setCompareVersions(null);
  }, [prompt.content, prompt.name, prompt.description, prompt.type, prompt.parent_id]);

  const parentPrompt = prompts.find((p) => p.id === prompt.parent_id);
  // Filter out self and descendants for parent selection
  const availableParents = prompts.filter((p) => p.id !== prompt.id);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const updates: Record<string, unknown> = {};
      if (editName !== prompt.name) updates.name = editName;
      if (editDescription !== (prompt.description || ''))
        updates.description = editDescription || null;
      if (editContent !== prompt.content) updates.content = editContent;
      if (editType !== prompt.type) updates.type = editType;
      if (editParent !== (prompt.parent_id || '')) updates.parent_id = editParent || null;
      if (changeSummary.trim()) updates.change_summary = changeSummary.trim();

      if (Object.keys(updates).length > 0) {
        await window.electronAPI.promptUpdate(prompt.id, updates);
        toast.success('Prompt saved');
        onUpdated();
      }
      setEditing(false);
      setChangeSummary('');
    } catch (err) {
      console.error('Failed to update prompt:', err);
      toast.error('Failed to save prompt');
    } finally {
      setSaving(false);
    }
  }, [editName, editDescription, editContent, editType, editParent, changeSummary, prompt, onUpdated]);

  const handleDelete = useCallback(async () => {
    try {
      await window.electronAPI.promptDelete(prompt.id);
      toast.success('Prompt deleted');
      onDeleted();
    } catch (err) {
      console.error('Failed to delete prompt:', err);
      toast.error('Failed to delete prompt');
    }
  }, [prompt.id, onDeleted]);

  const handleEmit = useCallback(async () => {
    setEmitting(true);
    try {
      const result = await window.electronAPI.promptEmit(prompt.id);
      if (result.error) {
        toast.error(`Failed to emit: ${result.error}`);
        return;
      }
      if (result.data) {
        const info = result.data;
        let msg = `Emitted "${info.promptName}" to file`;
        if (info.inheritanceLevels > 1) {
          msg += ` (${info.inheritanceLevels} levels merged)`;
        }
        if (info.unresolvedVariables.length > 0) {
          msg += ` — ${info.unresolvedVariables.length} unresolved variable(s)`;
        }
        toast.success(msg);
      }
      // null data with no error means user cancelled
    } catch (err) {
      console.error('Failed to emit prompt:', err);
      toast.error('Failed to emit prompt');
    } finally {
      setEmitting(false);
    }
  }, [prompt.id]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between pb-4">
        <div>
          {editing ? (
            <Input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="rounded border-slate-600 bg-slate-900 px-2 py-1 text-lg font-semibold text-slate-100 focus:border-blue-500"
            />
          ) : (
            <h2 className="text-lg font-semibold text-slate-100">{prompt.name}</h2>
          )}
          <div className="mt-1 flex items-center gap-3 text-sm text-slate-400">
            <TypeBadge type={editing ? editType : prompt.type} />
            <span>v{prompt.version}</span>
            {parentPrompt && (
              <span className="flex items-center gap-1">
                <FiGitBranch size={12} />
                inherits from: {parentPrompt.name}
              </span>
            )}
            <span>Updated {new Date(prompt.updated_at).toLocaleString()}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setShowPreview(!showPreview);
              if (!showPreview) {
                setEditing(false);
                setShowVersions(false);
                setViewingVersion(null);
              }
            }}
            className={`flex items-center gap-1.5 ${
              showPreview
                ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400'
                : 'border-slate-600 text-slate-300 hover:bg-slate-700'
            }`}
            data-testid="preview-btn"
          >
            <FiEye size={14} />
            Preview
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleEmit}
            disabled={emitting}
            className="flex items-center gap-1.5 border-slate-600 text-slate-300 hover:bg-slate-700"
            data-testid="emit-prompt-btn"
            aria-label="Emit rendered prompt to file"
          >
            {emitting ? (
              <FiLoader size={14} className="animate-spin" />
            ) : (
              <FiDownload size={14} />
            )}
            {emitting ? 'Emitting...' : 'Emit to File'}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowVersions(!showVersions)}
            className={`flex items-center gap-1.5 ${
              showVersions
                ? 'border-blue-500/30 bg-blue-500/10 text-blue-400'
                : 'border-slate-600 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <FiClock size={14} />
            History
          </Button>

          {editing ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditing(false);
                  setEditContent(prompt.content);
                  setEditName(prompt.name);
                  setEditDescription(prompt.description || '');
                  setEditType(prompt.type);
                  setEditParent(prompt.parent_id || '');
                  setChangeSummary('');
                }}
                className="border-slate-600 text-slate-300 hover:bg-slate-700"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="bg-blue-600 text-white hover:bg-blue-500"
              >
                {saving ? <FiLoader size={14} className="animate-spin" /> : <FiSave size={14} />}
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 border-slate-600 text-slate-300 hover:bg-slate-700"
              >
                <FiEdit2 size={14} />
                Edit
              </Button>
              <Tooltip content="Delete prompt">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setConfirmDelete(true)}
                  className="h-9 w-9 border-red-500/30 text-red-400 hover:bg-red-500/10"
                >
                  <FiTrash2 size={14} />
                </Button>
              </Tooltip>
            </>
          )}
        </div>
      </div>
      <Separator className="bg-slate-700" />

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="mt-3 flex items-center gap-3 rounded-md border border-red-500/30 bg-red-500/10 p-3">
          <span className="text-sm text-red-300">
            Delete this prompt? Children will be unlinked.
          </span>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
          >
            Confirm Delete
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmDelete(false)}
            className="text-slate-400 hover:text-slate-200"
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Edit metadata */}
      {editing && (
        <div className="mt-4 grid grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label className="text-xs font-medium text-slate-400">Description</Label>
            <Input
              type="text"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="Optional description"
              className="h-9 border-slate-600 bg-slate-900 text-sm text-slate-100 focus:border-blue-500"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium text-slate-400">Type</Label>
            <Select value={editType} onValueChange={(v) => setEditType(v as PromptType)}>
              <SelectTrigger className="h-9 border-slate-600 bg-slate-900 text-sm text-slate-100">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-slate-600 bg-slate-900">
                <SelectItem value="system">System</SelectItem>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="agent">Agent</SelectItem>
                <SelectItem value="task">Task</SelectItem>
                <SelectItem value="template">Template</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium text-slate-400">Parent</Label>
            <Select value={editParent || '__none__'} onValueChange={(v) => setEditParent(v === '__none__' ? '' : v)}>
              <SelectTrigger className="h-9 border-slate-600 bg-slate-900 text-sm text-slate-100">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-slate-600 bg-slate-900">
                <SelectItem value="__none__">None (root level)</SelectItem>
                {availableParents.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Content area */}
      {showPreview ? (
        <div className="mt-4 flex-1 overflow-hidden">
          <PromptPreviewPanel
            prompt={prompt}
            prompts={prompts}
            onClose={() => setShowPreview(false)}
          />
        </div>
      ) : (
        <div className="mt-4 flex flex-1 gap-4 overflow-hidden">
          {/* Main content */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {editing && (
              <div className="mb-2 space-y-1">
                <Label className="text-xs font-medium text-slate-400">
                  Change Summary (optional)
                </Label>
                <Input
                  type="text"
                  value={changeSummary}
                  onChange={(e) => setChangeSummary(e.target.value)}
                  placeholder="Describe what changed..."
                  className="h-9 border-slate-600 bg-slate-900 text-sm text-slate-100 placeholder-slate-500 focus:border-blue-500"
                />
              </div>
            )}

            {viewingVersion ? (
              <div className="flex-1 overflow-auto">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-amber-400">
                    Viewing v{viewingVersion.version} -{' '}
                    {new Date(viewingVersion.created_at).toLocaleString()}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setViewingVersion(null)}
                    className="text-sm text-slate-400 hover:text-slate-200"
                  >
                    Back to current
                  </Button>
                </div>
                <pre className="flex-1 overflow-auto whitespace-pre-wrap rounded-md border border-slate-700 bg-slate-900 p-4 font-mono text-sm text-slate-300">
                  {viewingVersion.content}
                </pre>
              </div>
            ) : editing ? (
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="flex-1 resize-none rounded-md border-slate-600 bg-slate-900 p-4 font-mono text-sm text-slate-100 focus:border-blue-500"
              />
            ) : (
              <pre className="flex-1 overflow-auto whitespace-pre-wrap rounded-md border border-slate-700 bg-slate-900 p-4 font-mono text-sm text-slate-300">
                {prompt.content}
              </pre>
            )}

            {/* Description */}
            {!editing && prompt.description && (
              <div className="mt-3 text-sm text-slate-400">
                <span className="font-medium text-slate-400">Description:</span>{' '}
                {prompt.description}
              </div>
            )}
          </div>

          {/* Version history sidebar */}
          <SlidePanel isOpen={showVersions} direction="right">
            <div className="w-72 flex-shrink-0 overflow-auto rounded-md border border-slate-700 bg-slate-800/50 p-3">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
                <FiClock size={14} />
                Version History
              </h3>
              <VersionHistoryPanel
                promptId={prompt.id}
                onSelectVersion={(v) => setViewingVersion(v)}
                onCompareVersions={(v) => setCompareVersions(v)}
              />
            </div>
          </SlidePanel>
        </div>
      )}

      {/* Version diff viewer overlay */}
      {compareVersions && compareVersions.length >= 2 && (
        <VersionDiffViewer
          promptName={prompt.name}
          versions={compareVersions}
          onClose={() => setCompareVersions(null)}
        />
      )}
    </div>
  );
}
