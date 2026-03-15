import { motion } from 'framer-motion';
import { FiAlertTriangle } from 'react-icons/fi';

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
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      data-testid="unsaved-changes-dialog"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        className="mx-4 w-full max-w-md rounded-xl border border-amber-500/30 bg-slate-800 p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/20">
            <FiAlertTriangle className="h-5 w-5 text-amber-400" />
          </div>
          <h2 className="text-lg font-semibold text-slate-100">Unsaved Changes</h2>
        </div>

        <p className="mb-3 text-sm text-slate-300">
          You have unsaved changes that will be lost if you navigate away:
        </p>

        <ul className="mb-5 space-y-1">
          {dirtyFormLabels.map((label) => (
            <li key={label} className="text-sm text-amber-300">
              &bull; {label}
            </li>
          ))}
        </ul>

        <p className="mb-5 text-sm text-slate-400">Are you sure you want to leave this page?</p>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onStay}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
            data-testid="unsaved-changes-stay"
          >
            Stay on Page
          </button>
          <button
            type="button"
            onClick={onLeave}
            className="rounded-lg border border-slate-600 bg-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-600"
            data-testid="unsaved-changes-leave"
          >
            Leave Page
          </button>
        </div>
      </motion.div>
    </div>
  );
}
