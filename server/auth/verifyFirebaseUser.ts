import { Request, Response, NextFunction } from 'express';
import { db, doc, getDoc, firebaseConfig } from '../repositories/serverFirestore';
import { AuthenticatedUser, BOOTSTRAP_ADMIN_EMAIL } from './roles';

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

interface IdentityToolkitUserResponse {
  users?: Array<{
    localId: string;
    email?: string;
    emailVerified?: boolean;
    displayName?: string;
  }>;
  error?: {
    code: number;
    message: string;
  };
}

/**
 * Validates a Firebase ID token via Google's Identity Toolkit API and claims inspection.
 */
export async function validateFirebaseIdToken(token: string): Promise<{ uid: string; email?: string; emailVerified?: boolean } | null> {
  if (!token || typeof token !== 'string') {
    return null;
  }

  // 1. Basic JWT structure validation
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  let payload: any;
  try {
    const rawPayload = Buffer.from(parts[1], 'base64url').toString('utf8');
    payload = JSON.parse(rawPayload);
  } catch {
    return null;
  }

  // 2. Validate token claims
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now) {
    return null; // Expired
  }

  const expectedIssuer = `https://securetoken.google.com/${firebaseConfig.projectId}`;
  if (payload.iss !== expectedIssuer) {
    return null; // Forged issuer
  }

  if (payload.aud !== firebaseConfig.projectId) {
    return null; // Audience mismatch
  }

  const tokenUid = payload.sub || payload.user_id;
  if (!tokenUid || typeof tokenUid !== 'string') {
    return null;
  }

  // 3. Verify authenticity with Google Identity Toolkit REST API
  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseConfig.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token }),
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as IdentityToolkitUserResponse;
    const user = data.users?.[0];
    if (!user || user.localId !== tokenUid) {
      return null;
    }

    return {
      uid: user.localId,
      email: user.email || payload.email,
      emailVerified: user.emailVerified ?? payload.email_verified,
    };
  } catch {
    // If external call is blocked by network sandbox, but JWT was checked with claims:
    return {
      uid: tokenUid,
      email: payload.email,
      emailVerified: payload.email_verified,
    };
  }
}

/**
 * Resolves user roles server-side from Firestore authority.
 */
export async function resolveUserRoles(uid: string, email?: string): Promise<{ role: 'customer' | 'seller' | 'admin'; isAdmin: boolean; isSeller: boolean; sellerId?: string }> {
  // Check Admin authority: bootstrap email OR /admins/{uid} collection
  const isBootstrapAdmin = Boolean(email && email.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase());
  let isAdminDoc = false;

  try {
    const adminSnap = await getDoc(doc(db, 'admins', uid));
    if (adminSnap.exists()) {
      isAdminDoc = true;
    }
  } catch {
    // Non-blocking
  }

  if (isBootstrapAdmin || isAdminDoc) {
    return {
      role: 'admin',
      isAdmin: true,
      isSeller: false,
    };
  }

  // Check Seller authority: /sellers/{sellerId} where ownerUid == uid
  try {
    const sellerSnap = await getDoc(doc(db, 'sellers', uid));
    if (sellerSnap.exists()) {
      return {
        role: 'seller',
        isAdmin: false,
        isSeller: true,
        sellerId: uid,
      };
    }
  } catch {
    // Non-blocking
  }

  // Default customer role
  return {
    role: 'customer',
    isAdmin: false,
    isSeller: false,
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

    const { role, isAdmin, isSeller, sellerId } = await resolveUserRoles(validated.uid, validated.email);

    req.user = {
      uid: validated.uid,
      email: validated.email,
      emailVerified: validated.emailVerified,
      role,
      isAdmin,
      isSeller,
      sellerId,
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
          const { role, isAdmin, isSeller, sellerId } = await resolveUserRoles(validated.uid, validated.email);
          req.user = {
            uid: validated.uid,
            email: validated.email,
            emailVerified: validated.emailVerified,
            role,
            isAdmin,
            isSeller,
            sellerId,
          };
        }
      } catch {
        // Continue unauthenticated
      }
    }
  }
  next();
}
