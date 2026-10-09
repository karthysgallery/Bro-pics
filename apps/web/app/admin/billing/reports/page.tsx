'use client';

import { ReportView } from '../../../../components/admin/billing/ReportView';
import { PageHeader } from '../../../../components/admin/billing/ui';

/** Admin → Billing → Reports: online + in store, from the invoices and credit notes themselves. */
export default function BillingReportsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6 md:p-8">
      <PageHeader title="Billing reports">
        Sales by date, product, category and payment method; online vs in store; discounts, returns and net sales. Every figure comes from an issued invoice or credit note.
      </PageHeader>
      <ReportView full />
    </div>
  );
}
