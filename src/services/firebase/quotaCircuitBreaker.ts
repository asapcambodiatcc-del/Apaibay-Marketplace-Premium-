/**
 * Apaibay Marketplace - Firestore Quota & Circuit Breaker Guard
 * Protects client from unbounded retry loops and max backoff storms
 * when Firebase free tier daily write/read quotas are exhausted.
 */

const QUOTA_STORAGE_KEY = 'apaibay_firestore_quota_tripped_at';
const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes circuit-break cooldown

let memoryQuotaTrippedAt: number | null = null;
const listeners = new Set<(isExhausted: boolean) => void>();

function notifyListeners(isExhausted: boolean): void {
  for (const listener of listeners) {
    try {
      listener(isExhausted);
    } catch {
      // Ignore listener error
    }
  }
}

export function isFirestoreQuotaExhausted(): boolean {
  const now = Date.now();
  if (memoryQuotaTrippedAt && now - memoryQuotaTrippedAt < COOLDOWN_MS) {
    return true;
  }

  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const stored = window.sessionStorage.getItem(QUOTA_STORAGE_KEY);
      if (stored) {
        const timestamp = parseInt(stored, 10);
        if (!isNaN(timestamp) && now - timestamp < COOLDOWN_MS) {
          memoryQuotaTrippedAt = timestamp;
          return true;
        } else {
          window.sessionStorage.removeItem(QUOTA_STORAGE_KEY);
        }
      }
    }
  } catch {
    // Ignore storage access errors
  }

  if (memoryQuotaTrippedAt !== null) {
    memoryQuotaTrippedAt = null;
    notifyListeners(false);
  }
  return false;
}

export function markFirestoreQuotaExhausted(): void {
  const now = Date.now();
  const wasExhausted = isFirestoreQuotaExhausted();
  memoryQuotaTrippedAt = now;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(QUOTA_STORAGE_KEY, String(now));
    }
  } catch {
    // Ignore storage access errors
  }
  if (!wasExhausted) {
    console.warn(
      '[FirestoreCircuitBreaker] Firestore quota limit reached (resource-exhausted). Tripping circuit breaker for 10 minutes. Falling back to local offline storage.'
    );
    notifyListeners(true);
  }
}

export function resetQuotaCircuitBreakerForTesting(): void {
  memoryQuotaTrippedAt = null;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem(QUOTA_STORAGE_KEY);
    }
  } catch {
    // Ignore
  }
  notifyListeners(false);
}

export function subscribeToQuotaStatus(callback: (isExhausted: boolean) => void): () => void {
  listeners.add(callback);
  callback(isFirestoreQuotaExhausted());
  return () => {
    listeners.delete(callback);
  };
}

export function isQuotaExhaustedError(error: unknown): boolean {
  if (!error) return false;
  const errStr = String(error).toLowerCase();
  const code = (error as any)?.code;
  return (
    code === 'resource-exhausted' ||
    code === 8 ||
    errStr.includes('resource-exhausted') ||
    errStr.includes('quota limit exceeded') ||
    errStr.includes('quota exceeded')
  );
}

export function recordFirestoreError(error: unknown, context?: string): void {
  if (isQuotaExhaustedError(error)) {
    markFirestoreQuotaExhausted();
  } else {
    if (context) {
      console.warn(`[Firestore] ${context} error:`, error);
    }
  }
}
