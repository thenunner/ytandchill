import { useEffect, useState } from 'react';
import { useSelectionBar } from '../../contexts/PreferencesContext';

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
  const { setSelectionBarVisible } = useSelectionBar();

  // Handle show/hide with animation
  useEffect(() => {
    if (show) {
      setIsVisible(true);
      setSelectionBarVisible(true);
      // Small delay to trigger animation
      requestAnimationFrame(() => {
        setIsAnimating(true);
      });
    } else {
      setIsAnimating(false);
      setSelectionBarVisible(false);
      // Wait for animation to complete before hiding
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [show, setSelectionBarVisible]);

  // Cleanup on unmount
  useEffect(() => {
    return () => setSelectionBarVisible(false);
  }, [setSelectionBarVisible]);

  if (!isVisible) return null;

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 transition-all duration-200 ease-out ${
        isAnimating
          ? 'translate-y-0 opacity-100'
          : 'translate-y-full opacity-0'
      }`}
    >
      <div className="bg-dark-secondary/95 backdrop-blur-lg border-t border-dark-border shadow-[0_-4px_20px_rgba(0,0,0,0.3)] safe-area-bottom">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-3.5 pb-[15px] sm:py-3">
          {/* Mobile: two-group layout, Desktop: centered */}
          <div className="flex items-center justify-between md:justify-center gap-2 sm:gap-3">
            {/* Left group: count + All + Clear */}
            <div className="flex items-center gap-2 sm:gap-2">
              {/* Selection count - number on mobile, "X Selected" on desktop */}
              <span className="text-base sm:text-sm text-text-primary font-semibold min-w-[1.5rem] text-center">
                <span className="md:hidden">{selectedCount}</span>
                <span className="hidden md:inline">{selectedCount} Selected</span>
              </span>

              {/* All button - hide when all are selected */}
              {!hideSelectControls && totalCount > 0 && selectedCount < totalCount && (
                <button
                  onClick={onSelectAll}
                  className="px-2.5 sm:px-3 py-2.5 sm:py-1.5 text-sm sm:text-sm bg-dark-tertiary hover:bg-dark-hover text-text-primary rounded-lg transition-colors"
                >
                  All
                </button>
              )}

              {/* Clear button - only show when items selected */}
              {!hideSelectControls && selectedCount > 0 && (
                <button
                  onClick={onClear}
                  className="px-2.5 sm:px-3 py-2.5 sm:py-1.5 text-sm sm:text-sm bg-dark-tertiary hover:bg-dark-hover text-text-secondary rounded-lg transition-colors"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Right group: actions + Done */}
            <div className="flex items-center gap-2 sm:gap-2">
              {actions.map((action, index) => {
                const variantClasses = {
                  primary: 'bg-accent hover:bg-accent-hover !text-white font-medium',
                  accent: 'bg-accent/20 hover:bg-accent/30 text-accent-text border border-accent/40 font-medium',
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
                    className={`px-2.5 sm:px-3 py-2.5 sm:py-1.5 text-sm sm:text-sm rounded-lg transition-colors flex items-center gap-1 disabled:opacity-75 disabled:cursor-not-allowed whitespace-nowrap ${variantClasses[variant]}`}
                    {...(action.dataAttrs || {})}
                  >
                    {action.icon && <span className="w-4 h-4">{action.icon}</span>}
                    <span>{action.label}</span>
                  </button>
                );
              })}

              {/* Done button */}
              {!hideDone && onDone && (
                <button
                  onClick={onDone}
                  className="px-3 sm:px-4 py-2.5 sm:py-1.5 text-sm sm:text-sm bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-colors"
                >
                  Done
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
