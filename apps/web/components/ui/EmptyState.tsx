import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  message?: string;
  action?: ReactNode;
}

// One consistent look for every empty list (orders, wishlist, addresses,
// reviews, notifications, ...) instead of each page writing its own bare
// "No X yet." line with no shared styling.
export function EmptyState({ title, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center text-center gap-2 py-12 px-4">
      <p className="text-base font-medium text-ink">{title}</p>
      {message && <p className="text-sm text-ink/60 max-w-sm">{message}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
