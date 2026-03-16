import { FiAlertTriangle, FiShield, FiTrash2, FiZap } from 'react-icons/fi';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import { Checkbox } from '../../../components/ui/checkbox';
import { Label } from '../../../components/ui/label';
import type { ConfirmDialogState } from './types';

interface ConfirmDestructionDialogProps {
  confirmDialog: ConfirmDialogState;
  forceUnmerged: boolean;
  onForceUnmergedChange: (checked: boolean) => void;
  onClose: () => void;
}

export function ConfirmDestructionDialog({
  confirmDialog,
  forceUnmerged,
  onForceUnmergedChange,
  onClose,
}: ConfirmDestructionDialogProps) {
  return (
    <Dialog open={confirmDialog.open} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="max-w-md border-red-500/30 bg-slate-800 shadow-2xl ring-1 ring-red-500/10"
        data-testid="nuclear-confirm-modal"
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* Header with danger accent */}
        <DialogHeader className="flex-row items-center gap-3 space-y-0 border-b border-red-500/20 bg-red-500/5 rounded-t-xl -mx-6 -mt-6 px-6 py-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-500/20 ring-2 ring-red-500/30 shrink-0">
            <FiAlertTriangle size={22} className="text-red-400" />
          </div>
          <div>
            <DialogTitle className="text-lg font-bold text-slate-50">{confirmDialog.title}</DialogTitle>
            <DialogDescription className="text-xs font-medium text-red-400 flex items-center gap-1 mt-1">
              <FiShield size={10} />
              Destructive Operation
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="py-2">
          <p className="text-sm text-slate-300 leading-relaxed">
            {confirmDialog.description}
          </p>

          {/* Danger warning callout */}
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 flex items-start gap-2.5">
            <FiZap size={16} className="mt-0.5 shrink-0 text-red-400" />
            <div>
              <p className="text-sm font-semibold text-red-400">{confirmDialog.danger}</p>
              <p className="text-xs text-red-400/70 mt-1">
                Please ensure you have backups before proceeding.
              </p>
            </div>
          </div>

          {/* Show force option in dialog if applicable */}
          {confirmDialog.forceOption && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-700/50 border border-slate-600 p-3">
              <Label
                className="flex items-center gap-2 cursor-pointer"
                htmlFor="force-confirm"
              >
                <Checkbox
                  id="force-confirm"
                  data-testid="force-confirm-checkbox"
                  checked={forceUnmerged}
                  onCheckedChange={(checked) => onForceUnmergedChange(checked === true)}
                  className="border-slate-600 data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500"
                />
                <span className="text-sm text-slate-300">
                  Force remove unmerged branches (deletes unmerged work)
                </span>
              </Label>
            </div>
          )}
        </div>

        {/* Footer with action buttons */}
        <DialogFooter>
          <Button
            variant="outline"
            data-testid="confirm-cancel-btn"
            onClick={onClose}
            className="border-slate-600 text-slate-300 hover:bg-slate-700"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            data-testid="confirm-proceed-btn"
            onClick={confirmDialog.onConfirm}
            className="shadow-lg shadow-red-500/20 font-bold"
          >
            <FiTrash2 size={14} />
            Confirm Destruction
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
