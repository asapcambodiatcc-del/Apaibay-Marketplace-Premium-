import React, { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useProducts } from '../context/ProductContext';
import { SellerClient } from '../services/sellerClient';
import { Seller, SellerLedgerEntry, SellerFinancialSummary, Product } from '../types';
import {
  DollarSign,
  Package,
  TrendingUp,
  Star,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  Store,
  Boxes,
  X,
  AlertTriangle,
  FileText,
  ShieldCheck,
  RefreshCw,
  Globe,
  Building,
} from 'lucide-react';

interface SellerPageProps {
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

export const SellerPage: React.FC<SellerPageProps> = ({ onShowToast }) => {
  const { t } = useLanguage();
  const { user, isAuthenticated, openAuthModal } = useAuth();
  const { products, refreshProducts } = useProducts();

  const [sellerProfile, setSellerProfile] = useState<Seller | null>(null);
  const [loadingProfile, setLoadingProfile] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'listings' | 'ledger' | 'application'>('listings');

  // Ledger state
  const [ledgerEntries, setLedgerEntries] = useState<SellerLedgerEntry[]>([]);
  const [financialSummary, setFinancialSummary] = useState<SellerFinancialSummary | null>(null);
  const [loadingLedger, setLoadingLedger] = useState<boolean>(false);

  // Application form state
  const [applyStoreName, setApplyStoreName] = useState('');
  const [applyDescription, setApplyDescription] = useState('');
  const [applyCountry, setApplyCountry] = useState('KH');
  const [applyBusinessType, setApplyBusinessType] = useState<'individual' | 'registered_business' | 'enterprise'>('individual');
  const [applyPhone, setApplyPhone] = useState('');
  const [applyAddress, setApplyAddress] = useState('');
  const [submittingApply, setSubmittingApply] = useState(false);

  // New product form states
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newOriginalPrice, setNewOriginalPrice] = useState('');
  const [newCategory, setNewCategory] = useState('electronics');
  const [newBrand, setNewBrand] = useState('');
  const [newImage, setNewImage] = useState('https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800');
  const [newDescription, setNewDescription] = useState('');
  const [newStock, setNewStock] = useState('25');
  const [publishing, setPublishing] = useState(false);

  const loadSellerData = useCallback(async () => {
    if (!isAuthenticated || !user) {
      setLoadingProfile(false);
      return;
    }

    try {
      setLoadingProfile(true);
      const profile = await SellerClient.getMySeller();
      setSellerProfile(profile);

      if (profile && profile.verificationStatus === 'verified') {
        setLoadingLedger(true);
        try {
          const ledgerData = await SellerClient.getLedger();
          setLedgerEntries(ledgerData.entries);
          setFinancialSummary(ledgerData.summary);
        } catch (ledgerErr) {
          console.warn('Could not fetch seller ledger:', ledgerErr);
        } finally {
          setLoadingLedger(false);
        }
      }
    } catch (err: any) {
      console.warn('Could not fetch seller profile:', err?.message);
    } finally {
      setLoadingProfile(false);
    }
  }, [isAuthenticated, user]);

  useEffect(() => {
    loadSellerData();
  }, [loadSellerData]);

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!applyStoreName.trim()) {
      onShowToast('Please specify a store name.', 'error');
      return;
    }

    try {
      setSubmittingApply(true);
      const created = await SellerClient.apply({
        storeName: applyStoreName.trim(),
        description: applyDescription.trim(),
        businessCountry: applyCountry,
        businessType: applyBusinessType,
        contactInfo: {
          phone: applyPhone.trim(),
          address: applyAddress.trim(),
        },
      });

      setSellerProfile(created);
      onShowToast('Seller application submitted successfully! Status is pending administrator review.', 'success');
      setActiveTab('listings');
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to submit seller application. Please check your information and try again.', 'error');
    } finally {
      setSubmittingApply(false);
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newPrice) {
      onShowToast('Please provide a title and price', 'error');
      return;
    }

    if (!sellerProfile || sellerProfile.verificationStatus !== 'verified') {
      onShowToast('Only verified sellers can publish new product listings.', 'error');
      return;
    }

    const priceNum = parseFloat(newPrice);
    const originalPriceNum = newOriginalPrice ? parseFloat(newOriginalPrice) : priceNum * 1.2;
    const stockNum = parseInt(newStock, 10) || 25;

    try {
      setPublishing(true);
      await SellerClient.publishProduct({
        name: newTitle.trim(),
        price: priceNum,
        originalPrice: originalPriceNum,
        category: newCategory,
        brand: newBrand.trim() || sellerProfile.storeName,
        image: newImage.trim(),
        description: newDescription.trim() || `${sellerProfile.storeName} official merchandise.`,
        stock: stockNum,
      });

      await refreshProducts();
      setShowAddModal(false);
      setNewTitle('');
      setNewPrice('');
      setNewOriginalPrice('');
      setNewDescription('');
      setNewBrand('');
      onShowToast(`Product "${newTitle.trim()}" published to marketplace!`, 'success');
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to publish product.', 'error');
    } finally {
      setPublishing(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="py-16 text-center max-w-md mx-auto space-y-4">
        <div className="w-16 h-16 rounded-3xl bg-[#ff6a00]/20 text-[#ff6a00] flex items-center justify-center mx-auto">
          <Store className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">Seller Center</h2>
        <p className="text-xs text-slate-500">
          Sign in to your Apaibay account to access your merchant dashboard, store compliance, and product inventory.
        </p>
        <button
          type="button"
          onClick={() => openAuthModal('login')}
          className="px-6 py-2.5 rounded-xl bg-[#ff6a00] hover:bg-[#e05d00] text-white font-bold text-xs cursor-pointer shadow-md transition-all"
        >
          Sign In to Seller Center
        </button>
      </div>
    );
  }

  const isVerified = sellerProfile?.verificationStatus === 'verified';
  const isPending = sellerProfile?.verificationStatus === 'pending';
  const isRejected = sellerProfile?.verificationStatus === 'rejected';

  // Filter products strictly owned by current authenticated user
  const sellerProducts = products.filter(
    (p) => p.sellerId === user?.uid || (p.seller && p.seller.id === user?.uid)
  );

  return (
    <div className="space-y-8 pb-16">
      {/* Merchant Header */}
      <div className="p-6 sm:p-8 rounded-3xl bg-slate-900 text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-[#ff6a00]/20 text-[#ff6a00] border border-[#ff6a00]/30 flex items-center justify-center font-black">
            <Store className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-extrabold">
                {sellerProfile ? sellerProfile.storeName : 'Seller Center'}
              </h1>
              {isVerified && (
                <span className="text-xs bg-emerald-500 text-white px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Verified Merchant</span>
                </span>
              )}
              {isPending && (
                <span className="text-xs bg-amber-500 text-white px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>Pending Review</span>
                </span>
              )}
              {isRejected && (
                <span className="text-xs bg-rose-500 text-white px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                  <XCircle className="w-3 h-3" />
                  <span>Application Rejected</span>
                </span>
              )}
              {!sellerProfile && (
                <span className="text-xs bg-slate-700 text-slate-300 px-2.5 py-0.5 rounded-full font-bold">
                  Not Registered
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-slate-400">
              Manage inventory, review order commissions, and track verified merchant operations
            </p>
          </div>
        </div>

        {isVerified && (
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="px-5 py-3 rounded-2xl bg-[#ff6a00] hover:bg-[#e05d00] text-white font-bold text-xs sm:text-sm shadow-md flex items-center gap-2 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Listing</span>
          </button>
        )}
      </div>

      {/* Compliance Status Alerts */}
      {isPending && (
        <div className="p-5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex items-start gap-3">
          <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 dark:text-amber-200 space-y-1">
            <div className="font-bold">Application Under Compliance Review</div>
            <p className="text-amber-800 dark:text-amber-300">
              Your seller application for &quot;{sellerProfile.storeName}&quot; ({sellerProfile.businessCountry}) was submitted on{' '}
              {sellerProfile.submittedAt ? new Date(sellerProfile.submittedAt).toLocaleDateString() : 'recently'}.
              In accordance with marketplace compliance policy, product publishing is restricted until verified by the platform administrator.
            </p>
          </div>
        </div>
      )}

      {isRejected && (
        <div className="p-5 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          <div className="text-xs text-rose-900 dark:text-rose-200 space-y-1">
            <div className="font-bold">Seller Application Rejected</div>
            <p className="text-rose-800 dark:text-rose-300">
              Reason: {sellerProfile.rejectionReason || 'Business information did not satisfy compliance guidelines.'}
            </p>
            <button
              type="button"
              onClick={() => setActiveTab('application')}
              className="font-bold text-rose-700 dark:text-rose-300 underline cursor-pointer mt-1"
            >
              Update and Resubmit Application
            </button>
          </div>
        </div>
      )}

      {(!sellerProfile || activeTab === 'application' || isRejected) && !isVerified && !isPending && !loadingProfile && (
        <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#ff6a00]/10 text-[#ff6a00] flex items-center justify-center font-bold">
              <Store className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
                {isRejected ? 'Update & Resubmit Seller Application' : 'Apply for Verified Merchant Account'}
              </h2>
              <p className="text-xs text-slate-500">
                {isRejected
                  ? 'Update your business information and address to resubmit your application for platform review.'
                  : 'Register your business information to unlock product publishing and seller storefront operations'}
              </p>
            </div>
          </div>

          <form onSubmit={handleApply} className="space-y-4 max-w-xl text-xs">
            <div className="space-y-1">
              <label className="font-bold text-slate-700 dark:text-slate-300">Store Name *</label>
              <input
                type="text"
                required
                maxLength={150}
                placeholder="e.g. Phnom Penh Electronics Co."
                value={applyStoreName}
                onChange={(e) => setApplyStoreName(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">Country of Registration</label>
                <select
                  value={applyCountry}
                  onChange={(e) => setApplyCountry(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                >
                  <option value="KH">Cambodia (KH)</option>
                  <option value="SG">Singapore (SG)</option>
                  <option value="TH">Thailand (TH)</option>
                  <option value="VN">Vietnam (VN)</option>
                  <option value="US">United States (US)</option>
                  <option value="AU">Australia (AU)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">Business Type</label>
                <select
                  value={applyBusinessType}
                  onChange={(e) => setApplyBusinessType(e.target.value as any)}
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                >
                  <option value="individual">Individual / Sole Proprietor</option>
                  <option value="registered_business">Registered Business / LLC</option>
                  <option value="enterprise">Corporate Enterprise</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-700 dark:text-slate-300">Store Description</label>
              <textarea
                rows={3}
                placeholder="Describe your merchant catalog, product specializations, and shipping capabilities..."
                value={applyDescription}
                onChange={(e) => setApplyDescription(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">Business Phone</label>
                <input
                  type="tel"
                  placeholder="+855 23 123 456"
                  value={applyPhone}
                  onChange={(e) => setApplyPhone(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">Registered Address</label>
                <input
                  type="text"
                  placeholder="Street, City, Postal Code"
                  value={applyAddress}
                  onChange={(e) => setApplyAddress(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submittingApply}
              className="px-6 py-3 rounded-2xl bg-[#ff6a00] hover:bg-[#e05d00] text-white font-bold text-xs sm:text-sm shadow-md transition-all cursor-pointer"
            >
              {submittingApply ? 'Submitting Application...' : 'Submit Application for Review'}
            </button>
          </form>
        </div>
      )}

      {/* Verified Merchant Dashboard Navigation Tabs */}
      {isVerified && (
        <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('listings')}
            className={`pb-3 cursor-pointer border-b-2 transition-colors ${
              activeTab === 'listings'
                ? 'border-[#ff6a00] text-[#ff6a00]'
                : 'border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            My Product Listings ({sellerProducts.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ledger')}
            className={`pb-3 cursor-pointer border-b-2 transition-colors ${
              activeTab === 'ledger'
                ? 'border-[#ff6a00] text-[#ff6a00]'
                : 'border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            Commission & Earnings Ledger
          </button>
        </div>
      )}

      {/* Verified Merchant KPI Metrics */}
      {isVerified && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
            <span className="text-xs text-slate-400 font-semibold">Net Calculated Earnings</span>
            <div className="text-xl sm:text-2xl font-extrabold text-[#ff6a00]">
              ${financialSummary ? financialSummary.netCalculatedEarnings.toFixed(2) : '0.00'}
            </div>
            <span className="text-[11px] text-slate-400">After 5% commission</span>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
            <span className="text-xs text-slate-400 font-semibold">Gross Sales</span>
            <div className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
              ${financialSummary ? financialSummary.grossSalesMerchandise.toFixed(2) : '0.00'}
            </div>
            <span className="text-[11px] text-emerald-500 font-bold">Eligible merchandise</span>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
            <span className="text-xs text-slate-400 font-semibold">Published Catalog</span>
            <div className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
              {sellerProducts.length}
            </div>
            <span className="text-[11px] text-slate-400">Active store items</span>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
            <span className="text-xs text-slate-400 font-semibold">Disbursement Payout</span>
            <div className="text-xl sm:text-2xl font-extrabold text-amber-500">
              Not Configured
            </div>
            <span className="text-[11px] text-slate-400">Sandbox accounting only</span>
          </div>
        </div>
      )}

      {/* Tab: Listings */}
      {isVerified && activeTab === 'listings' && (
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                Store Catalog Listings ({sellerProducts.length})
              </h2>
              <p className="text-xs text-slate-400">
                Products published under store &quot;{sellerProfile?.storeName}&quot;
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="px-3.5 py-1.5 rounded-xl bg-[#ff6a00] hover:bg-[#e05d00] text-white font-bold text-xs cursor-pointer shadow-xs transition-all"
            >
              Add Listing
            </button>
          </div>

          {sellerProducts.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400 space-y-2">
              <Boxes className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700" />
              <p>You haven&apos;t published any product listings yet.</p>
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="text-[#ff6a00] font-bold hover:underline cursor-pointer"
              >
                Publish your first product
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-semibold">
                    <th className="py-3 px-2">Product</th>
                    <th className="py-3 px-2">Category</th>
                    <th className="py-3 px-2">Price</th>
                    <th className="py-3 px-2">Status</th>
                    <th className="py-3 px-2">Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {sellerProducts.map((prod) => (
                    <tr key={prod.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-2 flex items-center gap-3">
                        <img
                          src={prod.image || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=150'}
                          alt={prod.name}
                          className="w-10 h-10 rounded-lg object-cover bg-slate-100 dark:bg-slate-800 shrink-0"
                        />
                        <div className="max-w-xs truncate font-bold text-slate-900 dark:text-white">
                          {prod.name}
                        </div>
                      </td>
                      <td className="py-3 px-2 capitalize text-slate-500">{prod.category}</td>
                      <td className="py-3 px-2 font-bold text-slate-900 dark:text-white">
                        ${prod.price.toFixed(2)}
                      </td>
                      <td className="py-3 px-2">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600">
                          Active
                        </span>
                      </td>
                      <td className="py-3 px-2 text-slate-600 dark:text-slate-400 font-mono">
                        {prod.stockCount ?? prod.stock ?? 25} units
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: Commission & Earnings Ledger */}
      {isVerified && activeTab === 'ledger' && (
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-[#ff6a00]" />
                <span>Store Earnings & Commission Ledger</span>
              </h2>
              <p className="text-xs text-slate-400">
                Immutable accounting entries recorded server-side per order line item (5% platform commission)
              </p>
            </div>
            <div className="text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 px-3 py-1 rounded-xl border border-amber-500/20 font-bold self-start">
              Payouts: Not Configured (Sandbox Accounting)
            </div>
          </div>

          {/* Financial Summary Card */}
          {financialSummary && (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
                <span className="text-slate-400 text-[11px]">Gross Eligible Sales</span>
                <div className="font-extrabold text-base text-slate-900 dark:text-white">
                  ${financialSummary.grossSalesMerchandise.toFixed(2)}
                </div>
              </div>
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
                <span className="text-slate-400 text-[11px]">Platform Commission (5%)</span>
                <div className="font-extrabold text-base text-rose-500">
                  -${financialSummary.platformCommissionDeducted.toFixed(2)}
                </div>
              </div>
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
                <span className="text-slate-400 text-[11px]">Refund Adjustments</span>
                <div className="font-extrabold text-base text-slate-500">
                  -${financialSummary.refundAdjustments.toFixed(2)}
                </div>
              </div>
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
                <span className="text-slate-400 text-[11px]">Net Calculated Earnings</span>
                <div className="font-extrabold text-base text-emerald-600 dark:text-emerald-400">
                  ${financialSummary.netCalculatedEarnings.toFixed(2)}
                </div>
              </div>
            </div>
          )}

          {/* Ledger Table */}
          {ledgerEntries.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400 space-y-1">
              <FileText className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700" />
              <p>No transaction ledger records found yet.</p>
              <p className="text-[11px]">As customer orders are placed for your products, commission records will appear here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-semibold">
                    <th className="py-3 px-2">Order Reference</th>
                    <th className="py-3 px-2">Product</th>
                    <th className="py-3 px-2">Type</th>
                    <th className="py-3 px-2">Eligible Subtotal</th>
                    <th className="py-3 px-2">Commission (5%)</th>
                    <th className="py-3 px-2 font-bold text-right">Net Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {ledgerEntries.map((entry) => {
                    const isAdjustment = entry.type !== 'sale';
                    return (
                      <tr key={entry.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-2 font-mono font-bold text-slate-900 dark:text-white">
                          #{entry.orderId}
                        </td>
                        <td className="py-3 px-2 text-slate-700 dark:text-slate-300">
                          {entry.productName} (x{entry.quantity})
                        </td>
                        <td className="py-3 px-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              !isAdjustment
                                ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600'
                                : 'bg-rose-50 dark:bg-rose-950/50 text-rose-600'
                            }`}
                          >
                            {entry.type.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-2 font-mono">
                          ${entry.eligibleSubtotal.toFixed(2)}
                        </td>
                        <td className="py-3 px-2 font-mono text-slate-500">
                          ${entry.commissionAmount.toFixed(2)}
                        </td>
                        <td
                          className={`py-3 px-2 font-mono font-bold text-right ${
                            !isAdjustment
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          ${entry.netAmount.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add New Product Modal */}
      {showAddModal && isVerified && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                Add New Product Listing
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateProduct} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">Product Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Wireless Noise-Cancelling Headphones"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Sale Price ($) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="99.99"
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Original Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="129.99"
                    value={newOriginalPrice}
                    onChange={(e) => setNewOriginalPrice(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  >
                    <option value="electronics">Electronics</option>
                    <option value="fashion">Fashion</option>
                    <option value="home-kitchen">Home & Kitchen</option>
                    <option value="beauty">Beauty & Personal</option>
                    <option value="sports">Sports & Outdoor</option>
                    <option value="gaming">Gaming & VR</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Brand</label>
                  <input
                    type="text"
                    placeholder={sellerProfile.storeName}
                    value={newBrand}
                    onChange={(e) => setNewBrand(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Initial Stock</label>
                  <input
                    type="number"
                    min="1"
                    value={newStock}
                    onChange={(e) => setNewStock(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Image URL</label>
                  <input
                    type="url"
                    value={newImage}
                    onChange={(e) => setNewImage(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">Description</label>
                <textarea
                  rows={3}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Describe product craftsmanship, specifications, and warranty..."
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={publishing}
                  className="px-5 py-2.5 rounded-xl bg-[#ff6a00] hover:bg-[#e05d00] text-white font-bold cursor-pointer"
                >
                  {publishing ? 'Publishing...' : 'Publish Listing'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
