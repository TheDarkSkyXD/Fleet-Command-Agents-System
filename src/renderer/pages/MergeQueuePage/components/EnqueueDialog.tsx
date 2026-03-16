import { useState } from 'react';
import type { MergeQueueEntry } from '../../../../shared/types';
import { Button } from '../../../components/ui/button';
import { Checkbox } from '../../../components/ui/checkbox';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '../../../components/ui/dialog';
import { StatusBadge } from './StatusBadge';

export function EnqueueDialog({
  open,
  onClose,
  onEnqueue,
  existingEntries,
}: {
  open: boolean;
  onClose: () => void;
  onEnqueue: (entry: {
    branch_name: string;
    task_id?: string;
    agent_name?: string;
    files_modified?: string[];
    depends_on?: number[];
  }) => void;
  existingEntries: MergeQueueEntry[];
}) {
  const [branchName, setBranchName] = useState('');
  const [taskId, setTaskId] = useState('');
  const [agentName, setAgentName] = useState('');
  const [selectedDeps, setSelectedDeps] = useState<number[]>([]);
  const [branchError, setBranchError] = useState<string | undefined>();
  const [branchTouched, setBranchTouched] = useState(false);

  const validateBranch = (value: string): boolean => {
    if (!value.trim()) {
      setBranchError('Branch Name is required');
      return false;
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/.test(value.trim())) {
      setBranchError('Branch Name must start with a letter or number and contain only letters, numbers, /, -, _, or .');
      return false;
    }
    if (value.trim().length > 200) {
      setBranchError('Branch Name must be 200 characters or fewer');
      return false;
    }
    setBranchError(undefined);
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setBranchTouched(true);
    if (!validateBranch(branchName)) return;
    onEnqueue({
      branch_name: branchName.trim(),
      task_id: taskId.trim() || undefined,
      agent_name: agentName.trim() || undefined,
      depends_on: selectedDeps.length > 0 ? selectedDeps : undefined,
    });
    setBranchName('');
    setTaskId('');
    setAgentName('');
    setSelectedDeps([]);
    setBranchError(undefined);
    setBranchTouched(false);
    onClose();
  };

  const toggleDep = (id: number) => {
    setSelectedDeps((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]));
  };

  const availableDeps = existingEntries.filter(
    (e) => e.status === 'pending' || e.status === 'merging',
  );

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enqueue Branch for Merge</DialogTitle>
          <DialogDescription className="sr-only">
            Add a branch to the merge queue
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="branch-name">
              Branch Name <span className="text-red-400">*</span>
            </Label>
            <Input
              id="branch-name"
              type="text"
              value={branchName}
              onChange={(e) => {
                setBranchName(e.target.value);
                if (branchTouched) validateBranch(e.target.value);
              }}
              onBlur={() => {
                setBranchTouched(true);
                validateBranch(branchName);
              }}
              placeholder="feature/my-branch"
              data-testid="enqueue-branch-input"
              className={
                branchTouched && branchError
                  ? 'border-red-500 focus-visible:ring-red-500'
                  : ''
              }
            />
            {branchTouched && branchError && (
              <p className="mt-1 text-xs text-red-400" data-testid="enqueue-branch-error">{branchError}</p>
            )}
          </div>
          <div>
            <Label htmlFor="task-id">
              Task ID (optional)
            </Label>
            <Input
              id="task-id"
              type="text"
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
              placeholder="TASK-123"
            />
          </div>
          <div>
            <Label htmlFor="agent-name">
              Agent Name (optional)
            </Label>
            <Input
              id="agent-name"
              type="text"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="builder-01"
            />
          </div>
          {availableDeps.length > 0 && (
            <div>
              <Label htmlFor="depends-on-list">
                Depends On (optional)
              </Label>
              <p className="text-xs text-muted-foreground mb-2">
                Select merges that must complete before this one can proceed.
              </p>
              <div
                id="depends-on-list"
                className="max-h-32 overflow-y-auto space-y-1 rounded-md border border-input bg-background p-2"
              >
                {availableDeps.map((dep) => (
                  <label
                    key={dep.id}
                    className="flex items-center gap-2 rounded px-2 py-1 hover:bg-accent cursor-pointer text-sm"
                  >
                    <Checkbox
                      checked={selectedDeps.includes(dep.id)}
                      onCheckedChange={() => toggleDep(dep.id)}
                      className="border-slate-500 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500"
                    />
                    <span
                      className="font-mono text-xs text-slate-300 truncate"
                      title={`#${dep.id} ${dep.branch_name}`}
                    >
                      #{dep.id} {dep.branch_name}
                    </span>
                    <StatusBadge status={dep.status} />
                  </label>
                ))}
              </div>
            </div>
          )}
          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!branchName.trim()}
            >
              Enqueue
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
