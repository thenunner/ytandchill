import { Link, useLocation } from 'react-router-dom';
import { ChannelsIcon, LibraryIcon, QueueIcon, SettingsIcon } from './icons';

/**
 * Shared mobile bottom navigation component
 * Used across all mobile pages for consistent navigation
 *
 * Tabs: Channels, Library, Queue (with badge), Settings
 *
 * @param {number} queueCount - Optional queue count for badge
 * @param {number} reviewCount - Optional review count for Channels badge
 */
export default function MobileBottomNav({ queueCount = 0, reviewCount = 0 }) {
  const location = useLocation();

  const navItems = [
    {
      to: '/',
      icon: ChannelsIcon,
      label: 'Channels',
      badge: reviewCount,
      isActive: location.pathname === '/' || location.pathname.startsWith('/channel/')
    },
    {
      to: '/library',
      icon: LibraryIcon,
      label: 'Library',
      isActive: location.pathname === '/library' || location.pathname.startsWith('/playlist/')
    },
    {
      to: '/queue',
      icon: QueueIcon,
      label: 'Queue',
      badge: queueCount,
      isActive: location.pathname === '/queue'
    },
    {
      to: '/settings',
      icon: SettingsIcon,
      label: 'Settings',
      isActive: location.pathname === '/settings'
    }
  ];

  return (
    <nav className="flex items-center justify-around py-2 px-1 border-t border-dark-border bg-dark-secondary safe-area-bottom">
      {navItems.map(({ to, icon: Icon, label, badge, isActive }) => (
        <Link
          key={to}
          to={to}
          className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg relative min-w-[60px] ${
            isActive ? 'text-accent-text' : 'text-text-secondary'
          }`}
        >
          <Icon className="w-5 h-5" />
          <span className="text-[10px] font-medium">{label}</span>
          {badge > 0 && (
            <span className="absolute top-0 right-1 bg-accent text-dark-primary text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1">
              {badge > 99 ? '99+' : badge}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
