'use client';

import Link from 'next/link';
import { ReportView } from '../../../../components/admin/billing/ReportView';
import { PageHeader, primaryButton } from '../../../../components/admin/billing/ui';

/** Admin → Billing → Offline sales: today's (or any range's) in-store takings. */
export default function PosSalesPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6 md:p-8">
      <PageHeader title="Offline sales" actions={<Link href="/admin/billing/new" className={primaryButton}>New bill</Link>}>
        In-store bills and returns. Cash, UPI and card totals are after refunds paid back the same way.
      </PageHeader>
      <ReportView channel="pos" full={false} />
      <p className="text-xs text-ink/60">
        See every bill in <Link className="underline" href="/admin/billing/invoices?channel=pos">Bills / Invoices</Link>.
      </p>
    </div>
  );
}
