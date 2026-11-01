import React from 'react';
import { X, Heart, ShoppingBag, Trash2, ArrowRight } from 'lucide-react';
import { Product } from '../types';
import { useLanguage } from '../i18n/LanguageContext';

interface WishlistDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  wishlistIds: string[];
  products: Product[];
  onRemoveFromWishlist: (productId: string) => void;
  onAddToCart: (product: Product) => void;
  onSelectProduct: (product: Product) => void;
}

export const WishlistDrawer: React.FC<WishlistDrawerProps> = ({
  isOpen,
  onClose,
  wishlistIds,
  products,
  onRemoveFromWishlist,
  onAddToCart,
  onSelectProduct,
}) => {
  const { t } = useLanguage();
  if (!isOpen) return null;

  const wishlistedProducts = products.filter((p) => wishlistIds.includes(p.id));

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xs">
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col justify-between">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Heart className="w-5 h-5 fill-red-500 text-red-500" />
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                {t('wishlist.title', 'Saved Wishlist')} ({wishlistedProducts.length})
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 divide-y divide-slate-100 dark:divide-slate-800">
            {wishlistedProducts.length === 0 ? (
              <div className="text-center py-16 space-y-3">
                <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
                  <Heart className="w-8 h-8" />
                </div>
                <h3 className="font-bold text-base text-slate-800 dark:text-white">
                  {t('wishlist.emptyTitle', 'Your wishlist is empty')}
                </h3>
                <p className="text-xs text-slate-400 max-w-xs mx-auto">
                  {t('wishlist.emptyDesc', 'Click the heart icon on any product card or detail page to save it for later.')}
                </p>
                <button
                  onClick={onClose}
                  className="px-5 py-2.5 bg-[#ff6a00] text-white text-xs font-bold rounded-xl hover:bg-[#e65f00] cursor-pointer"
                >
                  {t('wishlist.explore', 'Explore Products')}
                </button>
              </div>
            ) : (
              wishlistedProducts.map((product) => (
                <div key={product.id} className="pt-3 first:pt-0 flex gap-3 group">
                  <img
                    src={product.image || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=150&q=80'}
                    alt={product.name || 'Product'}
                    onClick={() => {
                      onSelectProduct(product);
                      onClose();
                    }}
                    className="w-20 h-20 rounded-xl object-cover border border-slate-200 dark:border-slate-800 shrink-0 bg-slate-100 cursor-pointer"
                  />
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-1">
                        <h4
                          onClick={() => {
                            onSelectProduct(product);
                            onClose();
                          }}
                          className="text-xs font-bold text-slate-900 dark:text-white line-clamp-1 leading-snug cursor-pointer group-hover:text-[#ff6a00]"
                        >
                          {product.name}
                        </h4>
                        <button
                          onClick={() => onRemoveFromWishlist(product.id)}
                          className="text-slate-400 hover:text-red-500 transition-colors p-1 cursor-pointer"
                          title={t('common.delete', 'Remove')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <span className="text-[10px] text-slate-400 font-medium">
                        {product.brand} • {t('common.inStock', 'In Stock')}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <span className="text-sm font-black text-[#ff6a00]">
                        ${product.price.toFixed(2)}
                      </span>
                      <button
                        onClick={() => {
                          onAddToCart(product);
                          onRemoveFromWishlist(product.id);
                        }}
                        className="px-3 py-1.5 bg-[#ff6a00] hover:bg-[#e65f00] text-white text-[11px] font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <ShoppingBag className="w-3 h-3" />
                        <span>{t('wishlist.moveToCart', 'Move to Cart')}</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {wishlistedProducts.length > 0 && (
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
              <button
                onClick={() => {
                  wishlistedProducts.forEach((p) => onAddToCart(p));
                  onClose();
                }}
                className="w-full py-2.5 bg-slate-900 dark:bg-slate-800 hover:bg-[#ff6a00] text-white font-bold text-xs rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>{t('wishlist.addAllToCart', 'Add All Items to Cart')}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

