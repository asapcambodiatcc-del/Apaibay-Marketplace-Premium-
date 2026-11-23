import {
  collection,
  doc,
  getDocs,
  getDoc,
} from 'firebase/firestore';
import { db, auth } from '../../services/firebase/config';
import { handleFirestoreError, OperationType } from '../../services/firebase/firestoreErrors';
import { Product, CategoryItem } from '../../types';
import { ProductRepository, ProductFilters } from '../ProductRepository';
import { PRODUCTS, CATEGORIES } from '../../data/mockData';
import { recordFirestoreError } from '../../services/firebase/quotaCircuitBreaker';

const PRODUCTS_COLLECTION = 'products';
const CATEGORIES_COLLECTION = 'categories';

export class FirebaseProductRepository implements ProductRepository {
  private memoryCache: Product[] = [];

  private async ensureInitialized(forceRefresh: boolean = false): Promise<Product[]> {
    if (!forceRefresh && this.memoryCache.length > 0) {
      return this.memoryCache;
    }

    try {
      const colRef = collection(db, PRODUCTS_COLLECTION);
      const snapshot = await getDocs(colRef);
      if (!snapshot.empty) {
        this.memoryCache = snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Product, 'id'>),
        }));
        return this.memoryCache;
      }

      // If empty in remote Firestore, fall back to canonical baseline dataset in memory.
      // Client code must NEVER attempt unprivileged catalog writes to Firestore.
      this.memoryCache = [...PRODUCTS];
      return this.memoryCache;
    } catch (error) {
      recordFirestoreError(error, 'FirebaseProductRepository.getAll');
      if (this.memoryCache.length === 0) {
        this.memoryCache = [...PRODUCTS];
      }
      return this.memoryCache;
    }
  }

  async getAll(forceRefresh: boolean = false): Promise<Product[]> {
    return this.ensureInitialized(forceRefresh);
  }

  async getById(id: string): Promise<Product | null> {
    try {
      const docRef = doc(db, PRODUCTS_COLLECTION, id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return { id: docSnap.id, ...(docSnap.data() as Omit<Product, 'id'>) };
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `${PRODUCTS_COLLECTION}/${id}`);
    }
    const all = await this.getAll();
    return all.find((p) => p.id === id) || null;
  }

  async getBySlug(slug: string): Promise<Product | null> {
    const all = await this.getAll();
    return all.find((p) => p.slug === slug) || null;
  }

  async getByCategory(categorySlug: string): Promise<Product[]> {
    const all = (await this.getAll()).filter(
      (p) => p.status !== 'archived' && p.status !== 'draft'
    );
    if (!categorySlug || categorySlug === 'all') {
      return all;
    }
    return all.filter((p) => p.category.toLowerCase() === categorySlug.toLowerCase());
  }

  async search(searchQuery: string, filters?: ProductFilters): Promise<Product[]> {
    let results = (await this.getAll()).filter(
      (p) => p.status !== 'archived' && p.status !== 'draft'
    );

    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      results = results.filter((p) => {
        const inName = p.name.toLowerCase().includes(q);
        const inBrand = p.brand.toLowerCase().includes(q);
        const inDesc = p.description.toLowerCase().includes(q);
        const inCategory = p.category.toLowerCase().includes(q);
        const inTags = p.tags?.some((t) => t.toLowerCase().includes(q));
        return inName || inBrand || inDesc || inCategory || inTags;
      });
    }

    if (filters) {
      if (filters.category && filters.category !== 'all') {
        results = results.filter(
          (p) => p.category.toLowerCase() === filters.category!.toLowerCase()
        );
      }
      if (filters.brand) {
        results = results.filter(
          (p) => p.brand.toLowerCase() === filters.brand!.toLowerCase()
        );
      }
      if (filters.minPrice !== undefined) {
        results = results.filter((p) => p.price >= filters.minPrice!);
      }
      if (filters.maxPrice !== undefined) {
        results = results.filter((p) => p.price <= filters.maxPrice!);
      }
      if (filters.minRating !== undefined) {
        results = results.filter((p) => p.rating >= filters.minRating!);
      }
      if (filters.inStockOnly) {
        results = results.filter((p) => p.inStock);
      }
      if (filters.sortBy) {
        switch (filters.sortBy) {
          case 'price-asc':
            results.sort((a, b) => a.price - b.price);
            break;
          case 'price-desc':
            results.sort((a, b) => b.price - a.price);
            break;
          case 'rating':
            results.sort((a, b) => b.rating - a.rating);
            break;
          case 'newest':
            results.sort((a, b) => (b.isNewArrival ? 1 : 0) - (a.isNewArrival ? 1 : 0));
            break;
          default:
            break;
        }
      }
    }

    return results;
  }

  async create(productData: Omit<Product, 'id'>): Promise<Product> {
    const current = auth.currentUser;
    if (!current) {
      throw new Error('Authentication required to create a product listing.');
    }

    const token = await current.getIdToken();
    const res = await fetch('/api/commerce/products', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: productData.name,
        price: productData.price,
        originalPrice: productData.originalPrice,
        category: productData.category,
        brand: productData.brand,
        image: productData.image,
        description: productData.description,
        stock: productData.stock ?? productData.stockCount ?? 25,
      }),
    });

    const body = await res.json();
    if (!res.ok || !body.success || !body.product) {
      throw new Error(body?.error?.message || 'Only verified sellers or administrators may publish products.');
    }

    const createdProduct = body.product as Product;
    this.memoryCache.unshift(createdProduct);
    return createdProduct;
  }

  async getCategories(): Promise<CategoryItem[]> {
    try {
      const colRef = collection(db, CATEGORIES_COLLECTION);
      const snapshot = await getDocs(colRef);
      if (!snapshot.empty) {
        return snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<CategoryItem, 'id'>),
        }));
      }
    } catch {
      // Fallback to CATEGORIES
    }
    return [...CATEGORIES];
  }
}
