import express from 'express';
import commerceRoutes from '../server/routes/commerceRoutes';
import adminRoutes from '../server/routes/adminRoutes';
import {
  db,
  doc,
  getDoc,
  setDoc,
  clearServerFirestoreTestStore,
} from '../server/repositories/serverFirestore';
import { SellerLedgerService } from '../server/commerce/sellerLedgerService';
import { AuthenticatedUser } from '../server/auth/roles';
import {
  getCustomerOrderShipments,
  getSellerOwnShipment,
  isValidSafeTrackingUrl,
  normalizeOrderItemsForDisplay,
  validateShipmentFormInput,
} from '../src/utils/orderTrackingUtils';
import { Order } from '../src/types';

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`  [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${msg}`);
    failed++;
  }
}

async function runTests() {
  console.log('==========================================================');
  console.log('APAIBAY SELLER ORDER TRACKING & SHIPPING REGRESSION SUITE');
  console.log('==========================================================\n');

  clearServerFirestoreTestStore();
  SellerLedgerService.clearMemoryLedgerForTesting();

  // 1. Client-side helper unit tests
  console.log('1. Tracking Utils & Validation Unit Checks');
  assert(isValidSafeTrackingUrl('https://tracking.dhl.com/waybill?id=12345'), 'Validates https:// carrier tracking URL');
  assert(isValidSafeTrackingUrl('http://track.cambodiapost.com.kh/CP123'), 'Validates http:// carrier tracking URL');
  assert(!isValidSafeTrackingUrl('javascript:alert(1)'), 'Rejects javascript: tracking URL');
  assert(!isValidSafeTrackingUrl('data:text/html,<script>'), 'Rejects data: tracking URL');
  assert(!isValidSafeTrackingUrl('https://carrier.com/with space'), 'Rejects URL containing spaces');

  assert(
    validateShipmentFormInput({
      carrier: 'DHL Express',
      trackingNumber: 'DHL-88991122',
      trackingUrl: 'https://www.dhl.com/track/DHL-88991122',
      shippedAt: new Date().toISOString(),
    }) === null,
    'validateShipmentFormInput accepts valid shipment payload'
  );
  assert(
    validateShipmentFormInput({
      carrier: 'A',
      trackingNumber: 'DHL-88991122',
    }) !== null,
    'validateShipmentFormInput rejects overly short carrier name'
  );
  assert(
    validateShipmentFormInput({
      carrier: 'FedEx',
      trackingNumber: '!!',
    }) !== null,
    'validateShipmentFormInput rejects invalid tracking number'
  );

  // 2. Setup Express Test App with Commerce + Admin routes
  const app = express();
  app.use(express.json());
  app.use('/api/commerce', commerceRoutes);
  app.use('/api/admin', adminRoutes);

  const server = await new Promise<import('http').Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = (server.address() as any).port;
  const commerceUrl = `http://127.0.0.1:${port}/api/commerce`;
  const adminUrl = `http://127.0.0.1:${port}/api/admin`;

  try {
    const sellerA: AuthenticatedUser = {
      uid: 'seller_a_uid',
      email: 'sellera@example.com',
      role: 'SELLER',
      isSuperAdmin: false,
      isAdmin: false,
      isFinanceManager: false,
      isSupportStaff: false,
      isSeller: true,
      isCustomer: true,
      sellerId: 'seller_a_uid',
      accountStatus: 'active',
    };

    const sellerB: AuthenticatedUser = {
      uid: 'seller_b_uid',
      email: 'sellerb@example.com',
      role: 'SELLER',
      isSuperAdmin: false,
      isAdmin: false,
      isFinanceManager: false,
      isSupportStaff: false,
      isSeller: true,
      isCustomer: true,
      sellerId: 'seller_b_uid',
      accountStatus: 'active',
    };

    const outsiderSeller: AuthenticatedUser = {
      uid: 'seller_outsider_uid',
      email: 'outsider@example.com',
      role: 'SELLER',
      isSuperAdmin: false,
      isAdmin: false,
      isFinanceManager: false,
      isSupportStaff: false,
      isSeller: true,
      isCustomer: true,
      sellerId: 'seller_outsider_uid',
      accountStatus: 'active',
    };

    const expiredSeller: AuthenticatedUser = {
      uid: 'seller_expired_uid',
      email: 'expired@example.com',
      role: 'SELLER',
      isSuperAdmin: false,
      isAdmin: false,
      isFinanceManager: false,
      isSupportStaff: false,
      isSeller: true,
      isCustomer: true,
      sellerId: 'seller_expired_uid',
      accountStatus: 'active',
    };

    const suspendedAccountSeller: AuthenticatedUser = {
      ...sellerA,
      accountStatus: 'suspended',
    };

    const customerUser: AuthenticatedUser = {
      uid: 'customer_buyer_1',
      email: 'buyer@example.com',
      role: 'CUSTOMER',
      isSuperAdmin: false,
      isAdmin: false,
      isFinanceManager: false,
      isSupportStaff: false,
      isSeller: false,
      isCustomer: true,
      accountStatus: 'active',
    };

    const unrelatedCustomer: AuthenticatedUser = {
      uid: 'customer_other_2',
      email: 'otherbuyer@example.com',
      role: 'CUSTOMER',
      isSuperAdmin: false,
      isAdmin: false,
      isFinanceManager: false,
      isSupportStaff: false,
      isSeller: false,
      isCustomer: true,
      accountStatus: 'active',
    };

    const adminUser: AuthenticatedUser = {
      uid: 'admin_uid_1',
      email: 'ops@apaibay.com',
      role: 'ADMIN',
      isSuperAdmin: false,
      isAdmin: true,
      isFinanceManager: false,
      isSupportStaff: false,
      isSeller: false,
      isCustomer: true,
      accountStatus: 'active',
    };

    // Seed seller docs (non-PII public store metadata only)
    await setDoc(doc(db, 'sellers', 'seller_a_uid'), {
      sellerId: 'seller_a_uid',
      storeName: 'Phnom Penh Artisans',
      verificationStatus: 'verified',
      kycStatus: 'VERIFIED',
    });
    await setDoc(doc(db, 'sellers', 'seller_b_uid'), {
      sellerId: 'seller_b_uid',
      storeName: 'Siem Reap Silk House',
      verificationStatus: 'verified',
      kycStatus: 'VERIFIED',
    });
    await setDoc(doc(db, 'sellers', 'seller_outsider_uid'), {
      sellerId: 'seller_outsider_uid',
      storeName: 'Outsider Store',
      verificationStatus: 'verified',
      kycStatus: 'VERIFIED',
    });
    await setDoc(doc(db, 'sellers', 'seller_expired_uid'), {
      sellerId: 'seller_expired_uid',
      storeName: 'Expired Store',
      verificationStatus: 'verified',
      kycStatus: 'EXPIRED',
    });

    // Seed Multi-vendor Order in Placed status (with empty tracking initially)
    const nowIso = new Date().toISOString();
    await setDoc(doc(db, 'orders', 'ORD-MV-100'), {
      id: 'ORD-MV-100',
      customerUid: 'customer_buyer_1',
      customerEmail: 'buyer@example.com',
      date: 'Nov 23, 2026',
      status: 'Placed',
      orderStatus: 'Placed',
      paymentStatus: 'paid',
      carrier: 'FedEx Priority Global',
      trackingNumber: '',
      estimatedDelivery: '3 - 5 business days',
      subtotal: 120,
      shipping: 0,
      discount: 0,
      total: 120,
      shippingAddress: {
        name: 'Sokha Chan',
        street: '12 Norodom Blvd',
        city: 'Phnom Penh',
        country: 'Cambodia',
        phone: '+85512000111',
      },
      items: [
        {
          productId: 'prod_a1',
          name: 'Handmade Ceramic Tea Set',
          unitPrice: 50,
          quantity: 1,
          subtotal: 50,
          sellerId: 'seller_a_uid',
        },
        {
          productId: 'prod_b1',
          name: 'Handwoven Silk Scarf',
          unitPrice: 70,
          quantity: 1,
          subtotal: 70,
          sellerId: 'seller_b_uid',
        },
      ],
      trackingHistory: [
        {
          id: 'evt_init_1',
          status: 'Placed',
          carrier: 'FedEx Priority Global',
          notes: 'Order confirmed.',
          source: 'platform',
          updatedByUid: 'customer_buyer_1',
          createdAt: nowIso,
        },
      ],
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    // Seed Expired Seller Order & Cancelled Order
    await setDoc(doc(db, 'orders', 'ORD-EXP-200'), {
      id: 'ORD-EXP-200',
      customerUid: 'customer_buyer_1',
      status: 'Processing',
      orderStatus: 'Processing',
      items: [{ productId: 'prod_exp', name: 'Expired Item', unitPrice: 30, quantity: 1, subtotal: 30, sellerId: 'seller_expired_uid' }],
      total: 30,
      subtotal: 30,
      shipping: 0,
      discount: 0,
      trackingNumber: '',
      carrier: '',
      estimatedDelivery: '3 - 5 days',
      shippingAddress: { name: 'Sokha', street: 'St 1', city: 'PP', country: 'KH', phone: '012' },
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    await setDoc(doc(db, 'orders', 'ORD-CANC-300'), {
      id: 'ORD-CANC-300',
      customerUid: 'customer_buyer_1',
      status: 'Cancelled',
      orderStatus: 'Cancelled',
      items: [{ productId: 'prod_a2', name: 'Bowl', unitPrice: 20, quantity: 1, subtotal: 20, sellerId: 'seller_a_uid' }],
      total: 20,
      subtotal: 20,
      shipping: 0,
      discount: 0,
      trackingNumber: '',
      carrier: '',
      estimatedDelivery: '3 - 5 days',
      shippingAddress: { name: 'Sokha', street: 'St 1', city: 'PP', country: 'KH', phone: '012' },
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    console.log('\n2. Stage & Transition Enforcement + Input Validation');
    // Cannot add tracking while Placed
    const placedTrackRes = await fetch(`${commerceUrl}/orders/ORD-MV-100/tracking`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-test-user': JSON.stringify(sellerA) },
      body: JSON.stringify({ carrier: 'DHL Express', trackingNumber: 'DHL-111222' }),
    });
    assert(placedTrackRes.status === 400, 'Rejects tracking update while order is still in Placed stage (400)');

    // Cannot jump Placed -> Shipped even via markAsShipped
    const jumpShipRes = await fetch(`${commerceUrl}/orders/ORD-MV-100/tracking`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-test-user': JSON.stringify(sellerA) },
      body: JSON.stringify({ carrier: 'DHL Express', trackingNumber: 'DHL-111222', markAsShipped: true }),
    });
    assert(jumpShipRes.status === 400, 'Rejects illegal transition Placed -> Shipped via tracking endpoint (400)');

    // Transition Placed -> Processing
    const procRes = await fetch(`${commerceUrl}/orders/ORD-MV-100/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-test-user': JSON.stringify(sellerA) },
      body: JSON.stringify({ status: 'Processing' }),
    });
    assert(procRes.status === 200, 'Verified active seller transitions own order Placed -> Processing');

    // Reject dangerous javascript: URL
    const badUrlRes = await fetch(`${commerceUrl}/orders/ORD-MV-100/tracking`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-test-user': JSON.stringify(sellerA) },
      body: JSON.stringify({
        carrier: 'DHL Express',
        trackingNumber: 'DHL-111222',
        trackingUrl: 'javascript:alert(document.cookie)',
      }),
    });
    assert(badUrlRes.status === 400, 'Rejects unsafe javascript: trackingUrl (400)');

    // Reject tracking update on Cancelled order
    const cancTrackRes = await fetch(`${commerceUrl}/orders/ORD-CANC-300/tracking`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-test-user': JSON.stringify(sellerA) },
      body: JSON.stringify({ carrier: 'DHL Express', trackingNumber: 'DHL-999000' }),
    });
    assert(cancTrackRes.status === 400, 'Rejects adding tracking to a Cancelled order (400)');

    console.log('\n3. Seller Ownership, Suspended/Expired Enforcement & Multi-Vendor Isolation');
    // Outsider seller blocked
    const outsiderRes = await fetch(`${commerceUrl}/orders/ORD-MV-100/tracking`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-test-user': JSON.stringify(outsiderSeller) },
      body: JSON.stringify({ carrier: 'DHL Express', trackingNumber: 'DHL-444555' }),
    });
    assert(outsiderRes.status === 403, 'Outsider seller blocked (403) from updating another order tracking');

    // Seller A cannot spoof Seller B's sellerId in body
    const spoofRes = await fetch(`${commerceUrl}/orders/ORD-MV-100/tracking`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-test-user': JSON.stringify(sellerA) },
      body: JSON.stringify({
        sellerId: 'seller_b_uid',
        carrier: 'DHL Express',
        trackingNumber: 'DHL-SPOOF',
      }),
    });
    assert(spoofRes.status === 403, 'Seller A blocked (403) from spoofing Seller B shipment slot');

    // Expired KYC seller blocked
    const expiredRes = await fetch(`${commerceUrl}/orders/ORD-EXP-200/tracking`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-test-user': JSON.stringify(expiredSeller) },
      body: JSON.stringify({ carrier: 'J&T Express', trackingNumber: 'JT-123456' }),
    });
    assert(expiredRes.status === 403, 'Expired KYC seller blocked (403) from adding shipping tracking');

    // Suspended account blocked
    const suspRes = await fetch(`${commerceUrl}/orders/ORD-MV-100/tracking`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-test-user': JSON.stringify(suspendedAccountSeller) },
      body: JSON.stringify({ carrier: 'DHL Express', trackingNumber: 'DHL-SUSP' }),
    });
    assert(suspRes.status === 403, 'Suspended seller account blocked (403) from modifying tracking');

    // Seller A records valid tracking & marks Shipped
    const shipDateA = '2026-11-23T10:00:00.000Z';
    const trackARes = await fetch(`${commerceUrl}/orders/ORD-MV-100/tracking`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-test-user': JSON.stringify(sellerA) },
      body: JSON.stringify({
        carrier: 'DHL Express',
        trackingNumber: 'DHL-AA112233',
        trackingUrl: 'https://www.dhl.com/track?id=DHL-AA112233',
        shippedAt: shipDateA,
        notes: 'Handed over at Phnom Penh hub',
        markAsShipped: true,
      }),
    });
    const trackAJson = await trackARes.json();
    assert(
      trackARes.status === 200 &&
        trackAJson.order?.status === 'Shipped' &&
        trackAJson.order?.sellerShipments?.seller_a_uid?.trackingNumber === 'DHL-AA112233',
      'Seller A records valid tracking + marks order Shipped'
    );
    assert(trackAJson.order?.customerEmail === undefined, 'Seller response redacts customerEmail PII');

    // Seller B records their own shipment on the SAME multi-vendor order without overwriting Seller A
    const shipDateB = '2026-11-23T11:30:00.000Z';
    const trackBRes = await fetch(`${commerceUrl}/orders/ORD-MV-100/tracking`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-test-user': JSON.stringify(sellerB) },
      body: JSON.stringify({
        carrier: 'Virak Buntham Express',
        trackingNumber: 'VB-77889900',
        trackingUrl: 'https://virakbuntham.example.com/track/VB-77889900',
        shippedAt: shipDateB,
      }),
    });
    const trackBJson = await trackBRes.json();
    assert(
      trackBRes.status === 200 &&
        trackBJson.order?.sellerShipments?.seller_b_uid?.trackingNumber === 'VB-77889900' &&
        trackBJson.order?.sellerShipments?.seller_a_uid === undefined,
      'Seller B records own shipment and Seller B view does not leak Seller A shipment'
    );

    // Check raw DB preserved BOTH shipments and intact line items
    const rawOrderSnap = await getDoc(doc(db, 'orders', 'ORD-MV-100'));
    const rawOrder = rawOrderSnap.data() as any;
    assert(
      rawOrder.sellerShipments?.seller_a_uid?.trackingNumber === 'DHL-AA112233' &&
        rawOrder.sellerShipments?.seller_b_uid?.trackingNumber === 'VB-77889900',
      'Multi-vendor order stores isolated shipments for Seller A and Seller B simultaneously'
    );
    assert(
      rawOrder.items?.length === 2 && rawOrder.total === 120,
      'Historical order line items and total preserved intact'
    );

    // Seller cannot self-mark Delivered
    const sellerDelivRes = await fetch(`${commerceUrl}/orders/ORD-MV-100/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-test-user': JSON.stringify(sellerA) },
      body: JSON.stringify({ status: 'Delivered' }),
    });
    assert(sellerDelivRes.status === 400 || sellerDelivRes.status === 403, 'Seller blocked from self-marking order Delivered');

    console.log('\n4. Customer Visibility, Tracking History Preservation & Duplicate Notification Prevention');
    // Unrelated customer cannot view order
    const unauthCustRes = await fetch(`${commerceUrl}/orders/ORD-MV-100`, {
      headers: { 'x-test-user': JSON.stringify(unrelatedCustomer) },
    });
    assert(unauthCustRes.status === 403, 'Unrelated customer blocked (403) from viewing order tracking');

    // Owning customer views full multi-vendor shipments & tracking history without internal UIDs
    const custOrderRes = await fetch(`${commerceUrl}/orders/ORD-MV-100`, {
      headers: { 'x-test-user': JSON.stringify(customerUser) },
    });
    const custOrderJson = await custOrderRes.json();
    const custOrder = custOrderJson.order as Order;
    const custShipments = getCustomerOrderShipments(custOrder);
    const displayItems = normalizeOrderItemsForDisplay(custOrder);

    assert(custOrderRes.status === 200 && custShipments.length === 2, 'Customer receives both merchant shipments on multi-vendor order');
    assert(
      custShipments.some((s) => s.sellerStoreName === 'Phnom Penh Artisans' && s.trackingNumber === 'DHL-AA112233') &&
        custShipments.some((s) => s.sellerStoreName === 'Siem Reap Silk House' && s.trackingNumber === 'VB-77889900'),
      'Customer shipments show public store names & carrier tracking without seller PII'
    );
    assert(
      Array.isArray(custOrder.trackingHistory) &&
        custOrder.trackingHistory.length >= 4 &&
        custOrder.trackingHistory.every((evt) => evt.updatedByUid === undefined),
      'Customer trackingHistory preserves all events chronologically and strips internal updatedByUid'
    );
    assert(
      custOrder.trackingHistory!.some((e) => e.source === 'seller_manual') &&
        custOrder.trackingHistory!.some((e) => e.source === 'platform'),
      'Tracking history distinguishes seller_manual updates from platform events'
    );
    assert(
      displayItems.length === 2 && displayItems[0].unitPrice === 50 && displayItems[1].unitPrice === 70,
      'normalizeOrderItemsForDisplay renders OrderItemSnapshot prices accurately'
    );

    // Verify Seller A's isolated helper only returns Seller A's shipment
    const sellerAScopedRes = await fetch(`${commerceUrl}/orders/ORD-MV-100`, {
      headers: { 'x-test-user': JSON.stringify(sellerA) },
    });
    const sellerAScopedOrder = (await sellerAScopedRes.json()).order as Order;
    const ownOnly = getSellerOwnShipment(sellerAScopedOrder, 'seller_a_uid');
    assert(
      ownOnly?.trackingNumber === 'DHL-AA112233' && !sellerAScopedOrder.sellerShipments?.seller_b_uid,
      'GET /api/commerce/orders/:id isolates Seller A from Seller B shipment info'
    );

    // Check notifications before and after a duplicate identical tracking update
    const notifsBeforeRes = await fetch(`${commerceUrl}/notifications`, {
      headers: { 'x-test-user': JSON.stringify(customerUser) },
    });
    const notifsBeforeJson = await notifsBeforeRes.json();
    const countBefore = notifsBeforeJson.notifications.length;
    assert(notifsBeforeRes.status === 200 && countBefore >= 3, 'Customer receives in-app notifications for status & seller tracking updates');

    // Repeat IDENTICAL tracking update for Seller B -> should NOT create duplicate notification
    const dupTrackRes = await fetch(`${commerceUrl}/orders/ORD-MV-100/tracking`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-test-user': JSON.stringify(sellerB) },
      body: JSON.stringify({
        carrier: 'Virak Buntham Express',
        trackingNumber: 'VB-77889900',
        trackingUrl: 'https://virakbuntham.example.com/track/VB-77889900',
        shippedAt: shipDateB,
      }),
    });
    assert(dupTrackRes.status === 200, 'Repeated tracking update succeeds cleanly');

    const notifsAfterDupRes = await fetch(`${commerceUrl}/notifications`, {
      headers: { 'x-test-user': JSON.stringify(customerUser) },
    });
    const notifsAfterDupJson = await notifsAfterDupRes.json();
    assert(
      notifsAfterDupJson.notifications.length === countBefore,
      'Duplicate notification prevented when tracking payload is unchanged'
    );

    // Distinct update DOES create 1 new notification
    const distinctTrackRes = await fetch(`${commerceUrl}/orders/ORD-MV-100/tracking`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-test-user': JSON.stringify(sellerB) },
      body: JSON.stringify({
        carrier: 'Virak Buntham Express',
        trackingNumber: 'VB-77889999-CORRECTED',
        trackingUrl: 'https://virakbuntham.example.com/track/VB-77889999-CORRECTED',
        shippedAt: shipDateB,
      }),
    });
    assert(distinctTrackRes.status === 200, 'Distinct updated tracking number succeeds');

    const notifsAfterNewRes = await fetch(`${commerceUrl}/notifications`, {
      headers: { 'x-test-user': JSON.stringify(customerUser) },
    });
    const notifsAfterNewJson = await notifsAfterNewRes.json();
    assert(
      notifsAfterNewJson.notifications.length === countBefore + 1,
      'New notification emitted when tracking number changes'
    );

    // Notification ownership enforcement
    const firstNotifId = notifsAfterNewJson.notifications[0].id;
    const otherReadRes = await fetch(`${commerceUrl}/notifications/${firstNotifId}/read`, {
      method: 'PATCH',
      headers: { 'x-test-user': JSON.stringify(unrelatedCustomer) },
    });
    assert(otherReadRes.status === 403, 'Unrelated user blocked (403) from marking customer notification read');

    const ownerReadRes = await fetch(`${commerceUrl}/notifications/${firstNotifId}/read`, {
      method: 'PATCH',
      headers: { 'x-test-user': JSON.stringify(customerUser) },
    });
    assert(ownerReadRes.status === 200, 'Customer can mark own order notification as read');

    // Admin transitions Shipped -> Delivered and blocks further tracking edits
    const adminDelivRes = await fetch(`${adminUrl}/orders/ORD-MV-100/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-test-user': JSON.stringify(adminUser) },
      body: JSON.stringify({ status: 'Delivered', reason: 'Confirmed delivery receipt' }),
    });
    assert(adminDelivRes.status === 200, 'Admin can mark Shipped order as Delivered');

    const postDelivTrackRes = await fetch(`${commerceUrl}/orders/ORD-MV-100/tracking`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-test-user': JSON.stringify(sellerA) },
      body: JSON.stringify({ carrier: 'DHL Express', trackingNumber: 'DHL-LATE-EDIT' }),
    });
    assert(postDelivTrackRes.status === 400, 'Blocks editing tracking after order reaches terminal Delivered status (400)');
  } finally {
    server.close();
  }

  console.log('\n==========================================================');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('==========================================================');
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
