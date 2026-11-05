import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';
import { useProducts } from '../context/ProductContext';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { CategorySidebar } from '../components/CategorySidebar';
import { HeroCarousel } from '../components/HeroCarousel';
import { TrustStrip } from '../components/TrustStrip';
import { CategoryMerchandisingQuads } from '../components/CategoryMerchandisingQuads';
import { FeaturedCategoryGrid } from '../components/FeaturedCategoryGrid';
import { FlashSalesSection } from '../components/FlashSalesSection';
import { ProductSections } from '../components/ProductSections';
import { DealsOffersSection } from '../components/DealsOffersSection';
import { AIPicksPromotionalPanel } from '../components/AIPicksPromotionalPanel';
import { SellerSpotlight } from '../components/SellerSpotlight';
import { PromotionalBanners } from '../components/PromotionalBanners';
import { BrandShowcase } from '../components/BrandShowcase';
import { SocialProofSection } from '../components/SocialProofSection';
import { VideoGallerySection } from '../components/VideoGallerySection';
import { ProductGridSkeleton } from '../components/ProductCardSkeleton';
import { Product } from '../types';
import { X } from 'lucide-react';

interface HomePageProps {
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
  onOpenQuickview?: (product: Product) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onShowToast, onOpenQuickview }) => {
  const { t, tCategory } = useLanguage();
  const navigate = useNavigate();
  const { products, loading } = useProducts();
  const { addToCart } = useCart();
  const { wishlist, toggleWishlist } = useWishlist();

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);

  // Filter products by home active filters
  const filteredProducts = products.filter((product) => {
    if (selectedCategory && product.category !== selectedCategory) {
      return false;
    }
    if (
      selectedBrand &&
      product.brand.toLowerCase() !== selectedBrand.toLowerCase() &&
      (!product.seller || product.seller.name.toLowerCase() !== selectedBrand.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const handleProductSelect = (product: Product) => {
    if (onOpenQuickview) {
      onOpenQuickview(product);
    } else {
      navigate(`/product/${product.slug}`);
    }
  };

  const handleAddToCart = (product: Product, quantity: number = 1, color?: string, size?: string) => {
    addToCart(product, quantity, color, size);
    onShowToast(`Added "${product.name.slice(0, 24)}..." to cart`, 'success');
  };

  const handleToggleWishlist = (productId: string) => {
    toggleWishlist(productId);
    const inWishlist = wishlist.includes(productId);
    onShowToast(
      inWishlist ? 'Removed item from wishlist' : 'Saved item to your wishlist',
      inWishlist ? 'info' : 'success'
    );
  };

  return (
    <div className="space-y-8 sm:space-y-10">
      {/* Active Filter Banner if user filtered on home */}
      {(selectedCategory || selectedBrand) && (
        <div className="bg-orange-50 dark:bg-orange-950/40 border border-[#ff6a00]/30 rounded-xl p-3 sm:p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200">
            <span className="text-[#ff6a00] font-black">{t('common.filteredBy', 'Filtered by:')}</span>
            {selectedCategory && (
              <span className="bg-white dark:bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
                {t('nav.categories', 'Category')}: <strong className="text-[#ff6a00] capitalize">{tCategory(selectedCategory)}</strong>
              </span>
            )}
            {selectedBrand && (
              <span className="bg-white dark:bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
                {t('search.brand', 'Merchant / Brand')}: <strong className="text-[#ff6a00]">{selectedBrand}</strong>
              </span>
            )}
            <span className="text-slate-500 font-normal">
              ({filteredProducts.length} {t('common.items', 'results')})
            </span>
          </div>

          <button
            onClick={() => {
              setSelectedCategory(null);
              setSelectedBrand(null);
            }}
            className="text-xs font-bold text-[#ff6a00] hover:underline flex items-center gap-1 cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" />
            <span>{t('common.clearFilter', 'Clear All Filters')}</span>
          </button>
        </div>
      )}

      {/* Hero Section with Left Category Navigation & Center Carousel */}
      <section className="flex gap-5 items-stretch">
        <CategorySidebar
          selectedCategory={selectedCategory}
          onSelectCategory={(cat) => {
            if (cat) navigate(`/category/${cat}`);
            else setSelectedCategory(null);
          }}
          className="hidden lg:block self-stretch"
        />

        <div className="flex-1 min-w-0">
          <HeroCarousel
            products={products}
            onShopNow={(cat) => {
              if (cat) navigate(`/category/${cat}`);
            }}
            onExploreSale={() => {
              const elem = document.getElementById('flash-sales-anchor');
              elem?.scrollIntoView({ behavior: 'smooth' });
            }}
          />
        </div>
      </section>

      {/* Trust & Service Strip */}
      <TrustStrip />

      {/* Amazon-Inspired Multi-Category Merchandising Quads */}
      <CategoryMerchandisingQuads
        onSelectCategory={(cat) => {
          navigate(`/category/${cat}`);
        }}
      />

      {/* Featured Category Grid */}
      <FeaturedCategoryGrid
        selectedCategory={selectedCategory}
        onSelectCategory={(cat) => {
          if (cat) navigate(`/category/${cat}`);
        }}
      />

      {/* Flash Sales Section */}
      <div id="flash-sales-anchor">
        <FlashSalesSection
          products={filteredProducts}
          wishlist={wishlist}
          onToggleWishlist={handleToggleWishlist}
          onAddToCart={handleAddToCart}
          onSelectProduct={handleProductSelect}
        />
      </div>

      {/* Tabbed Product Shelves (AI Recommended, Trending, Daily Discover, Best Sellers, etc.) */}
      {loading && products.length === 0 ? (
        <ProductGridSkeleton count={5} />
      ) : (
        <ProductSections
          products={filteredProducts}
          wishlist={wishlist}
          onToggleWishlist={handleToggleWishlist}
          onAddToCart={handleAddToCart}
          onSelectProduct={handleProductSelect}
          selectedCategory={selectedCategory}
        />
      )}

      {/* Deals & Offers Section */}
      <DealsOffersSection
        onSelectDeal={(_dealId, categoryFilter) => {
          if (categoryFilter) {
            navigate(`/category/${categoryFilter}`);
          }
        }}
      />

      {/* AI Picks & Smart Curated Panel (Personalized if logged in or has wishlist) */}
      <AIPicksPromotionalPanel
        products={filteredProducts}
        wishlist={wishlist}
        onToggleWishlist={handleToggleWishlist}
        onAddToCart={handleAddToCart}
        onSelectProduct={handleProductSelect}
      />

      {/* Verified Seller Spotlight */}
      <SellerSpotlight
        products={products}
        onSelectProduct={handleProductSelect}
        onSelectSeller={(sellerName) => {
          setSelectedBrand(sellerName);
          const elem = document.getElementById('flash-sales-anchor');
          elem?.scrollIntoView({ behavior: 'smooth' });
        }}
        onExploreSellerCenter={() => navigate('/seller')}
      />

      {/* Promotional Banners */}
      <PromotionalBanners
        onSelectPromotion={(filter) => {
          if (filter === 'deals') navigate('/category/electronics');
          if (filter === 'verified') navigate('/category/fashion');
          if (filter === 'shipping') navigate('/category/home-kitchen');
        }}
      />

      {/* Brand Showcase */}
      <BrandShowcase
        selectedBrand={selectedBrand}
        onSelectBrand={(brand) => {
          if (brand === selectedBrand) {
            setSelectedBrand(null);
          } else {
            setSelectedBrand(brand);
            const elem = document.getElementById('flash-sales-anchor');
            elem?.scrollIntoView({ behavior: 'smooth' });
          }
        }}
      />

      {/* Social Proof */}
      <SocialProofSection />

      {/* Video Gallery */}
      <VideoGallerySection
        onSelectProduct={handleProductSelect}
        onAddToCart={handleAddToCart}
      />
    </div>
  );
};
