import { Routes, Route, Link, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { useQueue, useHealth, useAuthCheck, useFirstRunCheck } from './api/queries';
import { useNotification } from './contexts/NotificationContext';
import { useTheme } from './contexts/ThemeContext';
import { useEffect, useState, useMemo, useRef } from 'react';
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
import Import from './routes/Import';
import NavItem from './components/NavItem';
import ErrorBoundary from './components/ErrorBoundary';
import UpdateModal from './components/UpdateModal';
import UpdateBanner from './components/UpdateBanner';
import Toast from './components/Toast';
import { SettingsIcon } from './components/icons';
import { version as APP_VERSION } from '../package.json';

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: queueData } = useQueue();
  const { data: health } = useHealth();
  const { showNotification, removeToast } = useNotification();
  const { theme } = useTheme();
  const [showKebabMenu, setShowKebabMenu] = useState(false);
  const kebabMenuRef = useRef(null);
  const clearingCookieWarningRef = useRef(false);

  // Update modal state
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [latestVersion, setLatestVersion] = useState(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Track if user has interacted (navigated) since last check
  const previousPathRef = useRef(location.pathname);

  // Refs for tracking previous states (to detect changes)
  const prevOperationRef = useRef(null);
  const prevErrorRef = useRef(null);
  const prevCookieWarningRef = useRef(null);
  const prevDelayInfoRef = useRef(null);
  const prevIsPausedRef = useRef(false);
  const prevDownloadRef = useRef(null);

  // Update latest version from health API (populated by backend scan operations)
  useEffect(() => {
    if (health?.latest_version) {
      const latest = health.latest_version;
      setLatestVersion(latest);

      if (latest && latest !== APP_VERSION && latest > APP_VERSION) {
        setUpdateAvailable(true);
        const dismissedBannerVersion = localStorage.getItem('updateBannerDismissedVersion');
        setBannerDismissed(dismissedBannerVersion === latest);
      }
    }
  }, [health?.latest_version]);

  // Show update modal on route change when update is available and not dismissed
  useEffect(() => {
    if (location.pathname === previousPathRef.current) {
      return;
    }
    previousPathRef.current = location.pathname;

    if (updateAvailable && latestVersion) {
      const dismissedVersion = localStorage.getItem('dismissedUpdateVersion');
      if (dismissedVersion !== latestVersion) {
        setShowUpdateModal(true);
      }
    }
  }, [location.pathname, updateAvailable, latestVersion]);

  // Handle update modal close
  const handleUpdateModalClose = () => {
    setShowUpdateModal(false);
    if (latestVersion) {
      localStorage.setItem('dismissedUpdateVersion', latestVersion);
    }
  };

  // Handle update banner dismiss
  const handleBannerDismiss = () => {
    setBannerDismissed(true);
    if (latestVersion) {
      localStorage.setItem('updateBannerDismissedVersion', latestVersion);
    }
  };

  // Handle new queue structure
  const queue = queueData?.queue_items || queueData || [];
  const currentDownload = queueData?.current_download || null;
  const currentOperation = queueData?.current_operation || null;
  const delayInfo = queueData?.delay_info || null;
  const isPaused = queueData?.is_paused || false;
  const lastErrorMessage = queueData?.last_error_message || null;
  const cookieWarning = queueData?.cookie_warning_message || null;

  // === TOAST NOTIFICATIONS ===

  // Scan completion toast
  useEffect(() => {
    if (currentOperation?.type === 'scan_complete' && currentOperation?.message) {
      if (prevOperationRef.current?.type !== 'scan_complete') {
        showNotification(currentOperation.message, 'success');
        // Clear the operation after showing toast
        api.clearOperation().catch(() => {});
      }
    }
    prevOperationRef.current = currentOperation;
  }, [currentOperation, showNotification]);

  // Active scanning toast
  useEffect(() => {
    if (currentOperation?.type === 'scanning' && currentOperation?.message) {
      showNotification(currentOperation.message, 'scanning', { id: 'scanning', persistent: true });
    } else if (prevOperationRef.current?.type === 'scanning') {
      // Remove scanning toast when done
      removeToast('scanning');
    }
  }, [currentOperation, showNotification, removeToast]);

  // Error message toast
  useEffect(() => {
    if (lastErrorMessage && lastErrorMessage !== prevErrorRef.current) {
      showNotification(lastErrorMessage, 'error');
    }
    prevErrorRef.current = lastErrorMessage;
  }, [lastErrorMessage, showNotification]);

  // Cookie warning toast
  useEffect(() => {
    if (cookieWarning && cookieWarning !== prevCookieWarningRef.current) {
      showNotification(cookieWarning, 'warning', { id: 'cookie-warning', persistent: true });
    } else if (!cookieWarning && prevCookieWarningRef.current) {
      removeToast('cookie-warning');
    }
    prevCookieWarningRef.current = cookieWarning;
  }, [cookieWarning, showNotification, removeToast]);

  // Clear cookie warning on navigation
  useEffect(() => {
    if (cookieWarning) {
      const clearWarning = async () => {
        if (clearingCookieWarningRef.current) return;
        clearingCookieWarningRef.current = true;
        try {
          await fetch('/api/cookie-warning/clear', { method: 'POST', credentials: 'include' });
        } catch (error) {
          console.error('Failed to clear cookie warning:', error);
        }
        setTimeout(() => { clearingCookieWarningRef.current = false; }, 1000);
      };
      clearWarning();
    }
  }, [location.pathname, cookieWarning]);

  // Queue paused toast
  useEffect(() => {
    const queueLog = queue?.find(item => item.log)?.log || null;
    if (isPaused && !prevIsPausedRef.current && queue.length > 0) {
      showNotification(queueLog || 'Queue paused', 'paused', { id: 'paused', persistent: true });
    } else if (!isPaused && prevIsPausedRef.current) {
      removeToast('paused');
    }
    prevIsPausedRef.current = isPaused;
  }, [isPaused, queue, showNotification, removeToast]);

  // Delay info toast
  useEffect(() => {
    if (delayInfo && delayInfo !== prevDelayInfoRef.current) {
      showNotification(delayInfo, 'delay', { id: 'delay', persistent: true });
    } else if (!delayInfo && prevDelayInfoRef.current) {
      removeToast('delay');
    }
    prevDelayInfoRef.current = delayInfo;
  }, [delayInfo, showNotification, removeToast]);

  // Download progress toast
  useEffect(() => {
    if (currentDownload && !isPaused) {
      const speed = currentDownload.speed_bps > 0
        ? `${(currentDownload.speed_bps / 1024 / 1024).toFixed(1)} MB/s`
        : null;
      const eta = currentDownload.eta_seconds > 0
        ? `${Math.floor(currentDownload.eta_seconds / 60)}:${Math.floor(currentDownload.eta_seconds % 60).toString().padStart(2, '0')}`
        : null;
      const percent = Math.round(currentDownload.progress_pct || 0);

      showNotification(
        currentDownload.title || 'Downloading...',
        'progress',
        {
          id: 'download-progress',
          persistent: true,
          progress: { speed, eta, percent }
        }
      );
    } else if (!currentDownload && prevDownloadRef.current) {
      removeToast('download-progress');
    }
    prevDownloadRef.current = currentDownload;
  }, [currentDownload, isPaused, showNotification, removeToast]);

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

  // Auth checks using React Query
  const { data: firstRunData, isLoading: firstRunLoading } = useFirstRunCheck();
  const { data: authData, isLoading: authLoading } = useAuthCheck();

  // Derive auth state from queries
  const isFirstRun = firstRunData?.first_run || false;
  const isAuthenticated = authData?.authenticated || false;
  const isLoading = firstRunLoading || authLoading;

  const downloading = queue?.filter(item => item.video?.status === 'downloading').length || 0;
  const pending = queue?.filter(item => item.video?.status === 'queued').length || 0;

  // Remember last page on mobile
  useEffect(() => {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isMobile) {
      if (location.pathname !== '/login' && location.pathname !== '/setup' && location.pathname !== '/') {
        localStorage.setItem('last-mobile-path', location.pathname + location.search);
      }
    }
  }, [location.pathname, location.search]);

  // Restore last page on mobile
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
    const hasAutoNavigated = sessionStorage.getItem('queue-auto-nav');

    if (!hasAutoNavigated && location.pathname === '/' && (pending > 0 || downloading > 0)) {
      navigate('/queue');
      sessionStorage.setItem('queue-auto-nav', 'true');
    }
  }, [location.pathname, pending, downloading, navigate]);

  // Memoize navLinks
  const navLinks = useMemo(() => [
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
  ], [pending, downloading]);

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
      window.location.replace('/login');
    } catch (error) {
      console.error('Logout failed:', error);
      window.location.replace('/login');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-dark-primary">
      {/* Update Banner - above nav */}
      {updateAvailable && !bannerDismissed && !isAuthPage && (
        <UpdateBanner
          currentVersion={APP_VERSION}
          latestVersion={latestVersion}
          onDismiss={handleBannerDismiss}
        />
      )}

      {/* Top Navigation Bar - Hidden on setup/login pages */}
      {!isAuthPage && (
        <header className="bg-dark-primary/95 backdrop-blur-lg sticky top-0 z-50 border-b border-dark-border">
          <div className="max-w-screen-2xl mx-auto px-6 lg:px-12 xl:px-16">
            {/* Main Nav Row */}
            <div className="flex items-center justify-center gap-1 md:gap-2 h-[60px]">
              {/* Nav Tabs */}
              <nav role="navigation" aria-label="Main navigation" className="flex gap-1 md:gap-2">
                {navLinks.map(link => (
                  <NavItem
                    key={link.path}
                    to={link.path}
                    icon={<span className="hidden md:inline-flex">{link.icon}</span>}
                    label={link.label}
                    badge={link.badge}
                    className="snap-start flex-shrink-0 px-3 md:px-4"
                  />
                ))}
              </nav>

              {/* Settings Tab - Hidden on mobile */}
              <NavItem
                to="/settings"
                icon={<SettingsIcon />}
                label="Settings"
                className="hidden md:flex"
              />

              {/* Logout Tab - Hidden on mobile */}
              <NavItem
                isButton={true}
                onClick={handleLogout}
                icon={
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                    <polyline points="16 17 21 12 16 7"></polyline>
                    <line x1="21" y1="12" x2="9" y2="12"></line>
                  </svg>
                }
                label="Logout"
                className="hidden md:flex"
              />

              {/* Kebab Menu - Mobile only */}
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
                      <SettingsIcon />
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
          </div>
        </header>
      )}

      {/* Main Content */}
      <main className={`flex-1 w-full ${isAuthPage ? '' : 'px-6 lg:px-12 xl:px-16 pb-2'}`}>
        <ErrorBoundary>
          <Routes>
            <Route path="/setup" element={<Setup />} />
            <Route path="/login" element={<Login />} />
            <Route path="/" element={isAuthenticated ? <Channels /> : <Navigate to="/login" replace />} />
            <Route path="/videos" element={isAuthenticated ? <Videos /> : <Navigate to="/login" replace />} />
            <Route path="/library" element={isAuthenticated ? <Library /> : <Navigate to="/login" replace />} />
            <Route path="/channel/:channelId" element={isAuthenticated ? <ChannelLibrary /> : <Navigate to="/login" replace />} />
            <Route path="/channel/:channelId/library" element={isAuthenticated ? <ChannelLibrary /> : <Navigate to="/login" replace />} />
            <Route path="/playlist/:id" element={isAuthenticated ? <Playlist /> : <Navigate to="/login" replace />} />
            <Route path="/import" element={isAuthenticated ? <Import /> : <Navigate to="/login" replace />} />
            <Route path="/queue" element={isAuthenticated ? <Queue /> : <Navigate to="/login" replace />} />
            <Route path="/settings" element={isAuthenticated ? <Settings /> : <Navigate to="/login" replace />} />
            <Route path="/player/:videoId" element={isAuthenticated ? <Player /> : <Navigate to="/login" replace />} />
            <Route path="/play/playlist/:playlistId" element={isAuthenticated ? <PlaylistPlayer /> : <Navigate to="/login" replace />} />
            <Route path="/play/category/:categoryId" element={isAuthenticated ? <PlaylistPlayer /> : <Navigate to="/login" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ErrorBoundary>
      </main>

      {/* Update Available Modal */}
      <UpdateModal
        isOpen={showUpdateModal}
        onClose={handleUpdateModalClose}
        currentVersion={APP_VERSION}
        latestVersion={latestVersion}
        serverPlatform={health?.server_platform}
      />

      {/* Toast Notifications */}
      <Toast />
    </div>
  );
}

// 404 Not Found component
function NotFound() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <h1 className="text-4xl mb-4 text-text-primary">404</h1>
        <p className="text-text-secondary mb-6">Page not found</p>
        <Link to="/" className="text-accent hover:text-accent-hover hover:underline transition-colors">
          Go Home
        </Link>
      </div>
    </div>
  );
}

export default App;
