export type CanonicalRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'FINANCE_MANAGER'
  | 'SUPPORT_STAFF'
  | 'SELLER'
  | 'CUSTOMER';

export type UserRole =
  | CanonicalRole
  | 'customer'
  | 'seller'
  | 'admin';

export type AdminPermission =
  | 'manage_roles'
  | 'roles:manage'
  | 'manage_sellers'
  | 'sellers:review'
  | 'kyc:read'
  | 'kyc:review'
  | 'kyc:view_documents'
  | 'manage_products'
  | 'manage_orders'
  | 'orders:status_override'
  | 'manage_disputes'
  | 'disputes:manage'
  | 'disputes:read'
  | 'issue_refunds'
  | 'payments:refund'
  | 'payments:reconcile'
  | 'manage_payouts'
  | 'payouts:manage'
  | 'payouts:process'
  | 'view_financials'
  | 'view_audit_logs'
  | 'audit:read'
  | 'view_system_health'
  | 'manage_users'
  | 'users:suspend';

export interface AuthenticatedUser {
  uid: string;
  email?: string;
  emailVerified?: boolean;
  role: UserRole;
  canonicalRole?: CanonicalRole;
  isAdmin: boolean;
  isSuperAdmin?: boolean;
  isFinanceManager?: boolean;
  isSupportStaff?: boolean;
  isSeller: boolean;
  isCustomer?: boolean;
  sellerId?: string;
  accountStatus?: 'active' | 'suspended' | 'pending';
}

// Global bootstrap admin email matching firestore.rules
export const BOOTSTRAP_ADMIN_EMAIL = 'asapcambodia.tcc@gmail.com';

/**
 * Normalizes any role string into canonical uppercase role.
 */
export function normalizeRole(role?: string): CanonicalRole {
  if (!role) return 'CUSTOMER';
  const upper = role.toUpperCase().trim();
  switch (upper) {
    case 'SUPER_ADMIN':
      return 'SUPER_ADMIN';
    case 'ADMIN':
      return 'ADMIN';
    case 'FINANCE_MANAGER':
      return 'FINANCE_MANAGER';
    case 'SUPPORT_STAFF':
      return 'SUPPORT_STAFF';
    case 'SELLER':
      return 'SELLER';
    case 'CUSTOMER':
    default:
      return 'CUSTOMER';
  }
}

/**
 * Checks whether an authenticated user holds a specific administrative permission.
 */
export function hasPermission(user: AuthenticatedUser | undefined, permission: AdminPermission): boolean {
  if (!user) return false;
  if (user.accountStatus === 'suspended') return false;
  if (user.emailVerified === false) return false;

  // Super Admin holds all permissions (bootstrap check strictly requires verified email)
  if (
    user.isSuperAdmin ||
    (user.email &&
      user.email.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase() &&
      user.emailVerified === true)
  ) {
    return true;
  }

  const role = normalizeRole(user.canonicalRole || user.role);

  switch (permission) {
    case 'manage_roles':
    case 'roles:manage':
      return role === 'SUPER_ADMIN';

    case 'manage_sellers':
    case 'sellers:review':
    case 'kyc:read':
    case 'kyc:review':
    case 'kyc:view_documents':
    case 'manage_products':
    case 'manage_users':
    case 'users:suspend':
    case 'view_system_health':
      return role === 'SUPER_ADMIN' || role === 'ADMIN';

    case 'manage_orders':
    case 'orders:status_override':
    case 'manage_disputes':
    case 'disputes:manage':
      return role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'SUPPORT_STAFF' || role === 'FINANCE_MANAGER';

    case 'disputes:read':
      return role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'SUPPORT_STAFF' || role === 'FINANCE_MANAGER';

    case 'issue_refunds':
    case 'payments:refund':
    case 'payments:reconcile':
    case 'manage_payouts':
    case 'payouts:manage':
    case 'payouts:process':
    case 'view_financials':
    case 'view_audit_logs':
    case 'audit:read':
      return role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'FINANCE_MANAGER';

    default:
      return false;
  }
}
