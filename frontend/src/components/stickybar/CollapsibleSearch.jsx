import { useState, useRef, useEffect } from 'react';

/**
 * CollapsibleSearch - A search input that collapses to an icon on mobile
 * Shows full search on desktop (sm+), collapsible icon on mobile
 *
 * @param {string} value - Current search value
 * @param {Function} onChange - Callback when search value changes
 * @param {string} placeholder - Placeholder text
 * @param {string} className - Additional classes for the container
 * @param {string} desktopWidth - Width class for desktop input (default: w-[200px])
 */
export default function CollapsibleSearch({
  value,
  onChange,
  placeholder = "Search...",
  className = '',
  desktopWidth = 'sm:w-[200px]'
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  // Focus input when expanded
  useEffect(() => {
    if (isExpanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isExpanded]);

  // Close on click outside (mobile only)
  useEffect(() => {
    if (!isExpanded) return;

    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        // Only collapse if search is empty
        if (!value) {
          setIsExpanded(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isExpanded, value]);

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      if (value) {
        onChange('');
      } else {
        setIsExpanded(false);
      }
      e.target.blur();
    }
  };

  const handleClose = () => {
    onChange('');
    setIsExpanded(false);
  };

  return (
    <>
      {/* Desktop: Always show full search input */}
      <div className={`hidden sm:block relative ${desktopWidth} ${className}`}>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full h-[35px] pl-10 pr-9 text-sm bg-dark-secondary border border-dark-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"></circle>
          <path d="m21 21-4.35-4.35"></path>
        </svg>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
            aria-label="Clear search"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        )}
      </div>

      {/* Mobile: Collapsible search */}
      <div className={`sm:hidden ${className}`} ref={containerRef}>
        {!isExpanded ? (
          /* Collapsed - Icon button */
          <button
            onClick={() => setIsExpanded(true)}
            className={`filter-btn flex-shrink-0 ${value ? 'bg-accent/20 border-accent/40 text-accent' : ''}`}
            title="Search"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"></circle>
              <path d="m21 21-4.35-4.35"></path>
            </svg>
          </button>
        ) : (
          /* Expanded - Full width input with close button */
          <div className="fixed inset-x-0 top-0 z-50 p-3 bg-dark-primary border-b border-dark-border animate-fade-in">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  ref={inputRef}
                  type="text"
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={placeholder}
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-dark-secondary border border-dark-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                />
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"></circle>
                  <path d="m21 21-4.35-4.35"></path>
                </svg>
              </div>
              <button
                onClick={handleClose}
                className="p-2.5 rounded-lg bg-dark-tertiary border border-dark-border text-text-secondary hover:bg-red-500 hover:border-red-500 hover:text-white transition-all flex-shrink-0"
                title="Close search"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
