import { CategoryItem } from '../types';

export interface CategoryRepository {
  getAll(): Promise<CategoryItem[]>;
  getBySlug(slug: string): Promise<CategoryItem | null>;
  create(category: Omit<CategoryItem, 'id'>): Promise<CategoryItem>;
}
