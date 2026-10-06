import type { ReactNode } from 'react';
import { AdminShell } from '../../components/admin/AdminShell';

export default function AdminLayout({ children }: { children: ReactNode }) {
  // data-admin-root keeps the admin on the Everyday colours whatever festival theme the shop shows.
  return (
    <div data-admin-root="">
      <AdminShell>{children}</AdminShell>
    </div>
  );
}
