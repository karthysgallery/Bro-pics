'use client';

import { useEffect, useState, type ReactNode } from 'react';

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

const MAX_WIDTH_MAP = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
};

export function AdminModal({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidth = 'md',
}: AdminModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-ink/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`relative w-full ${MAX_WIDTH_MAP[maxWidth]} rounded-2xl bg-paper border border-line p-6 shadow-2xl z-10 animate-scale-in`}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 id="modal-title" className="font-display text-lg font-bold text-ink">
              {title}
            </h2>
            {description && <p className="text-xs text-ink/60 mt-1">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1 rounded-lg text-ink/40 hover:text-ink hover:bg-tint transition-colors"
          >
            ✕
          </button>
        </div>

        <div>{children}</div>
      </div>
    </div>
  );
}

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'primary';
  requireTypedText?: string;
  loading?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'primary',
  requireTypedText,
  loading = false,
}: ConfirmModalProps) {
  const [typedInput, setTypedInput] = useState('');

  useEffect(() => {
    if (isOpen) setTypedInput('');
  }, [isOpen]);

  const isConfirmed = !requireTypedText || typedInput === requireTypedText;

  return (
    <AdminModal isOpen={isOpen} onClose={onClose} title={title} maxWidth="sm">
      <div className="flex flex-col gap-4 text-xs text-ink/80">
        <p>{message}</p>

        {requireTypedText && (
          <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-field border border-line">
            <span className="text-ink/60">
              Type <strong className="text-ink font-semibold">{requireTypedText}</strong> to confirm:
            </span>
            <input
              type="text"
              value={typedInput}
              onChange={(e) => setTypedInput(e.target.value)}
              placeholder={requireTypedText}
              className="w-full px-3 py-1.5 rounded-lg border border-line bg-paper text-ink font-mono text-xs focus:outline-none focus:border-gold"
            />
          </div>
        )}

        <div className="flex items-center justify-end gap-2 mt-2 pt-3 border-t border-line">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl border border-line bg-paper text-ink font-medium hover:bg-tint transition-colors"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!isConfirmed || loading}
            className={`px-4 py-2 rounded-xl font-semibold transition-colors disabled:opacity-40 ${
              variant === 'danger'
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-gold hover:bg-gold-deep text-ink'
            }`}
          >
            {loading ? 'Processing…' : confirmText}
          </button>
        </div>
      </div>
    </AdminModal>
  );
}
