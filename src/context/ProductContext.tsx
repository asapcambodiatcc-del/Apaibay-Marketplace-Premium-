import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Product, CategoryItem } from '../types';
import { productRepository } from '../repositories';

interface ProductContextType {
  products: Product[];
  categories: CategoryItem[];
  loading: boolean;
  error: string | null;
  addProduct: (productData: Omit<Product, 'id'>) => Promise<Product>;
  getProductBySlug: (slug: string) => Product | undefined;
  getProductById: (id: string) => Product | undefined;
  refreshProducts: () => Promise<void>;
}

const ProductContext = createContext<ProductContextType | undefined>(undefined);

export const ProductProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProductsAndCategories = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [allProducts, allCategories] = await Promise.all([
        productRepository.getAll(),
        productRepository.getCategories(),
      ]);
      setProducts(allProducts);
      setCategories(allCategories);
    } catch (err) {
      console.error('Failed to load catalog:', err);
      setError('Unable to load product catalog');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProductsAndCategories();
  }, [fetchProductsAndCategories]);

  const addProduct = async (productData: Omit<Product, 'id'>): Promise<Product> => {
    const created = await productRepository.create(productData);
    setProducts((prev) => [created, ...prev]);
    return created;
  };

  const getProductBySlug = useCallback((slug: string): Product | undefined => {
    if (!slug) return undefined;
    return products.find((p) => p.slug === slug || p.id === slug);
  }, [products]);

  const getProductById = useCallback((id: string): Product | undefined => {
    if (!id) return undefined;
    return products.find((p) => p.id === id);
  }, [products]);

  return (
    <ProductContext.Provider
      value={{
        products,
        categories,
        loading,
        error,
        addProduct,
        getProductBySlug,
        getProductById,
        refreshProducts: fetchProductsAndCategories,
      }}
    >
      {children}
    </ProductContext.Provider>
  );
};

export const useProducts = (): ProductContextType => {
  const context = useContext(ProductContext);
  if (!context) {
    throw new Error('useProducts must be used within a ProductProvider');
  }
  return context;
};
