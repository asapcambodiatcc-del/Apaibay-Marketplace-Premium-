/**
 * Safe mapping of Firebase Authentication error codes to localized translation keys.
 * Raw internal error codes or technical stack traces are never exposed to the end user.
 */

export function getAuthErrorMessageKey(errorCodeOrMessage: string): string {
  const code = errorCodeOrMessage.toLowerCase();

  if (code.includes('auth/invalid-email')) {
    return 'auth.errorInvalidEmail';
  }
  if (code.includes('auth/weak-password')) {
    return 'auth.errorWeakPassword';
  }
  if (
    code.includes('auth/wrong-password') ||
    code.includes('auth/user-not-found') ||
    code.includes('auth/invalid-credential') ||
    code.includes('auth/invalid-login-credentials')
  ) {
    return 'auth.errorInvalidCredentials';
  }
  if (code.includes('auth/email-already-in-use')) {
    return 'auth.errorEmailInUse';
  }
  if (code.includes('auth/user-disabled')) {
    return 'auth.errorUserDisabled';
  }
  if (code.includes('auth/too-many-requests')) {
    return 'auth.errorTooManyRequests';
  }
  if (
    code.includes('auth/network-request-failed') ||
    code.includes('network') ||
    code.includes('offline')
  ) {
    return 'auth.errorNetwork';
  }
  if (code.includes('auth/popup-closed-by-user')) {
    return 'auth.errorGeneral';
  }

  return 'auth.errorGeneral';
}
