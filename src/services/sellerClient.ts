import { auth, db } from './firebase/config';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import {
  Seller,
  SellerLedgerEntry,
  SellerFinancialSummary,
  SellerPayoutRequest,
  PayoutDestination,
  SellerKycRecord,
  KycHistoryEvent,
  KycDocumentRecord,
  IdentityDocumentType,
} from '../types';

export class SellerClient {
  private static async getAuthHeaders(): Promise<Record<string, string>> {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('Authentication required.');
    }
    const token = await user.getIdToken();
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };
  }

  /**
   * Submits a new seller application with default 'pending' status.
   * Routes strictly through trusted backend so PII is isolated into /seller_kyc/{uid}
   * and public /sellers/{uid} never receives raw email, phone, address, or document refs.
   */
  static async apply(payload: {
    storeName: string;
    ownerName?: string;
    description: string;
    businessCountry?: string;
    businessAddress?: string;
    productCategories?: string[];
    businessType?: 'individual' | 'registered_business' | 'enterprise';
    contactInfo?: { phone?: string; address?: string; email?: string };
    websiteUrl?: string;
    documents?: string[];
    logo?: string;
  }): Promise<Seller> {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('Authentication required. Please sign in before submitting a seller application.');
    }

    if (!payload.storeName || typeof payload.storeName !== 'string' || payload.storeName.trim().length === 0) {
      throw new Error('Store name is required.');
    }

    if (payload.storeName.trim().length > 150) {
      throw new Error('Store name must not exceed 150 characters.');
    }

    const headers = await this.getAuthHeaders();
    const res = await fetch('/api/commerce/sellers/apply', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        storeName: payload.storeName.trim(),
        ownerName: (() => {
          const candidate = (payload.ownerName || user.displayName || '').trim();
          return /[^\s@]+@[^\s@]+\.[^\s@]+/i.test(candidate) || candidate.includes('@') ? '' : candidate;
        })(),
        description: (payload.description || '').trim(),
        businessCountry: (payload.businessCountry || 'KH').trim().toUpperCase(),
        businessAddress: (payload.businessAddress || payload.contactInfo?.address || '').trim(),
        productCategories:
          payload.productCategories && payload.productCategories.length > 0
            ? payload.productCategories
            : ['general'],
        businessType: payload.businessType || 'individual',
        websiteUrl: (payload.websiteUrl || '').trim(),
        documents: payload.documents || [],
        logo:
          payload.logo ||
          user.photoURL ||
          'https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=120',
        contactInfo: {
          email: payload.contactInfo?.email || user.email || '',
          phone: payload.contactInfo?.phone || '',
          address: payload.businessAddress || payload.contactInfo?.address || '',
        },
      }),
    });

    const body = await res.json();
    if (!res.ok || !body.success || !body.seller) {
      throw new Error(body?.error?.message || 'Failed to submit seller application.');
    }

    return body.seller as Seller;
  }

  /**
   * Retrieves currently logged in user's seller profile (with owner PII hydrated from /seller_kyc via backend).
   */
  static async getMySeller(): Promise<Seller | null> {
    const user = auth.currentUser;
    if (!user) return null;

    // 1. Authoritative backend API (combines public /sellers/{uid} + owner private /seller_kyc/{uid})
    try {
      const headers = await this.getAuthHeaders();
      const res = await fetch('/api/commerce/sellers/me', { headers });
      const body = await res.json();
      if (body.success) {
        return body.applied ? body.seller : null;
      }
    } catch {
      // Fallback to non-PII Firestore summary if backend unreachable
    }

    // 2. Fallback to non-PII public summary doc
    try {
      const sellerRef = doc(db, 'sellers', user.uid);
      const snap = await getDoc(sellerRef);
      if (snap.exists()) {
        return snap.data() as Seller;
      }
    } catch (fsErr) {
      console.warn('[SellerClient] Direct Firestore getMySeller note:', fsErr);
    }

    return null;
  }

  /**
   * Admin-only: Lists all registered sellers & applicants (enriched via backend KYC permissions).
   */
  static async listSellers(): Promise<Seller[]> {
    // 1. Authoritative Admin API (returns /sellers enriched with /seller_kyc contact fields)
    try {
      const headers = await this.getAuthHeaders();
      const res = await fetch('/api/commerce/sellers', { headers });
      const body = await res.json();
      if (res.ok && body.success && Array.isArray(body.sellers)) {
        return body.sellers;
      }
    } catch {
      // ignore
    }

    // 2. Fallback to client Firestore collection query (non-PII summary only)
    try {
      const sellersCol = collection(db, 'sellers');
      const snap = await getDocs(sellersCol);
      if (!snap.empty) {
        const list = snap.docs.map((d) => ({ sellerId: d.id, ...d.data() } as Seller));
        list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        return list;
      }
    } catch (fsErr) {
      console.warn('[SellerClient] Direct Firestore listSellers note:', fsErr);
    }

    return [];
  }

  /**
   * Admin-only: Approves, rejects, or suspends a seller application via authoritative backend review.
   */
  static async reviewSeller(
    sellerId: string,
    status: 'verified' | 'approved' | 'rejected' | 'under_review' | 'suspended' | 'pending',
    rejectionReason?: string
  ): Promise<Seller> {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('Authentication required.');
    }

    const canonicalStatus: 'verified' | 'rejected' | 'under_review' | 'suspended' | 'pending' =
      status === 'approved' ? 'verified' : status;

    const headers = await this.getAuthHeaders();
    const res = await fetch(`/api/commerce/sellers/${encodeURIComponent(sellerId)}/review`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: canonicalStatus, rejectionReason }),
    });
    const body = await res.json();
    if (!res.ok || !body.success || !body.seller) {
      throw new Error(body?.error?.message || 'Failed to review seller application. Administrator permissions required.');
    }
    return body.seller as Seller;
  }

  /**
   * Publishes a product listing on behalf of verified seller.
   */
  static async publishProduct(productData: {
    name: string;
    price: number;
    originalPrice?: number;
    category: string;
    brand?: string;
    image?: string;
    description?: string;
    stock?: number;
  }): Promise<any> {
    const headers = await this.getAuthHeaders();
    const res = await fetch('/api/commerce/products', {
      method: 'POST',
      headers,
      body: JSON.stringify(productData),
    });

    const body = await res.json();
    if (!res.ok || !body.success) {
      throw new Error(body?.error?.message || 'Failed to publish product listing.');
    }
    return body.product;
  }

  /**
   * Retrieves seller financial ledger & commission accounting summary.
   */
  static async getLedger(sellerId?: string): Promise<{
    entries: SellerLedgerEntry[];
    summary: SellerFinancialSummary;
  }> {
    const headers = await this.getAuthHeaders();
    const url = sellerId ? `/api/commerce/sellers/ledger?sellerId=${encodeURIComponent(sellerId)}` : '/api/commerce/sellers/ledger';
    const res = await fetch(url, { headers });
    const body = await res.json();
    if (!res.ok || !body.success) {
      throw new Error(body?.error?.message || 'Failed to fetch seller ledger.');
    }
    return body.data;
  }

  /**
   * Submits a withdrawal request from available cleared balances.
   */
  static async requestPayout(
    amount: number,
    destination: PayoutDestination,
    sellerId?: string,
    currency: string = 'USD'
  ): Promise<SellerPayoutRequest> {
    const headers = await this.getAuthHeaders();
    const res = await fetch('/api/commerce/sellers/payouts/request', {
      method: 'POST',
      headers,
      body: JSON.stringify({ amount, destination, sellerId, currency }),
    });

    const body = await res.json();
    if (!res.ok || !body.success) {
      throw new Error(body?.error?.message || 'Failed to submit withdrawal request.');
    }
    return body.payout;
  }

  /**
   * Lists payout requests for current seller or with filters.
   */
  static async getPayouts(status?: string, sellerId?: string): Promise<SellerPayoutRequest[]> {
    const headers = await this.getAuthHeaders();
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (sellerId) params.append('sellerId', sellerId);
    const queryStr = params.toString() ? `?${params.toString()}` : '';

    const res = await fetch(`/api/commerce/sellers/payouts${queryStr}`, { headers });
    const body = await res.json();
    if (!res.ok || !body.success) {
      throw new Error(body?.error?.message || 'Failed to fetch payout requests.');
    }
    return body.payouts || [];
  }

  /**
   * Admin-only: reviews and processes a payout request.
   */
  static async reviewPayout(
    payoutId: string,
    action: 'approve' | 'reject' | 'hold',
    reason?: string
  ): Promise<SellerPayoutRequest> {
    const headers = await this.getAuthHeaders();
    const res = await fetch(`/api/commerce/admin/payouts/${payoutId}/review`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ action, reason }),
    });

    const body = await res.json();
    if (!res.ok || !body.success) {
      throw new Error(body?.error?.message || 'Failed to process payout review.');
    }
    return body.payout;
  }

  /**
   * Admin-only: records authoritative provider confirmation or failure for an approved payout.
   */
  static async confirmPayoutProvider(
    payoutId: string,
    params: { success: boolean; providerReference?: string; failureReason?: string }
  ): Promise<SellerPayoutRequest> {
    const headers = await this.getAuthHeaders();
    const res = await fetch(`/api/commerce/admin/payouts/${payoutId}/confirm`, {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });

    const body = await res.json();
    if (!res.ok || !body.success) {
      throw new Error(body?.error?.message || 'Failed to record provider confirmation.');
    }
    return body.payout;
  }

  // --- KYC & Verification ---

  static async getMyKyc(): Promise<{ record: SellerKycRecord | null; history: KycHistoryEvent[] }> {
    const headers = await this.getAuthHeaders();
    const res = await fetch('/api/commerce/kyc/me', { headers });
    const body = await res.json();
    if (!res.ok || !body.success) {
      throw new Error(body?.error?.message || 'Failed to load KYC status.');
    }
    return {
      record: body.record || null,
      history: body.history || [],
    };
  }

  static async submitKyc(payload: {
    legalFullName: string;
    shopName: string;
    countryOfRegistration?: string;
    residentialOrBusinessAddress: string;
    phoneNumber?: string;
    profileType?: 'individual' | 'registered_business' | 'enterprise';
    identityDocumentType: IdentityDocumentType;
    identityNumber?: string;
    payoutAccountHolderName?: string;
    privacyNoticeAccepted?: boolean;
  }): Promise<SellerKycRecord> {
    const headers = await this.getAuthHeaders();
    const res = await fetch('/api/commerce/kyc/submit', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    if (!res.ok || !body.success) {
      throw new Error(body?.error?.message || 'Failed to submit KYC application.');
    }
    return body.kyc;
  }

  static async uploadKycDocument(
    file: File,
    documentType: IdentityDocumentType,
    documentNumber?: string
  ): Promise<KycDocumentRecord> {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedMimes.includes(file.type)) {
      throw new Error('Unsupported document format. Allowed: JPEG, PNG, WEBP, or PDF.');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('Document file exceeds maximum 5 MB upload limit.');
    }

    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const commaIdx = result.indexOf(',');
        resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
      };
      reader.onerror = () => reject(new Error('Failed to read selected file.'));
      reader.readAsDataURL(file);
    });

    const headers = await this.getAuthHeaders();
    const res = await fetch('/api/commerce/kyc/documents', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        documentType,
        fileName: file.name,
        mimeType: file.type,
        fileBase64: base64Data,
        documentNumber,
      }),
    });
    const body = await res.json();
    if (!res.ok || !body.success) {
      throw new Error(body?.error?.message || 'Failed to upload KYC document.');
    }
    return body.document;
  }

  static async getMyDocumentViewUrl(
    sellerId: string,
    docId: string
  ): Promise<{ viewUrl: string; expiresAt: string; fileName: string; mimeType: string }> {
    const headers = await this.getAuthHeaders();
    const res = await fetch(`/api/commerce/kyc/documents/${encodeURIComponent(sellerId)}/${encodeURIComponent(docId)}/token`, {
      method: 'POST',
      headers,
    });
    const body = await res.json();
    if (!res.ok || !body.success) {
      throw new Error(body?.error?.message || 'Failed to authorize document preview.');
    }
    return {
      viewUrl: body.viewUrl,
      expiresAt: body.expiresAt,
      fileName: body.fileName,
      mimeType: body.mimeType,
    };
  }
}
