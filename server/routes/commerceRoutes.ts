import { Router, Request, Response } from 'express';
import { verifyFirebaseUser, optionalFirebaseUser } from '../auth/verifyFirebaseUser';
import { validateCreateOrderInput } from '../validation/orderValidation';
import { OrderService, CommerceError } from '../commerce/orderService';
import { validateAuthoritativeCoupon } from '../commerce/couponService';
import { getAllShippingOptions } from '../commerce/shippingService';
import { validateStatusTransition, normalizeStatus } from '../commerce/orderLifecycle';
import { db, doc, getDoc, getDocs, updateDoc, setDoc, collection, query, where } from '../repositories/serverFirestore';
import { SellerLedgerService } from '../commerce/sellerLedgerService';
import { DisputeService } from '../commerce/disputeService';
import { KycService, sanitizePublicSellerOwnerName } from '../commerce/kycService';
import { AdminActivityLogService } from '../admin/adminActivityLogService';
import { hasPermission } from '../auth/roles';
import { validateCreateProductInput, validateUpdateProductInput } from '../validation/productValidation';
import {
  assertVerifiedActiveSeller as sharedAssertVerifiedActiveSeller,
  applyOrderStatusTransition,
  recordSellerTrackingUpdate,
  sanitizeOrderForViewer,
} from '../commerce/orderTrackingService';
import { NotificationService } from '../commerce/notificationService';

const router = Router();

const assertVerifiedActiveSeller = sharedAssertVerifiedActiveSeller;

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

    // Sort descending by date and sanitize for caller's role
    orders.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    const sanitizedOrders = orders.map((ord) => sanitizeOrderForViewer(ord, user));

    res.json({ success: true, orders: sanitizedOrders });
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

    res.json({ success: true, order: sanitizeOrderForViewer(order, user) });
  } catch {
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_ORDER_FAILED', message: 'Failed to retrieve order details.' },
    });
  }
});

/**
 * PATCH /api/commerce/orders/:orderId/tracking
 * Verified active seller records or updates carrier & tracking information for their own order items.
 */
router.patch('/orders/:orderId/tracking', verifyFirebaseUser, async (req: Request, res: Response) => {
  try {
    const result = await recordSellerTrackingUpdate(req.params.orderId, req.body, req.user!);
    if (!result.ok) {
      res.status(result.status).json({
        success: false,
        error: {
          code: result.code || 'TRACKING_UPDATE_FAILED',
          message: result.message || 'Failed to update shipping tracking.',
          ...(result.details ? { details: result.details } : {}),
        },
      });
      return;
    }

    res.json({ success: true, order: result.order });
  } catch {
    res.status(500).json({
      success: false,
      error: { code: 'TRACKING_UPDATE_FAILED', message: 'Failed to update shipping tracking details.' },
    });
  }
});

/**
 * PATCH /api/commerce/orders/:orderId/status
 * Updates order status subject to state transition policy and role authorization
 */
router.patch('/orders/:orderId/status', verifyFirebaseUser, async (req: Request, res: Response) => {
  try {
    const result = await applyOrderStatusTransition(req.params.orderId, req.body, req.user!);
    if (!result.ok) {
      res.status(result.status).json({
        success: false,
        error: {
          code: result.code || 'STATUS_UPDATE_FAILED',
          message: result.message || 'Status transition rejected.',
          ...(result.details ? { details: result.details } : {}),
        },
      });
      return;
    }

    res.json({
      success: true,
      order: result.order,
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

    if (user.accountStatus === 'suspended') {
      res.status(403).json({
        success: false,
        error: { code: 'ACCOUNT_SUSPENDED', message: 'Suspended accounts cannot modify product inventory.' },
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

    // Verify seller ownership & active verification status server-side
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

    if (!user.isAdmin) {
      const sellerErr = await assertVerifiedActiveSeller(user.sellerId || user.uid);
      if (sellerErr) {
        res.status(sellerErr.status).json({
          success: false,
          error: { code: sellerErr.code, message: sellerErr.message },
        });
        return;
      }
    }

    if (product.status === 'archived') {
      res.status(400).json({
        success: false,
        error: {
          code: 'PRODUCT_ARCHIVED',
          message: 'Archived listings cannot be restocked until restored to draft or active status.',
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
 * - Records submittedAt, storeName, ownerName, description, businessCountry, businessAddress, productCategories, businessType.
 */
router.post('/sellers/apply', verifyFirebaseUser, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const {
      storeName,
      ownerName,
      description,
      businessCountry,
      businessAddress,
      productCategories,
      businessType,
      contactInfo,
      websiteUrl,
      documents,
      logo,
    } = req.body;

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

    const existingSnap = await getDoc(sellerRef);
    if (existingSnap.exists()) {
      const existing = existingSnap.data() as any;
      if (existing.verificationStatus === 'verified' || existing.verificationStatus === 'approved') {
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

    const now = new Date().toISOString();
    const rawSubmittedOwnerName = typeof ownerName === 'string' ? ownerName.trim() : '';
    const publicOwnerName = sanitizePublicSellerOwnerName(rawSubmittedOwnerName, 'Seller');
    const privateLegalFullName = rawSubmittedOwnerName || user.email || 'Seller';
    const effectivePhone = (contactInfo?.phone || '').trim();
    const effectiveEmail = (contactInfo?.email || user.email || '').trim();
    const effectiveAddress = (businessAddress || contactInfo?.address || '').trim();
    const effectiveCategories = Array.isArray(productCategories) && productCategories.length > 0
      ? productCategories
      : ['general'];
    const effectiveDocRefs = Array.isArray(documents)
      ? documents.map((d: any) => String(d).trim()).filter(Boolean).slice(0, 20)
      : [];

    // Public /sellers/{sellerId} stores ONLY non-PII storefront summary fields
    const publicSellerPayload = {
      sellerId,
      ownerUid: user.uid,
      storeName: storeName.trim(),
      ownerName: publicOwnerName,
      description: (description || '').trim(),
      businessCountry: (businessCountry || 'KH').trim().toUpperCase(),
      productCategories: effectiveCategories,
      businessType: businessType || 'individual',
      websiteUrl: (websiteUrl || '').trim(),
      verificationStatus: 'pending', // NON-NEGOTIABLE: defaults strictly to pending
      kycStatus: 'PENDING_REVIEW',
      submittedAt: now,
      rating: 5.0,
      logo: logo || 'https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=120',
      payoutStatus: 'not_configured',
      createdAt: initialCreatedAt,
      updatedAt: now,
    };

    await setDoc(sellerRef, publicSellerPayload);

    // Store private PII & compliance metadata strictly inside /seller_kyc/{uid}
    let kycRecord: any = null;
    if (effectiveAddress.length >= 5) {
      kycRecord = await KycService.submitKycApplication(user, {
        legalFullName: privateLegalFullName,
        shopName: publicSellerPayload.storeName,
        countryOfRegistration: publicSellerPayload.businessCountry,
        residentialOrBusinessAddress: effectiveAddress,
        contactEmail: effectiveEmail,
        phoneNumber: effectivePhone,
        profileType: publicSellerPayload.businessType as any,
        identityDocumentType:
          publicSellerPayload.businessType === 'registered_business' ||
          publicSellerPayload.businessType === 'enterprise'
            ? 'business_registration'
            : 'national_id',
        legacyDocumentRefs: effectiveDocRefs,
        privacyNoticeAccepted: true,
      });
    } else {
      kycRecord = await KycService.upsertPrivateContactFromApplication(user, {
        legalFullName: privateLegalFullName,
        shopName: publicSellerPayload.storeName,
        countryOfRegistration: publicSellerPayload.businessCountry,
        residentialOrBusinessAddress: effectiveAddress,
        contactEmail: effectiveEmail,
        phoneNumber: effectivePhone,
        profileType: publicSellerPayload.businessType as any,
        legacyDocumentRefs: effectiveDocRefs,
      });
    }

    // Persist admin notification for platform governance
    try {
      const adminNotifRef = doc(db, 'admin_notifications', `seller_app_${sellerId}`);
      await setDoc(
        adminNotifRef,
        {
          id: `seller_app_${sellerId}`,
          type: 'seller_application',
          title: 'New Seller Application Received',
          message: `${publicSellerPayload.storeName} applied by ${publicOwnerName}`,
          applicantUid: user.uid,
          applicantName: publicOwnerName,
          shopName: publicSellerPayload.storeName,
          read: false,
          createdAt: now,
          link: '/admin',
        },
        { merge: true }
      );
    } catch (notifErr: any) {
      console.warn('[CommerceRoutes] Admin notification note:', notifErr?.message);
    }

    // Owner receives their own non-public contact fields hydrated in the authenticated response
    res.status(201).json({
      success: true,
      seller: {
        ...publicSellerPayload,
        businessAddress: kycRecord?.residentialOrBusinessAddress || '',
        contactInfo: {
          email: kycRecord?.contactEmail || effectiveEmail,
          phone: kycRecord?.maskedPhone || '',
          address: kycRecord?.residentialOrBusinessAddress || '',
        },
      },
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
 * Retrieves current authenticated user's seller profile (enriched privately from /seller_kyc).
 */
router.get('/sellers/me', verifyFirebaseUser, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const sellerRef = doc(db, 'sellers', user.uid);
    const snap = await getDoc(sellerRef);

    if (!snap.exists()) {
      res.json({
        success: true,
        applied: false,
        seller: null,
      });
      return;
    }

    const { reviewedBy: _omitReviewedBy, ...safeBaseSeller } = snap.data() as any;
    let kycRec: any = null;
    try {
      const kycData = await KycService.getMyKyc(user);
      kycRec = kycData.record;
    } catch {
      // ignore non-critical enrichment failure
    }

    res.json({
      success: true,
      applied: true,
      seller: {
        ...safeBaseSeller,
        businessAddress: kycRec?.residentialOrBusinessAddress || safeBaseSeller.businessAddress || '',
        contactInfo: {
          email: kycRec?.contactEmail || safeBaseSeller.contactInfo?.email || user.email || '',
          phone: kycRec?.maskedPhone || safeBaseSeller.contactInfo?.phone || '',
          address: kycRec?.residentialOrBusinessAddress || safeBaseSeller.contactInfo?.address || '',
        },
      },
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
 * Lists all seller applications & profiles (Admin only, enriched from private /seller_kyc for compliance reviewers).
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

    const kycBySellerId = new Map<string, any>();
    if (hasPermission(user, 'kyc:read')) {
      try {
        const kycList = await KycService.listKycApplications(user);
        for (const k of kycList) {
          kycBySellerId.set(k.sellerId, k);
        }
      } catch {
        // non-critical enrichment
      }
    }

    const sellers = snap.docs.map((d) => {
      const s = d.data() as any;
      const k = kycBySellerId.get(d.id);
      const { reviewedBy: legacyReviewer, ...publicSeller } = s;
      return {
        sellerId: d.id,
        ...publicSeller,
        businessAddress: k?.residentialOrBusinessAddress || s.businessAddress || '',
        reviewedBy:
          k?.reviewedByEmail ||
          k?.reviewedByUid ||
          (hasPermission(user, 'kyc:read') ? legacyReviewer : undefined),
        contactInfo: {
          email: k?.contactEmail || s.contactInfo?.email || '',
          phone: k?.maskedPhone || s.contactInfo?.phone || '',
          address: k?.residentialOrBusinessAddress || s.contactInfo?.address || '',
        },
      };
    });

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
    if (!hasPermission(user, 'kyc:review')) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only authorized KYC compliance administrators may review seller applications.' },
      });
      return;
    }

    const { sellerId } = req.params;
    if (user.uid === sellerId) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN_SELF_REVIEW', message: 'Separation of duties: reviewers cannot approve or review their own seller application.' },
      });
      return;
    }

    const { status, rejectionReason } = req.body;

    const allowedStatuses = ['verified', 'approved', 'rejected', 'under_review', 'suspended', 'expired', 'pending'];
    if (!status || !allowedStatuses.includes(status)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_STATUS', message: 'Status must be verified, approved, under_review, rejected, suspended, expired, or pending.' },
      });
      return;
    }

    const canonicalStatus = status === 'approved' ? 'verified' : status;

    if (canonicalStatus === 'rejected' && (!rejectionReason || typeof rejectionReason !== 'string' || rejectionReason.trim().length === 0)) {
      res.status(400).json({
        success: false,
        error: { code: 'REASON_REQUIRED', message: 'A rejection reason is required when rejecting a seller application.' },
      });
      return;
    }

    const sellerRef = doc(db, 'sellers', sellerId);
    const snap = await getDoc(sellerRef);
    if (!snap.exists()) {
      res.status(404).json({
        success: false,
        error: { code: 'SELLER_NOT_FOUND', message: `Seller profile '${sellerId}' was not found.` },
      });
      return;
    }
    const currentSeller: any = snap.data();

    const now = new Date().toISOString();

    const updates: Record<string, any> = {
      verificationStatus: canonicalStatus,
      reviewedAt: now,
      updatedAt: now,
    };

    if (canonicalStatus === 'rejected') {
      updates.rejectionReason = rejectionReason.trim();
    } else if (canonicalStatus === 'verified') {
      updates.rejectionReason = null;
    }

    await updateDoc(sellerRef, updates);

    // Sync KYC record state cleanly & ensure private reviewer identity is logged in /seller_kyc and /admin_audit_logs
    let kycReviewedSynced = false;
    try {
      const actionMap: Record<string, any> = {
        verified: 'approve',
        rejected: 'reject',
        under_review: 'under_review',
        suspended: 'suspend',
        expired: 'expire',
      };
      const mappedAction = actionMap[canonicalStatus];
      if (mappedAction) {
        await KycService.reviewKycApplication(user, sellerId, {
          action: mappedAction,
          reason: rejectionReason?.trim() || (canonicalStatus === 'suspended' ? 'Suspended during compliance review.' : undefined),
        });
        kycReviewedSynced = true;
      }
    } catch {
      // Non-blocking if legacy review fallback audit is needed below
    }

    if (!kycReviewedSynced) {
      const fallbackAuditActionMap: Record<string, string> = {
        verified: 'SELLER_APPROVE',
        under_review: 'SELLER_UNDER_REVIEW',
        rejected: 'SELLER_REJECT',
        suspended: 'SELLER_SUSPEND',
      };
      try {
        await AdminActivityLogService.logAction({
          admin: user,
          action: fallbackAuditActionMap[canonicalStatus] || 'KYC_UNDER_REVIEW',
          targetResourceId: sellerId,
          targetResourceType: 'seller',
          previousValue: { verificationStatus: currentSeller.verificationStatus },
          newValue: {
            verificationStatus: canonicalStatus,
            reason: rejectionReason?.trim(),
          },
        });
      } catch {
        // non-blocking
      }
    }

    // Mark admin notification read upon review
    try {
      const adminNotifRef = doc(db, 'admin_notifications', `seller_app_${sellerId}`);
      await updateDoc(adminNotifRef, { read: true, reviewedAt: now });
    } catch {
      // non-blocking
    }

    // If verified, also ensure user's role in /users is updated to 'seller'
    if (canonicalStatus === 'verified' && (currentSeller.ownerUid || sellerId)) {
      try {
        const targetUid = currentSeller.ownerUid || sellerId;
        const userRef = doc(db, 'users', targetUid);
        await updateDoc(userRef, { role: 'seller', updatedAt: now });
      } catch {
        // non-blocking
      }
    }

    const { reviewedBy: _omitStoredReviewer, ...safePublicSeller } = currentSeller;
    res.json({
      success: true,
      seller: {
        ...safePublicSeller,
        ...updates,
        // Returned solely in authenticated admin review response; never persisted to public /sellers
        reviewedBy: user.email || user.uid,
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
 * GET /api/commerce/admin/notifications
 * Lists admin notifications (Admin only).
 */
router.get('/admin/notifications', verifyFirebaseUser, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    if (!user.isAdmin) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Admin permissions required.' },
      });
      return;
    }

    const colRef = collection(db, 'admin_notifications');
    const snap = await getDocs(colRef);
    const notifications = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    notifications.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    res.json({ success: true, notifications });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_NOTIFICATIONS_FAILED', message: 'Failed to retrieve notifications.' },
    });
  }
});

/**
 * PATCH /api/commerce/admin/notifications/:id/read
 * Marks admin notification as read.
 */
router.patch('/admin/notifications/:id/read', verifyFirebaseUser, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    if (!user.isAdmin) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Admin permissions required.' },
      });
      return;
    }

    const { id } = req.params;
    const docRef = doc(db, 'admin_notifications', id);
    await updateDoc(docRef, { read: true });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'UPDATE_NOTIFICATION_FAILED', message: 'Failed to mark notification as read.' },
    });
  }
});

/**
 * GET /api/commerce/notifications
 * Lists authenticated user's private in-app order/tracking notifications.
 */
router.get('/notifications', verifyFirebaseUser, async (req: Request, res: Response) => {
  try {
    const notifications = await NotificationService.listUserNotifications(req.user!.uid);
    res.json({ success: true, notifications });
  } catch {
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_NOTIFICATIONS_FAILED', message: 'Failed to retrieve notifications.' },
    });
  }
});

/**
 * PATCH /api/commerce/notifications/:notificationId/read
 * Marks an authenticated user's own notification as read.
 */
router.patch('/notifications/:notificationId/read', verifyFirebaseUser, async (req: Request, res: Response) => {
  try {
    const result = await NotificationService.markAsRead(req.user!.uid, req.params.notificationId);
    if (!result.ok) {
      res.status(result.status).json({
        success: false,
        error: { code: result.code || 'UPDATE_NOTIFICATION_FAILED', message: result.message || 'Unauthorized.' },
      });
      return;
    }
    res.json({ success: true });
  } catch {
    res.status(500).json({
      success: false,
      error: { code: 'UPDATE_NOTIFICATION_FAILED', message: 'Failed to mark notification as read.' },
    });
  }
});

/**
 * POST /api/commerce/products
 * Authenticated verified seller or admin publishes a product.
 * Requirements:
 * - Uses authenticated seller identity (never trusts client-supplied sellerId).
 * - Pending, rejected, expired, or suspended sellers CANNOT publish new products.
 */
router.post('/products', verifyFirebaseUser, async (req: Request, res: Response) => {
  try {
    const user = req.user!;

    if (user.accountStatus === 'suspended') {
      res.status(403).json({
        success: false,
        error: { code: 'ACCOUNT_SUSPENDED', message: 'Suspended accounts cannot publish products.' },
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

      if (sellerData.kycStatus === 'EXPIRED' || sellerData.kycStatus === 'SUSPENDED') {
        res.status(403).json({
          success: false,
          error: {
            code: 'SELLER_KYC_INACTIVE',
            message: `Cannot publish products while KYC status is '${sellerData.kycStatus}'.`,
          },
        });
        return;
      }

      sellerStoreName = sellerData.storeName || sellerStoreName;
      sellerRating = sellerData.rating || 5.0;
    }

    const validation = validateCreateProductInput(req.body);
    if (!validation.valid || !validation.data) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PRODUCT_DATA',
          message: validation.errors.join(' '),
        },
      });
      return;
    }

    const v = validation.data;
    const prodId = `prod_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const baseSlug = v.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const uniqueSlug = `${baseSlug || 'product'}-${prodId.slice(-5)}`;

    const productPayload: Record<string, any> = {
      id: prodId,
      name: v.name,
      slug: uniqueSlug,
      description: v.description,
      price: v.price,
      originalPrice: v.originalPrice,
      discountPercentage:
        v.originalPrice > 0
          ? Math.max(0, Math.round(((v.originalPrice - v.price) / v.originalPrice) * 100))
          : 0,
      rating: 5.0,
      reviewCount: 0,
      image: v.image,
      gallery: v.gallery,
      category: v.category,
      brand: v.brand,
      inStock: v.status === 'active' && v.stock > 0,
      stock: v.stock,
      stockCount: v.stock,
      sku: v.sku || `SKU-${Date.now().toString().slice(-6)}`,
      features: v.features,
      sellerId: user.uid,
      seller: {
        id: user.uid,
        name: sellerStoreName,
        verified: true,
        rating: sellerRating,
        badge: 'Verified Merchant',
      },
      tags: v.tags,
      status: v.status,
      createdAt: now,
      updatedAt: now,
    };

    if (v.secondaryImage) {
      productPayload.secondaryImage = v.secondaryImage;
    }

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
 * PATCH /api/commerce/products/:productId
 * Authenticated verified seller (owner) or admin updates editable product listing fields.
 * Preserves immutable product id, slug, sellerId, rating, reviewCount, and order references.
 */
router.patch('/products/:productId', verifyFirebaseUser, async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const user = req.user!;

    if (user.accountStatus === 'suspended') {
      res.status(403).json({
        success: false,
        error: { code: 'ACCOUNT_SUSPENDED', message: 'Suspended accounts cannot modify product listings.' },
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

    const isOwner = user.isSeller && (product.sellerId === user.sellerId || product.sellerId === user.uid);
    if (!user.isAdmin && !isOwner) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN_SELLER_OWNERSHIP',
          message: 'You are not authorized to edit another seller’s product listing.',
        },
      });
      return;
    }

    if (!user.isAdmin) {
      const sellerErr = await assertVerifiedActiveSeller(user.sellerId || user.uid);
      if (sellerErr) {
        res.status(sellerErr.status).json({
          success: false,
          error: { code: sellerErr.code, message: sellerErr.message },
        });
        return;
      }
    }

    const validation = validateUpdateProductInput(req.body, product);
    if (!validation.valid || !validation.updates) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PRODUCT_DATA',
          message: validation.errors.join(' '),
        },
      });
      return;
    }

    const now = new Date().toISOString();
    const updatePayload: Record<string, any> = {
      ...validation.updates,
      updatedAt: now,
    };

    if (product.status === 'archived' && (updatePayload.status === 'active' || updatePayload.status === 'draft')) {
      updatePayload.archivedAt = null;
      updatePayload.archivedBy = null;
    }

    await updateDoc(prodDocRef, updatePayload);

    res.json({
      success: true,
      product: {
        ...product,
        ...updatePayload,
        id: snap.id,
      },
    });
  } catch {
    res.status(500).json({
      success: false,
      error: { code: 'PRODUCT_UPDATE_FAILED', message: 'Failed to update product listing.' },
    });
  }
});

/**
 * POST /api/commerce/products/:productId/archive
 * Soft-archives a product listing so it cannot appear as active/purchasable on the storefront,
 * while strictly preserving the product document, ID, SKU, and all historical order/ledger references.
 */
router.post('/products/:productId/archive', verifyFirebaseUser, async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const user = req.user!;

    if (user.accountStatus === 'suspended') {
      res.status(403).json({
        success: false,
        error: { code: 'ACCOUNT_SUSPENDED', message: 'Suspended accounts cannot archive product listings.' },
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

    const isOwner = user.isSeller && (product.sellerId === user.sellerId || product.sellerId === user.uid);
    if (!user.isAdmin && !isOwner) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN_SELLER_OWNERSHIP',
          message: 'You are not authorized to archive another seller’s product listing.',
        },
      });
      return;
    }

    if (!user.isAdmin) {
      const sellerErr = await assertVerifiedActiveSeller(user.sellerId || user.uid);
      if (sellerErr) {
        res.status(sellerErr.status).json({
          success: false,
          error: { code: sellerErr.code, message: sellerErr.message },
        });
        return;
      }
    }

    if (product.status === 'archived') {
      res.json({
        success: true,
        alreadyArchived: true,
        product: { ...product, id: snap.id },
      });
      return;
    }

    const now = new Date().toISOString();
    const archiveUpdates = {
      status: 'archived',
      inStock: false,
      archivedAt: now,
      archivedBy: user.uid,
      updatedAt: now,
    };

    await updateDoc(prodDocRef, archiveUpdates);

    res.json({
      success: true,
      product: {
        ...product,
        ...archiveUpdates,
        id: snap.id,
      },
    });
  } catch {
    res.status(500).json({
      success: false,
      error: { code: 'PRODUCT_ARCHIVE_FAILED', message: 'Failed to archive product listing.' },
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

/**
 * POST /api/commerce/sellers/payouts/request
 * Seller requests a withdrawal from available cleared earnings.
 */
router.post('/sellers/payouts/request', verifyFirebaseUser, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { amount, destination, sellerId, currency } = req.body;
    const targetSellerId = sellerId || user.sellerId || user.uid;

    const payout = await SellerLedgerService.createPayoutRequest(
      targetSellerId,
      Number(amount),
      destination,
      user,
      { currency }
    );

    res.status(201).json({
      success: true,
      payout,
    });
  } catch (err: any) {
    const msg = err?.message || 'Failed to submit payout request.';
    const isForbidden = msg.includes('FORBIDDEN');
    const isValidation =
      msg.includes('minimum') ||
      msg.includes('Minimum') ||
      msg.includes('positive') ||
      msg.includes('required') ||
      msg.includes('Unsupported') ||
      msg.includes('UNSUPPORTED_PAYOUT_CURRENCY') ||
      msg.includes('verify') ||
      msg.includes('not eligible') ||
      msg.includes('INSUFFICIENT_AVAILABLE_BALANCE') ||
      msg.includes('CONCURRENT_PAYOUT_REQUEST_BLOCKED');
    res.status(isForbidden ? 403 : isValidation ? 400 : 500).json({
      success: false,
      error: {
        code: isForbidden ? 'FORBIDDEN_PAYOUT_REQUEST' : isValidation ? 'INVALID_PAYOUT_REQUEST' : 'PAYOUT_REQUEST_FAILED',
        message: msg,
      },
    });
  }
});

/**
 * GET /api/commerce/sellers/payouts
 * Lists payout requests (Sellers see own; Admins see all).
 */
router.get('/sellers/payouts', verifyFirebaseUser, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { status, sellerId } = req.query;

    const payouts = await SellerLedgerService.listPayoutRequests(
      {
        status: status ? (String(status) as any) : undefined,
        sellerId: sellerId ? String(sellerId) : undefined,
      },
      user
    );

    res.json({ success: true, payouts });
  } catch (err: any) {
    const isForbidden = err?.message?.includes('FORBIDDEN');
    res.status(isForbidden ? 403 : 500).json({
      success: false,
      error: { code: isForbidden ? 'FORBIDDEN_PAYOUT_ACCESS' : 'FETCH_PAYOUTS_FAILED', message: err?.message || 'Failed to fetch payouts.' },
    });
  }
});

/**
 * GET /api/commerce/sellers/payouts/:payoutId
 * Retrieves details for a specific payout request.
 */
router.get('/sellers/payouts/:payoutId', verifyFirebaseUser, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { payoutId } = req.params;

    const payout = await SellerLedgerService.getPayoutRequest(payoutId, user);
    res.json({ success: true, payout });
  } catch (err: any) {
    const isForbidden = err?.message?.includes('FORBIDDEN');
    const isNotFound = err?.message?.includes('not found');
    res.status(isForbidden ? 403 : isNotFound ? 404 : 500).json({
      success: false,
      error: { code: isForbidden ? 'FORBIDDEN' : isNotFound ? 'NOT_FOUND' : 'FETCH_PAYOUT_FAILED', message: err?.message },
    });
  }
});

/**
 * PATCH /api/commerce/admin/payouts/:payoutId/review
 * Authoritative administrative review of a seller payout request (approve, reject, hold).
 */
router.patch('/admin/payouts/:payoutId/review', verifyFirebaseUser, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { payoutId } = req.params;
    const { action, reason } = req.body;

    if (!action || !['approve', 'reject', 'hold'].includes(action)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_ACTION', message: 'Action must be approve, reject, or hold.' },
      });
      return;
    }

    const payout = await SellerLedgerService.reviewPayoutRequest(payoutId, action, reason, user);
    res.json({ success: true, payout });
  } catch (err: any) {
    const isForbidden = err?.message?.includes('FORBIDDEN');
    const isNotFound = err?.message?.includes('not found');
    const isValidation = err?.message?.includes('required') || err?.message?.includes('Cannot modify');
    res.status(isForbidden ? 403 : isNotFound ? 404 : isValidation ? 400 : 500).json({
      success: false,
      error: { code: isForbidden ? 'FORBIDDEN' : isValidation ? 'VALIDATION_FAILED' : 'PAYOUT_REVIEW_FAILED', message: err?.message },
    });
  }
});

/**
 * POST /api/commerce/admin/payouts/:payoutId/confirm
 * Authoritative payment-provider confirmation or failure recording for an approved payout.
 */
router.post('/admin/payouts/:payoutId/confirm', verifyFirebaseUser, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { payoutId } = req.params;
    const { success, providerReference, failureReason } = req.body;

    if (typeof success !== 'boolean') {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Boolean success field is required.' },
      });
      return;
    }

    const payout = await SellerLedgerService.confirmPayoutProviderResult(
      payoutId,
      { success, providerReference, failureReason },
      user
    );
    res.json({ success: true, payout });
  } catch (err: any) {
    const isForbidden = err?.message?.includes('FORBIDDEN');
    const isNotFound = err?.message?.includes('not found');
    const isValidation = err?.message?.includes('required') || err?.message?.includes('INVALID_PAYOUT_CONFIRMATION_STATE');
    res.status(isForbidden ? 403 : isNotFound ? 404 : isValidation ? 400 : 500).json({
      success: false,
      error: { code: isForbidden ? 'FORBIDDEN' : isValidation ? 'VALIDATION_FAILED' : 'PAYOUT_CONFIRM_FAILED', message: err?.message },
    });
  }
});

/**
 * POST /api/commerce/admin/settlement/release
 * Trigger release of delivered orders into available balances strictly after hold window ends.
 */
router.post('/admin/settlement/release', verifyFirebaseUser, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { orderId } = req.body;
    if (!orderId) {
      res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'orderId is required.' } });
      return;
    }

    const entries = await SellerLedgerService.releaseOrderSettlement(orderId, user);
    res.json({ success: true, releasedEntries: entries });
  } catch (err: any) {
    const msg = err?.message || 'Release failed.';
    const isForbidden = msg.includes('FORBIDDEN');
    const isNotFound = msg.includes('NOT_FOUND');
    const isValidation = msg.includes('SETTLEMENT_');
    res.status(isForbidden ? 403 : isNotFound ? 404 : isValidation ? 400 : 500).json({
      success: false,
      error: { code: isForbidden ? 'FORBIDDEN' : isValidation ? 'SETTLEMENT_NOT_ELIGIBLE' : 'RELEASE_FAILED', message: msg },
    });
  }
});

/**
 * POST /api/commerce/disputes
 * Customer submits an order dispute for their own order.
 */
router.post('/disputes', verifyFirebaseUser, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { orderId, reason, description, evidenceUrls } = req.body;

    const dispute = await DisputeService.createDispute(
      { orderId, reason, description, evidenceUrls },
      user
    );

    res.status(201).json({
      success: true,
      dispute,
    });
  } catch (err: any) {
    const isValidation = err?.message?.includes('required') || err?.message?.includes('not exist');
    res.status(isValidation ? 400 : 403).json({
      success: false,
      error: { code: 'DISPUTE_SUBMISSION_FAILED', message: err?.message || 'Failed to submit dispute.' },
    });
  }
});

/**
 * GET /api/commerce/disputes
 * Lists disputes authorized for the authenticated user (scoped to customer / seller / admin).
 */
router.get('/disputes', verifyFirebaseUser, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { status, sellerId } = req.query;

    const disputes = await DisputeService.listDisputes(
      {
        status: status ? String(status) as any : undefined,
        sellerId: sellerId ? String(sellerId) : undefined,
      },
      user
    );

    res.json({ success: true, disputes });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_DISPUTES_FAILED', message: err?.message || 'Failed to retrieve disputes.' },
    });
  }
});

/**
 * GET /api/commerce/disputes/:id
 * Fetches single dispute details with ownership authorization check.
 */
router.get('/disputes/:id', verifyFirebaseUser, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { id } = req.params;

    const dispute = await DisputeService.getDispute(id, user);
    res.json({ success: true, dispute });
  } catch (err: any) {
    const isNotFound = err?.message?.includes('not found');
    res.status(isNotFound ? 404 : 403).json({
      success: false,
      error: { code: isNotFound ? 'DISPUTE_NOT_FOUND' : 'FORBIDDEN', message: err?.message || 'Access denied.' },
    });
  }
});

// ===========================================================================
// SELLER KYC & VERIFICATION ROUTES
// ===========================================================================

/**
 * GET /api/commerce/kyc/me
 * Retrieves the authenticated seller's KYC verification profile and history.
 */
router.get('/kyc/me', verifyFirebaseUser, async (req: Request, res: Response) => {
  try {
    const data = await KycService.getMyKyc(req.user!);
    res.json({ success: true, ...data });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_KYC_FAILED', message: err?.message || 'Failed to retrieve KYC status.' },
    });
  }
});

/**
 * POST /api/commerce/kyc/submit
 * Submits or resubmits a Seller KYC application (supports individual & business profiles).
 */
router.post('/kyc/submit', verifyFirebaseUser, async (req: Request, res: Response) => {
  try {
    const record = await KycService.submitKycApplication(req.user!, req.body);
    res.status(201).json({ success: true, kyc: record });
  } catch (err: any) {
    const msg = err?.message || 'Failed to submit KYC verification.';
    const isForbidden = msg.includes('SUSPENDED_ACCOUNT');
    res.status(isForbidden ? 403 : 400).json({
      success: false,
      error: { code: isForbidden ? 'FORBIDDEN' : 'KYC_SUBMIT_FAILED', message: msg },
    });
  }
});

/**
 * POST /api/commerce/kyc/documents
 * Uploads a private KYC document (JPEG/PNG/WEBP/PDF <= 5MB) with magic-byte verification.
 */
router.post('/kyc/documents', verifyFirebaseUser, async (req: Request, res: Response) => {
  try {
    const docRecord = await KycService.uploadKycDocument(req.user!, req.body);
    res.status(201).json({ success: true, document: docRecord });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: { code: 'KYC_DOCUMENT_UPLOAD_FAILED', message: err?.message || 'Failed to upload KYC document.' },
    });
  }
});

/**
 * POST /api/commerce/kyc/documents/:sellerId/:docId/token
 * Issues a short-lived (5 min) authorized viewing token for private KYC document access.
 */
router.post('/kyc/documents/:sellerId/:docId/token', verifyFirebaseUser, async (req: Request, res: Response) => {
  try {
    const { sellerId, docId } = req.params;
    const access = await KycService.createDocumentAccessToken(req.user!, sellerId, docId);
    res.json({
      success: true,
      ...access,
      viewUrl: `/api/commerce/kyc/documents/view/${encodeURIComponent(access.token)}`,
    });
  } catch (err: any) {
    const isForbidden = err?.message?.includes('FORBIDDEN');
    const isNotFound = err?.message?.includes('NOT_FOUND');
    res.status(isForbidden ? 403 : isNotFound ? 404 : 400).json({
      success: false,
      error: { code: isForbidden ? 'FORBIDDEN' : 'TOKEN_ISSUE_FAILED', message: err?.message },
    });
  }
});

/**
 * GET /api/commerce/kyc/documents/view/:token
 * Streams a private KYC document using a verified short-lived HMAC-signed access token.
 */
router.get('/kyc/documents/view/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const file = await KycService.resolveDocumentByToken(token);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${file.fileName}"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(file.buffer);
  } catch (err: any) {
    const isExpired = err?.message?.includes('EXPIRED');
    const isInvalid = err?.message?.includes('INVALID');
    res.status(isExpired || isInvalid ? 403 : 404).json({
      success: false,
      error: { code: 'DOCUMENT_ACCESS_DENIED', message: err?.message || 'Unable to access document.' },
    });
  }
});

export default router;
