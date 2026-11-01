import React, { useState } from 'react';
import { Play, ShieldCheck, Eye, X, ShoppingBag, ChevronRight, Check } from 'lucide-react';
import { VIDEO_GALLERY } from '../data/mockData';
import { VideoGalleryItem, Product } from '../types';
import { useLanguage } from '../i18n/LanguageContext';

interface VideoGallerySectionProps {
  onAddToCart: (product: Product) => void;
  onSelectProduct: (product: Product) => void;
}

export const VideoGallerySection: React.FC<VideoGallerySectionProps> = ({
  onAddToCart,
  onSelectProduct,
}) => {
  const { t } = useLanguage();
  const [activeVideo, setActiveVideo] = useState<VideoGalleryItem | null>(null);
  const [addedItem, setAddedItem] = useState(false);

  const handleBuyFeatured = (product: Product) => {
    onAddToCart(product);
    setAddedItem(true);
    setTimeout(() => setAddedItem(false), 2000);
  };

  return (
    <section className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            {t('home.videoGallery', 'Video Gallery')}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('home.videoGalleryDesc', 'Shoppable product demonstrations, hands-on tests & creator unboxings')}
          </p>
        </div>
        <button className="text-xs font-semibold text-[#ff6a00] hover:text-[#e65f00] flex items-center gap-1 cursor-pointer">
          <span>{t('common.viewAll', 'View all')}</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Grid of video thumbnails */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {VIDEO_GALLERY.map((video) => (
          <div
            key={video.id}
            onClick={() => setActiveVideo(video)}
            className="group relative rounded-2xl overflow-hidden bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs hover:shadow-xl transition-all duration-300 cursor-pointer flex flex-col justify-between h-72"
          >
            {/* Thumbnail */}
            <img
              src={video.thumbnail || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80'}
              alt={video.title || 'Video'}
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-106 transition-transform duration-500"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/20" />

            {/* Top tags: Verified & Views */}
            <div className="relative z-10 p-3.5 flex items-center justify-between">
              <span className="flex items-center gap-1 text-[10px] font-bold text-white bg-black/50 backdrop-blur-md px-2 py-0.5 rounded-full border border-white/15">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                {t('home.verifiedReview', 'Verified Review')}
              </span>
              <span className="flex items-center gap-1 text-[10px] font-semibold text-white/90 bg-black/50 backdrop-blur-md px-2 py-0.5 rounded-full">
                <Eye className="w-3 h-3 text-[#ff6a00]" />
                {video.views}
              </span>
            </div>

            {/* Center Play Button */}
            <div className="relative z-10 self-center">
              <div className="w-12 h-12 rounded-full bg-[#ff6a00]/90 text-white flex items-center justify-center shadow-lg group-hover:scale-115 group-hover:bg-[#ff6a00] transition-all duration-300">
                <Play className="w-5 h-5 fill-white ml-0.5" />
              </div>
            </div>

            {/* Bottom info */}
            <div className="relative z-10 p-3.5 text-white">
              <h4 className="text-xs font-bold line-clamp-2 mb-2 group-hover:text-amber-300 transition-colors">
                {video.title}
              </h4>
              <div className="flex items-center justify-between pt-2 border-t border-white/15">
                <div className="flex items-center gap-2">
                  <img
                    src={video.creatorAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
                    alt={video.creator || 'Creator'}
                    className="w-5 h-5 rounded-full object-cover ring-1 ring-white/30"
                  />
                  <span className="text-[11px] text-slate-300 font-medium truncate max-w-[110px]">
                    {video.creator}
                  </span>
                </div>
                <span className="text-[10px] font-mono font-bold text-amber-400 bg-black/60 px-1.5 py-0.5 rounded">
                  {video.duration}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Trust Indicator Strip below video gallery (matching mockup) */}
      <div className="flex flex-wrap items-center justify-center sm:justify-between gap-3 text-xs text-slate-500 dark:text-slate-400 py-3 px-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
        <div className="flex items-center gap-2 font-medium">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>Video reviews with verified product dispatch</span>
        </div>
        <div className="flex items-center gap-2 font-medium">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>100% Genuine customer unboxings</span>
        </div>
        <div className="flex items-center gap-2 font-medium">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>Direct shoppable merchant tags</span>
        </div>
      </div>

      {/* Interactive Video Modal */}
      {activeVideo && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden max-w-2xl w-full shadow-2xl relative">
            {/* Close */}
            <button
              onClick={() => setActiveVideo(null)}
              className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full bg-black/60 text-white hover:bg-black/90 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Video Viewport / simulation */}
            <div className="relative aspect-video bg-black flex items-center justify-center">
              <img
                src={activeVideo.thumbnail || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80'}
                alt={activeVideo.title || 'Video'}
                className="w-full h-full object-cover opacity-60"
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                <div className="w-16 h-16 rounded-full bg-[#ff6a00] flex items-center justify-center text-white mb-4 animate-pulse">
                  <Play className="w-7 h-7 fill-white ml-1" />
                </div>
                <h3 className="text-white font-bold text-base max-w-md">
                  {activeVideo.title}
                </h3>
                <p className="text-slate-400 text-xs mt-1">
                  By {activeVideo.creator} • {activeVideo.views} views • {activeVideo.duration}
                </p>
              </div>
            </div>

            {/* Shoppable Featured Product bar */}
            <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-4">
              <div
                onClick={() => {
                  onSelectProduct(activeVideo.featuredProduct);
                  setActiveVideo(null);
                }}
                className="flex items-center gap-3 cursor-pointer group"
              >
                <img
                  src={activeVideo.featuredProduct?.image || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=150&q=80'}
                  alt={activeVideo.featuredProduct?.name || 'Featured Product'}
                  className="w-12 h-12 rounded-lg object-cover bg-white"
                />
                <div>
                  <div className="text-[10px] text-amber-400 font-bold uppercase">
                    {t('home.featuredInVideo', 'Featured in Video')}
                  </div>
                  <h4 className="text-xs font-bold text-white group-hover:text-[#ff6a00] transition-colors truncate max-w-[200px] sm:max-w-xs">
                    {activeVideo.featuredProduct.name}
                  </h4>
                  <div className="text-sm font-extrabold text-[#ff6a00]">
                    ${activeVideo.featuredProduct.price.toFixed(2)}
                  </div>
                </div>
              </div>

              <button
                onClick={() => handleBuyFeatured(activeVideo.featuredProduct)}
                className="px-4 py-2.5 bg-[#ff6a00] hover:bg-[#e65f00] text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shrink-0 transition-colors shadow-sm cursor-pointer"
              >
                {addedItem ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>{t('product.added', 'Added to Cart!')}</span>
                  </>
                ) : (
                  <>
                    <ShoppingBag className="w-4 h-4" />
                    <span>{t('home.buyFeaturedItem', 'Buy Featured Item')}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

