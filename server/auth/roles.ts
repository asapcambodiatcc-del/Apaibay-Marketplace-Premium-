export type UserRole = 'customer' | 'seller' | 'admin';

export interface AuthenticatedUser {
  uid: string;
  email?: string;
  emailVerified?: boolean;
  role: UserRole;
  isAdmin: boolean;
  isSeller: boolean;
  sellerId?: string;
}

// Global bootstrap admin email matching firestore.rules
export const BOOTSTRAP_ADMIN_EMAIL = 'asapcambodia.tcc@gmail.com';
