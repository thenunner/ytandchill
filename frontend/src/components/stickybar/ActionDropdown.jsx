import { useState, useRef, useEffect } from 'react';

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

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const buttonStyles = {
    default: 'filter-btn',
    primary: 'h-[35px] px-2.5 sm:px-4 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 bg-accent border border-accent text-black hover:bg-accent-hover',
    secondary: 'h-[35px] px-2.5 sm:px-4 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 bg-dark-tertiary border border-dark-border-light text-text-primary hover:bg-dark-hover',
    // Icon-only variant for mobile
    iconOnly: 'h-[35px] w-[35px] rounded-lg text-sm font-medium transition-colors flex items-center justify-center bg-dark-tertiary border border-dark-border-light text-text-primary hover:bg-dark-hover',
  };

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

      {isOpen && (
        <div className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} mt-2 bg-dark-secondary border border-dark-border rounded-lg shadow-xl py-2 min-w-[180px] z-50 animate-scale-in`}>
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

            return (
              <button
                key={item.label}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  item.onClick?.();
                  setIsOpen(false);
                }}
                disabled={item.disabled}
                className={`w-full px-4 py-2 text-left text-sm transition-colors flex items-center gap-2 ${
                  isDanger
                    ? 'text-red-400 hover:bg-red-900/30'
                    : 'text-text-primary hover:bg-dark-hover'
                } ${item.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {item.icon && <span className="w-4 h-4 flex-shrink-0">{item.icon}</span>}
                <span className="flex-1">{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
