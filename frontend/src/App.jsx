import { Routes, Route, Link, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { useQueue, useHealth, useAuthCheck, useFirstRunCheck } from './api/queries';
import { useNotification } from './contexts/NotificationContext';
import { useTheme } from './contexts/ThemeContext';
import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import api from './api/client';
import Channels from './routes/Channels';
import Library from './routes/Library';
import ChannelLibrary from './routes/ChannelLibrary';
import Playlist from './routes/Playlist';
import Videos from './routes/Videos';
import Queue from './routes/Queue';
import Settings from './routes/Settings';
import Player from './routes/Player';
import PlaylistPlayer from './routes/PlaylistPlayer';
import Setup from './routes/Setup';
import Login from './routes/Login';

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: queueData } = useQueue();
  const { data: health } = useHealth();
  const { notification } = useNotification();
  const { theme } = useTheme();
  const [showQuickLogs, setShowQuickLogs] = useState(false);
  const [logsData, setLogsData] = useState(null);
  const prevOperationTypeRef = useRef(null);
  const [visibleErrorMessage, setVisibleErrorMessage] = useState(null);
  const errorMessageRef = useRef(null);
  const [showKebabMenu, setShowKebabMenu] = useState(false);
  const kebabMenuRef = useRef(null);

  // Check if current theme is a light theme
  const isLightTheme = theme === 'online' || theme === 'pixel' || theme === 'debug';

  // Handle new queue structure (must be defined before useEffect that uses it)
  const queue = queueData?.queue_items || queueData || [];
  const currentDownload = queueData?.current_download || null;
  const currentOperation = queueData?.current_operation || null;
  const delayInfo = queueData?.delay_info || null;
  const isPaused = queueData?.is_paused || false;
  const isAutoRefreshing = queueData?.is_auto_refreshing || false;
  const lastAutoRefresh = queueData?.last_auto_refresh || null;
  const lastErrorMessage = queueData?.last_error_message || null;

  // Poll logs for quick logs panel
  useEffect(() => {
    if (!showQuickLogs) {
      return; // Don't poll logs when panel is closed
    }

    const fetchLogs = async () => {
      try {
        const data = await api.getLogs(500);
        setLogsData(data);
      } catch (error) {
        // Silently fail
      }
    };

    // Immediate fetch
    fetchLogs();

    // Poll every 1 second when logs panel is open
    const interval = setInterval(fetchLogs, 1000);
    return () => clearInterval(interval);
  }, [showQuickLogs]);

  // Auto-clear scan completion message after 10 seconds
  useEffect(() => {
    if (prevOperationTypeRef.current === 'scanning' && currentOperation?.type === 'scan_complete') {
      // Scan just completed - clear message after 10 seconds
      const timer = setTimeout(async () => {
        try {
          await api.clearOperation();
        } catch (error) {
          console.error('Failed to clear operation:', error);
        }
      }, 10000);

      return () => clearTimeout(timer);
    }

    prevOperationTypeRef.current = currentOperation?.type;
  }, [currentOperation?.type]);

  // Auto-hide error message after 10 seconds
  useEffect(() => {
    // When a new error message appears, show it and start fade timer
    if (lastErrorMessage && lastErrorMessage !== errorMessageRef.current) {
      errorMessageRef.current = lastErrorMessage;
      setVisibleErrorMessage(lastErrorMessage);

      // Hide after 10 seconds
      const timer = setTimeout(() => {
        setVisibleErrorMessage(null);
      }, 10000);

      return () => clearTimeout(timer);
    }

    // If backend cleared the error message, hide it immediately
    if (!lastErrorMessage && errorMessageRef.current) {
      errorMessageRef.current = null;
      setVisibleErrorMessage(null);
    }
  }, [lastErrorMessage]);

  // Close kebab menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (kebabMenuRef.current && !kebabMenuRef.current.contains(event.target)) {
        setShowKebabMenu(false);
      }
    };

    if (showKebabMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showKebabMenu]);

  // Auth checks using React Query (following autobrr/qui pattern)
  const { data: firstRunData, isLoading: firstRunLoading, error: firstRunError } = useFirstRunCheck();
  const { data: authData, isLoading: authLoading, error: authError } = useAuthCheck();

  // Derive auth state from queries
  const isFirstRun = firstRunData?.first_run || false;
  const isAuthenticated = authData?.authenticated || false;
  const isLoading = firstRunLoading || authLoading;

  const downloading = queue?.filter(item => item.video?.status === 'downloading').length || 0;
  const pending = queue?.filter(item => item.video?.status === 'queued').length || 0;

  // Get the first queue item with a log message (e.g., rate limit warnings)
  const queueLog = queue?.find(item => item.log)?.log || null;

  // Remember last page on mobile (localStorage persistence)
  useEffect(() => {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isMobile) {
      // Save current path to localStorage whenever it changes
      if (location.pathname !== '/login' && location.pathname !== '/setup' && location.pathname !== '/') {
        localStorage.setItem('last-mobile-path', location.pathname + location.search);
      }
    }
  }, [location.pathname, location.search]);

  // Restore last page on mobile when on root path (only on initial load)
  useEffect(() => {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const hasRestoredPath = sessionStorage.getItem('mobile-path-restored');

    if (isMobile && isAuthenticated && location.pathname === '/' && !hasRestoredPath) {
      const lastPath = localStorage.getItem('last-mobile-path');
      if (lastPath && lastPath !== '/') {
        navigate(lastPath, { replace: true });
        sessionStorage.setItem('mobile-path-restored', 'true');
      }
    }
  }, [isAuthenticated, location.pathname, navigate]);

  // Auto-navigate to queue tab on initial app load if there are queue items
  useEffect(() => {
    // Only auto-navigate once per browser session (on first load)
    const hasAutoNavigated = sessionStorage.getItem('queue-auto-nav');

    if (!hasAutoNavigated && location.pathname === '/' && (pending > 0 || downloading > 0)) {
      navigate('/queue');
      sessionStorage.setItem('queue-auto-nav', 'true');
    }
  }, [location.pathname, pending, downloading, navigate]);

  const navLinks = [
    {
      path: '/',
      label: 'Channels',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 2H3v16h5v4l4-4h5l4-4V2zm-10 9V7m5 4V7"></path>
        </svg>
      )
    },
    {
      path: '/library',
      label: 'Library',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
        </svg>
      )
    },
    {
      path: '/videos',
      label: 'Videos',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="16" y1="13" x2="8" y2="13"></line>
          <line x1="16" y1="17" x2="8" y2="17"></line>
          <polyline points="10 9 9 9 8 9"></polyline>
        </svg>
      )
    },
    {
      path: '/queue',
      label: 'Queue',
      badge: pending + downloading,
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
      )
    },
  ];

  // Show loading screen while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-primary">
        <div className="text-text-secondary">Loading...</div>
      </div>
    );
  }

  // Redirect to setup if first run
  if (isFirstRun && location.pathname !== '/setup') {
    return <Navigate to="/setup" replace />;
  }

  // Hide navigation on setup/login pages
  const isAuthPage = location.pathname === '/setup' || location.pathname === '/login';

  // Handle logout
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
      // Redirect to login page
      window.location.replace('/login');
    } catch (error) {
      console.error('Logout failed:', error);
      // Still redirect even if request fails
      window.location.replace('/login');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-dark-primary">
      {/* Top Navigation Bar - Hidden on setup/login pages */}
      {!isAuthPage && (
        <header className="bg-dark-primary/95 backdrop-blur-lg sticky top-0 z-50 border-b border-dark-border">
          <div className="max-w-screen-2xl mx-auto px-6 lg:px-12 xl:px-16">
        {/* Main Nav Row */}
        <div className="flex items-center justify-center gap-1 md:gap-2 h-[60px]">
          {/* Nav Tabs - Compact on mobile (text only), icons on desktop */}
          <nav className="flex gap-1 md:gap-2">
            {navLinks.map(link => (
              <Link
                key={link.path}
                to={link.path}
                className={`nav-tab snap-start flex-shrink-0 ${link.iconOnly ? 'px-3' : 'px-3 md:px-4'} ${location.pathname === link.path ? 'active' : ''}`}
              >
                {/* Icon: show always for iconOnly tabs, otherwise only on desktop */}
                {link.iconOnly ? (
                  link.icon
                ) : (
                  <span className="hidden md:inline-flex">{link.icon}</span>
                )}
                {/* Label: hidden for iconOnly tabs, always shown for others */}
                {!link.iconOnly && <span>{link.label}</span>}
                {link.badge > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                    {link.badge}
                  </span>
                )}
              </Link>
            ))}
          </nav>

          {/* Settings Tab - Hidden on mobile, shown on desktop/tablet */}
          <Link
            to="/settings"
            className={`nav-tab hidden md:flex ${location.pathname === '/settings' ? 'active' : ''}`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
            <span>Settings</span>
          </Link>

          {/* Logout Tab - Hidden on mobile, shown on desktop/tablet */}
          <button
            onClick={handleLogout}
            className="nav-tab hidden md:flex"
            title="Logout"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            <span>Logout</span>
          </button>

          {/* Kebab Menu (Settings + Logout) - Mobile only */}
          <div className="relative flex-shrink-0 md:hidden" ref={kebabMenuRef}>
            <button
              onClick={() => setShowKebabMenu(!showKebabMenu)}
              className={`flex items-center justify-center p-2 rounded-lg transition-colors ${
                showKebabMenu
                  ? 'bg-dark-tertiary text-text-primary'
                  : 'bg-dark-secondary text-text-secondary hover:bg-dark-tertiary'
              }`}
              title="More options"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="2"></circle>
                <circle cx="12" cy="12" r="2"></circle>
                <circle cx="12" cy="19" r="2"></circle>
              </svg>
            </button>

            {/* Dropdown Menu */}
            {showKebabMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-dark-secondary border border-dark-border rounded-lg shadow-xl py-1 z-50">
                <Link
                  to="/settings"
                  onClick={() => setShowKebabMenu(false)}
                  className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-dark-hover transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                  Settings
                </Link>
                <button
                  onClick={handleLogout}
                  className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-dark-hover transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                    <polyline points="16 17 21 12 16 7"></polyline>
                    <line x1="21" y1="12" x2="9" y2="12"></line>
                  </svg>
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Navigation tabs only - status bar moved to footer */}
          </div>
      </header>
      )}

      {/* Main Content */}
      <main className={`flex-1 w-full ${isAuthPage ? '' : 'px-6 lg:px-12 xl:px-16 pb-2'}`}>
        <Routes>
          <Route path="/setup" element={<Setup />} />
          <Route path="/login" element={<Login />} />
          <Route path="/" element={isAuthenticated ? <Channels /> : <Navigate to="/login" replace />} />
          <Route path="/videos" element={isAuthenticated ? <Videos /> : <Navigate to="/login" replace />} />
          <Route path="/library" element={isAuthenticated ? <Library /> : <Navigate to="/login" replace />} />
          <Route path="/channel/:channelId" element={isAuthenticated ? <ChannelLibrary /> : <Navigate to="/login" replace />} />
          <Route path="/channel/:channelId/library" element={isAuthenticated ? <ChannelLibrary /> : <Navigate to="/login" replace />} />
          <Route path="/playlist/:id" element={isAuthenticated ? <Playlist /> : <Navigate to="/login" replace />} />
          <Route path="/queue" element={isAuthenticated ? <Queue /> : <Navigate to="/login" replace />} />
          <Route path="/settings" element={isAuthenticated ? <Settings /> : <Navigate to="/login" replace />} />
          <Route path="/player/:videoId" element={isAuthenticated ? <Player /> : <Navigate to="/login" replace />} />
          <Route path="/play/playlist/:playlistId" element={isAuthenticated ? <PlaylistPlayer /> : <Navigate to="/login" replace />} />
          <Route path="/play/category/:categoryId" element={isAuthenticated ? <PlaylistPlayer /> : <Navigate to="/login" replace />} />
        </Routes>
      </main>

      {/* Footer Status Bar - Hidden on auth pages and mobile */}
      {!isAuthPage && (downloading > 0 || pending > 0 || currentOperation?.type === 'scan_complete' || currentOperation?.type === 'scanning' || notification || isAutoRefreshing || delayInfo || visibleErrorMessage || health) && (
        <footer className="hidden md:block bg-dark-primary sticky bottom-0 z-50 pb-safe">
          {/* Quick Logs Slide-UP Panel - Hidden on mobile */}
          <div
            className={`overflow-hidden transition-all duration-300 ease-in-out hidden md:block ${
              showQuickLogs ? 'max-h-64 opacity-100' : 'max-h-0 opacity-0'
            }`}
          >
            <div className={`${isLightTheme ? 'bg-gray-800' : 'bg-dark-primary'} shadow-lg`}>
              <div className="px-4 py-3 max-h-48 md:max-h-64 overflow-auto font-mono text-xs">
                {logsData?.logs && logsData.logs.length > 0 ? (
                  <div className="space-y-0.5">
                    {logsData.logs.slice(-10).map((line, index) => {
                      // Parse log line to color only the [LEVEL] part
                      const baseTextColor = 'text-white';
                      const levelMatch = line.match(/^(.* - )(\[(?:ERROR|WARNING|INFO|API|DEBUG)\])( - .*)$/);

                      if (levelMatch) {
                        const [, before, level, after] = levelMatch;
                        const levelColor =
                          level.includes('ERROR') ? 'text-red-400' :
                          level.includes('WARNING') ? 'text-yellow-400' :
                          level.includes('INFO') ? 'text-blue-400' :
                          level.includes('API') ? 'text-purple-400' :
                          level.includes('DEBUG') ? 'text-gray-400' :
                          baseTextColor;

                        return (
                          <div key={index} className={baseTextColor}>
                            {before}<span className={levelColor}>{level}</span>{after}
                          </div>
                        );
                      }

                      return (
                        <div key={index} className={baseTextColor}>
                          {line}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-text-muted text-center py-4">
                    No logs available
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Status Bar Row */}
          <div className="px-4 py-2 bg-dark-secondary/50 backdrop-blur-sm relative">
            <div className="flex items-center justify-between text-sm font-mono">
              <div className="flex items-center gap-2 text-text-secondary overflow-x-auto scrollbar-hide scroll-smooth whitespace-nowrap flex-1">
                {/* Log button - Hidden on mobile, visible on tablet+ */}
                <button
                  onClick={() => setShowQuickLogs(!showQuickLogs)}
                  className="font-semibold text-text-primary hover:text-accent-text transition-colors cursor-pointer hidden md:flex items-center gap-1"
                  title="Click to view recent logs"
                >
                  Status:
                  <svg className={`w-3 h-3 transition-transform ${showQuickLogs ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </button>

                {/* Queue Count - Only show when not actively downloading */}
                {(pending > 0 || downloading > 0) && !currentDownload && (
                  <span className="text-text-secondary flex-shrink-0">
                    [<span className="text-text-muted font-bold">{pending + downloading}</span> queued]
                  </span>
                )}

                {/* Notification Message - Highest Priority */}
                {notification && (
                  <div className="flex items-center gap-2 animate-fade-in flex-shrink-0">
                    {notification.type === 'success' && (
                      <svg className="w-4 h-4 text-accent-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    )}
                    {notification.type === 'error' && (
                      <svg className="w-4 h-4 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="15" y1="9" x2="9" y2="15"></line>
                        <line x1="9" y1="9" x2="15" y2="15"></line>
                      </svg>
                    )}
                    {notification.type === 'info' && (
                      <svg className="w-4 h-4 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M12 16v-4"></path>
                        <path d="M12 8h.01"></path>
                      </svg>
                    )}
                    <span className={`font-medium ${
                      notification.type === 'success' ? 'text-accent-text' :
                      notification.type === 'error' ? 'text-red-400' :
                      'text-blue-400'
                    }`}>
                      {notification.message}
                    </span>
                  </div>
                )}

                {/* Scan Completion Message - Second Priority */}
                {!notification && currentOperation?.type === 'scan_complete' && currentOperation?.message && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <svg className="w-4 h-4 text-accent-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span className="text-accent-text font-medium">
                      {currentOperation.message}
                    </span>
                  </div>
                )}

                {/* Active Scan Status - Third Priority */}
                {!notification && currentOperation?.type === 'scanning' && currentOperation?.message && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-accent rounded-full animate-pulse"></span>
                      <span className="w-2 h-2 bg-accent rounded-full animate-pulse [animation-delay:0.2s]"></span>
                      <span className="w-2 h-2 bg-accent rounded-full animate-pulse [animation-delay:0.4s]"></span>
                    </div>
                    <span className="text-accent-text">
                      {currentOperation.message}
                    </span>
                    {/* Loading spinner after scan message */}
                    <div className="animate-spin h-4 w-4 border-2 border-accent-text border-t-transparent rounded-full"></div>
                  </div>
                )}

                {/* Queue Paused Message */}
                {!notification && currentOperation?.type !== 'scan_complete' && currentOperation?.type !== 'scanning' && isPaused && pending > 0 && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <svg className="w-4 h-4 text-yellow-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="6" y="4" width="4" height="16"></rect>
                      <rect x="14" y="4" width="4" height="16"></rect>
                    </svg>
                    <span className="text-yellow-400">
                      {queueLog || 'Queue paused. Press Resume to continue.'}
                    </span>
                  </div>
                )}

                {/* Last Error Message (auto-fades after 10 seconds) */}
                {visibleErrorMessage && !notification && currentOperation?.type !== 'scan_complete' && currentOperation?.type !== 'scanning' && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <svg className="w-4 h-4 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="12" y1="8" x2="12" y2="12"></line>
                      <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    <span className="text-red-400">{visibleErrorMessage}</span>
                  </div>
                )}

                {/* Download Progress with Details */}
                {!notification && currentOperation?.type !== 'scan_complete' && currentOperation?.type !== 'scanning' && !isPaused && currentDownload && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* First bracket: queue count, speed, ETA */}
                    <span className="text-text-secondary">
                      [<span className="text-text-muted font-bold">{pending + downloading}</span> queued
                      {currentDownload.speed_bps > 0 && (
                        <span> / <span className="text-text-primary">{(currentDownload.speed_bps / 1024 / 1024).toFixed(1)} MB/s</span></span>
                      )}
                      {currentDownload.eta_seconds > 0 && (
                        <span> ETA: <span className="text-text-primary">{Math.floor(currentDownload.eta_seconds / 60)}:{Math.floor(currentDownload.eta_seconds % 60).toString().padStart(2, '0')}</span></span>
                      )}]
                    </span>
                    {/* Second bracket: per-video progress */}
                    <span className="text-text-secondary">
                      [<span className="text-accent-text font-bold">{Math.round(currentDownload.progress_pct)}%</span>/100%]
                    </span>
                  </div>
                )}

                {/* Regular Download Count (if no detailed progress) */}
                {!notification && currentOperation?.type !== 'scan_complete' && currentOperation?.type !== 'scanning' && !currentDownload && downloading > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-accent rounded-full animate-pulse"></span>
                      <span className="w-2 h-2 bg-accent rounded-full animate-pulse [animation-delay:0.2s]"></span>
                      <span className="w-2 h-2 bg-accent rounded-full animate-pulse [animation-delay:0.4s]"></span>
                    </div>
                    <span className="text-text-primary">
                      Downloading <span className="text-accent-text font-bold">{downloading}</span> video{downloading > 1 ? 's' : ''}
                    </span>
                  </div>
                )}

                {/* Delay Info - Show between downloads */}
                {!notification && currentOperation?.type !== 'scan_complete' && currentOperation?.type !== 'scanning' && !currentDownload && downloading === 0 && delayInfo && (
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-orange-400 rounded-full animate-pulse"></span>
                      <span className="w-2 h-2 bg-orange-400 rounded-full animate-pulse [animation-delay:0.2s]"></span>
                      <span className="w-2 h-2 bg-orange-400 rounded-full animate-pulse [animation-delay:0.4s]"></span>
                    </div>
                    <span className="text-orange-400">{delayInfo}</span>
                  </div>
                )}

                {/* Auto-refresh Status */}
                {!notification && currentOperation?.type !== 'scan_complete' && currentOperation?.type !== 'scanning' && !currentDownload && !delayInfo && isAutoRefreshing && (
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></span>
                      <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse [animation-delay:0.2s]"></span>
                      <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse [animation-delay:0.4s]"></span>
                    </div>
                    <span className="text-yellow-400">Auto-refreshing channels...</span>
                  </div>
                )}

                {!notification && currentOperation?.type !== 'scan_complete' && currentOperation?.type !== 'scanning' && !currentDownload && !delayInfo && !isAutoRefreshing && !isPaused && downloading === 0 && health?.auto_refresh_enabled && (
                  <span className="text-text-secondary">
                    Auto-refresh <span className="text-accent-text">enabled</span> for {health.auto_refresh_time || '03:00'}
                    {lastAutoRefresh && (
                      <span className="text-text-muted ml-2">
                        (last: {new Date(lastAutoRefresh).toLocaleTimeString()})
                      </span>
                    )}
                  </span>
                )}

                {/* Show idle state if no notification and no activity */}
                {!notification && currentOperation?.type !== 'scan_complete' && currentOperation?.type !== 'scanning' && !currentDownload && downloading === 0 && !delayInfo && !isAutoRefreshing && !health?.auto_refresh_enabled && (
                  <span className="text-accent-text">Idle</span>
                )}
              </div>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}

export default App;
