// List feedback and utility components
import { useState, useEffect } from 'react';

/**
 * LoadingSpinner - Centered spinner for loading states
 */
export function LoadingSpinner({ size = 'md', className = '' }) {
  const sizeClasses = {
    sm: 'h-6 w-6 border-2',
    md: 'h-8 w-8 border-4',
    lg: 'h-12 w-12 border-4'
  };

  return (
    <div className="flex justify-center items-center h-32 md:h-64">
      <div className={`animate-spin ${sizeClasses[size]} border-accent border-t-transparent rounded-full ${className}`}></div>
    </div>
  );
}

/**
 * EmptyState - Consistent empty state messaging
 *
 * @param {string} icon - SVG path data or emoji
 * @param {string} title - Main message (e.g., "No videos found")
 * @param {string} message - Secondary message (e.g., "Try adjusting filters")
 * @param {string} iconType - 'svg' or 'emoji' (default: 'svg')
 */
export function EmptyState({ icon, title, message, iconType = 'svg' }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      {iconType === 'emoji' ? (
        <div className="text-6xl mb-4">{icon}</div>
      ) : (
        <svg className="w-16 h-16 mx-auto mb-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          {icon}
        </svg>
      )}
      <p className="text-lg font-medium text-text-primary">{title}</p>
      {message && (
        <p className="text-sm mt-2 text-text-secondary">{message}</p>
      )}
    </div>
  );
}

/**
 * LoadMore - Button for loading additional items
 */
export function LoadMore({
  currentCount,
  totalCount,
  onLoadMore,
  loading = false
}) {
  if (currentCount >= totalCount) return null;

  return (
    <div className="flex justify-center py-6">
      <button
        onClick={onLoadMore}
        disabled={loading}
        className="px-6 py-2 bg-dark-tertiary hover:bg-dark-hover border border-dark-border rounded-lg text-text-secondary transition-colors disabled:opacity-50"
      >
        {loading ? 'Loading...' : `Load More (${currentCount}/${totalCount})`}
      </button>
    </div>
  );
}

/**
 * Pagination - Page navigation controls
 */
export function Pagination({
  currentPage,
  totalItems,
  itemsPerPage,
  onPageChange,
}) {
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  if (totalItems === 0) return null;

  return (
    <div className="flex items-center h-[35px] bg-dark-secondary border border-dark-border rounded-lg">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="px-2 h-full rounded-l-lg hover:bg-dark-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <svg className="w-4 h-4 text-text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>

      <span className="text-sm text-text-secondary px-2 border-x border-dark-border">
        {endItem}/{totalItems}
      </span>

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="px-2 h-full rounded-r-lg hover:bg-dark-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <svg className="w-4 h-4 text-text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </button>
    </div>
  );
}

/**
 * useScrollToTop - Hook for scroll-to-top button visibility and action
 * @param {number} threshold - Scroll position (in px) to show button (default: 400)
 * @returns {{ showButton: boolean, scrollToTop: function }}
 */
export function useScrollToTop(threshold = 400) {
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setShowButton(window.scrollY > threshold);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [threshold]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return { showButton, scrollToTop };
}

/**
 * ScrollToTopButton - Fixed position button to scroll to top of page
 * @param {boolean} show - Whether to show the button
 * @param {function} onClick - Click handler (use scrollToTop from useScrollToTop)
 */
export function ScrollToTopButton({ show, onClick }) {
  if (!show) return null;

  return (
    <button
      onClick={onClick}
      className="fixed bottom-20 right-6 p-3 bg-gray-700 hover:bg-gray-600 rounded-full shadow-lg transition-colors z-50 animate-fade-in"
      aria-label="Scroll to top"
    >
      <svg className="w-5 h-5 text-text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="18 15 12 9 6 15"></polyline>
      </svg>
    </button>
  );
}
