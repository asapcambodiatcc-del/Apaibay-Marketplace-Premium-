/**
 * Apaibay Marketplace Premium - Official Server-Side Catalog Seeding Script
 * Safe, idempotent, admin/server-only execution.
 * NEVER run automatically from unauthenticated browser clients.
 */

import { db, doc, getDoc, setDoc, collection, getDocs } from '../server/repositories/serverFirestore';
import { PRODUCTS, CATEGORIES } from '../src/data/mockData';
import { Product } from '../src/types';

const INITIAL_COUPONS = [
  {
    id: 'coupon_apaibay10',
    code: 'APAIBAY10',
    discountType: 'percentage',
    discountValue: 10,
    minOrderAmount: 30,
    active: true,
  },
  {
    id: 'coupon_vip25',
    code: 'VIP25',
    discountType: 'fixed',
    discountValue: 25,
    minOrderAmount: 100,
    active: true,
  },
  {
    id: 'coupon_save5',
    code: 'SAVE5',
    discountType: 'fixed',
    discountValue: 5,
    minOrderAmount: 20,
    active: true,
  },
];

export async function seedCatalogSafely(dryRun: boolean = true) {
  console.log(`[SeedCatalog] Starting catalog check (dryRun: ${dryRun})...`);

  // 1. Categories
  let categoriesCreated = 0;
  for (const cat of CATEGORIES) {
    const docRef = doc(db, 'categories', cat.id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      categoriesCreated++;
      if (!dryRun) {
        await setDoc(docRef, { ...cat, active: true, sortOrder: 1, createdAt: new Date().toISOString() });
      }
    }
  }
  console.log(`[SeedCatalog] Categories: ${categoriesCreated} missing out of ${CATEGORIES.length}.`);

  // 2. Products
  let productsCreated = 0;
  for (const prod of PRODUCTS) {
    const docRef = doc(db, 'products', prod.id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      productsCreated++;
      if (!dryRun) {
        const seeded: Product = {
          ...prod,
          sellerId: prod.seller?.name ? 'seller-apaibay-official' : 'admin',
          stock: prod.stockCount || prod.stock || 20,
          stockCount: prod.stockCount || prod.stock || 20,
          inStock: true,
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await setDoc(docRef, seeded);
      }
    }
  }
  console.log(`[SeedCatalog] Products: ${productsCreated} missing out of ${PRODUCTS.length}.`);

  // 3. Coupons
  let couponsCreated = 0;
  for (const coupon of INITIAL_COUPONS) {
    const docRef = doc(db, 'coupons', coupon.code);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      couponsCreated++;
      if (!dryRun) {
        await setDoc(docRef, coupon);
      }
    }
  }
  console.log(`[SeedCatalog] Coupons: ${couponsCreated} missing out of ${INITIAL_COUPONS.length}.`);

  console.log('[SeedCatalog] Catalog inspection completed successfully.');
}

if (process.argv[1]?.endsWith('seed-firestore-catalog.ts')) {
  const isCommit = process.argv.includes('--commit');
  seedCatalogSafely(!isCommit)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[SeedCatalog] Error:', err);
      process.exit(1);
    });
}
