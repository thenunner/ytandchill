import { useParams, useNavigate, useSearchParams, Link, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import { usePlaylist, useUpdateVideo, usePlaylists, useDeleteVideo, useQueue, useSettings } from '../api/queries';
import { useNotification } from '../contexts/NotificationContext';
import { getUserFriendlyError, formatDuration } from '../utils/utils';
import { getVideoSource, WATCHED_THRESHOLD, initVideoJsComponents } from '../utils/videoUtils';
import { ConfirmDialog } from '../components/ui/SharedModals';
import AddToPlaylistMenu from '../components/AddToPlaylistMenu';
import { LoadingSpinner } from '../components/ListFeedback';
import MobileBottomNav from '../components/MobileBottomNav';
import { ArrowLeftIcon, PlusIcon, EyeIcon, TrashIcon, CheckmarkIcon, PlayIcon } from '../components/Icons';
import Sidebar from '../components/Sidebar';
import { useMediaQuery } from '../hooks/useMediaQuery';

// Import video.js plugins
import '../plugins/videojs/wake-sentinel';
import '../plugins/videojs/persist-volume';
import '../plugins/videojs/media-session';

// Local helper components to avoid duplicate JSX

function PlaylistControls({ goToPrevious, goToNext, shufflePlaylist, toggleLoop, isLooping, currentIndex, displayOrderLength }) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={goToPrevious}
        disabled={currentIndex === 0 && !isLooping}
        className="icon-btn icon-btn-sm hover:bg-accent hover:border-accent disabled:opacity-30 disabled:cursor-not-allowed"
        title="Previous video (P)"
        aria-label="Go to previous video"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z"/>
        </svg>
      </button>
      <button
        onClick={shufflePlaylist}
        className="icon-btn icon-btn-sm hover:bg-accent hover:border-accent"
        title="Shuffle playlist (S)"
        aria-label="Shuffle playlist"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="16 3 21 3 21 8"></polyline>
          <line x1="4" y1="20" x2="21" y2="3"></line>
          <polyline points="21 16 21 21 16 21"></polyline>
          <line x1="15" y1="15" x2="21" y2="21"></line>
          <line x1="4" y1="4" x2="9" y2="9"></line>
        </svg>
      </button>
      <button
        onClick={toggleLoop}
        className={`icon-btn icon-btn-sm hover:bg-accent hover:border-accent ${isLooping ? 'bg-accent border-accent' : ''}`}
        title={isLooping ? 'Disable loop (O)' : 'Enable loop (O)'}
        aria-label={isLooping ? 'Disable loop' : 'Enable loop'}
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 1l4 4-4 4"></path>
          <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
          <path d="M7 23l-4-4 4-4"></path>
          <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
        </svg>
      </button>
      <button
        onClick={goToNext}
        disabled={currentIndex === displayOrderLength - 1 && !isLooping}
        className="icon-btn icon-btn-sm hover:bg-accent hover:border-accent disabled:opacity-30 disabled:cursor-not-allowed"
        title="Next video (N)"
        aria-label="Go to next video"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 6l8.5 6L6 18V6zm10.5 0v12h2V6h-2z"/>
        </svg>
      </button>
    </div>
  );
}

function ActionButtons({ handleBack, setShowPlaylistMenu, toggleWatched, setShowDeleteConfirm, currentVideo, addToPlaylistButtonRef }) {
  return (
    <div className="flex gap-2 mt-3">
      <button
        onClick={handleBack}
        className="flex items-center gap-2 px-3 py-1.5 bg-dark-surface border border-dark-border rounded-lg text-text-secondary hover:bg-dark-hover hover:text-text-primary transition-colors text-sm"
      >
        <ArrowLeftIcon />
        <span className="font-medium">Back</span>
      </button>

      <button
        ref={addToPlaylistButtonRef}
        onClick={() => setShowPlaylistMenu(true)}
        className="flex items-center gap-2 px-3 py-1.5 bg-dark-surface border border-dark-border rounded-lg text-text-secondary hover:bg-accent hover:border-accent hover:text-dark-primary transition-colors text-sm"
      >
        <PlusIcon />
        <span className="font-medium">Playlist</span>
      </button>

      <button
        onClick={toggleWatched}
        className={`flex items-center gap-2 px-3 py-1.5 border rounded-lg transition-colors text-sm ${
          currentVideo.watched
            ? 'bg-accent border-accent text-dark-primary'
            : 'bg-dark-surface border-dark-border text-text-secondary hover:bg-accent hover:border-accent hover:text-dark-primary'
        }`}
      >
        <EyeIcon />
        <span className="font-medium">{currentVideo.watched ? 'Watched' : 'Mark Watched'}</span>
      </button>

      <button
        onClick={() => setShowDeleteConfirm(true)}
        className="flex items-center gap-2 px-3 py-1.5 bg-dark-surface border border-dark-border rounded-lg text-text-secondary hover:bg-red-600 hover:border-red-600 hover:text-white transition-colors text-sm"
      >
        <TrashIcon />
        <span className="font-medium">Delete</span>
      </button>
    </div>
  );
}

export default function PlaylistPlayer() {
  const { playlistId, categoryId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { showNotification } = useNotification();
  const queryClient = useQueryClient();

  // Cancel all pending requests on mount to free up connections for video
  useEffect(() => {
    // window.stop() aborts all in-flight requests (images, fetches, etc.)
    // This frees up connection slots for the video to load immediately
    window.stop();
    queryClient.cancelQueries();
  }, [queryClient]);

  // Get starting video from URL if provided
  const startVideoId = searchParams.get('v');

  // Track if we've initialized the starting video (to prevent URL sync from resetting position)
  const hasInitializedRef = useRef(false);

  // Fetch playlist data based on mode (single playlist vs category)
  const { data: playlist, isLoading: isLoadingPlaylist } = usePlaylist(playlistId, { enabled: !!playlistId });
  const { data: playlistsData, isLoading: isLoadingCategory } = usePlaylists({ enabled: !!categoryId });
  const { data: queueData } = useQueue();
  const { data: settings } = useSettings();
  const queueCount = queueData?.queue_items?.filter(i => i.status === 'pending' || i.status === 'downloading').length || 0;

  // For category mode, get all playlists in this category
  const categoryPlaylists = useMemo(() => {
    if (!categoryId || !playlistsData) return [];
    const catId = parseInt(categoryId, 10);
    if (isNaN(catId)) return [];
    return playlistsData.filter(p => p.category_id === catId);
  }, [categoryId, playlistsData]);

  // Fetch videos from all playlists in the category
  const categoryPlaylistQueries = useQueries({
    queries: categoryPlaylists.map(pl => ({
      queryKey: ['playlist', pl.id],
      queryFn: async () => {
        const response = await fetch(`/api/playlists/${pl.id}`, { credentials: 'include' });
        if (!response.ok) throw new Error('Failed to fetch playlist');
        return response.json();
      },
      enabled: !!categoryId && categoryPlaylists.length > 0,
    })),
  });

  const updateVideo = useUpdateVideo();
  const deleteVideo = useDeleteVideo();

  // Sidebar State
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Playlist State
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLooping, setIsLooping] = useState(() => {
    const saved = localStorage.getItem('playlistLoop');
    return saved === 'true';
  });
  const [shuffledOrder, setShuffledOrder] = useState([]);
  const [showMobileQueue, setShowMobileQueue] = useState(false);
  const [isTheaterMode, setIsTheaterMode] = useState(() => {
    const saved = localStorage.getItem('theaterMode');
    return saved === 'true';
  });
  const [isQueueCollapsed, setIsQueueCollapsed] = useState(() => {
    const saved = localStorage.getItem('queueCollapsed');
    return saved === 'true';
  });
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  // Media query for mobile vs desktop - use touch detection for reliable native video
  // pointer: coarse = touch device (use native HTML5 video)
  // pointer: fine = mouse device (use Video.js)
  // Use ref to prevent player reinit on media query changes
  const isTouchDevice = useMediaQuery('(pointer: coarse)');
  const isSmallScreen = useMediaQuery('(max-width: 767px)');
  const isMobile = isTouchDevice || isSmallScreen;
  const isMobileRef = useRef(isMobile);
  useEffect(() => {
    isMobileRef.current = isMobile;
  }, [isMobile]);

  // Refs
  const videoContainerRef = useRef(null);  // Container for video.js (desktop)
  const videoRef = useRef(null);           // Native video element (mobile)
  const sidebarRef = useRef(null);
  const mobileQueueRef = useRef(null);
  const addToPlaylistButtonRef = useRef(null);
  const horizontalQueueRef = useRef(null);

  // Refs to hold latest values for event handlers (avoid stale closures)
  const goToNextRef = useRef(null);

  // Get videos based on mode (single playlist or category)
  const videos = useMemo(() => {
    if (playlistId && playlist?.videos) {
      return playlist.videos.filter(v => v.status === 'library' && v.file_path);
    }
    if (categoryId && categoryPlaylistQueries.length > 0) {
      // Check if all queries are loaded
      const allLoaded = categoryPlaylistQueries.every(q => q.isSuccess);
      if (!allLoaded) return [];

      // Combine videos from all playlists in the category
      const allVideos = [];
      categoryPlaylistQueries.forEach(query => {
        if (query.data?.videos) {
          const playlistVideos = query.data.videos.filter(v => v.status === 'library' && v.file_path);
          allVideos.push(...playlistVideos);
        }
      });

      return allVideos;
    }
    return [];
  }, [playlistId, categoryId, playlist, categoryPlaylistQueries]);

  const sourceTitle = useMemo(() => {
    if (playlistId && playlist?.name) {
      return playlist.name;
    }
    if (categoryId && categoryPlaylists.length > 0) {
      // Use the category name from the first playlist
      return categoryPlaylists[0]?.category_name || 'Category';
    }
    return 'Playlist';
  }, [playlistId, playlist, categoryId, categoryPlaylists]);

  const isLoading = useMemo(() => {
    if (playlistId) return isLoadingPlaylist;
    if (categoryId) {
      return isLoadingCategory || categoryPlaylistQueries.some(q => q.isLoading);
    }
    return false;
  }, [playlistId, categoryId, isLoadingPlaylist, isLoadingCategory, categoryPlaylistQueries]);

  // Get display order (original or shuffled)
  const displayOrder = useMemo(() => {
    if (shuffledOrder.length === videos.length && videos.length > 0) {
      return shuffledOrder;
    }
    return videos.map((_, i) => i);
  }, [shuffledOrder, videos.length]);

  // Current video based on index
  const currentVideo = useMemo(() => {
    if (videos.length === 0) {
      return null;
    }
    // Ensure currentIndex is valid
    const safeIndex = Math.min(currentIndex, displayOrder.length - 1);
    const actualIndex = displayOrder[safeIndex];
    if (actualIndex === undefined || actualIndex >= videos.length) {
      return videos[0];
    }
    return videos[actualIndex];
  }, [videos, displayOrder, currentIndex]);

  // Compute video source URL early so we can set it in JSX for high priority
  const videoSrc = currentVideo?.file_path ? getVideoSource(currentVideo.file_path) : null;

  // Set initial index based on startVideoId (ONLY on first load, not on URL updates during navigation)
  useEffect(() => {
    // Only run once when videos first load
    if (hasInitializedRef.current || videos.length === 0) return;

    if (startVideoId) {
      const videoId = parseInt(startVideoId, 10);
      if (!isNaN(videoId)) {
        // Find the index in displayOrder (not just videos array, to respect shuffle)
        const actualIdx = videos.findIndex(v => v.id === videoId);
        if (actualIdx !== -1) {
          // Find where this video is in the display order
          const displayIdx = displayOrder.findIndex(i => i === actualIdx);
          if (displayIdx !== -1) {
            setCurrentIndex(displayIdx);
          } else {
            // Fallback: if not in display order yet, use actual index
            setCurrentIndex(actualIdx);
          }
        }
      }
    }

    hasInitializedRef.current = true;
  }, [videos.length]); // Only re-run if videos array length changes (i.e., new data loaded)

  // Shuffle functions
  const shuffleArray = useCallback((arr) => {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }, []);

  const shufflePlaylist = useCallback(() => {
    if (videos.length > 0) {
      const indices = videos.map((_, i) => i);
      const currentActualIndex = displayOrder[currentIndex] ?? 0;
      const otherIndices = indices.filter(i => i !== currentActualIndex);
      const shuffled = [currentActualIndex, ...shuffleArray(otherIndices)];
      setShuffledOrder(shuffled);
      setCurrentIndex(0);
    }
  }, [videos, displayOrder, currentIndex, shuffleArray]);

  // Toggle loop
  const toggleLoop = useCallback(() => {
    setIsLooping(prev => {
      const newValue = !prev;
      localStorage.setItem('playlistLoop', newValue.toString());
      return newValue;
    });
  }, []);

  // Navigation functions
  const goToNext = useCallback(() => {
    if (videos.length === 0) return;
    if (currentIndex < displayOrder.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else if (isLooping) {
      setCurrentIndex(0);
      showNotification('Playlist restarted', 'info');
    }
  }, [currentIndex, displayOrder.length, isLooping, videos.length, showNotification]);

  const goToPrevious = useCallback(() => {
    if (videos.length === 0) return;
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    } else if (isLooping) {
      setCurrentIndex(displayOrder.length - 1);
    }
  }, [currentIndex, displayOrder.length, isLooping, videos.length]);

  const goToVideo = useCallback((index) => {
    if (index >= 0 && index < displayOrder.length) {
      setCurrentIndex(index);
    }
  }, [displayOrder.length]);

  // Handler functions using useCallback
  const handleBack = useCallback(() => {
    if (!currentVideo) return;
    // Navigate back to playlist view
    if (playlistId) {
      navigate(`/playlist/${playlistId}`);
    } else {
      navigate(-1);
    }
  }, [currentVideo, playlistId, navigate]);

  const handleDelete = useCallback(async () => {
    if (!currentVideo) return;
    try {
      await deleteVideo.mutateAsync(currentVideo.id);
      showNotification('Video deleted', 'success');
      setShowDeleteConfirm(false);
      // Navigate to next video or go back to playlist
      if (goToNext && videos.length > 1) {
        goToNext();
      } else {
        navigate(-1);
      }
    } catch (error) {
      showNotification(getUserFriendlyError(error.message, 'delete video'), 'error');
    }
  }, [currentVideo, deleteVideo, showNotification, goToNext, videos.length, navigate]);

  const toggleWatched = useCallback(async () => {
    if (!currentVideo) return;
    try {
      await updateVideo.mutateAsync({
        id: currentVideo.id,
        data: { watched: !currentVideo.watched },
      });
      showNotification(
        !currentVideo.watched ? 'Marked as watched' : 'Marked as unwatched',
        'success'
      );
    } catch (error) {
      showNotification(getUserFriendlyError(error.message, 'update video'), 'error');
    }
  }, [currentVideo, updateVideo, showNotification]);

  const toggleQueueCollapse = useCallback(() => {
    setIsQueueCollapsed(prev => {
      const newValue = !prev;
      localStorage.setItem('queueCollapsed', newValue.toString());
      // Sync with theater mode: collapsed = theater on, expanded = theater off
      setIsTheaterMode(newValue);
      localStorage.setItem('theaterMode', newValue.toString());
      return newValue;
    });
  }, []);

  // Update scroll overlay visibility based on scroll position
  const updateScrollState = useCallback(() => {
    if (!horizontalQueueRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = horizontalQueueRef.current;
    setCanScrollLeft(scrollLeft > 10);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
  }, []);

  // Scroll horizontal queue left/right
  const scrollQueue = useCallback((direction) => {
    if (horizontalQueueRef.current) {
      const scrollAmount = 400; // Scroll by roughly 2 cards worth
      horizontalQueueRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  }, []);

  // Set up scroll listener for horizontal queue
  useEffect(() => {
    const el = horizontalQueueRef.current;
    if (el && isTheaterMode) {
      el.addEventListener('scroll', updateScrollState);
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        updateScrollState();
      });
      return () => el.removeEventListener('scroll', updateScrollState);
    }
  }, [isTheaterMode, updateScrollState, displayOrder.length]);

  // CRITICAL: Memoized callback for watched handler
  const handleWatched = useCallback(() => {
    if (!currentVideo?.id || currentVideo?.watched) return;

    updateVideo.mutateAsync({
      id: currentVideo.id,
      data: { watched: true },
    }).then(() => {
      showNotification('Video marked as watched', 'success');
    }).catch(() => {
      showNotification('Failed to mark as watched', 'error');
    });
  }, [currentVideo?.id, currentVideo?.watched, updateVideo, showNotification]);

  // CRITICAL: Memoized callback for theater mode changes
  const handleTheaterModeChange = useCallback((newMode) => {
    setIsTheaterMode(newMode);
    localStorage.setItem('theaterMode', newMode.toString());
    // Sync with queue collapse state
    setIsQueueCollapsed(newMode);
    localStorage.setItem('queueCollapsed', newMode.toString());
  }, []);

  // Auto-collapse sidebar in theater mode
  useEffect(() => {
    if (isTheaterMode) {
      setSidebarCollapsed(true);
    }
  }, [isTheaterMode]);

  // Update goToNextRef
  useEffect(() => {
    goToNextRef.current = goToNext;
  }, [goToNext]);

  // Video.js player state
  const [playerReady, setPlayerReady] = useState(false);
  const playerRef = useRef(null);
  const hasMarkedWatchedRef = useRef(false);

  // ==================== VIDEO.JS INITIALIZATION (Desktop + Mobile) ====================
  // Following Stash's pattern: use video.js everywhere
  // Uses isMobileRef to avoid re-init when media query settles
  useEffect(() => {
    const container = videoContainerRef.current;
    if (!container) return;

    let vjs = null;
    let videoEl = null;
    let disposed = false;

    (async () => {
      await initVideoJsComponents();

      if (disposed) return;

      videoEl = document.createElement('video-js');
      videoEl.className = 'video-js vjs-big-play-centered';
      videoEl.setAttribute('playsinline', 'true');
      container.appendChild(videoEl);

      // Different control bar for mobile vs desktop
      // Use ref to get stable initial value (prevents re-init on media query settling)
      const mobile = isMobileRef.current;
      const controlBarChildren = mobile
        ? [
            'seekBackward10Button',
            'playToggle',
            'seekForward10Button',
            'volumePanel',
            'currentTimeDisplay',
            'timeDivider',
            'durationDisplay',
            'progressControl',  // Hidden via CSS when not fullscreen
            'playbackRateMenuButton',
            'pictureInPictureToggle',
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
            'theaterButton',
            'fullscreenToggle',
          ];

      vjs = videojs(videoEl, {
        controls: true,
        fill: true,
        preload: 'metadata',
        autoplay: false,  // Don't autoplay - iOS blocks it and it causes issues
        playbackRates: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
        controlBar: {
          children: controlBarChildren,
        },
      });

      playerRef.current = vjs;

      // Add theater button callback
      const theaterBtn = vjs.controlBar.getChild('theaterButton');
      if (theaterBtn) {
        theaterBtn.onToggleCallback = handleTheaterModeChange;
      }

      vjs.wakeSentinel();
      vjs.persistVolume();
      vjs.mediaSession();

      setPlayerReady(true);
    })();

    return () => {
      disposed = true;
      if (vjs && !vjs.isDisposed()) {
        vjs.dispose();
      }
      if (videoEl) {
        videoEl.remove();
      }
      playerRef.current = null;
      setPlayerReady(false);
    };
  }, [handleTheaterModeChange]); // Runs once - uses isMobileRef for stable value

  // Apply default playback speed from settings
  useEffect(() => {
    const player = playerRef.current;
    if (!playerReady || !player || player.isDisposed()) return;
    if (!settings?.default_playback_speed) return;

    const speed = parseFloat(settings.default_playback_speed);
    if (!isNaN(speed) && speed > 0) {
      player.playbackRate(speed);
    }
  }, [playerReady, settings?.default_playback_speed]);

  // Desktop: Set video source when currentVideo changes
  useEffect(() => {
    const player = playerRef.current;

    if (!playerReady || !player || player.isDisposed()) return;
    if (!currentVideo?.file_path) return;

    const videoSrc = getVideoSource(currentVideo.file_path);
    // Debug logging to localStorage
    const logEntry = {
      time: new Date().toISOString(),
      action: 'setSource',
      id: currentVideo.id,
      title: currentVideo.title,
      file_path: currentVideo.file_path,
      videoSrc
    };
    const logs = JSON.parse(localStorage.getItem('videoDebugLogs') || '[]');
    logs.push(logEntry);
    if (logs.length > 50) logs.shift(); // Keep last 50 entries
    localStorage.setItem('videoDebugLogs', JSON.stringify(logs));

    if (!videoSrc) return;

    hasMarkedWatchedRef.current = false;

    player.poster(currentVideo.thumb_url || '');
    player.src({ src: videoSrc, type: 'video/mp4' });

    try {
      const mediaSession = player.mediaSession?.();
      if (mediaSession && currentVideo.title) {
        mediaSession.setMetadata(currentVideo.title, currentVideo.channel_title || '', currentVideo.thumb_url || '');
      }
    } catch (e) {}

    player.one('loadedmetadata', () => {
      const duration = player.duration();

      // Add SponsorBlock segment markers to progress bar
      const segments = currentVideo.sponsorblock_segments || [];
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

      // Only autoplay on desktop - iOS blocks autoplay without user interaction
      if (!isMobile) {
        player.play().catch(() => {});
      }
    });

    // Event handlers
    const handleTimeUpdate = () => {
      // Watched threshold
      if (!hasMarkedWatchedRef.current) {
        const currentTime = player.currentTime();
        const duration = player.duration();
        if (duration > 0 && currentTime / duration >= WATCHED_THRESHOLD) {
          hasMarkedWatchedRef.current = true;
          handleWatched();
        }
      }

      // SponsorBlock skip
      const segments = currentVideo.sponsorblock_segments || [];
      if (segments.length > 0 && !player.seeking() && !player.paused()) {
        const time = player.currentTime();
        for (const seg of segments) {
          if (time >= seg.start && time < seg.end - 0.5) {
            player.currentTime(seg.end);
            break;
          }
        }
      }
    };

    const handleEnded = () => {
      goToNextRef.current?.();
    };

    const handleError = () => {
      const error = player.error();
      const errorInfo = {
        time: new Date().toISOString(),
        action: 'error',
        code: error?.code,
        message: error?.message,
        currentSrc: player.currentSrc(),
        videoId: currentVideo?.id,
        title: currentVideo?.title,
        file_path: currentVideo?.file_path
      };
      // Log to localStorage
      const logs = JSON.parse(localStorage.getItem('videoDebugLogs') || '[]');
      logs.push(errorInfo);
      localStorage.setItem('videoDebugLogs', JSON.stringify(logs));
      // Show notification with details
      showNotification(`Error: ${error?.message || 'Unknown'} | Src: ${player.currentSrc()} | Path: ${currentVideo?.file_path}`, 'error');
    };

    player.on('timeupdate', handleTimeUpdate);
    player.on('ended', handleEnded);
    player.on('error', handleError);

    return () => {
      if (player && !player.isDisposed()) {
        player.off('timeupdate', handleTimeUpdate);
        player.off('ended', handleEnded);
        player.off('error', handleError);
      }
    };
  }, [playerReady, currentVideo?.id, handleWatched, isMobile]);

  // Update URL when current video changes
  useEffect(() => {
    if (currentVideo) {
      setSearchParams({ v: currentVideo.id }, { replace: true });
    }
  }, [currentVideo?.id, setSearchParams]);

  // Keyboard shortcuts for playlist navigation (N, P, O, S - player handles K, J, L, F, T, M, 0-9)
  useEffect(() => {
    const handleKeyPress = (e) => {
      // Don't trigger if user is typing in an input field
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'n':
          // Next video
          e.preventDefault();
          goToNext();
          showNotification('Next video', 'info');
          break;
        case 'p':
          // Previous video
          e.preventDefault();
          goToPrevious();
          showNotification('Previous video', 'info');
          break;
        case 'o':
          // Toggle loop
          e.preventDefault();
          toggleLoop();
          showNotification(isLooping ? 'Loop disabled' : 'Loop enabled', 'info');
          break;
        case 's':
          // Shuffle playlist
          e.preventDefault();
          shufflePlaylist();
          showNotification('Playlist shuffled', 'info');
          break;
        case 'escape':
          // Exit fullscreen or go back
          e.preventDefault();
          if (document.fullscreenElement) {
            document.exitFullscreen();
          } else {
            handleBack();
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [goToNext, goToPrevious, toggleLoop, shufflePlaylist, isLooping, showNotification, handleBack]);

  // Desktop layout with sidebar
  if (!isMobile) {
    return (
      <div className="flex h-screen overflow-hidden animate-fade-in">
        {/* Sidebar Navigation */}
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(prev => !prev)}
        />

        {/* Main Content Area */}
        <div className="flex-1 bg-dark-primary min-h-0 overflow-y-auto pl-4">
          {/* Loading/Error Overlays */}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-dark-primary z-10">
              <LoadingSpinner />
            </div>
          )}
          {!isLoading && !currentVideo && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-dark-primary z-10">
              <p className="text-gray-400 text-lg">No video selected</p>
              <button onClick={() => navigate(-1)} className="btn btn-primary mt-4">
                Go Back
              </button>
            </div>
          )}
          {!isLoading && currentVideo && (!currentVideo.file_path || currentVideo.status !== 'library') && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-dark-primary z-10">
              <p className="text-gray-400 text-lg">Video not downloaded yet</p>
              <button onClick={() => navigate(-1)} className="btn btn-primary mt-4">
                Go Back
              </button>
            </div>
          )}

          {/* ===== THEATER MODE ===== */}
          {isTheaterMode && (
            <div>
              {/* Video fills viewport height, letterboxed horizontally */}
              <div className="bg-black flex justify-center">
                <div style={{ width: '100%', maxWidth: 'calc(100vh * 16 / 9)' }}>
                  <div
                    ref={videoContainerRef}
                    className="player-wrapper relative"
                    style={{ height: '100vh', width: '100%' }}
                  />
                </div>
              </div>

              {/* Video Info under video */}
              {currentVideo && (
              <div className="bg-dark-primary py-4 px-6">
                <h1 className="text-2xl font-bold text-text-primary leading-tight">
                  {currentVideo.title}
                </h1>
                <div className="flex flex-wrap items-center gap-3 text-sm text-text-secondary mt-2">
                  <Link
                    to={`/channel/${currentVideo.channel_id}/library`}
                    className="hover:text-text-primary transition-colors font-medium"
                  >
                    {currentVideo.channel_title}
                  </Link>
                  <span>•</span>
                  <span>{formatDuration(currentVideo.duration_sec)}</span>
                  <span>•</span>
                  <span>
                    {currentVideo.upload_date
                      ? new Date(
                          currentVideo.upload_date.slice(0, 4),
                          currentVideo.upload_date.slice(4, 6) - 1,
                          currentVideo.upload_date.slice(6, 8)
                        ).toLocaleDateString()
                      : 'Unknown date'}
                  </span>
                  {currentVideo.watched && (
                    <>
                      <span>•</span>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/20 border border-accent/40 text-accent-text font-semibold text-xs">
                        <CheckmarkIcon className="w-3.5 h-3.5" />
                        Watched
                      </span>
                    </>
                  )}
                </div>

                {/* Action Buttons */}
                <ActionButtons
                  handleBack={handleBack}
                  setShowPlaylistMenu={setShowPlaylistMenu}
                  toggleWatched={toggleWatched}
                  setShowDeleteConfirm={setShowDeleteConfirm}
                  currentVideo={currentVideo}
                  addToPlaylistButtonRef={addToPlaylistButtonRef}
                />
              </div>
              )}

              {/* Horizontal Queue */}
              <div className="bg-surface mx-6 mb-6 rounded-xl shadow-card overflow-hidden">
                {/* Header: Playlist Info + Controls */}
                <div className="p-4 border-b border-accent/30 flex items-center gap-4">
                  {/* Playlist Info */}
                  <div className="flex-shrink-0">
                    <h2 className="font-semibold text-text-primary">{sourceTitle}</h2>
                    <p className="text-sm text-text-secondary">{currentIndex + 1} of {videos.length} videos</p>
                  </div>

                  {/* Playlist Controls */}
                  <PlaylistControls
                    goToPrevious={goToPrevious}
                    goToNext={goToNext}
                    shufflePlaylist={shufflePlaylist}
                    toggleLoop={toggleLoop}
                    isLooping={isLooping}
                    currentIndex={currentIndex}
                    displayOrderLength={displayOrder.length}
                  />
                </div>

                  {/* Horizontal Queue with Overlay Scroll Buttons */}
                  <div className="relative group">
                    {/* Left Scroll Overlay - Frosted Glass Panel */}
                    {canScrollLeft && (
                      <div
                        onClick={() => scrollQueue('left')}
                        className="absolute left-0 top-0 bottom-0 w-20 z-10 flex items-center justify-center cursor-pointer group/nav"
                        aria-label="Scroll left"
                      >
                        {/* Frosted glass background */}
                        <div
                          className="absolute inset-0 backdrop-blur-md transition-all duration-300 opacity-80 group-hover/nav:opacity-95"
                          style={{
                            background: 'linear-gradient(to right, hsl(var(--bg-surface) / 0.85) 0%, hsl(var(--bg-surface) / 0.6) 60%, transparent 100%)',
                            borderRadius: '0 0 0 0.75rem'
                          }}
                        />
                        {/* Inner edge accent line */}
                        <div
                          className="absolute right-0 top-4 bottom-4 w-px opacity-0 group-hover/nav:opacity-60 transition-opacity duration-300"
                          style={{ background: 'linear-gradient(to bottom, transparent, hsl(var(--accent) / 0.5), transparent)' }}
                        />
                        {/* Arrow button - illuminated glass disc */}
                        <div
                          className="relative z-10 w-12 h-12 rounded-full flex items-center justify-center backdrop-blur-xl transition-all duration-300 group-hover/nav:scale-110"
                          style={{
                            background: 'radial-gradient(circle at 30% 30%, hsl(var(--bg-surface-hover) / 0.95) 0%, hsl(var(--bg-surface) / 0.9) 100%)',
                            border: '1px solid hsl(0 0% 100% / 0.2)',
                            boxShadow: 'inset 0 2px 4px hsl(0 0% 100% / 0.12), inset 0 -2px 4px hsl(0 0% 0% / 0.2), 0 0 0 1px hsl(0 0% 0% / 0.1), 0 8px 24px hsl(0 0% 0% / 0.4)'
                          }}
                        >
                          <svg className="w-6 h-6 text-text-primary/90 group-hover/nav:text-text-primary transition-colors drop-shadow-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="15 18 9 12 15 6"></polyline>
                          </svg>
                        </div>
                      </div>
                    )}

                    {/* Queue Track */}
                    <div
                      ref={horizontalQueueRef}
                      className="flex overflow-x-auto gap-3 p-4 scrollbar-hide"
                    >
                      {displayOrder.map((actualIndex, displayIndex) => {
                        const video = videos[actualIndex];
                        if (!video) return null;
                        const isCurrent = displayIndex === currentIndex;

                        return (
                          <button
                            key={video.id}
                            onClick={() => goToVideo(displayIndex)}
                            className={`flex-shrink-0 w-44 p-2 rounded-lg hover:bg-surface-hover transition-colors ${
                              isCurrent ? 'bg-accent/15 border border-accent/40' : 'bg-surface'
                            }`}
                          >
                            <div className="relative w-full bg-black rounded overflow-hidden" style={{ aspectRatio: '16/9' }}>
                              {video.thumb_url ? (
                                <img src={video.thumb_url} alt={video.title} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-surface-hover">
                                  <svg className="w-8 h-8 text-text-muted" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                                  </svg>
                                </div>
                              )}
                              <div className="absolute bottom-1 right-1 bg-black/80 text-white text-xs px-1 py-0.5 rounded">
                                {formatDuration(video.duration_sec)}
                              </div>
                              {video.watched && (
                                <div className="absolute top-1 left-1 bg-accent/90 text-accent-text text-xs px-1 py-0.5 rounded">
                                  <CheckmarkIcon className="w-3 h-3" />
                                </div>
                              )}
                            </div>
                            <p className={`text-sm font-medium mt-2 line-clamp-2 text-left ${isCurrent ? 'text-accent-text' : 'text-text-primary'}`}>
                              {video.title}
                            </p>
                            <p className="text-xs text-text-secondary mt-0.5 text-left">{video.channel_title}</p>
                          </button>
                        );
                      })}
                    </div>

                    {/* Right Scroll Overlay - Frosted Glass Panel */}
                    {canScrollRight && (
                      <div
                        onClick={() => scrollQueue('right')}
                        className="absolute right-0 top-0 bottom-0 w-20 z-10 flex items-center justify-center cursor-pointer group/nav"
                        aria-label="Scroll right"
                      >
                        {/* Frosted glass background */}
                        <div
                          className="absolute inset-0 backdrop-blur-md transition-all duration-300 opacity-80 group-hover/nav:opacity-95"
                          style={{
                            background: 'linear-gradient(to left, hsl(var(--bg-surface) / 0.85) 0%, hsl(var(--bg-surface) / 0.6) 60%, transparent 100%)',
                            borderRadius: '0 0 0.75rem 0'
                          }}
                        />
                        {/* Inner edge accent line */}
                        <div
                          className="absolute left-0 top-4 bottom-4 w-px opacity-0 group-hover/nav:opacity-60 transition-opacity duration-300"
                          style={{ background: 'linear-gradient(to bottom, transparent, hsl(var(--accent) / 0.5), transparent)' }}
                        />
                        {/* Arrow button - illuminated glass disc */}
                        <div
                          className="relative z-10 w-12 h-12 rounded-full flex items-center justify-center backdrop-blur-xl transition-all duration-300 group-hover/nav:scale-110"
                          style={{
                            background: 'radial-gradient(circle at 30% 30%, hsl(var(--bg-surface-hover) / 0.95) 0%, hsl(var(--bg-surface) / 0.9) 100%)',
                            border: '1px solid hsl(0 0% 100% / 0.2)',
                            boxShadow: 'inset 0 2px 4px hsl(0 0% 100% / 0.12), inset 0 -2px 4px hsl(0 0% 0% / 0.2), 0 0 0 1px hsl(0 0% 0% / 0.1), 0 8px 24px hsl(0 0% 0% / 0.4)'
                          }}
                        >
                          <svg className="w-6 h-6 text-text-primary/90 group-hover/nav:text-text-primary transition-colors drop-shadow-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="9 18 15 12 9 6"></polyline>
                          </svg>
                        </div>
                      </div>
                    )}
                  </div>
              </div>
            </div>
          )}

          {/* ===== NORMAL MODE ===== */}
          {!isTheaterMode && (
            <div className="space-y-4 pt-4 px-4">
              <div className="flex gap-4 items-start max-w-[1600px]">
                {/* LEFT: Player + Info */}
                <div className="flex-1 min-w-0">
                  {/* Video Wrapper - hook creates video element dynamically */}
                  <div
                    ref={videoContainerRef}
                    className="player-wrapper relative shadow-card-hover"
                  />

                  {/* Video Info */}
                  {currentVideo && (
                  <div className="mt-4 space-y-3">
                    <h1 className="text-xl font-bold text-text-primary leading-tight">
                      {currentVideo.title}
                    </h1>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-text-secondary">
                      <Link
                        to={`/channel/${currentVideo.channel_id}/library`}
                        className="hover:text-text-primary transition-colors font-medium"
                      >
                        {currentVideo.channel_title}
                      </Link>
                      <span>•</span>
                      <span>{formatDuration(currentVideo.duration_sec)}</span>
                      <span>•</span>
                      <span>
                        {currentVideo.upload_date
                          ? new Date(
                              currentVideo.upload_date.slice(0, 4),
                              currentVideo.upload_date.slice(4, 6) - 1,
                              currentVideo.upload_date.slice(6, 8)
                            ).toLocaleDateString()
                          : 'Unknown date'}
                      </span>
                      {currentVideo.watched && (
                        <>
                          <span>•</span>
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/20 border border-accent/40 text-accent-text font-semibold text-xs">
                            <CheckmarkIcon className="w-3.5 h-3.5" />
                            Watched
                          </span>
                        </>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <ActionButtons
                      handleBack={handleBack}
                      setShowPlaylistMenu={setShowPlaylistMenu}
                      toggleWatched={toggleWatched}
                      setShowDeleteConfirm={setShowDeleteConfirm}
                      currentVideo={currentVideo}
                      addToPlaylistButtonRef={addToPlaylistButtonRef}
                    />
                  </div>
                  )}
                </div>

                {/* RIGHT: Queue Sidebar */}
                <div
                  ref={sidebarRef}
                  className="bg-surface rounded-xl shadow-card overflow-hidden flex flex-col w-80 flex-shrink-0"
                  style={{ maxHeight: '500px' }}
                >
                <div className="p-4 border-b border-accent/30 flex-shrink-0">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h2 className="font-semibold text-text-primary">{sourceTitle}</h2>
                      <p className="text-sm text-text-secondary">{currentIndex + 1} of {videos.length} videos</p>
                    </div>
                  </div>
                  <PlaylistControls
                    goToPrevious={goToPrevious}
                    goToNext={goToNext}
                    shufflePlaylist={shufflePlaylist}
                    toggleLoop={toggleLoop}
                    isLooping={isLooping}
                    currentIndex={currentIndex}
                    displayOrderLength={displayOrder.length}
                  />
                </div>

                <div className="overflow-y-auto flex-1">
                  {displayOrder.map((actualIndex, displayIndex) => {
                    const video = videos[actualIndex];
                    if (!video) return null;
                    const isCurrent = displayIndex === currentIndex;

                    return (
                      <button
                        key={video.id}
                        onClick={() => goToVideo(displayIndex)}
                        className={`w-full p-2 flex gap-2 hover:bg-surface-hover transition-colors ${
                          isCurrent ? 'bg-accent/20 border-l-2 border-accent' : ''
                        }`}
                      >
                        <div className="relative flex-shrink-0 w-20 h-12 bg-black rounded overflow-hidden">
                          {video.thumb_url ? (
                            <img src={video.thumb_url} alt={video.title} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-surface-hover">
                              <svg className="w-8 h-8 text-text-muted" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                              </svg>
                            </div>
                          )}
                          <div className="absolute bottom-1 right-1 bg-black/80 text-white text-xs px-1 py-0.5 rounded">
                            {formatDuration(video.duration_sec)}
                          </div>
                          {video.watched && (
                            <div className="absolute top-1 left-1 bg-accent/90 text-accent-text text-xs px-1 py-0.5 rounded">
                              <CheckmarkIcon className="w-3 h-3" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 text-left min-w-0">
                          <h3 className={`text-xs font-medium line-clamp-2 leading-tight ${isCurrent ? 'text-accent-text' : 'text-text-primary'}`}>
                            {video.title}
                          </h3>
                          <p className="text-xs text-text-secondary mt-0.5">{video.channel_title}</p>
                        </div>
                        {isCurrent && <PlayIcon className="w-4 h-4 text-accent flex-shrink-0 self-center" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
          )}
        </div>

        {/* Delete Confirmation Dialog */}
        {currentVideo && (
          <ConfirmDialog
            isOpen={showDeleteConfirm}
            onClose={() => setShowDeleteConfirm(false)}
            onConfirm={handleDelete}
            title="Delete Video"
            message={`Are you sure you want to delete "${currentVideo.title}"? This will permanently remove the video file from your system.`}
            confirmText="Delete"
            cancelText="Cancel"
            isDanger={true}
          />
        )}

        {/* Add to Playlist Menu */}
        {currentVideo && showPlaylistMenu && (
          <AddToPlaylistMenu
            videoId={currentVideo.id}
            video={currentVideo}
            triggerRef={addToPlaylistButtonRef}
            onClose={() => setShowPlaylistMenu(false)}
          />
        )}
      </div>
    );
  }

  // Mobile layout with bottom navigation
  return (
    <div className="flex flex-col h-screen bg-dark-primary animate-fade-in">
      {/* Loading/Error Overlays */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-dark-primary z-10">
          <LoadingSpinner />
        </div>
      )}
      {!isLoading && !currentVideo && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-dark-primary z-10">
          <p className="text-gray-400 text-lg">No video selected</p>
          <button onClick={() => navigate(-1)} className="btn btn-primary mt-4">
            Go Back
          </button>
        </div>
      )}

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto">
        {/* Video Player - video.js (same as desktop) */}
        <div
          ref={videoContainerRef}
          className="player-wrapper-mobile"
        />

        {/* Video Info with Prev/Next Controls - hidden in landscape via CSS */}
        {currentVideo && (
        <div className="player-video-info px-4 py-3 space-y-3">
          {/* Title with Prev/Next buttons */}
          <div className="flex items-start gap-2">
            <button
              onClick={goToPrevious}
              disabled={currentIndex === 0 && !isLooping}
              className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-dark-surface border border-dark-border text-text-secondary hover:bg-accent hover:border-accent hover:text-dark-primary disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              title="Previous"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z"/>
              </svg>
            </button>
            <h1 className="flex-1 text-base font-semibold text-text-primary leading-tight line-clamp-2">
              {currentVideo.title}
            </h1>
            <button
              onClick={goToNext}
              disabled={currentIndex === displayOrder.length - 1 && !isLooping}
              className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-dark-surface border border-dark-border text-text-secondary hover:bg-accent hover:border-accent hover:text-dark-primary disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              title="Next"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 6l8.5 6L6 18V6zm10.5 0v12h2V6h-2z"/>
              </svg>
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <Link
              to={`/channel/${currentVideo.channel_id}/library`}
              className="hover:text-text-primary transition-colors font-medium"
            >
              {currentVideo.channel_title}
            </Link>
            <span>•</span>
            <span>{formatDuration(currentVideo.duration_sec)}</span>
          </div>

          {/* Action Buttons - Mobile */}
          <div className="flex gap-2">
            <button
              onClick={toggleWatched}
              className={`flex items-center justify-center px-5 py-3 border rounded-lg text-sm font-medium transition-colors ${
                currentVideo.watched
                  ? 'bg-accent border-accent text-white'
                  : 'bg-dark-secondary border-dark-border text-text-primary'
              }`}
              title={currentVideo.watched ? 'Mark unwatched' : 'Mark watched'}
            >
              <EyeIcon className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center justify-center px-5 py-3 bg-dark-secondary border border-dark-border rounded-lg text-red-400 text-sm font-medium transition-colors"
            >
              Delete
            </button>
            <button
              onClick={() => setShowMobileQueue(true)}
              className="flex items-center justify-center px-5 py-3 bg-dark-secondary border border-dark-border rounded-lg text-text-primary text-sm font-medium transition-colors ml-auto"
            >
              Playlist
            </button>
          </div>
        </div>
        )}
      </div>

      {/* Full-Screen Playlist Overlay */}
      {showMobileQueue && (
        <div className="fixed inset-0 z-50 bg-dark-primary flex flex-col animate-fade-in">
          {/* Overlay Header */}
          <div className="p-4 border-b border-dark-border flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-base text-text-primary">{sourceTitle}</h3>
              <p className="text-xs text-text-secondary">{currentIndex + 1} of {videos.length} videos</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={shufflePlaylist}
                className="w-10 h-10 flex items-center justify-center rounded-lg bg-dark-surface border border-dark-border text-text-secondary active:bg-red-500 active:border-red-500 active:text-white transition-all"
                title="Shuffle"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="16 3 21 3 21 8"></polyline>
                  <line x1="4" y1="20" x2="21" y2="3"></line>
                  <polyline points="21 16 21 21 16 21"></polyline>
                  <line x1="15" y1="15" x2="21" y2="21"></line>
                  <line x1="4" y1="4" x2="9" y2="9"></line>
                </svg>
              </button>
              <button
                onClick={toggleLoop}
                className={`w-10 h-10 flex items-center justify-center rounded-lg border transition-all ${
                  isLooping
                    ? 'bg-red-500 border-red-500 text-white'
                    : 'bg-dark-surface border-dark-border text-text-secondary'
                }`}
                title={isLooping ? 'Disable loop' : 'Enable loop'}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 1l4 4-4 4"></path>
                  <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                  <path d="M7 23l-4-4 4-4"></path>
                  <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
                </svg>
              </button>
              <button
                onClick={() => setShowMobileQueue(false)}
                className="w-10 h-10 flex items-center justify-center rounded-lg bg-dark-surface border border-dark-border text-text-secondary hover:bg-red-500 hover:border-red-500 hover:text-white transition-all"
                title="Close"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>

          {/* Scrollable Queue List */}
          <div className="flex-1 overflow-y-auto">
            {displayOrder.map((actualIndex, displayIndex) => {
              const video = videos[actualIndex];
              if (!video) return null;
              const isCurrent = displayIndex === currentIndex;
              const watchProgress = video.watch_position && video.duration_sec
                ? Math.min((video.watch_position / video.duration_sec) * 100, 100)
                : 0;

              return (
                <button
                  key={video.id}
                  onClick={() => {
                    goToVideo(displayIndex);
                    setShowMobileQueue(false);
                  }}
                  className={`w-full p-3 flex gap-3 hover:bg-surface-hover transition-colors ${
                    isCurrent ? 'bg-accent/20 border-l-2 border-accent' : ''
                  }`}
                >
                  <div className="relative flex-shrink-0 w-24 h-14 bg-black rounded overflow-hidden">
                    {video.thumb_url ? (
                      <img src={video.thumb_url} alt={video.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-surface-hover">
                        <svg className="w-6 h-6 text-text-muted" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                        </svg>
                      </div>
                    )}
                    <div className="absolute bottom-0.5 right-0.5 bg-black/80 text-white text-xs px-1 rounded">
                      {formatDuration(video.duration_sec)}
                    </div>
                    {video.watched && (
                      <div className="absolute top-0.5 left-0.5 bg-accent/90 text-accent-text px-1 rounded">
                        <CheckmarkIcon className="w-2.5 h-2.5" />
                      </div>
                    )}
                    {watchProgress > 0 && !video.watched && (
                      <div className="watch-progress-bar">
                        <div className="watch-progress-bar-fill" style={{ width: `${watchProgress}%` }} />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <h3 className={`text-sm font-medium line-clamp-2 leading-tight ${isCurrent ? 'text-accent-text' : 'text-text-primary'}`}>
                      {video.title}
                    </h3>
                    <p className="text-xs text-text-secondary mt-1">{video.channel_title}</p>
                  </div>
                  {isCurrent && <PlayIcon className="w-5 h-5 text-accent flex-shrink-0 self-center" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav queueCount={queueCount} />

      {/* Delete Confirmation Dialog */}
      {currentVideo && (
        <ConfirmDialog
          isOpen={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={handleDelete}
          title="Delete Video"
          message={`Are you sure you want to delete "${currentVideo.title}"? This will permanently remove the video file from your system.`}
          confirmText="Delete"
          cancelText="Cancel"
          isDanger={true}
        />
      )}

      {/* Add to Playlist Menu */}
      {currentVideo && showPlaylistMenu && (
        <AddToPlaylistMenu
          videoId={currentVideo.id}
          video={currentVideo}
          triggerRef={addToPlaylistButtonRef}
          onClose={() => setShowPlaylistMenu(false)}
        />
      )}
    </div>
  );
}
