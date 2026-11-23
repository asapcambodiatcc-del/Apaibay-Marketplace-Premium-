import React, { useState, useMemo } from 'react';
import {
  Boxes,
  Plus,
  Search,
  Package,
  Save,
  Minus,
  CheckCircle2,
  AlertTriangle,
  Pencil,
  Archive,
  FileEdit,
} from 'lucide-react';
import { Product } from '../../types';
import { SellerClient } from '../../services/sellerClient';
import { getDisplayProductStatus, getProductStockCount } from './sellerUtils';

interface SellerInventoryPanelProps {
  storeName: string;
  products: Product[];
  canManageCatalog: boolean;
  onOpenAddModal: () => void;
  onOpenEditModal: (product: Product) => void;
  onRefreshProducts: () => Promise<void>;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

type StatusFilter = 'all' | 'active' | 'draft' | 'out_of_stock' | 'low_stock' | 'archived';

export const SellerInventoryPanel: React.FC<SellerInventoryPanelProps> = ({
  storeName,
  products,
  canManageCatalog,
  onOpenAddModal,
  onOpenEditModal,
  onRefreshProducts,
  onShowToast,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [draftStocks, setDraftStocks] = useState<Record<string, string>>({});
  const [savingProductId, setSavingProductId] = useState<string | null>(null);
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);
  const [archivingProductId, setArchivingProductId] = useState<string | null>(null);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set).sort();
  }, [products]);

  const statusCounts = useMemo(() => {
    const counts = { all: products.length, active: 0, draft: 0, out_of_stock: 0, archived: 0 };
    for (const prod of products) {
      const st = getDisplayProductStatus(prod);
      counts[st]++;
    }
    return counts;
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return products.filter((prod) => {
      const stock = getProductStockCount(prod);
      const displayStatus = getDisplayProductStatus(prod);

      if (categoryFilter !== 'all' && prod.category !== categoryFilter) return false;
      if (statusFilter === 'active' && displayStatus !== 'active') return false;
      if (statusFilter === 'draft' && displayStatus !== 'draft') return false;
      if (statusFilter === 'out_of_stock' && displayStatus !== 'out_of_stock') return false;
      if (statusFilter === 'archived' && displayStatus !== 'archived') return false;
      if (statusFilter === 'low_stock' && (displayStatus !== 'active' || stock > 5)) return false;

      if (q) {
        const hay = `${prod.name} ${prod.sku || ''} ${prod.brand || ''} ${prod.category || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [products, searchTerm, categoryFilter, statusFilter]);

  const getDraftStockString = (prod: Product): string => {
    if (draftStocks[prod.id] !== undefined) return draftStocks[prod.id];
    return String(getProductStockCount(prod));
  };

  const handleStepStock = (prod: Product, delta: number) => {
    if (prod.status === 'archived') return;
    const current = parseInt(getDraftStockString(prod), 10);
    const base = isNaN(current) ? getProductStockCount(prod) : current;
    const next = Math.max(0, base + delta);
    setDraftStocks((prev) => ({ ...prev, [prod.id]: String(next) }));
  };

  const handleSaveStock = async (prod: Product) => {
    if (!canManageCatalog) {
      onShowToast('Only active verified sellers can update inventory.', 'error');
      return;
    }
    if (prod.status === 'archived') {
      onShowToast('Archived listings cannot be restocked until restored.', 'error');
      return;
    }

    const parsed = parseInt(getDraftStockString(prod), 10);
    if (isNaN(parsed) || parsed < 0) {
      onShowToast('Stock count must be a non-negative whole number.', 'error');
      return;
    }

    setSavingProductId(prod.id);
    try {
      await SellerClient.updateProductInventory(prod.id, parsed);
      await onRefreshProducts();
      setDraftStocks((prev) => {
        const next = { ...prev };
        delete next[prod.id];
        return next;
      });
      onShowToast(`Updated inventory for "${prod.name}" to ${parsed} units.`, 'success');
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to update product inventory.', 'error');
    } finally {
      setSavingProductId(null);
    }
  };

  const handleConfirmArchive = async (prod: Product) => {
    if (!canManageCatalog) {
      onShowToast('Only active verified sellers can archive product listings.', 'error');
      return;
    }

    setArchivingProductId(prod.id);
    try {
      await SellerClient.archiveProduct(prod.id);
      setConfirmArchiveId(null);
      await onRefreshProducts();
      onShowToast(
        `Archived "${prod.name}". It is hidden from storefront buyers while historical orders remain intact.`,
        'info'
      );
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to archive product listing.', 'error');
    } finally {
      setArchivingProductId(null);
    }
  };

  const renderStatusBadge = (prod: Product, liveStock: number) => {
    const status = getDisplayProductStatus(prod);
    if (status === 'archived') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
          <Archive className="w-3 h-3" /> Archived
        </span>
      );
    }
    if (status === 'draft') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
          <FileEdit className="w-3 h-3" /> Draft
        </span>
      );
    }
    if (status === 'out_of_stock') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 dark:bg-rose-950/50 text-rose-600">
          <AlertTriangle className="w-3 h-3" /> Out of Stock
        </span>
      );
    }
    if (liveStock <= 5) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-950/50 text-amber-600">
          <AlertTriangle className="w-3 h-3" /> Active &bull; Low ({liveStock})
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600">
        <CheckCircle2 className="w-3 h-3" /> Active ({liveStock})
      </span>
    );
  };

  return (
    <div className="p-4 sm:p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5">
      {/* Header & Primary Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div>
          <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
            Catalog &amp; Inventory ({products.length})
          </h2>
          <p className="text-xs text-slate-400">
            Edit details, manage stock levels, or archive listings for &quot;{storeName}&quot;
          </p>
        </div>
        {canManageCatalog && (
          <button
            type="button"
            onClick={onOpenAddModal}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-[#ff6a00] hover:bg-[#e05d00] text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add Listing</span>
          </button>
        )}
      </div>

      {/* Filters Toolbar */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by product name, SKU, or brand..."
            className="w-full min-h-[42px] pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-[#ff6a00]"
          />
        </div>
        <div className="flex flex-wrap sm:flex-nowrap gap-2">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
          >
            <option value="all">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
          >
            <option value="all">All Statuses ({statusCounts.all})</option>
            <option value="active">Active ({statusCounts.active})</option>
            <option value="draft">Draft ({statusCounts.draft})</option>
            <option value="out_of_stock">Out of Stock ({statusCounts.out_of_stock})</option>
            <option value="low_stock">Low Stock (1–5)</option>
            <option value="archived">Archived ({statusCounts.archived})</option>
          </select>
        </div>
      </div>

      {/* Content */}
      {products.length === 0 ? (
        <div className="py-12 text-center text-xs text-slate-400 space-y-2">
          <Boxes className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700" />
          <p>You haven&apos;t published any product listings yet.</p>
          {canManageCatalog && (
            <button
              type="button"
              onClick={onOpenAddModal}
              className="text-[#ff6a00] font-bold hover:underline cursor-pointer"
            >
              Publish your first product
            </button>
          )}
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="py-10 text-center text-xs text-slate-400 space-y-2">
          <p>No products match the current search or status filters.</p>
          <button
            type="button"
            onClick={() => {
              setSearchTerm('');
              setCategoryFilter('all');
              setStatusFilter('all');
            }}
            className="text-[#ff6a00] font-bold hover:underline cursor-pointer"
          >
            Reset filters
          </button>
        </div>
      ) : (
        <>
          {/* Mobile-First Stacked Cards (< md) */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {filteredProducts.map((prod) => {
              const liveStock = getProductStockCount(prod);
              const displayStatus = getDisplayProductStatus(prod);
              const isArchived = displayStatus === 'archived';
              const draftVal = getDraftStockString(prod);
              const isDirty = !isArchived && draftStocks[prod.id] !== undefined && parseInt(draftVal, 10) !== liveStock;
              const isSaving = savingProductId === prod.id;
              const isArchiving = archivingProductId === prod.id;
              const isConfirmingArchive = confirmArchiveId === prod.id;
              const imgFailed = failedImages[prod.id];

              return (
                <div
                  key={prod.id}
                  className={`p-4 rounded-2xl border space-y-3 ${
                    isArchived
                      ? 'border-slate-200/70 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-900/40 opacity-85'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {prod.image && !imgFailed ? (
                      <img
                        src={prod.image}
                        alt={prod.name}
                        onError={() => setFailedImages((prev) => ({ ...prev, [prod.id]: true }))}
                        className="w-14 h-14 rounded-xl object-cover bg-slate-100 dark:bg-slate-800 shrink-0"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 shrink-0">
                        <Package className="w-6 h-6" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="font-bold text-sm text-slate-900 dark:text-white truncate">{prod.name}</div>
                      <div className="text-[11px] text-slate-400 capitalize flex flex-wrap gap-x-2">
                        <span>{prod.category}</span>
                        {prod.sku && <span className="font-mono">{prod.sku}</span>}
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="font-mono font-extrabold text-sm text-slate-900 dark:text-white tabular-nums">
                          ${prod.price.toFixed(2)}
                        </span>
                        {renderStatusBadge(prod, liveStock)}
                      </div>
                    </div>
                  </div>

                  {canManageCatalog && (
                    <div className="space-y-2.5 pt-2 border-t border-slate-200/70 dark:border-slate-700/60">
                      {!isArchived && (
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleStepStock(prod, -1)}
                              className="w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center text-slate-700 dark:text-slate-200 cursor-pointer"
                              aria-label={`Decrease stock for ${prod.name}`}
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <input
                              type="number"
                              min="0"
                              value={draftVal}
                              onChange={(e) => setDraftStocks((prev) => ({ ...prev, [prod.id]: e.target.value }))}
                              className="w-20 h-10 px-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-center text-xs font-mono font-bold text-slate-900 dark:text-white tabular-nums"
                            />
                            <button
                              type="button"
                              onClick={() => handleStepStock(prod, 1)}
                              className="w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center text-slate-700 dark:text-slate-200 cursor-pointer"
                              aria-label={`Increase stock for ${prod.name}`}
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                          <button
                            type="button"
                            disabled={!isDirty || isSaving}
                            onClick={() => handleSaveStock(prod)}
                            className="h-10 px-4 rounded-xl bg-[#ff6a00] hover:bg-[#e05d00] disabled:opacity-40 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>{isSaving ? 'Saving...' : 'Save'}</span>
                          </button>
                        </div>
                      )}

                      {isConfirmingArchive ? (
                        <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 space-y-2 text-xs">
                          <p className="font-semibold text-rose-800 dark:text-rose-200">
                            Archive &quot;{prod.name}&quot;? It will be removed from storefront search &amp; checkout.
                          </p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={isArchiving}
                              onClick={() => handleConfirmArchive(prod)}
                              className="flex-1 min-h-[38px] px-3 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer disabled:opacity-50"
                            >
                              {isArchiving ? 'Archiving...' : 'Confirm Archive'}
                            </button>
                            <button
                              type="button"
                              disabled={isArchiving}
                              onClick={() => setConfirmArchiveId(null)}
                              className="min-h-[38px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 font-bold cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onOpenEditModal(prod)}
                            className="flex-1 min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5 text-[#ff6a00]" />
                            <span>{isArchived ? 'Edit / Restore' : 'Edit Product'}</span>
                          </button>
                          {!isArchived && (
                            <button
                              type="button"
                              onClick={() => setConfirmArchiveId(prod.id)}
                              className="min-h-[40px] px-3 rounded-xl border border-rose-200 dark:border-rose-900/70 bg-rose-50/70 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <Archive className="w-3.5 h-3.5" />
                              <span>Archive</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop High-Density Table (md+) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-semibold">
                  <th className="py-3 px-2">Product</th>
                  <th className="py-3 px-2">Category</th>
                  <th className="py-3 px-2 text-right">Price</th>
                  <th className="py-3 px-2">Status</th>
                  <th className="py-3 px-2 text-right">Stock Control</th>
                  <th className="py-3 px-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredProducts.map((prod) => {
                  const liveStock = getProductStockCount(prod);
                  const displayStatus = getDisplayProductStatus(prod);
                  const isArchived = displayStatus === 'archived';
                  const draftVal = getDraftStockString(prod);
                  const isDirty = !isArchived && draftStocks[prod.id] !== undefined && parseInt(draftVal, 10) !== liveStock;
                  const isSaving = savingProductId === prod.id;
                  const isArchiving = archivingProductId === prod.id;
                  const isConfirmingArchive = confirmArchiveId === prod.id;
                  const imgFailed = failedImages[prod.id];

                  return (
                    <tr
                      key={prod.id}
                      className={`transition-colors ${
                        isArchived
                          ? 'bg-slate-50/60 dark:bg-slate-900/40 opacity-80'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-3">
                          {prod.image && !imgFailed ? (
                            <img
                              src={prod.image}
                              alt={prod.name}
                              onError={() => setFailedImages((prev) => ({ ...prev, [prod.id]: true }))}
                              className="w-10 h-10 rounded-lg object-cover bg-slate-100 dark:bg-slate-800 shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 shrink-0">
                              <Package className="w-5 h-5" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="max-w-xs truncate font-bold text-slate-900 dark:text-white">
                              {prod.name}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400">
                              {prod.sku || prod.id}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-2 capitalize text-slate-500">{prod.category}</td>
                      <td className="py-3 px-2 text-right font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                        ${prod.price.toFixed(2)}
                      </td>
                      <td className="py-3 px-2">{renderStatusBadge(prod, liveStock)}</td>
                      <td className="py-3 px-2">
                        {isArchived ? (
                          <div className="text-right text-[11px] text-slate-400 font-medium">
                            Archived listing
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              disabled={!canManageCatalog}
                              onClick={() => handleStepStock(prod, -1)}
                              className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-40"
                              title="Decrease stock"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <input
                              type="number"
                              min="0"
                              disabled={!canManageCatalog}
                              value={draftVal}
                              onChange={(e) => setDraftStocks((prev) => ({ ...prev, [prod.id]: e.target.value }))}
                              className="w-16 h-7 px-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center font-mono font-bold text-slate-900 dark:text-white tabular-nums disabled:opacity-50"
                            />
                            <button
                              type="button"
                              disabled={!canManageCatalog}
                              onClick={() => handleStepStock(prod, 1)}
                              className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-40"
                              title="Increase stock"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={!canManageCatalog || !isDirty || isSaving}
                              onClick={() => handleSaveStock(prod)}
                              className="h-7 px-2.5 rounded-lg bg-[#ff6a00] hover:bg-[#e05d00] disabled:opacity-35 text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
                            >
                              <Save className="w-3 h-3" />
                              <span>{isSaving ? '...' : 'Save'}</span>
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-2">
                        {canManageCatalog && (
                          isConfirmingArchive ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                disabled={isArchiving}
                                onClick={() => handleConfirmArchive(prod)}
                                className="h-7 px-2.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] cursor-pointer disabled:opacity-50"
                              >
                                {isArchiving ? '...' : 'Confirm'}
                              </button>
                              <button
                                type="button"
                                disabled={isArchiving}
                                onClick={() => setConfirmArchiveId(null)}
                                className="h-7 px-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold text-[11px] cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => onOpenEditModal(prod)}
                                className="h-7 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-[#ff6a00] text-slate-700 dark:text-slate-200 font-bold text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
                              >
                                <Pencil className="w-3 h-3 text-[#ff6a00]" />
                                <span>{isArchived ? 'Restore' : 'Edit'}</span>
                              </button>
                              {!isArchived && (
                                <button
                                  type="button"
                                  onClick={() => setConfirmArchiveId(prod.id)}
                                  className="h-7 px-2.5 rounded-lg border border-rose-200 dark:border-rose-900/60 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 font-bold text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
                                >
                                  <Archive className="w-3 h-3" />
                                  <span>Archive</span>
                                </button>
                              )}
                            </div>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};
