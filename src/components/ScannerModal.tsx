import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ScanLine,
  X,
  QrCode,
  Barcode,
  Search,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  FlipHorizontal,
  Upload,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';
import { Product } from '../types';
import { useLanguage } from '../i18n/LanguageContext';
import {
  detectBarcodeFromVideo,
  lookupProductByBarcode,
  DEMO_BARCODES,
} from '../services/barcodeScanService';
import { useCameraStream } from '../hooks/useCameraStream';

interface ScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  onSelectProduct: (product: Product) => void;
  onSearchResults: (query: string) => void;
  onToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

export const ScannerModal: React.FC<ScannerModalProps> = ({
  isOpen,
  onClose,
  products,
  onSelectProduct,
  onSearchResults,
  onToast,
}) => {
  const { t } = useLanguage();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scanIntervalRef = useRef<number | null>(null);

  const {
    videoRef,
    permissionStatus,
    facingMode,
    startStream,
    stopStream,
    switchCamera,
  } = useCameraStream({ initialFacingMode: 'environment' });

  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [matchedProduct, setMatchedProduct] = useState<Product | null>(null);
  const [isNotFound, setIsNotFound] = useState(false);
  const [manualCode, setManualCode] = useState('');

  // Audio beep feedback for successful scan
  const playScanBeep = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const audioCtx = new AudioContextClass();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 tone
        gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.15);
      }
    } catch {
      // Audio context disabled or restricted
    }
  };

  // Stop scanning and camera stream
  const stopScanning = useCallback(() => {
    if (scanIntervalRef.current) {
      window.clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    stopStream();
  }, [stopStream]);

  // Process detected code
  const handleCodeDetected = useCallback(
    (code: string) => {
      const trimmed = code.trim();
      if (!trimmed) return;

      playScanBeep();
      if (navigator.vibrate) {
        try {
          navigator.vibrate(100);
        } catch {
          // ignore
        }
      }

      setScannedCode(trimmed);
      stopScanning();

      // Look up in catalog
      const match = lookupProductByBarcode(trimmed, products);
      if (match) {
        setMatchedProduct(match);
        setIsNotFound(false);
        onToast(`Scanned: ${match.name.slice(0, 24)}...`, 'success');

        // Automatically open product details after a brief visual confirmation
        setTimeout(() => {
          onSelectProduct(match);
          onClose();
        }, 900);
      } else {
        setMatchedProduct(null);
        setIsNotFound(true);
        onToast(`Code scanned (${trimmed}), but product was not found`, 'info');
      }
    },
    [products, onSelectProduct, onClose, onToast, stopScanning]
  );

  // Start continuous detection loop if BarcodeDetector is available
  const startDetectionLoop = useCallback(() => {
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);

    scanIntervalRef.current = window.setInterval(async () => {
      if (videoRef.current && videoRef.current.readyState >= 2) {
        const detected = await detectBarcodeFromVideo(videoRef.current);
        if (detected && detected.code) {
          handleCodeDetected(detected.code);
        }
      }
    }, 450);
  }, [handleCodeDetected, videoRef]);

  // Request camera and stream
  const startCamera = useCallback(
    async (mode: 'environment' | 'user') => {
      const ok = await startStream(mode);
      if (ok) {
        startDetectionLoop();
      }
    },
    [startDetectionLoop, startStream]
  );

  useEffect(() => {
    if (isOpen) {
      setScannedCode(null);
      setMatchedProduct(null);
      setIsNotFound(false);
      setManualCode('');
      startCamera(facingMode);
    } else {
      stopScanning();
    }

    return () => {
      stopScanning();
    };
  }, [isOpen, facingMode, startCamera, stopScanning]);

  // Switch between back/front camera
  const handleToggleFacingMode = () => {
    switchCamera();
  };

  // Reset and try again
  const handleTryAgain = () => {
    setScannedCode(null);
    setMatchedProduct(null);
    setIsNotFound(false);
    startCamera(facingMode);
  };

  // Handle Manual Code Submit
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    handleCodeDetected(manualCode.trim());
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-50 dark:bg-orange-950/50 text-[#ff6a00] flex items-center justify-center">
              <ScanLine className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-white leading-tight">
                {t('camera.scanTitle', 'Barcode & QR Scanner')}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Scan UPC, EAN, QR codes or product labels to view instant details
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewport & Controls */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Main Viewfinder */}
          <div className="relative w-full aspect-4/3 rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-inner flex items-center justify-center">
            {scannedCode ? (
              // Code Scanned Results Card Inside Viewfinder
              <div className="p-6 text-center text-slate-300 w-full max-w-sm space-y-3">
                {matchedProduct ? (
                  // Success: Product Found
                  <div className="space-y-3 animate-in zoom-in-95 duration-200">
                    <div className="w-14 h-14 mx-auto rounded-full bg-emerald-950/80 border border-emerald-500/50 flex items-center justify-center text-emerald-400">
                      <CheckCircle2 className="w-8 h-8" />
                    </div>
                    <div>
                      <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block">
                        Product Match Found!
                      </span>
                      <h4 className="font-extrabold text-white text-base mt-1 line-clamp-1">
                        {matchedProduct.name}
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Code: <span className="font-mono text-white">{scannedCode}</span> • $
                        {matchedProduct.price.toFixed(2)}
                      </p>
                    </div>
                    <p className="text-[11px] text-emerald-400 font-semibold animate-pulse">
                      Opening product page...
                    </p>
                  </div>
                ) : (
                  // Failure: Product Not Found
                  <div className="space-y-3 animate-in zoom-in-95 duration-200">
                    <div className="w-14 h-14 mx-auto rounded-full bg-amber-950/80 border border-amber-500/50 flex items-center justify-center text-amber-400">
                      <AlertTriangle className="w-8 h-8" />
                    </div>
                    <div>
                      <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block">
                        {t('camera.productNotFound', 'Product Not Found')}
                      </span>
                      <p className="text-xs text-slate-300 mt-1">
                        {t(
                          'camera.productNotFoundNotice',
                          'No product in the Apaibay catalog matches this barcode or QR code.'
                        )}
                      </p>
                      <p className="text-xs font-mono bg-white/10 px-3 py-1.5 rounded-lg text-white mt-2 inline-block">
                        {scannedCode}
                      </p>
                    </div>
                    <div className="flex gap-2 justify-center pt-2">
                      <button
                        onClick={handleTryAgain}
                        className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                      >
                        {t('camera.tryAgain', 'Try Again')}
                      </button>
                      <button
                        onClick={() => {
                          onSearchResults(scannedCode);
                          onClose();
                        }}
                        className="px-4 py-2 bg-[#ff6a00] hover:bg-[#e65f00] text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <Search className="w-3.5 h-3.5" />
                        <span>{t('camera.searchForCode', 'Search for this code')}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : permissionStatus === 'granted' ? (
              // Active Video Stream & Animated Scanning Laser Box
              <div className="relative w-full h-full">
                <video
                  ref={videoRef}
                  playsInline
                  autoPlay
                  muted
                  className={`w-full h-full object-cover ${
                    facingMode === 'user' ? 'scale-x-[-1]' : ''
                  }`}
                />

                {/* Laser Barcode Viewfinder Box with animated scanning laser line */}
                <div className="absolute inset-8 sm:inset-12 border-2 border-orange-500/80 rounded-2xl pointer-events-none flex flex-col justify-between p-2 shadow-[0_0_20px_rgba(255,106,0,0.3)]">
                  {/* Corner accents */}
                  <div className="flex justify-between">
                    <div className="w-5 h-5 border-t-3 border-l-3 border-[#ff6a00]" />
                    <div className="w-5 h-5 border-t-3 border-r-3 border-[#ff6a00]" />
                  </div>

                  {/* Animated Horizontal Laser Scanner Line */}
                  <div className="relative w-full">
                    <div className="w-full h-0.5 bg-[#ff6a00] shadow-[0_0_12px_#ff6a00] animate-pulse" />
                  </div>

                  <div className="flex justify-between">
                    <div className="w-5 h-5 border-b-3 border-l-3 border-[#ff6a00]" />
                    <div className="w-5 h-5 border-b-3 border-r-3 border-[#ff6a00]" />
                  </div>
                </div>

                {/* Hint banner */}
                <div className="absolute bottom-3 left-0 right-0 text-center pointer-events-none">
                  <span className="bg-black/70 text-white text-[10px] font-bold px-3 py-1 rounded-full backdrop-blur-xs">
                    {t('camera.alignBarcode', 'Align barcode or QR code within the frame')}
                  </span>
                </div>

                {/* Flip camera toggle button */}
                <button
                  onClick={handleToggleFacingMode}
                  className="absolute top-3 right-3 p-2.5 bg-black/60 hover:bg-black/80 text-white rounded-full backdrop-blur-xs shadow-md transition-transform active:scale-90"
                  title={t('camera.switchCamera', 'Switch Camera')}
                >
                  <FlipHorizontal className="w-4 h-4" />
                </button>
              </div>
            ) : permissionStatus === 'denied' ? (
              // Permission Denied Fallback State
              <div className="p-6 text-center text-slate-300 max-w-sm space-y-3">
                <div className="w-12 h-12 mx-auto rounded-full bg-red-950/60 border border-red-800/80 flex items-center justify-center text-red-400">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-white text-sm">
                  {t('camera.permissionDenied', 'Camera Permission Denied')}
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {t(
                    'camera.permissionDeniedNotice',
                    'Camera access was denied by your browser or device. Please grant permission in browser settings, or enter a barcode manually below.'
                  )}
                </p>
              </div>
            ) : (
              // Camera Unavailable Fallback State
              <div className="p-6 text-center text-slate-300 max-w-sm space-y-3">
                <div className="w-12 h-12 mx-auto rounded-full bg-amber-950/60 border border-amber-800/80 flex items-center justify-center text-amber-400">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-white text-sm">
                  {t('camera.cameraNotAvailable', 'Camera Not Available')}
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {t(
                    'camera.cameraUnavailableNotice',
                    'Unable to access your device camera. You can test using the demo codes below or enter a barcode manually.'
                  )}
                </p>
              </div>
            )}
          </div>

          {/* Manual Barcode Input Form */}
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Barcode className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="Enter or paste barcode digits (e.g. 8934521098)"
                className="w-full pl-9 pr-3 py-2 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:border-[#ff6a00]"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-[#ff6a00] hover:bg-[#e65f00] text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shrink-0"
            >
              Verify Code
            </button>
          </form>

          {/* Demo Barcodes for Quick Testing & QA Verification */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                {t('camera.quickTest', 'Quick Test Demo Barcodes')}:
              </span>
              <span className="text-[10px] text-slate-400">Click to test instant scan</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {DEMO_BARCODES.map((item) => (
                <button
                  key={item.code}
                  onClick={() => handleCodeDetected(item.code)}
                  className={`p-2 rounded-xl border text-left flex flex-col transition-all cursor-pointer group ${
                    item.exists
                      ? 'border-slate-200 dark:border-slate-800 hover:border-[#ff6a00] hover:bg-orange-50/50 dark:hover:bg-slate-800/80'
                      : 'border-red-200 dark:border-red-900/40 hover:border-red-500 bg-red-50/30 dark:bg-red-950/20'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold text-slate-900 dark:text-white">
                      {item.code}
                    </span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                        item.exists
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                      }`}
                    >
                      {item.exists ? 'Match' : 'Unmatched'}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5 group-hover:text-[#ff6a00]">
                    {item.productName}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800 text-center text-[10px] text-slate-400">
          <span>Standards Supported: EAN-13, UPC-A, Code-128, Code-39, QR Code</span>
        </div>
      </div>
    </div>
  );
};
