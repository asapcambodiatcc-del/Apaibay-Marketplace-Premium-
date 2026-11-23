import express from 'express';
import commerceRoutes from '../server/routes/commerceRoutes';
import { db, doc, setDoc, clearServerFirestoreTestStore } from '../server/repositories/serverFirestore';
import { SellerLedgerService } from '../server/commerce/sellerLedgerService';
import { AuthenticatedUser } from '../server/auth/roles';
import {
  computeInventoryHealth,
  computePeriodSalesMetrics,
  getSellerOrderItems,
  normalizeDisplayOrderStatus,
} from '../src/components/seller/sellerUtils';
import { Order, Product, SellerLedgerEntry, SellerFinancialSummary } from '../src/types';

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
  console.log('====================================================');
  console.log('APAIBAY SELLER CENTER & DASHBOARD REGRESSION SUITE');
  console.log('====================================================\n');

  clearServerFirestoreTestStore();
  SellerLedgerService.clearMemoryLedgerForTesting();

  // 1. Unit checks for sellerUtils
  console.log('1. Seller Dashboard Analytics & Order Item Normalization');
  const multiVendorOrder: Order = {
    id: 'ORD-MULTI-1',
    date: 'Nov 22, 2026',
    createdAt: new Date().toISOString(),
    items: [
      {
        productId: 'p_mine',
        name: 'Seller A Ceramic Mug',
        unitPrice: 25,
        quantity: 2,
        subtotal: 50,
        sellerId: 'seller_verified_1',
      } as any,
      {
        productId: 'p_other',
        name: 'Other Merchant Lamp',
        unitPrice: 80,
        quantity: 1,
        subtotal: 80,
        sellerId: 'seller_other_99',
      } as any,
    ],
    total: 135,
    subtotal: 130,
    shipping: 5,
    discount: 0,
    status: 'Order Placed',
    orderStatus: 'Order Placed',
    paymentStatus: 'paid',
    trackingNumber: 'APAI-123456',
    carrier: 'Apaibay Express',
    estimatedDelivery: '3-5 days',
    shippingAddress: {
      name: 'Sokha Chan',
      street: 'St 271',
      city: 'Phnom Penh',
      country: 'Cambodia',
      phone: '+85512345678',
    },
  };

  const ownedItems = getSellerOrderItems(multiVendorOrder, 'seller_verified_1');
  assert(ownedItems.length === 1 && ownedItems[0].productId === 'p_mine', 'getSellerOrderItems filters multi-vendor order to seller-owned items');
  assert(ownedItems[0].subtotal === 50, 'Seller subtotal computed accurately from seller-owned line items');
  assert(normalizeDisplayOrderStatus(multiVendorOrder.status) === 'Placed', 'Normalizes legacy "Order Placed" status to "Placed"');

  const catalog: Product[] = [
    { id: 'p1', name: 'In Stock', slug: 'p1', category: 'electronics', brand: 'B', image: '', price: 10, originalPrice: 12, discountPercentage: 10, rating: 5, reviewCount: 0, seller: { name: 'S', verified: true, rating: 5 }, inStock: true, stock: 12, description: '', features: [], tags: [] },
    { id: 'p2', name: 'Low Stock', slug: 'p2', category: 'electronics', brand: 'B', image: '', price: 20, originalPrice: 25, discountPercentage: 20, rating: 5, reviewCount: 0, seller: { name: 'S', verified: true, rating: 5 }, inStock: true, stock: 3, description: '', features: [], tags: [] },
    { id: 'p3', name: 'Out Stock', slug: 'p3', category: 'electronics', brand: 'B', image: '', price: 30, originalPrice: 30, discountPercentage: 0, rating: 5, reviewCount: 0, seller: { name: 'S', verified: true, rating: 5 }, inStock: false, stock: 0, description: '', features: [], tags: [] },
  ];
  const invHealth = computeInventoryHealth(catalog);
  assert(invHealth.inStockCount === 2 && invHealth.lowStockCount === 1 && invHealth.outOfStockCount === 1, 'Inventory health categorizes in-stock, low-stock (<=5), and out-of-stock accurately');
  assert(invHealth.totalUnits === 15, 'Inventory health sums total stock units accurately');

  const entries: SellerLedgerEntry[] = [
    {
      id: 'l1',
      orderId: 'ORD-1',
      sellerId: 'seller_verified_1',
      productId: 'p1',
      productName: 'Item 1',
      quantity: 2,
      currency: 'USD',
      eligibleSubtotal: 100,
      eligibleSubtotalCents: 10000,
      commissionRate: 0.05,
      commissionAmount: 5,
      commissionAmountCents: 500,
      netAmount: 95,
      netAmountCents: 9500,
      type: 'sale',
      status: 'pending_settlement',
      payoutStatus: 'pending',
      isPlatformOwned: false,
      settlementEligibleAt: '2026-12-01T00:00:00.000Z',
      createdAt: new Date().toISOString(),
    },
  ];
  const summary: SellerFinancialSummary = {
    sellerId: 'seller_verified_1',
    grossSalesMerchandise: 100,
    platformCommissionDeducted: 5,
    refundAdjustments: 0,
    netCalculatedEarnings: 95,
    pendingSettlement: 95,
    availableForPayout: 0,
    payoutStatus: 'pending_settlement',
    payoutStatusMessage: 'Pending hold window',
    totalTransactions: 1,
  };
  const metrics = computePeriodSalesMetrics(entries, [multiVendorOrder], 'seller_verified_1', '30d', summary);
  assert(metrics.grossSales === 100 && metrics.commission === 5 && metrics.netEarnings === 95, 'Period sales metrics aggregate gross, 5% commission, and net earnings');
  assert(metrics.nextPendingReleaseAt === '2026-12-01T00:00:00.000Z', 'Surfaces earliest next pending settlement release timestamp');

  // 2. Backend HTTP Seller Center Route Enforcement
  console.log('\n2. Backend Seller Inventory & Order Fulfillment Verification Gates');
  const app = express();
  app.use(express.json());
  app.use('/api/commerce', commerceRoutes);

  const server = await new Promise<any>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/commerce`;

  try {
    // Seed verified seller, pending seller, expired seller, outsider seller, product, and order
    await setDoc(doc(db, 'sellers', 'seller_verified_1'), {
      sellerId: 'seller_verified_1',
      ownerUid: 'seller_verified_1',
      storeName: 'Verified Shop',
      verificationStatus: 'verified',
      kycStatus: 'VERIFIED',
    });
    await setDoc(doc(db, 'sellers', 'seller_expired_1'), {
      sellerId: 'seller_expired_1',
      ownerUid: 'seller_expired_1',
      storeName: 'Expired Shop',
      verificationStatus: 'verified',
      kycStatus: 'EXPIRED',
    });
    await setDoc(doc(db, 'sellers', 'seller_pending_1'), {
      sellerId: 'seller_pending_1',
      ownerUid: 'seller_pending_1',
      storeName: 'Pending Shop',
      verificationStatus: 'pending',
      kycStatus: 'PENDING_REVIEW',
    });

    await setDoc(doc(db, 'products', 'prod_owned_1'), {
      id: 'prod_owned_1',
      name: 'Owned Product',
      price: 30,
      sellerId: 'seller_verified_1',
      stock: 10,
      stockCount: 10,
      inStock: true,
    });
    await setDoc(doc(db, 'products', 'prod_expired_1'), {
      id: 'prod_expired_1',
      name: 'Expired Seller Product',
      price: 30,
      sellerId: 'seller_expired_1',
      stock: 10,
      stockCount: 10,
      inStock: true,
    });
    await setDoc(doc(db, 'orders', 'ORD-FULFILL-1'), {
      id: 'ORD-FULFILL-1',
      customerUid: 'cust_1',
      status: 'Placed',
      orderStatus: 'Placed',
      paymentStatus: 'paid',
      items: [
        {
          productId: 'prod_owned_1',
          name: 'Owned Product',
          sellerId: 'seller_verified_1',
          unitPrice: 30,
          quantity: 1,
          subtotal: 30,
        },
      ],
    });
    await setDoc(doc(db, 'orders', 'ORD-EXPIRED-1'), {
      id: 'ORD-EXPIRED-1',
      customerUid: 'cust_1',
      status: 'Placed',
      orderStatus: 'Placed',
      paymentStatus: 'paid',
      items: [
        {
          productId: 'prod_expired_1',
          name: 'Expired Seller Product',
          sellerId: 'seller_expired_1',
          unitPrice: 30,
          quantity: 1,
          subtotal: 30,
        },
      ],
    });

    const verifiedUser: AuthenticatedUser = {
      uid: 'seller_verified_1',
      email: 'verified@apaibay.com',
      emailVerified: true,
      role: 'seller',
      canonicalRole: 'SELLER',
      isAdmin: false,
      isSeller: true,
      isCustomer: false,
      sellerId: 'seller_verified_1',
      accountStatus: 'active',
    };
    const expiredUser: AuthenticatedUser = {
      ...verifiedUser,
      uid: 'seller_expired_1',
      sellerId: 'seller_expired_1',
      email: 'expired@apaibay.com',
    };
    const pendingUser: AuthenticatedUser = {
      ...verifiedUser,
      uid: 'seller_pending_1',
      sellerId: 'seller_pending_1',
      email: 'pending@apaibay.com',
    };

    // Verified seller updates own inventory
    const invOkRes = await fetch(`${baseUrl}/products/prod_owned_1/inventory`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-test-user': JSON.stringify(verifiedUser),
      },
      body: JSON.stringify({ stock: 0 }),
    });
    const invOkJson = await invOkRes.json();
    assert(invOkRes.status === 200 && invOkJson.stock === 0 && invOkJson.inStock === false, 'Verified active seller can update own inventory to 0 (sets inStock=false)');

    // Outsider cannot update another seller's inventory
    const invForbiddenRes = await fetch(`${baseUrl}/products/prod_owned_1/inventory`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-test-user': JSON.stringify(expiredUser),
      },
      body: JSON.stringify({ stock: 99 }),
    });
    assert(invForbiddenRes.status === 403, 'Other seller blocked (403) from updating another seller inventory');

    // Expired KYC seller blocked from updating own inventory
    const invExpiredRes = await fetch(`${baseUrl}/products/prod_expired_1/inventory`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-test-user': JSON.stringify(expiredUser),
      },
      body: JSON.stringify({ stock: 5 }),
    });
    assert(invExpiredRes.status === 403 && (await invExpiredRes.json()).error?.code === 'SELLER_KYC_INACTIVE', 'Expired KYC seller blocked (403 SELLER_KYC_INACTIVE) from updating inventory');

    // Verified seller lists own orders & transitions Placed -> Processing -> Shipped
    const ordersRes = await fetch(`${baseUrl}/orders`, {
      headers: { 'x-test-user': JSON.stringify(verifiedUser) },
    });
    const ordersJson = await ordersRes.json();
    assert(ordersRes.status === 200 && ordersJson.orders.length === 1 && ordersJson.orders[0].id === 'ORD-FULFILL-1', 'GET /api/commerce/orders scopes orders strictly to owning seller');

    const procRes = await fetch(`${baseUrl}/orders/ORD-FULFILL-1/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-test-user': JSON.stringify(verifiedUser),
      },
      body: JSON.stringify({ status: 'Processing' }),
    });
    assert(procRes.status === 200 && (await procRes.json()).order?.status === 'Processing', 'Verified seller transitions own order Placed -> Processing');

    const shipRes = await fetch(`${baseUrl}/orders/ORD-FULFILL-1/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-test-user': JSON.stringify(verifiedUser),
      },
      body: JSON.stringify({ status: 'Shipped' }),
    });
    assert(shipRes.status === 200 && (await shipRes.json()).order?.status === 'Shipped', 'Verified seller transitions own order Processing -> Shipped');

    // Verified seller cannot jump straight to Delivered
    const delivErrRes = await fetch(`${baseUrl}/orders/ORD-FULFILL-1/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-test-user': JSON.stringify(verifiedUser),
      },
      body: JSON.stringify({ status: 'Delivered' }),
    });
    assert(delivErrRes.status === 400 || delivErrRes.status === 403, 'Seller cannot self-mark order as Delivered');

    // Expired/pending seller blocked from fulfilling orders
    const expiredFulfillRes = await fetch(`${baseUrl}/orders/ORD-EXPIRED-1/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-test-user': JSON.stringify(expiredUser),
      },
      body: JSON.stringify({ status: 'Processing' }),
    });
    assert(expiredFulfillRes.status === 403, 'Expired KYC seller blocked (403) from mutating order fulfillment status');

    const pendingOrdersRes = await fetch(`${baseUrl}/orders`, {
      headers: { 'x-test-user': JSON.stringify(pendingUser) },
    });
    assert(pendingOrdersRes.status === 200 && (await pendingOrdersRes.json()).orders.length === 0, 'Pending seller sees empty seller-scoped order list');
  } finally {
    server.close();
  }

  console.log('\n====================================================');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('====================================================');
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
