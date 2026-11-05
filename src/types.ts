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
  date: string;
  items: CartItem[];
  total: number;
  subtotal: number;
  shipping: number;
  shippingFee?: number;
  discount: number;
  currency?: string;
  paymentStatus?: 'pending' | 'paid' | 'failed' | 'refunded';
  orderStatus?: 'Order Placed' | 'Processing' | 'Shipped' | 'Out for Delivery' | 'Delivered';
  status: 'Order Placed' | 'Processing' | 'Shipped' | 'Out for Delivery' | 'Delivered';
  trackingNumber: string;
  carrier: string;
  estimatedDelivery: string;
  shippingAddress: {
    name: string;
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    phone: string;
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
  descriptionLocalized?: Record<string, string>;
  description?: string;
  logo: string;
  verificationStatus: 'verified' | 'pending' | 'rejected' | 'suspended';
  businessCountry?: string;
  businessType?: 'individual' | 'registered_business' | 'enterprise';
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
  type: 'sale' | 'refund_adjustment' | 'cancellation_adjustment';
  status: 'calculated' | 'held' | 'settled';
  payoutStatus: 'unavailable' | 'not_configured';
  isPlatformOwned: boolean;
  relatedLedgerId?: string;
  createdAt: string;
}

export interface SellerFinancialSummary {
  sellerId: string;
  grossSalesMerchandise: number;
  platformCommissionDeducted: number;
  refundAdjustments: number;
  netCalculatedEarnings: number;
  payoutStatus: 'unavailable' | 'not_configured';
  payoutStatusMessage: string;
  totalTransactions: number;
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

export * from './types/payment';
