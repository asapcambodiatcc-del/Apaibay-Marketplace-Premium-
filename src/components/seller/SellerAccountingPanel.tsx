import React, { useState, useMemo } from 'react';
import {
  Wallet,
  RefreshCw,
  ArrowUpRight,
  Info,
  FileText,
  Clock,
  CheckCircle2,
  ShieldAlert,
} from 'lucide-react';
import {
  OrderDispute,
  SellerFinancialSummary,
  SellerLedgerEntry,
  SellerPayoutRequest,
} from '../../types';

interface SellerAccountingPanelProps {
  isVerified: boolean;
  effectiveKycStatus: string;
  financialSummary: SellerFinancialSummary | null;
  ledgerEntries: SellerLedgerEntry[];
  payoutsList: SellerPayoutRequest[];
  disputes: OrderDispute[];
  loadingLedger: boolean;
  ledgerSubTab: 'transactions' | 'payouts';
  onChangeLedgerSubTab: (tab: 'transactions' | 'payouts') => void;
  onRefresh: () => Promise<void>;
  onOpenPayoutModal: () => void;
}

type EntryFilter = 'all' | 'available' | 'pending_settlement' | 'held' | 'settled' | 'adjustments';

export const SellerAccountingPanel: React.FC<SellerAccountingPanelProps> = ({
  isVerified,
  effectiveKycStatus,
  financialSummary,
  ledgerEntries,
  payoutsList,
  disputes,
  loadingLedger,
  ledgerSubTab,
  onChangeLedgerSubTab,
  onRefresh,
  onOpenPayoutModal,
}) => {
  const [entryFilter, setEntryFilter] = useState<EntryFilter>('all');

  const filteredEntries = useMemo(() => {
    return ledgerEntries.filter((e) => {
      if (entryFilter === 'all') return true;
      if (entryFilter === 'adjustments') return e.type !== 'sale';
      if (entryFilter === 'pending_settlement') {
        return e.type === 'sale' && (e.status === 'pending_settlement' || e.status === 'calculated');
      }
      return e.type === 'sale' && e.status === entryFilter;
    });
  }, [ledgerEntries, entryFilter]);

  const activeDisputes = disputes.filter((d) => d.status === 'open' || d.status === 'under_review');
  const commissionPct = ((financialSummary?.commissionRate ?? 0.05) * 100).toFixed(1);
  const holdDays = financialSummary?.settlementHoldDays ?? 7;
  const available = financialSummary?.availableForPayout || 0;
  const pending = financialSummary?.pendingSettlement || 0;
  const reserved = financialSummary?.reservedForPayout || 0;
  const held = financialSummary?.onHold || 0;
  const paidOut = financialSummary?.totalPaidOut || 0;
  const minPayout = financialSummary?.minimumPayoutAmount || 20;

  return (
    <div className="p-4 sm:p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div>
          <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <Wallet className="w-5 h-5 text-[#ff6a00]" />
            <span>Earnings, Settlement &amp; Payouts</span>
          </h2>
          <p className="text-xs text-slate-400">
            Server-authoritative accounting with {holdDays}-day delivery return window &amp; {commissionPct}% marketplace commission
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={loadingLedger}
            className="min-h-[40px] p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            title="Refresh Settlement Ledger"
          >
            <RefreshCw className={`w-4 h-4 ${loadingLedger ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            disabled={
              !isVerified ||
              available < minPayout ||
              (financialSummary?.activePayoutRequestCount || 0) > 0
            }
            title={!isVerified ? 'Verified KYC status required to request payouts.' : undefined}
            onClick={onOpenPayoutModal}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-[#ff6a00] hover:bg-[#e05d00] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs flex items-center gap-1.5 shadow-sm cursor-pointer transition-all"
          >
            <ArrowUpRight className="w-4 h-4" />
            <span>{isVerified ? 'Request Payout' : `Payout Locked (KYC ${effectiveKycStatus})`}</span>
          </button>
        </div>
      </div>

      {/* Honest Provider Limitation Banner */}
      <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex items-start gap-3 text-xs">
        <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="text-amber-900 dark:text-amber-200 space-y-0.5">
          <div className="font-bold">Sandbox Corporate Batch Settlement Notice</div>
          <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
            {financialSummary?.providerLimitationNotice ||
              'PAYMENT_ENVIRONMENT=sandbox: Local payment gateways operate as one-way acquiring APIs and do not execute automated sub-merchant split custody. Approved payout requests are recorded for Finance Manager batch settlement and confirmed upon provider reference.'}
          </p>
        </div>
      </div>

      {/* Clear Accounting Breakdown: Earnings Equation + Distinct Pending vs. Available Balances */}
      {financialSummary && (
        <div className="space-y-4">
          {/* Top Equation Strip */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 grid grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-slate-400 text-[11px]">Gross Merchandise Sales</span>
              <div className="font-extrabold text-base text-slate-900 dark:text-white mt-0.5 font-mono tabular-nums">
                ${(financialSummary.totalSales ?? financialSummary.grossSalesMerchandise).toFixed(2)}
              </div>
            </div>
            <div>
              <span className="text-slate-400 text-[11px]">Marketplace Commission ({commissionPct}%)</span>
              <div className="font-extrabold text-base text-rose-500 mt-0.5 font-mono tabular-nums">
                -${(financialSummary.totalCommission ?? financialSummary.platformCommissionDeducted).toFixed(2)}
              </div>
            </div>
            <div>
              <span className="text-slate-400 text-[11px]">Refund / Cancel Adjustments</span>
              <div className="font-extrabold text-base text-slate-700 dark:text-slate-300 mt-0.5 font-mono tabular-nums">
                -${(financialSummary.refundAdjustments || 0).toFixed(2)}
              </div>
            </div>
            <div>
              <span className="text-slate-400 text-[11px]">Net Calculated Earnings</span>
              <div className="font-extrabold text-base text-[#ff6a00] mt-0.5 font-mono tabular-nums">
                ${financialSummary.netCalculatedEarnings.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Explicit Pending vs. Eligible Payout Split */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/50 space-y-1">
              <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400 font-bold text-[11px]">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Available for Payout
                </span>
                <span>WITHDRAWABLE</span>
              </div>
              <div className="font-extrabold text-xl text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
                ${available.toFixed(2)}
              </div>
              <p className="text-[11px] text-emerald-800/80 dark:text-emerald-300/80">
                Cleared past {holdDays}-day window (Min ${minPayout.toFixed(2)}).
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 space-y-1">
              <div className="flex items-center justify-between text-amber-700 dark:text-amber-400 font-bold text-[11px]">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Pending Settlement
                </span>
                <span>HOLD WINDOW</span>
              </div>
              <div className="font-extrabold text-xl text-amber-600 dark:text-amber-400 font-mono tabular-nums">
                ${pending.toFixed(2)}
              </div>
              <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80">
                Awaiting delivery &amp; {holdDays}-day return period. Not withdrawable yet.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/50 space-y-1">
              <div className="flex items-center justify-between text-rose-700 dark:text-rose-400 font-bold text-[11px]">
                <span>On Hold (Disputes)</span>
                <span>FROZEN</span>
              </div>
              <div className="font-extrabold text-xl text-rose-600 dark:text-rose-400 font-mono tabular-nums">
                ${held.toFixed(2)}
              </div>
              <p className="text-[11px] text-rose-800/80 dark:text-rose-300/80">
                {activeDisputes.length > 0
                  ? `${activeDisputes.length} open dispute(s) under review.`
                  : 'No active dispute holds.'}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-1">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 font-bold text-[11px]">
                <span>Disbursed / In Review</span>
              </div>
              <div className="font-extrabold text-xl text-blue-600 dark:text-blue-400 font-mono tabular-nums">
                ${paidOut.toFixed(2)}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                {reserved > 0
                  ? `+$${reserved.toFixed(2)} reserved in active payout request`
                  : 'Completed batch payouts'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Active Disputes Alert if any */}
      {activeDisputes.length > 0 && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 space-y-2 text-xs">
          <div className="font-bold text-rose-800 dark:text-rose-200 flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-rose-600" />
            <span>Active Order Disputes Affecting Settlement ({activeDisputes.length})</span>
          </div>
          <div className="space-y-1">
            {activeDisputes.map((d) => (
              <div key={d.id} className="text-[11px] text-rose-700 dark:text-rose-300 flex flex-wrap justify-between gap-2">
                <span>
                  Order <span className="font-mono font-bold">#{d.orderId}</span> &bull; {d.reason.replace(/_/g, ' ')}
                </span>
                <span className="font-mono font-bold tabular-nums">
                  ${d.disputedAmount.toFixed(2)} ({d.status.replace('_', ' ')})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sub-Tab Toggle */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 text-xs font-bold overflow-x-auto">
        <button
          type="button"
          onClick={() => onChangeLedgerSubTab('transactions')}
          className={`px-3 py-2.5 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
            ledgerSubTab === 'transactions'
              ? 'border-[#ff6a00] text-[#ff6a00]'
              : 'border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          Transaction Ledger ({ledgerEntries.length})
        </button>
        <button
          type="button"
          onClick={() => onChangeLedgerSubTab('payouts')}
          className={`px-3 py-2.5 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
            ledgerSubTab === 'payouts'
              ? 'border-[#ff6a00] text-[#ff6a00]'
              : 'border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          Payout History ({payoutsList.length})
        </button>
      </div>

      {/* Sub-Tab 1: Transaction Ledger */}
      {ledgerSubTab === 'transactions' && (
        <div className="space-y-4">
          {ledgerEntries.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {([
                { id: 'all', label: 'All Entries' },
                { id: 'available', label: 'Available' },
                { id: 'pending_settlement', label: 'Pending Settlement' },
                { id: 'held', label: 'Held' },
                { id: 'settled', label: 'Settled' },
                { id: 'adjustments', label: 'Refund/Cancel Adj.' },
              ] as const).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setEntryFilter(f.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap cursor-pointer ${
                    entryFilter === f.id
                      ? 'bg-[#ff6a00] text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}

          {filteredEntries.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400 space-y-1">
              <FileText className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700" />
              <p>No transaction ledger records match this view.</p>
              <p className="text-[11px]">As customer orders are paid and delivered, settlement statuses appear here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-semibold">
                    <th className="py-3 px-2">Order Reference</th>
                    <th className="py-3 px-2">Product</th>
                    <th className="py-3 px-2">Settlement Status</th>
                    <th className="py-3 px-2 text-right">Gross Subtotal</th>
                    <th className="py-3 px-2 text-right">Commission</th>
                    <th className="py-3 px-2 font-bold text-right">Net Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredEntries.map((entry) => {
                    const isAdjustment = entry.type !== 'sale';
                    const statusStyle =
                      entry.status === 'available'
                        ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600'
                        : entry.status === 'pending_settlement' || entry.status === 'calculated'
                        ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-600'
                        : entry.status === 'held'
                        ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-600'
                        : entry.status === 'settled'
                        ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500';
                    return (
                      <tr key={entry.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-2 font-mono font-bold text-slate-900 dark:text-white">
                          #{entry.orderId}
                        </td>
                        <td className="py-3 px-2 text-slate-700 dark:text-slate-300">
                          <div>{entry.productName} (x{entry.quantity})</div>
                          {entry.settlementEligibleAt && entry.status === 'pending_settlement' && (
                            <div className="text-[10px] text-amber-600 dark:text-amber-400 tabular-nums">
                              Eligible after {new Date(entry.settlementEligibleAt).toLocaleDateString()}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusStyle}`}>
                            {isAdjustment ? entry.type.replace(/_/g, ' ') : (entry.status || 'calculated').replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-right font-mono tabular-nums">${entry.eligibleSubtotal.toFixed(2)}</td>
                        <td className="py-3 px-2 text-right font-mono text-slate-500 tabular-nums">${entry.commissionAmount.toFixed(2)}</td>
                        <td
                          className={`py-3 px-2 font-mono font-bold text-right tabular-nums ${
                            !isAdjustment
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          ${entry.netAmount.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Sub-Tab 2: Payout History */}
      {ledgerSubTab === 'payouts' && (
        payoutsList.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400 space-y-2">
            <Wallet className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700" />
            <p>No payout requests submitted yet.</p>
            <p className="text-[11px]">
              Once delivered orders clear the {holdDays}-day return window (min ${minPayout.toFixed(2)} USD), you can request a payout here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-semibold">
                  <th className="py-3 px-2">Payout ID</th>
                  <th className="py-3 px-2">Amount</th>
                  <th className="py-3 px-2">Destination (Masked)</th>
                  <th className="py-3 px-2">Status</th>
                  <th className="py-3 px-2">Requested</th>
                  <th className="py-3 px-2">Reference / Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {payoutsList.map((p) => {
                  const pStyle =
                    p.status === 'completed'
                      ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                      : p.status === 'approved'
                      ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400'
                      : p.status === 'held'
                      ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-400'
                      : p.status === 'rejected' || p.status === 'failed'
                      ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400'
                      : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400';
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-2 font-mono font-bold text-slate-900 dark:text-white">#{p.id.slice(0, 14)}</td>
                      <td className="py-3 px-2 font-extrabold font-mono text-slate-900 dark:text-white tabular-nums">
                        ${p.amount.toFixed(2)} {p.currency}
                      </td>
                      <td className="py-3 px-2">
                        <div className="font-semibold text-slate-700 dark:text-slate-300 uppercase text-[11px]">
                          {p.destination.method.replace('_', ' ')}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {p.destination.accountName} &bull; {p.destination.maskedAccountNumber || p.destination.accountNumber}
                        </div>
                      </td>
                      <td className="py-3 px-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${pStyle}`}>
                          {p.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-slate-400 text-[11px] tabular-nums">
                        {new Date(p.requestedAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-2 text-[11px]">
                        {p.disbursementReference && (
                          <span className="font-mono text-emerald-600 font-bold">{p.disbursementReference}</span>
                        )}
                        {p.rejectionReason && (
                          <span className="text-rose-500">Rejected: {p.rejectionReason}</span>
                        )}
                        {p.failureReason && (
                          <span className="text-rose-500">Failed: {p.failureReason} (Funds restored)</span>
                        )}
                        {!p.disbursementReference && !p.rejectionReason && !p.failureReason && (
                          <span className="text-slate-400">{p.adminNotes || 'Pending verification'}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
};
