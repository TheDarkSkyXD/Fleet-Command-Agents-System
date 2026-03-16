import { useMemo, useState } from 'react';
import { FiLoader, FiPlus } from 'react-icons/fi';
import { toast } from 'sonner';
import type { Prompt, PromptType } from '../../../../shared/types';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';
import { Label } from '../../../components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '../../../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { useFormDirtyTracking } from '../../../hooks/useUnsavedChanges';

export function CreatePromptDialog({
  prompts,
  parentId,
  onClose,
  onCreated,
}: {
  prompts: Prompt[];
  parentId: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [type, setType] = useState<PromptType>('system');
  const [selectedParent, setSelectedParent] = useState(parentId || '');
  const [saving, setSaving] = useState(false);

  // Track create prompt form dirty state for beforeunload warning
  const isCreateDirty = useMemo(
    () => name.trim() !== '' || description.trim() !== '' || content.trim() !== '',
    [name, description, content],
  );
  useFormDirtyTracking('prompt-create-form', 'Create Prompt Form', isCreateDirty);

  const handleCreate = async () => {
    if (!name.trim() || !content.trim()) return;
    setSaving(true);
    try {
      const id = `prompt-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      await window.electronAPI.promptCreate({
        id,
        name: name.trim(),
        description: description.trim() || undefined,
        content: content.trim(),
        type,
        parent_id: selectedParent || undefined,
      });
      toast.success(`Prompt "${name.trim()}" created`);
      onCreated();
      onClose();
    } catch (err) {
      console.error('Failed to create prompt:', err);
      toast.error('Failed to create prompt');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-xl border-slate-700 bg-slate-800">
        <DialogHeader>
          <DialogTitle className="text-slate-100">Create New Prompt</DialogTitle>
          <DialogDescription className="text-slate-400">
            Create a new prompt with optional parent inheritance.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-slate-300">Name</Label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Builder System Prompt"
              className="border-slate-600 bg-slate-900 text-slate-100 placeholder-slate-500 focus:border-blue-500"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-slate-300">Description</Label>
            <Input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="border-slate-600 bg-slate-900 text-slate-100 placeholder-slate-500 focus:border-blue-500"
            />
          </div>

          <div className="flex gap-4">
            <div className="flex-1 space-y-2">
              <Label className="text-sm font-medium text-slate-300">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as PromptType)}>
                <SelectTrigger className="border-slate-600 bg-slate-900 text-slate-100">
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

            <div className="flex-1 space-y-2">
              <Label className="text-sm font-medium text-slate-300">Parent</Label>
              <Select value={selectedParent || '__none__'} onValueChange={(v) => setSelectedParent(v === '__none__' ? '' : v)}>
                <SelectTrigger className="border-slate-600 bg-slate-900 text-slate-100" data-testid="prompt-parent-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-slate-600 bg-slate-900">
                  <SelectItem value="__none__">None (root level)</SelectItem>
                  {prompts.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-slate-300">Content</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              placeholder="Enter prompt content..."
              className="border-slate-600 bg-slate-900 font-mono text-sm text-slate-100 placeholder-slate-500 focus:border-blue-500"
            />
          </div>
        </div>

        <DialogFooter className="gap-3">
          <Button
            variant="outline"
            onClick={onClose}
            className="border-slate-600 text-slate-300 hover:bg-slate-700"
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || !content.trim() || saving}
            className="bg-blue-600 text-white hover:bg-blue-500"
          >
            {saving ? <FiLoader size={14} className="animate-spin" /> : <FiPlus size={14} />}
            {saving ? 'Creating...' : 'Create Prompt'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
