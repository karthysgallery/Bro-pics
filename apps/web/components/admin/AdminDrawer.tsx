'use client';

import { useEffect, type ReactNode } from 'react';

interface AdminDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

const WIDTH_MAP = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
};

export function AdminDrawer({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 'md',
}: AdminDrawerProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div
        className="fixed inset-0 bg-ink/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
        <div
          role="dialog"
          aria-modal="true"
          className={`w-screen ${WIDTH_MAP[width]} bg-paper border-l border-line flex flex-col shadow-2xl animate-slide-left`}
        >
          {/* Header */}
          <div className="flex items-start justify-between p-5 border-b border-line bg-field/50">
            <div>
              <h2 className="font-display text-base font-bold text-ink">{title}</h2>
              {subtitle && <p className="text-xs text-ink/60 mt-0.5">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close drawer"
              className="p-1 rounded-lg text-ink/40 hover:text-ink hover:bg-tint transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-6">{children}</div>

          {/* Sticky Footer */}
          {footer && (
            <div className="p-4 border-t border-line bg-field/50 flex items-center justify-end gap-2">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
