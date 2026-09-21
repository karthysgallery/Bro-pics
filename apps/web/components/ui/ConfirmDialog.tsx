'use client';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// One shared confirmation modal for every destructive action (cancel order,
// delete address, delete account, ...) — replaces three previously
// independent, inconsistent implementations, and gives address deletion a
// confirmation step it didn't have before. Same overlay pattern as
// AccountModal/CartDrawer (fixed inset-0 backdrop + bg-paper panel), so it
// matches the rest of the app's modal language rather than inventing a new one.
export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
      <div className="absolute inset-0 bg-ink/40" onClick={isLoading ? undefined : onCancel} />
      <div className="relative bg-paper w-full max-w-sm rounded-2xl border border-line p-6 flex flex-col gap-4">
        <div>
          <h2 id="confirm-dialog-title" className="text-lg font-semibold text-ink">{title}</h2>
          <p className="mt-1.5 text-sm text-ink/70">{message}</p>
        </div>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="rounded-full border border-line text-ink px-4 py-2 text-sm font-semibold hover:border-accent hover:text-accent transition-colors disabled:opacity-40"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="rounded-full bg-alert text-paper px-4 py-2 text-sm font-semibold disabled:opacity-40"
          >
            {isLoading ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
