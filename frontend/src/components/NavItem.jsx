import { Link, useLocation } from 'react-router-dom';

/**
 * Reusable navigation item component
 * Used in both desktop navigation and mobile kebab menu
 */
function NavItem({ to, icon, label, badge, onClick, isButton = false, className = '' }) {
  const location = useLocation();
  const isActive = to && location.pathname === to;

  const baseClasses = `nav-tab ${isActive ? 'active' : ''} ${className}`;

  // If it's a button (like logout), render as button
  if (isButton) {
    return (
      <button onClick={onClick} className={baseClasses}>
        {icon}
        <span>{label}</span>
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
    </Link>
  );
}

export default NavItem;
