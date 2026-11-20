import { auth } from './firebase/config';
import {
  AdminRoleUser,
  CanonicalRole,
  AdminAuditLog,
  OrderDispute,
  DisputeStatus,
  SystemHealthReport,
  SellerPayoutRequest,
  SellerKycRecord,
  KycHistoryEvent,
  KycVerificationStatus,
} from '../types';

export class AdminClient {
  private static async getAuthHeaders(): Promise<Record<string, string>> {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('Authentication required for administrative access.');
    }
    const token = await user.getIdToken();
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };
  }

  // --- Roles & Permissions ---
  static async fetchRoles(): Promise<AdminRoleUser[]> {
    const headers = await this.getAuthHeaders();
    const res = await fetch('/api/admin/roles', { headers });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json?.error?.message || 'Failed to fetch roles');
    }
    return json.users || json.data || [];
  }

  static async updateUserRole(uid: string, role: CanonicalRole): Promise<void> {
    const headers = await this.getAuthHeaders();
    const res = await fetch(`/api/admin/roles/${uid}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ role }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json?.error?.message || 'Failed to update user role');
    }
  }

  // --- Audit Logs ---
  static async fetchAuditLogs(filters?: {
    action?: string;
    resourceType?: string;
    adminUid?: string;
    limit?: number;
  }): Promise<AdminAuditLog[]> {
    const headers = await this.getAuthHeaders();
    const params = new URLSearchParams();
    if (filters?.action) params.set('action', filters.action);
    if (filters?.resourceType) params.set('resourceType', filters.resourceType);
    if (filters?.adminUid) params.set('adminUid', filters.adminUid);
    if (filters?.limit) params.set('limit', String(filters.limit));

    const url = `/api/admin/audit-logs${params.toString() ? `?${params.toString()}` : ''}`;
    const res = await fetch(url, { headers });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json?.error?.message || 'Failed to fetch audit logs');
    }
    return json.logs || json.data || [];
  }

  // --- Disputes & Refunds ---
  static async fetchDisputes(filters?: { status?: string; sellerId?: string }): Promise<OrderDispute[]> {
    const headers = await this.getAuthHeaders();
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.sellerId) params.set('sellerId', filters.sellerId);

    const url = `/api/admin/disputes${params.toString() ? `?${params.toString()}` : ''}`;
    const res = await fetch(url, { headers });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json?.error?.message || 'Failed to fetch disputes');
    }
    return json.disputes || json.data || [];
  }

  static async fetchDispute(disputeId: string): Promise<OrderDispute> {
    const headers = await this.getAuthHeaders();
    const res = await fetch(`/api/admin/disputes/${disputeId}`, { headers });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json?.error?.message || 'Failed to fetch dispute details');
    }
    return json.dispute || json.data;
  }

  static async updateDisputeStatus(
    disputeId: string,
    status: DisputeStatus,
    adminNotes?: string
  ): Promise<OrderDispute> {
    const headers = await this.getAuthHeaders();
    const res = await fetch(`/api/admin/disputes/${disputeId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status, adminNotes }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json?.error?.message || 'Failed to update dispute status');
    }
    return json.dispute || json.data;
  }

  static async resolveDisputeRefund(
    disputeId: string,
    refundAmount?: number,
    reason?: string
  ): Promise<{ dispute: OrderDispute; refundReference?: string }> {
    const headers = await this.getAuthHeaders();
    const res = await fetch(`/api/admin/disputes/${disputeId}/refund`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ refundAmount, reason }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json?.error?.message || 'Failed to issue dispute refund');
    }
    return json;
  }

  // --- System Health ---
  static async fetchSystemHealth(): Promise<SystemHealthReport> {
    const headers = await this.getAuthHeaders();
    const res = await fetch('/api/admin/health', { headers });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json?.error?.message || 'Failed to fetch system health');
    }
    return json.report || json.data;
  }

  // --- User Management ---
  static async fetchUsers(queryStr?: string, roleFilter?: string): Promise<any[]> {
    const headers = await this.getAuthHeaders();
    const params = new URLSearchParams();
    if (queryStr) params.set('q', queryStr);
    if (roleFilter) params.set('role', roleFilter);

    const url = `/api/admin/users${params.toString() ? `?${params.toString()}` : ''}`;
    const res = await fetch(url, { headers });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json?.error?.message || 'Failed to fetch marketplace users');
    }
    return json.users || json.data || [];
  }

  static async updateUserStatus(uid: string, status: 'active' | 'suspended'): Promise<void> {
    const headers = await this.getAuthHeaders();
    const res = await fetch(`/api/admin/users/${uid}/status`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json?.error?.message || 'Failed to update user status');
    }
  }

  // --- Product Management ---
  static async fetchProducts(queryStr?: string): Promise<any[]> {
    const headers = await this.getAuthHeaders();
    const params = new URLSearchParams();
    if (queryStr) params.set('q', queryStr);

    const url = `/api/admin/products${params.toString() ? `?${params.toString()}` : ''}`;
    const res = await fetch(url, { headers });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json?.error?.message || 'Failed to fetch products');
    }
    return json.products || json.data || [];
  }

  static async deleteProduct(productId: string): Promise<void> {
    const headers = await this.getAuthHeaders();
    const res = await fetch(`/api/admin/products/${productId}`, {
      method: 'DELETE',
      headers,
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json?.error?.message || 'Failed to remove product');
    }
  }

  // --- Order Oversight ---
  static async fetchOrders(status?: string): Promise<any[]> {
    const headers = await this.getAuthHeaders();
    const params = new URLSearchParams();
    if (status) params.set('status', status);

    const url = `/api/admin/orders${params.toString() ? `?${params.toString()}` : ''}`;
    const res = await fetch(url, { headers });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json?.error?.message || 'Failed to fetch orders');
    }
    return json.orders || json.data || [];
  }

  static async updateOrderStatus(orderId: string, status: string): Promise<void> {
    const headers = await this.getAuthHeaders();
    const res = await fetch(`/api/admin/orders/${orderId}/status`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json?.error?.message || 'Failed to update order status');
    }
  }

  // --- Seller Payouts Management ---
  static async fetchPayouts(filters?: { status?: string; sellerId?: string }): Promise<SellerPayoutRequest[]> {
    const headers = await this.getAuthHeaders();
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.sellerId) params.set('sellerId', filters.sellerId);

    const url = `/api/admin/payouts${params.toString() ? `?${params.toString()}` : ''}`;
    const res = await fetch(url, { headers });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json?.error?.message || 'Failed to fetch payout requests');
    }
    return json.payouts || json.data || [];
  }

  static async reviewPayout(
    payoutId: string,
    action: 'approve' | 'reject' | 'hold',
    reason?: string
  ): Promise<SellerPayoutRequest> {
    const headers = await this.getAuthHeaders();
    const res = await fetch(`/api/admin/payouts/${payoutId}/review`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ action, reason }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json?.error?.message || 'Failed to review payout request');
    }
    return json.payout || json.data;
  }

  static async confirmPayoutProvider(
    payoutId: string,
    params: { success: boolean; providerReference?: string; failureReason?: string }
  ): Promise<SellerPayoutRequest> {
    const headers = await this.getAuthHeaders();
    const res = await fetch(`/api/admin/payouts/${payoutId}/confirm`, {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json?.error?.message || 'Failed to record provider confirmation');
    }
    return json.payout || json.data;
  }

  static async releaseSettlement(orderId: string): Promise<any[]> {
    const headers = await this.getAuthHeaders();
    const res = await fetch('/api/admin/settlement/release', {
      method: 'POST',
      headers,
      body: JSON.stringify({ orderId }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json?.error?.message || 'Failed to release settlement');
    }
    return json.releasedEntries || [];
  }

  static async updateCommissionRate(rate: number, sellerId?: string): Promise<void> {
    const headers = await this.getAuthHeaders();
    const res = await fetch('/api/admin/commission-rate', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ rate, sellerId }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json?.error?.message || 'Failed to update commission rate');
    }
  }

  // --- Seller KYC & Verification ---
  static async fetchKycApplications(status?: KycVerificationStatus): Promise<SellerKycRecord[]> {
    const headers = await this.getAuthHeaders();
    const url = status ? `/api/admin/kyc?status=${encodeURIComponent(status)}` : '/api/admin/kyc';
    const res = await fetch(url, { headers });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json?.error?.message || 'Failed to fetch KYC applications');
    }
    return json.applications || json.data || [];
  }

  static async fetchKycDetail(sellerId: string): Promise<{ record: SellerKycRecord; history: KycHistoryEvent[] }> {
    const headers = await this.getAuthHeaders();
    const res = await fetch(`/api/admin/kyc/${encodeURIComponent(sellerId)}`, { headers });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json?.error?.message || 'Failed to fetch KYC details');
    }
    return { record: json.record, history: json.history || [] };
  }

  static async reviewKyc(
    sellerId: string,
    payload: {
      action: 'approve' | 'reject' | 'under_review' | 'request_info' | 'suspend' | 'expire';
      reason?: string;
      phoneVerified?: boolean;
      payoutOwnershipVerified?: boolean;
      expiresInDays?: number;
    }
  ): Promise<SellerKycRecord> {
    const headers = await this.getAuthHeaders();
    const res = await fetch(`/api/admin/kyc/${encodeURIComponent(sellerId)}/review`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json?.error?.message || 'Failed to review KYC application');
    }
    return json.kyc || json.data;
  }

  static async getAdminDocumentViewUrl(
    sellerId: string,
    docId: string
  ): Promise<{ viewUrl: string; expiresAt: string; fileName: string; mimeType: string }> {
    const headers = await this.getAuthHeaders();
    const res = await fetch(
      `/api/admin/kyc/${encodeURIComponent(sellerId)}/documents/${encodeURIComponent(docId)}/token`,
      {
        method: 'POST',
        headers,
      }
    );
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json?.error?.message || 'Failed to authorize KYC document access');
    }
    return {
      viewUrl: json.viewUrl,
      expiresAt: json.expiresAt,
      fileName: json.fileName,
      mimeType: json.mimeType,
    };
  }
}
