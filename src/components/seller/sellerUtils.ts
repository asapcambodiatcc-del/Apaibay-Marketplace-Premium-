import { Order, Product, SellerLedgerEntry, SellerFinancialSummary } from '../../types';

export type AnalyticsWindow = '7d' | '30d' | 'all';

export type CanonicalDisplayOrderStatus =
  | 'Placed'
  | 'Processing'
  | 'Shipped'
  | 'Delivered'
  | 'Cancelled';

export interface NormalizedSellerOrderItem {
  productId: string;
  name: string;
  sku?: string;
  image?: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  selectedColor?: string | null;
  selectedSize?: string | null;
  sellerId?: string;
}

export function normalizeDisplayOrderStatus(rawStatus?: string): CanonicalDisplayOrderStatus {
  const clean = (rawStatus || '').trim();
  if (clean === 'Processing') return 'Processing';
  if (clean === 'Shipped') return 'Shipped';
  if (clean === 'Out for Delivery' || clean === 'Delivered') return 'Delivered';
  if (clean === 'Cancelled' || clean === 'Canceled') return 'Cancelled';
  return 'Placed';
}

export function getSellerOrderItems(order: Order, sellerUid?: string): NormalizedSellerOrderItem[] {
  const rawItems: any[] = Array.isArray(order.items) ? order.items : [];
  const normalized: NormalizedSellerOrderItem[] = rawItems.map((it: any) => {
    const prod = it?.product;
    const productId = String(it?.productId || prod?.id || '');
    const name = String(it?.name || prod?.name || 'Marketplace Product');
    const unitPrice = Number(it?.unitPrice ?? prod?.price ?? 0);
    const quantity = Math.max(1, Number(it?.quantity ?? 1));
    const subtotal =
      typeof it?.subtotal === 'number'
        ? it.subtotal
        : parseFloat((unitPrice * quantity).toFixed(2));
    const sellerId = it?.sellerId || prod?.sellerId || prod?.seller?.id;
    return {
      productId,
      name,
      sku: it?.sku || prod?.sku,
      image: it?.image || prod?.image,
      unitPrice,
      quantity,
      subtotal,
      selectedColor: it?.selectedColor || null,
      selectedSize: it?.selectedSize || null,
      sellerId,
    };
  });

  if (!sellerUid) return normalized;
  const owned = normalized.filter((item) => !item.sellerId || item.sellerId === sellerUid);
  return owned.length > 0 ? owned : normalized;
}

export function getProductStockCount(product: Product): number {
  if (typeof product.stock === 'number' && !isNaN(product.stock)) return Math.max(0, product.stock);
  if (typeof product.stockCount === 'number' && !isNaN(product.stockCount)) {
    return Math.max(0, product.stockCount);
  }
  return product.inStock === false ? 0 : 25;
}

export type DisplayProductStatus = 'active' | 'draft' | 'out_of_stock' | 'archived';

export function getDisplayProductStatus(product: Product): DisplayProductStatus {
  if (product.status === 'archived') return 'archived';
  if (product.status === 'draft') return 'draft';
  const stock = getProductStockCount(product);
  if (stock <= 0 || product.inStock === false) return 'out_of_stock';
  return 'active';
}

export function isValidHttpImageUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 1000) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export interface ProductFormDraft {
  name: string;
  price: string;
  originalPrice?: string;
  category: string;
  brand?: string;
  sku?: string;
  stock: string;
  image: string;
  secondaryImage?: string;
  galleryUrls?: string[];
  description?: string;
  features?: string[];
  tags?: string[];
  status: 'active' | 'draft';
}

export function validateProductFormInput(draft: ProductFormDraft): string | null {
  const name = draft.name.trim();
  if (name.length < 2 || name.length > 200) {
    return 'Product title must be between 2 and 200 characters.';
  }

  const price = Number(draft.price);
  if (!draft.price.trim() || !Number.isFinite(price) || price < 0.01 || price > 1_000_000) {
    return 'Sale price must be between $0.01 and $1,000,000.';
  }

  if (draft.originalPrice && draft.originalPrice.trim() !== '') {
    const orig = Number(draft.originalPrice);
    if (!Number.isFinite(orig) || orig < price || orig > 1_000_000) {
      return 'Original price must be greater than or equal to the sale price.';
    }
  }

  const stock = Number(draft.stock);
  if (!draft.stock.trim() || !Number.isInteger(stock) || stock < 0 || stock > 1_000_000) {
    return 'Stock must be a whole number (0 or greater).';
  }

  if (!draft.category.trim() || draft.category.trim().length > 80) {
    return 'Please select a valid product category.';
  }

  if (draft.brand && draft.brand.trim().length > 100) {
    return 'Brand name cannot exceed 100 characters.';
  }

  if (draft.sku && draft.sku.trim().length > 64) {
    return 'SKU cannot exceed 64 characters.';
  }

  if (draft.image.trim() && !isValidHttpImageUrl(draft.image)) {
    return 'Primary image URL must start with http:// or https://.';
  }

  if (draft.secondaryImage && draft.secondaryImage.trim() && !isValidHttpImageUrl(draft.secondaryImage)) {
    return 'Secondary image URL must start with http:// or https://.';
  }

  if (draft.galleryUrls) {
    if (draft.galleryUrls.length > 8) {
      return 'Additional gallery cannot exceed 8 image URLs.';
    }
    for (const url of draft.galleryUrls) {
      if (!isValidHttpImageUrl(url)) {
        return 'All gallery image URLs must start with http:// or https://.';
      }
    }
  }

  if (draft.description && draft.description.trim().length > 4000) {
    return 'Description cannot exceed 4,000 characters.';
  }

  if (draft.features && draft.features.length > 12) {
    return 'Key features cannot exceed 12 bullet points.';
  }

  if (draft.tags && draft.tags.length > 15) {
    return 'Tags cannot exceed 15 items.';
  }

  return null;
}

export interface InventoryHealthStats {
  totalProducts: number;
  inStockCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  draftCount: number;
  archivedCount: number;
  totalUnits: number;
  lowOrOutProducts: Product[];
}

export function computeInventoryHealth(products: Product[]): InventoryHealthStats {
  let inStockCount = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;
  let draftCount = 0;
  let archivedCount = 0;
  let totalUnits = 0;
  const lowOrOutProducts: Product[] = [];

  for (const prod of products) {
    if (prod.status === 'archived') {
      archivedCount++;
      continue;
    }
    if (prod.status === 'draft') {
      draftCount++;
    }

    const stock = getProductStockCount(prod);
    totalUnits += stock;
    if (stock <= 0) {
      outOfStockCount++;
      if (prod.status !== 'draft') {
        lowOrOutProducts.push(prod);
      }
    } else if (stock <= 5) {
      lowStockCount++;
      inStockCount++;
      if (prod.status !== 'draft') {
        lowOrOutProducts.push(prod);
      }
    } else {
      inStockCount++;
    }
  }

  lowOrOutProducts.sort((a, b) => getProductStockCount(a) - getProductStockCount(b));

  return {
    totalProducts: products.length - archivedCount,
    inStockCount,
    lowStockCount,
    outOfStockCount,
    draftCount,
    archivedCount,
    totalUnits,
    lowOrOutProducts,
  };
}

export interface PeriodSalesMetrics {
  grossSales: number;
  commission: number;
  netEarnings: number;
  refundAdjustments: number;
  orderCount: number;
  unitsSold: number;
  averageOrderValue: number;
  deliveredOrderCount: number;
  fulfillmentRate: number;
  pendingActionOrdersCount: number;
  statusBreakdown: Record<CanonicalDisplayOrderStatus, number>;
  recentDailySeries: Array<{ label: string; isoDay: string; grossSales: number; netEarnings: number; count: number }>;
  nextPendingReleaseAt: string | null;
}

export function computePeriodSalesMetrics(
  entries: SellerLedgerEntry[],
  orders: Order[],
  sellerUid: string | undefined,
  window: AnalyticsWindow,
  summary: SellerFinancialSummary | null
): PeriodSalesMetrics {
  const nowMs = Date.now();
  const cutoffMs =
    window === '7d'
      ? nowMs - 7 * 86400000
      : window === '30d'
      ? nowMs - 30 * 86400000
      : 0;

  const filteredEntries = entries.filter((e) => {
    if (cutoffMs === 0) return true;
    const ts = new Date(e.createdAt).getTime();
    return !isNaN(ts) && ts >= cutoffMs;
  });

  const filteredOrders = orders.filter((o) => {
    if (cutoffMs === 0) return true;
    const rawDate = o.createdAt || o.date;
    const ts = new Date(rawDate).getTime();
    return !isNaN(ts) && ts >= cutoffMs;
  });

  let grossSales = 0;
  let commission = 0;
  let netEarnings = 0;
  let refundAdjustments = 0;
  let unitsSold = 0;

  for (const e of filteredEntries) {
    if (e.type === 'sale') {
      if (e.status !== 'cancelled') {
        grossSales += e.eligibleSubtotal || 0;
        commission += e.commissionAmount || 0;
        netEarnings += e.netAmount || 0;
        unitsSold += e.quantity || 0;
      }
    } else {
      refundAdjustments += Math.abs(e.eligibleSubtotal || 0);
      commission += e.commissionAmount || 0;
      netEarnings += e.netAmount || 0;
    }
  }

  // Fallback to authoritative summary for 'all' when ledger summary exists
  if (window === 'all' && summary) {
    grossSales = summary.grossSalesMerchandise;
    commission = summary.platformCommissionDeducted;
    netEarnings = summary.netCalculatedEarnings;
    refundAdjustments = summary.refundAdjustments;
  }

  const statusBreakdown: Record<CanonicalDisplayOrderStatus, number> = {
    Placed: 0,
    Processing: 0,
    Shipped: 0,
    Delivered: 0,
    Cancelled: 0,
  };

  let orderGrossFallback = 0;
  let orderUnitsFallback = 0;

  for (const ord of filteredOrders) {
    const st = normalizeDisplayOrderStatus(ord.orderStatus || ord.status);
    statusBreakdown[st]++;
    if (st !== 'Cancelled') {
      const sellerItems = getSellerOrderItems(ord, sellerUid);
      for (const item of sellerItems) {
        orderGrossFallback += item.subtotal;
        orderUnitsFallback += item.quantity;
      }
    }
  }

  if (grossSales === 0 && filteredEntries.length === 0 && orderGrossFallback > 0) {
    grossSales = parseFloat(orderGrossFallback.toFixed(2));
    const rate = summary?.commissionRate ?? 0.05;
    commission = parseFloat((grossSales * rate).toFixed(2));
    netEarnings = parseFloat((grossSales - commission).toFixed(2));
    unitsSold = orderUnitsFallback;
  }

  const nonCancelledOrders = Math.max(0, filteredOrders.length - statusBreakdown.Cancelled);
  const deliveredOrderCount = statusBreakdown.Delivered;
  const fulfillmentRate =
    nonCancelledOrders > 0 ? Math.round((deliveredOrderCount / nonCancelledOrders) * 100) : 0;

  const orderCount = filteredOrders.length > 0 ? filteredOrders.length : new Set(filteredEntries.map((e) => e.orderId)).size;
  const averageOrderValue = orderCount > 0 ? parseFloat((grossSales / orderCount).toFixed(2)) : 0;

  const pendingActionOrdersCount = statusBreakdown.Placed + statusBreakdown.Processing;

  // Compute earliest pending settlement release timestamp across all entries
  let nextPendingReleaseAt: string | null = null;
  for (const e of entries) {
    if (e.type === 'sale' && e.status === 'pending_settlement' && e.settlementEligibleAt) {
      if (!nextPendingReleaseAt || new Date(e.settlementEligibleAt).getTime() < new Date(nextPendingReleaseAt).getTime()) {
        nextPendingReleaseAt = e.settlementEligibleAt;
      }
    }
  }

  // Group real ledger sale entries by day (up to last 7 active days in window)
  const dayBuckets = new Map<string, { grossSales: number; netEarnings: number; count: number }>();
  for (const e of filteredEntries) {
    if (e.type !== 'sale' || e.status === 'cancelled') continue;
    const dt = new Date(e.createdAt);
    if (isNaN(dt.getTime())) continue;
    const isoDay = dt.toISOString().slice(0, 10);
    const existing = dayBuckets.get(isoDay) || { grossSales: 0, netEarnings: 0, count: 0 };
    existing.grossSales += e.eligibleSubtotal || 0;
    existing.netEarnings += e.netAmount || 0;
    existing.count += 1;
    dayBuckets.set(isoDay, existing);
  }

  const recentDailySeries = Array.from(dayBuckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-7)
    .map(([isoDay, data]) => ({
      isoDay,
      label: new Date(`${isoDay}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
      grossSales: parseFloat(data.grossSales.toFixed(2)),
      netEarnings: parseFloat(data.netEarnings.toFixed(2)),
      count: data.count,
    }));

  return {
    grossSales: parseFloat(grossSales.toFixed(2)),
    commission: parseFloat(commission.toFixed(2)),
    netEarnings: parseFloat(netEarnings.toFixed(2)),
    refundAdjustments: parseFloat(refundAdjustments.toFixed(2)),
    orderCount,
    unitsSold,
    averageOrderValue,
    deliveredOrderCount,
    fulfillmentRate,
    pendingActionOrdersCount,
    statusBreakdown,
    recentDailySeries,
    nextPendingReleaseAt,
  };
}
