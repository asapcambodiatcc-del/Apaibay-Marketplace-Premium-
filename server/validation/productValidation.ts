export interface ValidatedProductFields {
  name: string;
  description: string;
  category: string;
  brand: string;
  price: number;
  originalPrice: number;
  stock: number;
  image: string;
  secondaryImage?: string;
  gallery: string[];
  sku?: string;
  features: string[];
  tags: string[];
  status: 'active' | 'draft';
}

export const PRODUCT_LIMITS = {
  NAME_MIN: 2,
  NAME_MAX: 200,
  DESCRIPTION_MAX: 4000,
  CATEGORY_MAX: 80,
  BRAND_MAX: 100,
  SKU_MAX: 64,
  PRICE_MIN: 0.01,
  PRICE_MAX: 1_000_000,
  STOCK_MAX: 1_000_000,
  URL_MAX: 1000,
  MAX_GALLERY_IMAGES: 8,
  MAX_FEATURES: 12,
  FEATURE_MAX_LEN: 200,
  MAX_TAGS: 15,
  TAG_MAX_LEN: 50,
} as const;

export const DEFAULT_PRODUCT_IMAGE =
  'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800';

export function isSafeHttpUrl(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > PRODUCT_LIMITS.URL_MAX) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function normalizeStringArray(
  raw: unknown,
  maxItems: number,
  maxItemLen: number,
  fieldName: string,
  errors: string[]
): string[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    errors.push(`${fieldName} must be an array of strings.`);
    return undefined;
  }
  if (raw.length > maxItems) {
    errors.push(`${fieldName} cannot exceed ${maxItems} entries.`);
    return undefined;
  }
  const cleaned: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') {
      errors.push(`Every entry in ${fieldName} must be a string.`);
      return undefined;
    }
    const val = entry.trim();
    if (!val) continue;
    if (val.length > maxItemLen) {
      errors.push(`${fieldName} entries must be at most ${maxItemLen} characters.`);
      return undefined;
    }
    if (!cleaned.includes(val)) cleaned.push(val);
  }
  return cleaned;
}

function normalizeGalleryUrls(raw: unknown, errors: string[]): string[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    errors.push('gallery must be an array of image URLs.');
    return undefined;
  }
  if (raw.length > PRODUCT_LIMITS.MAX_GALLERY_IMAGES) {
    errors.push(`gallery cannot exceed ${PRODUCT_LIMITS.MAX_GALLERY_IMAGES} images.`);
    return undefined;
  }
  const cleaned: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') {
      errors.push('Every gallery item must be a valid URL string.');
      return undefined;
    }
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (!isSafeHttpUrl(trimmed)) {
      errors.push('All gallery image URLs must use valid http:// or https:// URLs.');
      return undefined;
    }
    if (!cleaned.includes(trimmed)) cleaned.push(trimmed);
  }
  return cleaned;
}

export function validateCreateProductInput(body: any): {
  valid: boolean;
  errors: string[];
  data?: ValidatedProductFields;
} {
  const errors: string[] = [];

  if (!body || typeof body !== 'object') {
    return { valid: false, errors: ['Request body must be a JSON object.'] };
  }

  // Name (required)
  const rawName = typeof body.name === 'string' ? body.name.trim() : '';
  if (rawName.length < PRODUCT_LIMITS.NAME_MIN || rawName.length > PRODUCT_LIMITS.NAME_MAX) {
    errors.push(`Product name must be between ${PRODUCT_LIMITS.NAME_MIN} and ${PRODUCT_LIMITS.NAME_MAX} characters.`);
  }

  // Price (required)
  const priceNum = typeof body.price === 'number' ? body.price : Number(body.price);
  if (
    body.price === undefined ||
    body.price === null ||
    body.price === '' ||
    !Number.isFinite(priceNum) ||
    priceNum < PRODUCT_LIMITS.PRICE_MIN ||
    priceNum > PRODUCT_LIMITS.PRICE_MAX
  ) {
    errors.push(`Product price must be between $${PRODUCT_LIMITS.PRICE_MIN} and $${PRODUCT_LIMITS.PRICE_MAX}.`);
  }
  const cleanPrice = Number.isFinite(priceNum) ? parseFloat(priceNum.toFixed(2)) : 0;

  // Original price (optional)
  let cleanOriginalPrice = parseFloat((cleanPrice * 1.2).toFixed(2));
  if (body.originalPrice !== undefined && body.originalPrice !== null && body.originalPrice !== '') {
    const origNum = typeof body.originalPrice === 'number' ? body.originalPrice : Number(body.originalPrice);
    if (!Number.isFinite(origNum) || origNum < cleanPrice || origNum > PRODUCT_LIMITS.PRICE_MAX) {
      errors.push('Original price must be a valid number greater than or equal to the sale price.');
    } else {
      cleanOriginalPrice = parseFloat(origNum.toFixed(2));
    }
  }

  // Description (optional)
  let cleanDescription = 'Verified merchant marketplace listing.';
  if (body.description !== undefined && body.description !== null) {
    if (typeof body.description !== 'string') {
      errors.push('Description must be a string.');
    } else {
      const trimmedDesc = body.description.trim();
      if (trimmedDesc.length > PRODUCT_LIMITS.DESCRIPTION_MAX) {
        errors.push(`Description cannot exceed ${PRODUCT_LIMITS.DESCRIPTION_MAX} characters.`);
      } else if (trimmedDesc.length > 0) {
        cleanDescription = trimmedDesc;
      }
    }
  }

  // Category (optional, default electronics)
  let cleanCategory = 'electronics';
  if (body.category !== undefined && body.category !== null && body.category !== '') {
    if (typeof body.category !== 'string' || body.category.trim().length > PRODUCT_LIMITS.CATEGORY_MAX) {
      errors.push(`Category must be a string up to ${PRODUCT_LIMITS.CATEGORY_MAX} characters.`);
    } else {
      cleanCategory = body.category.trim();
    }
  }

  // Brand (optional)
  let cleanBrand = 'Marketplace Merchant';
  if (body.brand !== undefined && body.brand !== null && body.brand !== '') {
    if (typeof body.brand !== 'string' || body.brand.trim().length > PRODUCT_LIMITS.BRAND_MAX) {
      errors.push(`Brand must be a string up to ${PRODUCT_LIMITS.BRAND_MAX} characters.`);
    } else {
      cleanBrand = body.brand.trim();
    }
  }

  // Stock (optional, default 25)
  let cleanStock = 25;
  if (body.stock !== undefined && body.stock !== null && body.stock !== '') {
    const stockNum = typeof body.stock === 'number' ? body.stock : Number(body.stock);
    if (!Number.isInteger(stockNum) || stockNum < 0 || stockNum > PRODUCT_LIMITS.STOCK_MAX) {
      errors.push(`Stock must be an integer between 0 and ${PRODUCT_LIMITS.STOCK_MAX}.`);
    } else {
      cleanStock = stockNum;
    }
  }

  // Image (optional, default placeholder)
  let cleanImage = DEFAULT_PRODUCT_IMAGE;
  if (body.image !== undefined && body.image !== null && String(body.image).trim() !== '') {
    if (!isSafeHttpUrl(body.image)) {
      errors.push('Primary image must be a valid http:// or https:// URL.');
    } else {
      cleanImage = String(body.image).trim();
    }
  }

  // Secondary image (optional)
  let cleanSecondaryImage: string | undefined;
  if (body.secondaryImage !== undefined && body.secondaryImage !== null && String(body.secondaryImage).trim() !== '') {
    if (!isSafeHttpUrl(body.secondaryImage)) {
      errors.push('Secondary image must be a valid http:// or https:// URL.');
    } else {
      cleanSecondaryImage = String(body.secondaryImage).trim();
    }
  }

  // Gallery (optional)
  const cleanGallery = normalizeGalleryUrls(body.gallery, errors) || [];

  // SKU (optional)
  let cleanSku: string | undefined;
  if (body.sku !== undefined && body.sku !== null && String(body.sku).trim() !== '') {
    const skuStr = String(body.sku).trim();
    if (skuStr.length > PRODUCT_LIMITS.SKU_MAX) {
      errors.push(`SKU cannot exceed ${PRODUCT_LIMITS.SKU_MAX} characters.`);
    } else {
      cleanSku = skuStr;
    }
  }

  const cleanFeatures =
    normalizeStringArray(body.features, PRODUCT_LIMITS.MAX_FEATURES, PRODUCT_LIMITS.FEATURE_MAX_LEN, 'features', errors) ||
    [];
  const cleanTags =
    normalizeStringArray(body.tags, PRODUCT_LIMITS.MAX_TAGS, PRODUCT_LIMITS.TAG_MAX_LEN, 'tags', errors) ||
    [cleanCategory, 'new'];

  // Status (optional: active | draft)
  let cleanStatus: 'active' | 'draft' = 'active';
  if (body.status !== undefined && body.status !== null && body.status !== '') {
    if (body.status !== 'active' && body.status !== 'draft') {
      errors.push("Initial product status must be 'active' or 'draft'.");
    } else {
      cleanStatus = body.status;
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    data: {
      name: rawName,
      description: cleanDescription,
      category: cleanCategory,
      brand: cleanBrand,
      price: cleanPrice,
      originalPrice: cleanOriginalPrice,
      stock: cleanStock,
      image: cleanImage,
      secondaryImage: cleanSecondaryImage,
      gallery: cleanGallery,
      sku: cleanSku,
      features: cleanFeatures,
      tags: cleanTags,
      status: cleanStatus,
    },
  };
}

export function validateUpdateProductInput(
  body: any,
  existingProduct: {
    price?: number;
    originalPrice?: number;
    stock?: number;
    stockCount?: number;
    status?: string;
  }
): {
  valid: boolean;
  errors: string[];
  updates?: Record<string, any>;
} {
  const errors: string[] = [];

  if (!body || typeof body !== 'object') {
    return { valid: false, errors: ['Request body must be a JSON object.'] };
  }

  const updates: Record<string, any> = {};
  let hasAnyField = false;

  if (body.name !== undefined) {
    hasAnyField = true;
    const rawName = typeof body.name === 'string' ? body.name.trim() : '';
    if (rawName.length < PRODUCT_LIMITS.NAME_MIN || rawName.length > PRODUCT_LIMITS.NAME_MAX) {
      errors.push(`Product name must be between ${PRODUCT_LIMITS.NAME_MIN} and ${PRODUCT_LIMITS.NAME_MAX} characters.`);
    } else {
      updates.name = rawName;
    }
  }

  if (body.description !== undefined) {
    hasAnyField = true;
    if (typeof body.description !== 'string') {
      errors.push('Description must be a string.');
    } else {
      const desc = body.description.trim();
      if (desc.length === 0) {
        errors.push('Description cannot be empty.');
      } else if (desc.length > PRODUCT_LIMITS.DESCRIPTION_MAX) {
        errors.push(`Description cannot exceed ${PRODUCT_LIMITS.DESCRIPTION_MAX} characters.`);
      } else {
        updates.description = desc;
      }
    }
  }

  if (body.category !== undefined) {
    hasAnyField = true;
    const cat = typeof body.category === 'string' ? body.category.trim() : '';
    if (!cat || cat.length > PRODUCT_LIMITS.CATEGORY_MAX) {
      errors.push(`Category must be between 1 and ${PRODUCT_LIMITS.CATEGORY_MAX} characters.`);
    } else {
      updates.category = cat;
    }
  }

  if (body.brand !== undefined) {
    hasAnyField = true;
    const brand = typeof body.brand === 'string' ? body.brand.trim() : '';
    if (!brand || brand.length > PRODUCT_LIMITS.BRAND_MAX) {
      errors.push(`Brand must be between 1 and ${PRODUCT_LIMITS.BRAND_MAX} characters.`);
    } else {
      updates.brand = brand;
    }
  }

  let effectivePrice = Number(existingProduct.price ?? 0);
  if (body.price !== undefined) {
    hasAnyField = true;
    const p = typeof body.price === 'number' ? body.price : Number(body.price);
    if (!Number.isFinite(p) || p < PRODUCT_LIMITS.PRICE_MIN || p > PRODUCT_LIMITS.PRICE_MAX) {
      errors.push(`Price must be between $${PRODUCT_LIMITS.PRICE_MIN} and $${PRODUCT_LIMITS.PRICE_MAX}.`);
    } else {
      effectivePrice = parseFloat(p.toFixed(2));
      updates.price = effectivePrice;
    }
  }

  let effectiveOrigPrice = Number(existingProduct.originalPrice ?? effectivePrice);
  if (body.originalPrice !== undefined && body.originalPrice !== null && body.originalPrice !== '') {
    hasAnyField = true;
    const op = typeof body.originalPrice === 'number' ? body.originalPrice : Number(body.originalPrice);
    if (!Number.isFinite(op) || op < effectivePrice || op > PRODUCT_LIMITS.PRICE_MAX) {
      errors.push('Original price must be greater than or equal to sale price.');
    } else {
      effectiveOrigPrice = parseFloat(op.toFixed(2));
      updates.originalPrice = effectiveOrigPrice;
    }
  } else if (body.price !== undefined && effectiveOrigPrice < effectivePrice) {
    effectiveOrigPrice = effectivePrice;
    updates.originalPrice = effectivePrice;
  }

  if (body.price !== undefined || body.originalPrice !== undefined) {
    updates.discountPercentage =
      effectiveOrigPrice > 0
        ? Math.max(0, Math.round(((effectiveOrigPrice - effectivePrice) / effectiveOrigPrice) * 100))
        : 0;
  }

  let effectiveStock =
    typeof existingProduct.stock === 'number'
      ? existingProduct.stock
      : typeof existingProduct.stockCount === 'number'
      ? existingProduct.stockCount
      : 25;

  if (body.stock !== undefined) {
    hasAnyField = true;
    const s = typeof body.stock === 'number' ? body.stock : Number(body.stock);
    if (!Number.isInteger(s) || s < 0 || s > PRODUCT_LIMITS.STOCK_MAX) {
      errors.push(`Stock must be an integer between 0 and ${PRODUCT_LIMITS.STOCK_MAX}.`);
    } else {
      effectiveStock = s;
      updates.stock = s;
      updates.stockCount = s;
    }
  }

  if (body.image !== undefined) {
    hasAnyField = true;
    if (!isSafeHttpUrl(body.image)) {
      errors.push('Primary image must be a valid http:// or https:// URL.');
    } else {
      updates.image = String(body.image).trim();
    }
  }

  if (body.secondaryImage !== undefined) {
    hasAnyField = true;
    const sec = String(body.secondaryImage || '').trim();
    if (sec === '') {
      updates.secondaryImage = null;
    } else if (!isSafeHttpUrl(sec)) {
      errors.push('Secondary image must be a valid http:// or https:// URL.');
    } else {
      updates.secondaryImage = sec;
    }
  }

  if (body.gallery !== undefined) {
    hasAnyField = true;
    const cleanedGallery = normalizeGalleryUrls(body.gallery, errors);
    if (cleanedGallery !== undefined) {
      updates.gallery = cleanedGallery;
    }
  }

  if (body.sku !== undefined) {
    hasAnyField = true;
    const skuStr = String(body.sku || '').trim();
    if (skuStr.length > PRODUCT_LIMITS.SKU_MAX) {
      errors.push(`SKU cannot exceed ${PRODUCT_LIMITS.SKU_MAX} characters.`);
    } else if (skuStr) {
      updates.sku = skuStr;
    }
  }

  if (body.features !== undefined) {
    hasAnyField = true;
    const features = normalizeStringArray(
      body.features,
      PRODUCT_LIMITS.MAX_FEATURES,
      PRODUCT_LIMITS.FEATURE_MAX_LEN,
      'features',
      errors
    );
    if (features !== undefined) updates.features = features;
  }

  if (body.tags !== undefined) {
    hasAnyField = true;
    const tags = normalizeStringArray(
      body.tags,
      PRODUCT_LIMITS.MAX_TAGS,
      PRODUCT_LIMITS.TAG_MAX_LEN,
      'tags',
      errors
    );
    if (tags !== undefined) updates.tags = tags;
  }

  let effectiveStatus = existingProduct.status || 'active';
  if (body.status !== undefined) {
    hasAnyField = true;
    if (body.status !== 'active' && body.status !== 'draft') {
      errors.push("Listing status on update must be 'active' or 'draft'. Use the archive endpoint to archive a product.");
    } else {
      effectiveStatus = body.status;
      updates.status = body.status;
    }
  }

  if (existingProduct.status === 'archived' && body.status !== 'active' && body.status !== 'draft') {
    errors.push('Archived products cannot be modified unless restored to draft or active status.');
  }

  if (!hasAnyField) {
    errors.push('At least one editable product field is required.');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  if (body.stock !== undefined || body.status !== undefined) {
    updates.inStock = effectiveStatus !== 'archived' && effectiveStock > 0;
  }

  return { valid: true, errors: [], updates };
}
