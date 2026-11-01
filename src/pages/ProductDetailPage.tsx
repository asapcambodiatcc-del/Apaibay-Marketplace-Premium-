import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';
import { useProducts } from '../context/ProductContext';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { RouteLoading } from '../components/RouteLoading';
import { NotFound } from '../components/NotFound';
import {
  Star,
  ShieldCheck,
  Truck,
  RotateCcw,
  Heart,
  ShoppingBag,
  Zap,
  Check,
  Share2,
  ChevronRight,
  Package,
  Barcode,
  Layers,
  Award,
  Store,
  MessageSquare,
} from 'lucide-react';
import { Product } from '../types';

interface ProductDetailPageProps {
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

export const ProductDetailPage: React.FC<ProductDetailPageProps> = ({ onShowToast }) => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { t, tCategory } = useLanguage();
  const { getProductBySlug, products, loading } = useProducts();
  const { addToCart } = useCart();
  const { isInWishlist, toggleWishlist } = useWishlist();

  const [product, setProduct] = useState<Product | null>(null);
  const [activeImage, setActiveImage] = useState<string>('');
  const [selectedColor, setSelectedColor] = useState<string>('');
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  useEffect(() => {
    if (slug) {
      const found = getProductBySlug(slug);
      if (found) {
        setProduct(found);
        setActiveImage(found.image);
        if (found.colors && found.colors.length > 0) {
          setSelectedColor(found.colors[0].name);
        } else {
          setSelectedColor('');
        }
        if (found.sizes && found.sizes.length > 0) {
          setSelectedSize(found.sizes[0]);
        } else {
          setSelectedSize('');
        }
        setQuantity(1);
        setIsSubmitting(false);
        setJustAdded(false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        setProduct(null);
      }
    }
  }, [slug, getProductBySlug]);

  if (loading) {
    return <RouteLoading message={t('common.loadingProduct', 'Loading product details...')} />;
  }

  if (!product) {
    return <NotFound />;
  }

  const isOutOfStock = product.stock !== undefined && product.stock <= 0;
  const maxStock = product.stock !== undefined && product.stock > 0 ? product.stock : 999;
  const inWishlist = isInWishlist(product.id);

  // Gallery items: main image + secondaryImage + any gallery items
  const rawGallery = [
    product.image,
    ...(product.secondaryImage ? [product.secondaryImage] : []),
    ...(product.gallery || []),
  ];
  const galleryImages = rawGallery.filter(
    (img, idx, arr): img is string => typeof img === 'string' && img.trim().length > 0 && arr.indexOf(img) === idx
  );
  const displayImage = activeImage || product.image || galleryImages[0] || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80';

  const handleAddToCart = () => {
    if (!product || isOutOfStock || isSubmitting) return;
    setIsSubmitting(true);
    const validQty = Math.max(1, Math.min(quantity, maxStock));
    addToCart(product, validQty, selectedColor || undefined, selectedSize || undefined);
    setJustAdded(true);
    onShowToast(`Added (${validQty}x) "${product.name.slice(0, 22)}..." to cart`, 'success');
    setTimeout(() => {
      setJustAdded(false);
      setIsSubmitting(false);
    }, 1500);
  };

  const handleBuyNow = () => {
    if (!product || isOutOfStock || isSubmitting) return;
    setIsSubmitting(true);
    const validQty = Math.max(1, Math.min(quantity, maxStock));
    addToCart(product, validQty, selectedColor || undefined, selectedSize || undefined);
    navigate('/checkout');
  };

  const handleToggleWishlist = () => {
    toggleWishlist(product.id);
    onShowToast(
      inWishlist ? 'Removed from your wishlist' : 'Saved to your wishlist',
      inWishlist ? 'info' : 'success'
    );
  };

  const handleShare = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(window.location.href);
        setCopiedLink(true);
        onShowToast('Product link copied to clipboard!', 'success');
        setTimeout(() => setCopiedLink(false), 2000);
      }
    } catch {
      onShowToast('Link copied to clipboard', 'info');
    }
  };

  // Related products from same category
  const relatedProducts = products
    .filter((p) => p.category === product.category && p.id !== product.id)
    .slice(0, 4);

  return (
    <article className="space-y-10 pb-12">
      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400 overflow-x-auto py-1">
        <Link to="/" className="hover:text-[#ff6a00] transition-colors whitespace-nowrap">
          {t('nav.home', 'Home')}
        </Link>
        <ChevronRight className="w-3.5 h-3.5 shrink-0" />
        <Link
          to={`/category/${product.category}`}
          className="hover:text-[#ff6a00] transition-colors capitalize whitespace-nowrap"
        >
          {tCategory(product.category)}
        </Link>
        <ChevronRight className="w-3.5 h-3.5 shrink-0" />
        <span className="text-slate-900 dark:text-white font-medium truncate max-w-xs sm:max-w-md">
          {product.name}
        </span>
      </nav>

      {/* Main Showcase Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10">
        {/* Left: Product Images & Gallery */}
        <div className="lg:col-span-7 space-y-4">
          <div className="relative aspect-square sm:aspect-4/3 rounded-3xl overflow-hidden bg-slate-100 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
            <img
              src={displayImage}
              alt={product.name}
              className="w-full h-full object-cover object-center transition-all duration-300"
            />

            {product.discountPercentage > 0 && (
              <span className="absolute top-4 left-4 px-3 py-1 rounded-full bg-[#ff6a00] text-white text-xs font-black shadow-md">
                -{product.discountPercentage}% OFF
              </span>
            )}

            <div className="absolute top-4 right-4 flex items-center gap-2">
              <button
                type="button"
                onClick={handleShare}
                aria-label="Share product"
                className="w-10 h-10 rounded-full bg-white/90 dark:bg-slate-900/90 text-slate-700 dark:text-slate-200 flex items-center justify-center hover:bg-white dark:hover:bg-slate-800 shadow-md backdrop-blur-xs transition-all cursor-pointer"
              >
                <Share2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleToggleWishlist}
                aria-label={inWishlist ? 'Remove from wishlist' : 'Add to wishlist'}
                className={`w-10 h-10 rounded-full flex items-center justify-center shadow-md backdrop-blur-xs transition-all cursor-pointer ${
                  inWishlist
                    ? 'bg-rose-50 dark:bg-rose-950/80 text-rose-500'
                    : 'bg-white/90 dark:bg-slate-900/90 text-slate-600 dark:text-slate-300 hover:text-rose-500'
                }`}
              >
                <Heart className={`w-5 h-5 ${inWishlist ? 'fill-current' : ''}`} />
              </button>
            </div>
          </div>

          {/* Thumbnail Gallery Carousel */}
          {galleryImages.length > 1 && (
            <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-none">
              {galleryImages.map((img, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setActiveImage(img)}
                  className={`relative w-20 h-20 rounded-2xl overflow-hidden shrink-0 border-2 transition-all cursor-pointer ${
                    activeImage === img
                      ? 'border-[#ff6a00] scale-105 shadow-md'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-400'
                  }`}
                >
                  <img src={img} alt={`${product.name} thumb ${idx + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Commercial Information & Interaction */}
        <div className="lg:col-span-5 space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-[#ff6a00] bg-orange-50 dark:bg-orange-950/40 px-2.5 py-0.5 rounded-md">
                {product.brand}
              </span>
              {product.seller.verified && (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>{t('common.verifiedMerchant', 'Verified Seller')}</span>
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white leading-tight">
              {product.name}
            </h1>

            {/* Ratings & Reviews */}
            <div className="flex items-center gap-3 mt-3">
              <div className="flex items-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={`w-4 h-4 ${
                      i < Math.floor(product.rating)
                        ? 'text-amber-400 fill-amber-400'
                        : 'text-slate-300 dark:text-slate-700'
                    }`}
                  />
                ))}
                <span className="text-sm font-bold text-slate-900 dark:text-white ml-1">
                  {product.rating.toFixed(1)}
                </span>
              </div>
              <span className="text-xs text-slate-400">•</span>
              <span className="text-xs text-slate-600 dark:text-slate-400">
                {product.reviewCount} {t('product.reviews', 'reviews')}
              </span>
              <span className="text-xs text-slate-400">•</span>
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                {product.inStock ? `${product.stockCount || 25} in stock` : 'Out of Stock'}
              </span>
            </div>
          </div>

          {/* Pricing Box */}
          <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 space-y-2">
            <div className="flex items-baseline gap-3">
              <span className="text-3xl sm:text-4xl font-extrabold text-[#ff6a00]">
                ${product.price.toFixed(2)}
              </span>
              {product.originalPrice > product.price && (
                <span className="text-lg sm:text-xl text-slate-400 line-through font-medium">
                  ${product.originalPrice.toFixed(2)}
                </span>
              )}
              {product.discountPercentage > 0 && (
                <span className="text-xs font-black text-rose-500 bg-rose-50 dark:bg-rose-950/50 px-2 py-0.5 rounded-md">
                  Save ${(product.originalPrice - product.price).toFixed(2)}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Tax included. Free standard shipping on all orders over $50.
            </p>
          </div>

          {/* Color Selector */}
          {product.colors && product.colors.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {t('product.color', 'Color')}: <span className="text-[#ff6a00]">{selectedColor}</span>
              </label>
              <div className="flex items-center gap-2.5">
                {product.colors.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => setSelectedColor(c.name)}
                    title={c.name}
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                      selectedColor === c.name
                        ? 'ring-2 ring-offset-2 ring-[#ff6a00] scale-110'
                        : 'opacity-80 hover:opacity-100 hover:scale-105'
                    }`}
                    style={{ backgroundColor: c.hex }}
                  >
                    {selectedColor === c.name && (
                      <Check className={`w-4 h-4 ${c.hex.toLowerCase() === '#ffffff' ? 'text-black' : 'text-white'}`} />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Size Selector */}
          {product.sizes && product.sizes.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {t('product.size', 'Size')}: <span className="text-[#ff6a00]">{selectedSize}</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {product.sizes.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSelectedSize(s)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      selectedSize === s
                        ? 'bg-[#ff6a00] text-white border-[#ff6a00] shadow-sm'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-slate-400'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quantity Stepper & Actions */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-4">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {t('cart.quantity', 'Quantity')}:
              </span>
              <div className="flex items-center border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={isOutOfStock || isSubmitting}
                  className="px-3 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 font-bold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  -
                </button>
                <span className="px-4 py-1.5 text-sm font-extrabold text-slate-900 dark:text-white">
                  {isOutOfStock ? 0 : quantity}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.min(maxStock, q + 1))}
                  disabled={isOutOfStock || quantity >= maxStock || isSubmitting}
                  className="px-3 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 font-bold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  +
                </button>
              </div>
            </div>

            {isOutOfStock && (
              <div className="text-xs font-bold text-rose-500 pt-1">
                {t('product.outOfStock', 'This product is currently out of stock')}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={handleAddToCart}
                disabled={isOutOfStock || isSubmitting}
                className={`flex items-center justify-center gap-2 py-3.5 px-4 rounded-2xl font-bold text-sm shadow-md transition-all ${
                  isOutOfStock
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700 cursor-not-allowed'
                    : justAdded
                    ? 'bg-emerald-600 text-white cursor-pointer shadow-emerald-600/20'
                    : 'bg-[#ff6a00] hover:bg-[#e05d00] text-white shadow-[#ff6a00]/20 cursor-pointer'
                }`}
              >
                {justAdded ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>{t('product.added', 'Added to Cart')}</span>
                  </>
                ) : (
                  <>
                    <ShoppingBag className="w-4 h-4" />
                    <span>{isOutOfStock ? t('product.outOfStock', 'Out of Stock') : t('product.addToCart', 'Add to Cart')}</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleBuyNow}
                disabled={isOutOfStock || isSubmitting}
                className={`flex items-center justify-center gap-2 py-3.5 px-4 rounded-2xl font-bold text-sm shadow-md transition-all ${
                  isOutOfStock
                    ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                    : 'bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-950 cursor-pointer'
                }`}
              >
                <Zap className="w-4 h-4 fill-current" />
                <span>{t('product.buyNow', 'Buy Now')}</span>
              </button>
            </div>
          </div>

          {/* Guarantees Strip */}
          <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-100 dark:border-slate-800/80 text-xs text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-[#ff6a00]" />
              <span>Fast 2-4 day global fulfillment</span>
            </div>
            <div className="flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-[#ff6a00]" />
              <span>30-day effortless returns</span>
            </div>
          </div>
        </div>
      </div>

      {/* Description & Technical Specifications */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-8 border-t border-slate-200 dark:border-slate-800">
        {/* Left: Description & Features */}
        <div className="lg:col-span-8 space-y-6">
          <div className="space-y-3">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-[#ff6a00]" />
              <span>{t('product.overview', 'Product Overview')}</span>
            </h2>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
              {product.description}
            </p>
          </div>

          {/* Feature Bullets */}
          {product.features && product.features.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {t('product.keyFeatures', 'Key Features & Capabilities')}
              </h3>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {product.features.map((feat, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-100 dark:border-slate-800"
                  >
                    <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Specifications Table */}
          <div className="space-y-3 pt-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Package className="w-4 h-4 text-[#ff6a00]" />
              <span>{t('product.specs', 'Product Specifications')}</span>
            </h3>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden text-xs sm:text-sm">
              <div className="grid grid-cols-2 p-3 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800">
                <span className="font-semibold text-slate-500">Brand</span>
                <span className="font-bold text-slate-900 dark:text-white">{product.brand}</span>
              </div>
              <div className="grid grid-cols-2 p-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                <span className="font-semibold text-slate-500">Category</span>
                <span className="font-bold text-slate-900 dark:text-white capitalize">{tCategory(product.category)}</span>
              </div>
              <div className="grid grid-cols-2 p-3 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800">
                <span className="font-semibold text-slate-500">SKU Code</span>
                <span className="font-mono text-slate-900 dark:text-white">{product.sku || `APAI-${product.id.toUpperCase()}`}</span>
              </div>
              <div className="grid grid-cols-2 p-3 bg-white dark:bg-slate-900">
                <span className="font-semibold text-slate-500">UPC / Barcode</span>
                <span className="font-mono text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Barcode className="w-3.5 h-3.5 text-[#ff6a00]" />
                  <span>{product.barcode || '793573194022'}</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Seller Information Card */}
        <div className="lg:col-span-4 space-y-5">
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-orange-100 dark:bg-orange-950 text-[#ff6a00] flex items-center justify-center font-black text-lg">
                <Store className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white">
                  {product.seller.name}
                </h4>
                <div className="flex items-center gap-1 text-xs text-amber-500 font-bold">
                  <Star className="w-3.5 h-3.5 fill-amber-500" />
                  <span>{product.seller.rating} Positive Seller Rating</span>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-xs space-y-1.5">
              <div className="flex justify-between text-slate-500">
                <span>Merchant Status</span>
                <span className="font-bold text-[#ff6a00]">{product.seller.badge || 'Premier Merchant'}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Order Fulfillment</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">99.4% on-time</span>
              </div>
            </div>

            <div className="pt-1 flex gap-2">
              <button
                type="button"
                onClick={() => onShowToast(`Storefront "${product.seller.name}" opens soon in Phase 3`, 'info')}
                className="flex-1 py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Visit Store
              </button>
              <button
                type="button"
                onClick={() => onShowToast(`Chat with ${product.seller.name} available upon seller login`, 'info')}
                className="py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                title="Message Seller"
              >
                <MessageSquare className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Related Products Carousel / Grid */}
      {relatedProducts.length > 0 && (
        <section className="pt-8 border-t border-slate-200 dark:border-slate-800 space-y-5">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            {t('product.relatedProducts', 'Customers Also Viewed')}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {relatedProducts.map((rel) => (
              <div
                key={rel.id}
                onClick={() => navigate(`/product/${rel.slug}`)}
                className="group p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-[#ff6a00]/50 transition-all cursor-pointer shadow-xs hover:shadow-md"
              >
                <div className="aspect-square rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 mb-2.5">
                  <img
                    src={rel.image}
                    alt={rel.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                  {rel.name}
                </h4>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-sm font-extrabold text-[#ff6a00]">${rel.price.toFixed(2)}</span>
                  {rel.originalPrice > rel.price && (
                    <span className="text-[11px] text-slate-400 line-through">${rel.originalPrice.toFixed(2)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </article>
  );
};
