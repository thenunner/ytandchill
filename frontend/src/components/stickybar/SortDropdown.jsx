import { useState, useRef, useEffect } from 'react';

export default function SortDropdown({
  options, // Array of { value, label, icon? }
  value,
  onChange,
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

  return (
    <div className={`relative ${className}`} ref={menuRef}>
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="px-4 py-2 bg-dark-secondary border border-dark-border rounded-lg text-text-primary hover:bg-dark-hover transition-colors flex items-center gap-2"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="3" y1="6" x2="21" y2="6"></line>
          <line x1="3" y1="12" x2="21" y2="12"></line>
          <line x1="3" y1="18" x2="21" y2="18"></line>
        </svg>
        <span>{selectedOption?.label || 'Sort'}</span>
        <svg className={`w-4 h-4 transition-transform ${showMenu ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

      {showMenu && (
        <div className="absolute right-0 mt-2 bg-dark-secondary border border-dark-border rounded-lg shadow-xl py-1 min-w-[200px] z-50">
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setShowMenu(false);
              }}
              className={`w-full px-4 py-2 text-left text-sm hover:bg-dark-hover transition-colors flex items-center gap-2 ${
                value === option.value ? 'text-accent' : 'text-text-primary'
              }`}
            >
              {option.icon}
              <span>{option.label}</span>
              {value === option.value && (
                <svg className="w-4 h-4 ml-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
