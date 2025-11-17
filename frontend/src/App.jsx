import { Routes, Route, Link, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { useQueue, useHealth, useLogs, useAuthCheck, useFirstRunCheck } from './api/queries';
import { useNotification } from './contexts/NotificationContext';
import { useTheme } from './contexts/ThemeContext';
import { useEffect, useState } from 'react';
import Channels from './routes/Channels';
import Library from './routes/Library';
import ChannelLibrary from './routes/ChannelLibrary';
import Playlist from './routes/Playlist';
import Queue from './routes/Queue';
import Settings from './routes/Settings';
import Player from './routes/Player';
import Setup from './routes/Setup';
import Login from './routes/Login';

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: queueData } = useQueue();
  const { data: health } = useHealth();
  const { data: logsData } = useLogs(500);
  const { notification } = useNotification();
  const { theme } = useTheme();
  const [showQuickLogs, setShowQuickLogs] = useState(false);

  // Check if current theme is a light theme
  const isLightTheme = theme === 'online' || theme === 'pixel' || theme === 'standby' || theme === 'debug';

  // Auth checks using React Query (following autobrr/qui pattern)
  const { data: firstRunData, isLoading: firstRunLoading, error: firstRunError } = useFirstRunCheck();
  const { data: authData, isLoading: authLoading, error: authError } = useAuthCheck();

  // Derive auth state from queries
  const isFirstRun = firstRunData?.first_run || false;
  const isAuthenticated = authData?.authenticated || false;
  const isLoading = firstRunLoading || authLoading;

  // Handle new queue structure
  const queue = queueData?.queue_items || queueData || [];
  const currentDownload = queueData?.current_download || null;
  const currentOperation = queueData?.current_operation || null;
  const delayInfo = queueData?.delay_info || null;
  const isPaused = queueData?.is_paused || false;
  const isAutoRefreshing = queueData?.is_auto_refreshing || false;
  const lastAutoRefresh = queueData?.last_auto_refresh || null;

  const downloading = queue?.filter(item => item.video?.status === 'downloading').length || 0;
  const pending = queue?.filter(item => item.video?.status === 'queued').length || 0;

  // Get the first queue item with a log message (e.g., rate limit warnings)
  const queueLog = queue?.find(item => item.log)?.log || null;

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
      path: '/settings',
      label: 'Settings',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
      ),
      iconOnly: true
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

  return (
    <div className="min-h-screen flex flex-col bg-dark-primary">
      {/* Top Navigation Bar */}
      <header className="bg-dark-primary border-b border-dark-border sticky top-0 z-50">
        {/* Main Nav Row */}
        <div className="flex items-center gap-2 md:gap-8 px-4 h-[60px]">
          {/* Nav Tabs - Horizontally scrollable on mobile */}
          <nav className="flex gap-2 overflow-x-auto scrollbar-hide scroll-smooth snap-x snap-mandatory flex-1 md:flex-initial -mx-2 px-2">
            {navLinks.map(link => (
              <Link
                key={link.path}
                to={link.path}
                className={`nav-tab snap-start flex-shrink-0 ${link.iconOnly ? 'px-3' : ''} ${location.pathname === link.path ? 'active' : ''}`}
              >
                {link.icon}
                {!link.iconOnly && <span>{link.label}</span>}
                {link.badge > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                    {link.badge}
                  </span>
                )}
              </Link>
            ))}
          </nav>
        </div>

        {/* Status Bar Row (always visible if there's activity or notifications) */}
        {(downloading > 0 || pending > 0 || currentOperation?.type || notification || isAutoRefreshing || delayInfo || health) && (
          <div className="px-4 py-2 bg-dark-secondary/50 backdrop-blur-sm animate-slide-down relative">
            <div className="flex items-center justify-between text-sm font-mono">
              <div className="flex items-center gap-2 text-text-secondary overflow-x-auto scrollbar-hide scroll-smooth whitespace-nowrap flex-1">
                <button
                  onClick={() => setShowQuickLogs(!showQuickLogs)}
                  className="font-semibold text-text-primary hover:text-accent transition-colors cursor-pointer flex items-center gap-1"
                  title="Click to view recent logs"
                >
                  Status:
                  <svg className={`w-3 h-3 transition-transform ${showQuickLogs ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </button>

                {/* Queue Count */}
                {(pending > 0 || downloading > 0) && (
                  <span className="text-text-secondary flex-shrink-0">
                    [<span className="text-text-muted font-bold">{pending + downloading}</span> queued]
                  </span>
                )}

                {/* Notification Message - Highest Priority */}
                {notification && (
                  <div className="flex items-center gap-2 animate-fade-in flex-shrink-0">
                    {notification.type === 'success' && (
                      <svg className="w-4 h-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                      notification.type === 'success' ? 'text-accent' :
                      notification.type === 'error' ? 'text-red-400' :
                      'text-blue-400'
                    }`}>
                      {notification.message}
                    </span>
                  </div>
                )}

                {/* Current Operation (scanning, adding channel) - Second Priority */}
                {!notification && currentOperation?.type && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></span>
                      <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse [animation-delay:0.2s]"></span>
                      <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse [animation-delay:0.4s]"></span>
                    </div>
                    <span className="text-blue-400">{currentOperation.message}</span>
                  </div>
                )}

                {/* Queue Paused Message */}
                {!notification && !currentOperation?.type && isPaused && pending > 0 && (
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

                {/* Download Progress with Details */}
                {!notification && !currentOperation?.type && !isPaused && currentDownload && (
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-accent rounded-full animate-pulse"></span>
                      <span className="w-2 h-2 bg-accent rounded-full animate-pulse [animation-delay:0.2s]"></span>
                      <span className="w-2 h-2 bg-accent rounded-full animate-pulse [animation-delay:0.4s]"></span>
                    </div>
                    <span className="text-accent">
                      Downloading:
                    </span>
                    <span className="text-text-primary">
                      {currentDownload.video?.title || 'Unknown'}
                    </span>
                    <span className="text-text-primary">
                      {Math.round(currentDownload.progress_pct)}%
                    </span>
                    {currentDownload.speed_bps > 0 && (
                      <span className="text-text-primary">
                        {(currentDownload.speed_bps / 1024 / 1024).toFixed(1)} MB/s
                      </span>
                    )}
                    {currentDownload.eta_seconds > 0 && (
                      <span className="text-text-primary">
                        ETA: {Math.floor(currentDownload.eta_seconds / 60)}:{Math.floor(currentDownload.eta_seconds % 60).toString().padStart(2, '0')}
                      </span>
                    )}
                  </div>
                )}

                {/* Regular Download Count (if no detailed progress) */}
                {!notification && !currentOperation?.type && !currentDownload && downloading > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-accent rounded-full animate-pulse"></span>
                      <span className="w-2 h-2 bg-accent rounded-full animate-pulse [animation-delay:0.2s]"></span>
                      <span className="w-2 h-2 bg-accent rounded-full animate-pulse [animation-delay:0.4s]"></span>
                    </div>
                    <span className="text-text-primary">
                      Downloading <span className="text-accent font-bold">{downloading}</span> video{downloading > 1 ? 's' : ''}
                    </span>
                  </div>
                )}

                {/* Delay Info - Show between downloads */}
                {!notification && !currentOperation?.type && !currentDownload && downloading === 0 && delayInfo && (
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
                {!notification && !currentOperation?.type && !currentDownload && !delayInfo && isAutoRefreshing && (
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></span>
                      <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse [animation-delay:0.2s]"></span>
                      <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse [animation-delay:0.4s]"></span>
                    </div>
                    <span className="text-yellow-400">Auto-refreshing channels...</span>
                  </div>
                )}

                {!notification && !currentOperation?.type && !currentDownload && !delayInfo && !isAutoRefreshing && !isPaused && downloading === 0 && health?.auto_refresh_enabled && (
                  <span className="text-text-secondary">
                    Auto-refresh <span className="text-accent">enabled</span> for {health.auto_refresh_time || '03:00'}
                    {lastAutoRefresh && (
                      <span className="text-text-muted ml-2">
                        (last: {new Date(lastAutoRefresh).toLocaleTimeString()})
                      </span>
                    )}
                  </span>
                )}

                {/* Show idle state if no notification and no activity */}
                {!notification && !currentOperation?.type && !currentDownload && downloading === 0 && !delayInfo && !isAutoRefreshing && !health?.auto_refresh_enabled && (
                  <span className="text-text-secondary">Idle</span>
                )}
              </div>
            </div>

          </div>
        )}
      </header>

      {/* Quick Logs Slide-Down Panel - Pushes content down */}
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          showQuickLogs ? 'max-h-64 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className={`${isLightTheme ? 'bg-gray-800' : 'bg-dark-primary'} shadow-lg`}>
          <div className="px-4 py-3 max-h-64 overflow-auto font-mono text-xs">
            {logsData?.logs && logsData.logs.length > 0 ? (
              <div className="space-y-0.5">
                {logsData.logs.slice(-5).map((line, index) => {
                  // Parse log line to color only the [LEVEL] part
                  // Background is always dark, so text is white
                  const baseTextColor = 'text-white';

                  // Match pattern: "timestamp - [LEVEL] - message"
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

                  // Fallback for non-matching lines
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

      {/* Main Content */}
      <main className="flex-1 w-full px-4 py-6 max-w-[1600px]">
        <Routes>
          <Route path="/setup" element={<Setup />} />
          <Route path="/login" element={<Login />} />
          <Route path="/" element={isAuthenticated ? <Channels /> : <Navigate to="/login" replace />} />
          <Route path="/library" element={isAuthenticated ? <Library /> : <Navigate to="/login" replace />} />
          <Route path="/channel/:channelId" element={isAuthenticated ? <ChannelLibrary /> : <Navigate to="/login" replace />} />
          <Route path="/channel/:channelId/library" element={isAuthenticated ? <ChannelLibrary /> : <Navigate to="/login" replace />} />
          <Route path="/playlist/:id" element={isAuthenticated ? <Playlist /> : <Navigate to="/login" replace />} />
          <Route path="/queue" element={isAuthenticated ? <Queue /> : <Navigate to="/login" replace />} />
          <Route path="/settings" element={isAuthenticated ? <Settings /> : <Navigate to="/login" replace />} />
          <Route path="/player/:videoId" element={isAuthenticated ? <Player /> : <Navigate to="/login" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
