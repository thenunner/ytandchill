import { Link, useLocation } from 'react-router-dom';
import { ChannelsIcon, LibraryIcon, QueueIcon, SettingsIcon, HeartIcon } from './icons';

/**
 * Shared mobile bottom navigation component
 * Used across all mobile pages for consistent navigation
 *
 * Tabs: Channels, Library, Favs, Queue (with badge), Settings
 *
 * @param {number} queueCount - Optional queue count for badge
 * @param {number} reviewCount - Optional review count for Channels badge
 * @param {boolean} hasFavoritesWithNew - Optional flag for favorites dot indicator
 */
export default function MobileBottomNav({ queueCount = 0, reviewCount = 0, hasFavoritesWithNew = false }) {
  const location = useLocation();

  const navItems = [
    {
      to: '/',
      icon: ChannelsIcon,
      label: 'Channels',
      badge: reviewCount,
      // /channel/:id/library is part of Library, not Channels
      isActive: location.pathname === '/' || (location.pathname.startsWith('/channel/') && !location.pathname.endsWith('/library'))
    },
    {
      to: '/library',
      icon: LibraryIcon,
      label: 'Library',
      // Include /channel/:id/library as part of Library
      isActive: location.pathname === '/library' || location.pathname.startsWith('/playlist/') || location.pathname.endsWith('/library')
    },
    {
      to: '/favs',
      icon: HeartIcon,
      label: 'Favs',
      hasDot: hasFavoritesWithNew, // Dot indicator (not number badge)
      isActive: location.pathname === '/favs'
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
      {navItems.map(({ to, icon: Icon, label, badge, hasDot, isActive }) => (
        <Link
          key={to}
          to={to}
          className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg relative min-w-[52px] ${
            isActive ? 'text-accent-text' : 'text-text-secondary'
          }`}
        >
          <Icon className="w-5 h-5" filled={isActive && label === 'Favs'} />
          <span className="text-[10px] font-medium">{label}</span>
          {/* Number badge for queue/channels */}
          {badge > 0 && (
            <span className="absolute top-0 right-0.5 bg-accent text-dark-primary text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1">
              {badge > 99 ? '99+' : badge}
            </span>
          )}
          {/* Dot indicator for favs */}
          {hasDot && (
            <span className="absolute top-0.5 right-2 w-2 h-2 bg-accent rounded-full" />
          )}
        </Link>
      ))}
    </nav>
  );
}
