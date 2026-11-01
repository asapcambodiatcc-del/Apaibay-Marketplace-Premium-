import React, { useState } from 'react';
import {
  X,
  Store,
  TrendingUp,
  Package,
  DollarSign,
  Plus,
  Check,
  BarChart3,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { Product } from '../types';
import { useLanguage } from '../i18n/LanguageContext';

interface SellerCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  onAddProduct: (newProduct: Product) => void;
}

export const SellerCenterModal: React.FC<SellerCenterModalProps> = ({
  isOpen,
  onClose,
  products,
  onAddProduct,
}) => {
  const { t, tCategory } = useLanguage();
  if (!isOpen) return null;

  const [activeView, setActiveView] = useState<'overview' | 'add'>('overview');
  const [newTitle, setNewTitle] = useState('');
  const [newPrice, setNewPrice] = useState('49.99');
  const [newCategory, setNewCategory] = useState('electronics');
  const [newBrand, setNewBrand] = useState('Anker');
  const [newImage, setNewImage] = useState('https://images.unsplash.com/photo-1546435770-a3e426bf472b?auto=format&fit=crop&w=800&q=80');
  const [newDesc, setNewDesc] = useState('Certified premium marketplace item with manufacturer guarantee.');
  const [isAddedSuccess, setIsAddedSuccess] = useState(false);

  const handleCreateListing = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const priceNum = parseFloat(newPrice) || 29.99;
    const created: Product = {
      id: `prod-custom-${Date.now()}`,
      name: newTitle.trim(),
      slug: newTitle.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      category: newCategory,
      brand: newBrand,
      image: newImage,
      price: priceNum,
      originalPrice: priceNum * 1.4,
      discountPercentage: 28,
      rating: 5.0,
      reviewCount: 1,
      seller: {
        name: 'Apex Official Store',
        verified: true,
        rating: 5.0,
        badge: 'Verified Merchant'
      },
      inStock: true,
      stockCount: 50,
      isNewArrival: true,
      isTrending: true,
      description: newDesc,
      features: ['Factory sealed packaging', 'Full 2-year warranty', 'Fast dispatch'],
      tags: ['seller-listing', newCategory, newBrand.toLowerCase()]
    };

    onAddProduct(created);
    setIsAddedSuccess(true);
    setNewTitle('');
    setTimeout(() => {
      setIsAddedSuccess(false);
      setActiveView('overview');
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl max-w-4xl w-full shadow-2xl overflow-hidden relative my-auto">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#ff6a00] flex items-center justify-center">
              <Store className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold">{t('seller.title', 'apaibay Seller Center')}</h2>
                <span className="text-[10px] font-black uppercase bg-emerald-500 text-slate-950 px-2 py-0.5 rounded-full">
                  {t('seller.verifiedMerchant', 'Verified Merchant')}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Merchant ID: APAI-SLR-88412 • Apex Official Store</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Subnavigation */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 text-xs font-bold">
          <button
            onClick={() => setActiveView('overview')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              activeView === 'overview'
                ? 'bg-[#ff6a00] text-white'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            {t('seller.dashboard', 'Store Performance & Inventory')}
          </button>
          <button
            onClick={() => setActiveView('add')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeView === 'add'
                ? 'bg-[#ff6a00] text-white'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('seller.addProduct', 'List New Product')}</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[75vh] overflow-y-auto">
          {activeView === 'overview' ? (
            <div className="space-y-6">
              {/* Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="text-[11px] font-bold text-slate-400 uppercase mb-1">
                    {t('seller.monthlyGMV', 'Monthly GMV')}
                  </div>
                  <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                    $48,920.50
                  </div>
                  <div className="text-[11px] text-emerald-500 font-bold mt-1">
                    +18.4% vs last month
                  </div>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="text-[11px] font-bold text-slate-400 uppercase mb-1">
                    {t('seller.fulfillmentRate', 'Fulfillment Rate')}
                  </div>
                  <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                    99.6%
                  </div>
                  <div className="text-[11px] text-emerald-500 font-bold mt-1">
                    Tier 1 Gold Standard
                  </div>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="text-[11px] font-bold text-slate-400 uppercase mb-1">
                    {t('seller.activeCatalog', 'Active Catalog Items')}
                  </div>
                  <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                    {products.length} Items
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Ready for instant checkout
                  </div>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="text-[11px] font-bold text-slate-400 uppercase mb-1">
                    {t('seller.storeRating', 'Store Rating')}
                  </div>
                  <div className="text-xl sm:text-2xl font-black text-[#ff6a00]">
                    ★ 4.92 / 5.0
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    From 1,420 customer reviews
                  </div>
                </div>
              </div>

              {/* Listed Products Table */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {t('seller.activeListings', 'Active Marketplace Listings')}
                  </h3>
                  <button
                    onClick={() => setActiveView('add')}
                    className="text-xs text-[#ff6a00] font-bold hover:underline"
                  >
                    + {t('seller.addProduct', 'Add Listing')}
                  </button>
                </div>

                <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
                  {products.slice(0, 6).map((p) => (
                    <div
                      key={p.id}
                      className="p-3.5 flex items-center justify-between text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={p.image || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=150&q=80'}
                          alt={p.name || 'Product'}
                          className="w-10 h-10 rounded-lg object-cover bg-slate-100"
                        />
                        <div className="max-w-xs sm:max-w-sm truncate">
                          <div className="font-bold text-slate-900 dark:text-white truncate">
                            {p.name}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {t('common.category', 'Category')}: {tCategory(p.category)} • {t('common.brand', 'Brand')}: {p.brand}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="font-bold text-[#ff6a00]">
                          ${p.price.toFixed(2)}
                        </div>
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                          Active & Listed
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Add Product Form */
            <form onSubmit={handleCreateListing} className="space-y-4 max-w-xl mx-auto">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {t('seller.addProduct', 'Create New Marketplace Listing')}
              </h3>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  {t('seller.productTitle', 'Product Title')}
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ultra Fast 65W GaN Dual Charger"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:border-[#ff6a00]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    {t('seller.price', 'Price (USD $)')}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:border-[#ff6a00]"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    {t('seller.category', 'Category')}
                  </label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:border-[#ff6a00]"
                  >
                    <option value="electronics">{tCategory('electronics')}</option>
                    <option value="fashion">{tCategory('fashion')}</option>
                    <option value="beauty">{tCategory('beauty')}</option>
                    <option value="home-kitchen">{tCategory('home-kitchen')}</option>
                    <option value="sports">{tCategory('sports')}</option>
                    <option value="gaming">{tCategory('gaming')}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  {t('seller.brand', 'Brand Name')}
                </label>
                <input
                  type="text"
                  required
                  value={newBrand}
                  onChange={(e) => setNewBrand(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:border-[#ff6a00]"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  {t('seller.image', 'Product Image URL')}
                </label>
                <input
                  type="url"
                  required
                  value={newImage}
                  onChange={(e) => setNewImage(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:border-[#ff6a00]"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  {t('seller.description', 'Description')}
                </label>
                <textarea
                  rows={3}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:border-[#ff6a00]"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-[#ff6a00] hover:bg-[#e65f00] text-white font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                {isAddedSuccess ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>{t('seller.published', 'Product Published to Live Catalog!')}</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    <span>{t('seller.publish', 'Publish Listing to apaibay')}</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

