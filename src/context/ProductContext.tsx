import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Product, CategoryItem } from '../types';
import { productRepository } from '../repositories';

interface ProductContextType {
  products: Product[];
  allProducts: Product[];
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
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProductsAndCategories = useCallback(async (forceRefresh: boolean = false) => {
    try {
      setLoading(true);
      setError(null);
      const [fetchedProducts, allCategories] = await Promise.all([
        productRepository.getAll(forceRefresh),
        productRepository.getCategories(),
      ]);
      setAllProducts(fetchedProducts);
      setCategories(allCategories);
    } catch (err) {
      console.error('Failed to load catalog:', err);
      setError('Unable to load product catalog');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProductsAndCategories(false);
  }, [fetchProductsAndCategories]);

  // Public storefront catalog strictly excludes archived and draft products
  const products = useMemo(
    () => allProducts.filter((p) => p.status !== 'archived' && p.status !== 'draft'),
    [allProducts]
  );

  const addProduct = async (productData: Omit<Product, 'id'>): Promise<Product> => {
    const created = await productRepository.create(productData);
    setAllProducts((prev) => [created, ...prev]);
    return created;
  };

  const getProductBySlug = useCallback((slug: string): Product | undefined => {
    if (!slug) return undefined;
    return allProducts.find((p) => p.slug === slug || p.id === slug);
  }, [allProducts]);

  const getProductById = useCallback((id: string): Product | undefined => {
    if (!id) return undefined;
    return allProducts.find((p) => p.id === id);
  }, [allProducts]);

  const refreshProducts = useCallback(async () => {
    await fetchProductsAndCategories(true);
  }, [fetchProductsAndCategories]);

  return (
    <ProductContext.Provider
      value={{
        products,
        allProducts,
        categories,
        loading,
        error,
        addProduct,
        getProductBySlug,
        getProductById,
        refreshProducts,
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
