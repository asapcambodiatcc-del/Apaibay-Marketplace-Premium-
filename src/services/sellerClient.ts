import { auth } from './firebase/config';
import { Seller, SellerLedgerEntry, SellerFinancialSummary } from '../types';

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
   * POST /api/commerce/sellers/apply
   * Submits a new seller application with default 'pending' status.
   */
  static async apply(payload: {
    storeName: string;
    description: string;
    businessCountry?: string;
    businessType?: 'individual' | 'registered_business' | 'enterprise';
    contactInfo?: { phone?: string; address?: string };
    logo?: string;
  }): Promise<Seller> {
    const headers = await this.getAuthHeaders();
    const res = await fetch('/api/commerce/sellers/apply', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const body = await res.json();
    if (!res.ok || !body.success) {
      throw new Error(body?.error?.message || 'Failed to submit seller application.');
    }
    return body.seller;
  }

  /**
   * GET /api/commerce/sellers/me
   * Retrieves currently logged in user's seller profile.
   */
  static async getMySeller(): Promise<Seller | null> {
    try {
      const headers = await this.getAuthHeaders();
      const res = await fetch('/api/commerce/sellers/me', {
        headers,
      });
      const body = await res.json();
      if (body.success && body.applied) {
        return body.seller;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * GET /api/commerce/sellers
   * Admin-only: Lists all registered sellers & applicants.
   */
  static async listSellers(): Promise<Seller[]> {
    const headers = await this.getAuthHeaders();
    const res = await fetch('/api/commerce/sellers', {
      headers,
    });
    const body = await res.json();
    if (!res.ok || !body.success) {
      throw new Error(body?.error?.message || 'Failed to retrieve sellers list.');
    }
    return body.sellers || [];
  }

  /**
   * PATCH /api/commerce/sellers/:sellerId/review
   * Admin-only: Approves, rejects, or suspends a seller application.
   */
  static async reviewSeller(
    sellerId: string,
    status: 'verified' | 'rejected' | 'suspended',
    rejectionReason?: string
  ): Promise<Seller> {
    const headers = await this.getAuthHeaders();
    const res = await fetch(`/api/commerce/sellers/${sellerId}/review`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status, rejectionReason }),
    });

    const body = await res.json();
    if (!res.ok || !body.success) {
      throw new Error(body?.error?.message || 'Failed to review seller.');
    }
    return body.seller;
  }

  /**
   * POST /api/commerce/products
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
   * GET /api/commerce/sellers/ledger
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
}
