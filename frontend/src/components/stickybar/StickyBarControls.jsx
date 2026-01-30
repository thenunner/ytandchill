import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Pagination from '../Pagination';

/**
 * SortDropdown - Sort options dropdown with optional duration filter
 *
 * Options can be:
 * - { value, label } - Regular selectable option
 * - { divider: true } - Horizontal divider line
 * - { header: 'Label' } - Section header text
 */
export function SortDropdown({
  options,
  value,
  onChange,
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
            if (option.header) {
              return (
                <div key={`header-${index}`} className="px-3 py-1 text-xs font-semibold text-text-muted uppercase tracking-wider">
                  {option.header}
                </div>
              );
            }
            if (option.divider) {
              return <div key={`divider-${index}`} className="border-t border-dark-border my-1" />;
            }
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

/**
 * StickyBarRightSection - Combined sort dropdown + pagination for sticky bars
 * Desktop: Shows both sort dropdown and pagination
 * Mobile: Shows sort dropdown only (pagination uses LoadMore pattern)
 */
export function StickyBarRightSection({
  sortValue,
  onSortChange,
  sortOptions,
  durationValue,
  onDurationChange,
  durationOptions,
  currentPage,
  totalItems,
  itemsPerPage = 50,
  onPageChange,
  showMobileSort = true,
}) {
  return (
    <>
      {showMobileSort && (
        <div className="sm:hidden">
          <SortDropdown
            value={sortValue}
            onChange={onSortChange}
            options={sortOptions}
            durationValue={durationValue}
            onDurationChange={onDurationChange}
            durationOptions={durationOptions}
          />
        </div>
      )}

      <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
        <SortDropdown
          value={sortValue}
          onChange={onSortChange}
          options={sortOptions}
          durationValue={durationValue}
          onDurationChange={onDurationChange}
          durationOptions={durationOptions}
        />
        <Pagination
          currentPage={currentPage}
          totalItems={totalItems}
          itemsPerPage={itemsPerPage}
          onPageChange={onPageChange}
        />
      </div>
    </>
  );
}

/**
 * BackButton - Navigation back button for sticky bars
 */
export function BackButton({ to, onClick, title = 'Go back' }) {
  const navigate = useNavigate();

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (to) {
      navigate(to);
    } else {
      navigate(-1);
    }
  };

  return (
    <button
      onClick={handleClick}
      className="flex items-center justify-center w-[35px] h-[35px] rounded-lg bg-dark-tertiary hover:bg-dark-hover border border-dark-border text-text-secondary hover:text-text-primary transition-colors flex-shrink-0"
      title={title}
    >
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="15 18 9 12 15 6"></polyline>
      </svg>
    </button>
  );
}

/**
 * EditButton - Toggle button for edit/selection mode
 */
export function EditButton({ active, onToggle, className = '' }) {
  return (
    <button
      onClick={onToggle}
      title={active ? "Exit selection mode" : "Select items for bulk actions"}
      className={`h-[35px] px-2.5 sm:px-4 rounded-lg text-sm font-medium transition-colors flex items-center ${
        active
          ? 'bg-accent text-black border border-accent'
          : 'bg-dark-tertiary border border-dark-border-light text-text-primary hover:bg-dark-hover'
      } ${className}`}
    >
      <span>{active ? 'Done' : 'Edit'}</span>
    </button>
  );
}

/**
 * TabGroup - Tab buttons with optional counts
 */
export function TabGroup({
  tabs,
  active,
  onChange,
  showCountOnActive = true,
  hideCountOnMobile = false,
  className = '',
}) {
  return (
    <div className={`flex h-[35px] bg-dark-secondary rounded-lg p-[3px] border border-dark-border ${className}`}>
      {tabs.map((tab) => {
        const isActive = active === tab.id;
        const showCount = tab.count != null && tab.count > 0 && (showCountOnActive ? isActive : true);

        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`px-2.5 sm:px-4 rounded-md text-sm font-medium transition-colors flex items-center ${
              isActive
                ? 'bg-accent text-black font-semibold'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab.label}
            {showCount && (
              <span className={hideCountOnMobile ? 'hidden sm:inline' : ''}>
                {` (${tab.count})`}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
