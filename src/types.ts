export interface Product {
  id: string;
  name: string;
  slug: string;
  category: string;
  categoryId?: string;
  subcategory?: string;
  brand: string;
  image: string;
  secondaryImage?: string;
  gallery?: string[];
  price: number;
  originalPrice: number;
  compareAtPrice?: number;
  discountPercentage: number;
  currency?: string;
  rating: number;
  reviewCount: number;
  sellerId?: string;
  seller: {
    id?: string;
    name: string;
    verified: boolean;
    rating: number;
    badge?: string;
  };
  inStock: boolean;
  stock?: number;
  stockCount?: number;
  sku?: string;
  barcode?: string;
  isFlashSale?: boolean;
  isTrending?: boolean;
  isRecommended?: boolean;
  isBestSeller?: boolean;
  isNewArrival?: boolean;
  isTopRated?: boolean;
  description: string;
  titleLocalized?: Record<string, string>;
  descriptionLocalized?: Record<string, string>;
  features: string[];
  specifications?: Record<string, string>;
  variants?: Array<{
    id: string;
    name: string;
    price?: number;
    stock?: number;
  }>;
  tags: string[];
  colors?: { name: string; hex: string }[];
  sizes?: string[];
  status?: 'active' | 'draft' | 'archived';
  createdAt?: string;
  updatedAt?: string;
}

export interface CategoryItem {
  id: string;
  name: string;
  namesLocalized?: Record<string, string>;
  slug: string;
  iconName: string;
  image: string;
  productCount: number;
  featured?: boolean;
  description?: string;
  parentId?: string | null;
  sortOrder?: number;
  active?: boolean;
}

export interface CartItem {
  product: Product;
  quantity: number;
  selectedColor?: string;
  selectedSize?: string;
}

export interface ReviewItem {
  id: string;
  productId?: string;
  userId?: string;
  userName: string;
  avatar: string;
  rating: number;
  date: string;
  comment: string;
  verifiedPurchase: boolean;
  productName?: string;
  helpfulCount: number;
  orderId?: string;
  status?: 'published' | 'pending' | 'rejected';
  createdAt?: string;
}

export interface VideoGalleryItem {
  id: string;
  title: string;
  creator: string;
  creatorAvatar: string;
  thumbnail: string;
  videoUrl: string;
  verified: boolean;
  views: string;
  duration: string;
  featuredProduct: Product;
}

export interface DealItem {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  bgGradient: string;
  iconName: string;
  image?: string;
  discount: string;
  actionText: string;
  categoryFilter?: string;
}

export interface BrandItem {
  id: string;
  name: string;
  logo: string;
  itemCount: number;
  isTopTier?: boolean;
}

export interface Order {
  id: string;
  customerUid?: string;
  userId?: string;
  customerEmail?: string;
  date: string;
  items: CartItem[];
  total: number;
  subtotal: number;
  shipping: number;
  shippingFee?: number;
  discount: number;
  currency?: string;
  paymentStatus?: 'pending' | 'paid' | 'failed' | 'refunded' | 'expired' | 'partially_paid';
  orderStatus?: 'Order Placed' | 'Processing' | 'Shipped' | 'Out for Delivery' | 'Delivered' | 'Cancelled';
  status: 'Order Placed' | 'Processing' | 'Shipped' | 'Out for Delivery' | 'Delivered' | 'Cancelled';
  trackingNumber: string;
  carrier: string;
  estimatedDelivery: string;
  paymentMethod?: string;
  cryptoCurrency?: string;
  cryptoNetwork?: string;
  cryptoAmount?: number;
  confirmedAmount?: number;
  providerInvoiceId?: string;
  transactionReference?: string;
  payAddress?: string;
  confirmedAt?: string;
  cryptoPayment?: any;
  shippingAddress: {
    name: string;
    street: string;
    city: string;
    state?: string;
    postalCode?: string;
    country: string;
    phone: string;
    provinceCity?: string;
    district?: string;
    deliveryNotes?: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface UserProfile {
  uid?: string;
  name: string;
  displayName?: string;
  email: string;
  avatar: string;
  photoURL?: string;
  phone?: string;
  role?: 'customer' | 'seller' | 'admin';
  preferredLanguage?: string;
  tier: 'Standard' | 'Silver' | 'Gold' | 'VIP Diamond';
  apaibayPoints: number;
  savedAddresses: number;
  savedCards: number;
  status?: 'active' | 'suspended' | 'pending';
  createdAt?: string;
  updatedAt?: string;
}

export interface Seller {
  sellerId: string;
  ownerUid: string;
  storeName: string;
  ownerName?: string;
  descriptionLocalized?: Record<string, string>;
  description?: string;
  logo: string;
  verificationStatus: 'verified' | 'approved' | 'pending' | 'under_review' | 'rejected' | 'suspended' | 'expired' | 'draft';
  kycStatus?: KycVerificationStatus;
  kycExpiresAt?: string;
  phoneVerificationStatus?: KycSubStatus;
  identityVerificationStatus?: KycSubStatus;
  payoutOwnershipVerificationStatus?: KycSubStatus;
  kycActionRequiredMessage?: string;
  businessCountry?: string;
  businessAddress?: string;
  productCategories?: string[];
  businessType?: 'individual' | 'registered_business' | 'enterprise';
  websiteUrl?: string;
  documents?: string[];
  submittedAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  rejectionReason?: string;
  commissionRate?: number;
  payoutStatus?: 'unavailable' | 'not_configured';
  contactInfo?: {
    email?: string;
    phone?: string;
    address?: string;
  };
  rating: number;
  fulfillmentRate?: number;
  activeListings?: number;
  gmv?: number;
  createdAt?: string;
  updatedAt?: string;
}

export type SellerLedgerStatus =
  | 'calculated'
  | 'pending_settlement'
  | 'held'
  | 'available'
  | 'payout_requested'
  | 'settled'
  | 'cancelled';

export interface SellerLedgerEntry {
  id: string;
  orderId: string;
  sellerId: string;
  productId: string;
  productName: string;
  quantity: number;
  currency: string;
  eligibleSubtotal: number;
  eligibleSubtotalCents: number;
  commissionRate: number;
  commissionAmount: number;
  commissionAmountCents: number;
  netAmount: number;
  netAmountCents: number;
  refundedCents?: number;
  type: 'sale' | 'refund_adjustment' | 'cancellation_adjustment';
  status: SellerLedgerStatus;
  payoutStatus: 'unavailable' | 'not_configured' | 'pending' | 'available' | 'held' | 'paid_out';
  isPlatformOwned: boolean;
  relatedLedgerId?: string;
  deliveredAt?: string;
  settlementEligibleAt?: string;
  settledAt?: string;
  disputeHoldId?: string;
  payoutId?: string;
  createdAt: string;
}

export interface SellerFinancialSummary {
  sellerId: string;
  grossSalesMerchandise: number;
  platformCommissionDeducted: number;
  refundAdjustments: number;
  netCalculatedEarnings: number;
  totalSales?: number;
  totalCommission?: number;
  pendingSettlement?: number;
  availableForPayout?: number;
  reservedForPayout?: number;
  onHold?: number;
  totalPaidOut?: number;
  settlementHoldDays?: number;
  commissionRate?: number;
  minimumPayoutAmount?: number;
  currency?: string;
  activePayoutRequestCount?: number;
  providerLimitationNotice?: string;
  payoutStatus: 'unavailable' | 'not_configured' | 'available' | 'pending_settlement' | 'on_hold';
  payoutStatusMessage: string;
  totalTransactions: number;
}

export type PayoutStatus =
  | 'pending'
  | 'under_review'
  | 'held'
  | 'approved'
  | 'completed'
  | 'rejected'
  | 'failed';

export type PayoutMethod = 'aba_bank' | 'wing_bank' | 'bakong_khqr' | 'crypto_usdt' | 'bank_transfer';

export interface PayoutDestination {
  method: PayoutMethod;
  accountName: string;
  accountNumber: string;
  maskedAccountNumber?: string;
  bankName?: string;
  cryptoNetwork?: string;
  verifiedConfirmed?: boolean;
}

export interface SellerPayoutRequest {
  id: string;
  sellerId: string;
  sellerStoreName: string;
  ownerUid: string;
  ownerEmail: string;
  amount: number;
  amountCents: number;
  currency: string;
  destination: PayoutDestination;
  status: PayoutStatus;
  rejectionReason?: string;
  failureReason?: string;
  adminNotes?: string;
  disbursementReference?: string;
  requestedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  providerConfirmedBy?: string;
  providerConfirmedAt?: string;
  completedAt?: string;
  updatedAt: string;
}

export interface Address {
  id: string;
  uid: string;
  fullName: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
  isDefault?: boolean;
  type?: 'shipping' | 'billing';
  createdAt?: string;
}

export interface Coupon {
  id: string;
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  minOrderAmount?: number;
  maxDiscount?: number;
  expiresAt?: string;
  active: boolean;
}

export interface NotificationItem {
  id: string;
  userId: string;
  type: 'order' | 'seller' | 'security' | 'promo';
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  link?: string;
}

export interface AdminNotification {
  id: string;
  type: 'seller_application' | 'compliance_alert' | 'system_notice';
  title: string;
  message: string;
  applicantUid: string;
  applicantName: string;
  shopName: string;
  read: boolean;
  createdAt: string;
  link?: string;
}

export * from './types/payment';

export type CanonicalRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'FINANCE_MANAGER'
  | 'SUPPORT_STAFF'
  | 'SELLER'
  | 'CUSTOMER';

export interface AdminRoleUser {
  uid: string;
  email: string;
  displayName?: string;
  role: CanonicalRole;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isFinanceManager: boolean;
  isSupportStaff: boolean;
  isSeller: boolean;
  isCustomer: boolean;
  sellerId?: string;
  accountStatus: 'active' | 'suspended' | 'pending';
  createdAt?: string;
  updatedAt?: string;
  lastLoginAt?: string;
}

export type DisputeStatus =
  | 'open'
  | 'under_review'
  | 'resolved_refunded'
  | 'resolved_rejected'
  | 'closed';

export type DisputeReason =
  | 'item_not_received'
  | 'damaged_or_defective'
  | 'significantly_not_as_described'
  | 'duplicate_or_incorrect_charge'
  | 'cancelled_order_unrefunded'
  | 'other';

export interface OrderDispute {
  id: string;
  orderId: string;
  paymentId?: string;
  customerUid: string;
  customerEmail: string;
  sellerId?: string;
  reason: DisputeReason;
  reasonText?: string;
  description: string;
  evidenceUrls?: string[];
  disputedAmount: number;
  currency: string;
  status: DisputeStatus;
  refundStatus: 'none' | 'pending' | 'refunded' | 'rejected';
  refundAmount?: number;
  refundReference?: string;
  adminNotes?: string;
  rejectionReason?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminAuditLog {
  id: string;
  adminUid: string;
  adminEmail: string;
  adminRole: string;
  action: string;
  targetResourceId: string;
  targetResourceType: 'user' | 'seller' | 'product' | 'order' | 'dispute' | 'payment' | 'role' | 'setting';
  previousValue?: any;
  newValue?: any;
  metadata?: Record<string, any>;
  result: 'success' | 'failure';
  ipAddress?: string;
  userAgent?: string;
  timestamp: string;
}

export interface SystemHealthReport {
  overallStatus: 'healthy' | 'degraded' | 'unavailable';
  timestamp: string;
  server: {
    service: string;
    status: 'healthy' | 'degraded' | 'unavailable';
    uptimeSeconds: number;
    uptimeFormatted: string;
    memoryUsageMb: number;
    environment: string;
    nodeVersion: string;
  };
  firestore: {
    status: 'healthy' | 'degraded' | 'unavailable' | 'unknown';
    latencyMs: number;
    probeSuccessful: boolean;
    error?: string;
  };
  auth: {
    status: 'configured' | 'unavailable';
    bootstrapAdminConfigured: boolean;
    bootstrapAdminEmail: string;
  };
  paymentGateways: {
    environment: string;
    isProduction: boolean;
    safetyGateActive: boolean;
    valid: boolean;
    activeCount: number;
    configuredCount: number;
    providers: Array<{
      provider: string;
      name: string;
      status: 'configured' | 'mock_simulation' | 'sandbox_stub' | 'missing_credentials';
      readinessStatus: string;
      isConfigured: boolean;
    }>;
  };
  webhookProcessing: {
    status: 'healthy' | 'degraded' | 'unavailable';
    message: string;
  };
  recentErrors: Array<{
    timestamp: string;
    message: string;
    context?: string;
  }>;
}

export type KycVerificationStatus =
  | 'NOT_SUBMITTED'
  | 'PENDING_REVIEW'
  | 'UNDER_REVIEW'
  | 'VERIFIED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'SUSPENDED';

export type KycSubStatus = 'unverified' | 'pending' | 'verified' | 'rejected';

export type IdentityDocumentType =
  | 'national_id'
  | 'passport'
  | 'drivers_license'
  | 'business_registration';

export interface KycDocumentRecord {
  docId: string;
  documentType: IdentityDocumentType;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  maskedDocumentNumber?: string;
  storagePath: string;
  uploadedAt: string;
  uploadedByUid: string;
  status: 'active' | 'superseded' | 'purged';
  retentionUntil: string;
}

export interface KycHistoryEvent {
  eventId: string;
  sellerId: string;
  action:
    | 'SUBMITTED'
    | 'RESUBMITTED'
    | 'DOCUMENT_UPLOADED'
    | 'DOCUMENT_ACCESSED'
    | 'UNDER_REVIEW'
    | 'INFO_REQUESTED'
    | 'APPROVED'
    | 'REJECTED'
    | 'SUSPENDED'
    | 'EXPIRED'
    | 'RETENTION_PURGED';
  previousStatus?: KycVerificationStatus;
  newStatus: KycVerificationStatus;
  actorUid: string;
  actorEmail?: string;
  actorRole?: string;
  notes?: string;
  timestamp: string;
}

export interface SellerKycRecord {
  sellerId: string;
  ownerUid: string;
  profileType: 'individual' | 'registered_business' | 'enterprise';
  legalFullName: string;
  shopName: string;
  countryOfRegistration: string;
  residentialOrBusinessAddress: string;
  contactEmail?: string;
  maskedPhone?: string;
  phoneVerificationStatus: KycSubStatus;
  identityDocumentType: IdentityDocumentType;
  maskedDocumentNumber?: string;
  identityVerificationStatus: KycSubStatus;
  payoutOwnershipVerificationStatus: KycSubStatus;
  kycStatus: KycVerificationStatus;
  legacyVerificationStatus: Seller['verificationStatus'];
  submittedAt?: string;
  reviewedAt?: string;
  reviewedByUid?: string;
  reviewedByEmail?: string;
  rejectionReason?: string;
  actionRequiredMessage?: string;
  verifiedAt?: string;
  kycExpiresAt?: string;
  suspendedReason?: string;
  documents: KycDocumentRecord[];
  legacyDocumentRefs?: string[];
  privacyNoticeAcceptedAt?: string;
  retentionPolicyDays: number;
  createdAt: string;
  updatedAt: string;
}
