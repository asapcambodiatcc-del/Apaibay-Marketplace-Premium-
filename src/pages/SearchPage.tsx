import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';
import { useProducts } from '../context/ProductContext';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import {
  Search,
  SlidersHorizontal,
  Star,
  ShoppingBag,
  Heart,
  RotateCcw,
  Sparkles,
  PackageX,
  Camera,
  ScanLine,
} from 'lucide-react';
import { Product } from '../types';

interface SearchPageProps {
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
  onOpenScanner?: () => void;
  onOpenVisualSearch?: () => void;
}

const POPULAR_SEARCHES = [
  'smartwatch gps',
  'wireless earbuds',
  'mechanical keyboard',
  'leather jacket',
  'coffee espresso machine',
  'apple',
  'sony',
];

export const SearchPage: React.FC<SearchPageProps> = ({
  onShowToast,
  onOpenScanner,
  onOpenVisualSearch,
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t, tCategory } = useLanguage();
  const { products } = useProducts();
  const { addToCart } = useCart();
  const { isInWishlist, toggleWishlist } = useWishlist();

  const initialQuery = searchParams.get('q') || '';
  const [searchInput, setSearchInput] = useState(initialQuery);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  const [minPrice, setMinPrice] = useState<string>('');
  const [maxPrice, setMaxPrice] = useState<string>('');
  const [minRating, setMinRating] = useState<number>(0);
  const [inStockOnly, setInStockOnly] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<'featured' | 'price-asc' | 'price-desc' | 'rating' | 'newest'>('featured');

  // Synchronize local input if URL query changes
  useEffect(() => {
    setSearchInput(searchParams.get('q') || '');
  }, [searchParams]);

  const activeQuery = searchParams.get('q') || '';

  // Get available brands
  const availableBrands = useMemo(() => {
    const brands = new Set<string>();
    products.forEach((p) => brands.add(p.brand));
    return Array.from(brands).sort();
  }, [products]);

  // Categories list
  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach((p) => cats.add(p.category));
    return Array.from(cats).sort();
  }, [products]);

  // Execute Search Form
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchParams({ q: searchInput.trim() });
  };

  const handleQuickSearch = (term: string) => {
    setSearchInput(term);
    setSearchParams({ q: term });
  };

  // Filter & Sort
  const filteredProducts = useMemo(() => {
    let list = products.filter((p) => {
      if (activeQuery.trim()) {
        const q = activeQuery.toLowerCase().trim();
        const matchName = p.name.toLowerCase().includes(q);
        const matchBrand = p.brand.toLowerCase().includes(q);
        const matchCategory = p.category.toLowerCase().includes(q);
        const matchDesc = p.description.toLowerCase().includes(q);
        const matchTag = p.tags.some((t) => t.toLowerCase().includes(q));
        if (!matchName && !matchBrand && !matchCategory && !matchDesc && !matchTag) {
          return false;
        }
      }
      if (selectedCategory !== 'all' && p.category.toLowerCase() !== selectedCategory.toLowerCase()) {
        return false;
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
  }, [products, activeQuery, selectedCategory, selectedBrand, minPrice, maxPrice, minRating, inStockOnly, sortBy]);

  const handleResetFilters = () => {
    setSelectedCategory('all');
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
      {/* Search Header Bar */}
      <div className="p-6 rounded-3xl bg-slate-900 text-white space-y-4">
        <form onSubmit={handleSearchSubmit} className="flex gap-2 max-w-2xl">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t('search.placeholder', 'Search millions of products, brands, and deals...')}
              className="w-full py-3 pl-10 pr-4 rounded-2xl bg-white/10 text-white placeholder-slate-400 border border-white/20 focus:outline-none focus:ring-2 focus:ring-[#ff6a00] text-sm"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
          </div>
          <button
            type="submit"
            className="px-6 py-3 rounded-2xl bg-[#ff6a00] hover:bg-[#e05d00] text-white font-bold text-sm transition-colors cursor-pointer"
          >
            {t('search.button', 'Search')}
          </button>
        </form>

        {/* Camera and Barcode Quick Actions */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
          <span className="text-slate-400">{t('search.popular', 'Trending searches')}:</span>
          {POPULAR_SEARCHES.map((term) => (
            <button
              key={term}
              type="button"
              onClick={() => handleQuickSearch(term)}
              className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 transition-colors cursor-pointer"
            >
              {term}
            </button>
          ))}

          {(onOpenVisualSearch || onOpenScanner) && (
            <div className="flex items-center gap-2 ml-auto">
              {onOpenVisualSearch && (
                <button
                  type="button"
                  onClick={onOpenVisualSearch}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[#ff6a00] font-bold cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>{t('header.cameraSearch', 'Visual Search')}</span>
                </button>
              )}
              {onOpenScanner && (
                <button
                  type="button"
                  onClick={onOpenScanner}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[#ff6a00] font-bold cursor-pointer"
                >
                  <ScanLine className="w-3.5 h-3.5" />
                  <span>{t('header.scanner', 'Scan Barcode')}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Results Title & Counts */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div>
          <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white">
            {activeQuery ? (
              <>
                {t('search.resultsFor', 'Search results for')}{' '}
                <span className="text-[#ff6a00]">"{activeQuery}"</span>
              </>
            ) : (
              'All Marketplace Products'
            )}
          </h2>
          <p className="text-xs text-slate-500">
            Found {filteredProducts.length} items matching your query
          </p>
        </div>

        {/* Sort selector */}
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-slate-500">{t('search.sortBy', 'Sort by:')}</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="py-1.5 px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-bold text-slate-900 dark:text-white cursor-pointer"
          >
            <option value="featured">{t('search.sortFeatured', 'Featured & Best Seller')}</option>
            <option value="price-asc">{t('search.sortPriceLow', 'Price: Low to High')}</option>
            <option value="price-desc">{t('search.sortPriceHigh', 'Price: High to Low')}</option>
            <option value="rating">{t('search.sortRating', 'Customer Rating')}</option>
            <option value="newest">{t('search.sortNewest', 'Newest Arrivals')}</option>
          </select>
        </div>
      </div>

      {/* Grid with Filters Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Filter Column */}
        <aside className="lg:col-span-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <span className="font-bold text-xs uppercase tracking-wider text-slate-500">Filters</span>
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-xs text-[#ff6a00] font-bold hover:underline cursor-pointer"
            >
              Reset
            </button>
          </div>

          {/* Category Filter */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Category</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full text-xs py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
            >
              <option value="all">All Categories</option>
              {availableCategories.map((c) => (
                <option key={c} value={c}>
                  {tCategory(c)}
                </option>
              ))}
            </select>
          </div>

          {/* Brand Filter */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Brand</label>
            <select
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              className="w-full text-xs py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
            >
              <option value="all">All Brands</option>
              {availableBrands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          {/* Price Filter */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Price Range ($)</label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                placeholder="Min"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                className="w-full text-xs py-1.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              />
              <input
                type="number"
                placeholder="Max"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                className="w-full text-xs py-1.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          {/* In Stock Only */}
          <label className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer pt-2 border-t border-slate-100 dark:border-slate-800">
            <span>In Stock Only</span>
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(e) => setInStockOnly(e.target.checked)}
              className="w-4 h-4 text-[#ff6a00]"
            />
          </label>
        </aside>

        {/* Results Grid */}
        <div className="lg:col-span-9">
          {filteredProducts.length === 0 ? (
            <div className="min-h-[40vh] flex flex-col items-center justify-center p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-orange-50 dark:bg-orange-950/40 text-[#ff6a00] flex items-center justify-center">
                <PackageX className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                No matching products found
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 max-w-sm">
                Try searching with different keywords, relaxing your price filters, or browsing by category.
              </p>
              <button
                type="button"
                onClick={handleResetFilters}
                className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#ff6a00] text-white text-xs font-bold cursor-pointer"
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
                    className="group relative rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-3 flex flex-col justify-between hover:border-[#ff6a00]/40 transition-all hover:shadow-md cursor-pointer"
                  >
                    <div className="relative aspect-square rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 mb-3">
                      <img
                        src={prod.image || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=400&q=80'}
                        alt={prod.name || 'Product'}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      {prod.discountPercentage > 0 && (
                        <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-[#ff6a00] text-white text-[10px] font-black">
                          -{prod.discountPercentage}%
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => handleToggleWishlist(e, prod.id)}
                        className={`absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center shadow-md backdrop-blur-xs transition-colors cursor-pointer ${
                          inWishlist
                            ? 'bg-rose-50 text-rose-500 dark:bg-rose-950/80'
                            : 'bg-white/90 dark:bg-slate-900/90 text-slate-600 dark:text-slate-300 hover:text-rose-500'
                        }`}
                      >
                        <Heart className={`w-4 h-4 ${inWishlist ? 'fill-current' : ''}`} />
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold text-[#ff6a00] uppercase tracking-wider">
                        {prod.brand}
                      </span>
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white line-clamp-2 leading-snug group-hover:text-[#ff6a00] transition-colors">
                        {prod.name}
                      </h4>
                      <div className="flex items-center gap-1 pt-1">
                        <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                        <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                          {prod.rating.toFixed(1)}
                        </span>
                        <span className="text-[11px] text-slate-400">({prod.reviewCount})</span>
                      </div>
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
                          className="w-8 h-8 rounded-xl bg-orange-50 dark:bg-orange-950/50 hover:bg-[#ff6a00] text-[#ff6a00] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
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
