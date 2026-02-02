import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useVideo, useVideoPlayback, useUpdateVideo, useDeleteVideo, useQueue } from '../api/queries';
import { useNotification } from '../contexts/NotificationContext';
import { useSSE } from '../contexts/SSEContext';
import { getUserFriendlyError, formatDuration } from '../utils/utils';
import { ConfirmDialog } from '../components/ui/SharedModals';
import AddToPlaylistMenu from '../components/AddToPlaylistMenu';
import { LoadingSpinner } from '../components/ListFeedback';
import MobileBottomNav from '../components/MobileBottomNav';
import { useUnifiedPlayer } from '../hooks/useUnifiedPlayer';
import PlayerControls from '../components/PlayerControls';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { EyeIcon, CheckmarkIcon } from '../components/Icons';
import Sidebar from '../components/Sidebar';

export default function Player() {
  const { videoId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  // Pause SSE connection while viewing video to free up HTTP connection slot
  // This reduces queueing time for video loading from ~6s to near-instant
  const { pause: pauseSSE, resume: resumeSSE } = useSSE();
  useEffect(() => {
    pauseSSE();
    return () => resumeSSE();
  }, [pauseSSE, resumeSSE]);

  // Track mount time for accurate timing
  const mountTimeRef = useRef(performance.now());

  // INSTANT: Use video data from route state if available (passed from library/list views)
  // This eliminates the API wait entirely when navigating from within the app
  const routeVideo = location.state?.video;

  // BACKUP: Fetch from API if no route state (direct URL access, refresh, etc.)
  const { data: apiPlaybackData, isLoading: playbackLoading } = useVideoPlayback(videoId);
  const { data: apiVideo } = useVideo(videoId);

  // Use route state immediately, fall back to API data
  const video = routeVideo || apiVideo;
  const playbackData = routeVideo ? {
    id: routeVideo.id,
    file_path: routeVideo.file_path,
    playback_seconds: routeVideo.playback_seconds,
    sponsorblock_segments: routeVideo.sponsorblock_segments,
    status: routeVideo.status,
  } : apiPlaybackData;

  // Log timing
  useEffect(() => {
    if (routeVideo) {
      console.log('[Timing] Using route state - instant start');
    }
  }, [routeVideo]);

  useEffect(() => {
    if (apiPlaybackData && !routeVideo) {
      console.log('[Timing] mount_to_api:', `${(performance.now() - mountTimeRef.current).toFixed(0)}ms`);
    }
  }, [apiPlaybackData, routeVideo]);

  const updateVideo = useUpdateVideo();
  const deleteVideo = useDeleteVideo();
  const { data: queueData } = useQueue();
  const queueCount = queueData?.queue_items?.filter(i => i.status === 'pending' || i.status === 'downloading').length || 0;
  const { showNotification } = useNotification();

  // Player refs - single ref for unified native player
  // Use callback ref pattern to detect when video element mounts
  const videoRef = useRef(null);
  const [videoElement, setVideoElement] = useState(null);
  const videoRefCallback = useCallback((el) => {
    videoRef.current = el;
    if (el) setVideoElement(el);
  }, []);
  const addToPlaylistButtonRef = useRef(null);

  // Refs to hold latest values for event handlers (avoid stale closures)
  const showNotificationRef = useRef(showNotification);

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
  });

  // Auto-collapse sidebar in theater mode
  useEffect(() => {
    if (isTheaterMode) {
      setSidebarCollapsed(true);
    }
  }, [isTheaterMode]);

  // Handle watched callback - use full video data when available
  const handleWatched = useCallback(() => {
    const vid = video || playbackData;
    if (vid && !video?.watched) {
      updateVideo.mutateAsync({
        id: vid.id,
        data: { watched: true },
      }).then(() => {
        showNotificationRef.current('Video marked as watched', 'success');
      }).catch((error) => {
        console.error('Error marking video as watched:', error);
        showNotificationRef.current('Failed to mark as watched', 'error');
      });
    }
  }, [video, playbackData, updateVideo]);

  // Combine playback data with full video data for the player
  // Player can start with just playbackData, UI elements use full video when available
  const playerVideoData = playbackData ? {
    id: playbackData.id,
    file_path: playbackData.file_path,
    playback_seconds: playbackData.playback_seconds,
    sponsorblock_segments: playbackData.sponsorblock_segments,
    status: playbackData.status,
    // Merge in full video data when available (for watched status tracking)
    watched: video?.watched,
  } : null;

  // Unified native player with custom controls - works on both mobile and desktop
  // Uses playbackData for fast start, full video data loads in parallel
  const player = useUnifiedPlayer({
    video: playerVideoData,
    videoRef: videoRef,
    videoElement: videoElement,  // Direct element for reliable mounting detection
    saveProgress: true,
    onEnded: null,
    onWatched: handleWatched,
    updateVideoMutation: updateVideo,
    isTheaterMode: isTheaterMode,
    setIsTheaterMode: setIsTheaterMode,
    autoplay: true,
  });

  // Compute video source URL early so we can set it in JSX for high priority
  const getVideoSource = (filePath) => {
    if (!filePath) return null;
    const pathParts = filePath.replace(/\\/g, '/').split('/');
    const downloadsIndex = pathParts.indexOf('downloads');
    const relativePath = downloadsIndex >= 0
      ? pathParts.slice(downloadsIndex + 1).join('/')
      : pathParts.slice(-2).join('/');
    return `/media/${relativePath}`;
  };
  const videoSrc = playbackData?.file_path ? getVideoSource(playbackData.file_path) : null;

  // Add preload link to document head for high priority loading
  useEffect(() => {
    if (!videoSrc) return;

    // Check if preload link already exists
    const existingLink = document.querySelector(`link[rel="preload"][href="${videoSrc}"]`);
    if (existingLink) return;

    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'video';
    link.href = videoSrc;
    link.setAttribute('fetchpriority', 'high');
    document.head.appendChild(link);

    console.log('[Timing] Added preload link for video:', videoSrc);

    return () => {
      if (link.parentNode) {
        link.parentNode.removeChild(link);
      }
    };
  }, [videoSrc]);

  // Only wait for playback data (fast), not full metadata
  if (playbackLoading) {
    return <LoadingSpinner />;
  }

  if (!playbackData) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400 text-lg">Video not found</p>
        <button onClick={() => navigate(-1)} className="btn btn-primary mt-4">
          Go Back
        </button>
      </div>
    );
  }

  if (!playbackData.file_path || playbackData.status !== 'library') {
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
      await deleteVideo.mutateAsync(playbackData.id);
      showNotification('Video deleted', 'success');
      setShowDeleteConfirm(false);
      navigate(-1);
    } catch (error) {
      showNotification(getUserFriendlyError(error.message, 'delete video'), 'error');
    }
  };

  const handleBack = () => {
    const referrer = location.state?.from || `/channel/${video?.channel_id}/library`;
    navigate(referrer);
  };

  const toggleWatched = async () => {
    if (!video) return; // Need full metadata for watched status
    try {
      await updateVideo.mutateAsync({
        id: playbackData.id,
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

  // Mobile layout with bottom navigation - uses native HTML5 video with custom controls
  if (isMobile) {
    return (
      <div className="flex flex-col h-screen bg-dark-primary animate-fade-in">
        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto">
          {/* Video Wrapper - Native HTML5 video with custom controls */}
          <div className="player-wrapper-mobile relative" onClick={player.handleVideoClick}>
            <video
              ref={videoRefCallback}
              src={videoSrc || undefined}
              playsInline
              preload="auto"
              poster={video?.thumb_url || ''}
              fetchpriority="high"
            />
            <PlayerControls
              isPlaying={player.isPlaying}
              currentTime={player.currentTime}
              duration={player.duration}
              volume={player.volume}
              isMuted={player.isMuted}
              playbackRate={player.playbackRate}
              isFullscreen={player.isFullscreen}
              showControls={player.showControls}
              isBuffering={player.isBuffering}
              isTheaterMode={false}
              sponsorSegments={player.sponsorSegments}
              onTogglePlay={player.togglePlay}
              onSeek={player.seek}
              onSeekRelative={player.seekRelative}
              onSetSpeed={player.setSpeed}
              onToggleMute={player.toggleMute}
              onSetVolume={player.setVolume}
              onToggleFullscreen={player.toggleFullscreen}
              onToggleTheaterMode={null}
              isMobile={true}
            />
          </div>

          {/* Video Info - hidden in landscape via CSS, shows loading state until metadata arrives */}
          <div className="player-video-info px-4 py-3 space-y-3">
            <h1 className="text-base font-semibold text-text-primary leading-tight line-clamp-2">
              {video?.title || 'Loading...'}
            </h1>

            <div className="flex items-center gap-2 text-xs text-text-secondary">
              {video?.channel_id ? (
                <Link
                  to={`/channel/${video.channel_id}/library`}
                  className="hover:text-text-primary transition-colors font-medium"
                >
                  {video.channel_title}
                </Link>
              ) : (
                <span>Loading...</span>
              )}
              {video?.duration_sec && (
                <>
                  <span>•</span>
                  <span>{formatDuration(video.duration_sec)}</span>
                </>
              )}
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
                disabled={!video}
                className={`flex items-center justify-center px-5 py-3 border rounded-lg text-sm font-medium transition-colors ${
                  video?.watched
                    ? 'bg-accent border-accent text-white'
                    : 'bg-dark-secondary border-dark-border text-text-primary'
                } ${!video ? 'opacity-50' : ''}`}
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
          message={`Are you sure you want to delete "${video?.title || 'this video'}"?`}
          confirmText="Delete"
          cancelText="Cancel"
          isDanger={true}
        />
        {showPlaylistMenu && (
          <AddToPlaylistMenu
            videoId={playbackData.id}
            video={video || playbackData}
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
            {/* Video Wrapper - Native HTML5 with custom controls for desktop */}
            <div
              className={`player-wrapper relative ${isTheaterMode ? '' : 'shadow-card-hover'}`}
              style={{
                height: isTheaterMode ? '100vh' : 'calc(100vh - 180px)',
                maxWidth: isTheaterMode ? '100%' : 'calc((100vh - 180px) * 16 / 9)',
                width: '100%',
              }}
              onMouseMove={player.showControlsTemporarily}
              onClick={player.handleVideoClick}
            >
              <video
                ref={videoRefCallback}
                src={videoSrc || undefined}
                className="w-full h-full object-contain bg-black"
                playsInline
                preload="auto"
                fetchpriority="high"
              />
              <PlayerControls
                isPlaying={player.isPlaying}
                currentTime={player.currentTime}
                duration={player.duration}
                volume={player.volume}
                isMuted={player.isMuted}
                playbackRate={player.playbackRate}
                isFullscreen={player.isFullscreen}
                showControls={player.showControls}
                isBuffering={player.isBuffering}
                isTheaterMode={isTheaterMode}
                sponsorSegments={player.sponsorSegments}
                onTogglePlay={player.togglePlay}
                onSeek={player.seek}
                onSeekRelative={player.seekRelative}
                onSetSpeed={player.setSpeed}
                onToggleMute={player.toggleMute}
                onSetVolume={player.setVolume}
                onToggleFullscreen={player.toggleFullscreen}
                onToggleTheaterMode={player.toggleTheaterMode}
                isMobile={false}
              />
            </div>

            {/* Info Section - in theater mode, stays with video; in normal mode, separate */}
            <div className={`${isTheaterMode ? 'bg-dark-primary py-3 px-1' : 'py-3'}`}>
              <h1 className="text-lg font-bold text-text-primary leading-tight line-clamp-2">
                {video?.title || 'Loading...'}
              </h1>

              <div className="flex items-center gap-2 mt-1 text-sm text-text-secondary">
                {video?.channel_id ? (
                  <Link
                    to={`/channel/${video.channel_id}/library`}
                    className="hover:text-text-primary transition-colors font-medium"
                  >
                    {video.channel_title}
                  </Link>
                ) : (
                  <span>Loading...</span>
                )}
                {video?.duration_sec && (
                  <>
                    <span>•</span>
                    <span>{formatDuration(video.duration_sec)}</span>
                  </>
                )}
                {video?.upload_date && (
                  <>
                    <span>•</span>
                    <span>
                      {new Date(
                        video.upload_date.slice(0, 4),
                        video.upload_date.slice(4, 6) - 1,
                        video.upload_date.slice(6, 8)
                      ).toLocaleDateString()}
                    </span>
                  </>
                )}
                {video?.watched && (
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
                  disabled={!video}
                  className={`flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors text-sm font-medium ${
                    video?.watched
                      ? 'bg-accent border-accent text-dark-primary'
                      : 'bg-dark-surface border-dark-border text-text-secondary hover:bg-accent hover:border-accent hover:text-dark-primary'
                  } ${!video ? 'opacity-50' : ''}`}
                >
                  <EyeIcon />
                  <span>{video?.watched ? 'Watched' : 'Mark Watched'}</span>
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
        message={`Are you sure you want to delete "${video?.title || 'this video'}"? This will permanently remove the video file from your system.`}
        confirmText="Delete"
        cancelText="Cancel"
        isDanger={true}
      />

      {showPlaylistMenu && (
        <AddToPlaylistMenu
          videoId={playbackData.id}
          video={video || playbackData}
          triggerRef={addToPlaylistButtonRef}
          onClose={() => setShowPlaylistMenu(false)}
        />
      )}
    </div>
  );
}
