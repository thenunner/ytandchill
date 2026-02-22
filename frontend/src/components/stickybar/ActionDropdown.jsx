import { useState, useRef, useEffect } from 'react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { createPortal } from 'react-dom';

/**
 * ActionDropdown - Generic dropdown for action menus
 *
 * @param {string} label - Button label (e.g., "Add", "Manage", "Options")
 * @param {ReactNode} mobileIcon - Icon to show instead of label on mobile (optional)
 * @param {Array} items - Array of menu items:
 *   - { label, onClick, icon?, variant? } - Regular item
 *   - { divider: true } - Divider line
 *   - { header: 'Label' } - Section header
 * @param {boolean} disabled - Whether dropdown is disabled
 * @param {string} variant - Button variant: 'default', 'primary', 'secondary'
 * @param {string} className - Additional classes
 * @param {string} align - Menu alignment: 'left' or 'right'
 */
export default function ActionDropdown({
  label,
  mobileIcon,
  items,
  disabled = false,
  variant = 'default',
  className = '',
  align = 'left',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);
  const isMobile = useMediaQuery('(max-width: 639px)');

  // Close on click outside (desktop only)
  useEffect(() => {
    if (isMobile) return; // Mobile uses modal backdrop for closing

    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, isMobile]);

  const buttonStyles = {
    default: 'filter-btn',
    primary: 'h-[35px] px-2.5 sm:px-4 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 bg-accent border border-accent text-black hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-dark-primary',
    secondary: 'h-[35px] px-2.5 sm:px-4 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 bg-dark-tertiary border border-dark-border-light text-text-primary hover:bg-dark-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
    // Icon-only variant for mobile
    iconOnly: 'h-[35px] w-[35px] rounded-lg text-sm font-medium transition-colors flex items-center justify-center bg-dark-tertiary border border-dark-border-light text-text-primary hover:bg-dark-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
  };

  const renderMenuItem = (item, index) => {
    // Render divider
    if (item.divider) {
      return (
        <div
          key={`divider-${index}`}
          className="border-t border-white/10 my-2"
        />
      );
    }

    // Render section header
    if (item.header) {
      return (
        <div
          key={`header-${index}`}
          className="px-4 py-2 text-xs font-semibold text-text-muted uppercase tracking-wider"
        >
          {item.header}
        </div>
      );
    }

    // Render menu item
    const isDanger = item.variant === 'danger';
    const isSuccess = item.variant === 'success';

    return (
      <button
        key={`item-${index}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          item.onClick?.();
          setIsOpen(false);
        }}
        disabled={item.disabled}
        className={`w-full px-4 py-3.5 text-left text-base transition-colors flex items-center gap-3 rounded-xl focus-visible:outline-none ${
          isDanger
            ? 'text-red-400 hover:bg-red-500/10 active:bg-red-500/20 focus-visible:bg-red-500/10'
            : isSuccess
            ? 'text-green-400 hover:bg-green-500/10 active:bg-green-500/20 focus-visible:bg-green-500/10'
            : 'text-text-primary hover:bg-white/5 active:bg-white/10 focus-visible:bg-white/5'
        } ${item.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {item.icon && <span className="w-5 h-5 flex-shrink-0">{item.icon}</span>}
        <span className="flex-1">
          <span className="font-medium block">{item.label}</span>
          {item.description && (
            <span className="text-xs text-text-muted leading-tight block mt-0.5">{item.description}</span>
          )}
        </span>
      </button>
    );
  };

  // Mobile modal content
  const mobileModal = isOpen && isMobile && createPortal(
    <div
      className="fixed inset-0 bg-black/70 flex items-end justify-center z-[99999]"
      onClick={() => setIsOpen(false)}
    >
      <div
        className="w-full backdrop-blur-xl bg-dark-secondary rounded-t-3xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mt-3" />
        <div className="p-4 max-h-[70vh] overflow-y-auto">
          {items.map((item, idx) => renderMenuItem(item, idx))}
        </div>
        {/* Cancel button */}
        <div className="px-4 pb-6 pt-2 border-t border-white/10">
          <button
            onClick={() => setIsOpen(false)}
            className="w-full py-3.5 rounded-xl bg-white/5 text-text-secondary font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );

  return (
    <div className={`relative ${className}`} ref={menuRef}>
      {/* Mobile: Icon-only button (when mobileIcon provided) */}
      {mobileIcon && (
        <button
          onClick={() => setIsOpen(!isOpen)}
          disabled={disabled}
          className={`sm:hidden ${buttonStyles.iconOnly} ${isOpen ? 'bg-dark-hover' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <span className="w-4 h-4">{mobileIcon}</span>
        </button>
      )}
      {/* Desktop: Full button (or always if no mobileIcon) */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className={`${mobileIcon ? 'hidden sm:flex' : ''} ${buttonStyles[variant]} ${isOpen ? 'active' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <span>{label}</span>
        <svg
          className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

      {/* Desktop dropdown */}
      {isOpen && !isMobile && (
        <div className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} mt-2 bg-dark-secondary border border-dark-border rounded-lg shadow-xl py-2 min-w-[220px] z-50 animate-scale-in`}>
          {items.map((item, index) => {
            // Render divider
            if (item.divider) {
              return (
                <div
                  key={`divider-${index}`}
                  className="border-t border-dark-border my-1"
                />
              );
            }

            // Render section header
            if (item.header) {
              return (
                <div
                  key={`header-${index}`}
                  className="px-3 py-1 text-xs font-semibold text-text-muted uppercase tracking-wider"
                >
                  {item.header}
                </div>
              );
            }

            // Render menu item
            const isDanger = item.variant === 'danger';
            const isSuccess = item.variant === 'success';

            return (
              <button
                key={`desktop-item-${index}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  item.onClick?.();
                  setIsOpen(false);
                }}
                disabled={item.disabled}
                className={`w-full px-4 py-2 text-left text-sm transition-colors flex items-center gap-2 focus-visible:outline-none ${
                  isDanger
                    ? 'text-red-400 hover:bg-red-900/30 focus-visible:bg-red-900/30'
                    : isSuccess
                    ? 'text-green-400 hover:bg-green-900/30 focus-visible:bg-green-900/30'
                    : 'text-text-primary hover:bg-dark-hover focus-visible:bg-dark-hover'
                } ${item.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {item.icon && <span className="w-4 h-4 flex-shrink-0">{item.icon}</span>}
                <span className="flex-1">
                  <span className="block">{item.label}</span>
                  {item.description && (
                    <span className="text-xs text-text-muted leading-tight block mt-0.5">{item.description}</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Mobile bottom sheet modal */}
      {mobileModal}
    </div>
  );
}
