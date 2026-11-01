import { Product, CategoryItem } from '../../types';
import { PRODUCTS, CATEGORIES } from '../../data/mockData';
import { ProductRepository, ProductFilters } from '../ProductRepository';

const CUSTOM_PRODUCTS_KEY = 'apaibay_custom_products';

export class ProductRepositoryLocal implements ProductRepository {
  private products: Product[];

  constructor() {
    this.products = [...PRODUCTS];
    this.loadCustomProducts();
  }

  private loadCustomProducts(): void {
    try {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem(CUSTOM_PRODUCTS_KEY);
        if (saved) {
          const customList: Product[] = JSON.parse(saved);
          if (Array.isArray(customList)) {
            // Merge custom products preventing duplicates
            const existingIds = new Set(this.products.map((p) => p.id));
            const newItems = customList.filter((p) => !existingIds.has(p.id));
            this.products = [...newItems, ...this.products];
          }
        }
      }
    } catch (e) {
      console.warn('Failed to load custom products from local storage:', e);
    }
  }

  async getAll(): Promise<Product[]> {
    return [...this.products];
  }

  async getById(id: string): Promise<Product | null> {
    const product = this.products.find((p) => p.id === id);
    return product ? { ...product } : null;
  }

  async getBySlug(slug: string): Promise<Product | null> {
    const product = this.products.find((p) => p.slug === slug);
    return product ? { ...product } : null;
  }

  async getByCategory(categorySlug: string): Promise<Product[]> {
    if (!categorySlug || categorySlug === 'all') {
      return [...this.products];
    }
    return this.products.filter(
      (p) => p.category.toLowerCase() === categorySlug.toLowerCase()
    );
  }

  async search(query: string, filters?: ProductFilters): Promise<Product[]> {
    let results = [...this.products];

    if (query && query.trim()) {
      const q = query.toLowerCase().trim();
      results = results.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          p.brand.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q))
      );
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
      if (typeof filters.minPrice === 'number') {
        results = results.filter((p) => p.price >= filters.minPrice!);
      }
      if (typeof filters.maxPrice === 'number') {
        results = results.filter((p) => p.price <= filters.maxPrice!);
      }
      if (typeof filters.minRating === 'number') {
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
          case 'featured':
          default:
            results.sort((a, b) => (b.isBestSeller ? 1 : 0) - (a.isBestSeller ? 1 : 0));
            break;
        }
      }
    }

    return results;
  }

  async create(productData: Omit<Product, 'id'>): Promise<Product> {
    const newId = `prod-slr-${Date.now()}`;
    const newProduct: Product = {
      ...productData,
      id: newId,
    };
    this.products = [newProduct, ...this.products];

    try {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem(CUSTOM_PRODUCTS_KEY);
        const list: Product[] = saved ? JSON.parse(saved) : [];
        list.unshift(newProduct);
        localStorage.setItem(CUSTOM_PRODUCTS_KEY, JSON.stringify(list));
      }
    } catch (e) {
      console.warn('Failed to persist custom product:', e);
    }

    return newProduct;
  }

  async getCategories(): Promise<CategoryItem[]> {
    return [...CATEGORIES];
  }
}

export const productRepository = new ProductRepositoryLocal();
