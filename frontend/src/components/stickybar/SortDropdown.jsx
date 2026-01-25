import { useState, useRef, useEffect } from 'react';

/**
 * Unified sort dropdown component
 *
 * Options can be:
 * - { value, label } - Regular selectable option
 * - { divider: true } - Horizontal divider line
 * - { header: 'Label' } - Section header text
 *
 * For video lists with duration filter, use durationValue/onDurationChange props.
 */
export default function SortDropdown({
  options, // Array of option objects
  value,
  onChange,
  // Optional: duration filter for video lists
  durationValue,
  onDurationChange,
  durationOptions,
  className = ''
}) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
    };
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu]);

  const selectedOption = options.find(opt => opt.value === value);
  const selectedDuration = durationOptions?.find(opt => opt.value === durationValue);

  // Show duration in button label if not "all"
  const buttonLabel = selectedOption?.label || 'Sort';
  const hasDurationFilter = durationValue && durationValue !== 'all' && durationValue !== '';

  return (
    <div className={`relative ${className}`} ref={menuRef}>
      <button
        onClick={() => setShowMenu(!showMenu)}
        className={`h-[35px] px-2.5 sm:px-3 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 bg-dark-tertiary border border-dark-border-light text-text-primary hover:bg-dark-hover ${showMenu ? 'bg-dark-hover' : ''}`}
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 6h18M7 12h10M10 18h4" />
        </svg>
        <span className="hidden sm:inline">{buttonLabel}</span>
        {hasDurationFilter && (
          <span className="bg-accent text-white text-xs px-1.5 py-0.5 rounded-full">
            {selectedDuration?.label}
          </span>
        )}
        <svg className={`w-3 h-3 transition-transform ${showMenu ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

      {showMenu && (
        <div className="absolute right-0 mt-2 bg-dark-secondary border border-dark-border rounded-lg shadow-xl py-2 min-w-[180px] z-50">
          {options.map((option, index) => {
            // Render section header
            if (option.header) {
              return (
                <div key={`header-${index}`} className="px-3 py-1 text-xs font-semibold text-text-muted uppercase tracking-wider">
                  {option.header}
                </div>
              );
            }
            // Render divider
            if (option.divider) {
              return <div key={`divider-${index}`} className="border-t border-dark-border my-1" />;
            }
            // Render option
            return (
              <button
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  if (!durationOptions) {
                    setShowMenu(false);
                  }
                }}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-dark-hover transition-colors flex items-center gap-2 ${
                  value === option.value ? 'text-accent' : 'text-text-primary'
                }`}
              >
                <span className="flex-1">{option.label}</span>
                {value === option.value && (
                  <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                )}
              </button>
            );
          })}

          {/* Duration filter section (optional) */}
          {durationOptions && (
            <>
              <div className="border-t border-dark-border my-1" />
              <div className="px-3 py-1 text-xs font-semibold text-text-muted uppercase tracking-wider">
                Duration
              </div>
              {durationOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    onDurationChange(option.value);
                    setShowMenu(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-dark-hover transition-colors flex items-center gap-2 ${
                    durationValue === option.value ? 'text-accent' : 'text-text-primary'
                  }`}
                >
                  <span className="flex-1">{option.label}</span>
                  {durationValue === option.value && (
                    <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  )}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
