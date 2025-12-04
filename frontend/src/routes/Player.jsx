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
          keyboard: {
            focused: true,
            global: true, // Enable global keyboard shortcuts (works even when not focused on player)
          },
          fullscreen: {
            enabled: true,
            fallback: true,
            iosNative: true, // Enable native fullscreen on iOS
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

        // ===== FULLSCREEN TOUCH CONTROLS =====
        // Detect if device has touch capability
        const isTouchDevice = () => {
          return (
            'ontouchstart' in window ||
            navigator.maxTouchPoints > 0 ||
            navigator.msMaxTouchPoints > 0
          );
        };

        // Only create touch overlay on touch devices
        if (isTouchDevice()) {
          // Create touch overlay that lives inside Plyr's container (visible in fullscreen)
          const touchOverlay = document.createElement('div');
        touchOverlay.className = 'plyr-touch-overlay';

        // Create zones
        const zoneLeft = document.createElement('div');
        zoneLeft.className = 'plyr-touch-zone plyr-touch-zone--left';

        const zoneCenter = document.createElement('div');
        zoneCenter.className = 'plyr-touch-zone plyr-touch-zone--center';

        const zoneRight = document.createElement('div');
        zoneRight.className = 'plyr-touch-zone plyr-touch-zone--right';

        // Create feedback bubbles
        const skipLeftBubble = document.createElement('div');
        skipLeftBubble.className = 'plyr-skip-bubble plyr-skip-bubble--left';
        skipLeftBubble.innerHTML = `
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12.5 3C17.15 3 21.08 6.03 22.47 10.22L20.1 11C19.05 7.81 16.04 5.5 12.5 5.5C10.54 5.5 8.77 6.22 7.38 7.38L10 10H3V3L5.6 5.6C7.45 4 9.85 3 12.5 3M10 12V22H8V14H6V12H10M18 14V20C18 21.11 17.11 22 16 22H14C12.9 22 12 21.1 12 20V14C12 12.9 12.9 12 14 12H16C17.11 12 18 12.9 18 14M14 14V20H16V14H14Z"/>
          </svg>
          <span>10s</span>
        `;

        const skipRightBubble = document.createElement('div');
        skipRightBubble.className = 'plyr-skip-bubble plyr-skip-bubble--right';
        skipRightBubble.innerHTML = `
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.5 3C6.85 3 2.92 6.03 1.53 10.22L3.9 11C4.95 7.81 7.96 5.5 11.5 5.5C13.46 5.5 15.23 6.22 16.62 7.38L14 10H21V3L18.4 5.6C16.55 4 14.15 3 11.5 3M10 12V22H8V14H6V12H10M18 14V20C18 21.11 17.11 22 16 22H14C12.9 22 12 21.1 12 20V14C12 12.9 12.9 12 14 12H16C17.11 12 18 12.9 18 14M14 14V20H16V14H14Z"/>
          </svg>
          <span>10s</span>
        `;

        const centerIndicator = document.createElement('div');
        centerIndicator.className = 'plyr-center-indicator';
        centerIndicator.innerHTML = `
          <svg class="play-icon" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          <svg class="pause-icon" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16"/>
            <rect x="14" y="4" width="4" height="16"/>
          </svg>
        `;

        // Exit fullscreen button
        const exitFsButton = document.createElement('button');
        exitFsButton.className = 'plyr-exit-fullscreen-btn';
        exitFsButton.innerHTML = `
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        `;
        exitFsButton.addEventListener('touchend', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (document.exitFullscreen) {
            document.exitFullscreen();
          } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
          }
        });
        exitFsButton.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (document.exitFullscreen) {
            document.exitFullscreen();
          } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
          }
        });

        // Assemble overlay
        touchOverlay.appendChild(zoneLeft);
        touchOverlay.appendChild(zoneCenter);
        touchOverlay.appendChild(zoneRight);
        touchOverlay.appendChild(skipLeftBubble);
        touchOverlay.appendChild(skipRightBubble);
        touchOverlay.appendChild(centerIndicator);
        touchOverlay.appendChild(exitFsButton);

        // Double-tap tracking
        const lastTap = { left: 0, right: 0 };
        const doubleTapDelay = 300;
        const skipAmount = 10;
        let exitButtonTimeout = null;

        const showBubble = (bubble) => {
          bubble.classList.add('show');
          setTimeout(() => bubble.classList.remove('show'), 500);
        };

        const updateCenterIndicator = () => {
          if (player.paused) {
            // Show play icon and keep visible when paused
            centerIndicator.classList.remove('playing');
            centerIndicator.classList.add('show', 'persistent');
          } else {
            // Show pause icon briefly when playing
            centerIndicator.classList.add('playing', 'show');
            centerIndicator.classList.remove('persistent');
            setTimeout(() => {
              if (!centerIndicator.classList.contains('persistent')) {
                centerIndicator.classList.remove('show');
              }
            }, 300);
          }
        };

        const showExitButton = () => {
          exitFsButton.classList.add('visible');
          if (exitButtonTimeout) clearTimeout(exitButtonTimeout);
          exitButtonTimeout = setTimeout(() => {
            exitFsButton.classList.remove('visible');
          }, 3000);
        };

        // Listen to player state changes to keep play button visible when paused
        player.on('pause', updateCenterIndicator);
        player.on('play', updateCenterIndicator);
        player.on('playing', updateCenterIndicator);

        // Zone touch/click handlers - use touchend for touch devices (avoids 300ms delay)
        const handleLeftTap = (e) => {
          e.preventDefault();
          showExitButton();
          const now = Date.now();
          if (now - lastTap.left < doubleTapDelay) {
            player.currentTime = Math.max(player.currentTime - skipAmount, 0);
            showBubble(skipLeftBubble);
            lastTap.left = 0;
          } else {
            lastTap.left = now;
          }
        };

        const handleRightTap = (e) => {
          e.preventDefault();
          showExitButton();
          const now = Date.now();
          if (now - lastTap.right < doubleTapDelay) {
            player.currentTime = Math.min(player.currentTime + skipAmount, player.duration || Infinity);
            showBubble(skipRightBubble);
            lastTap.right = 0;
          } else {
            lastTap.right = now;
          }
        };

        const handleCenterTap = (e) => {
          e.preventDefault();
          showExitButton();
          if (player.playing) {
            player.pause();
          } else {
            player.play();
          }
          // updateCenterIndicator will be called by pause/play events
        };

        // Touch events (primary for mobile)
        zoneLeft.addEventListener('touchend', handleLeftTap);
        zoneRight.addEventListener('touchend', handleRightTap);
        zoneCenter.addEventListener('touchend', handleCenterTap);

        // Click events (fallback for mouse)
        zoneLeft.addEventListener('click', handleLeftTap);
        zoneRight.addEventListener('click', handleRightTap);
        zoneCenter.addEventListener('click', handleCenterTap);

        // Inject into Plyr's container
        player.elements.container.appendChild(touchOverlay);

          // Show overlay only in fullscreen
          const showOverlay = () => { touchOverlay.classList.add('active'); };
          const hideOverlay = () => { touchOverlay.classList.remove('active'); };

          player.on('enterfullscreen', showOverlay);
          player.on('exitfullscreen', hideOverlay);

          // Backup: native fullscreen API
          const handleFsChange = () => {
            if (document.fullscreenElement || document.webkitFullscreenElement) {
              showOverlay();
            } else {
              hideOverlay();
            }
          };
          document.addEventListener('fullscreenchange', handleFsChange);
          document.addEventListener('webkitfullscreenchange', handleFsChange);
        }
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
      {/* Player Layout - Responsive: vertical on mobile, horizontal on desktop */}
      <div className="flex flex-col md:flex-row gap-4">
        {/* Left Action Buttons - Hidden on mobile */}
        <div className="hidden md:flex flex-col gap-3 flex-shrink-0">
          {/* Back Arrow */}
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
            onClick={toggleWatched}
            className={`icon-btn hover:bg-accent hover:border-accent ${video.watched ? 'bg-accent hover:bg-accent' : ''}`}
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

          <button
            ref={addToPlaylistButtonRef}
            className="icon-btn hover:bg-accent hover:border-accent"
            title="Add to playlist"
            onClick={() => setShowPlaylistMenu(true)}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14m-7-7h14"></path>
            </svg>
          </button>
        </div>

        {/* Mobile Action Buttons - Above video on mobile only */}
        <div className="md:hidden flex justify-center gap-3 mb-4 flex-shrink-0">
          {/* Back Arrow */}
          <button
            onClick={handleBack}
            className="icon-btn hover:bg-accent hover:border-accent"
            title="Back"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>

          {/* Mark Watched/Unwatched */}
          <button
            onClick={toggleWatched}
            className={`icon-btn hover:bg-accent hover:border-accent ${
              video.watched ? 'bg-accent/20 border-accent/40 text-accent-text' : ''
            }`}
            title={video.watched ? 'Mark as unwatched' : 'Mark as watched'}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          </button>

          {/* Delete Video */}
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="icon-btn hover:bg-red-600 hover:border-red-700"
            title="Delete video"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
            </svg>
          </button>

          {/* Add to Playlist */}
          <button
            ref={addToPlaylistButtonRef}
            onClick={() => setShowPlaylistMenu(true)}
            className="icon-btn hover:bg-accent hover:border-accent"
            title="Add to playlist"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
        </div>

        {/* Player Container */}
        <div className={`flex-1 w-full ${isTheaterMode ? '' : 'md:max-w-[960px]'} transition-all duration-300`}>
          <div className="bg-black rounded-xl overflow-hidden shadow-card-hover min-h-[300px] md:min-h-[540px]">
            <video
              ref={videoRef}
              className="w-full h-auto"
              playsInline
              preload="auto"
            />
          </div>

          {/* Video Info Below Player */}
          <div className="mt-4 space-y-3">
            <h1 className="text-2xl font-bold text-text-primary leading-tight">
              {video.title}
            </h1>

            <div className="flex items-center gap-4 text-sm text-text-secondary">
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
              {video.playback_seconds > 0 && (
                <>
                  <span>•</span>
                  <span className="text-accent-text">
                    Resume from {formatDuration(video.playback_seconds)}
                  </span>
                </>
              )}
            </div>

            {/* Stats Pills */}
            <div className="flex items-center gap-2">
              <span
                className={`stat-pill ${
                  video.watched
                    ? 'bg-accent/20 border-accent/40 text-accent-text'
                    : 'bg-yellow-600/20 border-yellow-600/40 text-yellow-400'
                }`}
              >
                {video.watched ? (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"></circle>
                  </svg>
                )}
                <span className="font-semibold">
                  {video.watched ? 'Watched' : 'Not watched'}
                </span>
              </span>

              {video.playback_seconds > 0 && (
                <span className="stat-pill bg-blue-600/20 border-blue-600/40 text-blue-400">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                  <span className="font-semibold">In Progress</span>
                </span>
              )}
            </div>
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
