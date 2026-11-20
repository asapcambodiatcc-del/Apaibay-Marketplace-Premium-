import { Request, Response, NextFunction } from 'express';
import { db, doc, getDoc, firebaseConfig, getAdminAuth } from '../repositories/serverFirestore';
import { AuthenticatedUser, UserRole, CanonicalRole, AdminPermission, BOOTSTRAP_ADMIN_EMAIL, hasPermission, normalizeRole } from './roles';

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Cryptographically verifies a Firebase ID token using Firebase Admin Auth SDK.
 * Fails closed (returns null) on forged signatures, unsigned JWTs, revoked tokens,
 * wrong issuer/audience, expired tokens, or verification errors.
 */
export async function validateFirebaseIdToken(
  token: string
): Promise<{ uid: string; email?: string; emailVerified: boolean } | null> {
  if (!token || typeof token !== 'string') {
    return null;
  }

  // 1. Structural JWT validation
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    return null;
  }

  let header: any;
  let payload: any;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  // Reject unsigned ("alg: none") or symmetric HMAC tokens immediately
  if (!header || typeof header.alg !== 'string' || header.alg.toUpperCase() !== 'RS256') {
    return null;
  }

  // 2. Pre-check basic claims before signature verification
  const now = Math.floor(Date.now() / 1000);
  if (!payload || typeof payload.exp !== 'number' || payload.exp < now) {
    return null;
  }

  const expectedIssuer = `https://securetoken.google.com/${firebaseConfig.projectId}`;
  if (payload.iss !== expectedIssuer || payload.aud !== firebaseConfig.projectId) {
    return null;
  }

  const tokenUid = payload.sub || payload.user_id;
  if (!tokenUid || typeof tokenUid !== 'string') {
    return null;
  }

  // 3. Cryptographic verification & revocation check via Firebase Admin Auth SDK
  // NEVER fall back to trusting unverified JWT claims on error.
  try {
    const decoded = await getAdminAuth().verifyIdToken(token, true);
    if (!decoded || !decoded.uid || decoded.uid !== tokenUid) {
      return null;
    }

    return {
      uid: decoded.uid,
      email: decoded.email,
      emailVerified: decoded.email_verified === true,
    };
  } catch {
    return null;
  }
}

/**
 * Resolves user roles server-side from Firestore authority.
 */
export async function resolveUserRoles(uid: string, email?: string, emailVerified?: boolean): Promise<{
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
}> {
  // Check account suspension first in /users/{uid}
  const userSnap = await getDoc(doc(db, 'users', uid));
  const userData = userSnap.exists() ? userSnap.data() : null;
  const rawStatus = typeof userData?.status === 'string' ? userData.status.toLowerCase().trim() : 'active';
  const accountStatus: 'active' | 'suspended' | 'pending' =
    rawStatus === 'suspended' ? 'suspended' : rawStatus === 'pending' ? 'pending' : 'active';

  if (accountStatus === 'suspended') {
    return {
      role: 'customer',
      canonicalRole: 'CUSTOMER',
      isAdmin: false,
      isSuperAdmin: false,
      isFinanceManager: false,
      isSupportStaff: false,
      isSeller: false,
      isCustomer: false,
      accountStatus: 'suspended',
    };
  }

  // Check Admin authority: Firestore database document in /admins/{uid} takes precedence
  let adminDocData: any = null;

  const adminSnap = await getDoc(doc(db, 'admins', uid));
  if (adminSnap.exists()) {
    adminDocData = adminSnap.data();
  }

  // 1. Authoritative database record in /admins/{uid} (STRICTLY requires verified email)
  if (adminDocData && emailVerified === true) {
    const assignedRole = normalizeRole(adminDocData.role || 'ADMIN');
    const isSuper = assignedRole === 'SUPER_ADMIN';
    const isFin = assignedRole === 'FINANCE_MANAGER' || isSuper;
    const isSupp = assignedRole === 'SUPPORT_STAFF' || assignedRole === 'ADMIN' || isSuper;
    const isAdm = true; // Any administrative user has isAdmin: true for baseline route access (specific actions gated by hasPermission)

    return {
      role: isSuper ? 'SUPER_ADMIN' : 'admin',
      canonicalRole: assignedRole,
      isAdmin: isAdm,
      isSuperAdmin: isSuper,
      isFinanceManager: isFin,
      isSupportStaff: isSupp,
      isSeller: false,
      isCustomer: false,
      accountStatus,
    };
  }

  // 2. Verified root Super Admin bootstrap identity
  const isBootstrapEmail = Boolean(email && email.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase());
  // CRITICAL SECURITY GATE: Bootstrap admin MUST have emailVerified === true
  const isVerifiedBootstrap = isBootstrapEmail && emailVerified === true;

  if (isVerifiedBootstrap) {
    return {
      role: 'admin',
      canonicalRole: 'SUPER_ADMIN',
      isAdmin: true,
      isSuperAdmin: true,
      isFinanceManager: true,
      isSupportStaff: true,
      isSeller: false,
      isCustomer: false,
      accountStatus,
    };
  }

  // Check Seller authority: /sellers/{sellerId} where ownerUid == uid
  const sellerSnap = await getDoc(doc(db, 'sellers', uid));
  if (sellerSnap.exists()) {
    return {
      role: 'seller',
      canonicalRole: 'SELLER',
      isAdmin: false,
      isSeller: true,
      isCustomer: false,
      sellerId: uid,
      accountStatus,
    };
  }

  // Default customer role
  return {
    role: 'customer',
    canonicalRole: 'CUSTOMER',
    isAdmin: false,
    isSeller: false,
    isCustomer: true,
    accountStatus,
  };
}

/**
 * Express Middleware: requirePermission
 * Validates that authenticated user holds the required specific admin permission.
 */
export function requirePermission(permission: AdminPermission) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !hasPermission(req.user, permission)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN_PERMISSION',
          message: `Administrative clearance required: '${permission}'.`,
        },
      });
      return;
    }
    next();
  };
}

/**
 * Express Middleware: verifyFirebaseUser
 * Mandates valid, unexpired Firebase authentication.
 */
export async function verifyFirebaseUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  // Support test authorization header for automated tests only
  if (process.env.NODE_ENV === 'test' && req.headers['x-test-user']) {
    try {
      const testUser = JSON.parse(req.headers['x-test-user'] as string);
      req.user = testUser;
      return next();
    } catch {
      // ignore
    }
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or malformed Authorization header. Expected Bearer <FirebaseIdToken>.',
      },
    });
    return;
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Empty Firebase ID token.',
      },
    });
    return;
  }

  try {
    const validated = await validateFirebaseIdToken(token);
    if (!validated) {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'The provided Firebase ID token is invalid, forged, or expired.',
        },
      });
      return;
    }

    const resolved = await resolveUserRoles(validated.uid, validated.email, validated.emailVerified);

    if (resolved.accountStatus === 'suspended') {
      res.status(403).json({
        success: false,
        error: {
          code: 'ACCOUNT_SUSPENDED',
          message: 'Your account has been suspended. Please contact marketplace support.',
        },
      });
      return;
    }

    req.user = {
      uid: validated.uid,
      email: validated.email,
      emailVerified: validated.emailVerified,
      ...resolved,
    };

    next();
  } catch (err) {
    res.status(401).json({
      success: false,
      error: {
        code: 'AUTH_VERIFICATION_FAILED',
        message: 'Authentication verification encountered an internal error.',
      },
    });
  }
}

/**
 * Optional authentication middleware for public endpoints (like price quote)
 */
export async function optionalFirebaseUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (process.env.NODE_ENV === 'test' && req.headers['x-test-user']) {
    try {
      req.user = JSON.parse(req.headers['x-test-user'] as string);
      return next();
    } catch {
      // ignore
    }
  }

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    if (token) {
      try {
        const validated = await validateFirebaseIdToken(token);
        if (validated) {
          const resolved = await resolveUserRoles(validated.uid, validated.email, validated.emailVerified);
          if (resolved.accountStatus !== 'suspended') {
            req.user = {
              uid: validated.uid,
              email: validated.email,
              emailVerified: validated.emailVerified,
              ...resolved,
            };
          }
        }
      } catch {
        // Continue unauthenticated
      }
    }
  }
  next();
}
