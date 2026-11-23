export interface ValidatedShipmentPayload {
  carrier: string;
  trackingNumber: string;
  trackingUrl?: string;
  shippedAt: string;
  notes?: string;
}

export interface ShipmentValidationResult {
  valid: boolean;
  errors: string[];
  data?: ValidatedShipmentPayload;
}

const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]/;
const TRACKING_NUMBER_ALLOWED_RE = /^[A-Za-z0-9._\-\/ ]+$/;

/**
 * Strictly validates carrier tracking URLs as http:// or https:// without whitespace/control characters.
 */
export function isValidSafeHttpUrl(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 500) return false;
  if (CONTROL_CHARS_RE.test(trimmed) || /\s/.test(trimmed)) return false;

  try {
    const parsed = new URL(trimmed);
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

export function validateShipmentInput(body: any): ShipmentValidationResult {
  const errors: string[] = [];

  const rawCarrier = typeof body?.carrier === 'string' ? body.carrier.trim() : '';
  if (!rawCarrier || rawCarrier.length < 2 || rawCarrier.length > 80 || CONTROL_CHARS_RE.test(rawCarrier)) {
    errors.push('Shipping carrier name must be between 2 and 80 valid characters.');
  }

  const rawTrackingNumber = typeof body?.trackingNumber === 'string' ? body.trackingNumber.trim() : '';
  const alphanumericCount = (rawTrackingNumber.match(/[A-Za-z0-9]/g) || []).length;
  if (
    !rawTrackingNumber ||
    rawTrackingNumber.length < 3 ||
    rawTrackingNumber.length > 100 ||
    CONTROL_CHARS_RE.test(rawTrackingNumber) ||
    !TRACKING_NUMBER_ALLOWED_RE.test(rawTrackingNumber) ||
    alphanumericCount < 3
  ) {
    errors.push(
      'Tracking number must be 3 to 100 characters using letters, numbers, hyphens, underscores, slashes, or periods.'
    );
  }

  let cleanTrackingUrl: string | undefined;
  if (body?.trackingUrl !== undefined && body?.trackingUrl !== null && String(body.trackingUrl).trim() !== '') {
    const rawUrl = String(body.trackingUrl).trim();
    if (!isValidSafeHttpUrl(rawUrl)) {
      errors.push('Tracking URL must be a valid http:// or https:// web link (max 500 characters).');
    } else {
      cleanTrackingUrl = rawUrl;
    }
  }

  let cleanShippedAt = new Date().toISOString();
  if (body?.shippedAt !== undefined && body?.shippedAt !== null && String(body.shippedAt).trim() !== '') {
    const rawDate = String(body.shippedAt).trim();
    const parsedTime = Date.parse(rawDate);
    const minValidTime = Date.UTC(2020, 0, 1);
    const maxValidTime = Date.now() + 7 * 24 * 60 * 60 * 1000;
    if (isNaN(parsedTime) || parsedTime < minValidTime || parsedTime > maxValidTime) {
      errors.push('Shipped date must be a valid recent date.');
    } else {
      cleanShippedAt = new Date(parsedTime).toISOString();
    }
  }

  let cleanNotes: string | undefined;
  if (body?.notes !== undefined && body?.notes !== null && String(body.notes).trim() !== '') {
    const rawNotes = String(body.notes).trim();
    if (rawNotes.length > 500 || CONTROL_CHARS_RE.test(rawNotes)) {
      errors.push('Shipping notes must not exceed 500 valid characters.');
    } else {
      cleanNotes = rawNotes;
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    data: {
      carrier: rawCarrier,
      trackingNumber: rawTrackingNumber,
      trackingUrl: cleanTrackingUrl,
      shippedAt: cleanShippedAt,
      notes: cleanNotes,
    },
  };
}
