import { FiAlertTriangle } from 'react-icons/fi';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import './UnsavedChangesDialog.css';

interface UnsavedChangesDialogProps {
  dirtyFormLabels: string[];
  onStay: () => void;
  onLeave: () => void;
}

export function UnsavedChangesDialog({
  dirtyFormLabels,
  onStay,
  onLeave,
}: UnsavedChangesDialogProps) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onStay(); }}>
      <DialogContent className="max-w-md border-amber-500/30" data-testid="unsaved-changes-dialog">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/20">
              <FiAlertTriangle className="h-5 w-5 text-amber-400" />
            </div>
            <DialogTitle>Unsaved Changes</DialogTitle>
          </div>
          <DialogDescription className="pt-2">
            You have unsaved changes that will be lost if you navigate away:
          </DialogDescription>
        </DialogHeader>

        <ul className="mb-3 space-y-1">
          {dirtyFormLabels.map((label) => (
            <li key={label} className="text-sm text-amber-300">
              &bull; {label}
            </li>
          ))}
        </ul>

        <p className="mb-2 text-sm text-slate-400">Are you sure you want to leave this page?</p>

        <DialogFooter>
          <Button
            onClick={onStay}
            data-testid="unsaved-changes-stay"
          >
            Stay on Page
          </Button>
          <Button
            variant="outline"
            onClick={onLeave}
            data-testid="unsaved-changes-leave"
          >
            Leave Page
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
