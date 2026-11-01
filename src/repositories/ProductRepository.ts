import { Product, CategoryItem } from '../types';

export interface ProductFilters {
  category?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  inStockOnly?: boolean;
  sortBy?: 'featured' | 'price-asc' | 'price-desc' | 'rating' | 'newest';
}

export interface ProductRepository {
  getAll(): Promise<Product[]>;
  getById(id: string): Promise<Product | null>;
  getBySlug(slug: string): Promise<Product | null>;
  getByCategory(categorySlug: string): Promise<Product[]>;
  search(query: string, filters?: ProductFilters): Promise<Product[]>;
  create(product: Omit<Product, 'id'>): Promise<Product>;
  getCategories(): Promise<CategoryItem[]>;
}
