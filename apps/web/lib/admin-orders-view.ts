/**
 * How the admin Orders and Payments screens read an order: its payment state (separate from where it is in
 * production), the stage groups the summary cards count, and the search / filter / sort rules. Pure functions, so
 * the screens and the tests share one definition.
 */

/** 'unpaid' = the order was cancelled before any payment arrived (nothing is awaited any more). */
export type PaymentState = 'paid' | 'failed' | 'pending' | 'refunded' | 'unpaid';

/** One row of GET /api/admin/orders/overview. Money in paise; dates as ISO strings. */
export interface OrderRow {
  id: string;
  orderNo: string;
  status: string;
  paymentStatus: string;
  paymentMode: 'prepaid' | 'partial_cod' | string;
  paymentProvider: string | null;
  total: number;
  amountPaidOnline: number;
  amountDueOnDelivery: number;
  placedAt: string | null;
  userId: string | null;
  customerName: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  productTitle: string | null;
  productImage: string | null;
  productCount: number;
  hasGlitter: boolean;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  invoiceNo: string | null;
  refundedAmount: number;
  paymentFailure: { reason: string | null; code: string | null; at: string | null; razorpayPaymentId: string | null } | null;
}

/**
 * The payment side alone. "Refunded" means the money went back (the order was refunded, or refunds cover the total);
 * "failed" means Razorpay reported a failed attempt and nothing has been paid since; "pending" is any order still
 * waiting for its money (including a checkout the customer left).
 */
export function paymentState(o: Pick<OrderRow, 'status' | 'paymentStatus' | 'refundedAmount' | 'total'>): PaymentState {
  // A part refund leaves the order paid (the list shows how much went back); a full one makes it refunded.
  if (o.status === 'refunded' || o.paymentStatus === 'refunded' || (o.refundedAmount > 0 && o.refundedAmount >= o.total)) return 'refunded';
  if (o.paymentStatus === 'paid') return 'paid';
  if (o.status === 'cancelled') return 'unpaid';
  if (o.paymentStatus === 'failed') return 'failed';
  return 'pending';
}

export const PAYMENT_LABELS: Record<PaymentState, string> = {
  paid: 'Paid',
  failed: 'Payment failed',
  pending: 'Awaiting payment',
  refunded: 'Refunded',
  unpaid: 'Not paid',
};

/** Paid orders that are being made (from payment through quality check, including rework). */
export const PROCESSING_STATUSES = ['paid', 'payment_confirmed', 'photo_validation', 'print_rendering', 'print_ready', 'in_production', 'quality_check', 'rework'] as const;
/** Packed and waiting for the courier. */
export const READY_TO_SHIP_STATUSES = ['packed', 'printed_packed'] as const;

/** The production-status filter: the business workflow, in order. */
export const STAGE_FILTERS: { value: string; label: string; statuses: string[] }[] = [
  { value: 'photo_validation', label: 'Photo check', statuses: ['photo_validation'] },
  { value: 'print_rendering', label: 'Rendering', statuses: ['print_rendering', 'payment_confirmed', 'paid'] },
  { value: 'print_ready', label: 'Print ready', statuses: ['print_ready'] },
  { value: 'in_production', label: 'In production', statuses: ['in_production', 'rework'] },
  { value: 'quality_check', label: 'Quality check', statuses: ['quality_check'] },
  { value: 'packed', label: 'Packed', statuses: ['packed', 'printed_packed'] },
  { value: 'shipped', label: 'Shipped', statuses: ['shipped'] },
  { value: 'delivered', label: 'Delivered', statuses: ['delivered', 'replacement_issued'] },
  { value: 'cancelled', label: 'Cancelled', statuses: ['cancelled'] },
  { value: 'refunded', label: 'Refunded', statuses: ['refunded'] },
  { value: 'pending_payment', label: 'Not paid yet', statuses: ['pending_payment'] },
];

export type DateRange = 'all' | 'today' | 'yesterday' | '7d' | '30d';
export type SortKey = 'newest' | 'oldest' | 'amount_high' | 'amount_low';

export interface OrderFilters {
  q: string;
  payment: 'all' | PaymentState;
  stage: string; // '' or a STAGE_FILTERS value; 'processing' / 'ready' for the summary cards
  date: DateRange;
  method: 'all' | 'prepaid' | 'partial_cod';
  sort: SortKey;
}

export const DEFAULT_FILTERS: OrderFilters = { q: '', payment: 'all', stage: '', date: 'all', method: 'all', sort: 'newest' };

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DAY = 86_400_000;

/** Start of the India calendar day containing `now`, as a UTC instant. */
export function istDayStart(now: number): number {
  return Math.floor((now + IST_OFFSET_MS) / DAY) * DAY - IST_OFFSET_MS;
}

function inDateRange(placedAt: string | null, range: DateRange, now: number): boolean {
  if (range === 'all') return true;
  if (!placedAt) return false;
  const t = Date.parse(placedAt);
  const today = istDayStart(now);
  switch (range) {
    case 'today':
      return t >= today;
    case 'yesterday':
      return t >= today - DAY && t < today;
    case '7d':
      return t >= today - 6 * DAY;
    case '30d':
      return t >= today - 29 * DAY;
  }
}

function matchesStage(status: string, stage: string): boolean {
  if (!stage) return true;
  if (stage === 'processing') return (PROCESSING_STATUSES as readonly string[]).includes(status);
  if (stage === 'ready') return (READY_TO_SHIP_STATUSES as readonly string[]).includes(status);
  return STAGE_FILTERS.find((s) => s.value === stage)?.statuses.includes(status) ?? false;
}

/** Search by order number, customer name, phone (any 4+ digits), email or product name. */
export function matchesSearch(o: OrderRow, raw: string): boolean {
  const q = raw.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, '');
  if (o.orderNo.toLowerCase().includes(q.replace(/^#/, ''))) return true;
  if (digits.length >= 4 && (o.phone ?? '').replace(/\D/g, '').includes(digits)) return true;
  return [o.customerName, o.email, o.productTitle, o.city, o.razorpayPaymentId].some((v) => v?.toLowerCase().includes(q));
}

export function filterOrders(rows: OrderRow[], f: OrderFilters, now = Date.now()): OrderRow[] {
  const out = rows.filter(
    (o) =>
      matchesSearch(o, f.q) &&
      (f.payment === 'all' || paymentState(o) === f.payment) &&
      matchesStage(o.status, f.stage) &&
      inDateRange(o.placedAt, f.date, now) &&
      (f.method === 'all' || o.paymentMode === f.method)
  );
  const time = (o: OrderRow) => (o.placedAt ? Date.parse(o.placedAt) : 0);
  const sorters: Record<SortKey, (a: OrderRow, b: OrderRow) => number> = {
    newest: (a, b) => time(b) - time(a),
    oldest: (a, b) => time(a) - time(b),
    amount_high: (a, b) => b.total - a.total || time(b) - time(a),
    amount_low: (a, b) => a.total - b.total || time(b) - time(a),
  };
  return out.sort(sorters[f.sort]);
}

export interface OrderCounts {
  total: number;
  paid: number;
  failed: number;
  pending: number;
  refunded: number;
  unpaid: number;
  processing: number;
  readyToShip: number;
  photoCheck: number;
}

/** The summary cards. Processing and ready-to-ship count only orders that have been paid. */
export function countOrders(rows: OrderRow[]): OrderCounts {
  const c: OrderCounts = { total: rows.length, paid: 0, failed: 0, pending: 0, refunded: 0, unpaid: 0, processing: 0, readyToShip: 0, photoCheck: 0 };
  for (const o of rows) {
    c[paymentState(o)] += 1;
    if ((PROCESSING_STATUSES as readonly string[]).includes(o.status)) c.processing += 1;
    if ((READY_TO_SHIP_STATUSES as readonly string[]).includes(o.status)) c.readyToShip += 1;
    if (o.status === 'photo_validation') c.photoCheck += 1;
  }
  return c;
}

/** Reads filters from the address bar, so a card click, the back button and a shared link all keep the view. */
export function filtersFromParams(params: URLSearchParams): OrderFilters {
  const pick = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
    const v = params.get(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  };
  const stage = params.get('stage') ?? '';
  return {
    q: params.get('q') ?? '',
    payment: pick('payment', ['all', 'paid', 'failed', 'pending', 'refunded', 'unpaid'] as const, 'all'),
    stage: stage === 'processing' || stage === 'ready' || STAGE_FILTERS.some((s) => s.value === stage) ? stage : '',
    date: pick('date', ['all', 'today', 'yesterday', '7d', '30d'] as const, 'all'),
    method: pick('method', ['all', 'prepaid', 'partial_cod'] as const, 'all'),
    sort: pick('sort', ['newest', 'oldest', 'amount_high', 'amount_low'] as const, 'newest'),
  };
}

export function filtersToParams(f: OrderFilters): string {
  const p = new URLSearchParams();
  (Object.keys(f) as (keyof OrderFilters)[]).forEach((k) => {
    if (f[k] && f[k] !== DEFAULT_FILTERS[k]) p.set(k, String(f[k]));
  });
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** "2 h ago" style age for orders still waiting for payment. */
export function ageText(iso: string | null, now = Date.now()): string {
  if (!iso) return '';
  const mins = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}
