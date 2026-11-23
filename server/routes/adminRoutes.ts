import express, { Request, Response } from 'express';
import {
  db,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
  getAdminAuth,
} from '../repositories/serverFirestore';
import { verifyFirebaseUser, requirePermission } from '../auth/verifyFirebaseUser';
import {
  CanonicalRole,
  normalizeRole,
  BOOTSTRAP_ADMIN_EMAIL,
  hasPermission,
} from '../auth/roles';
import { AdminActivityLogService, AdminAuditAction } from '../admin/adminActivityLogService';
import { DisputeService, DisputeStatus, DisputeReason } from '../commerce/disputeService';
import { SystemHealthService } from '../admin/systemHealthService';
import { createRateLimiter } from '../auth/rateLimiter';
import { SellerLedgerService } from '../commerce/sellerLedgerService';
import { KycService } from '../commerce/kycService';
import { validateStatusTransition, normalizeStatus } from '../commerce/orderLifecycle';
import { applyOrderStatusTransition } from '../commerce/orderTrackingService';

const router = express.Router();

// Apply administrative rate limiting (120 req/min per IP/admin)
router.use(createRateLimiter({ windowMs: 60000, maxRequests: 120, keyPrefix: 'admin' }));

// ---------------------------------------------------------------------------
// 1. ROLE & PERMISSIONS MANAGEMENT
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/roles
 * Lists administrative users and their assigned roles.
 * Clearance: Any admin can view; only Super Admin can edit.
 */
router.get('/roles', verifyFirebaseUser, async (req: Request, res: Response) => {
  if (!req.user?.isAdmin) {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Admin clearance required.' } });
    return;
  }

  try {
    const adminsCol = collection(db, 'admins');
    const snap = await getDocs(adminsCol);
    const adminDocs = snap.docs.map((d: any) => ({
      uid: d.id,
      ...d.data(),
    }));

    // Ensure bootstrap super admin is always represented
    const bootstrapPresent = adminDocs.some(
      (a: any) => a.email && a.email.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase()
    );

    if (!bootstrapPresent) {
      adminDocs.unshift({
        uid: 'bootstrap-super-admin',
        email: BOOTSTRAP_ADMIN_EMAIL,
        role: 'SUPER_ADMIN',
        assignedBy: 'System Bootstrap',
        assignedAt: new Date().toISOString(),
        isBootstrap: true,
      });
    }

    res.json({
      success: true,
      data: adminDocs,
      users: adminDocs,
      currentUserRole: req.user.role,
      isSuperAdmin: req.user.isSuperAdmin,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'ROLES_FETCH_FAILED', message: err.message } });
  }
});

/**
 * PUT /api/admin/roles/:uid
 * Updates a user's administrative role.
 * Clearance: SUPER_ADMIN ONLY.
 * Security Protections:
 * - Prevents self-role mutation (cannot promote self or alter own role).
 * - Prevents altering or demoting the bootstrap primary super admin.
 * - Records append-only admin activity log.
 */
router.put('/roles/:uid', verifyFirebaseUser, requirePermission('manage_roles'), async (req: Request, res: Response) => {
  const targetUid = req.params.uid;
  const { newRole, email } = req.body;

  if (!targetUid || typeof targetUid !== 'string') {
    res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'Target user UID is required.' } });
    return;
  }

  if (!newRole || typeof newRole !== 'string') {
    res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'newRole is required.' } });
    return;
  }

  // 1. Self-mutation guard (prevents privilege escalation or accidental lockout)
  if (targetUid === req.user!.uid) {
    res.status(400).json({
      success: false,
      error: {
        code: 'CANNOT_MUTATE_SELF_ROLE',
        message: 'Administrators cannot alter their own administrative privileges.',
      },
    });
    return;
  }

  // 2. Bootstrap Super Admin immutability guard
  const targetDocRef = doc(db, 'admins', targetUid);
  const currentSnap = await getDoc(targetDocRef);
  const currentData = currentSnap.exists() ? currentSnap.data() : null;
  const targetEmail = (email || currentData?.email || '').toLowerCase();

  if (targetEmail === BOOTSTRAP_ADMIN_EMAIL.toLowerCase()) {
    res.status(400).json({
      success: false,
      error: {
        code: 'BOOTSTRAP_ADMIN_IMMUTABLE',
        message: 'The primary marketplace super administrator account cannot be altered or demoted.',
      },
    });
    return;
  }

  const canonicalRole = normalizeRole(newRole);
  const now = new Date().toISOString();

  // If role is CUSTOMER, remove from admins collection
  if (canonicalRole === 'CUSTOMER') {
    if (currentSnap.exists()) {
      await deleteDoc(targetDocRef);
    }
  } else {
    // Write to /admins/{targetUid}
    await setDoc(targetDocRef, {
      uid: targetUid,
      email: targetEmail || currentData?.email || '',
      role: canonicalRole,
      assignedBy: req.user!.email || req.user!.uid,
      assignedAt: now,
      updatedAt: now,
    });
  }

  // Also update /users/{targetUid} role field for consistent profile reflection
  try {
    const userDocRef = doc(db, 'users', targetUid);
    const userSnap = await getDoc(userDocRef);
    if (userSnap.exists()) {
      await updateDoc(userDocRef, {
        role: canonicalRole.toLowerCase(),
        adminRole: canonicalRole,
        updatedAt: now,
      });
    }
  } catch {}

  // Log in append-only administrative audit log
  await AdminActivityLogService.logAction({
    admin: req.user!,
    action: 'ROLE_UPDATE',
    targetResourceId: targetUid,
    targetResourceType: 'role',
    previousValue: { role: currentData?.role || 'CUSTOMER' },
    newValue: { role: canonicalRole },
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    metadata: { targetEmail, assignedBy: req.user!.email },
  });

  res.json({
    success: true,
    data: {
      uid: targetUid,
      role: canonicalRole,
      email: targetEmail,
      assignedAt: now,
    },
    message: `Role for user ${targetEmail || targetUid} updated to ${canonicalRole}.`,
  });
});

// ---------------------------------------------------------------------------
// 2. ADMIN ACTIVITY AUDIT LOG
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/audit-logs
 * Retrieves immutable administrative audit logs with optional filtering.
 * Clearance: Super Admin, Admin, Finance Manager.
 */
router.get('/audit-logs', verifyFirebaseUser, requirePermission('view_audit_logs'), async (req: Request, res: Response) => {
  try {
    const { action, targetResourceType, adminUid, limit } = req.query;
    const logs = await AdminActivityLogService.listLogs({
      action: action ? (String(action) as AdminAuditAction) : undefined,
      targetResourceType: targetResourceType ? String(targetResourceType) : undefined,
      adminUid: adminUid ? String(adminUid) : undefined,
      limitCount: limit ? parseInt(String(limit), 10) : 100,
    });

    res.json({
      success: true,
      data: logs,
      logs: logs,
      count: logs.length,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'LOGS_FETCH_FAILED', message: err.message } });
  }
});

// ---------------------------------------------------------------------------
// 3. DISPUTES & REFUND MANAGEMENT
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/disputes
 * Lists order disputes for administrative review.
 * Clearance: Super Admin, Admin, Support Staff, Finance Manager.
 */
router.get('/disputes', verifyFirebaseUser, requirePermission('manage_disputes'), async (req: Request, res: Response) => {
  try {
    const { status, sellerId } = req.query;
    const list = await DisputeService.listDisputes(
      {
        status: status ? (String(status) as DisputeStatus) : undefined,
        sellerId: sellerId ? String(sellerId) : undefined,
      },
      req.user!
    );

    res.json({
      success: true,
      data: list,
      disputes: list,
      count: list.length,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DISPUTES_FETCH_FAILED', message: err.message } });
  }
});

/**
 * GET /api/admin/disputes/:id
 * Retrieves dispute details.
 */
router.get('/disputes/:id', verifyFirebaseUser, async (req: Request, res: Response) => {
  try {
    const dispute = await DisputeService.getDispute(req.params.id, req.user!);
    res.json({ success: true, data: dispute, dispute: dispute });
  } catch (err: any) {
    res.status(404).json({ success: false, error: { code: 'DISPUTE_NOT_FOUND', message: err.message } });
  }
});

/**
 * PATCH /api/admin/disputes/:id
 * Updates dispute status or internal notes.
 * Clearance: Super Admin, Admin, Support Staff.
 */
router.patch('/disputes/:id', verifyFirebaseUser, requirePermission('manage_disputes'), async (req: Request, res: Response) => {
  try {
    const { status, adminNotes } = req.body;
    if (!status) {
      res.status(400).json({ success: false, error: { code: 'INVALID_STATUS', message: 'Status is required.' } });
      return;
    }

    const updated = await DisputeService.updateDisputeStatus(
      req.params.id,
      status as DisputeStatus,
      adminNotes,
      req.user!
    );

    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { code: 'DISPUTE_UPDATE_FAILED', message: err.message } });
  }
});

/**
 * POST /api/admin/disputes/:id/refund
 * Authoritatively executes a refund for a dispute via PaymentService.
 * Clearance: Super Admin, Admin, Finance Manager.
 * Security Invariants:
 * - Calls PaymentService.refundPayment to enforce authoritative gateway confirmation.
 * - Idempotently rejects duplicate refunds on already-refunded disputes.
 * - Writes immutable audit log.
 */
router.post('/disputes/:id/refund', verifyFirebaseUser, requirePermission('issue_refunds'), async (req: Request, res: Response) => {
  try {
    const { refundAmount, reason } = req.body;
    const result = await DisputeService.resolveWithRefund(
      req.params.id,
      refundAmount !== undefined ? parseFloat(refundAmount) : undefined,
      reason,
      req.user!
    );

    res.json({
      success: true,
      data: result.dispute,
      refundReference: result.refundReference,
      message: 'Dispute refund executed authoritatively and synchronized with seller ledger.',
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { code: 'REFUND_FAILED', message: err.message } });
  }
});

// ---------------------------------------------------------------------------
// 4. USERS MANAGEMENT
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/users
 * Lists marketplace users (customers, sellers, staff).
 * Clearance: Super Admin, Admin.
 */
router.get('/users', verifyFirebaseUser, requirePermission('manage_users'), async (req: Request, res: Response) => {
  try {
    const usersCol = collection(db, 'users');
    const snap = await getDocs(usersCol);
    const users = snap.docs.map((d: any) => ({
      uid: d.id,
      ...d.data(),
    }));

    res.json({
      success: true,
      data: users,
      users: users,
      count: users.length,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'USERS_FETCH_FAILED', message: err.message } });
  }
});

/**
 * PATCH /api/admin/users/:uid/status
 * Suspends or reactivates a user.
 * Clearance: Super Admin, Admin.
 */
router.patch('/users/:uid/status', verifyFirebaseUser, requirePermission('manage_users'), async (req: Request, res: Response) => {
  const targetUid = req.params.uid;
  const { status, reason } = req.body;

  if (status !== 'active' && status !== 'suspended') {
    res.status(400).json({ success: false, error: { code: 'INVALID_STATUS', message: 'Status must be active or suspended.' } });
    return;
  }

  // Prevent suspending bootstrap admin
  const userRef = doc(db, 'users', targetUid);
  const snap = await getDoc(userRef);
  const userData = snap.exists() ? snap.data() : null;

  if (userData?.email && userData.email.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase()) {
    res.status(400).json({ success: false, error: { code: 'CANNOT_SUSPEND_BOOTSTRAP', message: 'Cannot suspend primary super admin.' } });
    return;
  }

  const now = new Date().toISOString();
  await setDoc(
    userRef,
    {
      uid: targetUid,
      status,
      statusReason: reason || null,
      statusUpdatedAt: now,
      statusUpdatedBy: req.user!.email || req.user!.uid,
      updatedAt: now,
    },
    { merge: true }
  );

  // Immediately revoke Firebase refresh tokens when suspending a user
  if (status === 'suspended') {
    try {
      const adminAuth = getAdminAuth() as any;
      if (typeof adminAuth?.revokeRefreshTokens === 'function') {
        await adminAuth.revokeRefreshTokens(targetUid);
      }
    } catch (revokeErr: any) {
      console.warn('[AdminRoutes] Non-blocking token revocation note:', revokeErr?.message || revokeErr);
    }
  }

  await AdminActivityLogService.logAction({
    admin: req.user!,
    action: status === 'suspended' ? 'USER_SUSPEND' : 'USER_REACTIVATE',
    targetResourceId: targetUid,
    targetResourceType: 'user',
    previousValue: { status: userData?.status || 'active' },
    newValue: { status, reason },
    metadata: { email: userData?.email },
  });

  res.json({
    success: true,
    message: `User ${targetUid} marked as ${status}.`,
  });
});

// ---------------------------------------------------------------------------
// 5. PRODUCTS & INVENTORY MANAGEMENT
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/products
 * Lists all catalog products with seller details and inventory levels.
 * Clearance: Super Admin, Admin.
 */
router.get('/products', verifyFirebaseUser, requirePermission('manage_products'), async (req: Request, res: Response) => {
  try {
    const colRef = collection(db, 'products');
    const snap = await getDocs(colRef);
    const products = snap.docs.map((d: any) => ({
      id: d.id,
      ...d.data(),
    }));

    res.json({
      success: true,
      data: products,
      products: products,
      count: products.length,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'PRODUCTS_FETCH_FAILED', message: err.message } });
  }
});

/**
 * DELETE /api/admin/products/:id
 * Compliance removal of a product listing.
 * Clearance: Super Admin, Admin.
 */
router.delete('/products/:id', verifyFirebaseUser, requirePermission('manage_products'), async (req: Request, res: Response) => {
  const productId = req.params.id;
  const prodRef = doc(db, 'products', productId);
  const snap = await getDoc(prodRef);

  if (!snap.exists()) {
    res.status(404).json({ success: false, error: { code: 'PRODUCT_NOT_FOUND', message: 'Product not found.' } });
    return;
  }

  const prev = snap.data();
  await deleteDoc(prodRef);

  await AdminActivityLogService.logAction({
    admin: req.user!,
    action: 'PRODUCT_REMOVE',
    targetResourceId: productId,
    targetResourceType: 'product',
    previousValue: prev,
    metadata: { reason: req.body?.reason || 'Compliance removal' },
  });

  res.json({ success: true, message: `Product ${productId} removed.` });
});

// ---------------------------------------------------------------------------
// 6. ORDERS MANAGEMENT
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/orders
 * Lists all marketplace orders across all merchants.
 * Clearance: Super Admin, Admin, Support Staff.
 */
router.get('/orders', verifyFirebaseUser, requirePermission('manage_orders'), async (req: Request, res: Response) => {
  try {
    const ordersCol = collection(db, 'orders');
    const snap = await getDocs(ordersCol);
    const orders = snap.docs.map((d: any) => ({
      id: d.id,
      ...d.data(),
    }));

    orders.sort((a: any, b: any) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime());

    res.json({
      success: true,
      data: orders,
      orders: orders,
      count: orders.length,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'ORDERS_FETCH_FAILED', message: err.message } });
  }
});

/**
 * PATCH /api/admin/orders/:id/status
 * Administrative override of order status.
 * Clearance: Super Admin, Admin, Support Staff.
 */
router.patch('/orders/:id/status', verifyFirebaseUser, requirePermission('manage_orders'), async (req: Request, res: Response) => {
  const orderId = req.params.id;
  const { status, reason } = req.body;

  const orderRef = doc(db, 'orders', orderId);
  const prevSnap = await getDoc(orderRef);
  const prevStatus = prevSnap.exists() ? (prevSnap.data() as any).status : undefined;

  const result = await applyOrderStatusTransition(orderId, req.body, req.user!);
  if (!result.ok) {
    res.status(result.status).json({
      success: false,
      error: {
        code: result.code || 'INVALID_STATUS_TRANSITION',
        message: result.message || 'Status transition rejected by order lifecycle state machine.',
      },
    });
    return;
  }

  const canonicalNewStatus = result.order?.status || normalizeStatus(status);

  await AdminActivityLogService.logAction({
    admin: req.user!,
    action: 'ORDER_STATUS_UPDATE',
    targetResourceId: orderId,
    targetResourceType: 'order',
    previousValue: { status: prevStatus },
    newValue: { status: canonicalNewStatus, reason },
  });

  res.json({
    success: true,
    status: canonicalNewStatus,
    order: result.order,
    message: `Order #${orderId} status updated to ${canonicalNewStatus}.`,
  });
});

// ---------------------------------------------------------------------------
// 7. SYSTEM HEALTH MONITOR
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/health
 * Authoritative, non-secret diagnostic overview of system health.
 * Clearance: Super Admin, Admin.
 */
router.get('/health', verifyFirebaseUser, requirePermission('view_system_health'), async (req: Request, res: Response) => {
  try {
    const report = await SystemHealthService.checkSystemHealth();
    res.json({
      success: true,
      data: report,
      report: report,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'HEALTH_CHECK_FAILED', message: err.message },
    });
  }
});

// ---------------------------------------------------------------------------
// 8. SELLER PAYOUTS MANAGEMENT
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/payouts
 * Lists all seller payout requests.
 * Clearance: Super Admin, Admin, Finance Manager.
 */
router.get('/payouts', verifyFirebaseUser, requirePermission('view_financials'), async (req: Request, res: Response) => {
  try {
    const { status, sellerId } = req.query;
    const payouts = await SellerLedgerService.listPayoutRequests(
      {
        status: status ? (String(status) as any) : undefined,
        sellerId: sellerId ? String(sellerId) : undefined,
      },
      req.user!
    );
    res.json({
      success: true,
      data: payouts,
      payouts,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'FETCH_PAYOUTS_FAILED', message: err.message } });
  }
});

/**
 * PATCH /api/admin/payouts/:payoutId/review
 * Approves, rejects, or holds a seller payout request.
 * Clearance: Super Admin, Finance Manager, Admin.
 */
router.patch('/payouts/:payoutId/review', verifyFirebaseUser, requirePermission('manage_payouts'), async (req: Request, res: Response) => {
  try {
    const { payoutId } = req.params;
    const { action, reason } = req.body;

    if (!action || !['approve', 'reject', 'hold'].includes(action)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_ACTION', message: 'Action must be approve, reject, or hold.' },
      });
      return;
    }

    const payout = await SellerLedgerService.reviewPayoutRequest(payoutId, action, reason, req.user!);
    res.json({ success: true, payout, data: payout });
  } catch (err: any) {
    const isValidation = err?.message?.includes('required') || err?.message?.includes('Cannot modify');
    res.status(isValidation ? 400 : 500).json({
      success: false,
      error: { code: isValidation ? 'VALIDATION_FAILED' : 'PAYOUT_REVIEW_FAILED', message: err.message },
    });
  }
});

/**
 * POST /api/admin/payouts/:payoutId/confirm
 * Authoritative payment-provider confirmation or failure recording for an approved payout.
 * Clearance: Super Admin, Finance Manager, Admin.
 */
router.post('/payouts/:payoutId/confirm', verifyFirebaseUser, requirePermission('manage_payouts'), async (req: Request, res: Response) => {
  try {
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
      req.user!
    );
    res.json({ success: true, payout, data: payout });
  } catch (err: any) {
    const isValidation = err?.message?.includes('required') || err?.message?.includes('INVALID_PAYOUT_CONFIRMATION_STATE');
    res.status(isValidation ? 400 : 500).json({
      success: false,
      error: { code: isValidation ? 'VALIDATION_FAILED' : 'PAYOUT_CONFIRM_FAILED', message: err.message },
    });
  }
});

/**
 * POST /api/admin/settlement/release
 * Releases matured settlement balances strictly after delivery and dispute/return hold period.
 * Clearance: Super Admin, Finance Manager, Admin.
 */
router.post('/settlement/release', verifyFirebaseUser, requirePermission('manage_payouts'), async (req: Request, res: Response) => {
  try {
    const { orderId } = req.body;
    if (!orderId) {
      res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'orderId is required.' } });
      return;
    }

    const releasedEntries = await SellerLedgerService.releaseOrderSettlement(orderId, req.user!);
    res.json({ success: true, releasedEntries });
  } catch (err: any) {
    const isValidation = err?.message?.includes('SETTLEMENT_');
    res.status(isValidation ? 400 : 500).json({
      success: false,
      error: { code: isValidation ? 'SETTLEMENT_NOT_ELIGIBLE' : 'RELEASE_FAILED', message: err.message },
    });
  }
});

/**
 * PATCH /api/admin/commission-rate
 * Updates platform default or seller-specific commission rate.
 * Clearance: Super Admin, Finance Manager, Admin.
 */
router.patch('/commission-rate', verifyFirebaseUser, requirePermission('manage_payouts'), async (req: Request, res: Response) => {
  try {
    const { rate, sellerId } = req.body;
    const result = await SellerLedgerService.updateCommissionRate(Number(rate), req.user!, sellerId);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: { code: 'COMMISSION_UPDATE_FAILED', message: err.message },
    });
  }
});

// ---------------------------------------------------------------------------
// 9. SELLER KYC & VERIFICATION REVIEW
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/kyc
 * Lists KYC applications for authorized reviewers (SUPER_ADMIN / ADMIN only).
 */
router.get('/kyc', verifyFirebaseUser, requirePermission('kyc:read'), async (req: Request, res: Response) => {
  try {
    const status = req.query.status ? String(req.query.status) : undefined;
    const applications = await KycService.listKycApplications(req.user!, {
      status: status as any,
    });
    res.json({ success: true, applications, data: applications });
  } catch (err: any) {
    res.status(err?.message?.includes('FORBIDDEN') ? 403 : 500).json({
      success: false,
      error: { code: 'KYC_LIST_FAILED', message: err.message },
    });
  }
});

/**
 * GET /api/admin/kyc/:sellerId
 * Fetches KYC profile, verification sub-statuses, masked fields, and history log.
 */
router.get('/kyc/:sellerId', verifyFirebaseUser, requirePermission('kyc:read'), async (req: Request, res: Response) => {
  try {
    const detail = await KycService.getKycDetail(req.user!, req.params.sellerId);
    res.json({ success: true, ...detail });
  } catch (err: any) {
    const isNotFound = err?.message?.includes('KYC_NOT_FOUND');
    res.status(isNotFound ? 404 : 403).json({
      success: false,
      error: { code: isNotFound ? 'NOT_FOUND' : 'KYC_DETAIL_FAILED', message: err.message },
    });
  }
});

/**
 * PATCH /api/admin/kyc/:sellerId/review
 * Approves, rejects, marks under review, requests info, suspends, or expires KYC.
 */
router.patch('/kyc/:sellerId/review', verifyFirebaseUser, requirePermission('kyc:review'), async (req: Request, res: Response) => {
  try {
    const { action, reason, phoneVerified, payoutOwnershipVerified, expiresInDays } = req.body;
    const validActions = ['approve', 'reject', 'under_review', 'request_info', 'suspend', 'expire'];
    if (!action || !validActions.includes(action)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_ACTION', message: `Action must be one of: ${validActions.join(', ')}` },
      });
      return;
    }

    const updated = await KycService.reviewKycApplication(req.user!, req.params.sellerId, {
      action,
      reason,
      phoneVerified,
      payoutOwnershipVerified,
      expiresInDays,
    });
    res.json({ success: true, kyc: updated, data: updated });
  } catch (err: any) {
    const isForbidden = err?.message?.includes('FORBIDDEN');
    const isNotFound = err?.message?.includes('KYC_NOT_FOUND');
    res.status(isForbidden ? 403 : isNotFound ? 404 : 400).json({
      success: false,
      error: { code: isForbidden ? 'FORBIDDEN' : 'KYC_REVIEW_FAILED', message: err.message },
    });
  }
});

/**
 * POST /api/admin/kyc/:sellerId/documents/:docId/token
 * Issues a short-lived authorized view token for an admin reviewer and audits access.
 */
router.post(
  '/kyc/:sellerId/documents/:docId/token',
  verifyFirebaseUser,
  requirePermission('kyc:view_documents'),
  async (req: Request, res: Response) => {
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
        error: { code: isForbidden ? 'FORBIDDEN' : 'DOCUMENT_TOKEN_FAILED', message: err.message },
      });
    }
  }
);

/**
 * POST /api/admin/kyc/retention/purge
 * Purges expired document binaries past retention policy window.
 */
router.post('/kyc/retention/purge', verifyFirebaseUser, requirePermission('kyc:review'), async (req: Request, res: Response) => {
  try {
    const result = await KycService.purgeExpiredDocuments(req.user!);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(403).json({
      success: false,
      error: { code: 'PURGE_FAILED', message: err.message },
    });
  }
});

export default router;
