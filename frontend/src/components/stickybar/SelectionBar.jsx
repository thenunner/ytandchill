import { useEffect, useState } from 'react';

/**
 * SelectionBar - A floating bottom bar for edit mode selection controls
 *
 * @param {Object} props
 * @param {number} props.selectedCount - Number of selected items
 * @param {number} props.totalCount - Total number of items that can be selected
 * @param {Function} props.onSelectAll - Callback when "Select All" is clicked
 * @param {Function} props.onClear - Callback when "Clear" is clicked
 * @param {Function} props.onDone - Callback when "Done" is clicked
 * @param {Array} props.actions - Additional action buttons [{label, icon, onClick, disabled?, variant: 'primary'|'danger'|'warning'|'success'}]
 * @param {boolean} props.show - Whether to show the bar (usually editMode && hasItems)
 * @param {boolean} props.hideDone - Hide the Done button (for non-edit-mode contexts)
 * @param {boolean} props.hideSelectControls - Hide Select All/Clear when nothing selected
 */
export default function SelectionBar({
  selectedCount = 0,
  totalCount = 0,
  onSelectAll,
  onClear,
  onDone,
  actions = [],
  show = false,
  hideDone = false,
  hideSelectControls = false
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  // Handle show/hide with animation
  useEffect(() => {
    if (show) {
      setIsVisible(true);
      // Small delay to trigger animation
      requestAnimationFrame(() => {
        setIsAnimating(true);
      });
    } else {
      setIsAnimating(false);
      // Wait for animation to complete before hiding
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [show]);

  if (!isVisible) return null;

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 transition-all duration-200 ease-out ${
        isAnimating
          ? 'translate-y-0 opacity-100'
          : 'translate-y-full opacity-0'
      }`}
    >
      <div className="bg-dark-secondary/95 backdrop-blur-lg border-t border-dark-border shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2 sm:py-3">
          {/* Mobile: stacked, Desktop: single row with 3 sections */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            {/* Left: Selection info */}
            <div className="flex items-center gap-3 flex-shrink-0">
              {/* Checkmark icon - hidden on mobile */}
              <div className="hidden sm:flex w-8 h-8 rounded-full bg-accent/20 items-center justify-center">
                <svg className="w-4 h-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>

              {/* Selection count */}
              <div className="text-sm whitespace-nowrap">
                <span className="text-text-primary font-semibold">{selectedCount}</span>
                <span className="text-text-secondary"> selected</span>
              </div>
            </div>

            {/* Center: Select All / Clear buttons */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {!hideSelectControls && totalCount > 0 && (
                <button
                  onClick={onSelectAll}
                  className="px-3 py-1.5 text-sm bg-dark-tertiary hover:bg-dark-hover text-text-primary rounded-lg transition-colors whitespace-nowrap"
                >
                  All ({totalCount})
                </button>
              )}
              {!hideSelectControls && selectedCount > 0 && (
                <button
                  onClick={onClear}
                  className="px-3 py-1.5 text-sm bg-dark-tertiary hover:bg-dark-hover text-text-secondary rounded-lg transition-colors"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Right: Action buttons - push to right on desktop */}
            {actions.length > 0 && (
              <div className="flex items-center gap-2 sm:ml-auto overflow-x-auto pb-1 sm:pb-0 -mx-1 px-1 sm:mx-0 sm:px-0">
                {actions.map((action, index) => {
                  const variantClasses = {
                    primary: 'bg-accent hover:bg-accent-hover text-white font-medium',
                    danger: 'bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300',
                    warning: 'bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 hover:text-yellow-300',
                    success: 'bg-green-500/10 hover:bg-green-500/20 text-green-400 hover:text-green-300',
                    default: 'bg-dark-tertiary hover:bg-dark-hover text-text-primary'
                  };
                  const variant = action.variant || (action.danger ? 'danger' : action.primary ? 'primary' : 'default');

                  return (
                    <button
                      key={index}
                      onClick={action.onClick}
                      disabled={action.disabled}
                      className={`flex-shrink-0 px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap ${variantClasses[variant]}`}
                    >
                      {action.icon && <span className="w-4 h-4">{action.icon}</span>}
                      <span>{action.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
