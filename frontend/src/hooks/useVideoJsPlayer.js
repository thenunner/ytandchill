import { useEffect, useRef } from 'react';
import videojs from 'video.js';
import {
  SEEK_TIME_SECONDS,
  PROGRESS_SAVE_DEBOUNCE_MS,
  WATCHED_THRESHOLD,
  detectDeviceType,
  getVideoSource,
  getVideoErrorMessage,
  createTheaterButton,
  updateTheaterButtonState,
  SeekBackward10Button,
  SeekForward10Button,
} from '../utils/videoUtils';
import '../plugins/videojs-seek-coordinator'; // Register plugin

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
 * @param {boolean} options.autoplay - If true, video plays automatically on load (desktop only)
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
  autoplay = false,
}) {
  const playerRef = useRef(null);
  const saveProgressTimeout = useRef(null);
  const hasMarkedWatchedRef = useRef(false);
  const videoDataRef = useRef(video);
  const updateVideoRef = useRef(updateVideoMutation);
  const lastVideoElementRef = useRef(null); // Track the actual DOM element
  const sponsorBlockSkipCooldownRef = useRef(0); // Prevent rapid re-skipping

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

    // Check if video element has changed (e.g., theater mode toggle)
    const videoElementChanged = lastVideoElementRef.current && lastVideoElementRef.current !== elem;

    if (videoElementChanged && playerRef.current) {
      try {
        if (!playerRef.current.isDisposed()) {
          playerRef.current.dispose();
        }
      } catch (e) {
        console.warn('[useVideoJsPlayer] Error disposing player:', e);
      }
      playerRef.current = null;
    }

    // Track the current video element
    lastVideoElementRef.current = elem;

    // For persistent players (playlists), don't reinitialize if player already exists
    // UNLESS the video element changed (handled above)
    if (persistPlayer && playerRef.current) {
      return;
    }

    const { isMobile, isIOS } = detectDeviceType();

    // Register theater mode button component once globally
    if (!theaterButtonRegistered) {
      createTheaterButton();
      theaterButtonRegistered = true;
    }

    // Initialize player
    // NOTE: Do NOT use fluid: true - it calculates height from video aspect ratio
    // Our .player-wrapper CSS controls sizing with aspect-ratio: 16/9
    const player = videojs(videoRef.current, {
      controls: true,
      fill: true,  // Fill the container (respects our CSS sizing)
      preload: (autoplay && !isMobile) ? 'auto' : 'metadata', // Preload more when autoplay enabled
      poster: isMobile ? (video.thumb_url || '') : '', // Only show poster on mobile devices
      autoplay: false, // Don't use built-in autoplay - we handle it manually after source is set
      // Device-specific inactivity timeout for auto-hiding controls
      // Mobile: 0 = never auto-hide (controls always visible, except fullscreen)
      // Desktop/Tablet: 2000ms = hide after 2 seconds of inactivity
      inactivityTimeout: isMobile ? 0 : 2000,
      // Disable browser's native touch controls (we handle our own)
      nativeControlsForTouch: false,
      // Playback speed options (unified across all devices)
      playbackRates: [1, 1.5, 2, 2.5],
      // Control bar configuration - only show remaining time (not current/duration)
      // On mobile: also hide chapters button
      controlBar: {
        currentTimeDisplay: false,
        timeDivider: false,
        durationDisplay: false,
        remainingTimeDisplay: true,
        chaptersButton: !isMobile,
      },
      html5: {
        vhs: {
          overrideNative: false,
        },
        nativeVideoTracks: true,
        nativeAudioTracks: true,
      },
    });

    playerRef.current = player;

    // Enable seek coordinator plugin
    player.seekCoordinator({
      snapBackward: 0.4,    // Snap 400ms backward for keyframes
      settleTime: 100,      // Wait 100ms after seeks (Chrome decoder settling)
      enabled: true,        // Enable plugin
      debug: false,
    });

    // Apply default playback speed from settings
    fetch('/api/settings', { credentials: 'include' })
      .then(res => res.json())
      .then(settings => {
        const defaultSpeed = parseFloat(settings.default_playback_speed) || 1;
        if (defaultSpeed !== 1 && player && !player.isDisposed()) {
          player.playbackRate(defaultSpeed);
        }
      })
      .catch(err => {
        console.warn('[useVideoJsPlayer] Failed to fetch default playback speed:', err);
      });

    // ============================================
    // DEVICE-SPECIFIC CONTROL VISIBILITY BEHAVIOR
    // ============================================
    if (isMobile) {
      // Mobile: Controls always visible EXCEPT in fullscreen (YT-style)
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
          showControlsTemporarily();
        } else {
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
      // EXCEPTION: Keep controls visible when mouse is hovering over control bar
      let desktopHideTimeout = null;
      let isHoveringControlBar = false;
      const DESKTOP_HIDE_DELAY = 2000;

      const hideControlsAfterDelay = () => {
        if (desktopHideTimeout) {
          clearTimeout(desktopHideTimeout);
        }
        // Don't hide controls if video is paused
        if (player.paused()) {
          return;
        }
        desktopHideTimeout = setTimeout(() => {
          // Don't hide if mouse is hovering over control bar or if paused
          if (!isHoveringControlBar && !player.paused()) {
            player.userActive(false);
          }
        }, DESKTOP_HIDE_DELAY);
      };

      // Track mouse hover over control bar
      const controlBarEl = player.controlBar.el();
      const handleControlBarMouseEnter = () => {
        isHoveringControlBar = true;
        // Clear any pending hide timeout
        if (desktopHideTimeout) {
          clearTimeout(desktopHideTimeout);
          desktopHideTimeout = null;
        }
        // Keep controls visible
        player.userActive(true);
      };
      const handleControlBarMouseLeave = () => {
        isHoveringControlBar = false;
        // Start hide timer when mouse leaves control bar
        hideControlsAfterDelay();
      };
      controlBarEl.addEventListener('mouseenter', handleControlBarMouseEnter);
      controlBarEl.addEventListener('mouseleave', handleControlBarMouseLeave);

      // When paused, keep controls visible (don't auto-hide)
      player.on('pause', () => {
        if (desktopHideTimeout) {
          clearTimeout(desktopHideTimeout);
          desktopHideTimeout = null;
        }
        player.userActive(true);  // Force controls visible
      });

      // When playing, let Video.js handle via inactivityTimeout
      player.on('play', () => {
        if (desktopHideTimeout) {
          clearTimeout(desktopHideTimeout);
          desktopHideTimeout = null;
        }
      });

      // When user becomes inactive, check if paused - if so, force controls visible
      player.on('userinactive', () => {
        if (player.paused()) {
          // Override Video.js hiding controls when paused
          player.userActive(true);
        }
      });

      // On canplay (fires after mode switch), ensure controls visible if paused
      player.on('canplay', () => {
        if (player.paused()) {
          player.userActive(true);
        }
      });

      // Cleanup on dispose
      player.on('dispose', () => {
        if (desktopHideTimeout) {
          clearTimeout(desktopHideTimeout);
        }
        controlBarEl.removeEventListener('mouseenter', handleControlBarMouseEnter);
        controlBarEl.removeEventListener('mouseleave', handleControlBarMouseLeave);
      });
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
      } catch (error) {
        console.error('[useVideoJsPlayer] Error adding seek buttons:', error);
      }
    }

    // Add theater button to control bar (desktop/tablet only - no effect on mobile)
    if (!isMobile) {
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
          controlBarEl.insertBefore(theaterButton.el(), fullscreenToggle.el());
        }
      } catch (error) {
        console.error('[useVideoJsPlayer] Error adding theater button:', error);
      }
    }

    // Set initial video source
    if (video.file_path) {
      const videoSrc = getVideoSource(video.file_path);
      if (videoSrc) {
        player.src({ src: videoSrc, type: 'video/mp4' });

        // When metadata loads, restore progress and prepare video frame
        player.one('loadedmetadata', () => {
          try {
            const duration = player.duration();

            // Restore saved progress position or start at beginning
            // Only resume if: position >= 5 seconds AND position < 95% of duration
            const startTime = (video.playback_seconds &&
                               video.playback_seconds >= 5 &&
                               video.playback_seconds < duration * 0.95)
              ? video.playback_seconds
              : 0;

            // Function to start playback (called after seek completes)
            const startPlayback = () => {
              if (!isMobile) {
                try {
                  player.hasStarted(true);
                  player.userActive(true);
                } catch (err) {
                  console.warn('[useVideoJsPlayer] Failed to mark as started:', err);
                }
                // Autoplay on desktop if enabled
                if (autoplay) {
                  player.play().catch(() => {
                    // Browser blocked autoplay - user will need to click play
                  });
                }
              }
            };

            if (startTime > 0) {
              // Seek first, then wait for seek to complete and frame to render
              player.currentTime(startTime);
              player.one('seeked', () => {
                // Use requestAnimationFrame to ensure video frame is rendered
                requestAnimationFrame(() => {
                  startPlayback();
                });
              });
            } else {
              // No seek needed, start immediately
              startPlayback();
            }
          } catch (err) {
            console.warn('[useVideoJsPlayer] Failed to restore progress:', err);
          }
        });

        // Check for and add subtitle track (VTT format) - defer to not compete with video load
        setTimeout(() => {
          const subtitleUrl = videoSrc.replace(/\.[^.]+$/, '.en.vtt');
          fetch(subtitleUrl, { method: 'HEAD', credentials: 'include' })
            .then(res => {
              if (res.ok && player && !player.isDisposed()) {
                player.addRemoteTextTrack({
                  kind: 'subtitles',
                  srclang: 'en',
                  label: 'English',
                  src: subtitleUrl,
                  default: false
                }, false);
              }
            })
            .catch(() => {}); // Silently ignore if no subtitles
        }, 1000); // Delay subtitle check to prioritize video playback
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

    // Error handling
    player.on('error', () => {
      const error = player.error();
      if (!error) return;

      console.error('Video.js error:', {
        code: error.code,
        message: error.message,
        type: error.type,
      });

      const userMessage = getVideoErrorMessage(error.code, isIOS);
      console.error('User-facing error:', userMessage);
    });

    // Always update last_watched_at when playback starts (for watch history)
    // This runs regardless of saveProgress setting so playlist videos also appear in history
    if (updateVideoRef.current) {
      player.on('play', () => {
        setTimeout(() => saveProgressNow(), 500);
      });
    }

    // Additional progress saving (only if enabled - not for playlists)
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
    }
    // Note: Position restoration is handled by player.one('loadedmetadata') above
    // Playlist mode starts at 0 because video.playback_seconds is 0 for playlist videos

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

    // SponsorBlock segment skipping during playback
    player.on('timeupdate', () => {
      if (!player || player.seeking() || player.paused()) return;

      const sponsorSegments = videoDataRef.current?.sponsorblock_segments || [];
      if (sponsorSegments.length === 0) return;

      const currentTime = player.currentTime();
      const now = Date.now();

      // Skip cooldown: don't skip again within 2 seconds of last skip
      if (now - sponsorBlockSkipCooldownRef.current < 2000) return;

      // Check if we're inside any sponsor segment
      for (const segment of sponsorSegments) {
        // Skip if we're past the start and before (end - 0.5s buffer)
        if (currentTime >= segment.start && currentTime < segment.end - 0.5) {
          console.log(`[SponsorBlock] Skipping ${segment.category}: ${segment.start.toFixed(1)}s -> ${segment.end.toFixed(1)}s`);
          player.currentTime(segment.end);
          sponsorBlockSkipCooldownRef.current = now;
          break;
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
      document.removeEventListener('keydown', handleKeyPress);
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, persistPlayer
    ? [video?.id, isTheaterMode] // Persistent: reinit on video change OR theater mode change (element changes)
    : [video?.id]); // Non-persistent: reinit on video change

  // Save progress before page unload (refresh/close)
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (playerRef.current && !playerRef.current.isDisposed() && saveProgress && updateVideoRef.current && videoDataRef.current) {
        try {
          const currentTime = Math.floor(playerRef.current.currentTime());
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
      if (playerRef.current && !playerRef.current.isDisposed()) {
        playerRef.current.pause();
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, []);

  // Update theater button state when mode changes
  useEffect(() => {
    if (playerRef.current) {
      updateTheaterButtonState(playerRef.current, isTheaterMode);
    }
  }, [isTheaterMode]);

  // Mobile orientation change: trigger Video.js resize after CSS reflows
  // SKIP during native fullscreen - browser handles that
  useEffect(() => {
    const { isMobile } = detectDeviceType();
    if (!isMobile) return;

    const handleOrientation = () => {
      setTimeout(() => {
        if (playerRef.current && !playerRef.current.isDisposed()) {
          // Skip resize trigger if in fullscreen - browser handles it
          if (playerRef.current.isFullscreen()) {
            return;
          }
          playerRef.current.trigger('resize');
        }
      }, 200); // Wait for rotation animation + 100dvh recalculation
    };

    window.addEventListener('orientationchange', handleOrientation);
    return () => window.removeEventListener('orientationchange', handleOrientation);
  }, []);

  return playerRef;
}
