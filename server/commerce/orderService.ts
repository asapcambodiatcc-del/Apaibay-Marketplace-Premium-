import {
  db,
  doc,
  getDoc,
  runTransaction,
} from '../repositories/serverFirestore';
import { ServerProductRepository } from '../repositories/serverProductRepository';
import { calculateAuthoritativeShipping } from './shippingService';
import { validateAuthoritativeCoupon } from './couponService';
import { AuthenticatedUser } from '../auth/roles';
import { CreateOrderRequest, OrderItemInput } from '../validation/orderValidation';
import { Product } from '../../src/types';
import { SellerLedgerService } from './sellerLedgerService';

export class CommerceError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400,
    public details?: any
  ) {
    super(message);
    this.name = 'CommerceError';
  }
}

export interface OrderItemSnapshot {
  productId: string;
  name: string;
  sku: string;
  image: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  selectedColor?: string;
  selectedSize?: string;
  sellerId: string;
}

export interface AuthoritativeQuote {
  items: Array<{
    productId: string;
    name: string;
    unitPrice: number;
    quantity: number;
    subtotal: number;
  }>;
  subtotal: number;
  shippingFee: number;
  shippingOption: string;
  carrier: string;
  estimatedDelivery: string;
  discount: number;
  couponCode?: string;
  total: number;
}

export class OrderService {
  /**
   * Generates a fully authoritative pricing quote server-side.
   */
  static async calculateQuote(
    items: OrderItemInput[],
    shippingOption: string = 'standard',
    couponCode?: string
  ): Promise<AuthoritativeQuote> {
    if (!items || items.length === 0) {
      throw new CommerceError('EMPTY_CART', 'Cart contains no items to quote.', 400);
    }

    let subtotal = 0;
    const quotedItems: AuthoritativeQuote['items'] = [];

    for (const item of items) {
      const product = await ServerProductRepository.getCanonicalProduct(item.productId);
      if (!product) {
        throw new CommerceError('PRODUCT_NOT_FOUND', `Product '${item.productId}' not found in canonical catalogue.`, 404);
      }

      const unitPrice = parseFloat(product.price.toFixed(2));
      const itemSubtotal = parseFloat((unitPrice * item.quantity).toFixed(2));

      quotedItems.push({
        productId: product.id,
        name: product.name,
        unitPrice,
        quantity: item.quantity,
        subtotal: itemSubtotal,
      });

      subtotal += itemSubtotal;
    }

    subtotal = parseFloat(subtotal.toFixed(2));

    const shipping = calculateAuthoritativeShipping(shippingOption, subtotal);
    const couponResult = await validateAuthoritativeCoupon(couponCode, subtotal);
    const discount = couponResult.discount;

    const total = Math.max(0, parseFloat((subtotal + shipping.fee - discount).toFixed(2)));

    return {
      items: quotedItems,
      subtotal,
      shippingFee: shipping.fee,
      shippingOption: shipping.id,
      carrier: shipping.carrier,
      estimatedDelivery: shipping.estimatedDelivery,
      discount,
      couponCode: couponResult.couponCode,
      total,
    };
  }

  /**
   * Places an order atomically with stock verification, inventory decrement,
   * price snapshots, and idempotency protection.
   */
  static async createOrderAtomically(
    input: CreateOrderRequest,
    user: AuthenticatedUser
  ): Promise<any> {
    // 1. Idempotency check: Look up existing key to prevent double charge or duplicate decrement
    if (input.idempotencyKey) {
      try {
        const idempRef = doc(db, 'idempotency_keys', input.idempotencyKey);
        const idempSnap = await getDoc(idempRef);
        if (idempSnap.exists()) {
          const data = idempSnap.data();
          const existingOrderRef = doc(db, 'orders', data.orderId);
          const orderSnap = await getDoc(existingOrderRef);
          if (orderSnap.exists()) {
            return {
              id: orderSnap.id,
              ...orderSnap.data(),
              _idempotentReplay: true,
            };
          }
        }
      } catch {
        // Continue if lookup fails
      }
    }

    // 2. Pre-verify canonical products exist
    const uniqueProductIds = Array.from(new Set(input.items.map((i) => i.productId)));
    const productMap = new Map<string, Product>();

    for (const pid of uniqueProductIds) {
      const canonical = await ServerProductRepository.getCanonicalProduct(pid);
      if (!canonical) {
        throw new CommerceError('PRODUCT_NOT_FOUND', `Product '${pid}' does not exist in canonical catalogue.`, 404);
      }
      productMap.set(pid, canonical);
    }

    // 3. Aggregate requested quantities per product to catch duplicates in items array
    const requestedQuantities = new Map<string, number>();
    for (const item of input.items) {
      const current = requestedQuantities.get(item.productId) || 0;
      requestedQuantities.set(item.productId, current + item.quantity);
    }

    // 4. Atomic Firestore Transaction: Read stock, validate, decrement, write order
    const orderId = `ORD-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
    const trackingNumber = `APAI-EXP-${Math.floor(10000000 + Math.random() * 90000000)}`;

    const createdOrder = await runTransaction(db, async (transaction) => {
      // Step A: Read live stock inside transaction
      const liveStockMap = new Map<string, number>();

      for (const pid of uniqueProductIds) {
        const prodRef = doc(db, 'products', pid);
        const prodSnap = await transaction.get(prodRef);

        let liveStock = 20; // Default fallback if field omitted
        if (prodSnap.exists()) {
          const data = prodSnap.data();
          liveStock = typeof data.stock === 'number' ? data.stock : (typeof data.stockCount === 'number' ? data.stockCount : 20);
        } else {
          const preloaded = productMap.get(pid);
          liveStock = preloaded?.stock ?? preloaded?.stockCount ?? 20;
        }

        const requested = requestedQuantities.get(pid) || 0;
        if (liveStock < requested) {
          const pName = productMap.get(pid)?.name || pid;
          throw new CommerceError(
            'INSUFFICIENT_STOCK',
            `Insufficient stock for '${pName}'. Available: ${liveStock}, Requested: ${requested}.`,
            400,
            { productId: pid, availableStock: liveStock, requestedQuantity: requested }
          );
        }

        liveStockMap.set(pid, liveStock);
      }

      // Step B: Authoritative pricing calculation
      let authoritativeSubtotal = 0;
      const itemSnapshots: OrderItemSnapshot[] = [];

      for (const item of input.items) {
        const product = productMap.get(item.productId)!;
        const unitPrice = parseFloat(product.price.toFixed(2));
        const itemSubtotal = parseFloat((unitPrice * item.quantity).toFixed(2));

        itemSnapshots.push({
          productId: product.id,
          name: product.name,
          sku: product.sku || `SKU-${product.id.slice(-6).toUpperCase()}`,
          image: product.image || '',
          unitPrice,
          quantity: item.quantity,
          subtotal: itemSubtotal,
          selectedColor: item.selectedColor || null,
          selectedSize: item.selectedSize || null,
          sellerId: product.sellerId || product.seller?.name || 'seller-apaibay-official',
        });

        authoritativeSubtotal += itemSubtotal;
      }

      authoritativeSubtotal = parseFloat(authoritativeSubtotal.toFixed(2));

      // Step C: Authoritative shipping and discount
      const shipping = calculateAuthoritativeShipping(input.shippingOption || 'standard', authoritativeSubtotal);
      const coupon = await validateAuthoritativeCoupon(input.couponCode, authoritativeSubtotal);
      const discount = coupon.discount;
      const total = Math.max(0, parseFloat((authoritativeSubtotal + shipping.fee - discount).toFixed(2)));

      // Step D: Decrement stock for each product
      for (const pid of uniqueProductIds) {
        const prodRef = doc(db, 'products', pid);
        const currentStock = liveStockMap.get(pid)!;
        const requested = requestedQuantities.get(pid)!;
        const newStock = Math.max(0, currentStock - requested);

        transaction.update(prodRef, {
          stock: newStock,
          stockCount: newStock,
          inStock: newStock > 0,
          updatedAt: new Date().toISOString(),
        });
      }

      // Step E: Create historical order document
      const orderDocRef = doc(db, 'orders', orderId);
      const orderPayload = {
        id: orderId,
        customerUid: user.uid,
        customerEmail: user.email || '',
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        items: itemSnapshots,
        subtotal: authoritativeSubtotal,
        shipping: shipping.fee,
        shippingFee: shipping.fee,
        shippingOption: shipping.id,
        discount,
        couponCode: coupon.couponCode || null,
        total,
        status: 'Placed',
        orderStatus: 'Placed',
        paymentStatus: 'pending', // Pending real payment settlement
        paymentMethod: input.paymentMethod || 'card',
        shippingAddress: input.shippingAddress,
        trackingNumber,
        carrier: shipping.carrier,
        estimatedDelivery: shipping.estimatedDelivery,
        idempotencyKey: input.idempotencyKey || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      transaction.set(orderDocRef, orderPayload);

      // Step F: Save idempotency key if present
      if (input.idempotencyKey) {
        const idempRef = doc(db, 'idempotency_keys', input.idempotencyKey);
        transaction.set(idempRef, {
          orderId,
          customerUid: user.uid,
          createdAt: new Date().toISOString(),
        });
      }

      return orderPayload;
    });

    // Record server-authoritative commission ledger entries idempotently
    try {
      await SellerLedgerService.recordOrderCommissions(createdOrder);
    } catch (err) {
      console.warn('[OrderService] Non-blocking ledger recording warning:', err);
    }

    return createdOrder;
  }
}
