/**
 * Apaibay Marketplace Premium - Authentication Error Handling Regression Test Suite
 * Validates:
 * 1. Explicit error mapping for auth/unauthorized-domain
 * 2. Explicit error mapping for auth/operation-not-allowed
 * 3. Explicit error mapping for auth/popup-blocked
 * 4. Preservation of all existing Firebase auth error mappings
 * 5. Complete translations present in all supported languages (en, km, zh, fr, es, de, ja, ko)
 */

import { getAuthErrorMessageKey } from '../src/services/firebase/authErrors';
import { TRANSLATIONS } from '../src/i18n/translations';
import { SUPPORTED_LANGUAGES, LanguageCode } from '../src/i18n/types';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
    failed++;
  }
}

console.log('\n=============================================================');
console.log('🔐 APAIBAY AUTHENTICATION ERROR HANDLING REGRESSION SUITE');
console.log('=============================================================\n');

// ---------------------------------------------------------------------------
// 1. New Error Codes Mapping
// ---------------------------------------------------------------------------
console.log('[1/4] Verifying New Explicit Google Sign-In Error Mappings...');

assert(
  getAuthErrorMessageKey('auth/unauthorized-domain') === 'auth.errorUnauthorizedDomain',
  'auth/unauthorized-domain maps to auth.errorUnauthorizedDomain'
);
assert(
  getAuthErrorMessageKey('Firebase: Error (auth/unauthorized-domain).') === 'auth.errorUnauthorizedDomain',
  'Firebase-formatted auth/unauthorized-domain error string maps correctly'
);
assert(
  getAuthErrorMessageKey('unauthorized-domain') === 'auth.errorUnauthorizedDomain',
  'Raw unauthorized-domain substring maps correctly'
);

assert(
  getAuthErrorMessageKey('auth/operation-not-allowed') === 'auth.errorOperationNotAllowed',
  'auth/operation-not-allowed maps to auth.errorOperationNotAllowed'
);
assert(
  getAuthErrorMessageKey('Firebase: Error (auth/operation-not-allowed).') === 'auth.errorOperationNotAllowed',
  'Firebase-formatted auth/operation-not-allowed error string maps correctly'
);

assert(
  getAuthErrorMessageKey('auth/popup-blocked') === 'auth.errorPopupBlocked',
  'auth/popup-blocked maps to auth.errorPopupBlocked'
);
assert(
  getAuthErrorMessageKey('Firebase: Error (auth/popup-blocked).') === 'auth.errorPopupBlocked',
  'Firebase-formatted auth/popup-blocked error string maps correctly'
);

// ---------------------------------------------------------------------------
// 2. Existing Error Codes Mapping Preservation
// ---------------------------------------------------------------------------
console.log('\n[2/4] Verifying Preservation of Existing Error Mappings...');

assert(
  getAuthErrorMessageKey('auth/invalid-email') === 'auth.errorInvalidEmail',
  'auth/invalid-email preserved'
);
assert(
  getAuthErrorMessageKey('auth/weak-password') === 'auth.errorWeakPassword',
  'auth/weak-password preserved'
);
assert(
  getAuthErrorMessageKey('auth/wrong-password') === 'auth.errorInvalidCredentials',
  'auth/wrong-password preserved'
);
assert(
  getAuthErrorMessageKey('auth/user-not-found') === 'auth.errorInvalidCredentials',
  'auth/user-not-found preserved'
);
assert(
  getAuthErrorMessageKey('auth/invalid-credential') === 'auth.errorInvalidCredentials',
  'auth/invalid-credential preserved'
);
assert(
  getAuthErrorMessageKey('auth/invalid-login-credentials') === 'auth.errorInvalidCredentials',
  'auth/invalid-login-credentials preserved'
);
assert(
  getAuthErrorMessageKey('auth/email-already-in-use') === 'auth.errorEmailInUse',
  'auth/email-already-in-use preserved'
);
assert(
  getAuthErrorMessageKey('auth/user-disabled') === 'auth.errorUserDisabled',
  'auth/user-disabled preserved'
);
assert(
  getAuthErrorMessageKey('auth/too-many-requests') === 'auth.errorTooManyRequests',
  'auth/too-many-requests preserved'
);
assert(
  getAuthErrorMessageKey('auth/network-request-failed') === 'auth.errorNetwork',
  'auth/network-request-failed preserved'
);
assert(
  getAuthErrorMessageKey('network') === 'auth.errorNetwork',
  'network keyword preserved'
);
assert(
  getAuthErrorMessageKey('auth/popup-closed-by-user') === 'auth.errorGeneral',
  'auth/popup-closed-by-user fallback preserved'
);
assert(
  getAuthErrorMessageKey('unknown-random-error') === 'auth.errorGeneral',
  'unknown errors fall back to auth.errorGeneral'
);

// ---------------------------------------------------------------------------
// 3. Translation Coverage in Required Languages (en, km, zh, fr)
// ---------------------------------------------------------------------------
console.log('\n[3/4] Verifying Translation Coverage in Required Languages...');

const targetKeys = [
  'auth.errorUnauthorizedDomain',
  'auth.errorOperationNotAllowed',
  'auth.errorPopupBlocked',
  'auth.errorGeneral',
] as const;

const requiredLangs: LanguageCode[] = ['en', 'km', 'zh', 'fr'];

for (const lang of requiredLangs) {
  const dict = TRANSLATIONS[lang];
  for (const key of targetKeys) {
    const val = dict[key];
    assert(
      typeof val === 'string' && val.trim().length > 0,
      `[${lang.toUpperCase()}] has valid non-empty translation for ${key}`,
      `Value: "${val}"`
    );
  }
}

// ---------------------------------------------------------------------------
// 4. Extended Translation Coverage (es, de, ja, ko)
// ---------------------------------------------------------------------------
console.log('\n[4/4] Verifying Extended Translation Coverage Across All Supported Languages...');

const extendedLangs: LanguageCode[] = ['es', 'de', 'ja', 'ko'];

for (const lang of extendedLangs) {
  const dict = TRANSLATIONS[lang];
  for (const key of targetKeys) {
    const val = dict[key];
    assert(
      typeof val === 'string' && val.trim().length > 0,
      `[${lang.toUpperCase()}] has valid non-empty translation for ${key}`,
      `Value: "${val}"`
    );
  }
}

console.log('\n=============================================================');
console.log(`AUTH REGRESSION RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('=============================================================\n');

if (failed > 0) {
  process.exit(1);
}
