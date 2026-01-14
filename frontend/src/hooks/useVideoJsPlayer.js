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
import '../plugins/videojs-seek-coordinator'; // Register plugin
import { SeekBackward10Button, SeekForward10Button } from '../utils/createSeekButtons'; // Register buttons

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
      preload: 'metadata', // Load metadata for seeking optimization
      poster: isMobile ? (video.thumb_url || '') : '', // Only show poster on mobile devices
      // Device-specific inactivity timeout for auto-hiding controls
      // Mobile: 0 = never auto-hide (controls always visible, except fullscreen)
      // Desktop/Tablet: 2000ms = hide after 2 seconds of inactivity
      inactivityTimeout: isMobile ? 0 : 2000,
      // Disable browser's native touch controls (we handle our own)
      nativeControlsForTouch: false,
      html5: {
        vhs: {
          overrideNative: false,
        },
        nativeVideoTracks: true,
        nativeAudioTracks: true,
      },
    });

    playerRef.current = player;
    console.log('[useVideoJsPlayer] Player initialized successfully. Player ID:', player.id());

    // Enable seek coordinator plugin
    player.seekCoordinator({
      snapBackward: 0.4,    // Snap 400ms backward for keyframes
      settleTime: 100,      // Wait 100ms after seeks (Chrome decoder settling)
      enabled: true,        // Enable plugin
      debug: false,         // Set to true for console logging
    });

    console.log('[useVideoJsPlayer] Seek coordinator plugin enabled');

    // ============================================
    // DEVICE-SPECIFIC CONTROL VISIBILITY BEHAVIOR
    // ============================================
    if (isMobile) {
      // Mobile: Controls always visible EXCEPT in fullscreen (YouTube-style)
      let mobileFullscreenTimeout = null;
      const MOBILE_FULLSCREEN_HIDE_DELAY = 2000;

      const showControlsTemporarily = () => {
        player.userActive(true);
        if (mobileFullscreenTimeout) {
          clearTimeout(mobileFullscreenTimeout);
        }
        mobileFullscreenTimeout = setTimeout(() => {
          if (player.isFullscreen() && !player.paused()) {
            player.userActive(false);
          }
        }, MOBILE_FULLSCREEN_HIDE_DELAY);
      };

      // Fullscreen change: toggle auto-hide behavior
      player.on('fullscreenchange', () => {
        if (player.isFullscreen()) {
          console.log('[useVideoJsPlayer] Mobile fullscreen: enabling auto-hide');
          showControlsTemporarily();
        } else {
          console.log('[useVideoJsPlayer] Mobile exit fullscreen: controls always visible');
          if (mobileFullscreenTimeout) {
            clearTimeout(mobileFullscreenTimeout);
          }
          player.userActive(true);
        }
      });

      // Touch in fullscreen shows controls temporarily
      player.on('touchstart', () => {
        if (player.isFullscreen()) {
          showControlsTemporarily();
        }
      });

      // Play in fullscreen starts hide timer
      player.on('play', () => {
        if (player.isFullscreen()) {
          showControlsTemporarily();
        }
      });

      // Pause in fullscreen keeps controls visible
      player.on('pause', () => {
        if (player.isFullscreen()) {
          if (mobileFullscreenTimeout) {
            clearTimeout(mobileFullscreenTimeout);
          }
          player.userActive(true);
        }
      });

      // Cleanup on dispose
      player.on('dispose', () => {
        if (mobileFullscreenTimeout) {
          clearTimeout(mobileFullscreenTimeout);
        }
      });
    } else {
      // Desktop/Tablet: Auto-hide controls even when paused
      // Video.js default keeps controls visible when paused, we override this
      let desktopHideTimeout = null;
      const DESKTOP_HIDE_DELAY = 2000;

      const hideControlsAfterDelay = () => {
        if (desktopHideTimeout) {
          clearTimeout(desktopHideTimeout);
        }
        desktopHideTimeout = setTimeout(() => {
          player.userActive(false);
        }, DESKTOP_HIDE_DELAY);
      };

      // When paused, start timer to hide controls
      player.on('pause', () => {
        hideControlsAfterDelay();
      });

      // When playing, let Video.js handle via inactivityTimeout
      player.on('play', () => {
        if (desktopHideTimeout) {
          clearTimeout(desktopHideTimeout);
          desktopHideTimeout = null;
        }
      });

      // When user becomes active (mouse move), reset timer if paused
      player.on('useractive', () => {
        if (player.paused()) {
          hideControlsAfterDelay();
        }
      });

      // Cleanup on dispose
      player.on('dispose', () => {
        if (desktopHideTimeout) {
          clearTimeout(desktopHideTimeout);
        }
      });

      console.log('[useVideoJsPlayer] Desktop/Tablet: auto-hide controls after 2s (including when paused)');
    }

    // Add custom seek buttons to control bar (desktop/tablet)
    if (!isMobile) {
      try {
        // Get control bar
        const controlBar = player.controlBar;

        // Add seek backward 10s button (after play button)
        const playButton = controlBar.getChild('playToggle');
        const seekBackBtn = controlBar.addChild('SeekBackward10Button', {},
          controlBar.children().indexOf(playButton) + 1
        );

        // Add seek forward 10s button (after seek backward)
        const seekFwdBtn = controlBar.addChild('SeekForward10Button', {},
          controlBar.children().indexOf(seekBackBtn) + 1
        );

        console.log('[useVideoJsPlayer] Added +10/-10 seek buttons to control bar');
      } catch (error) {
        console.error('[useVideoJsPlayer] Error adding seek buttons:', error);
      }
    }

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
          // Plugin handles the seek via wrapped currentTime()
          player.currentTime(player.currentTime() - SEEK_TIME_SECONDS);
          break;
        case 'arrowright':
        case 'l':
          e.preventDefault();
          // Plugin handles the seek via wrapped currentTime()
          player.currentTime(player.currentTime() + SEEK_TIME_SECONDS);
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
            // Plugin handles the seek via wrapped currentTime()
            player.currentTime(targetTime);
          }
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
        // Don't remove keyboard listener or dispose player for persistent players
        return;
      }

      // Non-persistent players: full cleanup
      if (saveProgressTimeout.current) {
        clearTimeout(saveProgressTimeout.current);
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
