import { Link, useLocation } from 'react-router-dom';

/**
 * Reusable navigation item component
 * Used in both desktop navigation and mobile kebab menu
 *
 * @param {string} to - Route path
 * @param {React.ReactNode} icon - Icon element
 * @param {string} label - Text label
 * @param {number} badge - Badge count (shows red circle with number)
 * @param {boolean} indicator - Shows a small dot indicator (e.g., for updates available)
 * @param {Function} onClick - Click handler
 * @param {boolean} isButton - Render as button instead of Link
 * @param {string} className - Additional CSS classes
 */
function NavItem({ to, icon, label, badge, indicator, onClick, isButton = false, className = '' }) {
  const location = useLocation();
  const isActive = to && location.pathname === to;

  const baseClasses = `nav-tab ${isActive ? 'active' : ''} ${className}`;

  // Indicator dot component
  const IndicatorDot = indicator && (
    <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-accent rounded-full ring-2 ring-dark-primary" />
  );

  // If it's a button (like logout), render as button
  if (isButton) {
    return (
      <button onClick={onClick} className={baseClasses}>
        {icon}
        <span>{label}</span>
        {IndicatorDot}
      </button>
    );
  }

  // Otherwise render as Link
  return (
    <Link to={to} onClick={onClick} className={baseClasses}>
      {icon}
      <span>{label}</span>
      {badge > 0 && (
        <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
          {badge}
        </span>
      )}
      {IndicatorDot}
    </Link>
  );
}

export default NavItem;
