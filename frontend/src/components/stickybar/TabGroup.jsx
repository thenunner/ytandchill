/**
 * TabGroup - Tab buttons with optional counts
 *
 * @param {Array} tabs - Array of { id, label, count? } objects
 * @param {string} active - Currently active tab ID
 * @param {Function} onChange - Callback when tab changes (receives tab id)
 * @param {boolean} showCountOnActive - Only show count on active tab (default: true)
 * @param {boolean} hideCountOnMobile - Hide counts on mobile (default: false)
 * @param {string} className - Additional classes for container
 */
export default function TabGroup({
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
