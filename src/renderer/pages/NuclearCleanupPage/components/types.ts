export type CleanupResult = { type: 'success' | 'error'; message: string };

export interface ConfirmDialogState {
  open: boolean;
  title: string;
  description: string;
  danger: string;
  onConfirm: () => void;
  forceOption?: boolean;
}
