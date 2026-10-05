import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { loadEnvLocal } from './load-env';

/**
 * READ-ONLY audit of money values that the admin screens may have saved in the
 * wrong unit. Before the fix, the admin variant grid and the Shipping settings
 * tab edited RUPEES but saved them as-is into fields the storefront reads as
 * PAISE — so "₹999" became 999 paise (₹9.99), and "free shipping above ₹1,499"
 * became ₹14.99. This lists anything that looks like that. It writes nothing.
 *
 *   pnpm --filter @bro-pics/seed audit-live-data
 *
 * Uses the service account in apps/web/.env.local (i.e. whichever project that
 * points at). Nothing is changed; review the output and fix suspicious values
 * in Admin > Products / Settings, or tell the developer to script a correction.
 */
const SUSPICIOUSLY_LOW_PAISE = 10_000; // under ₹100 for a framed print is almost certainly a unit slip

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;

async function main(): Promise<void> {
  loadEnvLocal();
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!json) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set');
  const parsed = JSON.parse(json) as { project_id?: string };
  const app = initializeApp({ credential: cert(parsed as never) });
  const db = getFirestore(app);
  console.log(`Auditing project: ${parsed.project_id ?? '(unknown)'}  [read-only]\n`);

  let flagged = 0;

  const variants = await db.collectionGroup('variants').get();
  const lowVariants = variants.docs.filter((d) => {
    const price = (d.data() as { price?: number }).price;
    return typeof price === 'number' && price > 0 && price < SUSPICIOUSLY_LOW_PAISE;
  });
  console.log(`Variants: ${variants.size} total, ${lowVariants.length} priced under ${rupees(SUSPICIOUSLY_LOW_PAISE)}`);
  for (const d of lowVariants) {
    const v = d.data() as { sku?: string; price: number; compareAtPrice?: number };
    console.log(`  ⚠ ${d.ref.path}  sku=${v.sku ?? '?'}  price=${v.price} paise (${rupees(v.price)})${v.compareAtPrice ? `  compareAt=${v.compareAtPrice}` : ''}`);
    flagged++;
  }

  const products = await db.collection('products').get();
  const lowProducts = products.docs.filter((d) => {
    const basePrice = (d.data() as { basePrice?: number }).basePrice;
    return typeof basePrice === 'number' && basePrice > 0 && basePrice < SUSPICIOUSLY_LOW_PAISE;
  });
  console.log(`\nProducts: ${products.size} total, ${lowProducts.length} with basePrice under ${rupees(SUSPICIOUSLY_LOW_PAISE)}`);
  for (const d of lowProducts) {
    console.log(`  ⚠ products/${d.id}  basePrice=${(d.data() as { basePrice: number }).basePrice} paise`);
    flagged++;
  }

  const shipping = await db.collection('settings').doc('shipping').get();
  console.log('\nsettings/shipping:');
  if (!shipping.exists) {
    console.log('  (not set — the storefront uses its defaults: free above ₹1,500, ₹50 flat, ₹150 express)');
  } else {
    const s = shipping.data() as { freeShippingThreshold?: number; flatShippingCharge?: number; expressShippingCharge?: number };
    console.log(`  freeShippingThreshold=${s.freeShippingThreshold} paise (${rupees(s.freeShippingThreshold ?? 0)})`);
    console.log(`  flatShippingCharge=${s.flatShippingCharge} paise (${rupees(s.flatShippingCharge ?? 0)})`);
    console.log(`  expressShippingCharge=${s.expressShippingCharge} paise (${rupees(s.expressShippingCharge ?? 0)})`);
    if ((s.freeShippingThreshold ?? Infinity) < 50_000) {
      console.log('  ⚠ free-shipping threshold under ₹500 — nearly every order ships free. Likely saved in rupees by mistake.');
      flagged++;
    }
  }

  const gst = await db.collection('settings').doc('gst').get();
  console.log('\nsettings/gst:');
  if (!gst.exists) console.log('  (not set — GST is off)');
  else {
    const g = gst.data() as { gstEnabled?: boolean; taxRate?: number; gstin?: string };
    console.log(`  gstEnabled=${g.gstEnabled}  taxRate=${g.taxRate}  gstin=${g.gstin ?? '(none)'}`);
    if (g.gstEnabled && g.gstin && /^29ABCDE1234F1Z5$|^29AALCB1042P1Z8$/.test(g.gstin)) {
      console.log('  ⚠ this GSTIN is a known placeholder from the old admin form — replace it with the real one.');
      flagged++;
    }
  }

  const coupons = await db.collection('coupons').get();
  console.log(`\nCoupons: ${coupons.size}`);
  for (const d of coupons.docs) {
    const c = d.data() as { type?: string; value?: number; minOrder?: number; appliesTo?: string };
    console.log(`  ${d.id}: type=${c.type} value=${c.value} minOrder=${c.minOrder ?? 0} appliesTo=${c.appliesTo}`);
    if (c.type === 'flat' && typeof c.value === 'number' && c.value < 1000) {
      console.log('    ⚠ flat discount under ₹10 — check it was not entered in rupees and stored as paise.');
      flagged++;
    }
  }

  console.log(`\n${flagged === 0 ? 'Nothing suspicious found.' : `${flagged} item(s) flagged above.`}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
