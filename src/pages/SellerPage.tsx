import React, { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useProducts } from '../context/ProductContext';
import { SellerClient } from '../services/sellerClient';
import {
  Seller,
  SellerLedgerEntry,
  SellerFinancialSummary,
  Product,
  SellerPayoutRequest,
  PayoutMethod,
  SellerKycRecord,
  KycHistoryEvent,
  IdentityDocumentType,
} from '../types';
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
  Wallet,
  ArrowUpRight,
  Info,
  Upload,
  Lock,
  Eye,
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

  // Ledger & Payout state
  const [ledgerEntries, setLedgerEntries] = useState<SellerLedgerEntry[]>([]);
  const [financialSummary, setFinancialSummary] = useState<SellerFinancialSummary | null>(null);
  const [loadingLedger, setLoadingLedger] = useState<boolean>(false);
  const [payoutsList, setPayoutsList] = useState<SellerPayoutRequest[]>([]);
  const [ledgerSubTab, setLedgerSubTab] = useState<'transactions' | 'payouts'>('transactions');
  const [showPayoutModal, setShowPayoutModal] = useState<boolean>(false);
  const [payoutAmount, setPayoutAmount] = useState<string>('');
  const [payoutMethod, setPayoutMethod] = useState<PayoutMethod>('aba_bank');
  const [payoutAccountName, setPayoutAccountName] = useState<string>('');
  const [payoutAccountNumber, setPayoutAccountNumber] = useState<string>('');
  const [payoutBankName, setPayoutBankName] = useState<string>('');
  const [payoutCryptoNetwork, setPayoutCryptoNetwork] = useState<string>('TRC20');
  const [payoutVerifiedConfirmed, setPayoutVerifiedConfirmed] = useState<boolean>(false);
  const [submittingPayout, setSubmittingPayout] = useState<boolean>(false);

  // Application form state
  const [applyStoreName, setApplyStoreName] = useState('');
  const [applyOwnerName, setApplyOwnerName] = useState('');
  const [applyEmail, setApplyEmail] = useState('');
  const [applyPhone, setApplyPhone] = useState('');
  const [applyCountry, setApplyCountry] = useState('KH');
  const [applyAddress, setApplyAddress] = useState('');
  const [applyCategories, setApplyCategories] = useState<string[]>(['electronics']);
  const [applyDescription, setApplyDescription] = useState('');
  const [applyBusinessType, setApplyBusinessType] = useState<'individual' | 'registered_business' | 'enterprise'>('individual');
  const [applyWebsite, setApplyWebsite] = useState('');
  const [applyDocuments, setApplyDocuments] = useState('');
  const [submittingApply, setSubmittingApply] = useState(false);
  const [isResubmitting, setIsResubmitting] = useState(false);

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

  // Seller KYC & Verification state
  const [kycRecord, setKycRecord] = useState<SellerKycRecord | null>(null);
  const [kycHistory, setKycHistory] = useState<KycHistoryEvent[]>([]);
  const [kycDocType, setKycDocType] = useState<IdentityDocumentType>('national_id');
  const [kycDocNumber, setKycDocNumber] = useState<string>('');
  const [kycSelectedFile, setKycSelectedFile] = useState<File | null>(null);
  const [uploadingKycDoc, setUploadingKycDoc] = useState<boolean>(false);
  const [kycPrivacyAccepted, setKycPrivacyAccepted] = useState<boolean>(true);
  const [showKycSection, setShowKycSection] = useState<boolean>(false);

  const populateFormWithSeller = useCallback((profile: Seller | null, kyc?: SellerKycRecord | null) => {
    if (profile || kyc) {
      setApplyStoreName(profile?.storeName || kyc?.shopName || '');
      const safeProfileOwner =
        profile?.ownerName &&
        profile.ownerName !== 'Seller' &&
        !profile.ownerName.includes('@')
          ? profile.ownerName
          : '';
      const safeDisplayName =
        user?.displayName && !user.displayName.includes('@') ? user.displayName : '';
      setApplyOwnerName(safeProfileOwner || kyc?.legalFullName || safeDisplayName || '');
      setApplyEmail(kyc?.contactEmail || profile?.contactInfo?.email || user?.email || '');
      setApplyPhone(profile?.contactInfo?.phone || '');
      setApplyCountry(profile?.businessCountry || kyc?.countryOfRegistration || 'KH');
      setApplyAddress(
        kyc?.residentialOrBusinessAddress ||
          profile?.businessAddress ||
          profile?.contactInfo?.address ||
          ''
      );
      setApplyCategories(
        profile?.productCategories && profile.productCategories.length > 0
          ? profile.productCategories
          : ['electronics']
      );
      setApplyDescription(profile?.description || '');
      setApplyBusinessType(profile?.businessType || kyc?.profileType || 'individual');
      setApplyWebsite(profile?.websiteUrl || '');
      setApplyDocuments(
        Array.isArray(kyc?.legacyDocumentRefs) && kyc!.legacyDocumentRefs!.length > 0
          ? kyc!.legacyDocumentRefs!.join(', ')
          : Array.isArray(profile?.documents)
          ? profile!.documents!.join(', ')
          : ''
      );
    } else if (user) {
      const safeDisplayName =
        user.displayName && !user.displayName.includes('@') ? user.displayName : '';
      setApplyOwnerName(safeDisplayName);
      setApplyEmail(user.email || '');
    }
  }, [user]);

  const loadSellerData = useCallback(async () => {
    if (!isAuthenticated || !user) {
      setLoadingProfile(false);
      return;
    }

    try {
      setLoadingProfile(true);
      const [profile, kycData] = await Promise.all([
        SellerClient.getMySeller(),
        SellerClient.getMyKyc().catch(() => ({ record: null, history: [] })),
      ]);
      setSellerProfile(profile);
      setKycRecord(kycData.record);
      setKycHistory(kycData.history);
      populateFormWithSeller(profile, kycData.record);

      const canLoadFinancials =
        profile &&
        (profile.verificationStatus === 'verified' ||
          profile.verificationStatus === 'approved' ||
          profile.verificationStatus === 'expired' ||
          profile.verificationStatus === 'suspended' ||
          kycData.record?.kycStatus === 'VERIFIED' ||
          kycData.record?.kycStatus === 'EXPIRED' ||
          kycData.record?.kycStatus === 'SUSPENDED');

      if (canLoadFinancials) {
        setLoadingLedger(true);
        try {
          const [ledgerData, payoutsData] = await Promise.all([
            SellerClient.getLedger(),
            SellerClient.getPayouts().catch(() => []),
          ]);
          setLedgerEntries(ledgerData.entries);
          setFinancialSummary(ledgerData.summary);
          setPayoutsList(payoutsData);
        } catch (ledgerErr) {
          console.warn('Could not fetch seller ledger or payouts:', ledgerErr);
        } finally {
          setLoadingLedger(false);
        }
      }
    } catch (err: any) {
      console.warn('Could not fetch seller profile:', err?.message);
    } finally {
      setLoadingProfile(false);
    }
  }, [isAuthenticated, user, populateFormWithSeller]);

  const handleRequestPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(payoutAmount);
    if (isNaN(amountNum) || amountNum < 20) {
      onShowToast('Minimum withdrawal amount is $20.00 USD.', 'error');
      return;
    }
    const available = financialSummary?.availableForPayout || 0;
    if (amountNum > available) {
      onShowToast(`Requested amount ($${amountNum.toFixed(2)}) exceeds available balance ($${available.toFixed(2)}).`, 'error');
      return;
    }
    if (!payoutAccountName.trim() || !payoutAccountNumber.trim()) {
      onShowToast('Account holder name and account number are required.', 'error');
      return;
    }
    if (!payoutVerifiedConfirmed) {
      onShowToast('Please confirm that your payout destination details are accurate.', 'error');
      return;
    }

    setSubmittingPayout(true);
    try {
      await SellerClient.requestPayout(
        amountNum,
        {
          method: payoutMethod,
          accountName: payoutAccountName.trim(),
          accountNumber: payoutAccountNumber.trim(),
          bankName: payoutBankName.trim() || undefined,
          cryptoNetwork: payoutMethod === 'crypto_usdt' ? payoutCryptoNetwork : undefined,
          verifiedConfirmed: payoutVerifiedConfirmed,
        },
        undefined,
        'USD'
      );
      onShowToast('Payout request submitted successfully. Awaiting Finance Manager review.', 'success');
      setShowPayoutModal(false);
      setPayoutAmount('');
      setPayoutAccountNumber('');
      setPayoutVerifiedConfirmed(false);
      // Refresh ledger & payouts
      const [ledgerData, payoutsData] = await Promise.all([
        SellerClient.getLedger(),
        SellerClient.getPayouts().catch(() => []),
      ]);
      setLedgerEntries(ledgerData.entries);
      setFinancialSummary(ledgerData.summary);
      setPayoutsList(payoutsData);
      setLedgerSubTab('payouts');
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to submit withdrawal request.', 'error');
    } finally {
      setSubmittingPayout(false);
    }
  };

  useEffect(() => {
    loadSellerData();
  }, [loadSellerData]);

  const toggleCategory = (cat: string) => {
    setApplyCategories((prev) =>
      prev.includes(cat)
        ? prev.length > 1
          ? prev.filter((c) => c !== cat)
          : prev
        : [...prev, cat]
    );
  };

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!applyStoreName.trim()) {
      onShowToast('Please specify a Shop / Store name.', 'error');
      return;
    }

    if (!applyOwnerName.trim()) {
      onShowToast("Please enter the Owner's full name.", 'error');
      return;
    }

    if (!applyPhone.trim()) {
      onShowToast('Please provide a valid business phone number.', 'error');
      return;
    }

    if (!applyAddress.trim()) {
      onShowToast('Please provide your registered business address.', 'error');
      return;
    }

    if (applyCategories.length === 0) {
      onShowToast('Please select at least one product category.', 'error');
      return;
    }

    if (!applyDescription.trim()) {
      onShowToast('Please provide a description of your store and merchandise.', 'error');
      return;
    }

    // Prevent duplicate pending submission
    if (sellerProfile && (sellerProfile.verificationStatus === 'pending' || sellerProfile.verificationStatus === 'under_review') && !isResubmitting) {
      onShowToast('Your seller application is already pending review.', 'info');
      return;
    }

    try {
      setSubmittingApply(true);
      const docsArray = applyDocuments
        .split(',')
        .map((d) => d.trim())
        .filter(Boolean);

      const created = await SellerClient.apply({
        storeName: applyStoreName.trim(),
        ownerName: applyOwnerName.trim(),
        description: applyDescription.trim(),
        businessCountry: applyCountry,
        businessAddress: applyAddress.trim(),
        productCategories: applyCategories,
        businessType: applyBusinessType,
        websiteUrl: applyWebsite.trim(),
        documents: docsArray,
        contactInfo: {
          email: applyEmail.trim() || user?.email || '',
          phone: applyPhone.trim(),
          address: applyAddress.trim(),
        },
      });

      // Also record private KYC record with masked document number & profile metadata
      try {
        const updatedKyc = await SellerClient.submitKyc({
          legalFullName: applyOwnerName.trim(),
          shopName: applyStoreName.trim(),
          countryOfRegistration: applyCountry,
          residentialOrBusinessAddress: applyAddress.trim(),
          phoneNumber: applyPhone.trim(),
          profileType: applyBusinessType,
          identityDocumentType: kycDocType,
          identityNumber: kycDocNumber.trim() || undefined,
          privacyNoticeAccepted: kycPrivacyAccepted,
        });
        setKycRecord(updatedKyc);
      } catch {
        // non-blocking if legacy apply already succeeded
      }

      if (kycSelectedFile) {
        try {
          await SellerClient.uploadKycDocument(kycSelectedFile, kycDocType, kycDocNumber.trim() || undefined);
          setKycSelectedFile(null);
        } catch (uploadErr: any) {
          onShowToast(uploadErr?.message || 'Application saved, but document upload failed.', 'error');
        }
      }

      setSellerProfile(created);
      setIsResubmitting(false);
      onShowToast('Seller & KYC application submitted successfully! Status is PENDING_REVIEW.', 'success');
      await loadSellerData();
      setActiveTab('listings');
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to submit seller application. Please check your information and try again.', 'error');
    } finally {
      setSubmittingApply(false);
    }
  };

  const handleUploadKycDocOnly = async () => {
    if (!kycSelectedFile) {
      onShowToast('Please choose a valid JPEG, PNG, WEBP, or PDF document (max 5 MB).', 'error');
      return;
    }
    setUploadingKycDoc(true);
    try {
      await SellerClient.uploadKycDocument(kycSelectedFile, kycDocType, kycDocNumber.trim() || undefined);
      setKycSelectedFile(null);
      setKycDocNumber('');
      onShowToast('KYC document uploaded securely to private storage.', 'success');
      await loadSellerData();
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to upload KYC document.', 'error');
    } finally {
      setUploadingKycDoc(false);
    }
  };

  const handlePreviewMyDoc = async (docId: string) => {
    if (!user?.uid) return;
    try {
      const access = await SellerClient.getMyDocumentViewUrl(user.uid, docId);
      // Fetch using short-lived authorized view link in-memory blob to inspect safely without window.open
      const res = await fetch(access.viewUrl);
      if (!res.ok) throw new Error('Unable to load private document preview.');
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = access.fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(objUrl), 10000);
      onShowToast(`Authorized download ready (link expires at ${new Date(access.expiresAt).toLocaleTimeString()}).`, 'info');
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to preview KYC document.', 'error');
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

  const effectiveKycStatus = kycRecord?.kycStatus || sellerProfile?.kycStatus || (
    sellerProfile?.verificationStatus === 'verified' || sellerProfile?.verificationStatus === 'approved'
      ? 'VERIFIED'
      : sellerProfile?.verificationStatus === 'under_review'
      ? 'UNDER_REVIEW'
      : sellerProfile?.verificationStatus === 'rejected'
      ? 'REJECTED'
      : sellerProfile?.verificationStatus === 'expired'
      ? 'EXPIRED'
      : sellerProfile?.verificationStatus === 'suspended'
      ? 'SUSPENDED'
      : sellerProfile?.verificationStatus === 'pending'
      ? 'PENDING_REVIEW'
      : 'NOT_SUBMITTED'
  );

  const isVerified = effectiveKycStatus === 'VERIFIED';
  const isPending = effectiveKycStatus === 'PENDING_REVIEW';
  const isUnderReview = effectiveKycStatus === 'UNDER_REVIEW';
  const isRejected = effectiveKycStatus === 'REJECTED';
  const isExpired = effectiveKycStatus === 'EXPIRED';
  const isSuspended = effectiveKycStatus === 'SUSPENDED';

  // Filter products strictly owned by current authenticated user
  const sellerProducts = products.filter(
    (p) => p.sellerId === user?.uid || (p.seller && p.seller.id === user?.uid)
  );

  const availableCategories = [
    { id: 'electronics', labelEn: 'Electronics & Gadgets', labelKm: 'គ្រឿងអេឡិចត្រូនិច' },
    { id: 'fashion', labelEn: 'Fashion & Apparel', labelKm: 'សម្លៀកបំពាក់ & ម៉ូដ' },
    { id: 'home', labelEn: 'Home & Living', labelKm: 'គេហដ្ឋាន & ការរស់នៅ' },
    { id: 'beauty', labelEn: 'Beauty & Personal Care', labelKm: 'សម្រស់ & ថែរក្សាខ្លួន' },
    { id: 'sports', labelEn: 'Sports & Outdoors', labelKm: 'កីឡា & ក្រៅផ្ទះ' },
    { id: 'automotive', labelEn: 'Automotive & Tools', labelKm: 'យានយន្ត & ឧបករណ៍' },
    { id: 'books', labelEn: 'Books & Stationery', labelKm: 'សៀវភៅ & សម្ភារការិយាល័យ' },
    { id: 'groceries', labelEn: 'Groceries & Gourmet', labelKm: 'គ្រឿងទេស & អាហារ' },
    { id: 'handcrafts', labelEn: 'Artisanal & Crafts', labelKm: 'សិប្បកម្ម & វត្ថុអនុស្សាវរីយ៍' },
  ];

  return (
    <div className="space-y-8 pb-16">
      {/* Merchant Header */}
      <div className="p-6 sm:p-8 rounded-3xl bg-slate-900 text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-[#ff6a00]/20 text-[#ff6a00] border border-[#ff6a00]/30 flex items-center justify-center font-black">
            <Store className="w-8 h-8" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-extrabold">
                {sellerProfile ? sellerProfile.storeName : 'Sell on Apaibay'}
              </h1>
              {isVerified && (
                <span className="text-xs bg-emerald-500 text-white px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>{t('seller.statusApproved', 'KYC Verified Merchant')}</span>
                </span>
              )}
              {isPending && (
                <span className="text-xs bg-amber-500 text-white px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>{t('seller.statusPending', 'KYC Pending Review')}</span>
                </span>
              )}
              {isUnderReview && (
                <span className="text-xs bg-blue-500 text-white px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>{t('seller.statusUnderReview', 'KYC Under Review')}</span>
                </span>
              )}
              {isRejected && (
                <span className="text-xs bg-rose-500 text-white px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                  <XCircle className="w-3 h-3" />
                  <span>{t('seller.statusRejected', 'KYC Action Required / Rejected')}</span>
                </span>
              )}
              {isExpired && (
                <span className="text-xs bg-orange-600 text-white px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  <span>KYC Expired (Renewal Needed)</span>
                </span>
              )}
              {isSuspended && (
                <span className="text-xs bg-rose-700 text-white px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                  <XCircle className="w-3 h-3" />
                  <span>KYC Suspended</span>
                </span>
              )}
              {!sellerProfile && effectiveKycStatus === 'NOT_SUBMITTED' && (
                <span className="text-xs bg-slate-700 text-slate-300 px-2.5 py-0.5 rounded-full font-bold">
                  NOT_SUBMITTED
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-slate-400">
              Manage inventory, KYC identity verification, commissions, and payout eligibility
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {sellerProfile && (
            <button
              type="button"
              onClick={() => setShowKycSection((prev) => !prev)}
              className="px-4 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold text-xs flex items-center gap-1.5 border border-slate-700 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-[#ff6a00]" />
              <span>{showKycSection ? 'Hide KYC Vault' : 'KYC Verification Vault'}</span>
            </button>
          )}
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
      </div>

      {/* Private KYC Verification Center Card (for any applicant/verified/expired/suspended seller) */}
      {(showKycSection || isExpired || isSuspended) && sellerProfile && (
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#ff6a00]/15 text-[#ff6a00] flex items-center justify-center">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                  Seller KYC &amp; Private Document Vault
                </h2>
                <p className="text-xs text-slate-400">
                  Canonical Status: <span className="font-mono font-bold text-[#ff6a00]">{effectiveKycStatus}</span>
                  {kycRecord?.kycExpiresAt && ` • Valid until ${new Date(kycRecord.kycExpiresAt).toLocaleDateString()}`}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] font-bold">
              <span className={`px-2.5 py-1 rounded-lg ${kycRecord?.phoneVerificationStatus === 'verified' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                Phone: {kycRecord?.phoneVerificationStatus || 'pending'}
              </span>
              <span className={`px-2.5 py-1 rounded-lg ${kycRecord?.identityVerificationStatus === 'verified' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                Identity: {kycRecord?.identityVerificationStatus || 'pending'}
              </span>
              <span className={`px-2.5 py-1 rounded-lg ${kycRecord?.payoutOwnershipVerificationStatus === 'verified' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                Payout Ownership: {kycRecord?.payoutOwnershipVerificationStatus || 'pending'}
              </span>
            </div>
          </div>

          {(isExpired || isSuspended) && (
            <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-900 dark:text-rose-200 space-y-2">
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span>
                  {isExpired
                    ? 'KYC Verification Expired — Payouts Temporarily Blocked'
                    : 'Seller KYC Suspended — Payouts Blocked'}
                </span>
              </div>
              <p>
                {kycRecord?.actionRequiredMessage ||
                  kycRecord?.suspendedReason ||
                  'New withdrawal requests require an active VERIFIED KYC status. Your historical ledger entries and previous payouts remain fully preserved.'}
              </p>
              {isExpired && !isResubmitting && (
                <button
                  type="button"
                  onClick={() => {
                    setIsResubmitting(true);
                    populateFormWithSeller(sellerProfile);
                  }}
                  className="px-4 py-2 rounded-xl bg-[#ff6a00] hover:bg-[#e05d00] text-white font-bold text-xs cursor-pointer"
                >
                  Renew KYC Application
                </button>
              )}
            </div>
          )}

          {/* Private KYC Document Upload Box */}
          {!isSuspended && (
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3 text-xs">
              <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Upload className="w-4 h-4 text-[#ff6a00]" />
                <span>Upload Private Verification Document (JPEG, PNG, WEBP, PDF • Max 5 MB)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <select
                  value={kycDocType}
                  onChange={(e) => setKycDocType(e.target.value as IdentityDocumentType)}
                  className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                >
                  <option value="national_id">National Identity Card</option>
                  <option value="passport">Passport</option>
                  <option value="drivers_license">Driver&apos;s License</option>
                  <option value="business_registration">Business Registration / Patent</option>
                </select>
                <input
                  type="text"
                  placeholder="Document Ref / ID No. (masked automatically)"
                  value={kycDocNumber}
                  onChange={(e) => setKycDocNumber(e.target.value)}
                  className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(e) => setKycSelectedFile(e.target.files?.[0] || null)}
                  className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-slate-500">
                  Data Minimization: No biometric or facial recognition data is collected. Documents are stored in private storage with 5-year retention limits.
                </span>
                <button
                  type="button"
                  disabled={uploadingKycDoc || !kycSelectedFile}
                  onClick={handleUploadKycDocOnly}
                  className="px-4 py-2 rounded-xl bg-[#ff6a00] hover:bg-[#e05d00] disabled:opacity-40 text-white font-bold cursor-pointer"
                >
                  {uploadingKycDoc ? 'Uploading...' : 'Upload Document Privately'}
                </button>
              </div>
            </div>
          )}

          {/* Uploaded Documents List */}
          {kycRecord && kycRecord.documents.length > 0 && (
            <div className="space-y-2 text-xs">
              <div className="font-bold text-slate-700 dark:text-slate-300">Submitted Private Documents</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {kycRecord.documents.map((d) => (
                  <div
                    key={d.docId}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 dark:text-white truncate">{d.fileName}</div>
                      <div className="text-[11px] text-slate-400">
                        {d.documentType.replace('_', ' ')} • {(d.sizeBytes / 1024).toFixed(1)} KB •{' '}
                        {d.maskedDocumentNumber || 'No ID ref'}
                      </div>
                    </div>
                    {d.status !== 'purged' ? (
                      <button
                        type="button"
                        onClick={() => handlePreviewMyDoc(d.docId)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-700 text-white font-bold text-[11px] flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View</span>
                      </button>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-semibold">Purged</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Verification Audit Timeline */}
          {kycHistory.length > 0 && (
            <div className="space-y-2 text-xs">
              <div className="font-bold text-slate-700 dark:text-slate-300">KYC Verification History</div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {kycHistory.map((evt) => (
                  <div
                    key={evt.eventId}
                    className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between gap-2 text-[11px]"
                  >
                    <div>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{evt.action}</span>
                      <span className="text-slate-500"> ({evt.newStatus})</span>
                      {evt.notes && <span className="text-slate-400"> — {evt.notes}</span>}
                    </div>
                    <span className="text-slate-400 shrink-0">{new Date(evt.timestamp).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Compliance Status Alerts */}
      {isPending && !isResubmitting && (
        <div className="p-6 rounded-3xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 space-y-3">
          <div className="flex items-start gap-3">
            <Clock className="w-6 h-6 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="text-sm font-bold text-amber-900 dark:text-amber-200">
                Application Queued for Platform Compliance Review
              </div>
              <p className="text-xs text-amber-800 dark:text-amber-300">
                Your merchant application for &quot;<strong>{sellerProfile?.storeName}</strong>&quot; ({sellerProfile?.businessCountry}) was submitted on{' '}
                {sellerProfile?.submittedAt ? new Date(sellerProfile.submittedAt).toLocaleDateString() : 'recently'}.
                Platform administrators review all applications to verify merchant provenance. Product publishing will automatically activate once approved.
              </p>
            </div>
          </div>
          <div className="pt-2 border-t border-amber-200 dark:border-amber-800/40 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-amber-900 dark:text-amber-200">
            <div><span className="text-amber-600 font-semibold">Store:</span> {sellerProfile?.storeName}</div>
            <div><span className="text-amber-600 font-semibold">Owner:</span> {sellerProfile?.ownerName || 'Verified Account'}</div>
            <div><span className="text-amber-600 font-semibold">Country:</span> {sellerProfile?.businessCountry}</div>
            <div><span className="text-amber-600 font-semibold">Type:</span> {sellerProfile?.businessType}</div>
          </div>
        </div>
      )}

      {isUnderReview && !isResubmitting && (
        <div className="p-6 rounded-3xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 space-y-3">
          <div className="flex items-start gap-3">
            <Clock className="w-6 h-6 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="text-sm font-bold text-blue-900 dark:text-blue-200">
                Application Currently Under Compliance Audit
              </div>
              <p className="text-xs text-blue-800 dark:text-blue-300">
                An administrator is currently reviewing the business details and compliance information for &quot;<strong>{sellerProfile?.storeName}</strong>&quot;.
                You will be notified once the audit decision is finalized.
              </p>
            </div>
          </div>
        </div>
      )}

      {isRejected && !isResubmitting && (
        <div className="p-6 rounded-3xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div className="text-xs text-rose-900 dark:text-rose-200 space-y-2 flex-1">
              <div className="text-sm font-bold">Seller Application Requires Revision</div>
              <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-rose-200 dark:border-rose-900 text-xs font-medium text-rose-700 dark:text-rose-300">
                <span className="font-bold">Compliance Rejection Reason: </span>
                {sellerProfile?.rejectionReason || 'Business information did not satisfy compliance guidelines.'}
              </div>
              <p className="text-rose-800 dark:text-rose-300">
                You may correct your information, business registration address, or categories and resubmit for immediate review.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setIsResubmitting(true);
              populateFormWithSeller(sellerProfile);
            }}
            className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm cursor-pointer transition-colors"
          >
            Update and Resubmit Application
          </button>
        </div>
      )}

      {/* Seller Application Form */}
      {(!sellerProfile || isResubmitting) && !isVerified && !isPending && !isUnderReview && !loadingProfile && (
        <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#ff6a00]/10 text-[#ff6a00] flex items-center justify-center font-bold">
              <Store className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
                {isResubmitting ? 'Update & Resubmit Seller Application' : 'Apply to Sell on Apaibay'}
              </h2>
              <p className="text-xs text-slate-500">
                Register your business information to unlock product publishing and seller storefront operations
              </p>
            </div>
          </div>

          <form onSubmit={handleApply} className="space-y-5 text-xs">
            {/* Row 1: Shop Name & Owner Name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>Shop / Store Name *</span>
                  <span className="text-[10px] text-slate-400 font-normal">ឈ្មោះហាង</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={150}
                  placeholder="e.g. Phnom Penh Electronics Co."
                  value={applyStoreName}
                  onChange={(e) => setApplyStoreName(e.target.value)}
                  className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-[#ff6a00]"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>Owner&apos;s Full Name *</span>
                  <span className="text-[10px] text-slate-400 font-normal">ឈ្មោះពេញរបស់ម្ចាស់</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Chan Sokha"
                  value={applyOwnerName}
                  onChange={(e) => setApplyOwnerName(e.target.value)}
                  className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-[#ff6a00]"
                />
              </div>
            </div>

            {/* Row 2: Email & Phone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>Email Address * (Prefilled)</span>
                  <span className="text-[10px] text-slate-400 font-normal">អាសយដ្ឋានអ៊ីមែល</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="merchant@example.com"
                  value={applyEmail}
                  onChange={(e) => setApplyEmail(e.target.value)}
                  className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-[#ff6a00]"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>Business Phone Number *</span>
                  <span className="text-[10px] text-slate-400 font-normal">លេខទូរស័ព្ទ</span>
                </label>
                <input
                  type="tel"
                  required
                  placeholder="+855 23 123 456"
                  value={applyPhone}
                  onChange={(e) => setApplyPhone(e.target.value)}
                  className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-[#ff6a00]"
                />
              </div>
            </div>

            {/* Row 3: Country & Business Type */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>Country of Registration *</span>
                  <span className="text-[10px] text-slate-400 font-normal">ប្រទេសចុះបញ្ជី</span>
                </label>
                <select
                  value={applyCountry}
                  onChange={(e) => setApplyCountry(e.target.value)}
                  className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-[#ff6a00]"
                >
                  <option value="KH">Cambodia (KH)</option>
                  <option value="CN">China (CN)</option>
                  <option value="SG">Singapore (SG)</option>
                  <option value="TH">Thailand (TH)</option>
                  <option value="VN">Vietnam (VN)</option>
                  <option value="US">United States (US)</option>
                  <option value="AU">Australia (AU)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>Business Type *</span>
                  <span className="text-[10px] text-slate-400 font-normal">ប្រភេទអាជីវកម្ម</span>
                </label>
                <select
                  value={applyBusinessType}
                  onChange={(e) => setApplyBusinessType(e.target.value as any)}
                  className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-[#ff6a00]"
                >
                  <option value="individual">Individual / Sole Proprietor (រូបវន្តបុគ្គល)</option>
                  <option value="registered_business">Registered Business / LLC (សហគ្រាសចុះបញ្ជី)</option>
                  <option value="enterprise">Corporate Enterprise (សាជីវកម្មធំ)</option>
                </select>
              </div>
            </div>

            {/* Registered Business Address */}
            <div className="space-y-1">
              <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                <span>Registered Business Address *</span>
                <span className="text-[10px] text-slate-400 font-normal">អាសយដ្ឋានអាជីវកម្ម</span>
              </label>
              <input
                type="text"
                required
                placeholder="Street address, Khan / District, City, Postal Code"
                value={applyAddress}
                onChange={(e) => setApplyAddress(e.target.value)}
                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-[#ff6a00]"
              />
            </div>

            {/* Product Categories Multi-Select Chips */}
            <div className="space-y-2">
              <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                <span>Product Categories * (Select all that apply)</span>
                <span className="text-[10px] text-slate-400 font-normal">ប្រភេទផលិតផល</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {availableCategories.map((cat) => {
                  const selected = applyCategories.includes(cat.id);
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => toggleCategory(cat.id)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5 ${
                        selected
                          ? 'bg-[#ff6a00] border-[#ff6a00] text-white shadow-xs'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                      }`}
                    >
                      {selected && <CheckCircle2 className="w-3.5 h-3.5" />}
                      <span>{cat.labelEn}</span>
                      <span className="opacity-75 text-[10px]">({cat.labelKm})</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Business Description */}
            <div className="space-y-1">
              <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                <span>Business Description *</span>
                <span className="text-[10px] text-slate-400 font-normal">ការពិពណ៌នាអំពីអាជីវកម្ម</span>
              </label>
              <textarea
                rows={3}
                required
                placeholder="Describe your merchant catalog, product specializations, return guarantee, and fulfillment capability..."
                value={applyDescription}
                onChange={(e) => setApplyDescription(e.target.value)}
                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-[#ff6a00]"
              />
            </div>

            {/* Row 4: Website URL & Supporting Documents */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>Website or Social Media URL (Optional)</span>
                  <span className="text-[10px] text-slate-400 font-normal">គេហទំព័រ</span>
                </label>
                <input
                  type="url"
                  placeholder="https://facebook.com/myshop or https://myshop.com"
                  value={applyWebsite}
                  onChange={(e) => setApplyWebsite(e.target.value)}
                  className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-[#ff6a00]"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>Supporting Documents / License ID (Optional)</span>
                  <span className="text-[10px] text-slate-400 font-normal">ឯកសារអាជីវកម្ម</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Business Reg #KH-2024-8841, Tax Certificate"
                  value={applyDocuments}
                  onChange={(e) => setApplyDocuments(e.target.value)}
                  className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-[#ff6a00]"
                />
              </div>
            </div>

            {/* Row 5: KYC Identity Document & Privacy Notice */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-4">
              <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
                <ShieldCheck className="w-4 h-4 text-[#ff6a00]" />
                <span>Identity &amp; Compliance Verification (Private KYC Vault)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Identity Document Type *</label>
                  <select
                    value={kycDocType}
                    onChange={(e) => setKycDocType(e.target.value as IdentityDocumentType)}
                    className="w-full p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  >
                    <option value="national_id">National ID Card</option>
                    <option value="passport">Passport</option>
                    <option value="drivers_license">Driver&apos;s License</option>
                    <option value="business_registration">Business Registration Certificate</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Document Number (Masked)</label>
                  <input
                    type="text"
                    placeholder="Last 4 digits shown only after save"
                    value={kycDocNumber}
                    onChange={(e) => setKycDocNumber(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Upload ID / Business Doc (Max 5 MB)</label>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={(e) => setKycSelectedFile(e.target.files?.[0] || null)}
                    className="w-full p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                  />
                </div>
              </div>
              <label className="flex items-start gap-2 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={kycPrivacyAccepted}
                  onChange={(e) => setKycPrivacyAccepted(e.target.checked)}
                  required
                  className="mt-0.5 accent-[#ff6a00]"
                />
                <span>
                  I consent to private seller identity verification. Apaibay collects only minimum verification data (no biometric or facial recognition scanning), stores documents privately with strict access auditing, and applies a 5-year retention policy.
                </span>
              </label>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={submittingApply}
                className="px-6 py-3 rounded-2xl bg-[#ff6a00] hover:bg-[#e05d00] text-white font-bold text-xs sm:text-sm shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                {submittingApply ? 'Submitting Application...' : isResubmitting ? 'Submit Updated Application' : 'Submit Seller Application'}
              </button>
              {isResubmitting && (
                <button
                  type="button"
                  onClick={() => setIsResubmitting(false)}
                  className="px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold text-xs cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {/* Merchant Dashboard Navigation Tabs (Available for Verified, and Ledger preserved for Expired/Suspended) */}
      {(isVerified || isExpired || isSuspended) && (
        <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6 text-xs font-bold">
          {isVerified && (
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
          )}
          <button
            type="button"
            onClick={() => setActiveTab('ledger')}
            className={`pb-3 cursor-pointer border-b-2 transition-colors ${
              activeTab === 'ledger' || !isVerified
                ? 'border-[#ff6a00] text-[#ff6a00]'
                : 'border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            Commission &amp; Earnings Ledger
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
            <span className="text-xs text-slate-400 font-semibold">Available for Payout</span>
            <div className="text-xl sm:text-2xl font-extrabold text-emerald-500">
              ${financialSummary ? (financialSummary.availableForPayout || 0).toFixed(2) : '0.00'}
            </div>
            <span className="text-[11px] text-slate-400">
              Pending: ${(financialSummary?.pendingSettlement || 0).toFixed(2)} • Sandbox Batch
            </span>
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

      {/* Tab: Commission & Earnings Ledger & Payouts */}
      {(isVerified || isExpired || isSuspended) && (activeTab === 'ledger' || !isVerified) && (
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <Wallet className="w-5 h-5 text-[#ff6a00]" />
                <span>Seller Settlement &amp; Payouts</span>
              </h2>
              <p className="text-xs text-slate-400">
                Server-authoritative ledger with {financialSummary?.settlementHoldDays ?? 7}-day delivery return window &amp; withdrawal tracking ({((financialSummary?.commissionRate ?? 0.05) * 100).toFixed(1)}% platform commission)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadSellerData}
                disabled={loadingLedger}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                title="Refresh Settlement Ledger"
              >
                <RefreshCw className={`w-4 h-4 ${loadingLedger ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                disabled={
                  !isVerified ||
                  (financialSummary?.availableForPayout || 0) < (financialSummary?.minimumPayoutAmount || 20) ||
                  (financialSummary?.activePayoutRequestCount || 0) > 0
                }
                title={!isVerified ? 'Verified KYC status required to request payouts.' : undefined}
                onClick={() => {
                  setPayoutAmount(((financialSummary?.availableForPayout || 0)).toFixed(2));
                  setShowPayoutModal(true);
                }}
                className="px-4 py-2 rounded-xl bg-[#ff6a00] hover:bg-[#e05d00] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs flex items-center gap-1.5 shadow-sm cursor-pointer transition-all"
              >
                <ArrowUpRight className="w-4 h-4" />
                <span>{isVerified ? 'Request Payout' : `Payout Locked (KYC ${effectiveKycStatus})`}</span>
              </button>
            </div>
          </div>

          {/* Honest Provider Limitation Banner */}
          <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex items-start gap-3 text-xs">
            <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-amber-900 dark:text-amber-200 space-y-0.5">
              <div className="font-bold">Sandbox Corporate Batch Settlement Notice</div>
              <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
                {financialSummary?.providerLimitationNotice ||
                  'PAYMENT_ENVIRONMENT=sandbox: Local payment gateways operate as one-way acquiring APIs and do not execute automated sub-merchant split custody. Approved payout requests are recorded for Finance Manager batch settlement and confirmed upon provider reference.'}
              </p>
            </div>
          </div>

          {/* 6 Settlement Summary Metrics */}
          {financialSummary && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
                <span className="text-slate-400 text-[11px]">Total Sales</span>
                <div className="font-extrabold text-base text-slate-900 dark:text-white mt-0.5">
                  ${(financialSummary.totalSales ?? financialSummary.grossSalesMerchandise).toFixed(2)}
                </div>
              </div>
              <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-800/40">
                <span className="text-amber-700 dark:text-amber-400 text-[11px]">Pending Settlement</span>
                <div className="font-extrabold text-base text-amber-600 dark:text-amber-400 mt-0.5">
                  ${(financialSummary.pendingSettlement || 0).toFixed(2)}
                </div>
              </div>
              <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-800/40">
                <span className="text-emerald-700 dark:text-emerald-400 text-[11px]">Available for Payout</span>
                <div className="font-extrabold text-base text-emerald-600 dark:text-emerald-400 mt-0.5">
                  ${(financialSummary.availableForPayout || 0).toFixed(2)}
                </div>
                {(financialSummary.reservedForPayout || 0) > 0 && (
                  <span className="text-[10px] text-blue-500 font-semibold block">
                    +${(financialSummary.reservedForPayout || 0).toFixed(2)} in review
                  </span>
                )}
              </div>
              <div className="p-4 rounded-2xl bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200/80 dark:border-rose-800/40">
                <span className="text-rose-700 dark:text-rose-400 text-[11px]">On Hold (Disputes)</span>
                <div className="font-extrabold text-base text-rose-600 dark:text-rose-400 mt-0.5">
                  ${(financialSummary.onHold || 0).toFixed(2)}
                </div>
              </div>
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
                <span className="text-slate-400 text-[11px]">Total Commission</span>
                <div className="font-extrabold text-base text-rose-500 mt-0.5">
                  -${(financialSummary.totalCommission ?? financialSummary.platformCommissionDeducted).toFixed(2)}
                </div>
              </div>
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
                <span className="text-slate-400 text-[11px]">Total Paid Out</span>
                <div className="font-extrabold text-base text-blue-600 dark:text-blue-400 mt-0.5">
                  ${(financialSummary.totalPaidOut || 0).toFixed(2)}
                </div>
              </div>
            </div>
          )}

          {/* Sub-Tab Toggle */}
          <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 text-xs font-bold">
            <button
              type="button"
              onClick={() => setLedgerSubTab('transactions')}
              className={`px-3 py-2 border-b-2 transition-colors cursor-pointer ${
                ledgerSubTab === 'transactions'
                  ? 'border-[#ff6a00] text-[#ff6a00]'
                  : 'border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              Transaction Ledger ({ledgerEntries.length})
            </button>
            <button
              type="button"
              onClick={() => setLedgerSubTab('payouts')}
              className={`px-3 py-2 border-b-2 transition-colors cursor-pointer ${
                ledgerSubTab === 'payouts'
                  ? 'border-[#ff6a00] text-[#ff6a00]'
                  : 'border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              Payout History ({payoutsList.length})
            </button>
          </div>

          {/* Sub-Tab 1: Transaction Ledger */}
          {ledgerSubTab === 'transactions' && (
            ledgerEntries.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400 space-y-1">
                <FileText className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700" />
                <p>No transaction ledger records found yet.</p>
                <p className="text-[11px]">As customer orders are paid and delivered, settlement statuses appear here.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-semibold">
                      <th className="py-3 px-2">Order Reference</th>
                      <th className="py-3 px-2">Product</th>
                      <th className="py-3 px-2">Settlement Status</th>
                      <th className="py-3 px-2">Eligible Subtotal</th>
                      <th className="py-3 px-2">Commission</th>
                      <th className="py-3 px-2 font-bold text-right">Net Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {ledgerEntries.map((entry) => {
                      const isAdjustment = entry.type !== 'sale';
                      const statusStyle =
                        entry.status === 'available'
                          ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600'
                          : entry.status === 'pending_settlement' || entry.status === 'calculated'
                          ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-600'
                          : entry.status === 'held'
                          ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-600'
                          : entry.status === 'settled'
                          ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500';
                      return (
                        <tr key={entry.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-2 font-mono font-bold text-slate-900 dark:text-white">
                            #{entry.orderId}
                          </td>
                          <td className="py-3 px-2 text-slate-700 dark:text-slate-300">
                            <div>{entry.productName} (x{entry.quantity})</div>
                            {entry.settlementEligibleAt && entry.status === 'pending_settlement' && (
                              <div className="text-[10px] text-amber-600 dark:text-amber-400">
                                Releases after {new Date(entry.settlementEligibleAt).toLocaleDateString()}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-2">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusStyle}`}>
                              {isAdjustment ? entry.type.replace('_', ' ') : (entry.status || 'calculated').replace('_', ' ')}
                            </span>
                          </td>
                          <td className="py-3 px-2 font-mono">${entry.eligibleSubtotal.toFixed(2)}</td>
                          <td className="py-3 px-2 font-mono text-slate-500">${entry.commissionAmount.toFixed(2)}</td>
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
            )
          )}

          {/* Sub-Tab 2: Payout History */}
          {ledgerSubTab === 'payouts' && (
            payoutsList.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400 space-y-2">
                <Wallet className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700" />
                <p>No payout requests submitted yet.</p>
                <p className="text-[11px]">
                  Once delivered orders clear the dispute return window (min ${financialSummary?.minimumPayoutAmount?.toFixed(2) || '20.00'} USD), you can request a payout here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-semibold">
                      <th className="py-3 px-2">Payout ID</th>
                      <th className="py-3 px-2">Amount</th>
                      <th className="py-3 px-2">Destination (Masked)</th>
                      <th className="py-3 px-2">Status</th>
                      <th className="py-3 px-2">Requested</th>
                      <th className="py-3 px-2">Reference / Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {payoutsList.map((p) => {
                      const pStyle =
                        p.status === 'completed'
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                          : p.status === 'approved'
                          ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400'
                          : p.status === 'held'
                          ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-400'
                          : p.status === 'rejected' || p.status === 'failed'
                          ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400'
                          : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400';
                      return (
                        <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-3 px-2 font-mono font-bold text-slate-900 dark:text-white">#{p.id.slice(0, 14)}</td>
                          <td className="py-3 px-2 font-extrabold text-slate-900 dark:text-white">
                            ${p.amount.toFixed(2)} {p.currency}
                          </td>
                          <td className="py-3 px-2">
                            <div className="font-semibold text-slate-700 dark:text-slate-300 uppercase text-[11px]">
                              {p.destination.method.replace('_', ' ')}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {p.destination.accountName} • {p.destination.maskedAccountNumber || p.destination.accountNumber}
                            </div>
                          </td>
                          <td className="py-3 px-2">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${pStyle}`}>
                              {p.status.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="py-3 px-2 text-slate-400 text-[11px]">
                            {new Date(p.requestedAt).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-2 text-[11px]">
                            {p.disbursementReference && (
                              <span className="font-mono text-emerald-600 font-bold">{p.disbursementReference}</span>
                            )}
                            {p.rejectionReason && (
                              <span className="text-rose-500">Rejected: {p.rejectionReason}</span>
                            )}
                            {p.failureReason && (
                              <span className="text-rose-500">Failed: {p.failureReason} (Funds restored)</span>
                            )}
                            {!p.disbursementReference && !p.rejectionReason && !p.failureReason && (
                              <span className="text-slate-400">{p.adminNotes || 'Pending verification'}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      )}

      {/* Request Payout Modal */}
      {showPayoutModal && isVerified && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#ff6a00]/15 text-[#ff6a00] flex items-center justify-center">
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900 dark:text-white">Request Payout</h3>
                  <p className="text-[11px] text-slate-400">
                    Available: ${(financialSummary?.availableForPayout || 0).toFixed(2)} USD (Min $20.00)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPayoutModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRequestPayout} className="space-y-4 text-xs">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Withdrawal Amount (USD) *</label>
                  <button
                    type="button"
                    onClick={() => setPayoutAmount((financialSummary?.availableForPayout || 0).toFixed(2))}
                    className="text-[11px] font-bold text-[#ff6a00] hover:underline cursor-pointer"
                  >
                    Max Available
                  </button>
                </div>
                <input
                  type="number"
                  step="0.01"
                  min="20"
                  max={financialSummary?.availableForPayout || 0}
                  required
                  value={payoutAmount}
                  onChange={(e) => setPayoutAmount(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">Payout Method *</label>
                <select
                  value={payoutMethod}
                  onChange={(e) => setPayoutMethod(e.target.value as PayoutMethod)}
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                >
                  <option value="aba_bank">ABA Bank Transfer</option>
                  <option value="wing_bank">Wing Bank Transfer</option>
                  <option value="bakong_khqr">Bakong KHQR Settlement</option>
                  <option value="crypto_usdt">USDT Stablecoin (Sandbox Batch)</option>
                  <option value="bank_transfer">Other Domestic Bank</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">Account Holder Name *</label>
                <input
                  type="text"
                  required
                  placeholder="Exact legal account holder name"
                  value={payoutAccountName}
                  onChange={(e) => setPayoutAccountName(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              {payoutMethod === 'crypto_usdt' ? (
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Network *</label>
                  <select
                    value={payoutCryptoNetwork}
                    onChange={(e) => setPayoutCryptoNetwork(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  >
                    <option value="TRC20">TRC20</option>
                    <option value="BEP20">BEP20 (BSC)</option>
                    <option value="SOL">Solana</option>
                  </select>
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Bank / Branch Name</label>
                  <input
                    type="text"
                    placeholder="e.g. ABA Bank Phnom Penh"
                    value={payoutBankName}
                    onChange={(e) => setPayoutBankName(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  {payoutMethod === 'crypto_usdt' ? 'Wallet Address *' : 'Account Number *'}
                </label>
                <input
                  type="text"
                  required
                  placeholder={payoutMethod === 'crypto_usdt' ? 'e.g. TXyz...WalletAddress' : 'e.g. 000 123 456'}
                  value={payoutAccountNumber}
                  onChange={(e) => setPayoutAccountNumber(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono"
                />
                <p className="text-[10px] text-slate-400">
                  Masked automatically before storage; full credentials are never exposed in logs or client views.
                </p>
              </div>

              <label className="flex items-start gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={payoutVerifiedConfirmed}
                  onChange={(e) => setPayoutVerifiedConfirmed(e.target.checked)}
                  className="mt-0.5 accent-[#ff6a00]"
                />
                <span className="text-[11px] text-slate-600 dark:text-slate-300">
                  I confirm the payout destination belongs to my verified shop and understand sandbox payouts require Finance Manager approval and provider settlement confirmation.
                </span>
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPayoutModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingPayout}
                  className="px-5 py-2 rounded-xl bg-[#ff6a00] hover:bg-[#e05d00] text-white font-bold cursor-pointer disabled:opacity-50"
                >
                  {submittingPayout ? 'Submitting...' : 'Submit Payout Request'}
                </button>
              </div>
            </form>
          </div>
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
