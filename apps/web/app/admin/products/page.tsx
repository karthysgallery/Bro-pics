'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getFirestore, collection, getDocs, orderBy, query, limit } from 'firebase/firestore';
import type { Product } from '@bro-pics/shared';
import { getFirebaseApp } from '../../../lib/firebase-client';

function formatPaise(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[] | null>(null);

  useEffect(() => {
    const db = getFirestore(getFirebaseApp());
    getDocs(query(collection(db, 'products'), orderBy('title'), limit(200))).then((snapshot) => {
      setProducts(snapshot.docs.map((d) => d.data() as Product));
    });
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-brown-dark">Products</h1>
        <Link
          href="/admin/products/new"
          className="rounded-full bg-gradient-to-b from-brown-light to-brown text-cream px-4 py-2 text-sm"
        >
          + New product
        </Link>
      </div>

      {products === null ? (
        <p>Loading…</p>
      ) : products.length === 0 ? (
        <p className="text-brown/60">No products found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-brown/60 border-b border-gold/30">
                <th className="py-2 pr-4">Title</th>
                <th className="py-2 pr-4">Category</th>
                <th className="py-2 pr-4">Price</th>
                <th className="py-2 pr-4">Active</th>
                <th className="py-2 pr-4">In stock</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id} className="border-b border-gold/10">
                  <td className="py-2 pr-4 text-brown-dark">{product.title}</td>
                  <td className="py-2 pr-4 text-brown/70">{product.categoryId}</td>
                  <td className="py-2 pr-4 text-brown/70">{formatPaise(product.minPrice)}</td>
                  <td className="py-2 pr-4 text-brown/70">{product.isActive ? 'Yes' : 'No'}</td>
                  <td className="py-2 pr-4 text-brown/70">{product.inStock ? 'Yes' : 'No'}</td>
                  <td className="py-2">
                    <Link href={`/admin/products/${product.id}`} className="underline text-brown">
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
