import { Routes, Route, Link, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { useQueue, useHealth, useAuthCheck, useFirstRunCheck, useChannels, useFavoriteChannels, useSettings } from './api/queries';
import { useQueueSSE } from './api/useQueueSSE';
import { useNotification } from './contexts/NotificationContext';
import { useSelectionBar } from './contexts/PreferencesContext';
import { useToastManager } from './hooks/useToastManager';
import { useEffect, useState, useRef } from 'react';
import Discover from './routes/Discover';
import Library from './routes/Library';
import DiscoverChannel from './routes/DiscoverChannel';
import LibraryChannel from './routes/LibraryChannel';
import Playlist from './routes/Playlist';
import Videos from './routes/Videos';
import Queue from './routes/Queue';
import Settings from './routes/Settings';
import Player from './routes/Player';
import PlaylistPlayer from './routes/PlaylistPlayer';
import Auth from './routes/Auth';
import Import from './routes/Import';
import Favs from './routes/Favs';
import WatchHistory from './routes/WatchHistory';
import ErrorBoundary from './components/ErrorBoundary';
import Toast from './components/Toast';
import MobileBottomNav from './components/MobileBottomNav';
import Sidebar from './components/Sidebar';
import { version as APP_VERSION } from '../package.json';

// Update notification banner
function UpdateBanner({ currentVersion, latestVersion, onDismiss }) {
  const [isVisible, setIsVisible] = useState(true);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);

  const handleDismiss = () => {
    setIsAnimatingOut(true);
    setTimeout(() => {
      setIsVisible(false);
      onDismiss();
    }, 200);
  };

  if (!isVisible) return null;

  return (
    <div
      className={`bg-accent/10 border-b border-accent/20 transition-all duration-200 ${
        isAnimatingOut ? 'opacity-0 -translate-y-full h-0' : 'opacity-100 translate-y-0'
      }`}
    >
      <div className="max-w-screen-2xl mx-auto px-6 lg:px-12 xl:px-16 h-9 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
          </span>
          <span className="text-sm text-text-primary">
            Update available
            <span className="text-text-secondary mx-1.5">·</span>
            <span className="font-mono text-text-secondary">v{currentVersion}</span>
            <span className="text-text-secondary mx-1.5">→</span>
            <span className="font-mono text-accent-text">v{latestVersion}</span>
          </span>
        </div>
        <button
          onClick={handleDismiss}
          className="text-text-secondary hover:text-text-primary transition-colors p-1 -mr-1"
          title="Dismiss"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    </div>
  );
}

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
  const { showNotification } = useNotification();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved === 'true';
  });

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

  // Toast notifications are managed by useToastManager hook
  useToastManager({ queueData, location });

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
            <Route path="/setup" element={<Auth mode="setup" />} />
            <Route path="/login" element={<Auth mode="login" />} />
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
              <Route path="/" element={isAuthenticated ? <Discover /> : <Navigate to="/login" replace />} />
              <Route path="/discover" element={isAuthenticated ? <Discover /> : <Navigate to="/login" replace />} />
              <Route path="/discover/:channelId" element={isAuthenticated ? <DiscoverChannel /> : <Navigate to="/login" replace />} />
              <Route path="/videos" element={isAuthenticated ? <Videos /> : <Navigate to="/login" replace />} />
              <Route path="/library" element={isAuthenticated ? <Library /> : <Navigate to="/login" replace />} />
              <Route path="/library/channel/:channelId" element={isAuthenticated ? <LibraryChannel /> : <Navigate to="/login" replace />} />
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

export default App;
