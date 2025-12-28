import { useEffect, useRef } from 'react';
import videojs from 'video.js';
import {
  SEEK_TIME_SECONDS,
  PROGRESS_SAVE_DEBOUNCE_MS,
  WATCHED_THRESHOLD,
  detectDeviceType,
  initializeMobileTouchControls,
  getVideoSource,
} from '../utils/videoPlayerUtils';
import { createTheaterButton, updateTheaterButtonState } from '../utils/createTheaterButton';

// Register theater button component once globally
let theaterButtonRegistered = false;

/**
 * Custom hook for initializing and managing a video.js player
 * Handles all common player setup, controls, and behaviors
 *
 * @param {Object} options - Configuration options
 * @param {Object} options.video - Video data object
 * @param {React.RefObject} options.videoRef - Ref to video element
 * @param {boolean} options.saveProgress - Whether to save playback progress
 * @param {Function} options.onEnded - Callback when video ends
 * @param {Function} options.onWatched - Callback when video reaches watched threshold
 * @param {Object} options.updateVideoMutation - React Query mutation for updating video
 * @param {boolean} options.isTheaterMode - Current theater mode state
 * @param {Function} options.setIsTheaterMode - Function to update theater mode state
 * @param {boolean} options.persistPlayer - If true, player persists across video changes (for playlists)
 * @returns {React.RefObject} Player reference
 */
export function useVideoJsPlayer({
  video,
  videoRef,
  saveProgress = true,
  onEnded = null,
  onWatched = null,
  updateVideoMutation = null,
  isTheaterMode = false,
  setIsTheaterMode = null,
  persistPlayer = false,
}) {
  const playerRef = useRef(null);
  const saveProgressTimeout = useRef(null);
  const hasMarkedWatchedRef = useRef(false);
  const videoDataRef = useRef(video);
  const updateVideoRef = useRef(updateVideoMutation);
  const seekDebounceTimeout = useRef(null);
  const isSeekingRef = useRef(false);

  // Keep refs up to date
  useEffect(() => {
    videoDataRef.current = video;
    updateVideoRef.current = updateVideoMutation;
  }, [video, updateVideoMutation]);

  useEffect(() => {
    if (!videoRef.current || !video) {
      return;
    }

    // Verify the video element is actually a valid video/audio element
    const elem = videoRef.current;

    if (!elem.tagName || (elem.tagName !== 'VIDEO' && elem.tagName !== 'AUDIO')) {
      console.warn('[useVideoJsPlayer] Invalid element type:', elem.tagName);
      return;
    }

    // For persistent players (playlists), don't reinitialize if player already exists
    if (persistPlayer && playerRef.current) {
      console.log('[useVideoJsPlayer] Persistent player exists, skipping reinitialization');
      return;
    }

    console.log('[useVideoJsPlayer] Initializing new video.js player');

    const { isMobile, isIOS } = detectDeviceType();

    // Register theater mode button component once globally
    if (!theaterButtonRegistered) {
      createTheaterButton();
      theaterButtonRegistered = true;
    }

    // Initialize player
    const player = videojs(videoRef.current, {
      controls: true,
      fluid: true,
      responsive: true,
      playbackRates: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
    });

    playerRef.current = player;
    console.log('[useVideoJsPlayer] Player initialized successfully. Player ID:', player.id());

    // Add theater button to control bar manually with options
    try {
      const theaterButton = player.controlBar.addChild('TheaterButton', {
        onToggle: (newMode) => {
          if (setIsTheaterMode) {
            setIsTheaterMode(newMode);
          }
        }
      });

      // Position it before fullscreen button
      const fullscreenToggle = player.controlBar.getChild('fullscreenToggle');
      if (fullscreenToggle) {
        const controlBarEl = player.controlBar.el();
        const fullscreenIndex = Array.from(controlBarEl.children).indexOf(fullscreenToggle.el());
        controlBarEl.insertBefore(theaterButton.el(), fullscreenToggle.el());
        console.log('[useVideoJsPlayer] Theater button positioned before fullscreen');
      }
    } catch (error) {
      console.error('[useVideoJsPlayer] Error adding theater button:', error);
    }

    // Set initial video source
    if (video.file_path) {
      const videoSrc = getVideoSource(video.file_path);
      if (videoSrc) {
        console.log('[useVideoJsPlayer] Setting initial video source:', videoSrc);
        player.src({ src: videoSrc, type: 'video/mp4' });
      } else {
        console.warn('[useVideoJsPlayer] No video source found for:', video.file_path);
      }
    }

    // iOS-specific handling
    if (isIOS) {
      player.tech(true).el().setAttribute('playsinline', 'true');
      player.tech(true).el().setAttribute('webkit-playsinline', 'true');
    }

    // Debounced seek function to prevent rapid seeks from causing errors
    const debouncedSeek = (offsetSeconds) => {
      if (isSeekingRef.current) return; // Ignore if already seeking

      isSeekingRef.current = true;

      const currentTime = player.currentTime();
      const duration = player.duration();
      const newTime = offsetSeconds > 0
        ? Math.min(duration, currentTime + offsetSeconds)
        : Math.max(0, currentTime + offsetSeconds);

      player.currentTime(newTime);

      // Clear existing timeout
      if (seekDebounceTimeout.current) {
        clearTimeout(seekDebounceTimeout.current);
      }

      // Allow next seek after short delay
      seekDebounceTimeout.current = setTimeout(() => {
        isSeekingRef.current = false;
      }, 100); // 100ms debounce
    };

    // Keyboard shortcuts
    const handleKeyPress = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      const key = e.key.toLowerCase();

      switch (key) {
        case ' ':
        case 'k':
          e.preventDefault();
          if (player.paused()) {
            player.play();
          } else {
            player.pause();
          }
          break;
        case 'arrowleft':
        case 'j':
          e.preventDefault();
          debouncedSeek(-SEEK_TIME_SECONDS);
          break;
        case 'arrowright':
        case 'l':
          e.preventDefault();
          debouncedSeek(SEEK_TIME_SECONDS);
          break;
        case 'f':
          e.preventDefault();
          if (player.isFullscreen()) {
            player.exitFullscreen();
          } else {
            player.requestFullscreen();
          }
          break;
        case 'm':
          e.preventDefault();
          player.muted(!player.muted());
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
          const percent = parseInt(key) / 10;
          player.currentTime(player.duration() * percent);
          break;
        default:
          break;
      }
    };

    document.addEventListener('keydown', handleKeyPress);

    // Mobile touch controls
    let cleanupTouchControls = null;
    if (isMobile) {
      cleanupTouchControls = initializeMobileTouchControls(player, isIOS);
    }

    // Error handling
    player.on('error', () => {
      const error = player.error();
      if (!error) return;

      console.error('Video.js error:', {
        code: error.code,
        message: error.message,
        type: error.type,
      });

      let userMessage = 'Video playback error';

      switch (error.code) {
        case 1:
          userMessage = 'Video loading was aborted';
          break;
        case 2:
          userMessage = 'Network error occurred while loading video';
          break;
        case 3:
          userMessage = 'Video decoding failed. The file may be corrupted';
          break;
        case 4:
          userMessage = 'Video format not supported by your browser';
          if (isIOS) {
            userMessage += '. On iOS, try opening in Safari';
          }
          break;
        default:
          userMessage = error.message || 'Unknown video error';
      }

      console.error('User-facing error:', userMessage);
    });

    // Progress saving (if enabled)
    if (saveProgress && updateVideoRef.current) {
      player.on('timeupdate', () => {
        if (!player || player.seeking()) return;

        const currentTime = player.currentTime();
        const currentTimeFloor = Math.floor(currentTime);

        if (saveProgressTimeout.current) {
          clearTimeout(saveProgressTimeout.current);
        }

        saveProgressTimeout.current = setTimeout(() => {
          if (updateVideoRef.current && videoDataRef.current) {
            updateVideoRef.current.mutate({
              id: videoDataRef.current.id,
              data: { playback_seconds: currentTimeFloor },
            });
          }
        }, PROGRESS_SAVE_DEBOUNCE_MS);
      });

      // Restore saved position
      player.on('loadedmetadata', () => {
        const duration = player.duration();
        const savedPosition = video.playback_seconds || 0;

        if (savedPosition > 0 && savedPosition < duration - 5) {
          console.log(`Restoring playback position: ${savedPosition}s`);
          player.currentTime(savedPosition);
        }
      });
    } else {
      // Playlist mode - always start from beginning
      player.on('loadedmetadata', () => {
        console.log('Starting video from beginning (playlist mode)');
        player.currentTime(0);
      });
    }

    // Watched threshold detection
    player.on('timeupdate', () => {
      if (hasMarkedWatchedRef.current) return;

      const currentTime = player.currentTime();
      const duration = player.duration();

      if (duration > 0 && currentTime / duration >= WATCHED_THRESHOLD) {
        hasMarkedWatchedRef.current = true;
        if (onWatched) {
          onWatched();
        }
      }
    });

    // Handle video end
    if (onEnded) {
      player.on('ended', () => {
        onEnded();
      });
    }

    // Cleanup
    return () => {
      // For persistent players, DON'T dispose on video change - just clean up event listeners
      if (persistPlayer) {
        // Still clean up timeouts and listeners, but keep the player
        if (saveProgressTimeout.current) {
          clearTimeout(saveProgressTimeout.current);
        }
        if (seekDebounceTimeout.current) {
          clearTimeout(seekDebounceTimeout.current);
        }
        // Don't remove keyboard listener or dispose player for persistent players
        return;
      }

      // Non-persistent players: full cleanup
      if (saveProgressTimeout.current) {
        clearTimeout(saveProgressTimeout.current);
      }
      if (seekDebounceTimeout.current) {
        clearTimeout(seekDebounceTimeout.current);
      }
      if (cleanupTouchControls) {
        cleanupTouchControls();
      }
      document.removeEventListener('keydown', handleKeyPress);
      if (playerRef.current) {
        console.log('[useVideoJsPlayer] Disposing player');
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, persistPlayer
    ? [video?.id] // Persistent: run when video first available, guard prevents reinit
    : [video?.id]); // Non-persistent: reinit on video change

  // Component unmount cleanup: Always pause and dispose player when leaving the page
  useEffect(() => {
    return () => {
      console.log('[useVideoJsPlayer] Component unmounting, cleaning up player');
      if (playerRef.current && !playerRef.current.isDisposed()) {
        console.log('[useVideoJsPlayer] Pausing and disposing player on unmount');
        playerRef.current.pause();
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, []); // Empty deps = only runs on component mount/unmount

  // Update theater button state when mode changes
  useEffect(() => {
    if (playerRef.current) {
      updateTheaterButtonState(playerRef.current, isTheaterMode);
    }
  }, [isTheaterMode]);

  return playerRef;
}
