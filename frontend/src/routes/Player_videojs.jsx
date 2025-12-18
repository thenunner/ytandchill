import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
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
  const playerRef = useRef(null);
  const saveProgressTimeout = useRef(null);
  const addToPlaylistButtonRef = useRef(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [isTheaterMode, setIsTheaterMode] = useState(() => {
    const saved = localStorage.getItem('theaterMode');
    return saved === 'true';
  });

  // Initialize video.js player
  useEffect(() => {
    if (!video || !videoRef.current || playerRef.current) return;

    // Construct video source path
    const pathParts = video.file_path.replace(/\\/g, '/').split('/');
    const downloadsIndex = pathParts.indexOf('downloads');
    const relativePath = downloadsIndex >= 0
      ? pathParts.slice(downloadsIndex + 1).join('/')
      : pathParts.slice(-2).join('/');
    const videoSrc = `/api/media/${relativePath}`;

    console.log('Initializing video.js with source:', videoSrc);

    // Detect iOS
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isMobile = isIOS || window.innerWidth < 768;

    // Initialize video.js player
    const player = videojs(videoRef.current, {
      controls: true,
      autoplay: !isMobile,
      preload: 'auto',
      fluid: false,
      responsive: true,
      playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
      controlBar: {
        children: [
          'playToggle',
          'progressControl',
          'currentTimeDisplay',
          'timeDivider',
          'durationDisplay',
          'volumePanel',
          'playbackRateMenuButton',
          'pictureInPictureToggle',
          'fullscreenToggle'
        ]
      }
    }, function onPlayerReady() {
      console.log('video.js player ready');

      // Set source
      this.src({
        src: videoSrc,
        type: 'video/mp4'
      });

      // Restore playback position
      if (video.playback_seconds > 0) {
        this.one('loadedmetadata', () => {
          const savedPosition = video.playback_seconds;
          const duration = this.duration();

          if (savedPosition > 0 && savedPosition < duration) {
            this.currentTime(savedPosition);
          }
        });
      }

      // Save progress periodically
      this.on('timeupdate', () => {
        if (saveProgressTimeout.current) {
          clearTimeout(saveProgressTimeout.current);
        }

        saveProgressTimeout.current = setTimeout(() => {
          const currentTime = Math.floor(this.currentTime());
          const duration = this.duration();

          if (currentTime > 0 && currentTime < duration) {
            updateVideo.mutate({
              id: video.id,
              data: { playback_seconds: currentTime },
            });
          }
        }, 5000);
      });

      // Mark as watched at 90%
      let hasMarkedWatched = video.watched;
      this.on('timeupdate', () => {
        if (!hasMarkedWatched) {
          const currentTime = this.currentTime();
          const duration = this.duration();

          if (duration > 0 && currentTime >= duration * 0.9) {
            hasMarkedWatched = true;
            updateVideo.mutate({
              id: video.id,
              data: { watched: true },
            });
          }
        }
      });

      // Error handling
      this.on('error', () => {
        const error = this.error();
        if (error) {
          console.error('video.js error:', error);
          showNotification(`Video error: ${error.message}`, 'error');
        }
      });
    });

    playerRef.current = player;

    // Cleanup
    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, [video?.id]);

  const handleBack = () => {
    const from = location.state?.from;
    if (from) {
      navigate(from);
    } else {
      navigate('/');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteVideo.mutateAsync(video.id);
      showNotification('Video deleted successfully', 'success');
      handleBack();
    } catch (error) {
      showNotification(error.message, 'error');
    }
  };

  const handleToggleWatched = async () => {
    try {
      await updateVideo.mutateAsync({
        id: video.id,
        data: { watched: !video.watched },
      });
      showNotification(
        video.watched ? 'Marked as unwatched' : 'Marked as watched',
        'success'
      );
    } catch (error) {
      showNotification(error.message, 'error');
    }
  };

  if (isLoading) {
    return <div className="flex justify-center items-center h-64">
      <div className="text-text-secondary">Loading...</div>
    </div>;
  }

  if (!video) {
    return <div className="flex justify-center items-center h-64">
      <div className="text-text-secondary">Video not found</div>
    </div>;
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Control Buttons */}
      <div className="flex justify-center gap-3 mb-4">
        <button
          onClick={handleBack}
          className="icon-btn hover:bg-accent hover:border-accent"
          title="Back"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
        </button>

        <button
          onClick={handleToggleWatched}
          className={`icon-btn hover:bg-accent hover:border-accent ${video.watched ? 'bg-accent' : ''}`}
          title={video.watched ? 'Mark as unwatched' : 'Mark as watched'}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        </button>

        <button
          ref={addToPlaylistButtonRef}
          onClick={() => setShowPlaylistMenu(true)}
          className="icon-btn hover:bg-accent hover:border-accent"
          title="Playlist Options"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7"></rect>
            <rect x="14" y="3" width="7" height="7"></rect>
            <rect x="3" y="14" width="7" height="7"></rect>
            <rect x="14" y="14" width="7" height="7"></rect>
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

      {/* Video Player */}
      <div className="w-full max-w-5xl mx-auto">
        <div data-vjs-player>
          <video
            ref={videoRef}
            className="video-js vjs-big-play-centered"
            playsInline
            webkit-playsinline="true"
            x-webkit-airplay="allow"
          />
        </div>
      </div>

      {/* Video Info */}
      <div className="max-w-5xl mx-auto mt-4 space-y-3">
        <h1 className="text-2xl font-bold text-text-primary leading-tight">
          {video.title}
        </h1>

        {video.channel_name && (
          <div className="flex items-center gap-2 text-text-secondary">
            <Link
              to={`/library?channel=${encodeURIComponent(video.channel_name)}`}
              className="hover:text-accent transition-colors"
            >
              {video.channel_name}
            </Link>
          </div>
        )}
      </div>

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete Video"
          message="Are you sure you want to delete this video? This action cannot be undone."
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
          confirmText="Delete"
          cancelText="Cancel"
          isDangerous={true}
        />
      )}

      {/* Playlist Menu */}
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
