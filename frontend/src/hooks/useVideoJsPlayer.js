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
  const lastSeekTime = useRef(0);
  const isBuffering = useRef(false);
  const SEEK_COOLDOWN_MS = 1250; // Minimum 1250ms between seeks to prevent buffer corruption
  const pendingSeekOffset = useRef(0);
  const seekDebounceTimer = useRef(null);
  const SEEK_DEBOUNCE_MS = 400; // Wait 400ms of inactivity before seeking

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
      preload: 'metadata', // Preload metadata to show first frame
      poster: isMobile ? (video.thumb_url || '') : '', // Only show poster on mobile devices
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

        // When metadata loads, restore progress and prepare video frame
        player.one('loadedmetadata', () => {
          try {
            const duration = player.duration();

            // Restore saved progress position or start at beginning
            const startTime = (video.progress_sec && video.progress_sec > 0 && video.progress_sec < duration * 0.95)
              ? video.progress_sec
              : 0;

            if (startTime > 0) {
              console.log(`[useVideoJsPlayer] Restoring progress to ${startTime}s`);
            }

            player.currentTime(startTime);

            // On desktop: ensure video frame shows (no poster to remove since we didn't set one)
            // On mobile: poster will show until user taps play (iOS/mobile behavior)
            if (!isMobile) {
              // Load video to show first frame on desktop
              player.load();
              // Mark as started to ensure video frame is visible
              setTimeout(() => {
                try {
                  player.hasStarted(true);
                } catch (err) {
                  console.warn('[useVideoJsPlayer] Failed to mark as started:', err);
                }
              }, 100);
            }
          } catch (err) {
            console.warn('[useVideoJsPlayer] Failed to restore progress:', err);
          }
        });
      } else {
        console.warn('[useVideoJsPlayer] No video source found for:', video.file_path);
      }
    }

    // iOS-specific handling
    if (isIOS) {
      player.tech(true).el().setAttribute('playsinline', 'true');
      player.tech(true).el().setAttribute('webkit-playsinline', 'true');
    }

    // Immediate progress save function
    const saveProgressNow = () => {
      if (!saveProgress || !updateVideoRef.current || !videoDataRef.current || !player) return;

      try {
        const currentTime = Math.floor(player.currentTime());
        console.log(`[useVideoJsPlayer] Saving progress immediately: ${currentTime}s`);
        updateVideoRef.current.mutate({
          id: videoDataRef.current.id,
          data: { playback_seconds: currentTime },
        });
      } catch (error) {
        console.warn('[useVideoJsPlayer] Failed to save progress:', error);
      }
    };

    // Safe seek function with cooldown to prevent buffer corruption
    const safeSeek = (newTime) => {
      try {
        // Check if player exists
        if (!player) return;

        // CRITICAL: Enforce cooldown between seeks to prevent buffer corruption
        const now = Date.now();
        if (now - lastSeekTime.current < SEEK_COOLDOWN_MS) {
          console.log('[useVideoJsPlayer] Seek ignored - cooldown active');
          return;
        }

        // Cancel any pending debounced seeks when executing a direct seek
        if (seekDebounceTimer.current) {
          clearTimeout(seekDebounceTimer.current);
          seekDebounceTimer.current = null;
          pendingSeekOffset.current = 0;
        }

        // Don't seek if still buffering from previous seek
        if (isBuffering.current) {
          console.log('[useVideoJsPlayer] Seek ignored - still buffering');
          return;
        }

        // Check if metadata is loaded (readyState >= 1)
        const readyState = player.readyState();
        if (readyState < 1) {
          console.warn('[useVideoJsPlayer] Cannot seek - metadata not loaded');
          return;
        }

        const currentTime = player.currentTime();
        const duration = player.duration();

        // Don't seek if we don't have valid duration/currentTime
        if (!duration || isNaN(duration) || isNaN(currentTime) || duration === 0) {
          return;
        }

        // Don't seek if already seeking
        if (player.seeking && player.seeking()) {
          console.log('[useVideoJsPlayer] Seek ignored - already seeking');
          return;
        }

        // Check buffer health - but only if we recently seeked (within 10s)
        // After 10s of no seeking, allow seek even if fragmented (buffer may not auto-consolidate)
        const timeSinceLastSeek = now - lastSeekTime.current;
        if (timeSinceLastSeek < 10000) {
          try {
            const buffered = player.buffered();
            if (buffered && buffered.length > 5) {
              // More than 5 buffered ranges indicates fragmented buffer (stress)
              console.warn(`[useVideoJsPlayer] Seek ignored - buffer fragmented (${buffered.length} ranges)`);
              return;
            }
          } catch (e) {
            // buffered() can throw, ignore and proceed
          }
        }

        // Update last seek time BEFORE seeking
        lastSeekTime.current = now;

        // Clamp to valid range
        const clampedTime = Math.max(0, Math.min(duration, newTime));

        console.log(`[useVideoJsPlayer] Seeking: ${currentTime.toFixed(1)}s → ${clampedTime.toFixed(1)}s`);
        player.currentTime(clampedTime);
      } catch (error) {
        console.error('[useVideoJsPlayer] Seek error:', error);
      }
    };

    // True debounced seek - accumulates multiple rapid seeks into one
    const debouncedSeek = (offsetSeconds) => {
      if (!player) return;

      // Accumulate the seek offset
      pendingSeekOffset.current += offsetSeconds;

      console.log(`[useVideoJsPlayer] Seek offset accumulated: ${offsetSeconds}s (total pending: ${pendingSeekOffset.current}s)`);

      // Clear existing debounce timer
      if (seekDebounceTimer.current) {
        clearTimeout(seekDebounceTimer.current);
      }

      // Set new timer - execute after user stops pressing keys
      seekDebounceTimer.current = setTimeout(() => {
        const totalOffset = pendingSeekOffset.current;
        pendingSeekOffset.current = 0; // Reset accumulator

        if (totalOffset === 0) return;

        const currentTime = player.currentTime();
        const duration = player.duration();

        if (!duration || isNaN(duration) || isNaN(currentTime)) return;

        const newTime = Math.max(0, Math.min(duration, currentTime + totalOffset));

        console.log(`[useVideoJsPlayer] Executing accumulated seek: ${totalOffset}s (${currentTime.toFixed(1)}s → ${newTime.toFixed(1)}s)`);
        safeSeek(newTime);
      }, SEEK_DEBOUNCE_MS);
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
          const duration = player.duration();
          if (duration && !isNaN(duration)) {
            const percent = parseInt(key) / 10;
            const targetTime = duration * percent;
            safeSeek(targetTime);
          }
          break;
        default:
          break;
      }
    };

    document.addEventListener('keydown', handleKeyPress);

    // Track buffering state to prevent seeks during buffer
    player.on('waiting', () => {
      isBuffering.current = true;
      console.log('[useVideoJsPlayer] Buffering started');
    });

    player.on('canplay', () => {
      isBuffering.current = false;
      console.log('[useVideoJsPlayer] Buffering ended');
    });

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
      // Save immediately after any seek operation completes
      player.on('seeked', () => {
        saveProgressNow();
      });

      // Debounced save during normal playback
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

      // Save on pause as well
      player.on('pause', () => {
        saveProgressNow();
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
        if (seekDebounceTimer.current) {
          clearTimeout(seekDebounceTimer.current);
        }
        // Don't remove keyboard listener or dispose player for persistent players
        return;
      }

      // Non-persistent players: full cleanup
      if (saveProgressTimeout.current) {
        clearTimeout(saveProgressTimeout.current);
      }
      if (seekDebounceTimer.current) {
        clearTimeout(seekDebounceTimer.current);
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

  // Save progress before page unload (refresh/close)
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (playerRef.current && !playerRef.current.isDisposed() && saveProgress && updateVideoRef.current && videoDataRef.current) {
        try {
          const currentTime = Math.floor(playerRef.current.currentTime());
          console.log(`[useVideoJsPlayer] Saving progress on page unload: ${currentTime}s`);
          updateVideoRef.current.mutate({
            id: videoDataRef.current.id,
            data: { playback_seconds: currentTime },
          });
        } catch (error) {
          console.warn('[useVideoJsPlayer] Failed to save progress on unload:', error);
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [saveProgress]);

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
