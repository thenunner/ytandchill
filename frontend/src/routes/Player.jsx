import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState, useCallback } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import 'videojs-mobile-ui';
import 'videojs-mobile-ui/dist/videojs-mobile-ui.css';
import { useQueryClient } from '@tanstack/react-query';
import { useVideo, useVideoPlayback, useUpdateVideo, useDeleteVideo, useQueue, useSettings } from '../api/queries';
import { useNotification } from '../contexts/NotificationContext';
import { getUserFriendlyError, formatDuration } from '../utils/utils';
import { getVideoSource, PROGRESS_SAVE_DEBOUNCE_MS, WATCHED_THRESHOLD, initVideoJsComponents } from '../utils/videoUtils';
import { ConfirmDialog } from '../components/ui/SharedModals';
import AddToPlaylistMenu from '../components/AddToPlaylistMenu';
import { LoadingSpinner } from '../components/ListFeedback';
import MobileBottomNav from '../components/MobileBottomNav';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { EyeIcon, CheckmarkIcon } from '../components/Icons';
import Sidebar from '../components/Sidebar';

// Import video.js plugins
import '../plugins/videojs/wake-sentinel';
import '../plugins/videojs/persist-volume';
import '../plugins/videojs/media-session';

export default function Player() {
  const { videoId } = useParams();
  const queryClient = useQueryClient();

  // Abort all pending requests on mount to free up connections for video
  // This fixes slow video loading caused by browser connection limits (6 per origin)
  useEffect(() => {
    window.stop();
    queryClient.cancelQueries();
  }, [queryClient]);

  const navigate = useNavigate();
  const location = useLocation();

  // Video data from route state or API
  const routeVideo = location.state?.video;
  const { data: apiPlaybackData, isLoading: playbackLoading } = useVideoPlayback(videoId);
  const { data: apiVideo } = useVideo(videoId);

  const video = routeVideo || apiVideo;
  const playbackData = routeVideo ? {
    id: routeVideo.id,
    file_path: routeVideo.file_path,
    playback_seconds: routeVideo.playback_seconds,
    sponsorblock_segments: routeVideo.sponsorblock_segments,
    status: routeVideo.status,
  } : apiPlaybackData;

  const updateVideo = useUpdateVideo();
  const deleteVideo = useDeleteVideo();
  const { data: queueData } = useQueue();
  const { data: settings } = useSettings();
  const queueCount = queueData?.queue_items?.filter(i => i.status === 'pending' || i.status === 'downloading').length || 0;
  const { showNotification } = useNotification();

  // Refs
  const videoContainerRef = useRef(null);  // video.js container (mobile + desktop)
  const addToPlaylistButtonRef = useRef(null);
  const playerRef = useRef(null);          // video.js player instance
  const saveProgressTimeoutRef = useRef(null);
  const hasMarkedWatchedRef = useRef(false);
  const defaultSpeedRef = useRef(1);

  // State - player state triggers re-renders when player is ready
  const [playerReady, setPlayerReady] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isTheaterMode, setIsTheaterMode] = useState(() => {
    return localStorage.getItem('theaterMode') === 'true';
  });

  // Keep default speed ref in sync with settings
  defaultSpeedRef.current = parseFloat(settings?.default_playback_speed) || 1;

  // Media queries - use ref to prevent player reinit on media query changes
  const isTouchDevice = useMediaQuery('(pointer: coarse)');
  const isSmallScreen = useMediaQuery('(max-width: 767px)');
  const isMobile = isTouchDevice || isSmallScreen;
  const isMobileRef = useRef(isMobile);
  // Only update ref on actual device changes (not initial settling)
  useEffect(() => {
    isMobileRef.current = isMobile;
  }, [isMobile]);

  // Combine playback data with video metadata
  const playerVideoData = playbackData ? {
    id: playbackData.id,
    file_path: playbackData.file_path,
    playback_seconds: playbackData.playback_seconds,
    sponsorblock_segments: playbackData.sponsorblock_segments,
    status: playbackData.status,
    watched: video?.watched,
    thumb_url: video?.thumb_url,
    title: video?.title,
    channel_title: video?.channel_title,
  } : null;

  // Handle watched callback
  const handleWatched = useCallback(() => {
    const vid = video || playbackData;
    if (vid && !video?.watched) {
      updateVideo.mutateAsync({
        id: vid.id,
        data: { watched: true },
      }).then(() => {
        showNotification('Video marked as watched', 'success');
      }).catch(() => {
        showNotification('Failed to mark as watched', 'error');
      });
    }
  }, [video, playbackData, updateVideo, showNotification]);

  // Auto-collapse sidebar in theater mode
  useEffect(() => {
    if (isTheaterMode) setSidebarCollapsed(true);
  }, [isTheaterMode]);

  // ==================== VIDEO.JS INITIALIZATION (Desktop + Mobile) ====================
  // Following Stash's pattern: use video.js everywhere
  // Uses isMobileRef to avoid re-init when media query settles
  useEffect(() => {
    const container = videoContainerRef.current;
    if (!container) return;

    let vjs = null;
    let videoEl = null;
    let disposed = false;

    // Async init to register components first
    (async () => {
      await initVideoJsComponents();

      if (disposed) return; // Check if cleanup already ran

      videoEl = document.createElement('video-js');
      videoEl.className = 'video-js vjs-big-play-centered';
      videoEl.setAttribute('playsinline', 'true');
      container.appendChild(videoEl);

      // Different control bar for mobile vs desktop
      // Use ref to get stable initial value (prevents re-init on media query settling)
      const mobile = isMobileRef.current;
      const controlBarChildren = mobile
        ? [
            'playToggle',
            'seekForward10Button',
            'volumePanel',
            'currentTimeDisplay',
            'timeDivider',
            'durationDisplay',
            'progressControl',
            'playbackRateMenuButton',
            'fullscreenToggle',
          ]
        : [
            'playToggle',
            'seekBackward10Button',
            'seekForward10Button',
            'volumePanel',
            'currentTimeDisplay',
            'timeDivider',
            'durationDisplay',
            'progressControl',
            'remainingTimeDisplay',
            'playbackRateMenuButton',
            'pictureInPictureToggle',
            'theaterButton',
            'fullscreenToggle',
          ];

      // Mobile: custom control bar + mobile-ui plugin for touch handling
      // Desktop: custom control bar with extra features
      const playerOptions = mobile
        ? {
            controls: true,
            fill: true,
            preload: 'metadata',
            autoplay: false,
            experimentalSvgIcons: true,
            playbackRates: [1, 1.5, 2, 2.5],
            controlBar: {
              volumePanel: { inline: false },
              children: [
                'playToggle',
                'seekForward10Button',
                'volumePanel',
                'currentTimeDisplay',
                'timeDivider',
                'durationDisplay',
                'progressControl',
                'playbackRateMenuButton',
                'fullscreenToggle',
              ],
            },
          }
        : {
            controls: true,
            fill: true,
            preload: 'metadata',
            autoplay: true,
            experimentalSvgIcons: true,
            playbackRates: [1, 1.5, 2, 2.5],
            controlBar: {
              children: controlBarChildren,
            },
          };

      vjs = videojs(videoEl, playerOptions);

      playerRef.current = vjs;

      // Enable mobile UI plugin for touch-friendly experience
      if (mobile) {
        vjs.mobileUi({
          fullscreen: {
            exitOnRotate: false  // Stay fullscreen when rotating back to portrait
          }
        });

        // Add double-tap center for fullscreen toggle
        let lastTapTime = 0;
        const handleDoubleTapFullscreen = (e) => {
          const rect = vjs.el().getBoundingClientRect();
          const tapX = e.changedTouches[0].clientX - rect.left;
          const width = rect.width;

          // Only trigger on center third of video
          if (tapX > width / 3 && tapX < (width * 2) / 3) {
            const now = Date.now();
            if (now - lastTapTime < 300) {
              // Double tap detected - toggle fullscreen
              if (vjs.isFullscreen()) {
                vjs.exitFullscreen();
              } else {
                vjs.requestFullscreen();
              }
              lastTapTime = 0; // Reset to prevent triple-tap
            } else {
              lastTapTime = now;
            }
          }
        };
        vjs.el().addEventListener('touchend', handleDoubleTapFullscreen);
      }

      // Add theater button with callback
      const theaterBtn = vjs.controlBar.getChild('theaterButton');
      if (theaterBtn) {
        theaterBtn.onToggleCallback = (newMode) => {
          setIsTheaterMode(newMode);
        };
      }

      // Enable plugins
      vjs.wakeSentinel();
      vjs.persistVolume();
      vjs.mediaSession();

      setPlayerReady(true);
    })();

    // Cleanup
    return () => {
      disposed = true;
      if (saveProgressTimeoutRef.current) {
        clearTimeout(saveProgressTimeoutRef.current);
      }
      if (vjs && !vjs.isDisposed()) {
        vjs.dispose();
      }
      if (videoEl) {
        videoEl.remove();
      }
      playerRef.current = null;
      setPlayerReady(false);
    };
  }, []); // Runs once - uses isMobileRef for stable value

  // ==================== KEYBOARD SHORTCUTS ====================
  useEffect(() => {
    if (!playerReady) return;

    const handleKeyDown = (e) => {
      const player = playerRef.current;
      if (!player || player.isDisposed()) return;

      // Don't handle if user is typing in an input
      const tag = e.target.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;

      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault();
          if (player.paused()) {
            player.play();
          } else {
            player.pause();
          }
          break;
        case 'j':
          e.preventDefault();
          player.currentTime(player.currentTime() - 10);
          break;
        case 'l':
          e.preventDefault();
          player.currentTime(player.currentTime() + 10);
          break;
        case 'm':
          e.preventDefault();
          player.muted(!player.muted());
          break;
        case 'f':
          e.preventDefault();
          if (player.isFullscreen()) {
            player.exitFullscreen();
          } else {
            player.requestFullscreen();
          }
          break;
        case 'arrowleft':
          e.preventDefault();
          player.currentTime(player.currentTime() - 5);
          break;
        case 'arrowright':
          e.preventDefault();
          player.currentTime(player.currentTime() + 5);
          break;
        case 'arrowup':
          e.preventDefault();
          player.volume(Math.min(1, player.volume() + 0.1));
          break;
        case 'arrowdown':
          e.preventDefault();
          player.volume(Math.max(0, player.volume() - 0.1));
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [playerReady]);

  // ==================== SET VIDEO SOURCE ====================
  useEffect(() => {
    const player = playerRef.current;

    if (!playerReady || !player || player.isDisposed()) return;
    if (!playerVideoData?.file_path) return;

    const videoSrc = getVideoSource(playerVideoData.file_path);
    if (!videoSrc) return;

    // Reset watched flag for new video
    hasMarkedWatchedRef.current = false;

    // Set poster and source
    player.poster(playerVideoData.thumb_url || '');
    player.src({ src: videoSrc, type: 'video/mp4' });

    // Update media session
    try {
      const mediaSession = player.mediaSession?.();
      if (mediaSession && playerVideoData.title) {
        mediaSession.setMetadata(
          playerVideoData.title,
          playerVideoData.channel_title || '',
          playerVideoData.thumb_url || ''
        );
      }
    } catch (e) {}

    // Restore progress when metadata loads
    player.one('loadedmetadata', () => {
      const duration = player.duration();

      // Check localStorage for more recent position (survives page refresh)
      let startTime = 0;
      const localData = localStorage.getItem(`video_progress_${playerVideoData.id}`);
      if (localData) {
        try {
          const { time, timestamp } = JSON.parse(localData);
          // Use localStorage if it's from last 24 hours and valid
          if (Date.now() - timestamp < 24 * 60 * 60 * 1000 && time >= 5 && time < duration * 0.95) {
            startTime = time;
          }
        } catch (e) {}
      }

      // Fall back to API data if no valid localStorage
      if (startTime === 0 && playerVideoData.playback_seconds >= 5 &&
          playerVideoData.playback_seconds < duration * 0.95) {
        startTime = playerVideoData.playback_seconds;
      }

      if (startTime > 0) {
        player.currentTime(startTime);
      }

      // Clear localStorage after successful resume (API will have synced by now)
      localStorage.removeItem(`video_progress_${playerVideoData.id}`);

      // Add SponsorBlock segment markers to progress bar (skip if segments were cut from file)
      const segments = Array.isArray(playerVideoData.sponsorblock_segments) ? playerVideoData.sponsorblock_segments : [];
      if (segments.length > 0 && duration > 0) {
        const progressHolder = player.el().querySelector('.vjs-progress-holder');
        if (progressHolder) {
          // Remove any existing markers
          progressHolder.querySelectorAll('.sponsorblock-marker').forEach(el => el.remove());

          // Add markers for each segment
          segments.forEach(segment => {
            const marker = document.createElement('div');
            marker.className = 'sponsorblock-marker';
            const startPercent = (segment.start / duration) * 100;
            const widthPercent = ((segment.end - segment.start) / duration) * 100;
            marker.style.cssText = `
              position: absolute;
              left: ${startPercent}%;
              width: ${widthPercent}%;
              height: 100%;
              background: rgba(0, 212, 0, 0.5);
              pointer-events: none;
              z-index: 1;
            `;
            progressHolder.appendChild(marker);
          });
        }
      }

      // Apply default playback speed from settings
      if (defaultSpeedRef.current > 0) {
        player.playbackRate(defaultSpeedRef.current);
      }

      player.play().catch(() => {});
    });

    // Progress saving
    const handleTimeUpdate = () => {
      const currentTime = Math.floor(player.currentTime());

      // Save to localStorage immediately (synchronous - survives refresh)
      if (currentTime > 0 && playerVideoData?.id) {
        localStorage.setItem(
          `video_progress_${playerVideoData.id}`,
          JSON.stringify({ time: currentTime, timestamp: Date.now() })
        );
      }

      // Save to API (debounced)
      if (saveProgressTimeoutRef.current) {
        clearTimeout(saveProgressTimeoutRef.current);
      }
      saveProgressTimeoutRef.current = setTimeout(() => {
        if (player.isDisposed()) return;
        const currentTime = Math.floor(player.currentTime());
        updateVideo.mutate({
          id: playerVideoData.id,
          data: { playback_seconds: currentTime },
        });
      }, PROGRESS_SAVE_DEBOUNCE_MS);

      // Watched threshold
      if (!hasMarkedWatchedRef.current) {
        const currentTime = player.currentTime();
        const duration = player.duration();
        if (duration > 0 && currentTime / duration >= WATCHED_THRESHOLD) {
          hasMarkedWatchedRef.current = true;
          handleWatched();
        }
      }

      // SponsorBlock skip (skip if segments were cut from file)
      const segments = Array.isArray(playerVideoData.sponsorblock_segments) ? playerVideoData.sponsorblock_segments : [];
      if (segments.length > 0 && !player.seeking() && !player.paused()) {
        const currentTime = player.currentTime();
        for (const segment of segments) {
          if (currentTime >= segment.start && currentTime < segment.end - 0.5) {
            console.log(`[SponsorBlock] Skipping: ${segment.start} -> ${segment.end}`);
            player.currentTime(segment.end);
            break;
          }
        }
      }
    };

    player.on('timeupdate', handleTimeUpdate);

    // Save on pause
    const handlePause = () => {
      if (player.isDisposed()) return;
      const currentTime = Math.floor(player.currentTime());
      updateVideo.mutate({
        id: playerVideoData.id,
        data: { playback_seconds: currentTime },
      });
    };
    player.on('pause', handlePause);

    return () => {
      // Flush pending debounced save immediately
      if (saveProgressTimeoutRef.current) {
        clearTimeout(saveProgressTimeoutRef.current);
      }
      // Save current position before cleanup
      if (player && !player.isDisposed() && playerVideoData?.id) {
        const currentTime = Math.floor(player.currentTime());
        if (currentTime > 0) {
          updateVideo.mutate({
            id: playerVideoData.id,
            data: { playback_seconds: currentTime },
          });
        }
      }
      if (player && !player.isDisposed()) {
        player.off('timeupdate', handleTimeUpdate);
        player.off('pause', handlePause);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerReady, playerVideoData?.id]); // Only re-run when player ready or video changes

  // Save progress on page unload (refresh/close)
  // Uses localStorage as synchronous backup since fetch/keepalive may not complete before unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (playerRef.current && !playerRef.current.isDisposed() && playerVideoData?.id) {
        const currentTime = Math.floor(playerRef.current.currentTime());
        if (currentTime > 0) {
          // localStorage is synchronous - guaranteed to complete before unload
          localStorage.setItem(
            `video_progress_${playerVideoData.id}`,
            JSON.stringify({ time: currentTime, timestamp: Date.now() })
          );
          // Also try fetch with keepalive as backup
          fetch(`/api/videos/${playerVideoData.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playback_seconds: currentTime }),
            keepalive: true,
          });
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [playerVideoData?.id]);

  // Clean up stale localStorage entries older than 7 days
  useEffect(() => {
    const prefix = 'video_progress_';
    const maxAge = 7 * 24 * 60 * 60 * 1000;
    Object.keys(localStorage)
      .filter(k => k.startsWith(prefix))
      .forEach(k => {
        try {
          const { timestamp } = JSON.parse(localStorage.getItem(k));
          if (Date.now() - timestamp > maxAge) {
            localStorage.removeItem(k);
          }
        } catch (e) {
          localStorage.removeItem(k);
        }
      });
  }, []);

  // Compute video source for mobile
  const videoSrc = playbackData?.file_path ? getVideoSource(playbackData.file_path) : null;

  // Determine if we have a playable video
  const isPlayable = playbackData?.file_path && playbackData?.status === 'library';
  const showError = !playbackLoading && !playbackData;
  const showNotDownloaded = !playbackLoading && playbackData && !isPlayable;

  const handleDelete = async () => {
    if (!playbackData) return;
    try {
      await deleteVideo.mutateAsync(playbackData.id);
      showNotification('Video deleted', 'success');
      setShowDeleteConfirm(false);
      navigate(-1);
    } catch (error) {
      showNotification(getUserFriendlyError(error.message, 'delete video'), 'error');
    }
  };

  const handleBack = () => {
    const referrer = location.state?.from || `/channel/${video?.channel_id}/library`;
    navigate(referrer);
  };

  const toggleWatched = async () => {
    if (!video) return;
    try {
      await updateVideo.mutateAsync({
        id: playbackData.id,
        data: { watched: !video.watched },
      });
      showNotification(!video.watched ? 'Marked as watched' : 'Marked as unwatched', 'success');
    } catch (error) {
      showNotification(getUserFriendlyError(error.message, 'update video'), 'error');
    }
  };

  // ==================== MOBILE LAYOUT ====================
  if (isMobile) {
    return (
      <div className="flex flex-col h-screen bg-dark-primary animate-fade-in">
        <div className="flex-1 overflow-y-auto">
          {/* Video.js container - same as desktop */}
          <div
            ref={videoContainerRef}
            className="player-wrapper-mobile"
          >
            {/* Loading overlay */}
            {playbackLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
                <LoadingSpinner />
              </div>
            )}
          </div>

          <div className="player-video-info px-4 py-3 space-y-3">
            <h1 className="text-base font-semibold text-text-primary leading-tight line-clamp-2">
              {video?.title || 'Loading...'}
            </h1>
            <div className="flex items-center gap-2 text-xs text-text-secondary">
              {video?.channel_id ? (
                <Link to={`/channel/${video.channel_id}/library`} className="hover:text-text-primary transition-colors font-medium">
                  {video.channel_title}
                </Link>
              ) : <span>Loading...</span>}
              {video?.duration_sec && <><span>•</span><span>{formatDuration(video.duration_sec)}</span></>}
            </div>
            <div className="flex flex-wrap gap-2">
              <button ref={addToPlaylistButtonRef} onClick={() => setShowPlaylistMenu(true)}
                className="flex items-center justify-center px-5 py-3 bg-dark-secondary border border-dark-border rounded-lg text-text-primary text-sm font-medium">
                Playlist
              </button>
              <button onClick={toggleWatched} disabled={!video}
                className={`flex items-center justify-center px-5 py-3 border rounded-lg text-sm font-medium ${video?.watched ? 'bg-accent border-accent text-white' : 'bg-dark-secondary border-dark-border text-text-primary'} ${!video ? 'opacity-50' : ''}`}>
                <EyeIcon className="w-5 h-5" />
              </button>
              <button onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center justify-center px-5 py-3 bg-dark-secondary border border-dark-border rounded-lg text-red-400 text-sm font-medium">
                Delete
              </button>
            </div>
          </div>
        </div>

        <MobileBottomNav queueCount={queueCount} />

        <ConfirmDialog isOpen={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} onConfirm={handleDelete}
          title="Delete Video" message={`Are you sure you want to delete "${video?.title || 'this video'}"?`}
          confirmText="Delete" cancelText="Cancel" isDanger={true} />
        {showPlaylistMenu && playbackData && (
          <AddToPlaylistMenu videoId={playbackData.id} video={video || playbackData}
            triggerRef={addToPlaylistButtonRef} onClose={() => setShowPlaylistMenu(false)} />
        )}
      </div>
    );
  }

  // ==================== DESKTOP LAYOUT ====================
  return (
    <div className="flex h-screen overflow-hidden animate-fade-in">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />

      <div className="flex-1 flex flex-col overflow-y-auto bg-dark-primary pl-4">
        <div className={`shrink-0 ${isTheaterMode ? 'bg-black flex justify-center' : 'p-4 pb-0'}`}>
          <div className="flex flex-col" style={isTheaterMode ? { width: '100%', maxWidth: 'calc(100vh * 16 / 9)' } : {}}>
            {/* Video container - video.js creates element inside */}
            <div
              ref={videoContainerRef}
              className={`player-wrapper relative ${isTheaterMode ? '' : 'shadow-card-hover'}`}
              style={{
                height: isTheaterMode ? '100vh' : 'calc(100vh - 180px)',
                maxWidth: isTheaterMode ? '100%' : 'calc((100vh - 180px) * 16 / 9)',
                width: '100%',
              }}
            >
              {/* Loading/Error overlays inside container */}
              {playbackLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
                  <LoadingSpinner />
                </div>
              )}
              {showError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10">
                  <p className="text-gray-400 text-lg">Video not found</p>
                  <button onClick={() => navigate(-1)} className="btn btn-primary mt-4">Go Back</button>
                </div>
              )}
              {showNotDownloaded && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10">
                  <p className="text-gray-400 text-lg">Video not downloaded yet</p>
                  <button onClick={() => navigate(-1)} className="btn btn-primary mt-4">Go Back</button>
                </div>
              )}
            </div>

            <div className={`${isTheaterMode ? 'bg-dark-primary py-3 px-1' : 'py-3'}`}>
              <h1 className="text-lg font-bold text-text-primary leading-tight line-clamp-2">
                {video?.title || 'Loading...'}
              </h1>
              <div className="flex items-center gap-2 mt-1 text-sm text-text-secondary">
                {video?.channel_id ? (
                  <Link to={`/channel/${video.channel_id}/library`} className="hover:text-text-primary transition-colors font-medium">
                    {video.channel_title}
                  </Link>
                ) : <span>Loading...</span>}
                {video?.duration_sec && <><span>•</span><span>{formatDuration(video.duration_sec)}</span></>}
                {video?.upload_date && (
                  <><span>•</span><span>{new Date(video.upload_date.slice(0,4), video.upload_date.slice(4,6)-1, video.upload_date.slice(6,8)).toLocaleDateString()}</span></>
                )}
                {video?.watched && (
                  <><span>•</span><span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/20 text-accent-text text-xs font-semibold"><CheckmarkIcon className="w-3 h-3" />Watched</span></>
                )}
              </div>

              <div className="flex gap-2 mt-3">
                <button onClick={handleBack} className="flex items-center justify-center px-4 py-2 bg-dark-surface border border-dark-border rounded-lg text-text-secondary hover:bg-dark-hover hover:text-text-primary transition-colors text-sm font-medium">
                  Back
                </button>
                <button ref={addToPlaylistButtonRef} onClick={() => setShowPlaylistMenu(true)} className="flex items-center justify-center px-4 py-2 bg-dark-surface border border-dark-border rounded-lg text-text-secondary hover:bg-accent hover:border-accent hover:text-dark-primary transition-colors text-sm font-medium">
                  Playlist
                </button>
                <button onClick={toggleWatched} disabled={!video}
                  className={`flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors text-sm font-medium ${video?.watched ? 'bg-accent border-accent text-dark-primary' : 'bg-dark-surface border-dark-border text-text-secondary hover:bg-accent hover:border-accent hover:text-dark-primary'} ${!video ? 'opacity-50' : ''}`}>
                  <EyeIcon /><span>{video?.watched ? 'Watched' : 'Mark Watched'}</span>
                </button>
                <button onClick={() => setShowDeleteConfirm(true)} className="flex items-center justify-center px-4 py-2 bg-dark-surface border border-dark-border rounded-lg text-red-400 hover:bg-red-600 hover:border-red-600 hover:text-white transition-colors text-sm font-medium">
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog isOpen={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} onConfirm={handleDelete}
        title="Delete Video" message={`Are you sure you want to delete "${video?.title || 'this video'}"? This will permanently remove the video file.`}
        confirmText="Delete" cancelText="Cancel" isDanger={true} />
      {showPlaylistMenu && playbackData && (
        <AddToPlaylistMenu videoId={playbackData.id} video={video || playbackData}
          triggerRef={addToPlaylistButtonRef} onClose={() => setShowPlaylistMenu(false)} />
      )}
    </div>
  );
}
