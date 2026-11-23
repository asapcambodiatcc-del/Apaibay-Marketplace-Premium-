import React, { useState, useMemo } from 'react';
import {
  ArrowUpRight,
  Clock,
  CheckCircle2,
  Package,
  Truck,
  AlertTriangle,
  Wallet,
  TrendingUp,
  Boxes,
  ShieldAlert,
} from 'lucide-react';
import {
  Order,
  OrderDispute,
  Product,
  SellerFinancialSummary,
  SellerLedgerEntry,
} from '../../types';
import {
  AnalyticsWindow,
  computeInventoryHealth,
  computePeriodSalesMetrics,
  getProductStockCount,
  normalizeDisplayOrderStatus,
} from './sellerUtils';

interface SellerOverviewPanelProps {
  sellerUid?: string;
  isVerified: boolean;
  isSuspendedOrInactive: boolean;
  effectiveKycStatus: string;
  products: Product[];
  orders: Order[];
  ledgerEntries: SellerLedgerEntry[];
  disputes: OrderDispute[];
  financialSummary: SellerFinancialSummary | null;
  loadingData: boolean;
  onNavigateTab: (tab: 'overview' | 'listings' | 'orders' | 'ledger') => void;
  onOpenPayoutModal: () => void;
  onOpenAddModal: () => void;
}

export const SellerOverviewPanel: React.FC<SellerOverviewPanelProps> = ({
  sellerUid,
  isVerified,
  isSuspendedOrInactive,
  effectiveKycStatus,
  products,
  orders,
  ledgerEntries,
  disputes,
  financialSummary,
  loadingData,
  onNavigateTab,
  onOpenPayoutModal,
  onOpenAddModal,
}) => {
  const [windowFilter, setWindowFilter] = useState<AnalyticsWindow>('30d');

  const inventoryHealth = useMemo(() => computeInventoryHealth(products), [products]);
  const salesMetrics = useMemo(
    () => computePeriodSalesMetrics(ledgerEntries, orders, sellerUid, windowFilter, financialSummary),
    [ledgerEntries, orders, sellerUid, windowFilter, financialSummary]
  );

  const availableForPayout = financialSummary?.availableForPayout || 0;
  const pendingSettlement = financialSummary?.pendingSettlement || 0;
  const reservedForPayout = financialSummary?.reservedForPayout || 0;
  const onHold = financialSummary?.onHold || 0;
  const totalPaidOut = financialSummary?.totalPaidOut || 0;
  const minPayout = financialSummary?.minimumPayoutAmount || 20;
  const holdDays = financialSummary?.settlementHoldDays ?? 7;
  const commissionPct = ((financialSummary?.commissionRate ?? 0.05) * 100).toFixed(1);
  const hasActivePayout = (financialSummary?.activePayoutRequestCount || 0) > 0;
  const canRequestPayout =
    isVerified &&
    !isSuspendedOrInactive &&
    availableForPayout >= minPayout &&
    !hasActivePayout;

  const activeDisputes = disputes.filter((d) => d.status === 'open' || d.status === 'under_review');

  const ordersNeedingAction = useMemo(
    () =>
      orders
        .filter((o) => {
          const st = normalizeDisplayOrderStatus(o.orderStatus || o.status);
          return st === 'Placed' || st === 'Processing';
        })
        .slice(0, 4),
    [orders]
  );

  const maxDailyGross = useMemo(
    () => Math.max(1, ...salesMetrics.recentDailySeries.map((d) => d.grossSales)),
    [salesMetrics.recentDailySeries]
  );

  return (
    <div className="space-y-6">
      {/* 1. Prominent Settlement vs. Available Payout Distinction */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Available for Payout (Eligible Now) */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900/60 flex flex-col justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Available for Payout (Cleared)</span>
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                Eligible Now
              </span>
            </div>
            <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums font-mono">
              ${availableForPayout.toFixed(2)} <span className="text-sm font-bold text-slate-400">USD</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Cleared seller net earnings past delivery &amp; {holdDays}-day return window. Minimum withdrawal:{' '}
              <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">${minPayout.toFixed(2)}</span>.
              {reservedForPayout > 0 && (
                <span className="block mt-1 text-blue-600 dark:text-blue-400 font-semibold tabular-nums">
                  +${reservedForPayout.toFixed(2)} currently reserved in active payout review.
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="text-[11px] text-slate-500 tabular-nums">
              Total Paid Out: <span className="font-bold text-slate-800 dark:text-slate-200">${totalPaidOut.toFixed(2)}</span>
            </div>
            <button
              type="button"
              disabled={!canRequestPayout}
              onClick={onOpenPayoutModal}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-[#ff6a00] hover:bg-[#e05d00] disabled:opacity-45 disabled:cursor-not-allowed text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <ArrowUpRight className="w-4 h-4" />
              <span>
                {!isVerified || isSuspendedOrInactive
                  ? `Locked (${effectiveKycStatus})`
                  : hasActivePayout
                  ? 'Payout Request Active'
                  : availableForPayout < minPayout
                  ? `Below $${minPayout} Min`
                  : 'Request Payout'}
              </span>
            </button>
          </div>
        </div>

        {/* Pending Settlement (Hold Window — Not Yet Withdrawable) */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/60 flex flex-col justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                <Clock className="w-4 h-4 shrink-0" />
                <span>Pending Settlement (In Hold Window)</span>
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                Not Withdrawable Yet
              </span>
            </div>
            <div className="text-3xl font-black text-amber-600 dark:text-amber-400 tabular-nums font-mono">
              ${pendingSettlement.toFixed(2)} <span className="text-sm font-bold text-slate-400">USD</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Paid or processing orders awaiting delivery confirmation and the {holdDays}-day customer return window before becoming eligible for payout.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px]">
            <div className="text-slate-500">
              {salesMetrics.nextPendingReleaseAt ? (
                <>
                  Next scheduled release:{' '}
                  <span className="font-mono font-bold text-amber-700 dark:text-amber-300">
                    {new Date(salesMetrics.nextPendingReleaseAt).toLocaleDateString()}
                  </span>
                </>
              ) : onHold > 0 ? (
                <span className="text-rose-600 dark:text-rose-400 font-semibold tabular-nums">
                  ${onHold.toFixed(2)} held for dispute/compliance review
                </span>
              ) : (
                <span>Releases automatically after hold window elapses</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('ledger')}
              className="text-[#ff6a00] hover:underline font-bold cursor-pointer"
            >
              Inspect Ledger &rarr;
            </button>
          </div>
        </div>
      </div>

      {/* 2. Sales Performance & Period Controls */}
      <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#ff6a00]" />
              <span>Sales &amp; Fulfillment Statistics</span>
            </h2>
            <p className="text-xs text-slate-400">
              Calculated from server-authoritative orders and commission ledger entries ({commissionPct}% platform fee)
            </p>
          </div>

          <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 self-start sm:self-auto">
            {([
              { id: '7d', label: '7 Days' },
              { id: '30d', label: '30 Days' },
              { id: 'all', label: 'All Time' },
            ] as const).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setWindowFilter(opt.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  windowFilter === opt.id
                    ? 'bg-white dark:bg-slate-900 text-[#ff6a00] shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {loadingData ? (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[1, 2, 3, 4, 5].map((n) => (
              <div key={n} className="h-20 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60">
              <span className="text-[11px] font-semibold text-slate-400">Gross Merchandise Sales</span>
              <div className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white mt-1 tabular-nums font-mono">
                ${salesMetrics.grossSales.toFixed(2)}
              </div>
              <span className="text-[11px] text-slate-400 tabular-nums">{salesMetrics.unitsSold} units sold</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60">
              <span className="text-[11px] font-semibold text-slate-400">Platform Commission</span>
              <div className="text-lg sm:text-xl font-extrabold text-rose-500 mt-1 tabular-nums font-mono">
                -${salesMetrics.commission.toFixed(2)}
              </div>
              <span className="text-[11px] text-slate-400 tabular-nums">{commissionPct}% marketplace rate</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60">
              <span className="text-[11px] font-semibold text-slate-400">Net Earnings</span>
              <div className="text-lg sm:text-xl font-extrabold text-[#ff6a00] mt-1 tabular-nums font-mono">
                ${salesMetrics.netEarnings.toFixed(2)}
              </div>
              <span className="text-[11px] text-slate-400 tabular-nums">
                {salesMetrics.refundAdjustments > 0
                  ? `-$${salesMetrics.refundAdjustments.toFixed(2)} adjustments`
                  : 'After commission'}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60">
              <span className="text-[11px] font-semibold text-slate-400">Store Orders</span>
              <div className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white mt-1 tabular-nums font-mono">
                {salesMetrics.orderCount}
              </div>
              <span className="text-[11px] text-slate-400 tabular-nums">
                Avg ${salesMetrics.averageOrderValue.toFixed(2)} / order
              </span>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60 col-span-2 sm:col-span-1">
              <span className="text-[11px] font-semibold text-slate-400">Fulfillment Rate</span>
              <div className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white mt-1 tabular-nums font-mono">
                {salesMetrics.fulfillmentRate}%
              </div>
              <span className="text-[11px] text-slate-400 tabular-nums">
                {salesMetrics.deliveredOrderCount} delivered
              </span>
            </div>
          </div>
        )}

        {/* Daily Revenue Activity + Order Stage Distribution */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-2">
          <div className="lg:col-span-2 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-800 dark:text-slate-200">Recent Daily Gross Sales</span>
              <span className="text-[11px] text-slate-400">Last {salesMetrics.recentDailySeries.length || 0} active days</span>
            </div>
            {salesMetrics.recentDailySeries.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No paid ledger sales recorded in this period yet. Daily sales bars appear automatically as customer orders are recorded.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 items-end pt-2">
                {salesMetrics.recentDailySeries.map((day) => {
                  const pct = Math.max(12, Math.round((day.grossSales / maxDailyGross) * 100));
                  return (
                    <div key={day.isoDay} className="flex flex-col items-center gap-1.5">
                      <span className="text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300 tabular-nums">
                        ${day.grossSales.toFixed(0)}
                      </span>
                      <div className="w-full h-24 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-end p-1">
                        <div
                          className="w-full rounded-md bg-[#ff6a00] transition-all"
                          style={{ height: `${pct}%` }}
                          title={`${day.label}: $${day.grossSales.toFixed(2)} gross ($${day.netEarnings.toFixed(2)} net across ${day.count} entries)`}
                        />
                      </div>
                      <span className="text-[10px] text-slate-400 tabular-nums">{day.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-800 dark:text-slate-200">Order Status Mix</span>
              <span className="text-[11px] text-slate-400 tabular-nums">{salesMetrics.orderCount} total</span>
            </div>
            <div className="space-y-2 text-xs">
              {(['Placed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'] as const).map((st) => {
                const count = salesMetrics.statusBreakdown[st];
                const barPct = salesMetrics.orderCount > 0 ? Math.round((count / salesMetrics.orderCount) * 100) : 0;
                const barColor =
                  st === 'Delivered'
                    ? 'bg-emerald-500'
                    : st === 'Shipped'
                    ? 'bg-blue-500'
                    : st === 'Processing'
                    ? 'bg-[#ff6a00]'
                    : st === 'Cancelled'
                    ? 'bg-rose-500'
                    : 'bg-amber-500';
                return (
                  <div key={st} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-slate-600 dark:text-slate-300">{st}</span>
                      <span className="font-mono font-bold text-slate-900 dark:text-white tabular-nums">{count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${barPct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Operational Queues: Pending Fulfillment & Inventory Health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Orders Awaiting Fulfillment */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-[#ff6a00]" />
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                Orders Awaiting Action ({salesMetrics.pendingActionOrdersCount})
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('orders')}
              className="text-xs font-bold text-[#ff6a00] hover:underline cursor-pointer"
            >
              Manage Orders &rarr;
            </button>
          </div>

          {ordersNeedingAction.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400 space-y-1">
              <Package className="w-7 h-7 mx-auto text-slate-300 dark:text-slate-700" />
              <p>All active store orders are already shipped or delivered.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {ordersNeedingAction.map((ord) => {
                const st = normalizeDisplayOrderStatus(ord.orderStatus || ord.status);
                return (
                  <div key={ord.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <div className="font-mono font-bold text-slate-900 dark:text-white truncate">#{ord.id}</div>
                      <div className="text-[11px] text-slate-400 truncate">
                        {ord.shippingAddress?.name || 'Customer'} &bull; {ord.date || new Date(ord.createdAt || Date.now()).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          st === 'Placed'
                            ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                            : 'bg-orange-50 dark:bg-orange-950/60 text-[#ff6a00]'
                        }`}
                      >
                        {st}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeDisputes.length > 0 && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/50 flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300 font-semibold">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{activeDisputes.length} open customer dispute(s) affecting settlement hold</span>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab('ledger')}
                className="text-rose-700 dark:text-rose-300 font-bold underline cursor-pointer shrink-0"
              >
                View
              </button>
            </div>
          )}
        </div>

        {/* Catalog & Low-Stock Inventory Alerts */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Boxes className="w-4 h-4 text-[#ff6a00]" />
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                Inventory Health ({inventoryHealth.totalProducts} Active/Draft SKUs)
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('listings')}
              className="text-xs font-bold text-[#ff6a00] hover:underline cursor-pointer"
            >
              Manage Stock &rarr;
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-center">
              <div className="text-base font-extrabold text-emerald-600 tabular-nums font-mono">
                {inventoryHealth.inStockCount}
              </div>
              <div className="text-[11px] text-slate-400">In Stock</div>
            </div>
            <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 text-center">
              <div className="text-base font-extrabold text-amber-600 tabular-nums font-mono">
                {inventoryHealth.lowStockCount}
              </div>
              <div className="text-[11px] text-amber-700 dark:text-amber-400">Low (&le; 5)</div>
            </div>
            <div className="p-3 rounded-xl bg-rose-50/70 dark:bg-rose-950/20 text-center">
              <div className="text-base font-extrabold text-rose-600 tabular-nums font-mono">
                {inventoryHealth.outOfStockCount}
              </div>
              <div className="text-[11px] text-rose-700 dark:text-rose-400">Out of Stock</div>
            </div>
          </div>

          {(inventoryHealth.draftCount > 0 || inventoryHealth.archivedCount > 0) && (
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
              {inventoryHealth.draftCount > 0 && (
                <span>
                  <strong className="font-mono text-slate-700 dark:text-slate-300">{inventoryHealth.draftCount}</strong> draft
                </span>
              )}
              {inventoryHealth.archivedCount > 0 && (
                <span>
                  <strong className="font-mono text-slate-700 dark:text-slate-300">{inventoryHealth.archivedCount}</strong> archived
                </span>
              )}
            </div>
          )}

          {inventoryHealth.totalProducts === 0 ? (
            <div className="py-4 text-center text-xs text-slate-400 space-y-2">
              <p>No listings published yet.</p>
              {isVerified && !isSuspendedOrInactive && (
                <button
                  type="button"
                  onClick={onOpenAddModal}
                  className="text-[#ff6a00] font-bold hover:underline cursor-pointer"
                >
                  + Publish your first product
                </button>
              )}
            </div>
          ) : inventoryHealth.lowOrOutProducts.length === 0 ? (
            <div className="py-3 text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>All {inventoryHealth.totalProducts} products have healthy stock (&gt; 5 units). Total units: {inventoryHealth.totalUnits}.</span>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {inventoryHealth.lowOrOutProducts.slice(0, 4).map((prod) => {
                const stock = getProductStockCount(prod);
                return (
                  <div key={prod.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                    <span className="truncate font-semibold text-slate-800 dark:text-slate-200">{prod.name}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono shrink-0 ${
                        stock === 0
                          ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-600'
                          : 'bg-amber-50 dark:bg-amber-950/60 text-amber-600'
                      }`}
                    >
                      {stock === 0 ? 'OUT OF STOCK' : `${stock} left`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Quick Wallet Summary Footer */}
      {financialSummary && (
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
            <Wallet className="w-4 h-4 text-[#ff6a00] shrink-0" />
            <span>{financialSummary.payoutStatusMessage}</span>
          </div>
          {isSuspendedOrInactive && (
            <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400 font-bold">
              <AlertTriangle className="w-3.5 h-3.5" />
              Account verification/status restricts catalog &amp; payout actions.
            </span>
          )}
        </div>
      )}
    </div>
  );
};
