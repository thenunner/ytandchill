import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useQueries } from '@tanstack/react-query';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import { usePlaylist, useUpdateVideo, usePlaylists, useDeleteVideo } from '../api/queries';
import { useNotification } from '../contexts/NotificationContext';
import ConfirmDialog from '../components/ConfirmDialog';
import AddToPlaylistMenu from '../components/AddToPlaylistMenu';
import {
  SEEK_TIME_SECONDS,
  DOUBLE_TAP_DELAY_MS,
  BUTTON_HIDE_DELAY_MS,
  PROGRESS_SAVE_DEBOUNCE_MS,
  WATCHED_THRESHOLD,
  getVideoSource,
  detectDeviceType,
  initializeMobileTouchControls,
} from '../utils/videoPlayerUtils';

export default function PlaylistPlayer() {
  const { playlistId, categoryId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showNotification } = useNotification();

  // Get starting video from URL if provided
  const startVideoId = searchParams.get('v');

  // Fetch playlist data based on mode (single playlist vs category)
  const { data: playlist, isLoading: isLoadingPlaylist } = usePlaylist(playlistId, { enabled: !!playlistId });
  const { data: playlistsData, isLoading: isLoadingCategory } = usePlaylists({ enabled: !!categoryId });

  // For category mode, get all playlists in this category
  const categoryPlaylists = useMemo(() => {
    if (!categoryId || !playlistsData) return [];
    const catId = parseInt(categoryId, 10);
    if (isNaN(catId)) return [];
    return playlistsData.filter(p => p.category_id === catId);
  }, [categoryId, playlistsData]);

  // Fetch videos from all playlists in the category
  const categoryPlaylistQueries = useQueries({
    queries: categoryPlaylists.map(pl => ({
      queryKey: ['playlist', pl.id],
      queryFn: async () => {
        const response = await fetch(`/api/playlists/${pl.id}`);
        if (!response.ok) throw new Error('Failed to fetch playlist');
        return response.json();
      },
      enabled: !!categoryId && categoryPlaylists.length > 0,
    })),
  });

  const updateVideo = useUpdateVideo();
  const deleteVideo = useDeleteVideo();

  // Playlist State
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLooping, setIsLooping] = useState(() => {
    const saved = localStorage.getItem('playlistLoop');
    return saved === 'true';
  });
  const [shuffledOrder, setShuffledOrder] = useState([]);
  const [showMobileQueue, setShowMobileQueue] = useState(false);
  const [isTheaterMode, setIsTheaterMode] = useState(() => {
    const saved = localStorage.getItem('theaterMode');
    return saved === 'true';
  });
  const [isQueueCollapsed, setIsQueueCollapsed] = useState(() => {
    const saved = localStorage.getItem('queueCollapsed');
    return saved === 'true';
  });
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Refs
  const videoRef = useRef(null);
  const playerInstanceRef = useRef(null);
  const saveProgressTimeout = useRef(null);
  const sidebarRef = useRef(null);
  const mobileQueueRef = useRef(null);
  const preloadVideoRef = useRef(null);
  const theaterButtonRef = useRef(null);
  const touchControlsCleanupRef = useRef(null);
  const addToPlaylistButtonRef = useRef(null);

  // Refs to hold latest values for event handlers (avoid stale closures)
  const updateVideoRef = useRef(updateVideo);
  const showNotificationRef = useRef(showNotification);
  const currentVideoIdRef = useRef(null);
  const hasMarkedWatchedRef = useRef(false);
  const goToNextRef = useRef(null);

  // Mobile touch control refs
  const mediaDoubleTapListenerRef = useRef(null);
  const touchOverlayRef = useRef(null);
  const overlayTouchListenerRef = useRef(null);
  const hideTimeoutRef = useRef(null);

  // Get videos based on mode (single playlist or category)
  const videos = useMemo(() => {
    if (playlistId && playlist?.videos) {
      return playlist.videos.filter(v => v.status === 'library' && v.file_path);
    }
    if (categoryId && categoryPlaylistQueries.length > 0) {
      // Check if all queries are loaded
      const allLoaded = categoryPlaylistQueries.every(q => q.isSuccess);
      if (!allLoaded) return [];

      // Combine videos from all playlists in the category
      const allVideos = [];
      categoryPlaylistQueries.forEach(query => {
        if (query.data?.videos) {
          const playlistVideos = query.data.videos.filter(v => v.status === 'library' && v.file_path);
          allVideos.push(...playlistVideos);
        }
      });

      return allVideos;
    }
    return [];
  }, [playlistId, categoryId, playlist, categoryPlaylistQueries]);

  const sourceTitle = useMemo(() => {
    if (playlistId && playlist?.name) {
      return playlist.name;
    }
    if (categoryId && categoryPlaylists.length > 0) {
      // Use the category name from the first playlist
      return categoryPlaylists[0]?.category_name || 'Category';
    }
    return 'Playlist';
  }, [playlistId, playlist, categoryId, categoryPlaylists]);

  const isLoading = useMemo(() => {
    if (playlistId) return isLoadingPlaylist;
    if (categoryId) {
      return isLoadingCategory || categoryPlaylistQueries.some(q => q.isLoading);
    }
    return false;
  }, [playlistId, categoryId, isLoadingPlaylist, isLoadingCategory, categoryPlaylistQueries]);

  // Get display order (original or shuffled)
  const displayOrder = useMemo(() => {
    if (shuffledOrder.length === videos.length && videos.length > 0) {
      return shuffledOrder;
    }
    return videos.map((_, i) => i);
  }, [shuffledOrder, videos.length]);

  // Current video based on index
  const currentVideo = useMemo(() => {
    if (videos.length === 0) return null;
    const actualIndex = displayOrder[currentIndex];
    if (actualIndex === undefined) return videos[0];
    return videos[actualIndex];
  }, [videos, displayOrder, currentIndex]);

  // Next video for preloading
  const nextVideo = useMemo(() => {
    if (videos.length === 0) return null;
    const nextIndex = currentIndex + 1;
    if (nextIndex >= displayOrder.length) {
      return isLooping ? videos[displayOrder[0]] : null;
    }
    return videos[displayOrder[nextIndex]];
  }, [videos, displayOrder, currentIndex, isLooping]);

  // Keep refs updated
  useEffect(() => {
    updateVideoRef.current = updateVideo;
    showNotificationRef.current = showNotification;
    currentVideoIdRef.current = currentVideo?.id;
    hasMarkedWatchedRef.current = currentVideo?.watched || false;
  });

  // Set initial index based on startVideoId
  useEffect(() => {
    if (startVideoId && videos.length > 0) {
      const videoId = parseInt(startVideoId, 10);
      if (!isNaN(videoId)) {
        const idx = videos.findIndex(v => v.id === videoId);
        if (idx !== -1) {
          setCurrentIndex(idx);
        }
      }
    }
  }, [startVideoId, videos]);

  // Shuffle functions
  const shuffleArray = useCallback((arr) => {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }, []);

  const shufflePlaylist = useCallback(() => {
    if (videos.length > 0) {
      const indices = videos.map((_, i) => i);
      const currentActualIndex = displayOrder[currentIndex] ?? 0;
      const otherIndices = indices.filter(i => i !== currentActualIndex);
      const shuffled = [currentActualIndex, ...shuffleArray(otherIndices)];
      setShuffledOrder(shuffled);
      setCurrentIndex(0);
    }
  }, [videos, displayOrder, currentIndex, shuffleArray]);

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
    if (videos.length === 0) return;
    if (currentIndex < displayOrder.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else if (isLooping) {
      setCurrentIndex(0);
      showNotification('Playlist restarted', 'info');
    }
  }, [currentIndex, displayOrder.length, isLooping, videos.length, showNotification]);

  const goToPrevious = useCallback(() => {
    if (videos.length === 0) return;
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    } else if (isLooping) {
      setCurrentIndex(displayOrder.length - 1);
    }
  }, [currentIndex, displayOrder.length, isLooping, videos.length]);

  const goToVideo = useCallback((index) => {
    if (index >= 0 && index < displayOrder.length) {
      setCurrentIndex(index);
    }
  }, [displayOrder.length]);

  // Handler functions using useCallback
  const handleBack = useCallback(() => {
    if (!currentVideo) return;
    // Navigate back to playlist view
    if (playlistId) {
      navigate(`/playlist/${playlistId}`);
    } else {
      navigate(-1);
    }
  }, [currentVideo, playlistId, navigate]);

  const handleDelete = useCallback(async () => {
    if (!currentVideo) return;
    try {
      showNotification('Deleting video...', 'info', { persistent: true });
      await deleteVideo.mutateAsync(currentVideo.id);
      showNotification('Video deleted', 'success');
      setShowDeleteConfirm(false);
      // Navigate to next video or go back to playlist
      if (goToNext && videos.length > 1) {
        goToNext();
      } else {
        navigate(-1);
      }
    } catch (error) {
      showNotification(error.message || 'Failed to delete video', 'error');
    }
  }, [currentVideo, deleteVideo, showNotification, goToNext, videos.length, navigate]);

  const toggleWatched = useCallback(async () => {
    if (!currentVideo) return;
    try {
      await updateVideo.mutateAsync({
        id: currentVideo.id,
        data: { watched: !currentVideo.watched },
      });
      showNotification(
        !currentVideo.watched ? 'Marked as watched' : 'Marked as unwatched',
        'success'
      );
    } catch (error) {
      showNotification(error.message, 'error');
    }
  }, [currentVideo, updateVideo, showNotification]);

  const toggleQueueCollapse = useCallback(() => {
    setIsQueueCollapsed(prev => {
      const newValue = !prev;
      localStorage.setItem('queueCollapsed', newValue.toString());
      // Sync with theater mode: collapsed = theater on, expanded = theater off
      setIsTheaterMode(newValue);
      localStorage.setItem('theaterMode', newValue.toString());
      return newValue;
    });
  }, []);

  // Update goToNextRef
  useEffect(() => {
    goToNextRef.current = goToNext;
  }, [goToNext]);

  // Update URL when current video changes
  useEffect(() => {
    if (currentVideo) {
      setSearchParams({ v: currentVideo.id }, { replace: true });
    }
  }, [currentVideo?.id, setSearchParams]);

  // Keyboard shortcuts for playlist navigation
  useEffect(() => {
    const handleKeyPress = (e) => {
      // Don't trigger if user is typing in an input field
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }

      // Check if fullscreen (delegate to video.js hotkeys)
      const isPlayerFullscreen = playerInstanceRef.current?.isFullscreen?.();
      if (isPlayerFullscreen) {
        return; // Let video.js handle keyboard shortcuts in fullscreen
      }

      switch (e.key.toLowerCase()) {
        case 'n':
          // Next video
          e.preventDefault();
          goToNext();
          showNotification('Next video', 'info');
          break;
        case 'p':
          // Previous video
          e.preventDefault();
          goToPrevious();
          showNotification('Previous video', 'info');
          break;
        case 'l':
          // Toggle loop
          e.preventDefault();
          toggleLoop();
          showNotification(isLooping ? 'Loop disabled' : 'Loop enabled', 'info');
          break;
        case 's':
          // Shuffle playlist
          e.preventDefault();
          shufflePlaylist();
          showNotification('Playlist shuffled', 'info');
          break;
        case 'escape':
          // Exit fullscreen or go back
          e.preventDefault();
          if (isPlayerFullscreen) {
            playerInstanceRef.current?.exitFullscreen?.();
          } else {
            handleBack();
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [goToNext, goToPrevious, toggleLoop, shufflePlaylist, isLooping, showNotification, handleBack]);

  // Preload next video
  useEffect(() => {
    if (nextVideo && preloadVideoRef.current) {
      const nextSrc = getVideoSource(nextVideo.file_path);
      if (nextSrc) {
        console.log('Preloading next video:', nextVideo.title);
        preloadVideoRef.current.src = nextSrc;
        preloadVideoRef.current.load();
      }
    }
  }, [nextVideo?.id]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Save current position before cleanup
      if (playerInstanceRef.current && !playerInstanceRef.current.isDisposed() && currentVideoIdRef.current) {
        const currentTime = Math.floor(playerInstanceRef.current.currentTime());
        if (currentTime > 0 && !isNaN(currentTime)) {
          updateVideoRef.current.mutate({
            id: currentVideoIdRef.current,
            data: { playback_seconds: currentTime },
          });
        }
      }

      // Cancel any pending saves
      if (saveProgressTimeout.current) {
        clearTimeout(saveProgressTimeout.current);
      }

      // Clean up touch controls
      if (touchControlsCleanupRef.current) {
        touchControlsCleanupRef.current();
      }

      // Dispose player
      if (playerInstanceRef.current && !playerInstanceRef.current.isDisposed()) {
        playerInstanceRef.current.dispose();
      }
      playerInstanceRef.current = null;

      // Clean up preload video
      if (preloadVideoRef.current) {
        preloadVideoRef.current.src = '';
        preloadVideoRef.current.load();
      }
    };
  }, []);

  // Initialize player and update source when currentVideo changes
  useEffect(() => {
    if (!currentVideo || !videoRef.current) return;

    const videoSrc = getVideoSource(currentVideo.file_path);
    if (!videoSrc) return;

    // If player exists, just update source
    if (playerInstanceRef.current) {
      console.log('Updating video source to:', videoSrc);
      playerInstanceRef.current.src({
        src: videoSrc,
        type: 'video/mp4'
      });

      // Restore position after source loads
      playerInstanceRef.current.one('loadedmetadata', () => {
        const savedPosition = currentVideo.playback_seconds;
        const duration = playerInstanceRef.current.duration();

        if (
          savedPosition > 0 &&
          !isNaN(savedPosition) &&
          isFinite(savedPosition) &&
          duration > 0 &&
          savedPosition < duration
        ) {
          console.log('Restoring playback position to:', savedPosition);
          playerInstanceRef.current.currentTime(savedPosition);
        }
      });
      return;
    }

    // First time: Initialize player
    console.log('Initializing video.js player...');
    console.log('Video source:', videoSrc);

    // Detect mobile and iOS devices
    const isMobileDevice = () => {
      const hasCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
      const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      return hasCoarsePointer && isMobileUA;
    };

    const isIOSDevice = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    console.log('Is iOS device:', isIOSDevice);

    // Initialize video.js on the JSX video element (like Plyr pattern)
    let player;
    try {
      player = videojs(videoRef.current, {
        controls: true,
        playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
        fluid: true,
        responsive: true,
        preload: 'auto',  // Use auto for all platforms (works in PlaylistPlayer)
        html5: {
          vhs: {
            overrideNative: !isIOSDevice  // Use native on iOS
          },
          nativeVideoTracks: isIOSDevice,  // Use native on iOS
          nativeAudioTracks: isIOSDevice,  // Use native on iOS
          nativeTextTracks: isIOSDevice    // Use native on iOS
        },
        techOrder: ['html5'],  // Explicitly prefer html5 tech
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
      // Try simple MIME type first on iOS (explicit codecs can cause issues)
      console.log('Setting video source:', videoSrc);
      console.log('Using iOS-optimized settings:', isIOSDevice);

      player.src({
        src: videoSrc,
        type: 'video/mp4'
      });

      console.log('Source set successfully');

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
            // Sync with queue: theater on = queue collapsed, theater off = queue expanded
            setIsQueueCollapsed(newValue);
            localStorage.setItem('queueCollapsed', newValue.toString());
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
          console.error('=== Video Playback Error ===');
          console.error('Error code:', error.code);
          console.error('Error message:', error.message);
          console.error('Full error object:', error);
          console.error('iOS Device:', isIOSDevice);
          console.error('Video source URL:', videoSrc);
          console.error('Player tech in use:', player.techName_);
          console.error('Current source:', player.currentSrc());
          console.error('Network state:', player.networkState());
          console.error('Ready state:', player.readyState());
          console.error('User Agent:', navigator.userAgent);

          const errorMessages = {
            1: 'Video loading aborted by user or browser',
            2: 'Network error - failed to fetch video',
            3: 'Video decoding failed - file may be corrupted or codec unsupported',
            4: 'Video format or codec not supported by browser'
          };

          let errorMsg = errorMessages[error.code] || 'Video playback error';

          if (isIOSDevice) {
            if (error.code === 2) {
              errorMsg = 'Network error on iOS - check server CORS and Content-Type headers';
              console.error('iOS Network Error - Possible causes:');
              console.error('1. Server not sending correct Content-Type header');
              console.error('2. CORS configuration blocking iOS Safari');
              console.error('3. Video file path is incorrect');
              console.error('4. Server not responding to iOS user agent');
            } else if (error.code === 4) {
              errorMsg = 'Video codec not supported on iOS - check video encoding';
              console.error('iOS Format Error - Video must be:');
              console.error('- H.264 (AVC) video codec');
              console.error('- AAC audio codec');
              console.error('- MP4 container with moov atom at front');
            }
          }

          showNotificationRef.current(errorMsg, 'error');
        }
      });

      // Log successful loading events for debugging
      player.on('loadstart', () => {
        console.log('Video load started');
      });

      player.on('loadeddata', () => {
        console.log('Video data loaded successfully');
      });

      // Restore playback position when metadata is loaded
      player.on('loadedmetadata', () => {
        console.log('Video metadata loaded successfully');
        const savedPosition = currentVideo.playback_seconds;
        const duration = player.duration();

        console.log('Video duration:', duration);
        console.log('Saved position:', savedPosition);

        // Validate saved position before restoring
        if (
          savedPosition > 0 &&
          !isNaN(savedPosition) &&
          isFinite(savedPosition) &&
          duration > 0 &&
          savedPosition < duration
        ) {
          console.log('Restoring playback position to:', savedPosition);
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
            currentTimeFloor < dur &&
            currentVideoIdRef.current
          ) {
            updateVideoRef.current.mutate({
              id: currentVideoIdRef.current,
              data: { playback_seconds: currentTimeFloor },
            });
          }
        }, PROGRESS_SAVE_DEBOUNCE_MS);

        // Check watched threshold
        if (!hasMarkedWatchedRef.current && duration > 0 && currentTime >= duration * WATCHED_THRESHOLD && currentVideoIdRef.current) {
          hasMarkedWatchedRef.current = true;
          updateVideoRef.current.mutateAsync({
            id: currentVideoIdRef.current,
            data: { watched: true },
          }).then(() => {
            showNotificationRef.current('Video marked as watched', 'success');
          }).catch((error) => {
            console.error('Error marking video as watched:', error);
            showNotificationRef.current('Failed to mark as watched', 'error');
          });
        }
      });

      // Auto-play next video when current video ends
      player.on('ended', () => {
        // Mark current video as watched if not already
        if (!hasMarkedWatchedRef.current && currentVideoIdRef.current) {
          hasMarkedWatchedRef.current = true;
          updateVideoRef.current.mutateAsync({
            id: currentVideoIdRef.current,
            data: { watched: true },
          }).then(() => {
            showNotificationRef.current('Video marked as watched', 'success');
          }).catch((error) => {
            console.error('Error marking video as watched:', error);
          });
        }

        // Auto-play next video in playlist
        if (goToNextRef.current) {
          console.log('Video ended - playing next in playlist');
          setTimeout(() => {
            goToNextRef.current();
          }, 500); // Small delay for better UX
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
      if (playerInstanceRef.current && !playerInstanceRef.current.isDisposed() && currentVideoIdRef.current) {
        const currentTime = Math.floor(playerInstanceRef.current.currentTime());
        if (currentTime > 0 && !isNaN(currentTime)) {
          updateVideoRef.current.mutate({
            id: currentVideoIdRef.current,
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
    };
  }, [currentVideo?.id]); // Only re-run when current video ID changes

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

  if (!currentVideo.file_path || currentVideo.status !== 'library') {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400 text-lg">Video not downloaded yet</p>
        <button onClick={() => navigate(-1)} className="btn btn-primary mt-4">
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in pt-6 md:pt-8">
      {/* Player and Queue Layout */}
      <div className="md:max-w-[83.333%]">
        <div className="flex flex-col md:flex-row gap-2 items-start transition-all duration-300 ease-in-out">
          {/* Player Container - 3/5 in normal mode, full width minus queue button in theater mode */}
          <div className={`w-full transition-all duration-300 ease-in-out ${
            isTheaterMode ? 'md:w-[calc(100%-3.5rem)]' : 'md:w-[60%]'
          }`} style={{ willChange: 'width' }}>
            <div className="bg-black rounded-xl shadow-card-hover relative w-full transition-all duration-300 ease-in-out flex items-center justify-center">
            <video
              ref={videoRef}
              className="video-js vjs-big-play-centered max-w-full h-auto block mx-auto"
              style={{ maxHeight: '80vh' }}
              playsInline
              preload="auto"
            />
          </div>

          {/* Video Info Below Player */}
          <div className="mt-4 space-y-3">
            <h1 className="text-2xl font-bold text-text-primary leading-tight">
              {currentVideo.title}
            </h1>

            <div className="flex items-center gap-3 text-sm text-text-secondary">
              <Link
                to={`/channel/${currentVideo.channel_id}/library`}
                className="hover:text-text-primary transition-colors font-medium"
              >
                {currentVideo.channel_title}
              </Link>
              <span>•</span>
              <span>{formatDuration(currentVideo.duration_sec)}</span>
              <span>•</span>
              <span>
                {currentVideo.upload_date
                  ? new Date(
                      currentVideo.upload_date.slice(0, 4),
                      currentVideo.upload_date.slice(4, 6) - 1,
                      currentVideo.upload_date.slice(6, 8)
                    ).toLocaleDateString()
                  : 'Unknown date'}
              </span>
              {currentVideo.watched && (
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

            {/* Control Buttons */}
            <div className="flex gap-3 mt-4">
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
                className={`icon-btn hover:bg-accent hover:border-accent ${currentVideo.watched ? 'bg-accent' : ''}`}
                title={currentVideo.watched ? 'Mark as unwatched' : 'Mark as watched'}
                aria-label={currentVideo.watched ? 'Mark video as unwatched' : 'Mark video as watched'}
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

              {/* Mobile Queue Button */}
              <button
                onClick={() => setShowMobileQueue(true)}
                className="icon-btn hover:bg-accent hover:border-accent md:hidden"
                title="Show queue"
                aria-label="Show video queue"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="8" y1="6" x2="21" y2="6"></line>
                  <line x1="8" y1="12" x2="21" y2="12"></line>
                  <line x1="8" y1="18" x2="21" y2="18"></line>
                  <line x1="3" y1="6" x2="3.01" y2="6"></line>
                  <line x1="3" y1="12" x2="3.01" y2="12"></line>
                  <line x1="3" y1="18" x2="3.01" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Queue Sidebar (Desktop Only) - 2/5 of container when expanded */}
        <div
          ref={sidebarRef}
          className={`hidden md:block transition-all duration-300 ease-in-out ${
            isQueueCollapsed ? 'w-12' : 'md:w-[40%]'
          }`}
          style={{ willChange: 'width' }}
        >
          {isQueueCollapsed ? (
              // Collapsed state - icon button
              <div className="sticky top-4 flex-shrink-0">
                <button
                  onClick={toggleQueueCollapse}
                  className="icon-btn"
                  title="Show queue"
                  aria-label="Show video queue"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                </button>
              </div>
            ) : (
            // Expanded state - full queue (limited to video player height)
            <div className="bg-surface rounded-xl shadow-card overflow-hidden flex flex-col self-start max-h-[600px]">
              <div className="p-4 border-b border-border">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h2 className="text-lg font-semibold text-text-primary">
                      {sourceTitle}
                    </h2>
                    <p className="text-sm text-text-secondary mt-1">
                      {currentIndex + 1} / {videos.length} videos
                    </p>
                  </div>
                  <button
                    onClick={toggleQueueCollapse}
                    className="icon-btn"
                    title="Hide queue"
                    aria-label="Hide video queue"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="15 18 9 12 15 6"></polyline>
                    </svg>
                  </button>
                </div>

                {/* Playlist Controls - Previous, Shuffle, Loop, Next */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={goToPrevious}
                    disabled={currentIndex === 0 && !isLooping}
                    className="icon-btn hover:bg-accent hover:border-accent disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Previous video (P)"
                    aria-label="Go to previous video"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z"/>
                    </svg>
                  </button>

                  <button
                    onClick={shufflePlaylist}
                    className="icon-btn hover:bg-accent hover:border-accent"
                    title="Shuffle playlist (S)"
                    aria-label="Shuffle playlist"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="16 3 21 3 21 8"></polyline>
                      <line x1="4" y1="20" x2="21" y2="3"></line>
                      <polyline points="21 16 21 21 16 21"></polyline>
                      <line x1="15" y1="15" x2="21" y2="21"></line>
                      <line x1="4" y1="4" x2="9" y2="9"></line>
                    </svg>
                  </button>

                  <button
                    onClick={toggleLoop}
                    className={`icon-btn hover:bg-accent hover:border-accent ${isLooping ? 'bg-accent border-accent' : ''}`}
                    title={isLooping ? 'Disable loop (L)' : 'Enable loop (L)'}
                    aria-label={isLooping ? 'Disable loop' : 'Enable loop'}
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 1l4 4-4 4"></path>
                      <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                      <path d="M7 23l-4-4 4-4"></path>
                      <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
                    </svg>
                  </button>

                  <button
                    onClick={goToNext}
                    disabled={currentIndex === displayOrder.length - 1 && !isLooping}
                    className="icon-btn hover:bg-accent hover:border-accent disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Next video (N)"
                    aria-label="Go to next video"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M6 6l8.5 6L6 18V6zm10.5 0v12h2V6h-2z"/>
                    </svg>
                  </button>
                </div>
              </div>

            <div className="overflow-y-auto flex-1">
              {displayOrder.map((actualIndex, displayIndex) => {
                const video = videos[actualIndex];
                if (!video) return null;

                const isCurrent = displayIndex === currentIndex;

                return (
                  <button
                    key={video.id}
                    onClick={() => goToVideo(displayIndex)}
                    className={`w-full p-2 flex gap-2 hover:bg-surface-hover transition-colors border-b border-border/50 ${
                      isCurrent ? 'bg-accent/20' : ''
                    }`}
                  >
                    <div className="relative flex-shrink-0 w-20 h-12 bg-black rounded overflow-hidden">
                      {video.thumb_url ? (
                        <img
                          src={video.thumb_url}
                          alt={video.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-surface-hover">
                          <svg className="w-8 h-8 text-text-muted" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                          </svg>
                        </div>
                      )}
                      <div className="absolute bottom-1 right-1 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded">
                        {formatDuration(video.duration_sec)}
                      </div>
                      {video.watched && (
                        <div className="absolute top-1 left-1 bg-accent/90 text-accent-text text-xs px-1.5 py-0.5 rounded flex items-center gap-1">
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 text-left min-w-0">
                      <h3 className={`text-xs font-medium line-clamp-2 leading-tight ${
                        isCurrent ? 'text-accent-text' : 'text-text-primary'
                      }`}>
                        {video.title}
                      </h3>
                      <p className="text-xs text-text-secondary mt-0.5">
                        {video.channel_title}
                      </p>
                    </div>

                    {isCurrent && (
                      <div className="flex-shrink-0 flex items-center">
                        <svg className="w-5 h-5 text-accent" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M8 5v14l11-7z"/>
                        </svg>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            </div>
          )}
        </div>
        </div>
      </div>

      {/* Mobile Queue Drawer */}
      {showMobileQueue && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-50 animate-fade-in"
          onClick={() => setShowMobileQueue(false)}
        >
          <div
            ref={mobileQueueRef}
            className="absolute bottom-0 left-0 right-0 bg-surface rounded-t-2xl max-h-[80vh] flex flex-col animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">
                  {sourceTitle}
                </h2>
                <p className="text-sm text-text-secondary mt-1">
                  {currentIndex + 1} / {videos.length} videos
                </p>
              </div>
              <button
                onClick={() => setShowMobileQueue(false)}
                className="icon-btn"
                aria-label="Close queue"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
              {displayOrder.map((actualIndex, displayIndex) => {
                const video = videos[actualIndex];
                if (!video) return null;

                const isCurrent = displayIndex === currentIndex;

                return (
                  <button
                    key={video.id}
                    onClick={() => {
                      goToVideo(displayIndex);
                      setShowMobileQueue(false);
                    }}
                    className={`w-full p-3 flex gap-3 hover:bg-surface-hover transition-colors border-b border-border/50 ${
                      isCurrent ? 'bg-accent/20' : ''
                    }`}
                  >
                    <div className="relative flex-shrink-0 w-32 h-18 bg-black rounded overflow-hidden">
                      {video.thumb_url ? (
                        <img
                          src={video.thumb_url}
                          alt={video.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-surface-hover">
                          <svg className="w-8 h-8 text-text-muted" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                          </svg>
                        </div>
                      )}
                      <div className="absolute bottom-1 right-1 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded">
                        {formatDuration(video.duration_sec)}
                      </div>
                      {video.watched && (
                        <div className="absolute top-1 left-1 bg-accent/90 text-accent-text text-xs px-1.5 py-0.5 rounded flex items-center gap-1">
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 text-left min-w-0">
                      <h3 className={`text-xs font-medium line-clamp-2 leading-tight ${
                        isCurrent ? 'text-accent-text' : 'text-text-primary'
                      }`}>
                        {video.title}
                      </h3>
                      <p className="text-xs text-text-secondary mt-0.5">
                        {video.channel_title}
                      </p>
                    </div>

                    {isCurrent && (
                      <div className="flex-shrink-0 flex items-center">
                        <svg className="w-5 h-5 text-accent" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M8 5v14l11-7z"/>
                        </svg>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Hidden Preload Video */}
      <video
        ref={preloadVideoRef}
        style={{ display: 'none' }}
        preload="auto"
      />

        {/* Delete Confirmation Dialog */}
        <ConfirmDialog
          isOpen={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={handleDelete}
          title="Delete Video"
          message={`Are you sure you want to delete "${currentVideo.title}"? This will permanently remove the video file from your system.`}
          confirmText="Delete"
          cancelText="Cancel"
          isDanger={true}
        />

        {/* Add to Playlist Menu */}
        {showPlaylistMenu && (
          <AddToPlaylistMenu
            videoId={currentVideo.id}
            video={currentVideo}
            triggerRef={addToPlaylistButtonRef}
            onClose={() => setShowPlaylistMenu(false)}
          />
        )}
    </div>
  );
}
