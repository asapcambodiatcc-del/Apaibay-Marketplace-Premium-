import React from 'react';

export const ProductCardSkeleton: React.FC = () => {
  return (
    <div
      role="status"
      aria-label="Loading product"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-2.5 sm:p-3.5 flex flex-col justify-between animate-pulse"
    >
      {/* Image Skeleton */}
      <div className="h-36 xs:h-44 sm:h-52 w-full rounded-xl bg-slate-200 dark:bg-slate-800 mb-2 sm:mb-3" />

      {/* Details Skeleton */}
      <div className="flex-1 flex flex-col justify-between space-y-3">
        <div className="space-y-2">
          {/* Category */}
          <div className="h-2.5 bg-slate-200 dark:bg-slate-800 rounded w-1/3" />
          {/* Title */}
          <div className="h-3.5 bg-slate-200 dark:bg-slate-800 rounded w-5/6" />
          <div className="h-3.5 bg-slate-200 dark:bg-slate-800 rounded w-3/4" />
          {/* Rating */}
          <div className="h-2.5 bg-slate-200 dark:bg-slate-800 rounded w-1/4 mt-1" />
        </div>

        {/* Price & Button */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
          <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-16" />
          <div className="w-8 h-8 rounded-xl bg-slate-200 dark:bg-slate-800" />
        </div>
      </div>
    </div>
  );
};

export const ProductGridSkeleton: React.FC<{ count?: number }> = ({ count = 5 }) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 sm:gap-4 lg:gap-5">
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
};
