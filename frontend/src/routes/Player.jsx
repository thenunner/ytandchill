import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState, useCallback } from 'react';
import 'video.js/dist/video-js.css';
import { useVideo, useUpdateVideo, useDeleteVideo, useQueue } from '../api/queries';
import { useNotification } from '../contexts/NotificationContext';
import { getUserFriendlyError, formatDuration } from '../utils/utils';
import { getVideoSource } from '../utils/videoUtils';
import { ConfirmDialog } from '../components/ui/SharedModals';
import AddToPlaylistMenu from '../components/AddToPlaylistMenu';
import { LoadingSpinner } from '../components/ListFeedback';
import MobileBottomNav from '../components/MobileBottomNav';
import { useVideoJsPlayer } from '../hooks/useVideoJsPlayer';
import { useNativeVideoPlayer } from '../hooks/useNativeVideoPlayer';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { ArrowLeftIcon, EyeIcon, CheckmarkIcon } from '../components/Icons';
import Sidebar from '../components/Sidebar';

export default function Player() {
  const { videoId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: video, isLoading } = useVideo(videoId);
  const updateVideo = useUpdateVideo();
  const deleteVideo = useDeleteVideo();
  const { data: queueData } = useQueue();
  const queueCount = queueData?.queue_items?.filter(i => i.status === 'pending' || i.status === 'downloading').length || 0;
  const { showNotification } = useNotification();

  // Player refs - separate refs for mobile (native) and desktop (Video.js)
  const mobileVideoRef = useRef(null);
  const desktopVideoRef = useRef(null);
  const addToPlaylistButtonRef = useRef(null);

  // Refs to hold latest values for event handlers (avoid stale closures)
  const showNotificationRef = useRef(showNotification);
  const videoDataRef = useRef(video);

  // State
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isTheaterMode, setIsTheaterMode] = useState(() => {
    const saved = localStorage.getItem('theaterMode');
    return saved === 'true';
  });

  // Media query for mobile vs desktop - use touch detection for reliable native video
  // pointer: coarse = touch device (use native HTML5 video)
  // This ensures tablets and wide phones also get the native player
  const isTouchDevice = useMediaQuery('(pointer: coarse)');
  const isSmallScreen = useMediaQuery('(max-width: 767px)');
  const isMobile = isTouchDevice || isSmallScreen;

  // Keep refs updated with latest values
  useEffect(() => {
    showNotificationRef.current = showNotification;
    videoDataRef.current = video;
  });

  // Auto-collapse sidebar in theater mode
  useEffect(() => {
    if (isTheaterMode) {
      setSidebarCollapsed(true);
    }
  }, [isTheaterMode]);

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

  // Handle video error callback for native player
  const handleVideoError = useCallback((message) => {
    showNotificationRef.current(message, 'error');
  }, []);

  // Mobile: Native HTML5 video player (simple, reliable fullscreen)
  useNativeVideoPlayer({
    video: video,
    videoRef: mobileVideoRef,
    saveProgress: true,
    onEnded: null,
    onWatched: handleWatched,
    onError: handleVideoError,
    updateVideoMutation: updateVideo,
  });

  // Desktop: Video.js player (rich features, theater mode, keyboard shortcuts)
  const playerRef = useVideoJsPlayer({
    video: video,
    videoRef: desktopVideoRef,
    saveProgress: true,
    onEnded: null,
    onWatched: handleWatched,
    updateVideoMutation: updateVideo,
    isTheaterMode: isTheaterMode,
    setIsTheaterMode: setIsTheaterMode,
    autoplay: true, // Auto-play on desktop when entering player
  });

  // Set video source for Video.js player (desktop only)
  useEffect(() => {
    // Skip on mobile - native player handles its own source
    if (isMobile) return;

    if (!playerRef.current || !video?.file_path) {
      return;
    }

    try {
      const player = playerRef.current;

      // Safety check: don't operate on disposed player
      if (player.isDisposed && player.isDisposed()) {
        return;
      }

      const videoSrc = getVideoSource(video.file_path);

      if (!videoSrc) {
        return;
      }

      player.src({
        src: videoSrc,
        type: 'video/mp4'
      });

      // Add error notification
      const handleError = () => {
        const error = player.error();
        if (error) {
          showNotificationRef.current('Failed to load video', 'error');
        }
      };

      player.on('error', handleError);

      return () => {
        player.off('error', handleError);
      };
    } catch (error) {
      // Silently handle errors
    }
  }, [playerRef, video?.file_path, video?.id, isMobile]);

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
      await deleteVideo.mutateAsync(video.id);
      showNotification('Video deleted', 'success');
      setShowDeleteConfirm(false);
      navigate(-1);
    } catch (error) {
      showNotification(getUserFriendlyError(error.message, 'delete video'), 'error');
    }
  };

  const handleBack = () => {
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
      showNotification(getUserFriendlyError(error.message, 'update video'), 'error');
    }
  };

  // Mobile layout with bottom navigation - uses native HTML5 video
  if (isMobile) {
    return (
      <div className="flex flex-col h-screen bg-dark-primary animate-fade-in">
        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto">
          {/* Video Wrapper - Native HTML5 video for reliable mobile fullscreen */}
          <div className="player-wrapper-mobile">
            <video
              ref={mobileVideoRef}
              controls
              playsInline
              preload="metadata"
              poster={video.thumb_url || ''}
            />
          </div>

          {/* Video Info - hidden in landscape via CSS */}
          <div className="player-video-info px-4 py-3 space-y-3">
            <h1 className="text-base font-semibold text-text-primary leading-tight line-clamp-2">
              {video.title}
            </h1>

            <div className="flex items-center gap-2 text-xs text-text-secondary">
              <Link
                to={`/channel/${video.channel_id}/library`}
                className="hover:text-text-primary transition-colors font-medium"
              >
                {video.channel_title}
              </Link>
              <span>•</span>
              <span>{formatDuration(video.duration_sec)}</span>
            </div>

            {/* Action Buttons - Mobile */}
            <div className="flex flex-wrap gap-2">
              <button
                ref={addToPlaylistButtonRef}
                onClick={() => setShowPlaylistMenu(true)}
                className="flex items-center justify-center px-5 py-3 bg-dark-secondary border border-dark-border rounded-lg text-text-primary text-sm font-medium transition-colors"
              >
                Playlist
              </button>
              <button
                onClick={toggleWatched}
                className={`flex items-center justify-center px-5 py-3 border rounded-lg text-sm font-medium transition-colors ${
                  video.watched
                    ? 'bg-accent border-accent text-white'
                    : 'bg-dark-secondary border-dark-border text-text-primary'
                }`}
              >
                <EyeIcon className="w-5 h-5" />
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center justify-center px-5 py-3 bg-dark-secondary border border-dark-border rounded-lg text-red-400 text-sm font-medium transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Bottom Navigation */}
        <MobileBottomNav queueCount={queueCount} />

        {/* Dialogs */}
        <ConfirmDialog
          isOpen={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={handleDelete}
          title="Delete Video"
          message={`Are you sure you want to delete "${video.title}"?`}
          confirmText="Delete"
          cancelText="Cancel"
          isDanger={true}
        />
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

  // Desktop layout with sidebar
  return (
    <div className="flex h-screen overflow-hidden animate-fade-in">
      {/* Sidebar Navigation */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main Content Area - Single video element, styling changes based on mode */}
      <div className="flex-1 flex flex-col overflow-y-auto bg-dark-primary pl-4">
        {/* Video Section - container styling changes, video element stays mounted */}
        <div
          className={`shrink-0 ${
            isTheaterMode ? 'bg-black flex justify-center' : 'p-4 pb-0'
          }`}
        >
          <div
            className="flex flex-col"
            style={
              isTheaterMode
                ? { width: '100%', maxWidth: 'calc(100vh * 16 / 9)' }
                : {}
            }
          >
            {/* Video Wrapper - Video.js for desktop with rich features */}
            <div
              className={`player-wrapper ${isTheaterMode ? '' : 'shadow-card-hover'}`}
              style={{
                height: isTheaterMode ? '100vh' : 'calc(100vh - 180px)',
                maxWidth: isTheaterMode ? '100%' : 'calc((100vh - 180px) * 16 / 9)',
                width: '100%',
              }}
            >
              <video
                ref={desktopVideoRef}
                className="video-js vjs-big-play-centered"
                playsInline
                preload="auto"
              />
            </div>

            {/* Info Section - in theater mode, stays with video; in normal mode, separate */}
            <div className={`${isTheaterMode ? 'bg-dark-primary py-3 px-1' : 'py-3'}`}>
              <h1 className="text-lg font-bold text-text-primary leading-tight line-clamp-2">
                {video.title}
              </h1>

              <div className="flex items-center gap-2 mt-1 text-sm text-text-secondary">
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
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/20 text-accent-text text-xs font-semibold">
                      <CheckmarkIcon className="w-3 h-3" />
                      Watched
                    </span>
                  </>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleBack}
                  className="flex items-center justify-center px-4 py-2 bg-dark-surface border border-dark-border rounded-lg text-text-secondary hover:bg-dark-hover hover:text-text-primary transition-colors text-sm font-medium"
                >
                  Back
                </button>

                <button
                  ref={addToPlaylistButtonRef}
                  onClick={() => setShowPlaylistMenu(true)}
                  className="flex items-center justify-center px-4 py-2 bg-dark-surface border border-dark-border rounded-lg text-text-secondary hover:bg-accent hover:border-accent hover:text-dark-primary transition-colors text-sm font-medium"
                >
                  Playlist
                </button>

                <button
                  onClick={toggleWatched}
                  className={`flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors text-sm font-medium ${
                    video.watched
                      ? 'bg-accent border-accent text-dark-primary'
                      : 'bg-dark-surface border-dark-border text-text-secondary hover:bg-accent hover:border-accent hover:text-dark-primary'
                  }`}
                >
                  <EyeIcon />
                  <span>{video.watched ? 'Watched' : 'Mark Watched'}</span>
                </button>

                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center justify-center px-4 py-2 bg-dark-surface border border-dark-border rounded-lg text-red-400 hover:bg-red-600 hover:border-red-600 hover:text-white transition-colors text-sm font-medium"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dialogs */}
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
