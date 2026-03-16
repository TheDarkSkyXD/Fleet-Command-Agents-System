import { FiActivity, FiAlertTriangle, FiSquare } from 'react-icons/fi';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';

/** Confirmation dialog for stopping agents */
export function StopConfirmDialog({
  title,
  message,
  agentName,
  agentCount,
  isStopping,
  onConfirm,
  onCancel,
  testId,
}: {
  title: string;
  message: string;
  agentName?: string;
  agentCount?: number;
  isStopping: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  testId?: string;
}) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent
        className="max-w-md border-slate-700 bg-slate-800 shadow-2xl ring-1 ring-black/20"
        data-testid={testId || 'stop-confirm-dialog'}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="flex-row items-center gap-3 space-y-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/20 shrink-0">
            <FiAlertTriangle className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <DialogTitle className="text-slate-50">{title}</DialogTitle>
            {agentName && (
              <DialogDescription className="text-slate-400 font-mono">
                {agentName}
              </DialogDescription>
            )}
          </div>
        </DialogHeader>
        <div className="py-2">
          <p className="text-sm text-slate-300">{message}</p>
          {agentCount !== undefined && agentCount > 0 && (
            <div className="mt-3 rounded-lg bg-red-500/10 border border-red-500/20 p-3">
              <p className="text-sm text-red-400 font-medium">
                {agentCount} active agent{agentCount !== 1 ? 's' : ''} will be terminated
              </p>
            </div>
          )}
          <p className="mt-3 text-xs text-slate-400">
            The agent process will be killed via tree-kill. This action cannot be undone.
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isStopping}
            className="border-slate-600 text-slate-300 hover:bg-slate-700"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isStopping}
            data-testid="stop-confirm-button"
          >
            {isStopping ? (
              <>
                <FiActivity className="size-4 animate-spin" />
                Stopping...
              </>
            ) : (
              <>
                <FiSquare className="size-4" />
                {agentCount !== undefined ? 'Stop All Agents' : 'Stop Agent'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
