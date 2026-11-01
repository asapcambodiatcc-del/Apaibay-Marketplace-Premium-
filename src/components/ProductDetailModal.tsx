import React, { useState, useEffect } from 'react';
import {
  X,
  Star,
  Heart,
  ShoppingBag,
  ShieldCheck,
  Truck,
  RotateCcw,
  Check,
  Share2,
  ChevronRight
} from 'lucide-react';
import { Product } from '../types';
import { useLanguage } from '../i18n/LanguageContext';

interface ProductDetailModalProps {
  product: Product | null;
  onClose: () => void;
  onAddToCart: (product: Product, quantity: number, color?: string, size?: string) => void;
  onBuyNow: (product: Product, quantity: number, color?: string, size?: string) => void;
  isWishlisted: boolean;
  onToggleWishlist: (productId: string) => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  onClose,
  onAddToCart,
  onBuyNow,
  isWishlisted,
  onToggleWishlist,
}) => {
  const { t, tCategory } = useLanguage();

  const [selectedColor, setSelectedColor] = useState<string>('');
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [activeImage, setActiveImage] = useState<string>(() => product?.image || '');
  const [justAdded, setJustAdded] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync state whenever selected product changes
  useEffect(() => {
    if (product) {
      setSelectedColor(product.colors?.[0]?.name || '');
      setSelectedSize(product.sizes?.[0] || '');
      setQuantity(1);
      setActiveImage(product.image || '');
      setJustAdded(false);
      setIsSubmitting(false);
    }
  }, [product]);

  if (!product) return null;

  const isOutOfStock = product.stock !== undefined && product.stock <= 0;
  const maxStock = product.stock !== undefined && product.stock > 0 ? product.stock : 999;

  const rawImages = [
    product.image,
    product.secondaryImage || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80'
  ];
  const images = rawImages.filter((img): img is string => typeof img === 'string' && img.trim().length > 0);
  const displayImage = activeImage || product.image || images[0] || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80';

  const handleAdd = () => {
    if (isOutOfStock || isSubmitting) return;
    setIsSubmitting(true);
    const validQty = Math.max(1, Math.min(quantity, maxStock));
    onAddToCart(product, validQty, selectedColor || undefined, selectedSize || undefined);
    setJustAdded(true);
    setTimeout(() => {
      setJustAdded(false);
      setIsSubmitting(false);
    }, 1500);
  };

  const handleBuy = () => {
    if (isOutOfStock || isSubmitting) return;
    setIsSubmitting(true);
    const validQty = Math.max(1, Math.min(quantity, maxStock));
    onBuyNow(product, validQty, selectedColor || undefined, selectedSize || undefined);
  };

  const handleShare = () => {
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl max-w-4xl w-full shadow-2xl overflow-hidden relative my-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 flex items-center justify-center transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="grid grid-cols-1 md:grid-cols-12 max-h-[85vh] overflow-y-auto">
          {/* Left: Gallery (md:col-span-6) */}
          <div className="md:col-span-6 p-4 sm:p-6 bg-slate-50 dark:bg-slate-950/60 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between">
            <div>
              {/* Main Image */}
              <div className="relative h-60 sm:h-80 w-full rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-xs border border-slate-200/80 dark:border-slate-800 mb-4">
                <img
                  src={displayImage}
                  alt={product.name}
                  className="w-full h-full object-cover transition-all"
                />
                {product.discountPercentage > 0 && (
                  <span className="absolute top-3 left-3 bg-red-600 text-white text-xs font-black px-2.5 py-1 rounded-full shadow-md">
                    -{product.discountPercentage}% OFF
                  </span>
                )}
                <button
                  onClick={() => onToggleWishlist(product.id)}
                  className={`absolute top-3 right-3 p-2.5 rounded-full backdrop-blur-md transition-all cursor-pointer ${
                    isWishlisted
                      ? 'bg-white text-red-600 shadow-md'
                      : 'bg-white/80 dark:bg-slate-800/80 text-slate-600 hover:text-red-500 hover:bg-white'
                  }`}
                >
                  <Heart className={`w-5 h-5 ${isWishlisted ? 'fill-red-600 text-red-600' : ''}`} />
                </button>
              </div>

              {/* Thumbnails */}
              <div className="flex gap-2 overflow-x-auto pb-1">
                {images.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveImage(img)}
                    className={`w-16 h-16 rounded-xl overflow-hidden border-2 transition-all cursor-pointer shrink-0 ${
                      activeImage === img
                        ? 'border-[#ff6a00] ring-2 ring-[#ff6a00]/30'
                        : 'border-slate-200 dark:border-slate-700 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <img src={img} alt="Thumb" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>

            {/* Seller Guarantee card */}
            <div className="mt-6 p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-orange-50 dark:bg-orange-950/40 text-[#ff6a00] flex items-center justify-center font-bold">
                  {product.seller.name[0]}
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      {product.seller.name}
                    </span>
                    {product.seller.verified && (
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                    )}
                  </div>
                  <span className="text-[11px] text-slate-400">
                    ★ {product.seller.rating} Positive merchant score
                  </span>
                </div>
              </div>
              <span className="text-[10px] font-bold text-[#ff6a00] bg-orange-50 dark:bg-orange-950/40 px-2 py-1 rounded-md border border-orange-100 dark:border-orange-900/30">
                {t('home.officialStores', 'Official Store')}
              </span>
            </div>
          </div>

          {/* Right: Product Details & Purchase Actions (md:col-span-6) */}
          <div className="md:col-span-6 p-4 sm:p-6 lg:p-8 flex flex-col justify-between">
            <div className="space-y-4">
              {/* Category & Brand */}
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-[#ff6a00] uppercase tracking-wider">
                  {product.brand} • {tCategory(product.category)}
                </span>
                <button
                  onClick={handleShare}
                  className="flex items-center gap-1 text-slate-500 hover:text-slate-800 dark:hover:text-white cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>{copiedLink ? t('product.linkCopied', 'Link Copied!') : t('product.share', 'Share')}</span>
                </button>
              </div>

              {/* Title */}
              <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white leading-tight">
                {product.name}
              </h2>

              {/* Ratings */}
              <div className="flex items-center gap-2 text-xs">
                <div className="flex items-center text-amber-400">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`w-4 h-4 ${
                        i < Math.floor(product.rating)
                          ? 'fill-amber-400 text-amber-400'
                          : 'text-slate-300 dark:text-slate-700'
                      }`}
                    />
                  ))}
                  <span className="font-bold ml-1.5 text-slate-800 dark:text-slate-200">
                    {product.rating}
                  </span>
                </div>
                <span className="text-slate-400">|</span>
                <span className="text-slate-500 font-medium">
                  {product.reviewCount} {t('product.reviews', 'reviews')}
                </span>
              </div>

              {/* Price Banner */}
              <div className="p-3 bg-orange-50/70 dark:bg-orange-950/30 border border-orange-100 dark:border-orange-900/40 rounded-xl flex items-baseline gap-3">
                <span className="text-2xl sm:text-3xl font-black text-[#ff6a00]">
                  ${product.price.toFixed(2)}
                </span>
                {product.originalPrice > product.price && (
                  <span className="text-sm text-slate-400 line-through">
                    ${product.originalPrice.toFixed(2)}
                  </span>
                )}
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 ml-auto">
                  {t('product.inStock', 'In Stock')} ({product.stockCount || 25} left)
                </span>
              </div>

              {/* Description */}
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {product.description}
              </p>

              {/* Colors selection if any */}
              {product.colors && product.colors.length > 0 && (
                <div>
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-2 block">
                    {t('product.selectColor', 'Select Color:')} <span className="font-normal text-slate-500">{selectedColor}</span>
                  </label>
                  <div className="flex items-center gap-2">
                    {product.colors.map((color) => (
                      <button
                        key={color.name}
                        onClick={() => setSelectedColor(color.name)}
                        className={`w-7 h-7 rounded-full transition-all cursor-pointer flex items-center justify-center border-2 ${
                          selectedColor === color.name
                            ? 'border-[#ff6a00] ring-2 ring-[#ff6a00]/30 scale-110'
                            : 'border-slate-300 dark:border-slate-700'
                        }`}
                        style={{ backgroundColor: color.hex }}
                        title={color.name}
                      >
                        {selectedColor === color.name && (
                          <span className="w-1.5 h-1.5 rounded-full bg-white shadow-xs"></span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Sizes selection if any */}
              {product.sizes && product.sizes.length > 0 && (
                <div>
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-2 block">
                    {t('product.selectSize', 'Select Size:')}
                  </label>
                  <div className="flex items-center gap-2">
                    {product.sizes.map((size) => (
                      <button
                        key={size}
                        onClick={() => setSelectedSize(size)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                          selectedSize === size
                            ? 'bg-[#ff6a00] text-white border-[#ff6a00]'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                        }`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Key Features bullet list */}
              {product.features && (
                <div className="space-y-1.5 pt-2">
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {t('product.features', 'Key Features:')}
                  </div>
                  <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                    {product.features.map((feat, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Quantity and Actions */}
            <div className="pt-6 mt-6 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{t('product.quantity', 'Quantity')}</span>
                <div className="flex items-center border border-slate-300 dark:border-slate-700 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={isOutOfStock}
                    className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 cursor-pointer font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    -
                  </button>
                  <span className="px-4 py-1 text-xs font-bold text-slate-900 dark:text-white">
                    {isOutOfStock ? 0 : quantity}
                  </span>
                  <button
                    onClick={() => setQuantity((q) => Math.min(maxStock, q + 1))}
                    disabled={isOutOfStock || quantity >= maxStock}
                    className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 cursor-pointer font-bold disabled:opacity-40 disabled:cursor-not-allowed"
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
                  onClick={handleAdd}
                  disabled={isOutOfStock || isSubmitting}
                  className={`py-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-xs ${
                    isOutOfStock
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700 cursor-not-allowed'
                      : justAdded
                      ? 'bg-emerald-600 text-white cursor-pointer'
                      : 'bg-orange-50 dark:bg-orange-950/40 text-[#ff6a00] hover:bg-[#ff6a00] hover:text-white border border-[#ff6a00]/30 cursor-pointer'
                  }`}
                >
                  {isOutOfStock ? (
                    <span>{t('product.outOfStock', 'Out of Stock')}</span>
                  ) : justAdded ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>{t('product.added', 'Added to Cart')}</span>
                    </>
                  ) : (
                    <>
                      <ShoppingBag className="w-4 h-4" />
                      <span>{t('product.addToCart', 'Add to Cart')}</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleBuy}
                  disabled={isOutOfStock || isSubmitting}
                  className={`py-3 rounded-xl font-bold text-xs sm:text-sm transition-all shadow-md flex items-center justify-center gap-1.5 ${
                    isOutOfStock
                      ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                      : 'bg-[#ff6a00] hover:bg-[#e65f00] text-white cursor-pointer'
                  }`}
                >
                  <span>{t('product.buyNow', 'Buy Now')}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Trust Badges */}
              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-3">
                <span className="flex items-center gap-1">
                  <Truck className="w-3.5 h-3.5 text-[#ff6a00]" />
                  {t('trust.freeShipping', 'Free delivery')}
                </span>
                <span className="flex items-center gap-1">
                  <RotateCcw className="w-3.5 h-3.5 text-[#ff6a00]" />
                  {t('trust.easyReturns', '30-day free returns')}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

