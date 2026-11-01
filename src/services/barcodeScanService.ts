import { Product } from '../types';

export interface ScannedBarcodeResult {
  code: string;
  format: string;
  product: Product | null;
}

export interface DemoBarcodeItem {
  code: string;
  label: string;
  productName: string;
  category: string;
  exists: boolean;
}

export const DEMO_BARCODES: DemoBarcodeItem[] = [
  {
    code: '8934521098',
    label: 'UPC-A: 8934521098',
    productName: 'Apex Pro GPS Smartwatch',
    category: 'Electronics',
    exists: true,
  },
  {
    code: '7123984501',
    label: 'EAN-13: 7123984501',
    productName: 'Pro Wireless ANC Headphones',
    category: 'Electronics',
    exists: true,
  },
  {
    code: '9081234567',
    label: 'CODE-128: 9081234567',
    productName: 'Ultra Lightweight Running Shoes',
    category: 'Fashion',
    exists: true,
  },
  {
    code: '6549871230',
    label: 'QR: apaibay://prod-fs-3',
    productName: 'Zenith Mechanical Gaming Keyboard',
    category: 'Gaming',
    exists: true,
  },
  {
    code: '5432167890',
    label: 'UPC-A: 5432167890',
    productName: 'Vortex 4K Action Camera',
    category: 'Electronics',
    exists: true,
  },
  {
    code: '9999999999',
    label: 'UPC-A: 9999999999',
    productName: 'Unknown Product (Test Unmatched)',
    category: 'Test QA',
    exists: false,
  },
];

/**
 * Checks if browser natively supports the BarcodeDetector API
 */
export function isBarcodeDetectorSupported(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
}

/**
 * Scans video element frame using the native BarcodeDetector API if available
 */
export async function detectBarcodeFromVideo(
  video: HTMLVideoElement
): Promise<{ code: string; format: string } | null> {
  if (!isBarcodeDetectorSupported()) {
    return null;
  }

  try {
    const BarcodeDetectorClass = (window as unknown as { BarcodeDetector: any }).BarcodeDetector;
    const detector = new BarcodeDetectorClass({
      formats: ['qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'],
    });

    const barcodes = await detector.detect(video);
    if (barcodes && barcodes.length > 0) {
      return {
        code: barcodes[0].rawValue || barcodes[0].displayValue,
        format: barcodes[0].format || 'barcode',
      };
    }
  } catch (err) {
    console.debug('Native BarcodeDetector scan frame attempt failed:', err);
  }

  return null;
}

/**
 * Look up a product from the database by barcode, SKU, slug, or ID
 */
export function lookupProductByBarcode(
  rawCode: string,
  catalog: Product[]
): Product | null {
  const clean = rawCode.trim().toLowerCase();

  // Match by direct barcode or sku
  const matchDirect = catalog.find(
    (p) =>
      p.barcode?.toLowerCase() === clean ||
      p.sku?.toLowerCase() === clean ||
      p.id.toLowerCase() === clean
  );
  if (matchDirect) return matchDirect;

  // Match by QR URI e.g. "apaibay://product/prod-fs-1" or "apaibay://prod-fs-1"
  if (clean.includes('apaibay')) {
    const matchedById = catalog.find(
      (p) => clean.includes(p.id.toLowerCase()) || clean.includes(p.slug.toLowerCase())
    );
    if (matchedById) return matchedById;
  }

  // Fallback demo matching for standard demo barcode numbers
  if (clean === '8934521098') return catalog[0] || null;
  if (clean === '7123984501') return catalog[1] || null;
  if (clean === '9081234567') return catalog[2] || null;
  if (clean === '6549871230') return catalog[3] || null;
  if (clean === '5432167890') return catalog[4] || null;

  return null;
}
