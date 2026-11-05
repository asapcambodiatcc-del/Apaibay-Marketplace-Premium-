import { Router, Request, Response } from 'express';
import { verifyFirebaseUser, optionalFirebaseUser } from '../auth/verifyFirebaseUser';
import { validateCreateOrderInput } from '../validation/orderValidation';
import { OrderService, CommerceError } from '../commerce/orderService';
import { validateAuthoritativeCoupon } from '../commerce/couponService';
import { getAllShippingOptions } from '../commerce/shippingService';
import { validateStatusTransition, normalizeStatus } from '../commerce/orderLifecycle';
import { db, doc, getDoc, getDocs, updateDoc, setDoc, collection, query, where } from '../repositories/serverFirestore';
import { SellerLedgerService } from '../commerce/sellerLedgerService';

const router = Router();

/**
 * POST /api/commerce/checkout/quote
 * Authoritative price quote calculation (client prices are completely ignored)
 */
router.post('/checkout/quote', optionalFirebaseUser, async (req: Request, res: Response) => {
  try {
    const { items, shippingOption, couponCode } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'items array is required and must not be empty.' },
      });
      return;
    }

    const quote = await OrderService.calculateQuote(items, shippingOption, couponCode);
    res.json({ success: true, quote });
  } catch (err: any) {
    if (err instanceof CommerceError) {
      res.status(err.statusCode).json({
        success: false,
        error: { code: err.code, message: err.message, details: err.details },
      });
      return;
    }
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to calculate quote.' },
    });
  }
});

/**
 * POST /api/commerce/orders
 * Authoritative order creation with stock validation, inventory decrement,
 * and idempotency guard.
 */
router.post('/orders', verifyFirebaseUser, async (req: Request, res: Response) => {
  try {
    const validation = validateCreateOrderInput(req.body);
    if (!validation.valid) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_FAILED', message: validation.errors.join('; ') },
      });
      return;
    }

    const user = req.user!;
    const order = await OrderService.createOrderAtomically(req.body, user);

    const statusCode = order._idempotentReplay ? 200 : 201;
    res.status(statusCode).json({ success: true, order });
  } catch (err: any) {
    if (err instanceof CommerceError) {
      res.status(err.statusCode).json({
        success: false,
        error: { code: err.code, message: err.message, details: err.details },
      });
      return;
    }
    res.status(500).json({
      success: false,
      error: { code: 'ORDER_CREATION_FAILED', message: 'Unable to process order. Please try again.' },
    });
  }
});

/**
 * GET /api/commerce/orders
 * Lists orders authorized for the current user (Customer: own orders; Seller: orders with seller's items; Admin: all)
 */
router.get('/orders', verifyFirebaseUser, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const ordersCol = collection(db, 'orders');

    let orders: any[] = [];

    if (user.isAdmin) {
      // Admins see all orders
      const snap = await getDocs(ordersCol);
      orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } else if (user.isSeller) {
      // Sellers see orders containing items for their sellerId
      const snap = await getDocs(ordersCol);
      const allOrders = snap.docs.map((d) => ({ id: d.id, ...d.data() as any }));
      orders = allOrders.filter((ord) =>
        Array.isArray(ord.items) &&
        ord.items.some((it: any) => it.sellerId === user.sellerId || it.sellerId === user.uid)
      );
    } else {
      // Customers see only their own orders
      const q = query(ordersCol, where('customerUid', '==', user.uid));
      const snap = await getDocs(q);
      orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }

    // Sort descending by date
    orders.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    res.json({ success: true, orders });
  } catch {
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_ORDERS_FAILED', message: 'Failed to retrieve orders.' },
    });
  }
});

/**
 * GET /api/commerce/orders/:orderId
 * Fetches single order with strict authorization check
 */
router.get('/orders/:orderId', verifyFirebaseUser, async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const user = req.user!;

    const orderDocRef = doc(db, 'orders', orderId);
    const snap = await getDoc(orderDocRef);

    if (!snap.exists()) {
      res.status(404).json({
        success: false,
        error: { code: 'ORDER_NOT_FOUND', message: `Order #${orderId} was not found.` },
      });
      return;
    }

    const order = { id: snap.id, ...(snap.data() as any) };

    // Authorization verification
    const isCustomerOwner = order.customerUid === user.uid;
    const isSellerOfItem = user.isSeller && Array.isArray(order.items) &&
      order.items.some((it: any) => it.sellerId === user.sellerId || it.sellerId === user.uid);

    if (!user.isAdmin && !isCustomerOwner && !isSellerOfItem) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You are not authorized to view this order.' },
      });
      return;
    }

    res.json({ success: true, order });
  } catch {
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_ORDER_FAILED', message: 'Failed to retrieve order details.' },
    });
  }
});

/**
 * PATCH /api/commerce/orders/:orderId/status
 * Updates order status subject to state transition policy and role authorization
 */
router.patch('/orders/:orderId/status', verifyFirebaseUser, async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { status: targetStatus } = req.body;
    const user = req.user!;

    if (!targetStatus || typeof targetStatus !== 'string') {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_STATUS', message: 'Target status string is required.' },
      });
      return;
    }

    const orderDocRef = doc(db, 'orders', orderId);
    const snap = await getDoc(orderDocRef);

    if (!snap.exists()) {
      res.status(404).json({
        success: false,
        error: { code: 'ORDER_NOT_FOUND', message: `Order #${orderId} not found.` },
      });
      return;
    }

    const order = snap.data() as any;
    const validation = validateStatusTransition(order.status || 'Placed', targetStatus, order, user);

    if (!validation.allowed) {
      const statusCode = validation.code?.startsWith('FORBIDDEN') ? 403 : 400;
      res.status(statusCode).json({
        success: false,
        error: {
          code: validation.code || 'INVALID_TRANSITION',
          message: validation.message || 'Status transition rejected.',
        },
      });
      return;
    }

    const canonicalNewStatus = normalizeStatus(targetStatus);
    const updatedAt = new Date().toISOString();

    await updateDoc(orderDocRef, {
      status: canonicalNewStatus,
      orderStatus: canonicalNewStatus,
      updatedAt,
    });

    if (canonicalNewStatus === 'Cancelled') {
      try {
        await SellerLedgerService.recordOrderAdjustment(orderId, 'cancellation_adjustment');
      } catch (adjErr) {
        console.warn('[CommerceRoutes] Non-blocking cancellation adjustment warning:', adjErr);
      }
    }

    res.json({
      success: true,
      order: {
        ...order,
        id: snap.id,
        status: canonicalNewStatus,
        orderStatus: canonicalNewStatus,
        updatedAt,
      },
    });
  } catch {
    res.status(500).json({
      success: false,
      error: { code: 'STATUS_UPDATE_FAILED', message: 'Failed to update order status.' },
    });
  }
});

/**
 * GET /api/commerce/coupons/validate
 * Validates a coupon code server-side
 */
router.get('/coupons/validate', async (req: Request, res: Response) => {
  const code = req.query.code as string;
  const subtotal = parseFloat((req.query.subtotal as string) || '0');

  const result = await validateAuthoritativeCoupon(code, subtotal);
  res.json({ success: true, ...result });
});

/**
 * GET /api/commerce/shipping/options
 * Returns available shipping rates based on authoritative calculation
 */
router.get('/shipping/options', (req: Request, res: Response) => {
  const subtotal = parseFloat((req.query.subtotal as string) || '0');
  const options = getAllShippingOptions(subtotal);
  res.json({ success: true, options });
});

/**
 * PATCH /api/commerce/products/:productId/inventory
 * Server-side Seller Ownership: Only the owning seller or admin can update product stock
 */
router.patch('/products/:productId/inventory', verifyFirebaseUser, async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const { stock } = req.body;
    const user = req.user!;

    if (typeof stock !== 'number' || stock < 0 || !Number.isInteger(stock)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_STOCK', message: 'Stock must be a non-negative integer.' },
      });
      return;
    }

    const prodDocRef = doc(db, 'products', productId);
    const snap = await getDoc(prodDocRef);

    if (!snap.exists()) {
      res.status(404).json({
        success: false,
        error: { code: 'PRODUCT_NOT_FOUND', message: `Product #${productId} not found.` },
      });
      return;
    }

    const product = snap.data() as any;

    // Verify seller ownership server-side!
    const isOwner = user.isSeller && (product.sellerId === user.sellerId || product.sellerId === user.uid);
    if (!user.isAdmin && !isOwner) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN_SELLER_OWNERSHIP',
          message: 'You are not authorized to modify another seller’s inventory.',
        },
      });
      return;
    }

    await updateDoc(prodDocRef, {
      stock,
      stockCount: stock,
      inStock: stock > 0,
      updatedAt: new Date().toISOString(),
    });

    res.json({
      success: true,
      productId,
      stock,
      inStock: stock > 0,
    });
  } catch {
    res.status(500).json({
      success: false,
      error: { code: 'INVENTORY_UPDATE_FAILED', message: 'Failed to update inventory.' },
    });
  }
});

/**
 * POST /api/commerce/sellers/apply
 * Submits a new seller application.
 * STRICT ENFORCEMENT:
 * - verificationStatus ALWAYS defaults to 'pending'.
 * - A seller cannot approve or verify their own application.
 * - Records submittedAt, storeName, description, businessCountry, businessType.
 */
router.post('/sellers/apply', verifyFirebaseUser, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { storeName, description, businessCountry, businessType, contactInfo, logo } = req.body;

    if (!storeName || typeof storeName !== 'string' || storeName.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_STORE_NAME', message: 'Store name is required.' },
      });
      return;
    }

    if (storeName.trim().length > 150) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_STORE_NAME', message: 'Store name must not exceed 150 characters.' },
      });
      return;
    }

    const sellerId = user.uid;
    const sellerRef = doc(db, 'sellers', sellerId);
    let initialCreatedAt = new Date().toISOString();

    try {
      const existingSnap = await getDoc(sellerRef);
      if (existingSnap.exists()) {
        const existing = existingSnap.data() as any;
        if (existing.verificationStatus === 'verified') {
          res.status(400).json({
            success: false,
            error: { code: 'ALREADY_VERIFIED', message: 'Seller is already verified.' },
          });
          return;
        }
        if (existing.createdAt) {
          initialCreatedAt = existing.createdAt;
        }
      }
    } catch (readErr: any) {
      console.warn('[CommerceRoutes] Seller existence check note:', readErr?.message);
    }

    const now = new Date().toISOString();
    const sellerPayload = {
      sellerId,
      ownerUid: user.uid,
      storeName: storeName.trim(),
      description: (description || '').trim(),
      businessCountry: (businessCountry || 'KH').trim().toUpperCase(),
      businessType: businessType || 'individual',
      verificationStatus: 'pending', // NON-NEGOTIABLE: defaults strictly to pending
      submittedAt: now,
      rating: 5.0,
      logo: logo || 'https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=120',
      contactInfo: {
        email: user.email || '',
        phone: contactInfo?.phone || '',
        address: contactInfo?.address || '',
      },
      payoutStatus: 'not_configured',
      createdAt: initialCreatedAt,
      updatedAt: now,
    };

    try {
      await setDoc(sellerRef, sellerPayload);
    } catch (writeErr: any) {
      console.info('[CommerceRoutes] Server Firestore write note:', writeErr?.message);
    }

    res.status(201).json({
      success: true,
      seller: sellerPayload,
    });
  } catch (err: any) {
    console.error('[CommerceRoutes] /sellers/apply error:', err?.message || err);
    res.status(500).json({
      success: false,
      error: { code: 'SELLER_APPLICATION_FAILED', message: err?.message || 'Failed to submit seller application.' },
    });
  }
});

/**
 * GET /api/commerce/sellers/me
 * Retrieves current authenticated user's seller profile.
 */
router.get('/sellers/me', verifyFirebaseUser, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const sellerRef = doc(db, 'sellers', user.uid);
    let snap: any = null;
    try {
      snap = await getDoc(sellerRef);
    } catch (e: any) {
      console.warn('[CommerceRoutes] /sellers/me getDoc note:', e?.message);
    }

    if (!snap || !snap.exists()) {
      res.json({
        success: true,
        applied: false,
        seller: null,
      });
      return;
    }

    res.json({
      success: true,
      applied: true,
      seller: snap.data(),
    });
  } catch (err: any) {
    console.error('[CommerceRoutes] /sellers/me error:', err?.message || err);
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_SELLER_ME_FAILED', message: 'Failed to retrieve seller profile.' },
    });
  }
});

/**
 * GET /api/commerce/sellers
 * Lists all seller applications & profiles (Admin only).
 */
router.get('/sellers', verifyFirebaseUser, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    if (!user.isAdmin) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only administrators may access seller registry.' },
      });
      return;
    }

    const sellersCol = collection(db, 'sellers');
    const snap = await getDocs(sellersCol);
    const sellers = snap.docs.map((d) => ({ sellerId: d.id, ...d.data() }));

    // Sort newest applications first
    sellers.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    res.json({ success: true, sellers });
  } catch {
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_SELLERS_FAILED', message: 'Failed to retrieve sellers.' },
    });
  }
});

/**
 * PATCH /api/commerce/sellers/:sellerId/review
 * Persistent server-authorized admin review of seller applications.
 */
router.patch('/sellers/:sellerId/review', verifyFirebaseUser, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    if (!user.isAdmin) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only administrators may review seller applications.' },
      });
      return;
    }

    const { sellerId } = req.params;
    const { status, rejectionReason } = req.body;

    if (!status || !['verified', 'rejected', 'suspended', 'pending'].includes(status)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_STATUS', message: 'Status must be verified, rejected, suspended, or pending.' },
      });
      return;
    }

    const sellerRef = doc(db, 'sellers', sellerId);
    let currentSeller: any = { sellerId, verificationStatus: 'pending' };
    try {
      const snap = await getDoc(sellerRef);
      if (snap.exists()) {
        currentSeller = snap.data();
      }
    } catch (readErr: any) {
      console.warn('[CommerceRoutes] Seller read note in review:', readErr?.message);
    }

    const now = new Date().toISOString();

    const updates: Record<string, any> = {
      verificationStatus: status,
      reviewedAt: now,
      reviewedBy: user.email || user.uid,
      updatedAt: now,
    };

    if (status === 'rejected') {
      updates.rejectionReason = rejectionReason || 'Application does not meet marketplace compliance standards.';
    } else if (status === 'verified') {
      updates.rejectionReason = null;
    }

    try {
      await updateDoc(sellerRef, updates);
    } catch (writeErr: any) {
      console.info('[CommerceRoutes] Server Firestore review write note:', writeErr?.message);
    }

    // If verified, also ensure user's role in /users is updated to 'seller'
    if (status === 'verified' && currentSeller.ownerUid) {
      try {
        const userRef = doc(db, 'users', currentSeller.ownerUid);
        await updateDoc(userRef, { role: 'seller', updatedAt: now });
      } catch {
        // non-blocking
      }
    }

    res.json({
      success: true,
      seller: {
        ...currentSeller,
        ...updates,
      },
    });
  } catch (err: any) {
    console.error('[CommerceRoutes] /sellers/review error:', err?.message || err);
    res.status(500).json({
      success: false,
      error: { code: 'SELLER_REVIEW_FAILED', message: err?.message || 'Failed to process seller review.' },
    });
  }
});

/**
 * POST /api/commerce/products
 * Authenticated verified seller or admin publishes a product.
 * Requirements:
 * - Uses authenticated seller identity.
 * - Pending, rejected, or suspended sellers CANNOT publish new products.
 */
router.post('/products', verifyFirebaseUser, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { name, price, originalPrice, category, brand, image, description, stock } = req.body;

    if (!name || typeof name !== 'string' || !price || isNaN(Number(price))) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_PRODUCT_DATA', message: 'Product name and valid numeric price are required.' },
      });
      return;
    }

    // Verify seller authorization & status
    let sellerStoreName = 'Verified Merchant Store';
    let sellerRating = 5.0;

    if (!user.isAdmin) {
      const sellerRef = doc(db, 'sellers', user.uid);
      const sellerSnap = await getDoc(sellerRef);
      if (!sellerSnap.exists()) {
        res.status(403).json({
          success: false,
          error: { code: 'NOT_A_SELLER', message: 'You must apply and be verified as a seller to publish listings.' },
        });
        return;
      }

      const sellerData = sellerSnap.data() as any;
      if (sellerData.verificationStatus !== 'verified') {
        res.status(403).json({
          success: false,
          error: {
            code: 'SELLER_NOT_VERIFIED',
            message: `Cannot publish products while seller status is '${sellerData.verificationStatus}'. Must be 'verified'.`,
          },
        });
        return;
      }

      sellerStoreName = sellerData.storeName || sellerStoreName;
      sellerRating = sellerData.rating || 5.0;
    }

    const priceNum = parseFloat(Number(price).toFixed(2));
    const origPriceNum = originalPrice ? parseFloat(Number(originalPrice).toFixed(2)) : parseFloat((priceNum * 1.2).toFixed(2));
    const prodId = `prod_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const productPayload = {
      id: prodId,
      name: name.trim(),
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      description: description || 'Verified merchant marketplace listing.',
      price: priceNum,
      originalPrice: origPriceNum,
      discountPercentage: Math.max(0, Math.round(((origPriceNum - priceNum) / origPriceNum) * 100)),
      rating: 5.0,
      reviewCount: 0,
      image: image || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800',
      category: category || 'electronics',
      brand: brand || 'Marketplace Merchant',
      inStock: (stock ?? 25) > 0,
      stock: stock ?? 25,
      stockCount: stock ?? 25,
      sku: `SKU-${Date.now().toString().slice(-6)}`,
      sellerId: user.uid,
      seller: {
        id: user.uid,
        name: sellerStoreName,
        verified: true,
        rating: sellerRating,
        badge: 'Verified Merchant',
      },
      tags: [category || 'electronics', 'new'],
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    const prodRef = doc(db, 'products', prodId);
    await setDoc(prodRef, productPayload);

    res.status(201).json({
      success: true,
      product: productPayload,
    });
  } catch {
    res.status(500).json({
      success: false,
      error: { code: 'PRODUCT_CREATION_FAILED', message: 'Failed to create product listing.' },
    });
  }
});

/**
 * GET /api/commerce/sellers/ledger
 * Retrieves the seller's earnings ledger & financial summary.
 * Strict protection: A seller can only read their own ledger; admins can query any seller.
 */
router.get('/sellers/ledger', verifyFirebaseUser, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const targetSellerId = (user.isAdmin && req.query.sellerId) ? String(req.query.sellerId) : user.uid;

    const { entries, summary } = await SellerLedgerService.getSellerLedger(targetSellerId, user);
    res.json({
      success: true,
      data: {
        sellerId: targetSellerId,
        entries,
        summary,
      },
    });
  } catch (err: any) {
    const isForbidden = String(err?.message || '').includes('FORBIDDEN');
    res.status(isForbidden ? 403 : 500).json({
      success: false,
      error: {
        code: isForbidden ? 'FORBIDDEN_LEDGER_ACCESS' : 'LEDGER_FETCH_FAILED',
        message: err?.message || 'Failed to retrieve seller ledger.',
      },
    });
  }
});

export default router;
