'use client';

import { use } from 'react';
import { ProductEditor } from '../../../../components/admin/product-editor/ProductEditor';

/** Admin → Products → new / edit: the guided frame editor. */
export default function AdminProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ProductEditor productId={id === 'new' ? null : id} />;
}
