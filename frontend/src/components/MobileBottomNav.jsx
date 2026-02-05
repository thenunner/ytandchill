import { useState, useRef, useEffect, memo, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChannelsIcon, LibraryIcon, QueueIcon, SettingsIcon, HeartIcon, HistoryIcon } from './Icons';
import { useClickOutside } from '../hooks/useClickOutside';

// User/Me icon
const UserIcon = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

/**
 * Shared mobile bottom navigation component
 * Memoized to prevent unnecessary re-renders when parent state changes
 *
 * Tabs: Channels, Library, Favs, Queue (with badge), Me (popup with Settings/Watch History)
 *
 * @param {number} queueCount - Optional queue count for badge
 * @param {number} reviewCount - Optional review count for Channels badge
 * @param {boolean} hasFavoritesWithNew - Optional flag for favorites dot indicator
 */
export default memo(function MobileBottomNav({ queueCount = 0, reviewCount = 0, hasFavoritesWithNew = false }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [showMePopup, setShowMePopup] = useState(false);
  const popupRef = useRef(null);

  // Close popup when clicking outside
  const closePopup = useCallback(() => setShowMePopup(false), []);
  useClickOutside(popupRef, closePopup, showMePopup);

  // Close popup on navigation
  useEffect(() => {
    setShowMePopup(false);
  }, [location.pathname]);

  const navItems = [
    {
      to: '/',
      icon: ChannelsIcon,
      label: 'Discover',
      badge: reviewCount,
      isActive: location.pathname === '/' || location.pathname.startsWith('/discover/')
    },
    {
      to: '/library',
      icon: LibraryIcon,
      label: 'Library',
      isActive: location.pathname === '/library' || location.pathname.startsWith('/playlist/') || location.pathname.startsWith('/library/channel/')
    },
    {
      to: '/favs',
      icon: HeartIcon,
      label: 'Favs',
      hasDot: hasFavoritesWithNew,
      isActive: location.pathname === '/favs'
    },
    {
      to: '/queue',
      icon: QueueIcon,
      label: 'Queue',
      badge: queueCount,
      isActive: location.pathname === '/queue'
    }
  ];

  const isMeActive = location.pathname === '/settings' || location.pathname === '/history';

  return (
    <nav className="MobileBottomNav flex items-center justify-around py-2 px-1 border-t border-dark-border bg-dark-secondary safe-area-bottom">
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
          {badge > 0 && (
            <span className="absolute top-0 right-0.5 bg-accent text-dark-primary text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1">
              {badge > 99 ? '99+' : badge}
            </span>
          )}
          {hasDot && (
            <span className="absolute top-0.5 right-2 w-2 h-2 bg-accent rounded-full" />
          )}
        </Link>
      ))}

      {/* Me button with popup */}
      <div className="relative" ref={popupRef}>
        <button
          onClick={() => setShowMePopup(!showMePopup)}
          className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg relative min-w-[52px] ${
            isMeActive ? 'text-accent-text' : 'text-text-secondary'
          }`}
        >
          <UserIcon className="w-5 h-5" />
          <span className="text-[10px] font-medium">Me</span>
        </button>

        {/* Popup menu */}
        {showMePopup && (
          <div className="absolute bottom-full right-0 mb-2 w-40 bg-dark-secondary border border-dark-border rounded-lg shadow-lg overflow-hidden z-50">
            <button
              onClick={() => {
                navigate('/settings');
                setShowMePopup(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                location.pathname === '/settings'
                  ? 'bg-accent/20 text-accent-text'
                  : 'text-text-primary hover:bg-dark-hover'
              }`}
            >
              <SettingsIcon className="w-5 h-5" />
              <span className="text-sm font-medium">Settings</span>
            </button>
            <button
              onClick={() => {
                navigate('/history');
                setShowMePopup(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                location.pathname === '/history'
                  ? 'bg-accent/20 text-accent-text'
                  : 'text-text-primary hover:bg-dark-hover'
              }`}
            >
              <HistoryIcon className="w-5 h-5" />
              <span className="text-sm font-medium">Watch History</span>
            </button>
          </div>
        )}
      </div>
    </nav>
  );
});
