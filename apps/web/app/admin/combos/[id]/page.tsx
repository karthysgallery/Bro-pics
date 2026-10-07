'use client';

import { use } from 'react';
import { ComboEditor } from '../../../../components/admin/combos/ComboEditor';

export default function AdminComboPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ComboEditor comboId={id === 'new' ? null : id} />;
}
