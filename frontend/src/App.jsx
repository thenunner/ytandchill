import { Routes, Route, Link, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { useQueue, useHealth, useAuthCheck, useFirstRunCheck, useChannels, useFavoriteChannels, useSettings } from './api/queries';
import { useQueueSSE } from './api/useQueueSSE';
import { useNotification } from './contexts/NotificationContext';
import { SelectionBarProvider, useSelectionBar } from './contexts/SelectionBarContext';
import { useEffect, useState, useRef } from 'react';
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
import Favs from './routes/Favs';
import WatchHistory from './routes/WatchHistory';
import ErrorBoundary from './components/ErrorBoundary';
import UpdateBanner from './components/UpdateBanner';
import Toast from './components/Toast';
import MobileBottomNav from './components/MobileBottomNav';
import Sidebar from './components/Sidebar';
import { version as APP_VERSION } from '../package.json';

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  // SSE keeps queue data updated in real-time across all components
  const { isConnected: sseConnected } = useQueueSSE();
  const { data: queueData } = useQueue({ sseConnected });
  const { data: channelsData } = useChannels();
  const { data: favoriteLibrariesRaw } = useFavoriteChannels();
  const { data: settings } = useSettings();
  const { data: health } = useHealth();

  // Filter favorites based on hide_empty_libraries setting
  const hideEmptyLibraries = settings?.hide_empty_libraries === 'true';
  const favoriteLibraries = (favoriteLibrariesRaw || []).filter(ch => {
    // When hide_empty_libraries is ON, filter out libraries with 0 videos
    if (hideEmptyLibraries && (ch.downloaded_count || 0) === 0) {
      return false;
    }
    return true;
  });
  const { showNotification, removeToast } = useNotification();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved === 'true';
  });
  const clearingCookieWarningRef = useRef(false);

  // Persist sidebar collapsed state
  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', sidebarCollapsed);
  }, [sidebarCollapsed]);

  // Update state
  const [latestVersion, setLatestVersion] = useState(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);


  // Track if update toast has been shown (one-time notification)
  const updateToastShownRef = useRef(false);

  // Refs for tracking previous states (to detect changes)
  const prevOperationRef = useRef(null);
  const prevErrorRef = useRef(null);
  const prevCookieWarningRef = useRef(null);
  const prevDelayInfoRef = useRef(null);
  const prevIsPausedRef = useRef(false);
  const prevDownloadRef = useRef(null);

  // Track user-dismissed toasts - don't re-show until condition resets
  const dismissedToastsRef = useRef(new Set());

  // Update latest version from health API (populated by backend scan operations)
  useEffect(() => {
    if (health?.latest_version) {
      const latest = health.latest_version;
      setLatestVersion(latest);

      if (latest && latest !== APP_VERSION && latest > APP_VERSION) {
        setUpdateAvailable(true);
        const dismissedBannerVersion = localStorage.getItem('updateBannerDismissedVersion');
        setBannerDismissed(dismissedBannerVersion === latest);

        // Show one-time toast notification when update is first detected
        const toastShownVersion = localStorage.getItem('updateToastShownVersion');
        if (!updateToastShownRef.current && toastShownVersion !== latest) {
          updateToastShownRef.current = true;
          localStorage.setItem('updateToastShownVersion', latest);
          showNotification(`Update available: v${latest}`, 'info', { persistent: true });
        }
      }
    }
  }, [health?.latest_version, showNotification]);


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

  // Scan completion toast (15 second duration)
  useEffect(() => {
    if (currentOperation?.type === 'scan_complete' && currentOperation?.message) {
      if (prevOperationRef.current?.type !== 'scan_complete') {
        showNotification(currentOperation.message, 'success', { duration: 15000 });
        // Clear the operation after showing toast
        api.clearOperation().catch(() => {});
      }
    }
    prevOperationRef.current = currentOperation;
  }, [currentOperation, showNotification]);

  // Active scanning toast - depend on message specifically to catch updates
  useEffect(() => {
    if (currentOperation?.type === 'scanning' && currentOperation?.message) {
      // Only show if user hasn't dismissed it
      if (!dismissedToastsRef.current.has('scanning')) {
        showNotification(currentOperation.message, 'scanning', {
          id: 'scanning',
          persistent: true,
          onDismiss: () => dismissedToastsRef.current.add('scanning')
        });
      }
    } else {
      // Always remove scanning toast when not actively scanning
      removeToast('scanning');
      dismissedToastsRef.current.delete('scanning');
    }
  }, [currentOperation?.type, currentOperation?.message, showNotification, removeToast]);

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
      // Show success notification when cookies are loaded/fixed
      showNotification('Cookies loaded successfully', 'success');
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
      // Only show if user hasn't dismissed it
      if (!dismissedToastsRef.current.has('paused')) {
        showNotification(queueLog || 'Queue paused', 'paused', {
          id: 'paused',
          persistent: true,
          onDismiss: () => dismissedToastsRef.current.add('paused')
        });
      }
    } else if (!isPaused && prevIsPausedRef.current) {
      removeToast('paused');
      // Clear dismissed state so it can show again next time
      dismissedToastsRef.current.delete('paused');
    }
    prevIsPausedRef.current = isPaused;
  }, [isPaused, queue, showNotification, removeToast]);

  // Delay info toast
  useEffect(() => {
    if (delayInfo && delayInfo !== prevDelayInfoRef.current) {
      // Only show if user hasn't dismissed it
      if (!dismissedToastsRef.current.has('delay')) {
        showNotification(delayInfo, 'delay', {
          id: 'delay',
          persistent: true,
          onDismiss: () => dismissedToastsRef.current.add('delay')
        });
      }
    } else if (!delayInfo && prevDelayInfoRef.current) {
      removeToast('delay');
      dismissedToastsRef.current.delete('delay');
      // Show notification that queue has resumed after delay
      showNotification('Queue resumed', 'success');
    }
    prevDelayInfoRef.current = delayInfo;
  }, [delayInfo, showNotification, removeToast]);

  // Download progress toast
  useEffect(() => {
    if (currentDownload && !isPaused) {
      // Only show if user hasn't dismissed it
      if (dismissedToastsRef.current.has('download-progress')) {
        return;
      }

      // Check if in postprocessing phase (SponsorBlock re-encoding)
      const isPostprocessing = currentDownload.phase === 'postprocessing';
      const onDismiss = () => dismissedToastsRef.current.add('download-progress');

      if (isPostprocessing) {
        // Show elapsed time for postprocessing
        const elapsed = currentDownload.postprocess_elapsed || 0;
        const elapsedStr = `${Math.floor(elapsed / 60)}:${(elapsed % 60).toString().padStart(2, '0')}`;

        showNotification(
          currentDownload.video?.title || 'Processing...',
          'progress',
          {
            id: 'download-progress',
            persistent: true,
            onDismiss,
            progress: {
              isPostprocessing: true,
              elapsed: elapsedStr,
              postprocessor: currentDownload.postprocessor
            }
          }
        );
      } else {
        // Normal download progress
        const speed = currentDownload.speed_bps > 0
          ? `${(currentDownload.speed_bps / 1024 / 1024).toFixed(1)} MB/s`
          : null;
        const eta = currentDownload.eta_seconds > 0
          ? `${Math.floor(currentDownload.eta_seconds / 60)}:${Math.floor(currentDownload.eta_seconds % 60).toString().padStart(2, '0')}`
          : null;
        const percent = Math.round(currentDownload.progress_pct || 0);

        showNotification(
          currentDownload.video?.title || 'Downloading...',
          'progress',
          {
            id: 'download-progress',
            persistent: true,
            onDismiss,
            progress: { speed, eta, percent }
          }
        );
      }
    } else if (!currentDownload && prevDownloadRef.current) {
      removeToast('download-progress');
      dismissedToastsRef.current.delete('download-progress');
      // Show download complete notification with the previous download's title
      const completedTitle = prevDownloadRef.current.video?.title || 'Video';
      showNotification(`Downloaded: ${completedTitle}`, 'success', { duration: 15000 });
    }
    prevDownloadRef.current = currentDownload;
  }, [currentDownload, isPaused, showNotification, removeToast]);


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

  const queueCount = pending + downloading;

  // Calculate total videos needing review across all channels (excluding Singles pseudo-channel)
  const reviewCount = channelsData
    ?.filter(channel => channel.yt_id !== '__singles__')
    ?.reduce((total, channel) => total + (channel.video_count || 0), 0) || 0;

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

  // Hide navigation on setup/login pages and player pages (player has its own sidebar)
  const isAuthPage = location.pathname === '/setup' || location.pathname === '/login';
  const isPlayerPage = location.pathname.startsWith('/player/') ||
    location.pathname.startsWith('/play/');

  // Auth pages and player pages get their own layouts
  if (isAuthPage || isPlayerPage) {
    return (
      <div className="min-h-screen bg-dark-primary">
        <ErrorBoundary>
          <Routes>
            <Route path="/setup" element={<Setup />} />
            <Route path="/login" element={<Login />} />
            <Route path="/player/:videoId" element={isAuthenticated ? <Player /> : <Navigate to="/login" replace />} />
            <Route path="/play/playlist/:playlistId" element={isAuthenticated ? <PlaylistPlayer /> : <Navigate to="/login" replace />} />
            <Route path="/play/category/:categoryId" element={isAuthenticated ? <PlaylistPlayer /> : <Navigate to="/login" replace />} />
          </Routes>
        </ErrorBoundary>
        <Toast />
      </div>
    );
  }

  // Main layout with sidebar for all other pages
  return (
    <div className="flex h-screen overflow-hidden bg-dark-primary">
      {/* Sidebar Navigation */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        reviewCount={reviewCount}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Update Banner */}
        {updateAvailable && !bannerDismissed && (
          <UpdateBanner
            currentVersion={APP_VERSION}
            latestVersion={latestVersion}
            onDismiss={handleBannerDismiss}
          />
        )}

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden px-0 pb-4 sm:px-6 sm:pb-6">
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={isAuthenticated ? <Channels /> : <Navigate to="/login" replace />} />
              <Route path="/videos" element={isAuthenticated ? <Videos /> : <Navigate to="/login" replace />} />
              <Route path="/library" element={isAuthenticated ? <Library /> : <Navigate to="/login" replace />} />
              <Route path="/channel/:channelId" element={isAuthenticated ? <ChannelLibrary /> : <Navigate to="/login" replace />} />
              <Route path="/channel/:channelId/library" element={isAuthenticated ? <ChannelLibrary /> : <Navigate to="/login" replace />} />
              <Route path="/playlist/:id" element={isAuthenticated ? <Playlist /> : <Navigate to="/login" replace />} />
              <Route path="/import" element={isAuthenticated ? <Import /> : <Navigate to="/login" replace />} />
              <Route path="/queue" element={isAuthenticated ? <Queue /> : <Navigate to="/login" replace />} />
              <Route path="/settings" element={isAuthenticated ? <Settings /> : <Navigate to="/login" replace />} />
              <Route path="/favs" element={isAuthenticated ? <Favs /> : <Navigate to="/login" replace />} />
              <Route path="/history" element={isAuthenticated ? <WatchHistory /> : <Navigate to="/login" replace />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </ErrorBoundary>
        </main>

        {/* Mobile Bottom Navigation - hidden when SelectionBar is visible */}
        <MobileBottomNavWrapper
          queueCount={queueCount}
          reviewCount={reviewCount}
          hasFavoritesWithNew={favoriteLibraries?.some(ch => ch.has_new_videos) || false}
        />
      </div>

      {/* Toast Notifications */}
      <Toast />
    </div>
  );
}

// Wrapper component for MobileBottomNav that hides when SelectionBar is visible
function MobileBottomNavWrapper({ queueCount, reviewCount, hasFavoritesWithNew }) {
  const { isSelectionBarVisible } = useSelectionBar();

  if (isSelectionBarVisible) return null;

  return (
    <div className="md:hidden">
      <MobileBottomNav queueCount={queueCount} reviewCount={reviewCount} hasFavoritesWithNew={hasFavoritesWithNew} />
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

// Wrap App with SelectionBarProvider
function AppWithProviders() {
  return (
    <SelectionBarProvider>
      <App />
    </SelectionBarProvider>
  );
}

export default AppWithProviders;
