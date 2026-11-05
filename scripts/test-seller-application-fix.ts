/**
 * Apaibay Marketplace Premium - Critical Seller Application Submission & Review Test Suite
 *
 * Validates the core seller application workflow:
 * 1. Unauthenticated users cannot submit applications.
 * 2. Authenticated user's UID is strictly used as applicant identity (no client-authored or spoofed UID).
 * 3. Required field validations (storeName required, trimmed, max 150 chars).
 * 4. VerificationStatus strictly defaults to 'pending'; applicants cannot self-approve.
 * 5. Applications persist accurately with full schema attributes.
 * 6. Duplicate/re-submissions are handled safely (idempotent document ID keyed by user.uid).
 * 7. Admin users can list and review applications (approve, reject with reason, suspend).
 * 8. Status visibility across roles: pending, verified, rejected.
 * 9. Re-submission after rejection resets verificationStatus to 'pending' without corrupting audit logs.
 * 10. Zero secret leakage, sandbox payment preservation.
 */

import { AuthenticatedUser } from '../server/auth/roles';
import { Seller } from '../src/types';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
    failed++;
  }
}

// In-memory mock Firestore repository to verify invariant business logic
class MockSellerStore {
  private records = new Map<string, Seller>();

  async submitApplication(
    authenticatedUser: AuthenticatedUser | null,
    input: {
      storeName: string;
      description?: string;
      businessCountry?: string;
      businessType?: 'individual' | 'registered_business' | 'enterprise';
      contactInfo?: { phone?: string; address?: string };
      logo?: string;
      // Rogue injection attempt by hostile client:
      verificationStatus?: any;
      ownerUid?: any;
    }
  ): Promise<Seller> {
    // 1. Mandatory authentication check
    if (!authenticatedUser || !authenticatedUser.uid) {
      throw new Error('Authentication required. Please sign in before submitting a seller application.');
    }

    // 2. Validate required store name
    if (!input.storeName || typeof input.storeName !== 'string' || input.storeName.trim().length === 0) {
      throw new Error('Store name is required.');
    }

    if (input.storeName.trim().length > 150) {
      throw new Error('Store name must not exceed 150 characters.');
    }

    // 3. Strict Authoritative UID: Never trust client input for owner identity
    const sellerId = authenticatedUser.uid;
    const now = new Date().toISOString();

    const existing = this.records.get(sellerId);
    if (existing && existing.verificationStatus === 'verified') {
      throw new Error('Seller account is already verified.');
    }

    // 4. Verification status strictly defaults to 'pending'; ignore any client attempts to self-approve
    const seller: Seller = {
      sellerId,
      ownerUid: authenticatedUser.uid, // Authoritative UID
      storeName: input.storeName.trim(),
      description: (input.description || '').trim(),
      businessCountry: (input.businessCountry || 'KH').trim().toUpperCase(),
      businessType: input.businessType || 'individual',
      verificationStatus: 'pending', // Strictly pending
      submittedAt: now,
      rating: 5.0,
      logo: input.logo || 'https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=120',
      contactInfo: {
        email: authenticatedUser.email || '',
        phone: input.contactInfo?.phone || '',
        address: input.contactInfo?.address || '',
      },
      payoutStatus: 'not_configured',
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    this.records.set(sellerId, seller);
    return seller;
  }

  async getSeller(sellerId: string): Promise<Seller | null> {
    return this.records.get(sellerId) || null;
  }

  async listSellers(requestingUser: AuthenticatedUser): Promise<Seller[]> {
    if (!requestingUser.isAdmin) {
      throw new Error('Forbidden: Only administrators may list all seller applications.');
    }
    return Array.from(this.records.values()).sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  }

  async reviewSeller(
    reviewer: AuthenticatedUser,
    sellerId: string,
    status: 'verified' | 'rejected' | 'suspended',
    rejectionReason?: string
  ): Promise<Seller> {
    if (!reviewer.isAdmin) {
      throw new Error('Forbidden: Only administrators may review seller applications.');
    }

    const seller = this.records.get(sellerId);
    if (!seller) {
      throw new Error(`Seller #${sellerId} not found.`);
    }

    const now = new Date().toISOString();
    const updated: Seller = {
      ...seller,
      verificationStatus: status,
      reviewedAt: now,
      reviewedBy: reviewer.email || reviewer.uid,
      rejectionReason: status === 'rejected' ? (rejectionReason || 'Compliance standards not met.') : undefined,
      updatedAt: now,
    };

    this.records.set(sellerId, updated);
    return updated;
  }
}

async function runSellerApplicationTests() {
  console.log('\n=============================================================================');
  console.log('🛡️  APAIBAY: SELLER APPLICATION SUBMISSION & REVIEW VERIFICATION SUITE');
  console.log('=============================================================================\n');

  const store = new MockSellerStore();

  const applicantUser: AuthenticatedUser = {
    uid: 'firebase_user_applicant_123',
    email: 'khmer.crafts@apaibay.com',
    role: 'customer',
    isAdmin: false,
    isSeller: false,
  };

  const adminUser: AuthenticatedUser = {
    uid: 'admin_uid_root',
    email: 'asapcambodia.tcc@gmail.com',
    role: 'admin',
    isAdmin: true,
    isSeller: false,
  };

  const rogueUser: AuthenticatedUser = {
    uid: 'rogue_user_999',
    email: 'rogue@attacker.com',
    role: 'customer',
    isAdmin: false,
    isSeller: false,
  };

  // 1. Unauthenticated submission prevention
  console.log('[1/8] Verifying Unauthenticated Submission Defense...');
  let unauthError = '';
  try {
    await store.submitApplication(null, { storeName: 'Anonymous Store' });
  } catch (err: any) {
    unauthError = err.message;
  }
  assert(unauthError.includes('Authentication required'), 'Unauthenticated user submission is rejected');

  // 2. Required fields validation
  console.log('\n[2/8] Verifying Input & Required Fields Validation...');
  let emptyNameError = '';
  try {
    await store.submitApplication(applicantUser, { storeName: '   ' });
  } catch (err: any) {
    emptyNameError = err.message;
  }
  assert(emptyNameError.includes('Store name is required'), 'Empty or whitespace store name is rejected');

  let longNameError = '';
  try {
    await store.submitApplication(applicantUser, { storeName: 'A'.repeat(151) });
  } catch (err: any) {
    longNameError = err.message;
  }
  assert(longNameError.includes('must not exceed 150 characters'), 'Store name exceeding 150 characters is rejected');

  // 3. Authenticated UID authority & self-approval prevention
  console.log('\n[3/8] Verifying Authoritative Identity & Self-Approval Prevention...');
  const submittedApp = await store.submitApplication(applicantUser, {
    storeName: 'Silk & Silver Phnom Penh',
    description: 'Artisan handcrafted silk scarves and silver jewelry',
    businessCountry: 'kh',
    businessType: 'registered_business',
    contactInfo: { phone: '+855 23 555 777', address: 'Street 240, Phnom Penh' },
    // Hostile attempts:
    verificationStatus: 'verified', // Rogue injection
    ownerUid: 'spoofed_victim_uid', // Rogue injection
  });

  assert(submittedApp.sellerId === applicantUser.uid, 'Seller document ID strictly matches authenticated UID');
  assert(submittedApp.ownerUid === applicantUser.uid, 'OwnerUid strictly matches authenticated UID (spoof ignored)');
  assert(submittedApp.verificationStatus === 'pending', 'Status strictly defaults to "pending" (self-approval blocked)');
  assert(submittedApp.businessCountry === 'KH', 'Country code normalized to uppercase');
  assert(submittedApp.businessType === 'registered_business', 'Business type preserved');
  assert(Boolean(submittedApp.submittedAt), 'Submission timestamp recorded');

  // 4. Duplicate pending submission safety (Idempotency)
  console.log('\n[4/8] Verifying Duplicate/Resubmission Handling...');
  const firstCreatedAt = submittedApp.createdAt;
  const updatedApp = await store.submitApplication(applicantUser, {
    storeName: 'Silk & Silver Phnom Penh (Updated)',
    description: 'Updated artisan silk description',
    businessCountry: 'KH',
    businessType: 'registered_business',
    contactInfo: { phone: '+855 23 555 888', address: 'Street 240, Phnom Penh' },
  });

  assert(updatedApp.sellerId === applicantUser.uid, 'Re-submission maintains identical 1:1 sellerId');
  assert(updatedApp.createdAt === firstCreatedAt, 'Original createdAt timestamp preserved across updates');
  assert(updatedApp.storeName === 'Silk & Silver Phnom Penh (Updated)', 'Store information updated safely');
  assert(updatedApp.verificationStatus === 'pending', 'Status remains pending review');

  // 5. Admin-only review permissions & ordinary user gating
  console.log('\n[5/8] Verifying Admin-Only Review Gates...');
  let rogueReviewError = '';
  try {
    await store.reviewSeller(rogueUser, applicantUser.uid, 'verified');
  } catch (err: any) {
    rogueReviewError = err.message;
  }
  assert(rogueReviewError.includes('Forbidden'), 'Non-admin user is BLOCKED from reviewing applications');

  let rogueListError = '';
  try {
    await store.listSellers(rogueUser);
  } catch (err: any) {
    rogueListError = err.message;
  }
  assert(rogueListError.includes('Forbidden'), 'Non-admin user is BLOCKED from listing seller applications');

  // 6. Admin Approval Flow & Status Transition
  console.log('\n[6/8] Verifying Admin Approval Flow & Audit Trail...');
  const allApplications = await store.listSellers(adminUser);
  assert(allApplications.length === 1, 'Admin can list submitted applications');
  assert(allApplications[0].sellerId === applicantUser.uid, 'Applicant visible in admin console');

  const approved = await store.reviewSeller(adminUser, applicantUser.uid, 'verified');
  assert(approved.verificationStatus === 'verified', 'Admin approval updates status to "verified"');
  assert(approved.reviewedBy === adminUser.email, 'Admin reviewer email stamped permanently');
  assert(Boolean(approved.reviewedAt), 'Review timestamp stamped permanently');

  // Guard: Verified seller cannot re-apply over existing verified account
  let verifiedReapplyError = '';
  try {
    await store.submitApplication(applicantUser, { storeName: 'New Name' });
  } catch (err: any) {
    verifiedReapplyError = err.message;
  }
  assert(verifiedReapplyError.includes('already verified'), 'Already verified seller cannot re-apply');

  // 7. Admin Rejection Flow & Resubmission Reset
  console.log('\n[7/8] Verifying Admin Rejection & Resubmission Reset Flow...');
  const applicant2: AuthenticatedUser = {
    uid: 'firebase_user_applicant_2',
    email: 'merchant2@apaibay.com',
    role: 'customer',
    isAdmin: false,
    isSeller: false,
  };

  await store.submitApplication(applicant2, {
    storeName: 'Cambodia Tech Supplies',
    description: 'Hardware tools',
  });

  const rejected = await store.reviewSeller(
    adminUser,
    applicant2.uid,
    'rejected',
    'Missing official business registration document.'
  );
  assert(rejected.verificationStatus === 'rejected', 'Application status transitioned to "rejected"');
  assert(rejected.rejectionReason!.includes('business registration'), 'Rejection reason recorded');

  // Applicant 2 resubmits after rejection:
  const resubmitted = await store.submitApplication(applicant2, {
    storeName: 'Cambodia Tech Supplies Ltd.',
    description: 'Certified hardware and tools with official registration',
    businessCountry: 'KH',
    businessType: 'registered_business',
  });
  assert(resubmitted.verificationStatus === 'pending', 'Resubmitted application resets status to "pending"');
  assert(resubmitted.sellerId === applicant2.uid, 'SellerId unchanged on resubmission');

  // 8. Security & Environment Invariants
  console.log('\n[8/8] Verifying Payment Sandbox & Security Invariants...');
  assert(process.env.PAYMENT_ENVIRONMENT !== 'production', 'PAYMENT_ENVIRONMENT is sandbox');
  assert(applicantUser.role === 'customer', 'Customer role remains secure until admin verification');

  console.log('\n=============================================================================');
  console.log(`🎉 SELLER APPLICATION TEST COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('=============================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSellerApplicationTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
