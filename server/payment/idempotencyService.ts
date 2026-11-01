import crypto from 'crypto';
import { db, doc, getDoc, setDoc } from '../repositories/serverFirestore';

export interface IdempotencyRecord {
  key: string;
  userId: string;
  operation: string;
  createdAt: string;
  payloadHash?: string;
  resultData?: any;
}

export function generatePayloadHash(payload: any): string {
  if (payload === undefined || payload === null) return '';
  const str = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return crypto.createHash('sha256').update(str).digest('hex');
}

export class IdempotencyService {
  private static memoryStore = new Map<string, IdempotencyRecord>();

  /**
   * Checks whether an idempotency key exists and verifies ownership and payload hash.
   * If key belongs to a different user, throws an error to prevent cross-account replay/hijacking.
   * If key is reused with a different payload, throws an IDEMPOTENCY_MISMATCH error.
   */
  static async check(
    key: string,
    currentUserId: string,
    payload?: any
  ): Promise<{ hit: boolean; cachedResult?: any; record?: IdempotencyRecord }> {
    if (!key || typeof key !== 'string') {
      return { hit: false };
    }

    // 1. Check in-memory store
    const memRecord = this.memoryStore.get(key);
    if (memRecord) {
      const boundUser = memRecord.userId || (memRecord as any).customerUid;
      if (boundUser && boundUser !== currentUserId) {
        const error = new Error('Cross-user idempotency key reuse is strictly prohibited.');
        (error as any).code = 'IDEMPOTENCY_KEY_MISUSE';
        (error as any).statusCode = 403;
        throw error;
      }

      if (payload !== undefined && memRecord.payloadHash) {
        const currentHash = generatePayloadHash(payload);
        if (currentHash !== memRecord.payloadHash) {
          const error = new Error('Idempotency key reused with mismatched request payload.');
          (error as any).code = 'IDEMPOTENCY_MISMATCH';
          (error as any).statusCode = 409;
          throw error;
        }
      }

      if (memRecord.resultData) {
        return { hit: true, cachedResult: memRecord.resultData, record: memRecord };
      }
      return { hit: false, record: memRecord };
    }

    // 2. Check Firestore
    try {
      const keyRef = doc(db, 'idempotency_keys', key);
      const snap = await getDoc(keyRef);

      if (!snap.exists()) {
        return { hit: false };
      }

      const data = snap.data() as IdempotencyRecord;

      // Ownership binding check: prevent cross-user idempotency key misuse
      const boundUser = data.userId || (data as any).customerUid;
      if (boundUser && boundUser !== currentUserId) {
        const error = new Error('Cross-user idempotency key reuse is strictly prohibited.');
        (error as any).code = 'IDEMPOTENCY_KEY_MISUSE';
        (error as any).statusCode = 403;
        throw error;
      }

      // Payload hash check (tampering detection)
      if (payload !== undefined && data.payloadHash) {
        const currentHash = generatePayloadHash(payload);
        if (currentHash !== data.payloadHash) {
          const error = new Error('Idempotency key reused with mismatched request payload.');
          (error as any).code = 'IDEMPOTENCY_MISMATCH';
          (error as any).statusCode = 409;
          throw error;
        }
      }

      // Save into memory store
      this.memoryStore.set(key, data);

      if (data.resultData) {
        return { hit: true, cachedResult: data.resultData, record: data };
      }

      return { hit: false, record: data };
    } catch (err: any) {
      if (
        err.code === 'IDEMPOTENCY_KEY_MISUSE' ||
        err.code === 'IDEMPOTENCY_MISMATCH' ||
        err.statusCode === 403 ||
        err.statusCode === 409
      ) {
        throw err;
      }
      // Fail safely for firestore connection issues in local test environments
      return { hit: false };
    }
  }

  /**
   * Saves the operation result under the given idempotency key, bound to user.
   */
  static async save(
    key: string,
    userId: string,
    operationOrPayload: any,
    resultData?: any
  ): Promise<void> {
    if (!key || typeof key !== 'string') return;

    try {
      const isPayloadObj = typeof operationOrPayload === 'object' && resultData !== undefined;
      const operation = isPayloadObj ? 'payment_operation' : (operationOrPayload || 'operation');
      const payloadHash = isPayloadObj ? generatePayloadHash(operationOrPayload) : undefined;
      const actualResult = resultData !== undefined ? resultData : operationOrPayload;

      const record: IdempotencyRecord = {
        key,
        userId,
        operation,
        payloadHash,
        createdAt: new Date().toISOString(),
        resultData: actualResult,
      };

      // Always save to memory store immediately
      this.memoryStore.set(key, record);

      const keyRef = doc(db, 'idempotency_keys', key);
      await setDoc(keyRef, record);
    } catch {
      // Non-blocking in offline mock modes
    }
  }
}
