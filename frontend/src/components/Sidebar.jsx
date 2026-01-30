import { useState, memo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQueue, useFavoriteChannels, useSettings } from '../api/queries';
import {
  SettingsIcon, ChannelsIcon, LibraryIcon, QueueIcon, LogoutIcon,
  MenuIcon, CollapseIcon, HeartIcon, HistoryIcon
} from './Icons';

/**
 * Shared Sidebar component used across all pages
 * Memoized to prevent unnecessary re-renders when parent state changes
 *
 * @param {boolean} collapsed - Whether sidebar is collapsed
 * @param {function} onToggle - Callback to toggle collapsed state
 * @param {number} reviewCount - Badge count for Channels (videos to review)
 */
export default memo(function Sidebar({ collapsed, onToggle, reviewCount = 0 }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [logoFailed, setLogoFailed] = useState(false);

  // Fetch queue count for badge
  const { data: queueData } = useQueue({});
  const queueCount = queueData?.queue_items?.length || 0;

  // Fetch favorite channels and settings for filtering
  const { data: favoriteLibrariesRaw } = useFavoriteChannels();
  const { data: settings } = useSettings();

  // Filter favorites based on hide_empty_libraries setting
  const hideEmptyLibraries = settings?.hide_empty_libraries === 'true';
  const favoriteLibraries = (favoriteLibrariesRaw || []).filter(ch => {
    if (hideEmptyLibraries && (ch.downloaded_count || 0) === 0) {
      return false;
    }
    return true;
  });

  // Handle logout
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
      window.location.replace('/login');
    } catch (error) {
      console.error('Logout failed:', error);
      window.location.replace('/login');
    }
  };

  // Sidebar nav item component
  const SidebarNavLink = ({ to, icon, label, badge, onClick, isButton = false }) => {
    // /discover/:id is part of Discover, /library/channel/:id is part of Library
    const isActive = location.pathname === to ||
      (to === '/' && location.pathname.startsWith('/discover/')) ||
      (to === '/library' && (location.pathname.startsWith('/playlist/') || location.pathname.startsWith('/library/channel/')));

    const baseClasses = `relative flex items-center rounded-lg transition-colors ${
      collapsed ? 'justify-center p-2' : 'gap-3 px-3 py-2.5'
    } ${
      isActive
        ? 'bg-accent/20 text-accent-text'
        : 'text-text-secondary hover:bg-dark-hover hover:text-text-primary'
    }`;

    // Handle click - if already in this section, navigate to main page
    const handleClick = (e) => {
      if (isActive && location.pathname !== to) {
        e.preventDefault();
        navigate(to);
      }
      if (onClick) onClick(e);
    };

    if (isButton) {
      return (
        <button onClick={handleClick} className={baseClasses} title={label}>
          {icon}
          {!collapsed && <span className="text-sm font-medium">{label}</span>}
        </button>
      );
    }

    return (
      <Link to={to} onClick={handleClick} className={baseClasses} title={label}>
        {icon}
        {!collapsed && (
          <>
            <span className="text-sm font-medium">{label}</span>
            {badge > 0 && (
              <span className="ml-auto bg-accent text-dark-primary text-xs font-bold px-2 py-0.5 rounded-full">
                {badge}
              </span>
            )}
          </>
        )}
        {collapsed && badge > 0 && (
          <span className="absolute -top-1 -right-1 bg-accent text-dark-primary text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <nav
      className={`hidden md:flex flex-col bg-dark-secondary border-r border-dark-border transition-all duration-200 ${
        collapsed ? 'w-16' : 'w-52'
      }`}
    >
      {/* Header - Logo and Toggle Button */}
      <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} p-2 border-b border-dark-border`}>
        {!collapsed && (
          <div className="flex-1 flex items-center">
            {!logoFailed ? (
              <img
                src="/logo.png"
                alt="YT and Chill"
                className="h-10 w-auto object-contain"
                onError={() => setLogoFailed(true)}
              />
            ) : (
              <span className="text-sm font-medium text-text-secondary">YTandChill</span>
            )}
          </div>
        )}
        <button
          onClick={onToggle}
          className="p-2 rounded-lg text-text-secondary hover:bg-dark-hover hover:text-text-primary transition-colors flex-shrink-0"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <MenuIcon className="w-5 h-5" /> : <CollapseIcon className="w-5 h-5" />}
        </button>
      </div>

      {/* Main Navigation */}
      {collapsed ? (
        // Collapsed view - flat structure
        <div className="flex-1 flex flex-col items-center gap-1 py-2 overflow-y-auto">
          <SidebarNavLink to="/" icon={<ChannelsIcon className="w-7 h-7" />} label="Discover" badge={reviewCount} />
          <SidebarNavLink to="/library" icon={<LibraryIcon className="w-7 h-7" />} label="Library" />
          <SidebarNavLink to="/queue" icon={<QueueIcon className="w-7 h-7" />} label="Queue" badge={queueCount} />

          {/* Watch History */}
          <div className="w-8 border-t border-dark-border my-1" />
          <SidebarNavLink to="/history" icon={<HistoryIcon className="w-7 h-7" />} label="Watch History" />

          {/* Favorites */}
          {favoriteLibraries && favoriteLibraries.length > 0 && (
            <>
              <div className="w-8 border-t border-dark-border my-1" />
              {favoriteLibraries.slice(0, 10).map(channel => (
                <Link
                  key={channel.id}
                  to={`/library/channel/${channel.id}`}
                  className="relative flex items-center justify-center p-2 rounded-lg hover:bg-dark-hover transition-colors"
                  title={channel.title}
                >
                  <div className="w-7 h-7 rounded-full overflow-hidden bg-dark-tertiary flex items-center justify-center">
                    {channel.thumbnail ? (
                      <img
                        src={channel.thumbnail}
                        alt={channel.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-xs font-bold text-text-muted">
                        {channel.title?.charAt(0)?.toUpperCase() || '?'}
                      </span>
                    )}
                  </div>
                  {channel.has_new_videos && (
                    <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-accent" />
                  )}
                </Link>
              ))}
            </>
          )}
        </div>
      ) : (
        // Expanded view
        <div className="flex-1 p-2 space-y-1 overflow-y-auto">
          <SidebarNavLink to="/" icon={<ChannelsIcon className="w-5 h-5" />} label="Discover" badge={reviewCount} />
          <SidebarNavLink to="/library" icon={<LibraryIcon className="w-5 h-5" />} label="Library" />
          <SidebarNavLink to="/queue" icon={<QueueIcon className="w-5 h-5" />} label="Queue" badge={queueCount} />

          {/* Watch History */}
          <div className="pt-3 mt-3 border-t border-dark-border">
            <SidebarNavLink to="/history" icon={<HistoryIcon className="w-5 h-5" />} label="Watch History" />
          </div>

          {/* Favorite Libraries */}
          {favoriteLibraries && favoriteLibraries.length > 0 && (
            <div className="pt-3 mt-3 border-t border-dark-border">
              <div className="flex items-center gap-2 px-3 py-2 text-text-muted">
                <HeartIcon className="w-4 h-4" />
                <span className="text-xs font-medium uppercase tracking-wider">Favorites</span>
              </div>
              <div className="space-y-0.5">
                {favoriteLibraries.map(channel => (
                  <Link
                    key={channel.id}
                    to={`/library/channel/${channel.id}`}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-text-secondary hover:bg-dark-hover hover:text-text-primary transition-colors"
                  >
                    <div className="w-5 h-5 rounded-full overflow-hidden bg-dark-tertiary flex-shrink-0 flex items-center justify-center">
                      {channel.thumbnail ? (
                        <img
                          src={channel.thumbnail}
                          alt={channel.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-xs font-bold text-text-muted">
                          {channel.title?.charAt(0)?.toUpperCase() || '?'}
                        </span>
                      )}
                    </div>
                    <span className={`text-sm truncate flex-1 ${channel.has_new_videos ? 'text-text-primary' : ''}`}>
                      {channel.title}
                    </span>
                    {channel.has_new_videos && (
                      <div className="w-2 h-2 rounded-full bg-accent flex-shrink-0" />
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bottom Links */}
      {collapsed ? (
        <div className="flex flex-col items-center gap-1 p-2 border-t border-dark-border">
          <SidebarNavLink to="/settings" icon={<SettingsIcon className="w-7 h-7" />} label="Settings" />
          <SidebarNavLink isButton onClick={handleLogout} icon={<LogoutIcon className="w-7 h-7" />} label="Logout" />
        </div>
      ) : (
        <div className="p-2 border-t border-dark-border space-y-1">
          <SidebarNavLink to="/settings" icon={<SettingsIcon className="w-5 h-5" />} label="Settings" />
          <SidebarNavLink isButton onClick={handleLogout} icon={<LogoutIcon className="w-5 h-5" />} label="Logout" />
        </div>
      )}
    </nav>
  );
});
