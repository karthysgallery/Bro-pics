import type { OrderStatus, ReturnStatus } from '@bro-pics/shared';

export type AdminStatusType =
  | OrderStatus
  | ReturnStatus
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'featured'
  | 'draft'
  | 'published'
  | 'archived'
  | 'in_stock'
  | 'out_of_stock'
  | 'backorder'
  | 'queued'
  | 'sent'
  | 'failed';

interface StatusChipProps {
  status: string;
  size?: 'sm' | 'md';
  className?: string;
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  // Order & Payment Statuses
  pending_payment: { label: 'Pending Payment', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
  paid: { label: 'Paid', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200' },
  payment_confirmed: { label: 'Payment Confirmed', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200' },
  cancelled: { label: 'Cancelled', bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200' },
  refunded: { label: 'Refunded', bg: 'bg-purple-50', text: 'text-purple-800', border: 'border-purple-200' },
  replacement_issued: { label: 'Replacement Issued', bg: 'bg-indigo-50', text: 'text-indigo-800', border: 'border-indigo-200' },

  // Production Queue Statuses
  photo_validation: { label: 'Photo Validation', bg: 'bg-orange-50', text: 'text-orange-800', border: 'border-orange-200' },
  print_rendering: { label: 'Rendering', bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200' },
  print_ready: { label: 'Print Ready', bg: 'bg-teal-50', text: 'text-teal-800', border: 'border-teal-200' },
  in_production: { label: 'In Production', bg: 'bg-cyan-50', text: 'text-cyan-800', border: 'border-cyan-200' },
  printed: { label: 'Printed', bg: 'bg-sky-50', text: 'text-sky-800', border: 'border-sky-200' },
  quality_check: { label: 'QC Pending', bg: 'bg-yellow-50', text: 'text-yellow-800', border: 'border-yellow-200' },
  rework: { label: 'Rework Needed', bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200' },
  packed: { label: 'Packed', bg: 'bg-violet-50', text: 'text-violet-800', border: 'border-violet-200' },
  shipped: { label: 'Shipped', bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200' },
  delivered: { label: 'Delivered', bg: 'bg-green-50', text: 'text-green-800', border: 'border-green-200' },
  on_hold: { label: 'On Hold', bg: 'bg-red-50', text: 'text-red-800', border: 'border-red-200' },

  // Returns
  requested: { label: 'Return Requested', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
  approved: { label: 'Approved', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200' },
  rejected: { label: 'Rejected', bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200' },
  pickup: { label: 'Pickup Scheduled', bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200' },
  refund_processing: { label: 'Refund Processing', bg: 'bg-purple-50', text: 'text-purple-800', border: 'border-purple-200' },

  // Reviews & Moderation
  pending: { label: 'Pending Review', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
  featured: { label: 'Featured', bg: 'bg-gold/20', text: 'text-ink', border: 'border-gold/40' },

  // Catalogue & Stock
  draft: { label: 'Draft', bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200' },
  published: { label: 'Published', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200' },
  archived: { label: 'Archived', bg: 'bg-gray-200', text: 'text-gray-600', border: 'border-gray-300' },
  in_stock: { label: 'In Stock', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200' },
  out_of_stock: { label: 'Out of Stock', bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200' },
  backorder: { label: 'Backorder', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },

  // Jobs & Notifications
  queued: { label: 'Queued', bg: 'bg-sky-50', text: 'text-sky-800', border: 'border-sky-200' },
  sent: { label: 'Sent', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200' },
  failed: { label: 'Failed', bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200' },
};

function formatFallback(raw: string): string {
  return raw
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function StatusChip({ status, size = 'md', className = '' }: StatusChipProps) {
  const config = STATUS_CONFIG[status] || {
    label: formatFallback(status),
    bg: 'bg-tint',
    text: 'text-ink',
    border: 'border-line',
  };

  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-2xs' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border ${config.bg} ${config.text} ${config.border} ${sizeClasses} ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-current opacity-75" aria-hidden="true" />
      {config.label}
    </span>
  );
}
