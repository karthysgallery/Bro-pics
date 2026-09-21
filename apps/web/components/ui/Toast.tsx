'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type ToastVariant = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant) => void;
}

// A no-op default (rather than null + a throwing hook, unlike useAuth) —
// toast feedback is supplementary UI, not state a caller can get wrong by
// omission, so a page/test rendered without ToastProvider just doesn't show
// a toast instead of crashing.
const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: 'border-accent/20 bg-paper text-ink',
  error: 'border-alert/30 bg-paper text-alert',
  info: 'border-line bg-paper text-ink',
};

const AUTO_DISMISS_MS = 4000;

// One shared toast system for transient feedback (added to cart, saved,
// coupon applied, session revoked, etc.) — inline `<p className="text-alert">`
// messages stay for in-form validation, which needs to sit next to the
// field it's about, not float free.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = 'info') => {
      const id = `toast_${nextId.current++}`;
      setToasts((current) => [...current, { id, message, variant }]);
      setTimeout(() => dismissToast(id), AUTO_DISMISS_MS);
    },
    [dismissToast]
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 items-center pointer-events-none px-4 w-full sm:w-auto"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.variant === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto rounded-full border px-4 py-2.5 text-sm font-medium shadow-lg max-w-sm text-center ${VARIANT_STYLES[toast.variant]}`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}
