import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import { useVideo, useUpdateVideo, useDeleteVideo } from '../api/queries';
import { useNotification } from '../contexts/NotificationContext';
import ConfirmDialog from '../components/ConfirmDialog';
import AddToPlaylistMenu from '../components/AddToPlaylistMenu';

// Constants
const SEEK_TIME_SECONDS = 10;
const DOUBLE_TAP_DELAY_MS = 250;
const BUTTON_HIDE_DELAY_MS = 1500;
const PROGRESS_SAVE_DEBOUNCE_MS = 3000;
const WATCHED_THRESHOLD = 0.9;

export default function Player() {
  const { videoId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: video, isLoading } = useVideo(videoId);
  const updateVideo = useUpdateVideo();
  const deleteVideo = useDeleteVideo();
  const { showNotification } = useNotification();

  // Player refs
  const videoContainerRef = useRef(null);
  const playerInstanceRef = useRef(null);
  const saveProgressTimeout = useRef(null);
  const addToPlaylistButtonRef = useRef(null);

  // Refs to hold latest values for event handlers (avoid stale closures)
  const updateVideoRef = useRef(updateVideo);
  const showNotificationRef = useRef(showNotification);
  const videoDataRef = useRef(video);
  const hasMarkedWatchedRef = useRef(video?.watched || false);

  // Mobile touch control refs for cleanup
  const hideTimeoutRef = useRef(null);
  const mediaDoubleTapListenerRef = useRef(null);
  const overlayTouchListenerRef = useRef(null);
  const theaterButtonRef = useRef(null);
  const touchOverlayRef = useRef(null);

  // State
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [isTheaterMode, setIsTheaterMode] = useState(() => {
    const saved = localStorage.getItem('theaterMode');
    return saved === 'true';
  });

  // Keep refs updated with latest values
  useEffect(() => {
    updateVideoRef.current = updateVideo;
    showNotificationRef.current = showNotification;
    videoDataRef.current = video;
    hasMarkedWatchedRef.current = video?.watched || false;
  });

  useEffect(() => {
    // Only initialize if we have video data and no player exists yet
    if (!video || !videoContainerRef.current || playerInstanceRef.current) {
      return;
    }

    console.log('Initializing video.js player...');

    // Construct video source path
    const pathParts = video.file_path.replace(/\\/g, '/').split('/');
    const downloadsIndex = pathParts.indexOf('downloads');
    const relativePath = downloadsIndex >= 0
      ? pathParts.slice(downloadsIndex + 1).join('/')
      : pathParts.slice(-2).join('/');
    const videoSrc = `/api/media/${relativePath}`;
    console.log('Video source:', videoSrc);

    // Detect mobile and iOS devices
    const isMobileDevice = () => {
      const hasCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
      const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      return hasCoarsePointer && isMobileUA;
    };

    const isIOSDevice = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    console.log('Is iOS device:', isIOSDevice);

    // Create video element dynamically (React best practice for video.js)
    const videoElement = document.createElement('video-js');
    videoElement.classList.add('vjs-big-play-centered');
    videoElement.setAttribute('playsinline', 'playsinline');
    videoElement.setAttribute('preload', 'auto');
    if (video.title) {
      videoElement.setAttribute('aria-label', video.title);
    }

    // Append to container
    videoContainerRef.current.appendChild(videoElement);

    // Initialize video.js
    let player;
    try {
      player = videojs(videoElement, {
        controls: true,
        playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
        fluid: true,
        responsive: true,
        preload: 'auto',
        html5: {
          vhs: {
            overrideNative: true
          },
          nativeVideoTracks: false,
          nativeAudioTracks: false,
          nativeTextTracks: false
        },
        controlBar: {
          children: [
            'playToggle',
            'skipBackward',
            'skipForward',
            'volumePanel',
            'currentTimeDisplay',
            'timeDivider',
            'durationDisplay',
            'progressControl',
            'playbackRateMenuButton',
            'pictureInPictureToggle',
            'fullscreenToggle'
          ]
        },
        userActions: {
          hotkeys: function(event) {
            if (isIOSDevice) return; // Disable hotkeys on iOS

            // Space or K = play/pause
            if (event.which === 32 || event.which === 75) {
              event.preventDefault();
              if (this.paused()) {
                this.play();
              } else {
                this.pause();
              }
            }
            // Left arrow or J = rewind
            else if (event.which === 37 || event.which === 74) {
              event.preventDefault();
              this.currentTime(Math.max(0, this.currentTime() - SEEK_TIME_SECONDS));
            }
            // Right arrow or L = forward
            else if (event.which === 39 || event.which === 76) {
              event.preventDefault();
              this.currentTime(Math.min(this.duration(), this.currentTime() + SEEK_TIME_SECONDS));
            }
            // F = fullscreen
            else if (event.which === 70) {
              event.preventDefault();
              if (this.isFullscreen()) {
                this.exitFullscreen();
              } else {
                this.requestFullscreen();
              }
            }
            // M = mute
            else if (event.which === 77) {
              event.preventDefault();
              this.muted(!this.muted());
            }
            // Up arrow = volume up
            else if (event.which === 38) {
              event.preventDefault();
              this.volume(Math.min(1, this.volume() + 0.1));
            }
            // Down arrow = volume down
            else if (event.which === 40) {
              event.preventDefault();
              this.volume(Math.max(0, this.volume() - 0.1));
            }
          }
        }
      });

      console.log('Player initialized successfully');

      // Store player reference
      playerInstanceRef.current = player;

      // Set source AFTER initialization (like Plyr pattern)
      player.src({
        src: videoSrc,
        type: 'video/mp4'
      });

      console.log('Source set to:', videoSrc);

        // Prevent double-click from exiting fullscreen (but allow entering fullscreen)
        player.on('dblclick', (event) => {
          if (player.isFullscreen()) {
            event.preventDefault();
            event.stopPropagation();
          }
        });

        // Create custom theater mode button
        const toggleTheaterMode = () => {
          setIsTheaterMode(prev => {
            const newValue = !prev;
            localStorage.setItem('theaterMode', newValue.toString());
            return newValue;
          });
        };

        // Video.js Button Component for Theater Mode
        const Button = videojs.getComponent('Button');
        class TheaterButton extends Button {
          constructor(player, options) {
            super(player, options);
            this.controlText('Theater mode');
            this.addClass('vjs-theater-button');
          }

          buildCSSClass() {
            return `vjs-control vjs-button ${super.buildCSSClass()}`;
          }

          handleClick() {
            toggleTheaterMode();
          }

          createEl() {
            const el = super.createEl('button', {
              className: 'vjs-control vjs-button vjs-theater-button'
            });

            el.innerHTML = `
              <span class="vjs-icon-placeholder" aria-hidden="true">
                <svg class="vjs-theater-icon-pressed" viewBox="0 0 24 24" style="display: none;">
                  <rect x="1" y="3" width="22" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2.5"/>
                  <polygon points="15 7 9 12 15 17" fill="currentColor"/>
                  <polygon points="9 7 15 12 9 17" fill="currentColor"/>
                </svg>
                <svg class="vjs-theater-icon-not-pressed" viewBox="0 0 24 24">
                  <rect x="1" y="3" width="22" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2.5"/>
                  <polygon points="9 7 5 12 9 17" fill="currentColor"/>
                  <polygon points="15 7 19 12 15 17" fill="currentColor"/>
                </svg>
              </span>
              <span class="vjs-control-text" aria-live="polite">Theater mode</span>
            `;

            return el;
          }
        }

        videojs.registerComponent('TheaterButton', TheaterButton);
        player.getChild('controlBar').addChild('TheaterButton', {},
          player.getChild('controlBar').children().length - 1);

        theaterButtonRef.current = player.getChild('controlBar').getChild('TheaterButton');

        // ===== MOBILE TOUCH CONTROLS (YOUTUBE-STYLE) =====
        if (isMobileDevice()) {
          console.log('Initializing YouTube-style touch controls');

          // Double-tap to enter fullscreen when NOT in fullscreen, prevent exit when IN fullscreen
          let lastVideoTapTime = 0;
          const mediaTouchHandler = (e) => {
            const currentTime = Date.now();
            const isDoubleTap = (currentTime - lastVideoTapTime) < DOUBLE_TAP_DELAY_MS;

            if (!player.isFullscreen()) {
              if (isDoubleTap) {
                e.preventDefault();
                player.requestFullscreen();
              }
            } else {
              if (isDoubleTap) {
                e.preventDefault();
                e.stopPropagation();
              }
            }

            lastVideoTapTime = currentTime;
          };
          player.el().querySelector('video').addEventListener('touchend', mediaTouchHandler);
          mediaDoubleTapListenerRef.current = mediaTouchHandler;

          // Create touch overlay that covers the video area
          const touchOverlay = document.createElement('div');
          touchOverlay.className = 'vjs-touch-overlay';
          touchOverlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 60px;
            display: none;
            z-index: 150;
            -webkit-tap-highlight-color: transparent;
            pointer-events: auto !important;
          `;

          // Modern semi-transparent button style (YouTube-like)
          const buttonStyle = (size = 100) => `
            position: absolute;
            background: rgba(255, 255, 255, 0.15);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 2px solid rgba(255, 255, 255, 0.25);
            border-radius: 50%;
            width: ${size}px;
            height: ${size}px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            opacity: 0;
            transform: scale(0.9);
            transition: opacity 0.2s ease, transform 0.2s ease;
            pointer-events: auto !important;
            cursor: pointer;
            z-index: 200;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
          `;

          // Create buttons in fixed positions
          const rewindBtn = document.createElement('button');
          rewindBtn.className = 'vjs-mobile-btn';
          rewindBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="white" style="width: 40px; height: 40px;">
              <path d="M11.5 12L20 18V6M11 18V6l-8.5 6"/>
            </svg>
          `;
          rewindBtn.style.cssText = buttonStyle(110) + `left: 20%; top: 50%; transform: translate(-50%, -50%) scale(0.9);`;

          const playPauseBtn = document.createElement('button');
          playPauseBtn.className = 'vjs-mobile-btn';
          playPauseBtn.innerHTML = `
            <svg class="play-icon" viewBox="0 0 24 24" fill="white" style="width: 50px; height: 50px;">
              <polygon points="8 5 19 12 8 19 8 5"/>
            </svg>
            <svg class="pause-icon" viewBox="0 0 24 24" fill="white" style="width: 50px; height: 50px; display: none;">
              <rect x="6" y="4" width="4" height="16" rx="2"/>
              <rect x="14" y="4" width="4" height="16" rx="2"/>
            </svg>
          `;
          playPauseBtn.style.cssText = buttonStyle(130) + `left: 50%; top: 50%; transform: translate(-50%, -50%) scale(0.9);`;

          const forwardBtn = document.createElement('button');
          forwardBtn.className = 'vjs-mobile-btn';
          forwardBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="white" style="width: 40px; height: 40px;">
              <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/>
            </svg>
          `;
          forwardBtn.style.cssText = buttonStyle(110) + `right: 20%; top: 50%; transform: translate(50%, -50%) scale(0.9);`;

          const exitBtn = document.createElement('button');
          exitBtn.className = 'vjs-mobile-btn';
          exitBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="white" style="width: 32px; height: 32px;">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          `;
          exitBtn.style.cssText = buttonStyle(100) + `left: 50%; top: 50px; transform: translate(-50%, 0) scale(0.9);`;

          touchOverlay.appendChild(rewindBtn);
          touchOverlay.appendChild(playPauseBtn);
          touchOverlay.appendChild(forwardBtn);
          touchOverlay.appendChild(exitBtn);
          touchOverlayRef.current = touchOverlay;

          let currentVisibleButton = null;
          let lastTapTime = 0;
          let lastTapZone = null;

          const showButton = (button) => {
            // Hide all buttons first
            [rewindBtn, playPauseBtn, forwardBtn, exitBtn].forEach(btn => {
              btn.style.opacity = '0';
              if (btn === rewindBtn) btn.style.transform = 'translate(-50%, -50%) scale(0.9)';
              else if (btn === forwardBtn) btn.style.transform = 'translate(50%, -50%) scale(0.9)';
              else if (btn === exitBtn) btn.style.transform = 'translate(-50%, 0) scale(0.9)';
              else btn.style.transform = 'translate(-50%, -50%) scale(0.9)';
            });

            // Show only the tapped zone's button
            button.style.opacity = '1';
            if (button === rewindBtn) button.style.transform = 'translate(-50%, -50%) scale(1)';
            else if (button === forwardBtn) button.style.transform = 'translate(50%, -50%) scale(1)';
            else if (button === exitBtn) button.style.transform = 'translate(-50%, 0) scale(1)';
            else button.style.transform = 'translate(-50%, -50%) scale(1)';

            currentVisibleButton = button;

            if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
            hideTimeoutRef.current = setTimeout(() => {
              button.style.opacity = '0';
              if (button === rewindBtn) button.style.transform = 'translate(-50%, -50%) scale(0.9)';
              else if (button === forwardBtn) button.style.transform = 'translate(50%, -50%) scale(0.9)';
              else if (button === exitBtn) button.style.transform = 'translate(-50%, 0) scale(0.9)';
              else button.style.transform = 'translate(-50%, -50%) scale(0.9)';
              currentVisibleButton = null;
            }, BUTTON_HIDE_DELAY_MS);
          };

          const updatePlayPauseIcon = () => {
            const playIcon = playPauseBtn.querySelector('.play-icon');
            const pauseIcon = playPauseBtn.querySelector('.pause-icon');
            if (!player.paused()) {
              playIcon.style.display = 'none';
              pauseIcon.style.display = 'block';
            } else {
              playIcon.style.display = 'block';
              pauseIcon.style.display = 'none';
            }
          };

          // Detect which zone was tapped
          const overlayTouchHandler = (e) => {
            e.preventDefault();

            const touch = e.changedTouches[0];
            const rect = touchOverlay.getBoundingClientRect();
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;
            const width = rect.width;
            const height = rect.height;

            const currentTime = Date.now();
            const isDoubleTap = (currentTime - lastTapTime) < DOUBLE_TAP_DELAY_MS;

            let zone = null;
            let button = null;
            let action = null;

            // Determine zone
            if (y < height * 0.2) {
              zone = 'exit';
              button = exitBtn;
              action = () => player.exitFullscreen();
            } else if (x < width * 0.3) {
              zone = 'rewind';
              button = rewindBtn;
              action = () => player.currentTime(Math.max(0, player.currentTime() - SEEK_TIME_SECONDS));
            } else if (x > width * 0.7) {
              zone = 'forward';
              button = forwardBtn;
              action = () => player.currentTime(Math.min(player.duration(), player.currentTime() + SEEK_TIME_SECONDS));
            } else {
              zone = 'center';
              button = playPauseBtn;
              action = () => {
                if (player.paused()) {
                  player.play();
                } else {
                  player.pause();
                }
              };
            }

            // Center zone = instant action
            if (zone === 'center') {
              action();
              updatePlayPauseIcon();
              showButton(button);
            }
            // Other zones: show on first tap, action on second tap or double-tap
            else {
              const isSameZone = lastTapZone === zone;

              if (isDoubleTap && isSameZone) {
                // Double tap = instant action
                action();
                showButton(button);
              } else if (currentVisibleButton === button) {
                // Button already visible, second tap = action
                action();
                showButton(button);
              } else {
                // First tap = show button only
                showButton(button);
              }
            }

            lastTapTime = currentTime;
            lastTapZone = zone;
          };
          touchOverlay.addEventListener('touchend', overlayTouchHandler);
          overlayTouchListenerRef.current = overlayTouchHandler;

          player.on('play', updatePlayPauseIcon);
          player.on('pause', updatePlayPauseIcon);
          player.on('playing', updatePlayPauseIcon);

          player.el().appendChild(touchOverlay);

          // Show/hide overlay in fullscreen
          player.on('fullscreenchange', () => {
            if (player.isFullscreen()) {
              touchOverlay.style.display = 'block';
              updatePlayPauseIcon();

              // Hide the big play button in fullscreen on mobile
              const bigPlayButton = player.el().querySelector('.vjs-big-play-button');
              if (bigPlayButton) {
                bigPlayButton.style.display = 'none';
              }
            } else {
              touchOverlay.style.display = 'none';

              // Show the big play button again when exiting fullscreen
              const bigPlayButton = player.el().querySelector('.vjs-big-play-button');
              if (bigPlayButton) {
                bigPlayButton.style.display = '';
              }
            }
          });
        }

        // ===== FORCE CONTROLS TO STAY VISIBLE IN FULLSCREEN =====
        // Ensure video.js controls remain visible and clickable in fullscreen on desktop
        player.on('fullscreenchange', () => {
          if (player.isFullscreen()) {
            console.log('Entered fullscreen - controls will auto-hide after inactivity');
          } else {
            console.log('Exited fullscreen');
          }
        });
        // ===== END FULLSCREEN TOUCH CONTROLS =====

      // Add error handling for video loading
      player.on('error', () => {
        console.error('video.js error event');
        const error = player.error();
        if (error) {
          console.error('Media error:', error.code, error.message);
          const errorMessages = {
            1: 'Video loading aborted',
            2: 'Network error - check your connection',
            3: 'Video decoding failed - file may be corrupted',
            4: 'Video format not supported'
          };
          showNotificationRef.current(errorMessages[error.code] || 'Video playback error', 'error');
        }
      });

      // Restore playback position when metadata is loaded
      player.on('loadedmetadata', () => {
        const savedPosition = video.playback_seconds;
        const duration = player.duration();

        // Validate saved position before restoring
        if (
          savedPosition > 0 &&
          !isNaN(savedPosition) &&
          isFinite(savedPosition) &&
          duration > 0 &&
          savedPosition < duration
        ) {
          player.currentTime(savedPosition);
        }
      });

      // Consolidated timeupdate handler: save progress + check watched threshold
      player.on('timeupdate', () => {
        const currentTime = player.currentTime();
        const duration = player.duration();

        // Debounced progress save
        if (saveProgressTimeout.current) {
          clearTimeout(saveProgressTimeout.current);
        }

        saveProgressTimeout.current = setTimeout(() => {
          const currentTimeFloor = Math.floor(player.currentTime());
          const dur = player.duration();

          if (
            currentTimeFloor > 0 &&
            !isNaN(currentTimeFloor) &&
            isFinite(currentTimeFloor) &&
            dur > 0 &&
            currentTimeFloor < dur
          ) {
            updateVideoRef.current.mutate({
              id: videoDataRef.current.id,
              data: { playback_seconds: currentTimeFloor },
            });
          }
        }, PROGRESS_SAVE_DEBOUNCE_MS);

        // Check watched threshold
        if (!hasMarkedWatchedRef.current && duration > 0 && currentTime >= duration * WATCHED_THRESHOLD) {
          hasMarkedWatchedRef.current = true;
          updateVideoRef.current.mutateAsync({
            id: videoDataRef.current.id,
            data: { watched: true },
          }).then(() => {
            showNotificationRef.current('Video marked as watched', 'success');
          }).catch((error) => {
            console.error('Error marking video as watched:', error);
            showNotificationRef.current('Failed to mark as watched', 'error');
          });
        }
      });

      // Also check on ended event
      player.on('ended', () => {
        if (!hasMarkedWatchedRef.current) {
          hasMarkedWatchedRef.current = true;
          updateVideoRef.current.mutateAsync({
            id: videoDataRef.current.id,
            data: { watched: true },
          }).then(() => {
            showNotificationRef.current('Video marked as watched', 'success');
          }).catch((error) => {
            console.error('Error marking video as watched:', error);
          });
        }
      });

    } catch (error) {
      console.error('Error in player initialization:', error);
      showNotificationRef.current('Failed to initialize video player', 'error');
    }

    // Cleanup function (outside try-catch)
    return () => {
      console.log('Cleaning up video.js player');

      // Cancel any pending saves
      if (saveProgressTimeout.current) {
        clearTimeout(saveProgressTimeout.current);
        saveProgressTimeout.current = null;
      }

      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }

      // Save current position before cleanup
      if (playerInstanceRef.current && !playerInstanceRef.current.isDisposed() && videoDataRef.current?.id) {
        const currentTime = Math.floor(playerInstanceRef.current.currentTime());
        if (currentTime > 0 && !isNaN(currentTime)) {
          updateVideoRef.current.mutate({
            id: videoDataRef.current.id,
            data: { playback_seconds: currentTime },
          });
        }
      }

      // Clean up mobile touch event listeners
      const videoEl = playerInstanceRef.current?.el()?.querySelector('video');
      if (videoEl && mediaDoubleTapListenerRef.current) {
        videoEl.removeEventListener('touchend', mediaDoubleTapListenerRef.current);
        mediaDoubleTapListenerRef.current = null;
      }

      if (touchOverlayRef.current && overlayTouchListenerRef.current) {
        touchOverlayRef.current.removeEventListener('touchend', overlayTouchListenerRef.current);
        overlayTouchListenerRef.current = null;
      }

      // Remove touch overlay
      if (touchOverlayRef.current && touchOverlayRef.current.parentNode) {
        touchOverlayRef.current.parentNode.removeChild(touchOverlayRef.current);
        touchOverlayRef.current = null;
      }

      // Dispose player and clean up
      if (playerInstanceRef.current && !playerInstanceRef.current.isDisposed()) {
        playerInstanceRef.current.dispose();
      }
      playerInstanceRef.current = null;

      // Clear container
      if (videoContainerRef.current) {
        videoContainerRef.current.innerHTML = '';
      }
    };
  }, [video?.id]); // Only re-run when video ID changes

  // Update theater mode button state when isTheaterMode changes
  useEffect(() => {
    if (playerInstanceRef.current && theaterButtonRef.current) {
      const theaterButton = theaterButtonRef.current.el();
      if (theaterButton) {
        const pressedIcon = theaterButton.querySelector('.vjs-theater-icon-pressed');
        const notPressedIcon = theaterButton.querySelector('.vjs-theater-icon-not-pressed');

        if (isTheaterMode) {
          if (pressedIcon) pressedIcon.style.display = 'block';
          if (notPressedIcon) notPressedIcon.style.display = 'none';
        } else {
          if (pressedIcon) pressedIcon.style.display = 'none';
          if (notPressedIcon) notPressedIcon.style.display = 'block';
        }
      }
    }
  }, [isTheaterMode]);

  const formatDuration = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return hrs > 0
      ? `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
      : `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-red-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!video) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400 text-lg">Video not found</p>
        <button onClick={() => navigate(-1)} className="btn btn-primary mt-4">
          Go Back
        </button>
      </div>
    );
  }

  if (!video.file_path || video.status !== 'library') {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400 text-lg">Video not downloaded yet</p>
        <button onClick={() => navigate(-1)} className="btn btn-primary mt-4">
          Go Back
        </button>
      </div>
    );
  }

  const handleDelete = async () => {
    try {
      showNotification('Deleting video...', 'info', { persistent: true });
      await deleteVideo.mutateAsync(video.id);
      showNotification('Video deleted', 'success');
      setShowDeleteConfirm(false);
      navigate(-1);
    } catch (error) {
      showNotification(error.message || 'Failed to delete video', 'error');
    }
  };

  const handleBack = () => {
    // Use referrer from state if available, otherwise default to channel library
    const referrer = location.state?.from || `/channel/${video.channel_id}/library`;
    navigate(referrer);
  };

  const toggleWatched = async () => {
    try {
      await updateVideo.mutateAsync({
        id: video.id,
        data: { watched: !video.watched },
      });
      showNotification(
        !video.watched ? 'Marked as watched' : 'Marked as unwatched',
        'success'
      );
    } catch (error) {
      showNotification(error.message, 'error');
    }
  };

  return (
    <div className="space-y-4 animate-fade-in pt-6 md:pt-8">
      {/* Centered Control Buttons */}
      <div className="flex justify-center gap-3 mb-8">
        <button
          onClick={handleBack}
          className="icon-btn hover:bg-accent hover:border-accent"
          title="Back"
          aria-label="Go back to previous page"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>

        <button
          ref={addToPlaylistButtonRef}
          onClick={() => setShowPlaylistMenu(true)}
          className="icon-btn hover:bg-accent hover:border-accent"
          title="Add to playlist"
          aria-label="Add video to playlist"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14m-7-7h14"></path>
          </svg>
        </button>

        <button
          onClick={toggleWatched}
          className={`icon-btn hover:bg-accent hover:border-accent ${video.watched ? 'bg-accent' : ''}`}
          title={video.watched ? 'Mark as unwatched' : 'Mark as watched'}
          aria-label={video.watched ? 'Mark video as unwatched' : 'Mark video as watched'}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        </button>

        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="icon-btn hover:bg-red-600 hover:border-red-700"
          title="Delete video"
          aria-label="Delete video permanently"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>

      {/* Player Container */}
      <div className={`w-full ${isTheaterMode ? '' : 'max-w-4xl mx-auto'} transition-all duration-300`}>
          <div className="bg-black rounded-xl overflow-hidden shadow-card-hover relative max-h-[60vh]">
            <div ref={videoContainerRef} data-vjs-player className="w-full h-full" />
          </div>

          {/* Video Info Below Player */}
          <div className="mt-4 space-y-3">
            <h1 className="text-2xl font-bold text-text-primary leading-tight">
              {video.title}
            </h1>

            <div className="flex items-center gap-3 text-sm text-text-secondary">
              <Link
                to={`/channel/${video.channel_id}/library`}
                className="hover:text-text-primary transition-colors font-medium"
              >
                {video.channel_title}
              </Link>
              <span>•</span>
              <span>{formatDuration(video.duration_sec)}</span>
              <span>•</span>
              <span>
                {video.upload_date
                  ? new Date(
                      video.upload_date.slice(0, 4),
                      video.upload_date.slice(4, 6) - 1,
                      video.upload_date.slice(6, 8)
                    ).toLocaleDateString()
                  : 'Unknown date'}
              </span>
              {video.watched && (
                <>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/20 border border-accent/40 text-accent-text font-semibold">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    Watched
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Delete Confirmation Dialog */}
        <ConfirmDialog
          isOpen={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={handleDelete}
          title="Delete Video"
          message={`Are you sure you want to delete "${video.title}"? This will permanently remove the video file from your system.`}
          confirmText="Delete"
          cancelText="Cancel"
          isDanger={true}
        />

        {/* Add to Playlist Menu */}
        {showPlaylistMenu && (
          <AddToPlaylistMenu
            videoId={video.id}
            video={video}
            triggerRef={addToPlaylistButtonRef}
            onClose={() => setShowPlaylistMenu(false)}
          />
        )}
    </div>
  );
}
