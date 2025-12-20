import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState, useCallback } from 'react';
import 'video.js/dist/video-js.css';
import { useVideo, useUpdateVideo, useDeleteVideo } from '../api/queries';
import { useNotification } from '../contexts/NotificationContext';
import ConfirmDialog from '../components/ConfirmDialog';
import AddToPlaylistMenu from '../components/AddToPlaylistMenu';
import LoadingSpinner from '../components/LoadingSpinner';
import { formatDuration, getVideoSource } from '../utils/videoPlayerUtils';
import { useVideoJsPlayer } from '../hooks/useVideoJsPlayer';

export default function Player() {
  const { videoId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: video, isLoading } = useVideo(videoId);
  const updateVideo = useUpdateVideo();
  const deleteVideo = useDeleteVideo();
  const { showNotification } = useNotification();

  // Player refs
  const videoRef = useRef(null);
  const addToPlaylistButtonRef = useRef(null);

  // Refs to hold latest values for event handlers (avoid stale closures)
  const showNotificationRef = useRef(showNotification);
  const videoDataRef = useRef(video);

  // State
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [isTheaterMode, setIsTheaterMode] = useState(() => {
    const saved = localStorage.getItem('theaterMode');
    return saved === 'true';
  });

  // Keep refs updated with latest values
  useEffect(() => {
    showNotificationRef.current = showNotification;
    videoDataRef.current = video;
  });

  // Handle watched callback
  const handleWatched = useCallback(() => {
    if (!video?.watched) {
      updateVideo.mutateAsync({
        id: video.id,
        data: { watched: true },
      }).then(() => {
        showNotificationRef.current('Video marked as watched', 'success');
      }).catch((error) => {
        console.error('Error marking video as watched:', error);
        showNotificationRef.current('Failed to mark as watched', 'error');
      });
    }
  }, [video?.id, video?.watched, updateVideo]);

  // Initialize video.js player using the hook
  const playerRef = useVideoJsPlayer({
    video: video,
    videoRef: videoRef,
    saveProgress: true,
    onEnded: null,
    onWatched: handleWatched,
    updateVideoMutation: updateVideo,
    isTheaterMode: isTheaterMode,
    setIsTheaterMode: setIsTheaterMode,
  });

  // Set video source when player is ready
  useEffect(() => {
    if (!playerRef.current || !video?.file_path) return;

    const player = playerRef.current;
    const videoSrc = getVideoSource(video.file_path);

    console.log('Setting video source:', videoSrc);

    player.src({
      src: videoSrc,
      type: 'video/mp4'
    });

    // Add error notification
    const handleError = () => {
      const error = player.error();
      if (error) {
        console.error('Video error:', error);
        showNotificationRef.current('Failed to load video', 'error');
      }
    };

    player.on('error', handleError);

    return () => {
      player.off('error', handleError);
    };
  }, [playerRef, video?.file_path, video?.id]);

  // For compatibility with existing code
  const playerInstanceRef = playerRef;

  if (isLoading) {
    return <LoadingSpinner />;
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
      {/* Flex Container: Buttons left, Player+Info right */}
      <div className="flex flex-col md:flex-row md:gap-4 md:items-start">
        {/* Control Buttons - Desktop: vertical column on left */}
        <div className="hidden md:flex md:flex-col md:gap-3">
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
        <div className={`md:max-w-[83.333%] transition-all duration-300 ease-in-out ${
          isTheaterMode ? 'md:w-[83.333%]' : 'md:w-[60%]'
        }`} style={{ willChange: 'width' }}>
          <div className={`bg-black rounded-xl shadow-card-hover relative flex items-center justify-center ${
            isTheaterMode ? '' : 'max-h-[600px]'
          }`}>
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

            {/* Control Buttons - Mobile: horizontal row below info */}
            <div className="flex md:hidden gap-3 mt-4">
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
