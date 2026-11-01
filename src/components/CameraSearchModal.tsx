import React, { useState, useRef, useEffect } from 'react';
import {
  Camera,
  X,
  RefreshCw,
  Search,
  Upload,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  FlipHorizontal,
  Image as ImageIcon,
  ShieldAlert,
} from 'lucide-react';
import { Product } from '../types';
import { useLanguage } from '../i18n/LanguageContext';
import { analyzeImageForVisualSearch, VisualSearchResult } from '../services/visualSearchService';
import { useCameraStream } from '../hooks/useCameraStream';

interface CameraSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  onSearchResults: (query: string, category?: string) => void;
  onToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

export const CameraSearchModal: React.FC<CameraSearchModalProps> = ({
  isOpen,
  onClose,
  products,
  onSearchResults,
  onToast,
}) => {
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const {
    videoRef,
    permissionStatus,
    facingMode,
    hasCameraDevices,
    startStream,
    stopStream,
    switchCamera,
    captureFrame,
  } = useCameraStream({ initialFacingMode: 'environment' });

  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<VisualSearchResult | null>(null);

  // Handle modal open/close lifecycle
  useEffect(() => {
    if (isOpen) {
      setCapturedImage(null);
      setAnalysisResult(null);
      setIsAnalyzing(false);
      startStream(facingMode);
    } else {
      stopStream();
    }

    return () => {
      stopStream();
    };
  }, [isOpen, facingMode, startStream, stopStream]);

  // Switch between front and back camera
  const handleToggleFacingMode = () => {
    switchCamera();
  };

  // Capture frame from active video stream
  const handleTakePhoto = () => {
    const frame = captureFrame(1280, 720);
    if (frame) {
      setCapturedImage(frame);
      stopStream();
    }
  };

  // Retake photo: clear state and resume stream
  const handleRetake = () => {
    setCapturedImage(null);
    setAnalysisResult(null);
    setIsAnalyzing(false);
    startStream(facingMode);
  };

  // Handle file upload fallback
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        setCapturedImage(result);
        stopStream();
      }
    };
    reader.readAsDataURL(file);
  };

  // Execute Visual Search
  const handleSearchImage = async () => {
    if (!capturedImage) return;

    setIsAnalyzing(true);
    try {
      const result = await analyzeImageForVisualSearch(capturedImage, products);
      setAnalysisResult(result);
      setIsAnalyzing(false);

      onToast(`Identified "${result.query}" from photo!`, 'success');

      // Navigate to results
      setTimeout(() => {
        onSearchResults(result.query, result.category);
        onClose();
      }, 700);
    } catch (err) {
      setIsAnalyzing(false);
      onToast('Visual search analysis failed. Please try again.', 'error');
    }
  };

  // Preset sample photo for testing
  const handleUseSample = (imageUrl: string, suggestedQuery: string, category: string) => {
    setCapturedImage(imageUrl);
    stopStream();
    setIsAnalyzing(true);

    setTimeout(() => {
      setIsAnalyzing(false);
      onToast(`Identified "${suggestedQuery}" from photo!`, 'success');
      onSearchResults(suggestedQuery, category);
      onClose();
    }, 600);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-50 dark:bg-orange-950/50 text-[#ff6a00] flex items-center justify-center">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-white leading-tight">
                {t('camera.title', 'Camera Search')}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Snap or upload any item to discover matching marketplace products
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewport & Controls */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Main Visual Viewfinder Box */}
          <div className="relative w-full aspect-4/3 rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-inner flex items-center justify-center">
            {capturedImage && capturedImage.trim().length > 0 ? (
              // Captured Photo Preview
              <div className="relative w-full h-full">
                <img
                  src={capturedImage}
                  alt="Captured photo preview"
                  className="w-full h-full object-contain bg-black"
                />
                <div className="absolute top-3 left-3 bg-black/60 text-white text-[10px] font-bold px-2.5 py-1 rounded-full backdrop-blur-xs flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{t('camera.preview', 'Photo Preview')}</span>
                </div>

                {isAnalyzing && (
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center gap-3 text-white p-4 text-center">
                    <div className="w-12 h-12 rounded-full border-3 border-white/20 border-t-[#ff6a00] animate-spin" />
                    <span className="text-sm font-bold animate-pulse">
                      {t('camera.analyzing', 'Analyzing visual characteristics...')}
                    </span>
                  </div>
                )}
              </div>
            ) : permissionStatus === 'granted' ? (
              // Active Video Stream
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

                {/* Viewfinder crosshairs / frame guide */}
                <div className="absolute inset-8 sm:inset-12 border-2 border-white/40 rounded-2xl pointer-events-none flex items-center justify-center">
                  <div className="w-4 h-4 border-t-2 border-l-2 border-[#ff6a00] absolute top-0 left-0" />
                  <div className="w-4 h-4 border-t-2 border-r-2 border-[#ff6a00] absolute top-0 right-0" />
                  <div className="w-4 h-4 border-b-2 border-l-2 border-[#ff6a00] absolute bottom-0 left-0" />
                  <div className="w-4 h-4 border-b-2 border-r-2 border-[#ff6a00] absolute bottom-0 right-0" />
                </div>

                {/* Flip camera toggle button (Mobile) */}
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
                    'Camera access was denied by your browser or device. Please grant permission in browser settings, or upload an image file.'
                  )}
                </p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-[#ff6a00] hover:bg-[#e65f00] text-white text-xs font-bold rounded-xl shadow-md transition-colors cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  <span>{t('camera.uploadPhoto', 'Upload Photo Instead')}</span>
                </button>
              </div>
            ) : (
              // Camera Unavailable / Unsupported Fallback State
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
                    'Unable to access your device camera. You can upload an image from your device instead.'
                  )}
                </p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-[#ff6a00] hover:bg-[#e65f00] text-white text-xs font-bold rounded-xl shadow-md transition-colors cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  <span>{t('camera.uploadPhoto', 'Upload Photo Instead')}</span>
                </button>
              </div>
            )}
          </div>

          {/* Action Controls */}
          <div className="space-y-3">
            {capturedImage ? (
              // Actions after capturing photo: Retake and Search Image
              <div className="flex gap-2.5">
                <button
                  onClick={handleRetake}
                  disabled={isAnalyzing}
                  className="flex-1 py-3 rounded-xl border border-slate-300 dark:border-slate-700 hover:border-slate-400 text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>{t('camera.retake', 'Retake')}</span>
                </button>

                <button
                  onClick={handleSearchImage}
                  disabled={isAnalyzing}
                  className="flex-2 py-3 rounded-xl bg-[#ff6a00] hover:bg-[#e65f00] text-white text-xs sm:text-sm font-black flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer disabled:opacity-50"
                >
                  <Search className="w-4 h-4" />
                  <span>{t('camera.searchImage', 'Search Image')}</span>
                </button>
              </div>
            ) : (
              // Actions before capturing photo: Take Photo & Upload from device
              <div className="flex items-center gap-2.5">
                {permissionStatus === 'granted' && (
                  <button
                    onClick={handleTakePhoto}
                    className="flex-2 py-3.5 rounded-2xl bg-[#ff6a00] hover:bg-[#e65f00] text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg hover:shadow-orange-500/20 transition-all cursor-pointer active:scale-98"
                  >
                    <div className="w-4 h-4 rounded-full border-2 border-white flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-white" />
                    </div>
                    <span>{t('camera.takePhoto', 'Take Photo')}</span>
                  </button>
                )}

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 py-3.5 rounded-2xl border border-slate-300 dark:border-slate-700 hover:border-[#ff6a00] text-slate-700 dark:text-slate-200 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Upload className="w-4 h-4 text-[#ff6a00]" />
                  <span>{t('camera.uploadPhoto', 'Upload Photo')}</span>
                </button>
              </div>
            )}

            {/* Hidden file input for file uploading */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
            />

            {/* Instant Demo Test Samples (Great for QA on desktop or devices without objects nearby) */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block mb-2">
                Quick Test Samples (Instant Simulation):
              </span>
              <div className="grid grid-cols-4 gap-2">
                <button
                  onClick={() =>
                    handleUseSample(
                      'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=400&q=80',
                      'Smartwatch AMOLED Display',
                      'electronics'
                    )
                  }
                  className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-[#ff6a00] flex flex-col items-center gap-1 group text-center"
                >
                  <img
                    src="https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=120&q=80"
                    alt="Watch"
                    className="w-10 h-10 object-cover rounded-lg group-hover:scale-105 transition-transform"
                  />
                  <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300 truncate w-full">
                    Smartwatch
                  </span>
                </button>

                <button
                  onClick={() =>
                    handleUseSample(
                      'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=400&q=80',
                      'Wireless Noise-Cancelling Headphones',
                      'electronics'
                    )
                  }
                  className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-[#ff6a00] flex flex-col items-center gap-1 group text-center"
                >
                  <img
                    src="https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=120&q=80"
                    alt="Headphones"
                    className="w-10 h-10 object-cover rounded-lg group-hover:scale-105 transition-transform"
                  />
                  <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300 truncate w-full">
                    Headphones
                  </span>
                </button>

                <button
                  onClick={() =>
                    handleUseSample(
                      'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=400&q=80',
                      'Lightweight Running Shoes',
                      'fashion'
                    )
                  }
                  className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-[#ff6a00] flex flex-col items-center gap-1 group text-center"
                >
                  <img
                    src="https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=120&q=80"
                    alt="Sneakers"
                    className="w-10 h-10 object-cover rounded-lg group-hover:scale-105 transition-transform"
                  />
                  <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300 truncate w-full">
                    Running Shoes
                  </span>
                </button>

                <button
                  onClick={() =>
                    handleUseSample(
                      'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=400&q=80',
                      'Mechanical Gaming Keyboard',
                      'gaming'
                    )
                  }
                  className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-[#ff6a00] flex flex-col items-center gap-1 group text-center"
                >
                  <img
                    src="https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=120&q=80"
                    alt="Keyboard"
                    className="w-10 h-10 object-cover rounded-lg group-hover:scale-105 transition-transform"
                  />
                  <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300 truncate w-full">
                    Keyboard
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer info note */}
        <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800 text-center text-[10px] text-slate-400">
          <span>Security Guaranteed: Photos are processed in-session and never stored permanently.</span>
        </div>
      </div>
    </div>
  );
};
