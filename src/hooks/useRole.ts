import { useAuth } from '../context/AuthContext';

export type UserRole = 'customer' | 'seller' | 'admin';

export interface UseRoleReturn {
  role: UserRole;
  isAdmin: boolean;
  isSeller: boolean;
  isCustomer: boolean;
  isVerifiedSeller: boolean;
  loading: boolean;
  canAccessSellerPortal: boolean;
  canAccessAdminConsole: boolean;
}

/**
 * Reusable authorization hook for Role-Based Access Control (RBAC).
 * Exposes authoritative role flags based on server/database verification.
 */
export function useRole(): UseRoleReturn {
  const { user, loading } = useAuth();

  const role: UserRole = user?.role || 'customer';
  const isAdmin = role === 'admin';
  const isSeller = role === 'seller' || isAdmin;
  const isCustomer = !!user;
  const isVerifiedSeller = role === 'seller';

  return {
    role,
    isAdmin,
    isSeller,
    isCustomer,
    isVerifiedSeller,
    loading,
    canAccessSellerPortal: isSeller || isAdmin,
    canAccessAdminConsole: isAdmin,
  };
}

// Standalone authorization helpers
export function isAdmin(userRole?: UserRole | null): boolean {
  return userRole === 'admin';
}

export function isSeller(userRole?: UserRole | null): boolean {
  return userRole === 'seller' || userRole === 'admin';
}

export function isCustomer(userRole?: UserRole | null): boolean {
  return !!userRole;
}
