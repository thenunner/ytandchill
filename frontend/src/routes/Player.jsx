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
          clickToPlay: false, // Disable click-to-play to prevent interfering with controls
          hideControls: false, // Force controls to stay visible
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

        // ===== MOBILE TOUCH CONTROLS =====
        // Add visible touch controls for mobile devices only
        const isMobileDevice = () => {
          // Must have coarse pointer (touch) AND be a mobile device
          const hasCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
          const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
          const isMobile = hasCoarsePointer && isMobileUA;
          console.log('Mobile touch detection:', isMobile ? 'Mobile device' : 'Desktop/laptop');
          return isMobile;
        };

        if (isMobileDevice()) {
          // Create touch controls container
          const touchControls = document.createElement('div');
          touchControls.className = 'plyr-mobile-controls';
          touchControls.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 100px;
            display: none;
            z-index: 150;
          `;

          // Create touch zones (invisible clickable areas)
          const leftZone = document.createElement('div');
          leftZone.style.cssText = `
            position: absolute;
            left: 0;
            top: 0;
            width: 33.33%;
            height: 100%;
            cursor: pointer;
          `;

          const centerZone = document.createElement('div');
          centerZone.style.cssText = `
            position: absolute;
            left: 33.33%;
            top: 0;
            width: 33.33%;
            height: 100%;
            cursor: pointer;
          `;

          const rightZone = document.createElement('div');
          rightZone.style.cssText = `
            position: absolute;
            right: 0;
            top: 0;
            width: 33.33%;
            height: 100%;
            cursor: pointer;
          `;

          // Modern glass-morphism button style
          const modernButtonStyle = `
            background: rgba(255, 255, 255, 0.15);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 50%;
            box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
            width: 100px;
            height: 100px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 13px;
            font-weight: 600;
            opacity: 0;
            transition: all 0.3s ease;
            pointer-events: none;
          `;

          // Rewind button
          const rewindBtn = document.createElement('button');
          rewindBtn.className = 'plyr-mobile-btn plyr-mobile-btn--rewind';
          rewindBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="currentColor" style="width: 36px; height: 36px;">
              <path d="M11.5 12L20 18V6M11 18V6l-8.5 6"/>
            </svg>
            <span style="margin-top: 4px;">10s</span>
          `;
          rewindBtn.style.cssText = `${modernButtonStyle}
            position: absolute;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
          `;

          // Play/Pause button
          const playPauseBtn = document.createElement('button');
          playPauseBtn.className = 'plyr-mobile-btn plyr-mobile-btn--play';
          playPauseBtn.innerHTML = `
            <svg class="play-icon" viewBox="0 0 24 24" fill="currentColor" style="width: 48px; height: 48px;">
              <polygon points="8 5 19 12 8 19 8 5"/>
            </svg>
            <svg class="pause-icon" viewBox="0 0 24 24" fill="currentColor" style="width: 48px; height: 48px; display: none;">
              <rect x="7" y="4" width="3" height="16" rx="1.5"/>
              <rect x="14" y="4" width="3" height="16" rx="1.5"/>
            </svg>
          `;
          playPauseBtn.style.cssText = `${modernButtonStyle}
            position: absolute;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            width: 110px;
            height: 110px;
          `;

          // Fast forward button
          const fastForwardBtn = document.createElement('button');
          fastForwardBtn.className = 'plyr-mobile-btn plyr-mobile-btn--forward';
          fastForwardBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="currentColor" style="width: 36px; height: 36px;">
              <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/>
            </svg>
            <span style="margin-top: 4px;">10s</span>
          `;
          fastForwardBtn.style.cssText = `${modernButtonStyle}
            position: absolute;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
          `;

          // Exit fullscreen button (shows in all zones)
          const exitFsBtn = document.createElement('button');
          exitFsBtn.className = 'plyr-mobile-btn plyr-mobile-btn--exit';
          exitFsBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="currentColor" style="width: 32px; height: 32px;">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
            <span style="margin-top: 2px; font-size: 11px;">Exit</span>
          `;
          exitFsBtn.style.cssText = `${modernButtonStyle}
            position: absolute;
            top: 60px;
            left: 50%;
            transform: translateX(-50%);
          `;

          // Add buttons to zones
          leftZone.appendChild(rewindBtn.cloneNode(true));
          leftZone.appendChild(exitFsBtn.cloneNode(true));
          centerZone.appendChild(playPauseBtn);
          centerZone.appendChild(exitFsBtn.cloneNode(true));
          rightZone.appendChild(fastForwardBtn.cloneNode(true));
          rightZone.appendChild(exitFsBtn);

          // Get references to the cloned buttons
          const leftRewindBtn = leftZone.querySelector('.plyr-mobile-btn--rewind');
          const leftExitBtn = leftZone.querySelector('.plyr-mobile-btn--exit');
          const centerExitBtn = centerZone.querySelector('.plyr-mobile-btn--exit');
          const rightForwardBtn = rightZone.querySelector('.plyr-mobile-btn--forward');

          let hideTimeout;

          const showZoneButtons = (zone) => {
            const buttons = zone.querySelectorAll('.plyr-mobile-btn');
            buttons.forEach(btn => {
              btn.style.opacity = '1';
              btn.style.pointerEvents = 'auto';
            });

            if (hideTimeout) clearTimeout(hideTimeout);
            hideTimeout = setTimeout(() => {
              buttons.forEach(btn => {
                btn.style.opacity = '0';
                btn.style.pointerEvents = 'none';
              });
            }, 2000);
          };

          const hideAllButtons = () => {
            if (hideTimeout) clearTimeout(hideTimeout);
            document.querySelectorAll('.plyr-mobile-btn').forEach(btn => {
              btn.style.opacity = '0';
              btn.style.pointerEvents = 'none';
            });
          };

          // Zone click handlers
          leftZone.addEventListener('click', (e) => {
            if (!e.target.closest('.plyr-mobile-btn')) {
              showZoneButtons(leftZone);
            }
          });

          centerZone.addEventListener('click', (e) => {
            if (!e.target.closest('.plyr-mobile-btn')) {
              showZoneButtons(centerZone);
            }
          });

          rightZone.addEventListener('click', (e) => {
            if (!e.target.closest('.plyr-mobile-btn')) {
              showZoneButtons(rightZone);
            }
          });

          // Button click handlers
          const handleRewind = (e) => {
            e.stopPropagation();
            player.rewind(10);
            showZoneButtons(leftZone);
          };

          const handlePlayPause = (e) => {
            e.stopPropagation();
            player.togglePlay();
            showZoneButtons(centerZone);
          };

          const handleForward = (e) => {
            e.stopPropagation();
            player.forward(10);
            showZoneButtons(rightZone);
          };

          const handleExit = (e) => {
            e.stopPropagation();
            player.fullscreen.exit();
          };

          leftRewindBtn.addEventListener('click', handleRewind);
          leftExitBtn.addEventListener('click', handleExit);
          playPauseBtn.addEventListener('click', handlePlayPause);
          centerExitBtn.addEventListener('click', handleExit);
          rightForwardBtn.addEventListener('click', handleForward);
          exitFsBtn.addEventListener('click', handleExit);

          // Update play/pause icon
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

          player.on('play', updatePlayPauseIcon);
          player.on('pause', updatePlayPauseIcon);
          player.on('playing', updatePlayPauseIcon);

          // Assemble touch controls
          touchControls.appendChild(leftZone);
          touchControls.appendChild(centerZone);
          touchControls.appendChild(rightZone);
          player.elements.container.appendChild(touchControls);

          // Show/hide based on fullscreen
          player.on('enterfullscreen', () => {
            touchControls.style.display = 'block';
            updatePlayPauseIcon();
          });

          player.on('exitfullscreen', () => {
            touchControls.style.display = 'none';
            hideAllButtons();
          });
        }

        // ===== FORCE CONTROLS TO STAY VISIBLE IN FULLSCREEN =====
        // Ensure Plyr controls remain visible and clickable in fullscreen on desktop
        player.on('enterfullscreen', () => {
          console.log('Entered fullscreen');
          // Force controls to show and prevent auto-hide
          setTimeout(() => {
            if (player.elements.controls) {
              player.elements.controls.style.opacity = '1';
              player.elements.controls.style.pointerEvents = 'auto';
              player.elements.controls.style.display = 'flex';
              player.elements.controls.style.zIndex = '9999';

              // Force pointer-events on ALL control elements
              const allControls = player.elements.controls.querySelectorAll('button, input, [role="slider"]');
              allControls.forEach(control => {
                control.style.pointerEvents = 'auto';
                control.style.cursor = 'pointer';
              });

              // Disable pointer events on video wrapper to prevent blocking
              if (player.elements.wrapper) {
                player.elements.wrapper.style.pointerEvents = 'none';
              }

              // Keep video element itself interactive
              if (player.media) {
                player.media.style.pointerEvents = 'auto';
              }

              console.log('Forced controls visible and clickable:', player.elements.controls);
            }
          }, 100);
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
