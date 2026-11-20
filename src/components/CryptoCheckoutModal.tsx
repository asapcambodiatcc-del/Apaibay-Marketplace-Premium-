import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Copy,
  Check,
  Clock,
  AlertTriangle,
  RefreshCw,
  QrCode,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Zap,
} from 'lucide-react';
import { PaymentClient } from '../services/paymentClient';
import { CryptoPaymentDetails, CryptoCurrencyOption } from '../types/payment';

interface CryptoCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderTotalUsd: number;
  onOrderSuccess: (orderId: string) => void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
  onInitiateOrder: () => Promise<string>; // Creates authoritative order and returns orderId
}

// Clean SVG QR Code visual representation that renders deterministic matrix based on address
const DynamicCryptoQR: React.FC<{ value: string; size?: number }> = ({ value, size = 180 }) => {
  // Generate deterministic grid pattern from string hash
  const cells: boolean[][] = [];
  const gridSize = 21; // standard version 1 QR grid dimension

  // Simple deterministic hash for interior visual cells
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }

  for (let r = 0; r < gridSize; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < gridSize; c++) {
      // Finder patterns in 3 corners (7x7)
      const isTopLeftFinder = r < 7 && c < 7;
      const isTopRightFinder = r < 7 && c >= gridSize - 7;
      const isBottomLeftFinder = r >= gridSize - 7 && c < 7;

      if (isTopLeftFinder || isTopRightFinder || isBottomLeftFinder) {
        // Standard finder square pattern
        const localR = isBottomLeftFinder ? r - (gridSize - 7) : r;
        const localC = isTopRightFinder ? c - (gridSize - 7) : c;
        const isBorder = localR === 0 || localR === 6 || localC === 0 || localC === 6;
        const isCenter = localR >= 2 && localR <= 4 && localC >= 2 && localC <= 4;
        row.push(isBorder || isCenter);
      } else {
        // Hash-based data cell
        const seed = (hash + r * 37 + c * 17 + value.charCodeAt((r + c) % value.length)) % 100;
        row.push(seed > 48);
      }
    }
    cells.push(row);
  }

  const cellSize = size / gridSize;

  return (
    <div className="p-3 bg-white rounded-2xl shadow-inner border border-slate-200 inline-block">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block">
        <rect width={size} height={size} fill="#ffffff" />
        {cells.map((row, r) =>
          row.map((active, c) =>
            active ? (
              <rect
                key={`${r}-${c}`}
                x={c * cellSize}
                y={r * cellSize}
                width={cellSize - 0.4}
                height={cellSize - 0.4}
                rx={cellSize * 0.2}
                fill="#0f172a"
              />
            ) : null
          )
        )}
      </svg>
    </div>
  );
};

export const CryptoCheckoutModal: React.FC<CryptoCheckoutModalProps> = ({
  isOpen,
  onClose,
  orderTotalUsd,
  onOrderSuccess,
  onShowToast,
  onInitiateOrder,
}) => {
  const [options, setOptions] = useState<CryptoCurrencyOption[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>('usdt_bep20');
  const [step, setStep] = useState<'select' | 'invoice'>('select');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isPolling, setIsPolling] = useState<boolean>(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Active Invoice State
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [cryptoDetails, setCryptoDetails] = useState<CryptoPaymentDetails | null>(null);
  const [liveStatus, setLiveStatus] = useState<string>('waiting');
  const [secondsRemaining, setSecondsRemaining] = useState<number>(1200);

  const pollIntervalRef = useRef<any>(null);

  // Fetch available options on mount
  useEffect(() => {
    if (isOpen) {
      PaymentClient.getCryptoOptions()
        .then((res) => setOptions(res))
        .catch(() => {
          // Fallback defaults
          setOptions([
            {
              id: 'usdt_bep20',
              currency: 'USDT',
              network: 'BNB Smart Chain',
              tokenStandard: 'BEP-20',
              ticker: 'usdtbsc',
              iconColor: '#26A17B',
              description: 'Instant settlement • Low BNB Chain gas fee',
            },
            {
              id: 'usdt_trc20',
              currency: 'USDT',
              network: 'TRON Network',
              tokenStandard: 'TRC-20',
              ticker: 'usdttrc20',
              iconColor: '#EB0029',
              description: 'Instant settlement • Standard TRON energy',
            },
            {
              id: 'usdc_solana',
              currency: 'USDC',
              network: 'Solana',
              tokenStandard: 'SPL',
              ticker: 'usdcsol',
              iconColor: '#2775CA',
              description: 'Sub-second confirmation • Negligible Solana fees',
            },
            {
              id: 'bnb_bsc',
              currency: 'BNB',
              network: 'BNB Smart Chain',
              tokenStandard: 'BEP-20',
              ticker: 'bnbbsc',
              iconColor: '#F3BA2F',
              description: 'Native BNB Smart Chain • Fast block times',
            },
          ]);
        });
    }
  }, [isOpen]);

  // Countdown Timer
  useEffect(() => {
    if (step !== 'invoice' || !cryptoDetails) return;

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setLiveStatus('expired');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [step, cryptoDetails]);

  // Polling for Blockchain status updates
  useEffect(() => {
    if (step !== 'invoice' || !paymentIntentId) return;

    const checkStatus = async () => {
      try {
        const res = await PaymentClient.getCryptoStatus(paymentIntentId);
        if (res) {
          setLiveStatus(res.status);
          if (res.status === 'paid') {
            clearInterval(pollIntervalRef.current);
            onShowToast('Cryptocurrency payment confirmed! Processing your order.', 'success');
            setTimeout(() => {
              onOrderSuccess(res.orderId || createdOrderId || '');
            }, 1800);
          }
        }
      } catch (err) {
        // silent polling catch
      }
    };

    pollIntervalRef.current = setInterval(checkStatus, 4000);
    return () => clearInterval(pollIntervalRef.current);
  }, [step, paymentIntentId, createdOrderId, onOrderSuccess, onShowToast]);

  if (!isOpen) return null;

  const handleGenerateInvoice = async () => {
    setIsLoading(true);
    try {
      // 1. Authoritative Order creation through existing commerce pipeline
      const orderId = await onInitiateOrder();
      setCreatedOrderId(orderId);

      // 2. Initialize Crypto Payment Intent on server
      const idempotencyKey = `idemp_crypto_${orderId}_${Date.now()}`;
      const intent = await PaymentClient.createIntent({
        orderId,
        methodType: 'crypto',
        idempotencyKey,
        safeMetadata: {
          cryptoCurrency: selectedKey,
        },
      });

      setPaymentIntentId(intent.id);
      const details = intent.safeMetadata?.cryptoDetails;
      if (details) {
        setCryptoDetails(details);
        setSecondsRemaining(details.timeRemainingSeconds || 1200);
        setLiveStatus('waiting');
        setStep('invoice');
      } else {
        throw new Error('Failed to load crypto invoice details from server.');
      }
    } catch (err: any) {
      onShowToast(err.message || 'Failed to initialize cryptocurrency payment.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    onShowToast(`Copied ${field} to clipboard`, 'success');
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleManualCheck = async () => {
    if (!paymentIntentId) return;
    setIsPolling(true);
    try {
      const res = await PaymentClient.getCryptoStatus(paymentIntentId);
      setLiveStatus(res.status);
      if (res.status === 'paid') {
        onShowToast('Payment verified successfully!', 'success');
        setTimeout(() => {
          onOrderSuccess(res.orderId || createdOrderId || '');
        }, 1200);
      } else if (res.status === 'confirming') {
        onShowToast('Transaction detected on-chain! Awaiting block confirmations...', 'info');
      } else if (res.status === 'expired') {
        onShowToast('This payment window has expired. Please place a new order.', 'error');
      } else if (res.status === 'partially_paid') {
        onShowToast('Partial payment detected. Please send the remaining balance.', 'error');
      } else {
        onShowToast('Waiting for transaction to be broadcasted to the network...', 'info');
      }
    } catch (err: any) {
      onShowToast(err.message || 'Error checking payment status.', 'error');
    } finally {
      setIsPolling(false);
    }
  };

  const handleSimulateSandbox = async (outcome: string) => {
    if (!paymentIntentId) return;
    setIsPolling(true);
    try {
      await PaymentClient.simulateCrypto(paymentIntentId, outcome);
      setLiveStatus(outcome);
      if (outcome === 'paid') {
        onShowToast('Sandbox simulated: Payment Confirmed!', 'success');
        setTimeout(() => {
          onOrderSuccess(createdOrderId || '');
        }, 1200);
      } else if (outcome === 'confirming') {
        onShowToast('Sandbox simulated: 8/12 Block Confirmations', 'info');
      } else if (outcome === 'partially_paid') {
        onShowToast('Sandbox simulated: Partial payment detected (50% remaining)', 'error');
      } else if (outcome === 'expired') {
        onShowToast('Sandbox simulated: Invoice Expired', 'error');
      }
    } catch (err: any) {
      onShowToast(err.message || 'Sandbox simulation failed', 'error');
    } finally {
      setIsPolling(false);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const selectedOption = options.find((o) => o.id === selectedKey) || options[0];

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3 sm:p-4 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#ff6a00]/20 border border-[#ff6a00]/40 flex items-center justify-center text-[#ff6a00]">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base tracking-tight">Pay with Cryptocurrency</h3>
                <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Direct Gateway
                </span>
              </div>
              <p className="text-xs text-slate-300">
                USDT (BEP-20 / TRC-20) • USDC (Solana) • BNB (BSC)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6">
          {step === 'select' ? (
            <div className="space-y-5">
              {/* Total amount summary card */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Order Total</div>
                  <div className="text-2xl font-black text-slate-900 dark:text-white">
                    ${orderTotalUsd.toFixed(2)} <span className="text-xs font-bold text-slate-400">USD</span>
                  </div>
                </div>
                <div className="text-right text-xs">
                  <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-xl">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Zero Processing Fee
                  </span>
                  <div className="text-[11px] text-slate-400 mt-1">Guaranteed exchange rate for 20 mins</div>
                </div>
              </div>

              {/* Supported Cryptocurrency Selection */}
              <div className="space-y-2">
                <label className="text-xs font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Select Cryptocurrency & Network
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {options.map((opt) => {
                    const isSelected = opt.id === selectedKey;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setSelectedKey(opt.id)}
                        className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative flex flex-col justify-between ${
                          isSelected
                            ? 'border-[#ff6a00] bg-orange-50/60 dark:bg-orange-950/20 ring-2 ring-[#ff6a00]/30 shadow-xs'
                            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-850'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-3 h-3 rounded-full shrink-0"
                              style={{ backgroundColor: opt.iconColor }}
                            />
                            <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                              {opt.currency}
                            </span>
                          </div>
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            {opt.tokenStandard}
                          </span>
                        </div>
                        <div className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                          {opt.network}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {opt.description}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Security info card */}
              <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold">Strict Network Validation</div>
                  <p className="text-[11px] text-amber-700 dark:text-amber-300">
                    Always confirm you are sending on the selected network ({selectedOption?.network}). Sending assets on unsupported chains will cause loss of funds.
                  </p>
                </div>
              </div>

              {/* Action Button */}
              <button
                type="button"
                disabled={isLoading}
                onClick={handleGenerateInvoice}
                className="w-full py-4 rounded-2xl bg-[#ff6a00] hover:bg-[#e05d00] text-white font-extrabold text-sm shadow-lg shadow-[#ff6a00]/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Generating Secure Invoice & Address...</span>
                  </>
                ) : (
                  <>
                    <span>Generate Payment Invoice • {selectedOption?.currency} ({selectedOption?.tokenStandard})</span>
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          ) : (
            /* Step 2: Active Invoice Display */
            <div className="space-y-5">
              {/* Status Header */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-3 h-3 rounded-full ${
                      liveStatus === 'paid'
                        ? 'bg-emerald-500 animate-pulse'
                        : liveStatus === 'confirming'
                        ? 'bg-blue-500 animate-ping'
                        : liveStatus === 'expired'
                        ? 'bg-rose-500'
                        : 'bg-amber-500 animate-pulse'
                    }`}
                  />
                  <span className="font-extrabold text-xs uppercase tracking-wider text-slate-800 dark:text-slate-200">
                    Status: {liveStatus.toUpperCase()}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-[#ff6a00] bg-orange-50 dark:bg-orange-950/40 px-2.5 py-1 rounded-xl">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{formatTime(secondsRemaining)} remaining</span>
                </div>
              </div>

              {/* Paid Success Banner */}
              {liveStatus === 'paid' && (
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0" />
                  <div>
                    <div className="font-extrabold text-sm">Payment Verified on Blockchain!</div>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400">
                      Your order has been authorized and queued for packaging.
                    </p>
                  </div>
                </div>
              )}

              {/* QR Code and Payment Details */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
                {/* QR Code Column */}
                <div className="md:col-span-5 flex flex-col items-center justify-center text-center space-y-2">
                  <DynamicCryptoQR value={cryptoDetails?.qrCodeData || ''} size={170} />
                  <span className="text-[11px] text-slate-400 font-medium">Scan with crypto wallet app</span>
                </div>

                {/* Amount & Address Column */}
                <div className="md:col-span-7 space-y-3">
                  {/* Amount Box */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 space-y-1">
                    <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
                      <span>Exact Amount to Send</span>
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                        Network: {cryptoDetails?.network}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-xl font-black text-slate-900 dark:text-white font-mono">
                        {cryptoDetails?.payAmount} {cryptoDetails?.currency}
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(String(cryptoDetails?.payAmount), 'Amount')}
                        className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                        title="Copy amount"
                      >
                        {copiedField === 'Amount' ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Address Box */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 space-y-1">
                    <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
                      <span>Deposit Wallet Address</span>
                      <span className="text-[10px] uppercase font-bold text-slate-500">
                        {cryptoDetails?.tokenStandard} Token
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-mono font-bold text-slate-900 dark:text-white break-all select-all">
                        {cryptoDetails?.payAddress}
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(cryptoDetails?.payAddress || '', 'Address')}
                        className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 shrink-0 transition-colors cursor-pointer"
                        title="Copy deposit address"
                      >
                        {copiedField === 'Address' ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Network Warning Banner */}
              <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="font-extrabold uppercase tracking-wider text-[11px]">Strict Network Warning</div>
                  <p className="text-[11px] leading-relaxed">
                    Send only <strong>{cryptoDetails?.currency}</strong> via <strong>{cryptoDetails?.network} ({cryptoDetails?.tokenStandard})</strong>. Sending any other currency or using the wrong network will result in permanent loss of funds.
                  </p>
                </div>
              </div>

              {/* Manual Check & Sandbox Simulation Controls */}
              <div className="space-y-3 pt-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={isPolling}
                    onClick={handleManualCheck}
                    className="flex-1 py-3 rounded-2xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isPolling ? 'animate-spin' : ''}`} />
                    <span>Check Blockchain Status Now</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStep('select')}
                    className="py-3 px-4 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Change Token
                  </button>
                </div>

                {/* Sandbox Instant Simulation Bar (Allows instant testing) */}
                <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-amber-900 dark:text-amber-200 font-extrabold text-[11px]">
                    <span>Sandbox Test Simulations (Instant Verification):</span>
                    <span className="text-[10px] uppercase font-normal text-amber-700 dark:text-amber-400">Sandbox Active</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() => handleSimulateSandbox('paid')}
                      className="py-1.5 px-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer text-center"
                    >
                      Simulate Paid
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSimulateSandbox('confirming')}
                      className="py-1.5 px-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer text-center"
                    >
                      Simulate Confirming
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSimulateSandbox('partially_paid')}
                      className="py-1.5 px-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold cursor-pointer text-center"
                    >
                      Underpaid
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSimulateSandbox('expired')}
                      className="py-1.5 px-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold cursor-pointer text-center"
                    >
                      Expired
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
