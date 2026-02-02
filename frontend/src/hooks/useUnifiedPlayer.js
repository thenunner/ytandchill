import { useEffect, useRef, useCallback, useState } from 'react';

const SEEK_TIME_SECONDS = 10;
const PROGRESS_SAVE_DEBOUNCE_MS = 3000;
const WATCHED_THRESHOLD = 0.9;

/**
 * Unified native video player hook - replaces Video.js for faster playback
 * Works on both desktop and mobile with custom controls
 */
export function useUnifiedPlayer({
  video,
  videoRef,
  saveProgress = true,
  onEnded = null,
  onWatched = null,
  updateVideoMutation = null,
  isTheaterMode = false,
  setIsTheaterMode = null,
  autoplay = true,
}) {
  // State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isBuffering, setIsBuffering] = useState(true);

  // Refs
  const saveProgressTimeout = useRef(null);
  const hasMarkedWatchedRef = useRef(false);
  const controlsTimeoutRef = useRef(null);
  const sponsorSkipCooldownRef = useRef(0);
  const videoDataRef = useRef(video);
  const updateVideoRef = useRef(updateVideoMutation);
  const onEndedRef = useRef(onEnded);
  const onWatchedRef = useRef(onWatched);
  const autoplayRef = useRef(autoplay);
  const clickTimeoutRef = useRef(null);
  const lastClickTimeRef = useRef(0);

  // Keep refs updated
  useEffect(() => {
    videoDataRef.current = video;
    updateVideoRef.current = updateVideoMutation;
    onEndedRef.current = onEnded;
    onWatchedRef.current = onWatched;
    autoplayRef.current = autoplay;
  }, [video, updateVideoMutation, onEnded, onWatched, autoplay]);

  // Get video source URL - uses dedicated media port (4100) for faster loading
  // Separating media from API prevents video requests from queueing behind API calls
  const getVideoSource = useCallback((filePath) => {
    if (!filePath) return null;
    const pathParts = filePath.replace(/\\/g, '/').split('/');
    const downloadsIndex = pathParts.indexOf('downloads');
    const relativePath = downloadsIndex >= 0
      ? pathParts.slice(downloadsIndex + 1).join('/')
      : pathParts.slice(-2).join('/');
    // Use /media/ endpoint which routes to dedicated media server on port 4100
    return `/media/${relativePath}`;
  }, []);

  // Save progress immediately
  const saveProgressNow = useCallback(() => {
    if (!saveProgress || !updateVideoRef.current || !videoDataRef.current) return;
    const videoEl = videoRef.current;
    if (!videoEl) return;

    const time = Math.floor(videoEl.currentTime);
    updateVideoRef.current.mutate({
      id: videoDataRef.current.id,
      data: { playback_seconds: time },
    });
  }, [saveProgress, videoRef]);

  // Debounced progress save
  const saveProgressDebounced = useCallback(() => {
    if (saveProgressTimeout.current) {
      clearTimeout(saveProgressTimeout.current);
    }
    saveProgressTimeout.current = setTimeout(saveProgressNow, PROGRESS_SAVE_DEBOUNCE_MS);
  }, [saveProgressNow]);

  // Playback controls
  const play = useCallback(() => {
    const videoEl = videoRef.current;
    if (videoEl) {
      videoEl.play().catch(() => {
        console.log('[useUnifiedPlayer] Autoplay blocked');
      });
    }
  }, [videoRef]);

  const pause = useCallback(() => {
    const videoEl = videoRef.current;
    if (videoEl) {
      videoEl.pause();
    }
  }, [videoRef]);

  const togglePlay = useCallback(() => {
    const videoEl = videoRef.current;
    if (videoEl) {
      if (videoEl.paused) {
        play();
      } else {
        pause();
      }
    }
  }, [videoRef, play, pause]);

  const seek = useCallback((time) => {
    const videoEl = videoRef.current;
    if (videoEl && duration) {
      const newTime = Math.max(0, Math.min(time, duration));
      videoEl.currentTime = newTime;
    }
  }, [videoRef, duration]);

  const seekRelative = useCallback((delta) => {
    const videoEl = videoRef.current;
    if (videoEl) {
      seek(videoEl.currentTime + delta);
    }
  }, [videoRef, seek]);

  const setSpeed = useCallback((rate) => {
    const videoEl = videoRef.current;
    if (videoEl) {
      videoEl.playbackRate = rate;
      setPlaybackRate(rate);
    }
  }, [videoRef]);

  const toggleMute = useCallback(() => {
    const videoEl = videoRef.current;
    if (videoEl) {
      videoEl.muted = !videoEl.muted;
      setIsMuted(videoEl.muted);
    }
  }, [videoRef]);

  const setVideoVolume = useCallback((vol) => {
    const videoEl = videoRef.current;
    if (videoEl) {
      videoEl.volume = Math.max(0, Math.min(1, vol));
      setVolume(videoEl.volume);
    }
  }, [videoRef]);

  const toggleFullscreen = useCallback(() => {
    const container = videoRef.current?.parentElement;
    if (!container) return;

    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      container.requestFullscreen().catch(() => {});
    }
  }, [videoRef]);

  const toggleTheaterMode = useCallback(() => {
    if (setIsTheaterMode) {
      const newMode = !isTheaterMode;
      setIsTheaterMode(newMode);
      localStorage.setItem('theaterMode', String(newMode));
    }
  }, [isTheaterMode, setIsTheaterMode]);

  // Controls visibility
  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      const videoEl = videoRef.current;
      if (videoEl && !videoEl.paused) {
        setShowControls(false);
      }
    }, 2500);
  }, [videoRef]);

  // Smart click handler: single-click = play/pause, double-click = fullscreen
  // Uses a small delay to distinguish between single and double clicks
  const handleVideoClick = useCallback((e) => {
    // Prevent click from propagating to parent elements
    e.stopPropagation();

    const now = Date.now();
    const timeSinceLastClick = now - lastClickTimeRef.current;

    if (timeSinceLastClick < 300) {
      // Double-click detected - toggle fullscreen
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }
      toggleFullscreen();
    } else {
      // Single-click - delay to check for double-click
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
      clickTimeoutRef.current = setTimeout(() => {
        togglePlay();
        clickTimeoutRef.current = null;
      }, 200);
    }

    lastClickTimeRef.current = now;
    showControlsTemporarily();
  }, [togglePlay, toggleFullscreen, showControlsTemporarily]);

  // SponsorBlock skip check
  const checkSponsorBlock = useCallback((time) => {
    const segments = videoDataRef.current?.sponsorblock_segments || [];
    if (segments.length === 0) return;

    const now = Date.now();
    if (now - sponsorSkipCooldownRef.current < 2000) return;

    for (const segment of segments) {
      if (time >= segment.start && time < segment.end - 0.5) {
        const videoEl = videoRef.current;
        if (videoEl) {
          console.log(`[SponsorBlock] Skipping ${segment.category}: ${segment.start.toFixed(1)}s -> ${segment.end.toFixed(1)}s`);
          videoEl.currentTime = segment.end;
          sponsorSkipCooldownRef.current = now;
        }
        break;
      }
    }
  }, [videoRef]);

  // Initialize video element
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !video?.file_path) {
      console.log('[useUnifiedPlayer] Waiting for video element or file_path', { hasVideoEl: !!videoEl, filePath: video?.file_path });
      return;
    }

    const initTime = performance.now();
    console.log('[Timing] === PLAYER INIT ===');
    console.log('[Timing] api_to_source_set: Starting (playback data received)');

    // Build video source URL
    // Uses /media/ endpoint - HTTP/2 multiplexes all requests, no separate port needed
    const filePath = video.file_path;
    const pathParts = filePath.replace(/\\/g, '/').split('/');
    const downloadsIndex = pathParts.indexOf('downloads');
    const relativePath = downloadsIndex >= 0
      ? pathParts.slice(downloadsIndex + 1).join('/')
      : pathParts.slice(-2).join('/');

    // Get saved position and SponsorBlock segments
    let savedTime = video.playback_seconds || 0;
    const segments = video.sponsorblock_segments || [];

    // SponsorBlock pre-skip: if resuming near the start and there's an intro sponsor, skip it
    // This allows the video to start past the sponsor segment at the network level
    let effectiveStartTime = savedTime;
    if (savedTime < 5 && segments.length > 0) {
      // Sort segments by start time to find the first one
      const sortedSegments = [...segments].sort((a, b) => a.start - b.start);
      const firstSegment = sortedSegments[0];

      // If first segment starts within 1 second of video start, skip past it
      if (firstSegment && firstSegment.start <= 1) {
        effectiveStartTime = Math.max(savedTime, firstSegment.end);
        console.log(`[useUnifiedPlayer] SponsorBlock pre-skip: ${firstSegment.category} (0-${firstSegment.end.toFixed(1)}s)`);
      }
    }

    // Build video source with media fragment for instant seeking
    // Media fragments (#t=seconds) tell the browser to seek at the network level,
    // forcing byte-range requests that start playback faster
    // ALWAYS use a fragment - even #t=0.01 triggers faster loading than no fragment
    let videoSrc = `/media/${relativePath}`;
    const fragmentTime = Math.max(0.01, effectiveStartTime);
    videoSrc += `#t=${fragmentTime.toFixed(2)}`;
    console.log(`[useUnifiedPlayer] Using media fragment #t=${fragmentTime.toFixed(2)}`);
    if (effectiveStartTime > 0) {
      console.log(`[useUnifiedPlayer] Resuming from ${effectiveStartTime.toFixed(1)}s`);
    }

    console.log('[Timing] api_to_source_set:', `${(performance.now() - initTime).toFixed(0)}ms`);
    console.log('[Timing] Setting video source:', videoSrc);

    // Reset state for new video
    setIsBuffering(true);
    setCurrentTime(0);
    setDuration(0);
    hasMarkedWatchedRef.current = false;

    // Track source set time for first-frame timing
    const sourceSetTime = performance.now();

    // Set source and load
    videoEl.src = videoSrc;
    videoEl.load();

    // Load default playback speed from localStorage
    const savedSpeed = localStorage.getItem('playbackSpeed');
    if (savedSpeed) {
      const rate = parseFloat(savedSpeed);
      if (!isNaN(rate) && rate >= 0.5 && rate <= 3) {
        videoEl.playbackRate = rate;
        setPlaybackRate(rate);
      }
    }

    // Track the effective start time for the metadata handler
    const targetStartTime = effectiveStartTime;

    // Track if first frame has been logged
    let firstFrameLogged = false;

    // Event handlers
    const handleLoadedMetadata = () => {
      console.log('[Timing] loadedmetadata:', `${(performance.now() - sourceSetTime).toFixed(0)}ms since source set`);
      metadataLoaded = true;
      setDuration(videoEl.duration);
      setIsBuffering(false);

      // With media fragments, the browser already positioned us at the target time
      // Only manually seek if we didn't use a fragment (targetStartTime < 5)
      // or if the fragment didn't work (currentTime is far from target)
      const currentPos = videoEl.currentTime;
      if (targetStartTime >= 5 && Math.abs(currentPos - targetStartTime) > 2) {
        // Fragment didn't work, manually seek
        console.log(`[useUnifiedPlayer] Fragment seek fallback: ${currentPos.toFixed(1)}s -> ${targetStartTime.toFixed(1)}s`);
        videoEl.currentTime = targetStartTime;
      }

      // Autoplay immediately after metadata
      if (autoplayRef.current) {
        videoEl.play().catch((err) => {
          console.log('[useUnifiedPlayer] Autoplay blocked:', err.message);
        });
      }
    };

    const handleError = (e) => {
      console.error('[useUnifiedPlayer] Video error:', videoEl.error);
      setIsBuffering(false);
    };

    // Inline save progress function for use in handlers
    const doSaveProgress = () => {
      if (!updateVideoRef.current || !videoDataRef.current) return;
      const time = Math.floor(videoEl.currentTime);
      updateVideoRef.current.mutate({
        id: videoDataRef.current.id,
        data: { playback_seconds: time },
      });
    };

    // Debounced save
    const debouncedSave = () => {
      if (saveProgressTimeout.current) {
        clearTimeout(saveProgressTimeout.current);
      }
      saveProgressTimeout.current = setTimeout(doSaveProgress, PROGRESS_SAVE_DEBOUNCE_MS);
    };

    // SponsorBlock check - only after metadata is loaded
    let metadataLoaded = false;
    const doCheckSponsorBlock = (time) => {
      if (!metadataLoaded) return; // Don't skip before video is ready
      const segments = videoDataRef.current?.sponsorblock_segments || [];
      if (segments.length === 0) return;
      const now = Date.now();
      if (now - sponsorSkipCooldownRef.current < 2000) return;
      for (const segment of segments) {
        if (time >= segment.start && time < segment.end - 0.5) {
          console.log(`[SponsorBlock] Skipping ${segment.category}`);
          videoEl.currentTime = segment.end;
          sponsorSkipCooldownRef.current = now;
          break;
        }
      }
    };

    const handleTimeUpdate = () => {
      const time = videoEl.currentTime;
      setCurrentTime(time);
      debouncedSave();
      doCheckSponsorBlock(time);

      // Check watched threshold
      if (!hasMarkedWatchedRef.current && videoEl.duration > 0) {
        if (time / videoEl.duration >= WATCHED_THRESHOLD) {
          hasMarkedWatchedRef.current = true;
          if (onWatchedRef.current) onWatchedRef.current();
        }
      }
    };

    const handlePlay = () => {
      setIsPlaying(true);
      setShowControls(true);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = setTimeout(() => {
        if (!videoEl.paused) setShowControls(false);
      }, 2500);
    };

    const handlePause = () => {
      setIsPlaying(false);
      setShowControls(true);
      doSaveProgress();
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setShowControls(true);
      if (onEndedRef.current) onEndedRef.current();
    };

    const handleSeeked = () => {
      doSaveProgress();
    };

    const handleWaiting = () => {
      setIsBuffering(true);
    };

    const handleCanPlay = () => {
      console.log('[Timing] canplay:', `${(performance.now() - sourceSetTime).toFixed(0)}ms since source set`);
      setIsBuffering(false);

      // Aggressive autoplay - try as soon as data is available
      // This can fire before loadedmetadata on some browsers
      if (autoplayRef.current && videoEl.paused) {
        videoEl.play().catch(() => {
          // Silently ignore - loadedmetadata handler will try again
        });
      }
    };

    // Track first frame - "playing" event fires when playback actually starts
    const handlePlaying = () => {
      if (!firstFrameLogged) {
        firstFrameLogged = true;
        console.log('[Timing] source_set_to_first_frame:', `${(performance.now() - sourceSetTime).toFixed(0)}ms`);
        console.log('[Timing] total_init_to_first_frame:', `${(performance.now() - initTime).toFixed(0)}ms`);
      }
    };

    const handleLoadStart = () => {
      console.log('[Timing] loadstart:', `${(performance.now() - sourceSetTime).toFixed(0)}ms since source set`);
    };

    const handleVolumeChange = () => {
      setVolume(videoEl.volume);
      setIsMuted(videoEl.muted);
    };

    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    // Add event listeners
    videoEl.addEventListener('loadstart', handleLoadStart);
    videoEl.addEventListener('loadedmetadata', handleLoadedMetadata);
    videoEl.addEventListener('timeupdate', handleTimeUpdate);
    videoEl.addEventListener('play', handlePlay);
    videoEl.addEventListener('playing', handlePlaying);
    videoEl.addEventListener('pause', handlePause);
    videoEl.addEventListener('ended', handleEnded);
    videoEl.addEventListener('seeked', handleSeeked);
    videoEl.addEventListener('waiting', handleWaiting);
    videoEl.addEventListener('canplay', handleCanPlay);
    videoEl.addEventListener('volumechange', handleVolumeChange);
    videoEl.addEventListener('error', handleError);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    // Cleanup
    return () => {
      videoEl.removeEventListener('loadstart', handleLoadStart);
      videoEl.removeEventListener('loadedmetadata', handleLoadedMetadata);
      videoEl.removeEventListener('timeupdate', handleTimeUpdate);
      videoEl.removeEventListener('play', handlePlay);
      videoEl.removeEventListener('playing', handlePlaying);
      videoEl.removeEventListener('pause', handlePause);
      videoEl.removeEventListener('ended', handleEnded);
      videoEl.removeEventListener('seeked', handleSeeked);
      videoEl.removeEventListener('waiting', handleWaiting);
      videoEl.removeEventListener('canplay', handleCanPlay);
      videoEl.removeEventListener('volumechange', handleVolumeChange);
      videoEl.removeEventListener('error', handleError);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);

      if (saveProgressTimeout.current) {
        clearTimeout(saveProgressTimeout.current);
      }
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
    // Only re-run when video ID or file path changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video?.id, video?.file_path]);

  // Keyboard shortcuts (desktop only)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      const key = e.key.toLowerCase();

      switch (key) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'arrowleft':
        case 'j':
          e.preventDefault();
          seekRelative(-SEEK_TIME_SECONDS);
          break;
        case 'arrowright':
        case 'l':
          e.preventDefault();
          seekRelative(SEEK_TIME_SECONDS);
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 't':
          e.preventDefault();
          toggleTheaterMode();
          break;
        case 'm':
          e.preventDefault();
          toggleMute();
          break;
        case '0':
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7':
        case '8':
        case '9':
          e.preventDefault();
          if (duration) {
            seek((parseInt(key) / 10) * duration);
          }
          break;
        default:
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, seekRelative, toggleFullscreen, toggleTheaterMode, toggleMute, seek, duration]);

  // Save on page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveProgressNow();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveProgressNow]);

  // Mouse movement shows controls
  useEffect(() => {
    const container = videoRef.current?.parentElement;
    if (!container) return;

    const handleMouseMove = () => {
      showControlsTemporarily();
    };

    container.addEventListener('mousemove', handleMouseMove);
    return () => container.removeEventListener('mousemove', handleMouseMove);
  }, [videoRef, showControlsTemporarily]);

  return {
    // State
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    playbackRate,
    isFullscreen,
    showControls,
    isBuffering,
    isTheaterMode,

    // Actions
    play,
    pause,
    togglePlay,
    seek,
    seekRelative,
    setSpeed,
    toggleMute,
    setVolume: setVideoVolume,
    toggleFullscreen,
    toggleTheaterMode,
    showControlsTemporarily,
    handleVideoClick,  // Smart click: single=play/pause, double=fullscreen

    // Data
    sponsorSegments: video?.sponsorblock_segments || [],
  };
}
