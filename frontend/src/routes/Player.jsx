import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import Plyr from 'plyr';
import 'plyr/dist/plyr.css';
import { useVideo, useUpdateVideo, useDeleteVideo } from '../api/queries';
import { useNotification } from '../contexts/NotificationContext';
import ConfirmDialog from '../components/ConfirmDialog';
import AddToPlaylistMenu from '../components/AddToPlaylistMenu';

export default function Player() {
  const { videoId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: video, isLoading } = useVideo(videoId);
  const updateVideo = useUpdateVideo();
  const deleteVideo = useDeleteVideo();
  const { showNotification } = useNotification();
  const videoRef = useRef(null);
  const plyrInstanceRef = useRef(null);
  const saveProgressTimeout = useRef(null);
  const addToPlaylistButtonRef = useRef(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [isTheaterMode, setIsTheaterMode] = useState(() => {
    const saved = localStorage.getItem('theaterMode');
    return saved === 'true';
  });

  useEffect(() => {
    console.log('useEffect: video exists?', !!video, 'videoRef exists?', !!videoRef.current, 'plyrInstance exists?', !!plyrInstanceRef.current);
    console.log('Plyr is available?', typeof Plyr);

    if (video && videoRef.current && !plyrInstanceRef.current) {
      console.log('Initializing Plyr...');
      console.log('VideoRef element:', videoRef.current);

      // Construct video source path - extract path after 'downloads/'
      // Handles both channel videos (downloads/ChannelFolder/video.mp4)
      // and singles (downloads/Singles/FolderName/video.mp4)
      const pathParts = video.file_path.replace(/\\/g, '/').split('/');
      const downloadsIndex = pathParts.indexOf('downloads');
      const relativePath = downloadsIndex >= 0
        ? pathParts.slice(downloadsIndex + 1).join('/')
        : pathParts.slice(-2).join('/');  // Fallback for edge cases
      const videoSrc = `/api/media/${relativePath}`;
      console.log('Constructed videoSrc:', videoSrc);

      // Detect mobile devices first for clickToPlay config
      const isMobileDevice = () => {
        const hasCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
        const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        return hasCoarsePointer && isMobileUA;
      };

      // Initialize Plyr
      let player;
      try {
        player = new Plyr(videoRef.current, {
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
          clickToPlay: true, // Enable click-to-play everywhere
          hideControls: true, // Auto-hide controls after inactivity
          keyboard: {
            focused: true,
            global: true, // Enable global keyboard shortcuts (works even when not focused on player)
          },
          fullscreen: {
            enabled: true,
            fallback: true,
            iosNative: true, // Enable native fullscreen on iOS
            container: null, // Use default container
          },
          tooltips: {
            controls: true,
            seek: true,
          },
        });

        console.log('Plyr player object:', player);
        console.log('Player elements:', player.elements);

        plyrInstanceRef.current = player;

        // Set source using Plyr's API
        player.source = {
          type: 'video',
          sources: [{
            src: videoSrc,
            type: 'video/mp4',
          }],
        };

        console.log('Source set to:', videoSrc);

        // Prevent double-click from exiting fullscreen (but allow entering fullscreen)
        player.on('dblclick', (event) => {
          if (player.fullscreen.active) {
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

        // Create theater mode button element
        const theaterButton = document.createElement('button');
        theaterButton.type = 'button';
        theaterButton.className = 'plyr__controls__item plyr__control';
        theaterButton.setAttribute('data-plyr', 'theater');
        theaterButton.innerHTML = `
          <svg class="icon--pressed" role="presentation" viewBox="0 0 24 24">
            <rect x="1" y="3" width="22" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2.5"/>
            <polygon points="15 7 9 12 15 17" fill="currentColor"/>
            <polygon points="9 7 15 12 9 17" fill="currentColor"/>
          </svg>
          <svg class="icon--not-pressed" role="presentation" viewBox="0 0 24 24">
            <rect x="1" y="3" width="22" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2.5"/>
            <polygon points="9 7 5 12 9 17" fill="currentColor"/>
            <polygon points="15 7 19 12 15 17" fill="currentColor"/>
          </svg>
          <span class="plyr__tooltip" role="tooltip">Theater mode</span>
        `;
        theaterButton.addEventListener('click', toggleTheaterMode);

        // Update pressed state attribute
        theaterButton.setAttribute('aria-pressed', isTheaterMode);

        // Insert button after settings button
        const settingsButton = player.elements.controls.querySelector('[data-plyr="settings"]');
        if (settingsButton && settingsButton.parentNode) {
          settingsButton.parentNode.insertBefore(theaterButton, settingsButton.nextSibling);
        }

        // Update button state when theater mode changes
        const updateButtonState = () => {
          theaterButton.setAttribute('aria-pressed', isTheaterMode);
        };
        updateButtonState();

        // ===== MOBILE TOUCH CONTROLS (YOUTUBE-STYLE) =====
        if (isMobileDevice()) {
          console.log('Initializing YouTube-style touch controls');

          // Double-tap to enter fullscreen when NOT in fullscreen, prevent exit when IN fullscreen
          // Use touchend for instant response (no 300ms delay)
          let lastVideoTapTime = 0;
          player.media.addEventListener('touchend', (e) => {
            const currentTime = Date.now();
            const isDoubleTap = (currentTime - lastVideoTapTime) < 250;

            if (!player.fullscreen.active) {
              // NOT in fullscreen - double tap to enter
              if (isDoubleTap) {
                e.preventDefault();
                player.fullscreen.enter();
              }
            } else {
              // IN fullscreen - prevent double tap from exiting
              if (isDoubleTap) {
                e.preventDefault();
                e.stopPropagation();
              }
            }

            lastVideoTapTime = currentTime;
          });

          // Create touch overlay that covers the video area
          const touchOverlay = document.createElement('div');
          touchOverlay.className = 'plyr-touch-overlay';
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
          rewindBtn.className = 'plyr-mobile-btn';
          rewindBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="white" style="width: 40px; height: 40px;">
              <path d="M11.5 12L20 18V6M11 18V6l-8.5 6"/>
            </svg>
          `;
          rewindBtn.style.cssText = buttonStyle(110) + `left: 20%; top: 50%; transform: translate(-50%, -50%) scale(0.9);`;

          const playPauseBtn = document.createElement('button');
          playPauseBtn.className = 'plyr-mobile-btn';
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
          forwardBtn.className = 'plyr-mobile-btn';
          forwardBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="white" style="width: 40px; height: 40px;">
              <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/>
            </svg>
          `;
          forwardBtn.style.cssText = buttonStyle(110) + `right: 20%; top: 50%; transform: translate(50%, -50%) scale(0.9);`;

          const exitBtn = document.createElement('button');
          exitBtn.className = 'plyr-mobile-btn';
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

          let hideTimeout;
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

            if (hideTimeout) clearTimeout(hideTimeout);
            hideTimeout = setTimeout(() => {
              button.style.opacity = '0';
              if (button === rewindBtn) button.style.transform = 'translate(-50%, -50%) scale(0.9)';
              else if (button === forwardBtn) button.style.transform = 'translate(50%, -50%) scale(0.9)';
              else if (button === exitBtn) button.style.transform = 'translate(-50%, 0) scale(0.9)';
              else button.style.transform = 'translate(-50%, -50%) scale(0.9)';
              currentVisibleButton = null;
            }, 1500);
          };

          const updatePlayPauseIcon = () => {
            const playIcon = playPauseBtn.querySelector('.play-icon');
            const pauseIcon = playPauseBtn.querySelector('.pause-icon');
            if (player.playing) {
              playIcon.style.display = 'none';
              pauseIcon.style.display = 'block';
            } else {
              playIcon.style.display = 'block';
              pauseIcon.style.display = 'none';
            }
          };

          // Detect which zone was tapped (use touchend for instant response)
          touchOverlay.addEventListener('touchend', (e) => {
            e.preventDefault(); // Prevent ghost clicks

            const touch = e.changedTouches[0];
            const rect = touchOverlay.getBoundingClientRect();
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;
            const width = rect.width;
            const height = rect.height;

            const currentTime = Date.now();
            const isDoubleTap = (currentTime - lastTapTime) < 250;

            let zone = null;
            let button = null;
            let action = null;

            // Determine zone
            if (y < height * 0.2) {
              zone = 'exit';
              button = exitBtn;
              action = () => player.fullscreen.exit();
            } else if (x < width * 0.3) {
              zone = 'rewind';
              button = rewindBtn;
              action = () => player.rewind(10);
            } else if (x > width * 0.7) {
              zone = 'forward';
              button = forwardBtn;
              action = () => player.forward(10);
            } else {
              zone = 'center';
              button = playPauseBtn;
              action = () => player.togglePlay();
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
          });

          player.on('play', updatePlayPauseIcon);
          player.on('pause', updatePlayPauseIcon);
          player.on('playing', updatePlayPauseIcon);

          player.elements.container.appendChild(touchOverlay);

          // Show/hide overlay in fullscreen
          player.on('enterfullscreen', () => {
            touchOverlay.style.display = 'block';
            updatePlayPauseIcon();

            // Hide the play-large button in fullscreen on mobile
            const playLargeBtn = player.elements.container.querySelector('.plyr__control--overlaid');
            if (playLargeBtn) {
              playLargeBtn.style.display = 'none';
            }
          });

          player.on('exitfullscreen', () => {
            touchOverlay.style.display = 'none';

            // Show the play-large button again when exiting fullscreen
            const playLargeBtn = player.elements.container.querySelector('.plyr__control--overlaid');
            if (playLargeBtn) {
              playLargeBtn.style.display = '';
            }
          });
        }

        // ===== FORCE CONTROLS TO STAY VISIBLE IN FULLSCREEN =====
        // Ensure Plyr controls remain visible and clickable in fullscreen on desktop
        player.on('enterfullscreen', () => {
          console.log('Entered fullscreen - controls will auto-hide after inactivity');
        });

        player.on('exitfullscreen', () => {
          console.log('Exited fullscreen');
        });
        // ===== END FULLSCREEN TOUCH CONTROLS =====

      } catch (error) {
        console.error('Error initializing Plyr:', error);
        return;
      }

      // Restore playback position when metadata is loaded
      player.on('loadedmetadata', () => {
        if (video.playback_seconds > 0) {
          player.currentTime = video.playback_seconds;
        }
      });

      // Save progress periodically
      player.on('timeupdate', () => {
        if (saveProgressTimeout.current) {
          clearTimeout(saveProgressTimeout.current);
        }

        saveProgressTimeout.current = setTimeout(() => {
          const currentTime = Math.floor(player.currentTime);
          if (currentTime > 0) {
            updateVideo.mutate({
              id: video.id,
              data: { playback_seconds: currentTime },
            });
          }
        }, 5000);
      });

      // Mark as watched when video reaches 90% (or ends)
      let hasMarkedWatched = video.watched;
      const checkWatchedThreshold = async () => {
        if (hasMarkedWatched) return;

        const currentTime = player.currentTime;
        const duration = player.duration;

        if (duration > 0 && currentTime >= duration * 0.9) {
          hasMarkedWatched = true;
          try {
            await updateVideo.mutateAsync({
              id: video.id,
              data: { watched: true },
            });
            showNotification('Video marked as watched', 'success');
          } catch (error) {
            console.error('Error marking video as watched:', error);
          }
        }
      };

      player.on('timeupdate', checkWatchedThreshold);
      player.on('ended', checkWatchedThreshold);

      // Cleanup
      return () => {
        // Save current position immediately before cleanup
        if (plyrInstanceRef.current && video.id) {
          const currentTime = Math.floor(plyrInstanceRef.current.currentTime);
          if (currentTime > 0) {
            updateVideo.mutate({
              id: video.id,
              data: { playback_seconds: currentTime },
            });
          }
        }

        if (saveProgressTimeout.current) {
          clearTimeout(saveProgressTimeout.current);
        }
        if (plyrInstanceRef.current) {
          plyrInstanceRef.current.destroy();
          plyrInstanceRef.current = null;
        }
      };
    }
  }, [video?.id]); // Only re-run if video ID changes

  // Update theater mode button state when isTheaterMode changes
  useEffect(() => {
    if (plyrInstanceRef.current) {
      const theaterButton = plyrInstanceRef.current.elements.controls?.querySelector('[data-plyr="theater"]');
      if (theaterButton) {
        theaterButton.setAttribute('aria-pressed', isTheaterMode);
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
    <div className="space-y-4 animate-fade-in">
      {/* Centered Control Buttons */}
      <div className="flex justify-center gap-3 mb-4">
        <button
          onClick={handleBack}
          className="icon-btn hover:bg-accent hover:border-accent"
          title="Back"
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
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14m-7-7h14"></path>
          </svg>
        </button>

        <button
          onClick={toggleWatched}
          className={`icon-btn hover:bg-accent hover:border-accent ${video.watched ? 'bg-accent' : ''}`}
          title={video.watched ? 'Mark as unwatched' : 'Mark as watched'}
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
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>

      {/* Player Container */}
      <div className={`w-full ${isTheaterMode ? '' : 'max-w-5xl mx-auto'} transition-all duration-300`}>
          <div className={`bg-black rounded-xl overflow-hidden shadow-card-hover ${isTheaterMode ? 'max-h-[70vh]' : ''}`}>
            <video
              ref={videoRef}
              className={`w-full block ${isTheaterMode ? 'max-h-[70vh] object-contain' : 'h-auto'}`}
              playsInline
              preload="auto"
            />
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
