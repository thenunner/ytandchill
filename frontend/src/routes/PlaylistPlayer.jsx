import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import Plyr from 'plyr';
import 'plyr/dist/plyr.css';
import { usePlaylist, useUpdateVideo, usePlaylists } from '../api/queries';
import { useNotification } from '../contexts/NotificationContext';

export default function PlaylistPlayer() {
  const { playlistId, categoryId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showNotification } = useNotification();

  // Get starting video and shuffle param from URL if provided
  const startVideoId = searchParams.get('v');
  const startShuffled = searchParams.get('shuffle') === 'true';

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLooping, setIsLooping] = useState(() => {
    const saved = localStorage.getItem('playlistLoop');
    return saved === 'true';
  });
  const [isShuffled, setIsShuffled] = useState(startShuffled);
  const [shuffledOrder, setShuffledOrder] = useState([]);
  const [showMobileQueue, setShowMobileQueue] = useState(false);

  const videoRef = useRef(null);
  const plyrInstanceRef = useRef(null);
  const saveProgressTimeout = useRef(null);
  const sidebarRef = useRef(null);
  const mobileQueueRef = useRef(null);
  const preloadVideoRef = useRef(null); // Hidden video for preloading next

  const updateVideo = useUpdateVideo();

  // Fetch single playlist videos
  const { data: singlePlaylistData } = usePlaylist(
    playlistId && !categoryId ? playlistId : null
  );

  // Fetch all playlists (for category mode)
  const { data: allPlaylists } = usePlaylists();

  // Get videos based on mode (single playlist or category)
  const { videos, sourceTitle, backUrl } = useMemo(() => {
    if (playlistId && singlePlaylistData) {
      // Single playlist mode
      const vids = (singlePlaylistData.videos || []).filter(v => v.status === 'library' && v.file_path);
      return {
        videos: vids,
        sourceTitle: singlePlaylistData.name || 'Playlist',
        backUrl: `/playlist/${playlistId}`
      };
    }

    if (categoryId && allPlaylists) {
      // Category mode - combine all videos from playlists in this category
      const catId = parseInt(categoryId, 10);
      if (!isNaN(catId)) {
        const categoryPlaylists = allPlaylists.filter(p => p.category_id === catId);
        const categoryName = categoryPlaylists[0]?.category_name || 'Category';
        return {
          videos: [],
          sourceTitle: categoryName,
          backUrl: '/library?tab=playlists'
        };
      }
    }

    return { videos: [], sourceTitle: 'Queue', backUrl: '/library' };
  }, [playlistId, categoryId, singlePlaylistData, allPlaylists]);

  // For category mode, we need to fetch all playlist videos
  const [categoryVideos, setCategoryVideos] = useState([]);
  const [categoryTitle, setCategoryTitle] = useState('');
  const [isLoadingCategory, setIsLoadingCategory] = useState(false);

  useEffect(() => {
    if (categoryId && allPlaylists) {
      const fetchCategoryVideos = async () => {
        setIsLoadingCategory(true);
        const catId = parseInt(categoryId, 10);
        if (isNaN(catId)) {
          setIsLoadingCategory(false);
          return;
        }

        const categoryPlaylists = allPlaylists.filter(p => p.category_id === catId);

        if (categoryPlaylists.length > 0) {
          setCategoryTitle(categoryPlaylists[0].category_name || 'Category');

          // Fetch videos from all playlists in parallel
          const fetchPromises = categoryPlaylists.map(async (playlist) => {
            try {
              const response = await fetch(`/api/playlists/${playlist.id}`);
              if (!response.ok) {
                console.error(`Failed to fetch playlist ${playlist.id}: ${response.status}`);
                return [];
              }
              const data = await response.json();
              if (data.videos) {
                const playableVideos = data.videos.filter(v => v.status === 'library' && v.file_path);
                return playableVideos.map(v => ({ ...v, playlistName: playlist.name }));
              }
              return [];
            } catch (error) {
              console.error(`Failed to fetch playlist ${playlist.id}:`, error);
              return [];
            }
          });

          const results = await Promise.all(fetchPromises);
          const allVideos = results.flat();
          setCategoryVideos(allVideos);
        }
        setIsLoadingCategory(false);
      };

      fetchCategoryVideos();
    }
  }, [categoryId, allPlaylists]);

  // Final videos list
  const finalVideos = useMemo(() => {
    if (categoryId) return categoryVideos;
    return videos;
  }, [categoryId, categoryVideos, videos]);

  const finalTitle = categoryId ? categoryTitle : sourceTitle;
  const finalBackUrl = categoryId ? '/library?tab=playlists' : backUrl;

  // Get display order (original or shuffled)
  const displayOrder = useMemo(() => {
    if (isShuffled && shuffledOrder.length === finalVideos.length && finalVideos.length > 0) {
      return shuffledOrder;
    }
    return finalVideos.map((_, i) => i);
  }, [isShuffled, shuffledOrder, finalVideos.length]);

  // Current video based on index
  const currentVideo = useMemo(() => {
    if (finalVideos.length === 0) return null;
    const actualIndex = displayOrder[currentIndex];
    if (actualIndex === undefined) return finalVideos[0];
    return finalVideos[actualIndex];
  }, [finalVideos, displayOrder, currentIndex]);

  // Next video for preloading
  const nextVideo = useMemo(() => {
    if (finalVideos.length === 0) return null;
    const nextIndex = currentIndex + 1;
    if (nextIndex >= displayOrder.length) {
      // If looping, next is first video
      return isLooping ? finalVideos[displayOrder[0]] : null;
    }
    return finalVideos[displayOrder[nextIndex]];
  }, [finalVideos, displayOrder, currentIndex, isLooping]);

  // Set initial index based on startVideoId
  useEffect(() => {
    if (startVideoId && finalVideos.length > 0 && !isShuffled) {
      const videoId = parseInt(startVideoId, 10);
      if (!isNaN(videoId)) {
        const idx = finalVideos.findIndex(v => v.id === videoId);
        if (idx !== -1) {
          setCurrentIndex(idx);
        }
      }
    }
  }, [startVideoId, finalVideos, isShuffled]);

  // Initialize shuffle order when starting shuffled
  useEffect(() => {
    if (startShuffled && finalVideos.length > 0 && shuffledOrder.length === 0) {
      const indices = finalVideos.map((_, i) => i);
      // Fisher-Yates shuffle
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      setShuffledOrder(indices);
    }
  }, [startShuffled, finalVideos.length, shuffledOrder.length]);

  // Shuffle function
  const shuffleArray = useCallback((arr) => {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }, []);

  // Toggle shuffle
  const toggleShuffle = useCallback(() => {
    if (!isShuffled && finalVideos.length > 0) {
      const indices = finalVideos.map((_, i) => i);
      const currentActualIndex = displayOrder[currentIndex] ?? 0;
      const otherIndices = indices.filter(i => i !== currentActualIndex);
      const shuffled = [currentActualIndex, ...shuffleArray(otherIndices)];
      setShuffledOrder(shuffled);
      setCurrentIndex(0);
    }
    setIsShuffled(!isShuffled);
  }, [isShuffled, finalVideos, displayOrder, currentIndex, shuffleArray]);

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
    if (finalVideos.length === 0) return;

    if (currentIndex < displayOrder.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else if (isLooping) {
      setCurrentIndex(0);
      showNotification('Playlist restarted', 'info');
    }
  }, [currentIndex, displayOrder.length, isLooping, finalVideos.length, showNotification]);

  const goToPrevious = useCallback(() => {
    if (finalVideos.length === 0) return;

    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    } else if (isLooping) {
      setCurrentIndex(displayOrder.length - 1);
    }
  }, [currentIndex, displayOrder.length, isLooping, finalVideos.length]);

  const goToVideo = useCallback((index) => {
    setCurrentIndex(index);
    setShowMobileQueue(false);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      switch (e.key.toLowerCase()) {
        case 'n':
          e.preventDefault();
          goToNext();
          break;
        case 'p':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            goToPrevious();
          }
          break;
        case 'l':
          e.preventDefault();
          toggleLoop();
          break;
        case 's':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            toggleShuffle();
          }
          break;
        case 'escape':
          if (showMobileQueue) {
            setShowMobileQueue(false);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToNext, goToPrevious, toggleLoop, toggleShuffle, showMobileQueue]);

  // Track current video ID for event handlers
  const currentVideoIdRef = useRef(null);
  const hasMarkedWatchedRef = useRef(false);
  const goToNextRef = useRef(goToNext);

  // Keep goToNext ref updated
  useEffect(() => {
    goToNextRef.current = goToNext;
  }, [goToNext]);

  // Helper to construct video source URL
  const getVideoSrc = useCallback((video) => {
    if (!video?.file_path) return null;
    const pathParts = video.file_path.replace(/\\/g, '/').split('/');
    const downloadsIndex = pathParts.indexOf('downloads');
    const relativePath = downloadsIndex >= 0
      ? pathParts.slice(downloadsIndex + 1).join('/')
      : pathParts.slice(-2).join('/');
    return `/api/media/${relativePath}`;
  }, []);

  // Cleanup on unmount only (empty deps = runs once)
  useEffect(() => {
    return () => {
      if (saveProgressTimeout.current) {
        clearTimeout(saveProgressTimeout.current);
      }
      if (plyrInstanceRef.current) {
        plyrInstanceRef.current.destroy();
        plyrInstanceRef.current = null;
      }
      // Clean up preload video
      if (preloadVideoRef.current) {
        preloadVideoRef.current.src = '';
        preloadVideoRef.current.load();
      }
    };
  }, []);

  // Initialize Plyr and update source when currentVideo changes
  useEffect(() => {
    if (!currentVideo || !videoRef.current) return;

    const videoSrc = getVideoSrc(currentVideo);
    if (!videoSrc) return;

    // Update refs for event handlers
    currentVideoIdRef.current = currentVideo.id;
    hasMarkedWatchedRef.current = currentVideo.watched || false;

    // Update URL
    setSearchParams({ v: currentVideo.id }, { replace: true });

    // If Plyr exists, just update source and autoplay
    if (plyrInstanceRef.current) {
      console.log('Updating Plyr source to:', videoSrc);
      plyrInstanceRef.current.source = {
        type: 'video',
        sources: [{ src: videoSrc, type: 'video/mp4' }],
      };
      // Autoplay after source loads
      plyrInstanceRef.current.once('loadedmetadata', () => {
        if (currentVideo.playback_seconds > 0 && plyrInstanceRef.current) {
          plyrInstanceRef.current.currentTime = currentVideo.playback_seconds;
        }
        plyrInstanceRef.current?.play().catch(err => console.warn('Autoplay prevented:', err));
      });
      return;
    }

    // First time: Initialize Plyr
    console.log('Initializing Plyr with source:', videoSrc);

    const player = new Plyr(videoRef.current, {
      controls: [
        'play-large',
        'rewind',
        'play',
        'fast-forward',
        'progress',
        'current-time',
        'duration',
        'mute',
        'volume',
        'settings',
        'pip',
        'fullscreen',
      ],
      settings: ['speed'],
      speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] },
      seekTime: 10,
      autoplay: true,
      keyboard: { focused: true, global: false },
      fullscreen: { enabled: true, fallback: true, iosNative: true },
      tooltips: { controls: true, seek: true },
    });

    plyrInstanceRef.current = player;

    // Set source IMMEDIATELY
    player.source = {
      type: 'video',
      sources: [{ src: videoSrc, type: 'video/mp4' }],
    };

    // Restore playback position when metadata loads
    player.on('loadedmetadata', () => {
      const vid = finalVideos[displayOrder[currentIndex] ?? 0];
      if (vid?.playback_seconds > 0 && plyrInstanceRef.current) {
        plyrInstanceRef.current.currentTime = vid.playback_seconds;
      }
    });

    // Handle video end - advance to next
    player.on('ended', () => {
      goToNextRef.current();
    });

    // Save progress periodically
    player.on('timeupdate', () => {
      if (saveProgressTimeout.current) {
        clearTimeout(saveProgressTimeout.current);
      }

      const videoId = currentVideoIdRef.current;
      if (!videoId) return;

      saveProgressTimeout.current = setTimeout(() => {
        const time = Math.floor(plyrInstanceRef.current?.currentTime || 0);
        if (time > 0) {
          updateVideo.mutate({
            id: videoId,
            data: { playback_seconds: time },
          });
        }
      }, 5000);

      // Check for 90% watched
      if (!hasMarkedWatchedRef.current && plyrInstanceRef.current) {
        const time = plyrInstanceRef.current.currentTime;
        const duration = plyrInstanceRef.current.duration;
        if (duration > 0 && time >= duration * 0.9) {
          hasMarkedWatchedRef.current = true;
          updateVideo.mutate({
            id: videoId,
            data: { watched: true },
          });
        }
      }
    });
  }, [currentVideo?.id]);

  // Preload next video in queue for faster transitions
  useEffect(() => {
    if (!nextVideo || !preloadVideoRef.current) return;

    const nextSrc = getVideoSrc(nextVideo);
    if (!nextSrc) return;

    // Only preload if source is different
    if (preloadVideoRef.current.src !== nextSrc) {
      preloadVideoRef.current.src = nextSrc;
      preloadVideoRef.current.load();
    }
  }, [nextVideo?.id, getVideoSrc]);

  // Scroll current video into view
  useEffect(() => {
    const ref = showMobileQueue ? mobileQueueRef : sidebarRef;
    if (ref.current) {
      const currentItem = ref.current.querySelector('[data-current="true"]');
      if (currentItem) {
        currentItem.scrollIntoView({ behavior: 'auto', block: 'nearest' });
      }
    }
  }, [currentIndex, showMobileQueue]);

  const formatDuration = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return hrs > 0
      ? `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
      : `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Queue item component for reuse
  const QueueItem = ({ video, displayIdx, isCurrent, onClick }) => (
    <button
      key={`${video.id}-${displayIdx}`}
      data-current={isCurrent}
      onClick={onClick}
      aria-label={`Play ${video.title}`}
      aria-current={isCurrent ? 'true' : undefined}
      className={`w-full p-3 flex gap-3 text-left transition-colors ${
        isCurrent
          ? 'bg-accent/20 border-l-2 border-accent'
          : 'hover:bg-dark-hover border-l-2 border-transparent'
      }`}
    >
      {/* Thumbnail */}
      <div className="relative w-20 sm:w-24 flex-shrink-0">
        <div className="aspect-video bg-dark-tertiary rounded overflow-hidden">
          {video.thumb_url ? (
            <img
              src={video.thumb_url}
              alt={video.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <svg className="w-6 h-6 text-text-muted" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
              </svg>
            </div>
          )}
        </div>
        <div className="absolute bottom-1 right-1 bg-black/80 text-white text-xs px-1 rounded">
          {formatDuration(video.duration_sec)}
        </div>
        {isCurrent && (
          <div className="absolute inset-0 bg-accent/30 flex items-center justify-center rounded">
            <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
          </div>
        )}
      </div>

      {/* Video info */}
      <div className="flex-1 min-w-0 py-1">
        <p className={`text-sm font-medium line-clamp-2 ${
          isCurrent ? 'text-accent-text' : 'text-text-primary'
        }`}>
          {video.title}
        </p>
        <p className="text-xs text-text-secondary mt-1 truncate">
          {video.playlistName || video.channel_title || 'Video'}
        </p>
        {video.watched && (
          <span className="inline-flex items-center gap-1 text-xs text-accent-text mt-1">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Watched
          </span>
        )}
      </div>
    </button>
  );

  // Loading state
  if (isLoadingCategory || (!categoryId && !singlePlaylistData)) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin h-10 w-10 border-4 border-red-500 border-t-transparent rounded-full" role="status">
          <span className="sr-only">Loading...</span>
        </div>
      </div>
    );
  }

  if (finalVideos.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400 text-lg">No playable videos found</p>
        <p className="text-sm text-text-secondary mt-2">Videos must be downloaded to play</p>
        <button onClick={() => navigate(finalBackUrl)} className="btn btn-primary mt-4">
          Go Back
        </button>
      </div>
    );
  }

  if (!currentVideo) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400 text-lg">No video selected</p>
        <button onClick={() => navigate(-1)} className="btn btn-primary mt-4">
          Go Back
        </button>
      </div>
    );
  }

  const isLastVideo = currentIndex === displayOrder.length - 1;
  const isFirstVideo = currentIndex === 0;

  return (
    <div className="h-[calc(100vh-120px)] sm:h-[calc(100vh-140px)] flex flex-col animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 sm:gap-4 mb-3 sm:mb-4 flex-shrink-0">
        <button
          onClick={() => navigate(finalBackUrl)}
          className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors min-w-0"
          aria-label={`Back to ${finalTitle}`}
        >
          <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
          <span className="font-medium truncate">
            <span className="hidden sm:inline">Back to </span>{finalTitle}
          </span>
        </button>

        <div className="flex items-center gap-2">
          {/* Mobile Queue Progress */}
          <span className="md:hidden text-xs text-text-secondary bg-dark-secondary px-2 py-1 rounded">
            {currentIndex + 1}/{finalVideos.length}
          </span>

          {/* Mobile Queue Toggle */}
          <button
            onClick={() => setShowMobileQueue(true)}
            className="md:hidden p-3 rounded-lg bg-dark-secondary border border-dark-border text-text-secondary hover:text-text-primary transition-colors"
            aria-label="Show queue"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <line x1="8" y1="6" x2="21" y2="6"></line>
              <line x1="8" y1="12" x2="21" y2="12"></line>
              <line x1="8" y1="18" x2="21" y2="18"></line>
              <line x1="3" y1="6" x2="3.01" y2="6"></line>
              <line x1="3" y1="12" x2="3.01" y2="12"></line>
              <line x1="3" y1="18" x2="3.01" y2="18"></line>
            </svg>
          </button>

          {/* Shuffle Toggle */}
          <button
            onClick={toggleShuffle}
            className={`p-3 rounded-lg border transition-all ${
              isShuffled
                ? 'bg-accent/20 border-accent text-accent-text'
                : 'bg-dark-secondary border-dark-border text-text-secondary hover:text-text-primary hover:border-dark-border-light'
            }`}
            aria-label={`Shuffle ${isShuffled ? 'on' : 'off'}`}
            aria-pressed={isShuffled}
            title="Shuffle (S)"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <polyline points="16 3 21 3 21 8"></polyline>
              <line x1="4" y1="20" x2="21" y2="3"></line>
              <polyline points="21 16 21 21 16 21"></polyline>
              <line x1="15" y1="15" x2="21" y2="21"></line>
              <line x1="4" y1="4" x2="9" y2="9"></line>
            </svg>
          </button>

          {/* Loop Toggle */}
          <button
            onClick={toggleLoop}
            className={`p-3 rounded-lg border transition-all ${
              isLooping
                ? 'bg-accent/20 border-accent text-accent-text'
                : 'bg-dark-secondary border-dark-border text-text-secondary hover:text-text-primary hover:border-dark-border-light'
            }`}
            aria-label={`Loop ${isLooping ? 'on' : 'off'}`}
            aria-pressed={isLooping}
            title="Loop (L)"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <polyline points="17 1 21 5 17 9"></polyline>
              <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
              <polyline points="7 23 3 19 7 15"></polyline>
              <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
            </svg>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-col md:flex-row gap-4 flex-1 min-h-0">
        {/* Queue Sidebar - Desktop */}
        <div className="w-72 flex-shrink-0 bg-dark-secondary border border-dark-border rounded-xl overflow-hidden hidden md:flex flex-col">
          <div className="p-3 border-b border-dark-border bg-dark-tertiary">
            <h3 className="font-semibold text-text-primary">Queue</h3>
            <p className="text-xs text-text-secondary mt-1">
              {currentIndex + 1} of {finalVideos.length} videos
            </p>
          </div>

          <div ref={sidebarRef} className="flex-1 overflow-y-auto">
            {displayOrder.map((actualIndex, displayIdx) => {
              const video = finalVideos[actualIndex];
              if (!video) return null;
              const isCurrent = displayIdx === currentIndex;

              return (
                <QueueItem
                  key={`${video.id}-${displayIdx}`}
                  video={video}
                  displayIdx={displayIdx}
                  isCurrent={isCurrent}
                  onClick={() => goToVideo(displayIdx)}
                />
              );
            })}
          </div>
        </div>

        {/* Player Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Video Player */}
          <div className="bg-black rounded-xl overflow-hidden min-h-[300px] md:min-h-[400px]">
            <video
              ref={videoRef}
              className="w-full h-auto"
              playsInline
              preload="auto"
            />
            {/* Hidden preload video for next in queue */}
            <video
              ref={preloadVideoRef}
              className="hidden"
              preload="auto"
              muted
            />
          </div>

          {/* Controls Below Player */}
          <div className="mt-3 sm:mt-4 flex items-center justify-between">
            {/* Previous Button */}
            <button
              onClick={goToPrevious}
              disabled={isFirstVideo && !isLooping}
              aria-label="Previous video"
              aria-disabled={isFirstVideo && !isLooping}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2 rounded-lg transition-colors ${
                isFirstVideo && !isLooping
                  ? 'bg-dark-tertiary text-text-muted cursor-not-allowed'
                  : 'bg-dark-secondary border border-dark-border hover:bg-dark-hover text-text-primary'
              }`}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <polygon points="19 20 9 12 19 4 19 20"></polygon>
                <line x1="5" y1="19" x2="5" y2="5"></line>
              </svg>
              <span className="hidden sm:inline">Previous</span>
              <kbd className="hidden sm:inline-block ml-1 px-1.5 py-0.5 bg-dark-tertiary rounded text-xs text-text-secondary">P</kbd>
            </button>

            {/* Video Title */}
            <div className="flex-1 mx-2 sm:mx-4 text-center min-w-0">
              <h2 className="text-base sm:text-lg font-semibold text-text-primary truncate">
                {currentVideo.title}
              </h2>
              <p className="text-xs sm:text-sm text-text-secondary truncate">
                {currentVideo.playlistName || currentVideo.channel_title || 'Video'}
              </p>
            </div>

            {/* Next Button */}
            <button
              onClick={goToNext}
              disabled={isLastVideo && !isLooping}
              aria-label="Next video"
              aria-disabled={isLastVideo && !isLooping}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2 rounded-lg transition-colors ${
                isLastVideo && !isLooping
                  ? 'bg-dark-tertiary text-text-muted cursor-not-allowed'
                  : 'bg-dark-secondary border border-dark-border hover:bg-dark-hover text-text-primary'
              }`}
            >
              <span className="hidden sm:inline">Next</span>
              <kbd className="hidden sm:inline-block mr-1 px-1.5 py-0.5 bg-dark-tertiary rounded text-xs text-text-secondary">N</kbd>
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <polygon points="5 4 15 12 5 20 5 4"></polygon>
                <line x1="19" y1="5" x2="19" y2="19"></line>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Queue Drawer */}
      {showMobileQueue && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setShowMobileQueue(false)}
            aria-hidden="true"
          />

          {/* Drawer */}
          <div className="absolute inset-y-0 right-0 w-full max-w-sm bg-dark-secondary border-l border-dark-border flex flex-col animate-slide-in-right">
            <div className="p-4 border-b border-dark-border bg-dark-tertiary flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-text-primary">Queue</h3>
                <p className="text-xs text-text-secondary mt-1">
                  {currentIndex + 1} of {finalVideos.length} videos
                </p>
              </div>
              <button
                onClick={() => setShowMobileQueue(false)}
                className="p-2 rounded-lg hover:bg-dark-hover text-text-secondary hover:text-text-primary transition-colors"
                aria-label="Close queue"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <div ref={mobileQueueRef} className="flex-1 overflow-y-auto">
              {displayOrder.map((actualIndex, displayIdx) => {
                const video = finalVideos[actualIndex];
                if (!video) return null;
                const isCurrent = displayIdx === currentIndex;

                return (
                  <QueueItem
                    key={`mobile-${video.id}-${displayIdx}`}
                    video={video}
                    displayIdx={displayIdx}
                    isCurrent={isCurrent}
                    onClick={() => goToVideo(displayIdx)}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
