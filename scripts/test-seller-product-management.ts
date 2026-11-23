import express from 'express';
import commerceRoutes from '../server/routes/commerceRoutes';
import {
  db,
  doc,
  getDoc,
  setDoc,
  clearServerFirestoreTestStore,
} from '../server/repositories/serverFirestore';
import { OrderService } from '../server/commerce/orderService';
import { SellerLedgerService } from '../server/commerce/sellerLedgerService';
import { AuthenticatedUser } from '../server/auth/roles';
import {
  computeInventoryHealth,
  getDisplayProductStatus,
  validateProductFormInput,
} from '../src/components/seller/sellerUtils';
import { Product } from '../src/types';

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
  console.log('APAIBAY SELLER PRODUCT MANAGEMENT TEST SUITE');
  console.log('====================================================\n');

  clearServerFirestoreTestStore();
  SellerLedgerService.clearMemoryLedgerForTesting();

  // 1. Client utility & form validation tests
  console.log('1. Client Status Classification & Product Form Validation');
  const activeProd: Product = {
    id: 'p-active',
    name: 'Active Item',
    slug: 'active-item',
    category: 'electronics',
    brand: 'BrandA',
    image: 'https://example.com/a.jpg',
    price: 49.99,
    originalPrice: 59.99,
    discountPercentage: 17,
    rating: 5,
    reviewCount: 0,
    seller: { name: 'Shop', verified: true, rating: 5 },
    inStock: true,
    stock: 10,
    status: 'active',
    description: 'Desc',
    features: [],
    tags: [],
  };
  const draftProd: Product = { ...activeProd, id: 'p-draft', status: 'draft', inStock: false, stock: 5 };
  const oosProd: Product = { ...activeProd, id: 'p-oos', status: 'active', inStock: false, stock: 0 };
  const archivedProd: Product = { ...activeProd, id: 'p-arch', status: 'archived', inStock: false, stock: 12 };

  assert(getDisplayProductStatus(activeProd) === 'active', 'Classifies active in-stock listing as active');
  assert(getDisplayProductStatus(draftProd) === 'draft', 'Classifies draft listing as draft');
  assert(getDisplayProductStatus(oosProd) === 'out_of_stock', 'Classifies zero-stock listing as out_of_stock');
  assert(getDisplayProductStatus(archivedProd) === 'archived', 'Classifies archived listing as archived');

  const invStats = computeInventoryHealth([activeProd, draftProd, oosProd, archivedProd]);
  assert(
    invStats.totalProducts === 3 && invStats.archivedCount === 1 && invStats.draftCount === 1 && invStats.outOfStockCount === 1,
    'computeInventoryHealth excludes archived items from active SKU totals and low-stock alerts'
  );

  assert(
    validateProductFormInput({
      name: 'X',
      price: '20',
      category: 'electronics',
      stock: '5',
      image: 'https://example.com/1.jpg',
      status: 'active',
    }) !== null,
    'Client form validation rejects too-short product title'
  );
  assert(
    validateProductFormInput({
      name: 'Valid Product',
      price: '25',
      originalPrice: '20',
      category: 'electronics',
      stock: '5',
      image: 'https://example.com/1.jpg',
      status: 'active',
    }) !== null,
    'Client form validation rejects originalPrice < sale price'
  );
  assert(
    validateProductFormInput({
      name: 'Valid Product',
      price: '25',
      category: 'electronics',
      stock: '5',
      image: 'javascript:alert(1)',
      status: 'active',
    }) !== null,
    'Client form validation blocks unsafe non-http(s) image URLs'
  );
  assert(
    validateProductFormInput({
      name: 'Valid Product',
      price: '25',
      originalPrice: '35',
      category: 'electronics',
      stock: '5',
      image: 'https://example.com/1.jpg',
      status: 'draft',
    }) === null,
    'Client form validation accepts valid draft product payload'
  );

  // 2. Backend HTTP endpoint tests
  console.log('\n2. Backend Create, Edit, Archive, Ownership & Verification Enforcement');
  const app = express();
  app.use(express.json());
  app.use('/api/commerce', commerceRoutes);

  const server = await new Promise<any>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/commerce`;

  try {
    // Seed sellers
    await setDoc(doc(db, 'sellers', 'seller_owner_1'), {
      sellerId: 'seller_owner_1',
      ownerUid: 'seller_owner_1',
      storeName: 'Phnom Penh Craft',
      verificationStatus: 'verified',
      kycStatus: 'VERIFIED',
      rating: 4.9,
    });
    await setDoc(doc(db, 'sellers', 'seller_other_2'), {
      sellerId: 'seller_other_2',
      ownerUid: 'seller_other_2',
      storeName: 'Rival Shop',
      verificationStatus: 'verified',
      kycStatus: 'VERIFIED',
    });
    await setDoc(doc(db, 'sellers', 'seller_expired_3'), {
      sellerId: 'seller_expired_3',
      ownerUid: 'seller_expired_3',
      storeName: 'Expired Shop',
      verificationStatus: 'verified',
      kycStatus: 'EXPIRED',
    });
    await setDoc(doc(db, 'sellers', 'seller_pending_4'), {
      sellerId: 'seller_pending_4',
      ownerUid: 'seller_pending_4',
      storeName: 'Pending Shop',
      verificationStatus: 'pending',
      kycStatus: 'PENDING_REVIEW',
    });

    const ownerUser: AuthenticatedUser = {
      uid: 'seller_owner_1',
      email: 'owner@apaibay.com',
      emailVerified: true,
      role: 'seller',
      canonicalRole: 'SELLER',
      isAdmin: false,
      isSeller: true,
      isCustomer: false,
      sellerId: 'seller_owner_1',
      accountStatus: 'active',
    };
    const otherUser: AuthenticatedUser = {
      ...ownerUser,
      uid: 'seller_other_2',
      sellerId: 'seller_other_2',
      email: 'other@apaibay.com',
    };
    const expiredUser: AuthenticatedUser = {
      ...ownerUser,
      uid: 'seller_expired_3',
      sellerId: 'seller_expired_3',
      email: 'expired@apaibay.com',
    };
    const pendingUser: AuthenticatedUser = {
      ...ownerUser,
      uid: 'seller_pending_4',
      sellerId: 'seller_pending_4',
      email: 'pending@apaibay.com',
    };
    const suspendedAccountUser: AuthenticatedUser = {
      ...ownerUser,
      accountStatus: 'suspended',
    };
    const buyerUser: AuthenticatedUser = {
      uid: 'buyer_1',
      email: 'buyer@apaibay.com',
      emailVerified: true,
      role: 'customer',
      canonicalRole: 'CUSTOMER',
      isAdmin: false,
      isSeller: false,
      isCustomer: true,
      accountStatus: 'active',
    };

    // Pending seller cannot create draft or active product
    const pendingCreateRes = await fetch(`${baseUrl}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-test-user': JSON.stringify(pendingUser) },
      body: JSON.stringify({ name: 'Pending Silk Bag', price: 30, category: 'fashion', status: 'draft' }),
    });
    assert(pendingCreateRes.status === 403, 'Pending unverified seller blocked (403) from creating products');

    // Verified owner creates a draft product with gallery, features, sku, and client sellerId spoof attempt
    const createDraftRes = await fetch(`${baseUrl}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-test-user': JSON.stringify(ownerUser) },
      body: JSON.stringify({
        name: 'Kampot Black Pepper Gift Tin',
        price: 18.5,
        originalPrice: 24.0,
        category: 'groceries',
        brand: 'Kampot Reserve',
        sku: 'KMP-TIN-01',
        stock: 15,
        status: 'draft',
        sellerId: 'hijack_seller_id',
        image: 'https://example.com/pepper-main.jpg',
        secondaryImage: 'https://example.com/pepper-alt.jpg',
        gallery: ['https://example.com/pepper-1.jpg', 'https://example.com/pepper-2.jpg'],
        features: ['Single-origin GI Kampot', 'Hermetic tin'],
        tags: ['pepper', 'kampot'],
      }),
    });
    const createDraftJson = await createDraftRes.json();
    const createdProduct = createDraftJson.product;
    assert(
      createDraftRes.status === 201 &&
        createdProduct?.status === 'draft' &&
        createdProduct?.inStock === false &&
        createdProduct?.sellerId === 'seller_owner_1' &&
        createdProduct?.gallery?.length === 2,
      'Verified seller creates draft listing with authenticated sellerId (ignoring spoofed sellerId) and inStock=false'
    );

    const productId = createdProduct.id;
    const originalSlug = createdProduct.slug;

    // Draft product cannot be quoted or ordered on storefront checkout
    let draftQuoteBlocked = false;
    try {
      await OrderService.calculateQuote([{ productId, quantity: 1 }]);
    } catch (err: any) {
      draftQuoteBlocked = err?.code === 'PRODUCT_UNAVAILABLE';
    }
    assert(draftQuoteBlocked, 'Draft listing rejected from storefront checkout quote (PRODUCT_UNAVAILABLE)');

    // Ownership check: rival seller cannot edit product
    const rivalEditRes = await fetch(`${baseUrl}/products/${productId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-test-user': JSON.stringify(otherUser) },
      body: JSON.stringify({ price: 1.0 }),
    });
    assert(rivalEditRes.status === 403, 'Non-owning seller blocked (403) from editing another seller product');

    // Validation check: server rejects unsafe image URL & originalPrice < price
    const badEditRes = await fetch(`${baseUrl}/products/${productId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-test-user': JSON.stringify(ownerUser) },
      body: JSON.stringify({
        price: 50,
        originalPrice: 30,
        image: 'javascript:alert(1)',
      }),
    });
    assert(badEditRes.status === 400, 'Server rejects invalid edit payload (originalPrice < price and unsafe URL)');

    // Owner publishes & edits product fields while preserving id, slug, sellerId
    const editOkRes = await fetch(`${baseUrl}/products/${productId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-test-user': JSON.stringify(ownerUser) },
      body: JSON.stringify({
        name: 'Kampot Black Pepper Gift Tin (Reserve)',
        price: 20,
        originalPrice: 25,
        description: 'Harvested in Southern Cambodia and packed fresh.',
        stock: 12,
        status: 'active',
        sellerId: 'spoofed_seller',
      }),
    });
    const editOkJson = await editOkRes.json();
    assert(
      editOkRes.status === 200 &&
        editOkJson.product?.id === productId &&
        editOkJson.product?.slug === originalSlug &&
        editOkJson.product?.sellerId === 'seller_owner_1' &&
        editOkJson.product?.status === 'active' &&
        editOkJson.product?.inStock === true &&
        editOkJson.product?.discountPercentage === 20,
      'Owner edits listing to active, updates price/discount/stock, and preserves immutable id, slug, and sellerId'
    );

    // Record a real checkout order while active so we can verify historical order preservation after archive
    const order = await OrderService.createOrderAtomically(
      {
        items: [{ productId, quantity: 2 }],
        shippingOption: 'standard',
        shippingAddress: {
          name: 'Dara Meas',
          street: 'No 12 St 310',
          city: 'Phnom Penh',
          country: 'Cambodia',
          phone: '+85512999888',
        },
        paymentMethod: 'cash_on_delivery',
        idempotencyKey: 'idem-prod-archive-test-1',
      },
      buyerUser
    );
    assert(order.id && order.items[0].productId === productId && order.items[0].unitPrice === 20, 'Active listing creates historical order snapshot');

    // Suspended account blocked from editing or archiving
    const suspendedEditRes = await fetch(`${baseUrl}/products/${productId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-test-user': JSON.stringify(suspendedAccountUser) },
      body: JSON.stringify({ name: 'Blocked Edit' }),
    });
    assert(suspendedEditRes.status === 403, 'Suspended account blocked (403) from editing products');

    // Expired seller product seed + archive/edit block
    await setDoc(doc(db, 'products', 'prod_expired_edit'), {
      id: 'prod_expired_edit',
      name: 'Expired Seller Item',
      price: 15,
      sellerId: 'seller_expired_3',
      stock: 5,
      status: 'active',
      inStock: true,
    });
    const expiredArchiveRes = await fetch(`${baseUrl}/products/prod_expired_edit/archive`, {
      method: 'POST',
      headers: { 'x-test-user': JSON.stringify(expiredUser) },
    });
    assert(expiredArchiveRes.status === 403, 'Expired KYC seller blocked (403) from archiving products');

    // Non-owner blocked from archiving
    const rivalArchiveRes = await fetch(`${baseUrl}/products/${productId}/archive`, {
      method: 'POST',
      headers: { 'x-test-user': JSON.stringify(otherUser) },
    });
    assert(rivalArchiveRes.status === 403, 'Non-owning seller blocked (403) from archiving another seller product');

    // Owner soft-archives product
    const archiveOkRes = await fetch(`${baseUrl}/products/${productId}/archive`, {
      method: 'POST',
      headers: { 'x-test-user': JSON.stringify(ownerUser) },
    });
    const archiveOkJson = await archiveOkRes.json();
    assert(
      archiveOkRes.status === 200 &&
        archiveOkJson.product?.status === 'archived' &&
        archiveOkJson.product?.inStock === false &&
        Boolean(archiveOkJson.product?.archivedAt),
      'Owner soft-archives product (sets status=archived, inStock=false, archivedAt)'
    );

    // Product doc & historical order remain intact in Firestore
    const prodSnap = await getDoc(doc(db, 'products', productId));
    const orderSnap = await getDoc(doc(db, 'orders', order.id));
    assert(
      prodSnap.exists() && prodSnap.data()?.sku === 'KMP-TIN-01' && orderSnap.exists() && orderSnap.data()?.items?.[0]?.productId === productId,
      'Soft-archive preserves product document, SKU, and historical order records'
    );

    // Stock update blocked on archived listing
    const archivedInvRes = await fetch(`${baseUrl}/products/${productId}/inventory`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-test-user': JSON.stringify(ownerUser) },
      body: JSON.stringify({ stock: 50 }),
    });
    assert(archivedInvRes.status === 400 && (await archivedInvRes.json()).error?.code === 'PRODUCT_ARCHIVED', 'Inventory update blocked (400 PRODUCT_ARCHIVED) while listing is archived');

    // Archived product rejected from new quote & order creation
    let archiveQuoteBlocked = false;
    try {
      await OrderService.calculateQuote([{ productId, quantity: 1 }]);
    } catch (err: any) {
      archiveQuoteBlocked = err?.code === 'PRODUCT_UNAVAILABLE';
    }
    assert(archiveQuoteBlocked, 'Archived product rejected from OrderService.calculateQuote');

    let archiveOrderBlocked = false;
    try {
      await OrderService.createOrderAtomically(
        {
          items: [{ productId, quantity: 1 }],
          shippingOption: 'standard',
          shippingAddress: {
            name: 'Dara Meas',
            street: 'No 12 St 310',
            city: 'Phnom Penh',
            country: 'Cambodia',
            phone: '+85512999888',
          },
          paymentMethod: 'cash_on_delivery',
          idempotencyKey: 'idem-prod-archive-test-2',
        },
        buyerUser
      );
    } catch (err: any) {
      archiveOrderBlocked = err?.code === 'PRODUCT_UNAVAILABLE';
    }
    assert(archiveOrderBlocked, 'Archived product rejected from OrderService.createOrderAtomically');

    // Direct field edit on archived product without restoring status is rejected
    const editArchivedWithoutRestoreRes = await fetch(`${baseUrl}/products/${productId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-test-user': JSON.stringify(ownerUser) },
      body: JSON.stringify({ price: 22 }),
    });
    assert(editArchivedWithoutRestoreRes.status === 400, 'Editing archived product without status restore is blocked (400)');

    // Restoring archived product to draft clears archivedAt and permits inventory update
    const restoreRes = await fetch(`${baseUrl}/products/${productId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-test-user': JSON.stringify(ownerUser) },
      body: JSON.stringify({ status: 'draft', stock: 10 }),
    });
    const restoreJson = await restoreRes.json();
    assert(
      restoreRes.status === 200 && restoreJson.product?.status === 'draft' && restoreJson.product?.archivedAt === null,
      'Owner can explicitly restore archived listing to draft, clearing archivedAt'
    );
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
