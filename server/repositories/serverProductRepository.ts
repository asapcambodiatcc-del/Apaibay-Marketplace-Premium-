import { db, doc, getDoc, setDoc } from './serverFirestore';
import { PRODUCTS } from '../../src/data/mockData';
import { Product } from '../../src/types';

export class ServerProductRepository {
  static seededProductIds = new Set<string>();
  /**
   * Retrieves canonical product from Firestore, fallback-seeding from canonical baseline if needed.
   */
  static async getCanonicalProduct(productId: string): Promise<Product | null> {
    try {
      const docRef = doc(db, 'products', productId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return { id: snap.id, ...(snap.data() as Omit<Product, 'id'>) };
      }
    } catch {
      // Fallback
    }

    // Lookup in canonical dataset
    const baseline = PRODUCTS.find((p) => p.id === productId);
    if (baseline) {
      if (!ServerProductRepository.seededProductIds.has(productId)) {
        try {
          const docRef = doc(db, 'products', productId);
          const seeded: Product = {
            ...baseline,
            sellerId: baseline.seller?.name ? 'seller-apaibay-official' : 'admin',
            stock: baseline.stockCount || baseline.stock || 20,
            stockCount: baseline.stockCount || baseline.stock || 20,
            inStock: true,
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          await setDoc(docRef, seeded, { merge: true });
          ServerProductRepository.seededProductIds.add(productId);
          return seeded;
        } catch {
          ServerProductRepository.seededProductIds.add(productId);
          return baseline;
        }
      }
      return baseline;
    }

    return null;
  }
}
