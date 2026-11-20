import {
  db,
  doc,
  setDoc,
  getDocs,
  collection,
  query,
  where,
} from '../repositories/serverFirestore';
import { AuthenticatedUser } from '../auth/roles';

// Dangerous keys that must never be recorded in audit logs
const FORBIDDEN_METADATA_KEYS = new Set([
  'cardnumber',
  'pan',
  'cvv',
  'cvc',
  'securitycode',
  'password',
  'secret',
  'token',
  'privatekey',
  'idtoken',
  'clientsecret',
  'refreshtoken',
  'accesstoken',
  'pin',
  'seedphrase',
  'seed',
  'idnumber',
  'documentnumber',
  'passportnumber',
  'nationalid',
  'taxid',
  'licenseid',
  'filedata',
  'documentdata',
  'base64',
  'imagedata',
  'documenturl',
  'signedurl',
  'downloadtoken',
  'phonenumber',
  'phone',
  'address',
  'residentialaddress',
]);

export function sanitizeAuditData(data: any): any {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(sanitizeAuditData);

  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, '');
    if (FORBIDDEN_METADATA_KEYS.has(normalizedKey)) {
      if (normalizedKey.includes('card') || normalizedKey.includes('pan')) {
        clean[key] = '[REDACTED_PAN]';
      } else {
        clean[key] = '[REDACTED]';
      }
    } else if (typeof value === 'object' && value !== null) {
      clean[key] = sanitizeAuditData(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

export type AdminAuditAction =
  | 'USER_SUSPEND'
  | 'USER_SUSPENDED'
  | 'USER_REACTIVATE'
  | 'USER_ROLE_CHANGED'
  | 'USER_STATUS_CHANGE'
  | 'SELLER_APPROVE'
  | 'SELLER_UNDER_REVIEW'
  | 'SELLER_REJECT'
  | 'SELLER_SUSPEND'
  | 'KYC_SUBMITTED'
  | 'KYC_DOCUMENT_UPLOADED'
  | 'KYC_DOCUMENT_ACCESSED'
  | 'KYC_UNDER_REVIEW'
  | 'KYC_INFO_REQUESTED'
  | 'KYC_APPROVED'
  | 'KYC_REJECTED'
  | 'KYC_SUSPENDED'
  | 'KYC_EXPIRED'
  | 'KYC_RETENTION_PURGED'
  | 'PRODUCT_APPROVE'
  | 'PRODUCT_REMOVE'
  | 'PRODUCT_UPDATE'
  | 'ORDER_STATUS_UPDATE'
  | 'REFUND_EXECUTE'
  | 'PAYMENT_RECONCILE'
  | 'ROLE_UPDATE'
  | 'SETTING_UPDATE'
  | 'DISPUTE_STATUS_UPDATE'
  | 'DISPUTE_REFUND_APPROVED'
  | 'DISPUTE_REJECTED'
  | 'TEST_AUDIT_ACTION'
  | (string & {});

export interface AdminAuditLog {
  id: string;
  adminUid: string;
  adminEmail: string;
  adminRole: string;
  action: AdminAuditAction;
  targetResourceId: string;
  targetResourceType: 'user' | 'seller' | 'kyc' | 'product' | 'order' | 'payment' | 'dispute' | 'role' | 'setting' | 'system';
  previousValue?: any;
  newValue?: any;
  timestamp: string;
  result: 'success' | 'failure';
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
}

export class AdminActivityLogService {
  /**
   * Appends an immutable administrative audit record to /admin_audit_logs.
   * Completely redacts any sensitive keys or credentials.
   */
  static async logAction(params: {
    admin: AuthenticatedUser;
    action: AdminAuditAction;
    targetResourceId: string;
    targetResourceType: AdminAuditLog['targetResourceType'];
    previousValue?: any;
    newValue?: any;
    result?: 'success' | 'failure';
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, any>;
  }): Promise<AdminAuditLog> {
    const id = `audit_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const timestamp = new Date().toISOString();

    const logEntry: AdminAuditLog = {
      id,
      adminUid: params.admin.uid,
      adminEmail: params.admin.email || 'system_admin@apaibay.com',
      adminRole: String(params.admin.role || 'ADMIN'),
      action: params.action,
      targetResourceId: params.targetResourceId,
      targetResourceType: params.targetResourceType,
      previousValue: params.previousValue !== undefined ? sanitizeAuditData(params.previousValue) : undefined,
      newValue: params.newValue !== undefined ? sanitizeAuditData(params.newValue) : undefined,
      timestamp,
      result: params.result || 'success',
      ipAddress: params.ipAddress ? String(params.ipAddress).slice(0, 45) : undefined,
      userAgent: params.userAgent ? String(params.userAgent).slice(0, 200) : undefined,
      metadata: params.metadata ? sanitizeAuditData(params.metadata) : undefined,
    };

    const docRef = doc(db, 'admin_audit_logs', id);
    await setDoc(docRef, logEntry);

    return logEntry;
  }

  /**
   * Retrieves administrative audit logs with optional filtering.
   */
  static async listLogs(filters?: {
    action?: AdminAuditAction;
    targetResourceType?: string;
    targetResourceId?: string;
    adminUid?: string;
    limitCount?: number;
  }): Promise<AdminAuditLog[]> {
    const colRef = collection(db, 'admin_audit_logs');
    const snap = await getDocs(colRef);
    let logs = snap.docs.map((d: any) => d.data() as AdminAuditLog);

    if (filters?.action) {
      logs = logs.filter((l) => l.action === filters.action);
    }
    if (filters?.targetResourceType) {
      logs = logs.filter((l) => l.targetResourceType === filters.targetResourceType);
    }
    if (filters?.targetResourceId) {
      logs = logs.filter((l) => l.targetResourceId === filters.targetResourceId);
    }
    if (filters?.adminUid) {
      logs = logs.filter((l) => l.adminUid === filters.adminUid);
    }

    // Sort descending by timestamp
    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (filters?.limitCount && filters.limitCount > 0) {
      logs = logs.slice(0, filters.limitCount);
    }

    return logs;
  }
}
