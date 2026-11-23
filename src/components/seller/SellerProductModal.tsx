import React, { useState, useEffect } from 'react';
import { X, Package, AlertTriangle } from 'lucide-react';
import { Product } from '../../types';
import { SellerProductPayload } from '../../services/sellerClient';
import { isValidHttpImageUrl, validateProductFormInput } from './sellerUtils';

interface SellerProductModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  storeName: string;
  initialProduct?: Product | null;
  onClose: () => void;
  onSubmit: (payload: SellerProductPayload) => Promise<void>;
}

const DEFAULT_FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800';

const PRODUCT_CATEGORIES = [
  { value: 'electronics', label: 'Electronics' },
  { value: 'fashion', label: 'Fashion' },
  { value: 'home-kitchen', label: 'Home & Kitchen' },
  { value: 'beauty', label: 'Beauty & Personal Care' },
  { value: 'sports', label: 'Sports & Outdoors' },
  { value: 'gaming', label: 'Gaming & VR' },
  { value: 'automotive', label: 'Automotive & Tools' },
  { value: 'books', label: 'Books & Stationery' },
  { value: 'groceries', label: 'Groceries & Gourmet' },
  { value: 'handcrafts', label: 'Artisanal & Crafts' },
];

export const SellerProductModal: React.FC<SellerProductModalProps> = ({
  isOpen,
  mode,
  storeName,
  initialProduct,
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState('');
  const [status, setStatus] = useState<'active' | 'draft'>('active');
  const [price, setPrice] = useState('');
  const [originalPrice, setOriginalPrice] = useState('');
  const [category, setCategory] = useState('electronics');
  const [brand, setBrand] = useState('');
  const [sku, setSku] = useState('');
  const [stock, setStock] = useState('25');
  const [image, setImage] = useState(DEFAULT_FALLBACK_IMAGE);
  const [secondaryImage, setSecondaryImage] = useState('');
  const [galleryText, setGalleryText] = useState('');
  const [description, setDescription] = useState('');
  const [featuresText, setFeaturesText] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setFormError(null);
    setPreviewFailed(false);

    if (mode === 'edit' && initialProduct) {
      setName(initialProduct.name || '');
      setStatus(initialProduct.status === 'draft' ? 'draft' : 'active');
      setPrice(typeof initialProduct.price === 'number' ? String(initialProduct.price) : '');
      setOriginalPrice(
        typeof initialProduct.originalPrice === 'number' ? String(initialProduct.originalPrice) : ''
      );
      setCategory(initialProduct.category || 'electronics');
      setBrand(initialProduct.brand || storeName || '');
      setSku(initialProduct.sku || '');
      const initialStock =
        typeof initialProduct.stock === 'number'
          ? initialProduct.stock
          : typeof initialProduct.stockCount === 'number'
          ? initialProduct.stockCount
          : 25;
      setStock(String(initialStock));
      setImage(initialProduct.image || DEFAULT_FALLBACK_IMAGE);
      setSecondaryImage(initialProduct.secondaryImage || '');
      setGalleryText(Array.isArray(initialProduct.gallery) ? initialProduct.gallery.join('\n') : '');
      setDescription(initialProduct.description || '');
      setFeaturesText(Array.isArray(initialProduct.features) ? initialProduct.features.join('\n') : '');
      setTagsText(Array.isArray(initialProduct.tags) ? initialProduct.tags.join(', ') : '');
    } else {
      setName('');
      setStatus('active');
      setPrice('');
      setOriginalPrice('');
      setCategory('electronics');
      setBrand(storeName || '');
      setSku('');
      setStock('25');
      setImage(DEFAULT_FALLBACK_IMAGE);
      setSecondaryImage('');
      setGalleryText('');
      setDescription('');
      setFeaturesText('');
      setTagsText('');
    }
  }, [isOpen, mode, initialProduct, storeName]);

  if (!isOpen) return null;

  const parseGalleryUrls = (): string[] =>
    galleryText
      .split(/[\n,]+/)
      .map((u) => u.trim())
      .filter(Boolean);

  const parseFeatures = (): string[] =>
    featuresText
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean);

  const parseTags = (): string[] =>
    tagsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const galleryUrls = parseGalleryUrls();
    const features = parseFeatures();
    const tags = parseTags();

    const validationError = validateProductFormInput({
      name,
      price,
      originalPrice,
      category,
      brand,
      sku,
      stock,
      image,
      secondaryImage,
      galleryUrls,
      description,
      features,
      tags,
      status,
    });

    if (validationError) {
      setFormError(validationError);
      return;
    }

    const priceNum = parseFloat(Number(price).toFixed(2));
    const origPriceNum = originalPrice.trim()
      ? parseFloat(Number(originalPrice).toFixed(2))
      : parseFloat((priceNum * 1.2).toFixed(2));
    const stockNum = parseInt(stock, 10);

    const payload: SellerProductPayload = {
      name: name.trim(),
      price: priceNum,
      originalPrice: origPriceNum,
      category: category.trim(),
      brand: brand.trim() || storeName || 'Marketplace Merchant',
      image: image.trim() || DEFAULT_FALLBACK_IMAGE,
      secondaryImage: secondaryImage.trim() || undefined,
      gallery: galleryUrls,
      description: description.trim() || `${storeName || 'Verified Merchant'} official listing.`,
      stock: stockNum,
      sku: sku.trim() || undefined,
      features,
      tags: tags.length > 0 ? tags : [category.trim()],
      status,
    };

    try {
      setSubmitting(true);
      await onSubmit(payload);
    } catch (err: any) {
      setFormError(err?.message || 'Unable to save product listing. Please review your inputs.');
    } finally {
      setSubmitting(false);
    }
  };

  const canRenderPreview = isValidHttpImageUrl(image) && !previewFailed;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-2xl w-full p-5 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
              {mode === 'edit' ? 'Edit Product Listing' : 'Add New Product Listing'}
            </h3>
            {mode === 'edit' && initialProduct && (
              <p className="text-[11px] text-slate-400 mt-0.5">
                ID: <span className="font-mono">{initialProduct.id}</span> &bull; Product ID, URL slug, and order history remain preserved.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close product modal"
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {formError && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{formError}</span>
          </div>
        )}

        {mode === 'edit' && initialProduct?.status === 'archived' && (
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-300">
            This product is currently <strong>Archived</strong>. Saving changes with status set to <strong>Active</strong> or <strong>Draft</strong> will restore the listing.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Title & Listing Status */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1">
              <label className="font-bold text-slate-700 dark:text-slate-300">Product Title *</label>
              <input
                type="text"
                required
                maxLength={200}
                placeholder="e.g. Wireless Noise-Cancelling Headphones"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full min-h-[42px] p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-[#ff6a00]"
              />
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-700 dark:text-slate-300">Listing Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'active' | 'draft')}
                className="w-full min-h-[42px] p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              >
                <option value="active">Active (Live on Storefront)</option>
                <option value="draft">Draft (Hidden from Storefront)</option>
              </select>
            </div>
          </div>

          {/* Pricing & Stock */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="font-bold text-slate-700 dark:text-slate-300">Sale Price ($) *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="99.99"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full min-h-[42px] p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white tabular-nums"
              />
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-700 dark:text-slate-300">Original Price ($)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="129.99"
                value={originalPrice}
                onChange={(e) => setOriginalPrice(e.target.value)}
                className="w-full min-h-[42px] p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white tabular-nums"
              />
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-700 dark:text-slate-300">Stock Quantity *</label>
              <input
                type="number"
                min="0"
                step="1"
                required
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                className="w-full min-h-[42px] p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white tabular-nums"
              />
            </div>
          </div>

          {/* Category, Brand & SKU */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="font-bold text-slate-700 dark:text-slate-300">Category *</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full min-h-[42px] p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              >
                {PRODUCT_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
                {!PRODUCT_CATEGORIES.some((c) => c.value === category) && category && (
                  <option value={category}>{category}</option>
                )}
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-700 dark:text-slate-300">Brand</label>
              <input
                type="text"
                maxLength={100}
                placeholder={storeName}
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="w-full min-h-[42px] p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-700 dark:text-slate-300">SKU (Optional)</label>
              <input
                type="text"
                maxLength={64}
                placeholder="e.g. APAI-SKU-001"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="w-full min-h-[42px] p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono"
              />
            </div>
          </div>

          {/* Primary & Secondary Image + Preview */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60">
            <div className="sm:col-span-3 flex items-center justify-center">
              {canRenderPreview ? (
                <img
                  src={image.trim()}
                  alt="Product preview"
                  onError={() => setPreviewFailed(true)}
                  className="w-20 h-20 rounded-2xl object-cover border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              ) : (
                <div className="w-20 h-20 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex flex-col items-center justify-center text-slate-400">
                  <Package className="w-6 h-6" />
                  <span className="text-[10px] mt-1">Preview</span>
                </div>
              )}
            </div>

            <div className="sm:col-span-9 space-y-2.5">
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">Primary Image URL *</label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={image}
                  onChange={(e) => {
                    setImage(e.target.value);
                    setPreviewFailed(false);
                  }}
                  className="w-full min-h-[40px] p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">Secondary / Hover Image URL</label>
                <input
                  type="url"
                  placeholder="https://... (optional)"
                  value={secondaryImage}
                  onChange={(e) => setSecondaryImage(e.target.value)}
                  className="w-full min-h-[40px] p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Additional Gallery URLs */}
          <div className="space-y-1">
            <label className="font-bold text-slate-700 dark:text-slate-300">
              Additional Gallery Image URLs (One URL per line or comma-separated, max 8)
            </label>
            <textarea
              rows={2}
              placeholder="https://example.com/angle-1.jpg"
              value={galleryText}
              onChange={(e) => setGalleryText(e.target.value)}
              className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
            />
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="font-bold text-slate-700 dark:text-slate-300">Description</label>
            <textarea
              rows={3}
              maxLength={4000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe product craftsmanship, specifications, materials, and warranty..."
              className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
            />
          </div>

          {/* Key Features & Tags */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="font-bold text-slate-700 dark:text-slate-300">
                Key Features (One per line)
              </label>
              <textarea
                rows={2}
                placeholder={'Bluetooth 5.3\n40-hour battery life'}
                value={featuresText}
                onChange={(e) => setFeaturesText(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-700 dark:text-slate-300">
                Search Tags (Comma-separated)
              </label>
              <textarea
                rows={2}
                placeholder="wireless, audio, headphones"
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="pt-2 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="min-h-[42px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-200 cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[42px] px-5 py-2.5 rounded-xl bg-[#ff6a00] hover:bg-[#e05d00] text-white font-bold cursor-pointer disabled:opacity-50 shadow-xs transition-colors"
            >
              {submitting
                ? mode === 'edit'
                  ? 'Saving Changes...'
                  : 'Saving Listing...'
                : mode === 'edit'
                ? 'Save Product Changes'
                : status === 'draft'
                ? 'Save as Draft'
                : 'Publish Listing'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
