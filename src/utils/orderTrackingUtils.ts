import { Order, OrderTrackingEvent, SellerShipmentInfo } from '../types';

export interface NormalizedDisplayOrderItem {
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

export interface ShipmentFormDraft {
  carrier: string;
  trackingNumber: string;
  trackingUrl?: string;
  shippedAt?: string;
  notes?: string;
}

const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]/;
const TRACKING_NUMBER_RE = /^[A-Za-z0-9._\-\/ ]+$/;

export const COMMON_SHIPPING_CARRIERS = [
  'DHL Express',
  'FedEx',
  'J&T Express',
  'Virak Buntham Express',
  'Cambodia Post',
  'VET Air Express',
  'GrabExpress',
  'UPS',
];

export function isValidSafeTrackingUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 500 || CONTROL_CHARS_RE.test(trimmed) || /\s/.test(trimmed)) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

export function validateShipmentFormInput(draft: ShipmentFormDraft): string | null {
  const carrier = (draft.carrier || '').trim();
  if (carrier.length < 2 || carrier.length > 80 || CONTROL_CHARS_RE.test(carrier)) {
    return 'Carrier name must be between 2 and 80 characters.';
  }

  const trackingNumber = (draft.trackingNumber || '').trim();
  const alnumCount = (trackingNumber.match(/[A-Za-z0-9]/g) || []).length;
  if (
    trackingNumber.length < 3 ||
    trackingNumber.length > 100 ||
    CONTROL_CHARS_RE.test(trackingNumber) ||
    !TRACKING_NUMBER_RE.test(trackingNumber) ||
    alnumCount < 3
  ) {
    return 'Tracking number must be 3–100 characters (letters, numbers, -, _, /, .).';
  }

  if (draft.trackingUrl && draft.trackingUrl.trim() !== '') {
    if (!isValidSafeTrackingUrl(draft.trackingUrl)) {
      return 'Tracking URL must be a valid http:// or https:// web link.';
    }
  }

  if (draft.shippedAt && draft.shippedAt.trim() !== '') {
    const ts = Date.parse(draft.shippedAt.trim());
    if (isNaN(ts) || ts < Date.UTC(2020, 0, 1) || ts > Date.now() + 7 * 24 * 60 * 60 * 1000) {
      return 'Shipped date must be a valid recent date.';
    }
  }

  if (draft.notes && draft.notes.trim().length > 500) {
    return 'Shipping notes cannot exceed 500 characters.';
  }

  return null;
}

export function normalizeOrderItemsForDisplay(order: Order): NormalizedDisplayOrderItem[] {
  const rawItems: any[] = Array.isArray(order?.items) ? order.items : [];
  return rawItems.map((it: any) => {
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
}

/**
 * Checks whether a tracking number represents real merchant/platform tracking
 * (filtering out empty strings or legacy pre-shipment placeholders).
 */
export function hasProvidedTrackingNumber(trackingNumber?: string): boolean {
  const clean = (trackingNumber || '').trim();
  if (!clean) return false;
  if (clean === 'APAI-TRACK-PENDING') return false;
  return true;
}

/**
 * Resolves customer-visible shipment entries cleanly across single-seller and multi-vendor orders.
 */
export function getCustomerOrderShipments(order: Order): SellerShipmentInfo[] {
  if (order.sellerShipments && typeof order.sellerShipments === 'object') {
    const values = Object.values(order.sellerShipments).filter(
      (sh) => sh && hasProvidedTrackingNumber(sh.trackingNumber)
    );
    if (values.length > 0) {
      return values;
    }
  }

  if (hasProvidedTrackingNumber(order.trackingNumber)) {
    return [
      {
        sellerId: 'primary',
        sellerStoreName: 'Marketplace Seller',
        carrier: order.carrier || 'Carrier',
        trackingNumber: order.trackingNumber,
        trackingUrl: order.trackingUrl && isValidSafeTrackingUrl(order.trackingUrl) ? order.trackingUrl : undefined,
        shippedAt: order.shippedAt || order.updatedAt || order.createdAt || '',
        status:
          order.status === 'Delivered' || order.status === 'Out for Delivery'
            ? 'Delivered'
            : order.status === 'Cancelled'
            ? 'Cancelled'
            : order.status === 'Shipped'
            ? 'Shipped'
            : 'Processing',
        source: order.trackingSource || 'seller_manual',
        updatedAt: order.updatedAt || order.createdAt || '',
      },
    ];
  }

  return [];
}

/**
 * Resolves only the authenticated seller's own shipment entry on an order.
 */
export function getSellerOwnShipment(order: Order, sellerUid?: string): SellerShipmentInfo | null {
  if (order.sellerShipments && sellerUid && order.sellerShipments[sellerUid]) {
    return order.sellerShipments[sellerUid];
  }
  const items = normalizeOrderItemsForDisplay(order);
  const distinctSellers = new Set(items.map((i) => i.sellerId).filter(Boolean));
  const isSingleSeller = distinctSellers.size <= 1 && (!sellerUid || distinctSellers.size === 0 || distinctSellers.has(sellerUid));

  if (isSingleSeller && hasProvidedTrackingNumber(order.trackingNumber)) {
    return {
      sellerId: sellerUid || 'primary',
      carrier: order.carrier || '',
      trackingNumber: order.trackingNumber,
      trackingUrl: order.trackingUrl && isValidSafeTrackingUrl(order.trackingUrl) ? order.trackingUrl : undefined,
      shippedAt: order.shippedAt || order.updatedAt || '',
      status:
        order.status === 'Delivered' || order.status === 'Out for Delivery'
          ? 'Delivered'
          : order.status === 'Cancelled'
          ? 'Cancelled'
          : order.status === 'Shipped'
          ? 'Shipped'
          : 'Processing',
      source: order.trackingSource || 'seller_manual',
      updatedAt: order.updatedAt || '',
    };
  }

  return null;
}

export function getSortedTrackingHistory(order: Order): OrderTrackingEvent[] {
  if (!Array.isArray(order.trackingHistory)) return [];
  return [...order.trackingHistory].sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );
}

export async function copyTextSafely(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
