import crypto from 'crypto';
import {
  db,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  getAdminStorageBucket,
  isTestInMemoryMode,
  hasTestStorageAdapterOverride,
} from '../repositories/serverFirestore';
import { AuthenticatedUser, hasPermission } from '../auth/roles';
import { AdminActivityLogService } from '../admin/adminActivityLogService';
import {
  IdentityDocumentType,
  KycDocumentRecord,
  KycHistoryEvent,
  KycSubStatus,
  KycVerificationStatus,
  Seller,
  SellerKycRecord,
} from '../../src/types';

export const SELLER_KYC_COLLECTION = 'seller_kyc';
export const MAX_KYC_DOCUMENT_BYTES = 5 * 1024 * 1024; // 5 MB
export const MIN_KYC_DOCUMENT_BYTES = 16;
export const DEFAULT_KYC_VALIDITY_DAYS = 365;
export const DEFAULT_RETENTION_DAYS = 365 * 5; // 5 years retention guideline
export const DOCUMENT_TOKEN_TTL_SECONDS = 300; // 5 minutes short-lived access

export const ALLOWED_KYC_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const FORBIDDEN_FILE_EXTENSIONS = new Set([
  'exe', 'dll', 'bat', 'cmd', 'sh', 'bash', 'js', 'mjs', 'cjs', 'ts',
  'php', 'py', 'rb', 'pl', 'html', 'htm', 'svg', 'xml', 'jar', 'msi', 'apk',
]);

const TEST_ONLY_KYC_VIEW_SECRET = 'apaibay_test_only_kyc_hmac_secret_do_not_use_in_production_32b';

export function validateKycSecretConfiguration(): {
  configured: boolean;
  valid: boolean;
  error?: string;
} {
  const raw = process.env.KYC_VIEW_TOKEN_SECRET?.trim() || '';
  if (!raw) {
    if (process.env.NODE_ENV === 'test') {
      return { configured: false, valid: true };
    }
    return {
      configured: false,
      valid: false,
      error: 'MISSING_KYC_VIEW_TOKEN_SECRET: KYC_VIEW_TOKEN_SECRET environment variable must be set (min 32 characters).',
    };
  }
  if (raw.length < 32) {
    return {
      configured: true,
      valid: false,
      error: 'WEAK_KYC_VIEW_TOKEN_SECRET: KYC_VIEW_TOKEN_SECRET must be at least 32 characters.',
    };
  }
  return { configured: true, valid: true };
}

export function getKycViewTokenSecret(): string {
  const raw = process.env.KYC_VIEW_TOKEN_SECRET?.trim() || '';
  if (raw) {
    if (process.env.NODE_ENV === 'production' && raw.length < 32) {
      throw new Error('CONFIGURATION_ERROR: WEAK_KYC_VIEW_TOKEN_SECRET - KYC_VIEW_TOKEN_SECRET must be at least 32 characters.');
    }
    return raw;
  }

  if (process.env.NODE_ENV === 'test') {
    return TEST_ONLY_KYC_VIEW_SECRET;
  }

  throw new Error(
    'CONFIGURATION_ERROR: MISSING_KYC_VIEW_TOKEN_SECRET - KYC_VIEW_TOKEN_SECRET must be configured before signing or verifying KYC document access tokens.'
  );
}

interface PrivateBinaryEntry {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  sellerId: string;
  docId: string;
}

export function toCanonicalKycStatus(status?: string): KycVerificationStatus {
  switch ((status || '').toUpperCase().trim()) {
    case 'VERIFIED':
    case 'APPROVED':
      return 'VERIFIED';
    case 'PENDING':
    case 'PENDING_REVIEW':
      return 'PENDING_REVIEW';
    case 'UNDER_REVIEW':
      return 'UNDER_REVIEW';
    case 'REJECTED':
      return 'REJECTED';
    case 'EXPIRED':
      return 'EXPIRED';
    case 'SUSPENDED':
      return 'SUSPENDED';
    case 'DRAFT':
    case 'NOT_SUBMITTED':
    default:
      return 'NOT_SUBMITTED';
  }
}

export function toLegacyVerificationStatus(
  kycStatus: KycVerificationStatus
): Seller['verificationStatus'] {
  switch (kycStatus) {
    case 'VERIFIED':
      return 'verified';
    case 'PENDING_REVIEW':
      return 'pending';
    case 'UNDER_REVIEW':
      return 'under_review';
    case 'REJECTED':
      return 'rejected';
    case 'EXPIRED':
      return 'expired';
    case 'SUSPENDED':
      return 'suspended';
    case 'NOT_SUBMITTED':
    default:
      return 'draft';
  }
}

export function maskIdentityNumber(raw?: string): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const cleaned = raw.trim().replace(/\s+/g, '');
  if (!cleaned) return undefined;
  if (cleaned.length <= 4) {
    return '****';
  }
  return `${'*'.repeat(Math.min(8, cleaned.length - 4))}${cleaned.slice(-4)}`;
}

const PUBLIC_SELLER_EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/i;

/**
 * Normalizes a seller owner display name strictly for public `/sellers/{sellerId}` summaries.
 * Never returns an email address or UID; defaults to neutral `'Seller'` when absent or email-like.
 */
export function sanitizePublicSellerOwnerName(
  candidate?: unknown,
  fallbackLabel: string = 'Seller'
): string {
  if (typeof candidate !== 'string') {
    return fallbackLabel;
  }
  const trimmed = candidate.trim();
  if (!trimmed || PUBLIC_SELLER_EMAIL_PATTERN.test(trimmed) || trimmed.includes('@')) {
    return fallbackLabel;
  }
  return trimmed.slice(0, 150);
}

export function maskPhoneNumber(raw?: string): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const cleaned = raw.trim();
  if (!cleaned) return undefined;
  if (cleaned.length <= 5) return '***';
  return `${cleaned.slice(0, 4)}****${cleaned.slice(-3)}`;
}

function sanitizeFilename(name: string): string {
  const base = (name || 'document').split(/[/\\]/).pop() || 'document';
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
}

function getFileExtension(name: string): string {
  const parts = (name || '').toLowerCase().split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

function verifyMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (buffer.length < 4) return false;
  switch (mimeType) {
    case 'image/jpeg':
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case 'image/png':
      return (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47
      );
    case 'image/webp':
      return (
        buffer.length >= 12 &&
        buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP'
      );
    case 'application/pdf':
      return buffer.subarray(0, 4).toString('ascii') === '%PDF';
    default:
      return false;
  }
}

export class KycService {
  private static memoryKyc = new Map<string, SellerKycRecord>();
  private static memoryHistory = new Map<string, KycHistoryEvent[]>();
  private static privateBinaryStore = new Map<string, PrivateBinaryEntry>();

  static clearMemoryStoreForTests() {
    this.memoryKyc.clear();
    this.memoryHistory.clear();
    this.privateBinaryStore.clear();
  }

  private static async appendHistory(
    sellerId: string,
    event: Omit<KycHistoryEvent, 'eventId' | 'sellerId' | 'timestamp'> & { timestamp?: string }
  ): Promise<KycHistoryEvent> {
    const entry: KycHistoryEvent = {
      eventId: `kyc_evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sellerId,
      action: event.action,
      previousStatus: event.previousStatus,
      newStatus: event.newStatus,
      actorUid: event.actorUid,
      actorEmail: event.actorEmail,
      actorRole: event.actorRole,
      notes: event.notes,
      timestamp: event.timestamp || new Date().toISOString(),
    };

    if (isTestInMemoryMode()) {
      const existing = this.memoryHistory.get(sellerId) || [];
      existing.unshift(entry);
      this.memoryHistory.set(sellerId, existing);
      return entry;
    }

    await setDoc(doc(db, `${SELLER_KYC_COLLECTION}/${sellerId}/history`, entry.eventId), entry);
    return entry;
  }

  private static async getKycRecordRaw(sellerId: string): Promise<SellerKycRecord | null> {
    if (isTestInMemoryMode() && this.memoryKyc.has(sellerId)) {
      return JSON.parse(JSON.stringify(this.memoryKyc.get(sellerId)!));
    }

    const snap = await getDoc(doc(db, SELLER_KYC_COLLECTION, sellerId));
    if (snap.exists()) {
      const record = snap.data() as SellerKycRecord;
      if (isTestInMemoryMode()) {
        this.memoryKyc.set(sellerId, record);
      }
      return record;
    }
    return null;
  }

  private static async saveKycRecord(record: SellerKycRecord): Promise<void> {
    if (isTestInMemoryMode()) {
      this.memoryKyc.set(record.sellerId, JSON.parse(JSON.stringify(record)));
      return;
    }
    await setDoc(doc(db, SELLER_KYC_COLLECTION, record.sellerId), record);
  }

  /**
   * Synchronizes ONLY non-sensitive summary fields onto /sellers/{sellerId}.
   * Private KYC documents, unmasked identity numbers, reviewer identity, and storage paths NEVER touch /sellers.
   */
  private static async syncPublicSellerSummary(record: SellerKycRecord): Promise<void> {
    const sellerRef = doc(db, 'sellers', record.sellerId);
    const snap = await getDoc(sellerRef);
    const summaryUpdate: Partial<Seller> = {
      kycStatus: record.kycStatus,
      verificationStatus: record.legacyVerificationStatus,
      kycExpiresAt: record.kycExpiresAt,
      phoneVerificationStatus: record.phoneVerificationStatus,
      identityVerificationStatus: record.identityVerificationStatus,
      payoutOwnershipVerificationStatus: record.payoutOwnershipVerificationStatus,
      kycActionRequiredMessage: record.actionRequiredMessage || undefined,
      reviewedAt: record.reviewedAt,
      rejectionReason: record.rejectionReason || undefined,
      updatedAt: record.updatedAt,
    };

    if (snap.exists()) {
      await updateDoc(sellerRef, summaryUpdate);
    }
  }

  /**
   * Checks whether a VERIFIED KYC record has passed its kycExpiresAt timestamp.
   * If expired, transitions it to EXPIRED automatically.
   */
  static async evaluateExpiration(
    record: SellerKycRecord,
    now: Date = new Date()
  ): Promise<SellerKycRecord> {
    if (
      record.kycStatus === 'VERIFIED' &&
      record.kycExpiresAt &&
      new Date(record.kycExpiresAt).getTime() <= now.getTime()
    ) {
      const previousStatus = record.kycStatus;
      const nowIso = now.toISOString();
      const updated: SellerKycRecord = {
        ...record,
        kycStatus: 'EXPIRED',
        legacyVerificationStatus: 'expired',
        identityVerificationStatus: 'rejected',
        actionRequiredMessage:
          'Your seller KYC verification has expired. Please upload updated identity documents and resubmit for renewal.',
        updatedAt: nowIso,
      };

      await this.saveKycRecord(updated);
      await this.syncPublicSellerSummary(updated);
      await this.appendHistory(updated.sellerId, {
        action: 'EXPIRED',
        previousStatus,
        newStatus: 'EXPIRED',
        actorUid: 'system_kyc_expiry',
        actorRole: 'SYSTEM',
        notes: `Verification validity expired at ${record.kycExpiresAt}.`,
        timestamp: nowIso,
      });

      return updated;
    }
    return record;
  }

  /**
   * Builds a safe default KYC view from /sellers/{sellerId} when legacy sellers exist without /seller_kyc.
   */
  static async getMyKyc(
    user: AuthenticatedUser,
    options?: { now?: Date }
  ): Promise<{ record: SellerKycRecord | null; history: KycHistoryEvent[] }> {
    let record = await this.getKycRecordRaw(user.uid);
    if (record) {
      record = await this.evaluateExpiration(record, options?.now);
      const history = await this.listKycHistory(user, user.uid);
      return { record, history };
    }

    // Check legacy /sellers/{uid} for read-only projection if no /seller_kyc yet
    const sellerSnap = await getDoc(doc(db, 'sellers', user.uid));
    if (sellerSnap.exists()) {
      const s = sellerSnap.data() as Seller;
      const kycStatus = s.kycStatus || toCanonicalKycStatus(s.verificationStatus);
      const synthetic: SellerKycRecord = {
        sellerId: s.sellerId || user.uid,
        ownerUid: s.ownerUid || user.uid,
        profileType: s.businessType || 'individual',
        legalFullName: s.ownerName || user.email || '',
        shopName: s.storeName || '',
        countryOfRegistration: s.businessCountry || 'KH',
        residentialOrBusinessAddress: s.businessAddress || s.contactInfo?.address || '',
        maskedPhone: maskPhoneNumber(s.contactInfo?.phone),
        phoneVerificationStatus: s.phoneVerificationStatus || (s.contactInfo?.phone ? 'pending' : 'unverified'),
        identityDocumentType: s.businessType === 'registered_business' || s.businessType === 'enterprise'
          ? 'business_registration'
          : 'national_id',
        identityVerificationStatus:
          s.identityVerificationStatus || (kycStatus === 'VERIFIED' ? 'verified' : kycStatus === 'PENDING_REVIEW' ? 'pending' : 'unverified'),
        payoutOwnershipVerificationStatus:
          s.payoutOwnershipVerificationStatus || (kycStatus === 'VERIFIED' ? 'verified' : 'unverified'),
        kycStatus,
        legacyVerificationStatus: s.verificationStatus,
        submittedAt: s.submittedAt,
        reviewedAt: s.reviewedAt,
        reviewedByEmail: s.reviewedBy,
        rejectionReason: s.rejectionReason,
        actionRequiredMessage: s.kycActionRequiredMessage,
        kycExpiresAt: s.kycExpiresAt,
        documents: [],
        retentionPolicyDays: DEFAULT_RETENTION_DAYS,
        createdAt: s.createdAt || new Date().toISOString(),
        updatedAt: s.updatedAt || new Date().toISOString(),
      };
      return { record: synthetic, history: [] };
    }

    return { record: null, history: [] };
  }

  /**
   * Lists KYC verification history for a seller (owner or authorized KYC reviewer only).
   */
  static async listKycHistory(user: AuthenticatedUser, sellerId: string): Promise<KycHistoryEvent[]> {
    const isOwner = user.uid === sellerId;
    const isReviewer = hasPermission(user, 'kyc:read');
    if (!isOwner && !isReviewer) {
      throw new Error('FORBIDDEN_KYC_ACCESS: You are not authorized to access another seller’s KYC history.');
    }

    if (isTestInMemoryMode()) {
      const events = [...(this.memoryHistory.get(sellerId) || [])];
      events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return events;
    }

    const colRef = collection(db, `${SELLER_KYC_COLLECTION}/${sellerId}/history`);
    const snap = await getDocs(colRef);
    const events = snap.docs.map((d: any) => d.data() as KycHistoryEvent);
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return events;
  }

  /**
   * Submits or resubmits a Seller KYC verification application.
   * Reuses existing Seller profile workflow while isolating KYC PII & documents in /seller_kyc/{uid}.
   */
  static async submitKycApplication(
    user: AuthenticatedUser,
    input: {
      legalFullName: string;
      shopName: string;
      countryOfRegistration?: string;
      residentialOrBusinessAddress: string;
      contactEmail?: string;
      phoneNumber?: string;
      phoneVerificationStatus?: KycSubStatus;
      profileType?: 'individual' | 'registered_business' | 'enterprise';
      identityDocumentType: IdentityDocumentType;
      identityNumber?: string;
      payoutAccountHolderName?: string;
      legacyDocumentRefs?: string[];
      privacyNoticeAccepted?: boolean;
      now?: Date;
    }
  ): Promise<SellerKycRecord> {
    if (!user || !user.uid) {
      throw new Error('Authentication required.');
    }

    const nowDate = input.now || new Date();
    const nowIso = nowDate.toISOString();

    const legalFullName = (input.legalFullName || '').trim();
    const shopName = (input.shopName || '').trim();
    const address = (input.residentialOrBusinessAddress || '').trim();
    const country = (input.countryOfRegistration || 'KH').trim().toUpperCase();

    if (legalFullName.length < 2 || legalFullName.length > 150) {
      throw new Error('Legal full name must be between 2 and 150 characters.');
    }
    if (shopName.length < 2 || shopName.length > 150) {
      throw new Error('Business / shop name must be between 2 and 150 characters.');
    }
    if (address.length < 5 || address.length > 300) {
      throw new Error('Residential or business address is required (min 5 characters).');
    }

    const validDocTypes: IdentityDocumentType[] = [
      'national_id',
      'passport',
      'drivers_license',
      'business_registration',
    ];
    if (!validDocTypes.includes(input.identityDocumentType)) {
      throw new Error('Valid identity document type is required.');
    }

    const existingRaw = await this.getKycRecordRaw(user.uid);
    const existing = existingRaw ? await this.evaluateExpiration(existingRaw, nowDate) : null;

    if (existing && existing.kycStatus === 'VERIFIED') {
      throw new Error('KYC verification is already approved and active.');
    }

    if (existing && existing.kycStatus === 'SUSPENDED') {
      throw new Error('SUSPENDED_ACCOUNT: Suspended KYC profiles must be reinstated by an administrator.');
    }

    const previousStatus = existing?.kycStatus || 'NOT_SUBMITTED';
    const isResubmission = previousStatus !== 'NOT_SUBMITTED';

    const maskedDocNum =
      maskIdentityNumber(input.identityNumber) || existing?.maskedDocumentNumber;
    const maskedPhone =
      maskPhoneNumber(input.phoneNumber) || existing?.maskedPhone;

    const phoneSubStatus: KycSubStatus =
      input.phoneVerificationStatus === 'verified'
        ? 'verified'
        : maskedPhone
        ? 'pending'
        : existing?.phoneVerificationStatus || 'unverified';

    const payoutOwnershipStatus: KycSubStatus =
      input.payoutAccountHolderName &&
      input.payoutAccountHolderName.trim().toLowerCase() === legalFullName.toLowerCase()
        ? 'pending'
        : existing?.payoutOwnershipVerificationStatus || 'pending';

    const record: SellerKycRecord = {
      sellerId: user.uid,
      ownerUid: user.uid,
      profileType: input.profileType || existing?.profileType || 'individual',
      legalFullName,
      shopName,
      countryOfRegistration: country,
      residentialOrBusinessAddress: address,
      contactEmail: input.contactEmail?.trim() || existing?.contactEmail || user.email || undefined,
      maskedPhone,
      phoneVerificationStatus: phoneSubStatus,
      identityDocumentType: input.identityDocumentType,
      maskedDocumentNumber: maskedDocNum,
      identityVerificationStatus: 'pending',
      payoutOwnershipVerificationStatus: payoutOwnershipStatus,
      kycStatus: 'PENDING_REVIEW',
      legacyVerificationStatus: 'pending',
      submittedAt: nowIso,
      rejectionReason: undefined,
      actionRequiredMessage: undefined,
      verifiedAt: existing?.verifiedAt,
      kycExpiresAt: undefined,
      documents: existing?.documents || [],
      legacyDocumentRefs: input.legacyDocumentRefs || existing?.legacyDocumentRefs,
      privacyNoticeAcceptedAt: input.privacyNoticeAccepted ? nowIso : existing?.privacyNoticeAcceptedAt || nowIso,
      retentionPolicyDays: DEFAULT_RETENTION_DAYS,
      createdAt: existing?.createdAt || nowIso,
      updatedAt: nowIso,
    };

    await this.saveKycRecord(record);

    // Ensure matching /sellers/{uid} record exists with safe non-PII summary
    const sellerRef = doc(db, 'sellers', user.uid);
    const sellerSnap = await getDoc(sellerRef);
    if (sellerSnap.exists()) {
      await this.syncPublicSellerSummary(record);
    } else {
      const baseSeller: Seller = {
        sellerId: user.uid,
        ownerUid: user.uid,
        storeName: shopName,
        ownerName: sanitizePublicSellerOwnerName(legalFullName, 'Seller'),
        description: `${shopName} verified marketplace storefront`,
        logo: 'https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=120',
        verificationStatus: 'pending',
        kycStatus: 'PENDING_REVIEW',
        phoneVerificationStatus: record.phoneVerificationStatus,
        identityVerificationStatus: record.identityVerificationStatus,
        payoutOwnershipVerificationStatus: record.payoutOwnershipVerificationStatus,
        businessCountry: country,
        businessType: record.profileType,
        submittedAt: nowIso,
        rating: 5.0,
        payoutStatus: 'not_configured',
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      await setDoc(sellerRef, baseSeller);
    }

    await this.appendHistory(user.uid, {
      action: isResubmission ? 'RESUBMITTED' : 'SUBMITTED',
      previousStatus,
      newStatus: 'PENDING_REVIEW',
      actorUid: user.uid,
      actorEmail: user.email,
      actorRole: String(user.canonicalRole || user.role || 'SELLER'),
      notes: isResubmission
        ? 'Seller updated and resubmitted KYC application for compliance review.'
        : 'Seller submitted initial KYC verification application.',
      timestamp: nowIso,
    });

    await AdminActivityLogService.logAction({
      admin: user,
      action: 'KYC_SUBMITTED',
      targetResourceId: user.uid,
      targetResourceType: 'kyc',
      previousValue: { kycStatus: previousStatus },
      newValue: {
        kycStatus: 'PENDING_REVIEW',
        profileType: record.profileType,
        identityDocumentType: record.identityDocumentType,
        maskedDocumentNumber: record.maskedDocumentNumber,
      },
    });

    return record;
  }

  /**
   * Stores applicant private contact/PII fields inside /seller_kyc/{uid} when
   * /api/commerce/sellers/apply receives partial legacy fields without writing any PII to /sellers/{uid}.
   */
  static async upsertPrivateContactFromApplication(
    user: AuthenticatedUser,
    input: {
      legalFullName: string;
      shopName: string;
      countryOfRegistration?: string;
      residentialOrBusinessAddress?: string;
      contactEmail?: string;
      phoneNumber?: string;
      profileType?: 'individual' | 'registered_business' | 'enterprise';
      legacyDocumentRefs?: string[];
    }
  ): Promise<SellerKycRecord> {
    if (!user || !user.uid) {
      throw new Error('Authentication required.');
    }

    const nowIso = new Date().toISOString();
    const existing = await this.getKycRecordRaw(user.uid);
    const maskedPhone = maskPhoneNumber(input.phoneNumber) || existing?.maskedPhone;

    const record: SellerKycRecord = {
      sellerId: user.uid,
      ownerUid: user.uid,
      profileType: input.profileType || existing?.profileType || 'individual',
      legalFullName: (input.legalFullName || existing?.legalFullName || user.email || 'Applicant').trim(),
      shopName: (input.shopName || existing?.shopName || 'Merchant Store').trim(),
      countryOfRegistration: (input.countryOfRegistration || existing?.countryOfRegistration || 'KH').trim().toUpperCase(),
      residentialOrBusinessAddress: (input.residentialOrBusinessAddress ?? existing?.residentialOrBusinessAddress ?? '').trim(),
      contactEmail: (input.contactEmail || existing?.contactEmail || user.email || '').trim() || undefined,
      maskedPhone,
      phoneVerificationStatus: existing?.phoneVerificationStatus || (maskedPhone ? 'pending' : 'unverified'),
      identityDocumentType:
        existing?.identityDocumentType ||
        (input.profileType === 'registered_business' || input.profileType === 'enterprise'
          ? 'business_registration'
          : 'national_id'),
      maskedDocumentNumber: existing?.maskedDocumentNumber,
      identityVerificationStatus: existing?.identityVerificationStatus || 'pending',
      payoutOwnershipVerificationStatus: existing?.payoutOwnershipVerificationStatus || 'pending',
      kycStatus: 'PENDING_REVIEW',
      legacyVerificationStatus: 'pending',
      submittedAt: nowIso,
      documents: existing?.documents || [],
      legacyDocumentRefs: input.legacyDocumentRefs || existing?.legacyDocumentRefs,
      privacyNoticeAcceptedAt: existing?.privacyNoticeAcceptedAt || nowIso,
      retentionPolicyDays: DEFAULT_RETENTION_DAYS,
      createdAt: existing?.createdAt || nowIso,
      updatedAt: nowIso,
    };

    await this.saveKycRecord(record);
    return record;
  }

  /**
   * Validates and stores a KYC identity or business registration document in private storage.
   * Rejects dangerous extensions, unsupported MIME types, spoofed magic bytes, and files > 5 MB.
   */
  static async uploadKycDocument(
    user: AuthenticatedUser,
    input: {
      documentType: IdentityDocumentType;
      fileName: string;
      mimeType: string;
      fileBase64: string;
      documentNumber?: string;
      now?: Date;
    }
  ): Promise<KycDocumentRecord> {
    if (!user || !user.uid) {
      throw new Error('Authentication required.');
    }

    const nowDate = input.now || new Date();
    const nowIso = nowDate.toISOString();

    const ext = getFileExtension(input.fileName);
    if (ext && FORBIDDEN_FILE_EXTENSIONS.has(ext)) {
      throw new Error(`UNSAFE_FILE_EXTENSION: File extension '.${ext}' is strictly prohibited.`);
    }

    const normalizedMime = (input.mimeType || '').toLowerCase().trim();
    if (!ALLOWED_KYC_MIME_TYPES.has(normalizedMime)) {
      throw new Error(
        `UNSUPPORTED_FILE_TYPE: Only JPEG, PNG, WEBP, and PDF documents are accepted (received '${input.mimeType}').`
      );
    }

    if (!input.fileBase64 || typeof input.fileBase64 !== 'string') {
      throw new Error('Document binary payload is required.');
    }

    const strippedBase64 = input.fileBase64.replace(/^data:[^;]+;base64,/, '').trim();
    const buffer = Buffer.from(strippedBase64, 'base64');

    if (buffer.length < MIN_KYC_DOCUMENT_BYTES) {
      throw new Error('INVALID_DOCUMENT_SIZE: Uploaded file is empty or corrupted.');
    }
    if (buffer.length > MAX_KYC_DOCUMENT_BYTES) {
      throw new Error(
        `FILE_TOO_LARGE: Document size (${(buffer.length / (1024 * 1024)).toFixed(2)} MB) exceeds maximum 5.00 MB limit.`
      );
    }

    if (!verifyMagicBytes(buffer, normalizedMime)) {
      throw new Error(
        `INVALID_FILE_SIGNATURE: File content does not match declared MIME type '${normalizedMime}'.`
      );
    }

    const docId = `kycdoc_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const safeName = sanitizeFilename(input.fileName);
    const storagePath = `kyc_documents/${user.uid}/${docId}_${safeName}`;
    const checksumSha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    // Upload private binary via Firebase Admin Storage SDK (or test-only sandbox stores)
    if (isTestInMemoryMode() && !hasTestStorageAdapterOverride()) {
      this.privateBinaryStore.set(storagePath, {
        buffer,
        mimeType: normalizedMime,
        fileName: safeName,
        sellerId: user.uid,
        docId,
      });
    } else {
      try {
        const bucket = getAdminStorageBucket();
        await bucket.file(storagePath).save(buffer, {
          resumable: false,
          metadata: {
            contentType: normalizedMime,
            metadata: {
              ownerUid: user.uid,
              documentType: input.documentType,
              visibility: 'private',
              checksumSha256,
            },
          },
        });
      } catch (storageErr: any) {
        throw new Error(
          `KYC_STORAGE_UPLOAD_FAILED: Failed to persist private KYC document to storage: ${storageErr?.message || 'Storage error'}`
        );
      }
    }

    const retentionDate = new Date(nowDate.getTime() + DEFAULT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const docRecord: KycDocumentRecord = {
      docId,
      documentType: input.documentType,
      fileName: safeName,
      mimeType: normalizedMime,
      sizeBytes: buffer.length,
      checksumSha256,
      maskedDocumentNumber: maskIdentityNumber(input.documentNumber),
      storagePath,
      uploadedAt: nowIso,
      uploadedByUid: user.uid,
      status: 'active',
      retentionUntil: retentionDate.toISOString(),
    };

    let kyc = await this.getKycRecordRaw(user.uid);
    if (!kyc) {
      kyc = {
        sellerId: user.uid,
        ownerUid: user.uid,
        profileType: input.documentType === 'business_registration' ? 'registered_business' : 'individual',
        legalFullName: user.email || 'Pending Seller',
        shopName: 'Pending Storefront',
        countryOfRegistration: 'KH',
        residentialOrBusinessAddress: '',
        phoneVerificationStatus: 'unverified',
        identityDocumentType: input.documentType,
        maskedDocumentNumber: docRecord.maskedDocumentNumber,
        identityVerificationStatus: 'pending',
        payoutOwnershipVerificationStatus: 'unverified',
        kycStatus: 'NOT_SUBMITTED',
        legacyVerificationStatus: 'draft',
        documents: [],
        retentionPolicyDays: DEFAULT_RETENTION_DAYS,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
    }

    // Mark previous active docs of same type as superseded
    const updatedDocs = kyc.documents.map((d) =>
      d.documentType === input.documentType && d.status === 'active'
        ? { ...d, status: 'superseded' as const }
        : d
    );
    updatedDocs.unshift(docRecord);

    const updatedKyc: SellerKycRecord = {
      ...kyc,
      identityDocumentType: input.documentType,
      maskedDocumentNumber: docRecord.maskedDocumentNumber || kyc.maskedDocumentNumber,
      identityVerificationStatus: kyc.kycStatus === 'VERIFIED' ? 'verified' : 'pending',
      documents: updatedDocs,
      updatedAt: nowIso,
    };

    await this.saveKycRecord(updatedKyc);
    await this.appendHistory(user.uid, {
      action: 'DOCUMENT_UPLOADED',
      previousStatus: kyc.kycStatus,
      newStatus: updatedKyc.kycStatus,
      actorUid: user.uid,
      actorEmail: user.email,
      actorRole: String(user.canonicalRole || user.role || 'SELLER'),
      notes: `Uploaded private ${input.documentType} (${normalizedMime}, ${buffer.length} bytes).`,
      timestamp: nowIso,
    });

    await AdminActivityLogService.logAction({
      admin: user,
      action: 'KYC_DOCUMENT_UPLOADED',
      targetResourceId: user.uid,
      targetResourceType: 'kyc',
      newValue: {
        docId,
        documentType: input.documentType,
        mimeType: normalizedMime,
        sizeBytes: buffer.length,
        maskedDocumentNumber: docRecord.maskedDocumentNumber,
      },
    });

    return docRecord;
  }

  /**
   * Lists all KYC records for authorized KYC reviewers (ADMIN / SUPER_ADMIN only).
   * Support staff, customers, and sellers are strictly blocked.
   */
  static async listKycApplications(
    reviewer: AuthenticatedUser,
    filters?: { status?: KycVerificationStatus }
  ): Promise<SellerKycRecord[]> {
    if (!hasPermission(reviewer, 'kyc:read')) {
      throw new Error('FORBIDDEN_KYC_LIST: Only authorized KYC compliance reviewers may list KYC records.');
    }

    const recordsMap = new Map<string, SellerKycRecord>();
    if (isTestInMemoryMode()) {
      for (const [id, rec] of this.memoryKyc.entries()) {
        recordsMap.set(id, rec);
      }
    } else {
      const snap = await getDocs(collection(db, SELLER_KYC_COLLECTION));
      snap.docs.forEach((d: any) => {
        const rec = d.data() as SellerKycRecord;
        recordsMap.set(rec.sellerId || d.id, rec);
      });
    }

    // Merge legacy sellers not yet migrated into /seller_kyc
    const sellersSnap = await getDocs(collection(db, 'sellers'));
    sellersSnap.docs.forEach((d: any) => {
      const s = d.data() as Seller;
      const sid = s.sellerId || d.id;
      if (!recordsMap.has(sid)) {
        const kycStatus = s.kycStatus || toCanonicalKycStatus(s.verificationStatus);
        recordsMap.set(sid, {
          sellerId: sid,
          ownerUid: s.ownerUid || sid,
          profileType: s.businessType || 'individual',
          legalFullName: s.ownerName || 'Merchant Applicant',
          shopName: s.storeName || 'Unnamed Store',
          countryOfRegistration: s.businessCountry || 'KH',
          residentialOrBusinessAddress: s.businessAddress || s.contactInfo?.address || '',
          maskedPhone: maskPhoneNumber(s.contactInfo?.phone),
          phoneVerificationStatus: s.phoneVerificationStatus || (s.contactInfo?.phone ? 'pending' : 'unverified'),
          identityDocumentType:
            s.businessType === 'registered_business' || s.businessType === 'enterprise'
              ? 'business_registration'
              : 'national_id',
          identityVerificationStatus:
            s.identityVerificationStatus || (kycStatus === 'VERIFIED' ? 'verified' : 'pending'),
          payoutOwnershipVerificationStatus:
            s.payoutOwnershipVerificationStatus || (kycStatus === 'VERIFIED' ? 'verified' : 'unverified'),
          kycStatus,
          legacyVerificationStatus: s.verificationStatus,
          submittedAt: s.submittedAt,
          reviewedAt: s.reviewedAt,
          reviewedByEmail: s.reviewedBy,
          rejectionReason: s.rejectionReason,
          kycExpiresAt: s.kycExpiresAt,
          documents: [],
          retentionPolicyDays: DEFAULT_RETENTION_DAYS,
          createdAt: s.createdAt || new Date().toISOString(),
          updatedAt: s.updatedAt || new Date().toISOString(),
        });
      }
    });

    const evaluated: SellerKycRecord[] = [];
    for (const rec of recordsMap.values()) {
      evaluated.push(await this.evaluateExpiration(rec));
    }

    let list = evaluated;
    if (filters?.status) {
      list = list.filter((r) => r.kycStatus === filters.status);
    }

    list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return list;
  }

  /**
   * Fetches detailed KYC application + verification history for a seller.
   */
  static async getKycDetail(
    actor: AuthenticatedUser,
    sellerId: string
  ): Promise<{ record: SellerKycRecord; history: KycHistoryEvent[] }> {
    const isOwner = actor.uid === sellerId;
    const isReviewer = hasPermission(actor, 'kyc:read');
    if (!isOwner && !isReviewer) {
      throw new Error('FORBIDDEN_KYC_ACCESS: You are not authorized to view another seller’s KYC record.');
    }

    let record = await this.getKycRecordRaw(sellerId);
    if (!record) {
      throw new Error(`KYC_NOT_FOUND: No KYC record found for seller '${sellerId}'.`);
    }
    record = await this.evaluateExpiration(record);
    const history = await this.listKycHistory(actor, sellerId);
    return { record, history };
  }

  /**
   * Issues a short-lived single-purpose access token for viewing a private KYC document.
   * Strictly checks authorization (document owner OR kyc:view_documents permission) and logs access.
   */
  static async createDocumentAccessToken(
    actor: AuthenticatedUser,
    sellerId: string,
    docId: string,
    options?: { ttlSeconds?: number; now?: Date }
  ): Promise<{ token: string; expiresAt: string; docId: string; mimeType: string; fileName: string }> {
    const isOwner = actor.uid === sellerId;
    const canViewDocs = hasPermission(actor, 'kyc:view_documents');

    if (!isOwner && !canViewDocs) {
      throw new Error(
        'FORBIDDEN_DOCUMENT_ACCESS: Unauthorized role or cross-seller attempt to view private KYC document.'
      );
    }

    const record = await this.getKycRecordRaw(sellerId);
    if (!record) {
      throw new Error('KYC_NOT_FOUND: KYC application does not exist.');
    }

    const docItem = record.documents.find((d) => d.docId === docId);
    if (!docItem) {
      throw new Error('DOCUMENT_NOT_FOUND: Requested KYC document does not exist.');
    }
    if (docItem.status === 'purged') {
      throw new Error('DOCUMENT_PURGED: Document has been purged under retention policy.');
    }

    const nowMs = (options?.now || new Date()).getTime();
    const ttl = Math.min(DOCUMENT_TOKEN_TTL_SECONDS, Math.max(10, options?.ttlSeconds || DOCUMENT_TOKEN_TTL_SECONDS));
    const expMs = nowMs + ttl * 1000;

    const payloadObj = {
      docId,
      sellerId,
      storagePath: docItem.storagePath,
      actorUid: actor.uid,
      exp: expMs,
      nonce: crypto.randomBytes(8).toString('hex'),
    };
    const signingSecret = getKycViewTokenSecret();
    const payloadB64 = Buffer.from(JSON.stringify(payloadObj), 'utf8').toString('base64url');
    const sig = crypto
      .createHmac('sha256', signingSecret)
      .update(payloadB64)
      .digest('base64url');

    const token = `${payloadB64}.${sig}`;
    const expiresAt = new Date(expMs).toISOString();

    await this.appendHistory(sellerId, {
      action: 'DOCUMENT_ACCESSED',
      previousStatus: record.kycStatus,
      newStatus: record.kycStatus,
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorRole: String(actor.canonicalRole || actor.role || (isOwner ? 'SELLER' : 'ADMIN')),
      notes: `Short-lived view token issued for document ${docId} (${docItem.documentType}).`,
    });

    await AdminActivityLogService.logAction({
      admin: actor,
      action: 'KYC_DOCUMENT_ACCESSED',
      targetResourceId: `${sellerId}:${docId}`,
      targetResourceType: 'kyc',
      newValue: {
        docId,
        documentType: docItem.documentType,
        expiresAt,
      },
    });

    return {
      token,
      expiresAt,
      docId: docItem.docId,
      mimeType: docItem.mimeType,
      fileName: docItem.fileName,
    };
  }

  /**
   * Verifies a short-lived document access token and streams the private binary bytes.
   */
  static async resolveDocumentByToken(
    token: string,
    options?: { now?: Date }
  ): Promise<{ buffer: Buffer; mimeType: string; fileName: string; sellerId: string; docId: string }> {
    if (!token || typeof token !== 'string' || !token.includes('.')) {
      throw new Error('INVALID_DOCUMENT_TOKEN: Malformed document access token.');
    }

    const signingSecret = getKycViewTokenSecret();
    const [payloadB64, providedSig] = token.split('.');
    const expectedSig = crypto
      .createHmac('sha256', signingSecret)
      .update(payloadB64)
      .digest('base64url');

    const sigMatches =
      providedSig.length === expectedSig.length &&
      crypto.timingSafeEqual(Buffer.from(providedSig), Buffer.from(expectedSig));

    if (!sigMatches) {
      throw new Error('INVALID_DOCUMENT_TOKEN: Signature verification failed.');
    }

    let payload: any;
    try {
      payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    } catch {
      throw new Error('INVALID_DOCUMENT_TOKEN: Corrupted token payload.');
    }

    const nowMs = (options?.now || new Date()).getTime();
    if (!payload.exp || nowMs > payload.exp) {
      throw new Error('EXPIRED_DOCUMENT_TOKEN: Document view link has expired.');
    }

    const record = await this.getKycRecordRaw(payload.sellerId);
    const docItem = record?.documents.find((d) => d.docId === payload.docId);
    if (!docItem || docItem.status === 'purged') {
      throw new Error('DOCUMENT_NOT_FOUND: Document is unavailable or purged.');
    }

    if (isTestInMemoryMode() && !hasTestStorageAdapterOverride()) {
      const memoryEntry = this.privateBinaryStore.get(docItem.storagePath);
      if (memoryEntry) {
        return {
          buffer: memoryEntry.buffer,
          mimeType: docItem.mimeType,
          fileName: docItem.fileName,
          sellerId: payload.sellerId,
          docId: payload.docId,
        };
      }
      throw new Error('DOCUMENT_STORAGE_UNAVAILABLE: Document binary could not be retrieved from private storage.');
    }

    // Retrieve from private Firebase Admin Storage bucket
    try {
      const bucket = getAdminStorageBucket();
      const [downloadedBuffer] = await bucket.file(docItem.storagePath).download();
      return {
        buffer: Buffer.isBuffer(downloadedBuffer) ? downloadedBuffer : Buffer.from(downloadedBuffer),
        mimeType: docItem.mimeType,
        fileName: docItem.fileName,
        sellerId: payload.sellerId,
        docId: payload.docId,
      };
    } catch {
      throw new Error('DOCUMENT_STORAGE_UNAVAILABLE: Document binary could not be retrieved from private storage.');
    }
  }

  /**
   * Administrative KYC decision: approve, reject, request_info, under_review, suspend, or expire.
   * Enforces role permission (`kyc:review`), separation of duties (blocks self-review), and mandatory reasons.
   * NEVER deletes or mutates historical seller financial ledger entries or past payouts.
   */
  static async reviewKycApplication(
    reviewer: AuthenticatedUser,
    sellerId: string,
    input: {
      action: 'approve' | 'reject' | 'under_review' | 'request_info' | 'suspend' | 'expire';
      reason?: string;
      phoneVerified?: boolean;
      payoutOwnershipVerified?: boolean;
      expiresInDays?: number;
      now?: Date;
    }
  ): Promise<SellerKycRecord> {
    if (!hasPermission(reviewer, 'kyc:review')) {
      throw new Error('FORBIDDEN_KYC_REVIEW: Insufficient permissions to review seller KYC applications.');
    }

    // Separation of duties: Reviewer cannot review or approve their own seller KYC
    if (reviewer.uid === sellerId) {
      throw new Error(
        'FORBIDDEN_SELF_REVIEW: Separation of duties violation—administrators cannot review or approve their own KYC application.'
      );
    }

    const nowDate = input.now || new Date();
    const nowIso = nowDate.toISOString();

    let record = await this.getKycRecordRaw(sellerId);
    if (!record) {
      // Allow reviewing legacy seller record by creating KYC shell if /sellers/{sellerId} exists
      const sellerSnap = await getDoc(doc(db, 'sellers', sellerId));
      if (!sellerSnap.exists()) {
        throw new Error(`KYC_NOT_FOUND: Seller KYC application '${sellerId}' not found.`);
      }
      const s = sellerSnap.data() as Seller;
      record = {
        sellerId,
        ownerUid: s.ownerUid || sellerId,
        profileType: s.businessType || 'individual',
        legalFullName: s.ownerName || 'Merchant Applicant',
        shopName: s.storeName || 'Merchant Store',
        countryOfRegistration: s.businessCountry || 'KH',
        residentialOrBusinessAddress: s.businessAddress || s.contactInfo?.address || '',
        maskedPhone: maskPhoneNumber(s.contactInfo?.phone),
        phoneVerificationStatus: s.phoneVerificationStatus || 'pending',
        identityDocumentType:
          s.businessType === 'registered_business' || s.businessType === 'enterprise'
            ? 'business_registration'
            : 'national_id',
        identityVerificationStatus: 'pending',
        payoutOwnershipVerificationStatus: 'pending',
        kycStatus: toCanonicalKycStatus(s.verificationStatus),
        legacyVerificationStatus: s.verificationStatus,
        submittedAt: s.submittedAt || s.createdAt || nowIso,
        documents: [],
        retentionPolicyDays: DEFAULT_RETENTION_DAYS,
        createdAt: s.createdAt || nowIso,
        updatedAt: nowIso,
      };
    }

    if (record.ownerUid === reviewer.uid) {
      throw new Error(
        'FORBIDDEN_SELF_REVIEW: Separation of duties violation—cannot review a seller profile owned by yourself.'
      );
    }

    const requiresReason =
      input.action === 'reject' ||
      input.action === 'request_info' ||
      input.action === 'suspend';

    if (requiresReason && (!input.reason || input.reason.trim().length < 5)) {
      throw new Error(`REASON_REQUIRED: A detailed compliance reason (min 5 chars) is required for '${input.action}'.`);
    }

    const previousStatus = record.kycStatus;
    let nextStatus: KycVerificationStatus = record.kycStatus;
    let historyAction: KycHistoryEvent['action'] = 'UNDER_REVIEW';
    let auditAction: string = 'KYC_UNDER_REVIEW';

    const updated: SellerKycRecord = {
      ...record,
      reviewedAt: nowIso,
      reviewedByUid: reviewer.uid,
      reviewedByEmail: reviewer.email || reviewer.uid,
      updatedAt: nowIso,
    };

    switch (input.action) {
      case 'under_review':
        nextStatus = 'UNDER_REVIEW';
        historyAction = 'UNDER_REVIEW';
        auditAction = 'KYC_UNDER_REVIEW';
        break;

      case 'request_info':
        nextStatus = 'REJECTED';
        updated.actionRequiredMessage = input.reason!.trim();
        updated.rejectionReason = input.reason!.trim();
        updated.identityVerificationStatus = 'rejected';
        historyAction = 'INFO_REQUESTED';
        auditAction = 'KYC_INFO_REQUESTED';
        break;

      case 'reject':
        nextStatus = 'REJECTED';
        updated.rejectionReason = input.reason!.trim();
        updated.actionRequiredMessage = input.reason!.trim();
        updated.identityVerificationStatus = 'rejected';
        updated.kycExpiresAt = undefined;
        historyAction = 'REJECTED';
        auditAction = 'KYC_REJECTED';
        break;

      case 'suspend':
        nextStatus = 'SUSPENDED';
        updated.suspendedReason = input.reason!.trim();
        updated.rejectionReason = input.reason!.trim();
        updated.identityVerificationStatus = 'rejected';
        historyAction = 'SUSPENDED';
        auditAction = 'KYC_SUSPENDED';
        break;

      case 'expire':
        nextStatus = 'EXPIRED';
        updated.actionRequiredMessage =
          input.reason?.trim() || 'KYC verification expired; document renewal required.';
        updated.kycExpiresAt = nowIso;
        historyAction = 'EXPIRED';
        auditAction = 'KYC_EXPIRED';
        break;

      case 'approve': {
        const validityDays = input.expiresInDays && input.expiresInDays > 0
          ? input.expiresInDays
          : DEFAULT_KYC_VALIDITY_DAYS;
        const expiryDate = new Date(nowDate.getTime() + validityDays * 24 * 60 * 60 * 1000);
        nextStatus = 'VERIFIED';
        updated.verifiedAt = nowIso;
        updated.kycExpiresAt = expiryDate.toISOString();
        updated.rejectionReason = undefined;
        updated.suspendedReason = undefined;
        updated.actionRequiredMessage = undefined;
        updated.identityVerificationStatus = 'verified';
        updated.phoneVerificationStatus =
          input.phoneVerified === false ? updated.phoneVerificationStatus : 'verified';
        updated.payoutOwnershipVerificationStatus =
          input.payoutOwnershipVerified === false ? updated.payoutOwnershipVerificationStatus : 'verified';
        historyAction = 'APPROVED';
        auditAction = 'KYC_APPROVED';
        break;
      }
    }

    updated.kycStatus = nextStatus;
    updated.legacyVerificationStatus = toLegacyVerificationStatus(nextStatus);

    await this.saveKycRecord(updated);
    await this.syncPublicSellerSummary(updated);

    // Role transition on /users/{ownerUid} when approved
    if (nextStatus === 'VERIFIED') {
      try {
        await updateDoc(doc(db, 'users', updated.ownerUid), {
          role: 'seller',
          updatedAt: nowIso,
        });
      } catch {
        // non-blocking
      }
    }

    // Mark notification read
    try {
      await updateDoc(doc(db, 'admin_notifications', `seller_app_${sellerId}`), {
        read: true,
        reviewedAt: nowIso,
      });
    } catch {
      // non-blocking
    }

    await this.appendHistory(sellerId, {
      action: historyAction,
      previousStatus,
      newStatus: nextStatus,
      actorUid: reviewer.uid,
      actorEmail: reviewer.email,
      actorRole: String(reviewer.canonicalRole || reviewer.role || 'ADMIN'),
      notes: input.reason?.trim() || `KYC status updated to ${nextStatus}.`,
      timestamp: nowIso,
    });

    await AdminActivityLogService.logAction({
      admin: reviewer,
      action: auditAction,
      targetResourceId: sellerId,
      targetResourceType: 'kyc',
      previousValue: { kycStatus: previousStatus },
      newValue: {
        kycStatus: nextStatus,
        reason: input.reason?.trim(),
        kycExpiresAt: updated.kycExpiresAt,
      },
    });

    return updated;
  }

  /**
   * Authoritative KYC eligibility check used by SellerLedgerService before allowing payouts.
   * Preserves all historical ledger & payout entries while blocking unverified/rejected/expired/suspended payouts.
   */
  static async assertSellerEligibleForPayout(
    sellerId: string,
    options?: { now?: Date }
  ): Promise<{ storeName: string; kycStatus: KycVerificationStatus }> {
    const nowDate = options?.now || new Date();

    // 1. Check authoritative /seller_kyc/{sellerId} first
    const kycRaw = await this.getKycRecordRaw(sellerId);
    if (kycRaw) {
      const kyc = await this.evaluateExpiration(kycRaw, nowDate);
      if (kyc.kycStatus !== 'VERIFIED') {
        throw new Error(
          `PAYOUT_BLOCKED_KYC_${kyc.kycStatus}: Seller KYC status is '${kyc.kycStatus}'. Verified & active KYC is required before requesting payouts.`
        );
      }
      if (kyc.payoutOwnershipVerificationStatus === 'rejected') {
        throw new Error(
          'PAYOUT_BLOCKED_ACCOUNT_OWNERSHIP: Payout account ownership verification failed.'
        );
      }
      return {
        storeName: kyc.shopName || 'Verified Merchant Store',
        kycStatus: kyc.kycStatus,
      };
    }

    // 2. Fallback to /sellers/{sellerId} for backward compatibility with existing verified merchant fixtures
    const sellerSnap = await getDoc(doc(db, 'sellers', sellerId));

    if (!sellerSnap || !sellerSnap.exists()) {
      throw new Error(
        'PAYOUT_BLOCKED_KYC_NOT_SUBMITTED: Seller KYC profile does not exist. Complete KYC verification before requesting payouts.'
      );
    }

    const sellerData = sellerSnap.data() as Seller;
    const derivedKycStatus = sellerData.kycStatus || toCanonicalKycStatus(sellerData.verificationStatus);

    if (
      sellerData.kycExpiresAt &&
      new Date(sellerData.kycExpiresAt).getTime() <= nowDate.getTime()
    ) {
      throw new Error(
        `PAYOUT_BLOCKED_KYC_EXPIRED: Seller KYC expired on ${sellerData.kycExpiresAt}. Renew KYC verification to unlock payouts.`
      );
    }

    if (
      derivedKycStatus !== 'VERIFIED' &&
      sellerData.verificationStatus !== 'verified' &&
      sellerData.verificationStatus !== 'approved'
    ) {
      throw new Error(
        `PAYOUT_BLOCKED_KYC_${derivedKycStatus}: Seller account status '${sellerData.verificationStatus}' is not eligible for payouts. Must be verified.`
      );
    }

    return {
      storeName: sellerData.storeName || 'Verified Merchant Store',
      kycStatus: 'VERIFIED',
    };
  }

  /**
   * Purges expired KYC document binaries past their retentionUntil date while preserving audit history.
   */
  static async purgeExpiredDocuments(
    actor: AuthenticatedUser,
    options?: { now?: Date }
  ): Promise<{ purgedCount: number }> {
    if (!hasPermission(actor, 'kyc:review')) {
      throw new Error('FORBIDDEN: Only KYC administrators may invoke retention purge.');
    }

    const nowDate = options?.now || new Date();
    const nowMs = nowDate.getTime();
    const nowIso = nowDate.toISOString();
    let purgedCount = 0;

    const allRecords = await this.listKycApplications(actor);
    for (const rec of allRecords) {
      let modified = false;
      const updatedDocs = await Promise.all(
        (rec.documents || []).map(async (docItem) => {
          if (
            docItem.status !== 'purged' &&
            docItem.retentionUntil &&
            new Date(docItem.retentionUntil).getTime() <= nowMs
          ) {
            if (isTestInMemoryMode() && !hasTestStorageAdapterOverride()) {
              this.privateBinaryStore.delete(docItem.storagePath);
            } else {
              const bucket = getAdminStorageBucket();
              await bucket.file(docItem.storagePath).delete({ ignoreNotFound: true });
            }
            purgedCount++;
            modified = true;
            return { ...docItem, status: 'purged' as const };
          }
          return docItem;
        })
      );

      if (modified) {
        await this.saveKycRecord({ ...rec, documents: updatedDocs, updatedAt: nowIso });
        await this.appendHistory(rec.sellerId, {
          action: 'RETENTION_PURGED',
          previousStatus: rec.kycStatus,
          newStatus: rec.kycStatus,
          actorUid: actor.uid,
          actorEmail: actor.email,
          notes: `Retention policy purged expired document binary payload(s).`,
          timestamp: nowIso,
        });
      }
    }

    return { purgedCount };
  }
}
