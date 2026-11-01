import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';
import { useProducts } from '../context/ProductContext';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { NotFound } from '../components/NotFound';
import {
  Star,
  SlidersHorizontal,
  ChevronRight,
  Heart,
  ShoppingBag,
  RotateCcw,
  Check,
  PackageX,
  Search,
} from 'lucide-react';
import { Product } from '../types';

interface CategoryPageProps {
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

export const CategoryPage: React.FC<CategoryPageProps> = ({ onShowToast }) => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { t, tCategory } = useLanguage();
  const { products, categories, loading } = useProducts();
  const { addToCart } = useCart();
  const { isInWishlist, toggleWishlist } = useWishlist();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  const [minPrice, setMinPrice] = useState<string>('');
  const [maxPrice, setMaxPrice] = useState<string>('');
  const [minRating, setMinRating] = useState<number>(0);
  const [inStockOnly, setInStockOnly] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<'featured' | 'price-asc' | 'price-desc' | 'rating' | 'newest'>('featured');
  const [showMobileFilters, setShowMobileFilters] = useState<boolean>(false);

  // Validate category slug
  const currentCategory = useMemo(() => {
    if (!slug) return null;
    if (slug === 'all') {
      return {
        id: 'all',
        name: 'All Categories',
        slug: 'all',
        iconName: 'Grid',
        image: '',
        productCount: products.length,
      };
    }
    return categories.find((c) => c.slug.toLowerCase() === slug.toLowerCase()) || null;
  }, [slug, categories, products.length]);

  // Scroll to top on category change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setSearchQuery('');
    setSelectedBrand('all');
    setMinPrice('');
    setMaxPrice('');
    setMinRating(0);
    setInStockOnly(false);
  }, [slug]);

  // Get distinct brands in this category
  const availableBrands = useMemo(() => {
    const brandSet = new Set<string>();
    products.forEach((p) => {
      if (!slug || slug === 'all' || p.category.toLowerCase() === slug.toLowerCase()) {
        brandSet.add(p.brand);
      }
    });
    return Array.from(brandSet).sort();
  }, [products, slug]);

  // Filter & Sort Products
  const filteredProducts = useMemo(() => {
    let list = products.filter((p) => {
      if (slug && slug !== 'all' && p.category.toLowerCase() !== slug.toLowerCase()) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = p.name.toLowerCase().includes(q);
        const matchBrand = p.brand.toLowerCase().includes(q);
        const matchDesc = p.description.toLowerCase().includes(q);
        if (!matchName && !matchBrand && !matchDesc) return false;
      }
      if (selectedBrand !== 'all' && p.brand.toLowerCase() !== selectedBrand.toLowerCase()) {
        return false;
      }
      if (minPrice && !isNaN(Number(minPrice)) && p.price < Number(minPrice)) {
        return false;
      }
      if (maxPrice && !isNaN(Number(maxPrice)) && p.price > Number(maxPrice)) {
        return false;
      }
      if (minRating > 0 && p.rating < minRating) {
        return false;
      }
      if (inStockOnly && !p.inStock) {
        return false;
      }
      return true;
    });

    switch (sortBy) {
      case 'price-asc':
        list.sort((a, b) => a.price - b.price);
        break;
      case 'price-desc':
        list.sort((a, b) => b.price - a.price);
        break;
      case 'rating':
        list.sort((a, b) => b.rating - a.rating);
        break;
      case 'newest':
        list.sort((a, b) => (b.isNewArrival ? 1 : 0) - (a.isNewArrival ? 1 : 0));
        break;
      case 'featured':
      default:
        list.sort((a, b) => (b.isBestSeller ? 1 : 0) - (a.isBestSeller ? 1 : 0));
        break;
    }

    return list;
  }, [products, slug, searchQuery, selectedBrand, minPrice, maxPrice, minRating, inStockOnly, sortBy]);

  if (!loading && !currentCategory) {
    return <NotFound />;
  }

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedBrand('all');
    setMinPrice('');
    setMaxPrice('');
    setMinRating(0);
    setInStockOnly(false);
    setSortBy('featured');
  };

  const handleAddToCart = (e: React.MouseEvent, product: Product) => {
    e.stopPropagation();
    addToCart(product, 1);
    onShowToast(`Added "${product.name.slice(0, 22)}..." to cart`, 'success');
  };

  const handleToggleWishlist = (e: React.MouseEvent, productId: string) => {
    e.stopPropagation();
    toggleWishlist(productId);
    const inWishlist = isInWishlist(productId);
    onShowToast(
      inWishlist ? 'Removed from wishlist' : 'Saved to wishlist',
      inWishlist ? 'info' : 'success'
    );
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Category Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
        <Link to="/" className="hover:text-[#ff6a00] transition-colors">
          {t('nav.home', 'Home')}
        </Link>
        <ChevronRight className="w-3.5 h-3.5 shrink-0" />
        <span className="text-slate-900 dark:text-white font-medium capitalize">
          {slug ? tCategory(slug) : 'Marketplace'}
        </span>
      </nav>

      {/* Category Header Banner */}
      <div className="p-6 sm:p-8 rounded-3xl bg-slate-900 text-white relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div className="relative z-10 space-y-2 max-w-xl">
          <span className="text-xs font-black uppercase tracking-widest text-[#ff6a00]">
            Marketplace Category
          </span>
          <h1 className="text-2xl sm:text-4xl font-extrabold capitalize leading-tight">
            {slug ? tCategory(slug) : 'All Products'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-300">
            Browse verified listings, premium global deals, and high-rating merchant catalogs.
          </p>
        </div>

        <div className="relative z-10 text-xs text-slate-300 font-semibold bg-white/10 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/10 self-start md:self-auto">
          <span>Showing <strong className="text-white font-extrabold">{filteredProducts.length}</strong> items</span>
        </div>

        {/* Decorative background glow */}
        <div className="absolute -right-16 -bottom-16 w-64 h-64 bg-[#ff6a00]/20 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* Main Filter & Catalog Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Filter Sidebar (Desktop) */}
        <aside className="hidden lg:block lg:col-span-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 space-y-6 sticky top-24 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white text-sm">
              <SlidersHorizontal className="w-4 h-4 text-[#ff6a00]" />
              <span>{t('search.filters', 'Filter Products')}</span>
            </div>
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-xs text-[#ff6a00] hover:underline font-semibold cursor-pointer"
            >
              {t('common.reset', 'Reset')}
            </button>
          </div>

          {/* Quick Search in Category */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {t('search.placeholder', 'Search within category')}
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by keyword..."
                className="w-full text-xs py-2 pl-8 pr-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/30 text-slate-900 dark:text-white"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            </div>
          </div>

          {/* Price Range Filter */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {t('search.price', 'Price Range ($)')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                placeholder="Min"
                className="w-full text-xs py-1.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/30 text-slate-900 dark:text-white"
              />
              <input
                type="number"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                placeholder="Max"
                className="w-full text-xs py-1.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/30 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          {/* Brand Filter */}
          {availableBrands.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {t('search.brand', 'Brand')}
              </label>
              <select
                value={selectedBrand}
                onChange={(e) => setSelectedBrand(e.target.value)}
                className="w-full text-xs py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/30 text-slate-900 dark:text-white cursor-pointer"
              >
                <option value="all">All Brands</option>
                {availableBrands.map((brand) => (
                  <option key={brand} value={brand}>
                    {brand}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Rating Filter */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {t('search.rating', 'Minimum Rating')}
            </label>
            <div className="flex items-center gap-1.5">
              {[4, 3, 2, 1].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setMinRating((prev) => (prev === r ? 0 : r))}
                  className={`flex-1 py-1.5 px-1 rounded-xl text-xs font-bold border flex items-center justify-center gap-1 transition-all cursor-pointer ${
                    minRating === r
                      ? 'bg-[#ff6a00] text-white border-[#ff6a00]'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <span>{r}</span>
                  <Star className="w-3 h-3 fill-current" />
                </button>
              ))}
            </div>
          </div>

          {/* In Stock Only Toggle */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <label className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
              <span>{t('search.inStockOnly', 'In Stock Only')}</span>
              <input
                type="checkbox"
                checked={inStockOnly}
                onChange={(e) => setInStockOnly(e.target.checked)}
                className="w-4 h-4 text-[#ff6a00] rounded-sm focus:ring-[#ff6a00]/30 cursor-pointer"
              />
            </label>
          </div>
        </aside>

        {/* Catalog Grid Area */}
        <div className="lg:col-span-9 space-y-4">
          {/* Top Bar Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            {/* Mobile Filter Toggle Button */}
            <button
              type="button"
              onClick={() => setShowMobileFilters((prev) => !prev)}
              className="lg:hidden inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#ff6a00]" />
              <span>{t('search.filters', 'Filters')}</span>
            </button>

            {/* Sort Selector */}
            <div className="flex items-center gap-2 ml-auto text-xs">
              <span className="font-semibold text-slate-500 dark:text-slate-400">
                {t('search.sortBy', 'Sort by:')}
              </span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="py-1.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/30 cursor-pointer"
              >
                <option value="featured">{t('search.sortFeatured', 'Featured & Best Seller')}</option>
                <option value="price-asc">{t('search.sortPriceLow', 'Price: Low to High')}</option>
                <option value="price-desc">{t('search.sortPriceHigh', 'Price: High to Low')}</option>
                <option value="rating">{t('search.sortRating', 'Customer Rating')}</option>
                <option value="newest">{t('search.sortNewest', 'Newest Arrivals')}</option>
              </select>
            </div>
          </div>

          {/* Mobile Filters Dropdown if opened */}
          {showMobileFilters && (
            <div className="lg:hidden p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-xs font-bold text-slate-900 dark:text-white">Active Filters</span>
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="text-xs text-[#ff6a00] font-bold"
                >
                  Reset All
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  placeholder="Min Price"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  className="text-xs p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
                <input
                  type="number"
                  placeholder="Max Price"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  className="text-xs p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>
              <label className="flex items-center justify-between text-xs font-bold">
                <span>In Stock Only</span>
                <input
                  type="checkbox"
                  checked={inStockOnly}
                  onChange={(e) => setInStockOnly(e.target.checked)}
                  className="w-4 h-4 text-[#ff6a00]"
                />
              </label>
            </div>
          )}

          {/* Products Grid */}
          {filteredProducts.length === 0 ? (
            <div className="min-h-[40vh] flex flex-col items-center justify-center p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-orange-50 dark:bg-orange-950/40 text-[#ff6a00] flex items-center justify-center">
                <PackageX className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                No products found
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 max-w-sm">
                No items matched your current filter criteria in this category. Try adjusting or resetting your filters.
              </p>
              <button
                type="button"
                onClick={handleResetFilters}
                className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#ff6a00] text-white text-xs font-bold hover:bg-[#e05d00] transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Filters</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {filteredProducts.map((prod) => {
                const inWishlist = isInWishlist(prod.id);
                return (
                  <div
                    key={prod.id}
                    onClick={() => navigate(`/product/${prod.slug}`)}
                    className="group relative rounded-2xl sm:rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-3 flex flex-col justify-between hover:border-[#ff6a00]/40 transition-all hover:shadow-md cursor-pointer"
                  >
                    {/* Top Image Container */}
                    <div className="relative aspect-square rounded-xl sm:rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 mb-3">
                      <img
                        src={prod.image || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=400&q=80'}
                        alt={prod.name || 'Product'}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />

                      {prod.discountPercentage > 0 && (
                        <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-[#ff6a00] text-white text-[10px] font-black shadow-xs">
                          -{prod.discountPercentage}%
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={(e) => handleToggleWishlist(e, prod.id)}
                        aria-label={inWishlist ? 'Remove from wishlist' : 'Add to wishlist'}
                        className={`absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center shadow-md backdrop-blur-xs transition-colors cursor-pointer ${
                          inWishlist
                            ? 'bg-rose-50 text-rose-500 dark:bg-rose-950/80'
                            : 'bg-white/90 dark:bg-slate-900/90 text-slate-600 dark:text-slate-300 hover:text-rose-500'
                        }`}
                      >
                        <Heart className={`w-4 h-4 ${inWishlist ? 'fill-current' : ''}`} />
                      </button>
                    </div>

                    {/* Content */}
                    <div className="space-y-1.5 flex-1 flex flex-col justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-[#ff6a00] uppercase tracking-wider">
                          {prod.brand}
                        </span>
                        <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white line-clamp-2 leading-snug group-hover:text-[#ff6a00] transition-colors">
                          {prod.name}
                        </h4>
                      </div>

                      {/* Rating */}
                      <div className="flex items-center gap-1 pt-1">
                        <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                        <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                          {prod.rating.toFixed(1)}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          ({prod.reviewCount})
                        </span>
                      </div>

                      {/* Price & Action */}
                      <div className="flex items-center justify-between pt-2">
                        <div>
                          <div className="text-sm sm:text-base font-extrabold text-[#ff6a00]">
                            ${prod.price.toFixed(2)}
                          </div>
                          {prod.originalPrice > prod.price && (
                            <div className="text-[11px] text-slate-400 line-through">
                              ${prod.originalPrice.toFixed(2)}
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={(e) => handleAddToCart(e, prod)}
                          aria-label="Add to cart"
                          className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-orange-50 dark:bg-orange-950/50 hover:bg-[#ff6a00] text-[#ff6a00] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <ShoppingBag className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
