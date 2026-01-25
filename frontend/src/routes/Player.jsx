import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState, useCallback } from 'react';
import 'video.js/dist/video-js.css';
import { useVideo, useUpdateVideo, useDeleteVideo, useQueue } from '../api/queries';
import { useNotification } from '../contexts/NotificationContext';
import { getUserFriendlyError } from '../utils/errorMessages';
import ConfirmDialog from '../components/ConfirmDialog';
import AddToPlaylistMenu from '../components/AddToPlaylistMenu';
import LoadingSpinner from '../components/LoadingSpinner';
import MobileBottomNav from '../components/MobileBottomNav';
import { formatDuration, getVideoSource } from '../utils/videoPlayerUtils';
import { useVideoJsPlayer } from '../hooks/useVideoJsPlayer';
import { useMediaQuery } from '../hooks/useMediaQuery';
import {
  ArrowLeftIcon, PlusIcon, EyeIcon, TrashIcon, CheckmarkIcon, SettingsIcon,
  ChannelsIcon, LibraryIcon, QueueIcon, LogoutIcon, MenuIcon, CollapseIcon
} from '../components/icons';

export default function Player() {
  const { videoId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: video, isLoading } = useVideo(videoId);
  const { data: queueData } = useQueue({});
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isTheaterMode, setIsTheaterMode] = useState(() => {
    const saved = localStorage.getItem('theaterMode');
    return saved === 'true';
  });

  // Media query for mobile detection
  const isMobile = useMediaQuery('(max-width: 767px)');

  // Queue count for badge
  const queueCount = queueData?.queue?.length || 0;

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
  }, [playerRef, video?.file_path, video?.id]);

  // Handle logout
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
      window.location.replace('/login');
    } catch (error) {
      console.error('Logout failed:', error);
      window.location.replace('/login');
    }
  };

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

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  // Sidebar nav item component
  const NavLink = ({ to, icon, label, badge, onClick, isButton = false }) => {
    const isActive = location.pathname === to;
    const baseClasses = `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
      isActive
        ? 'bg-accent/20 text-accent-text'
        : 'text-text-secondary hover:bg-dark-hover hover:text-text-primary'
    }`;

    if (isButton) {
      return (
        <button onClick={onClick} className={baseClasses} title={label}>
          {icon}
          {!sidebarCollapsed && <span className="text-sm font-medium">{label}</span>}
        </button>
      );
    }

    return (
      <Link to={to} className={baseClasses} title={label}>
        {icon}
        {!sidebarCollapsed && (
          <>
            <span className="text-sm font-medium">{label}</span>
            {badge > 0 && (
              <span className="ml-auto bg-accent text-dark-primary text-xs font-bold px-2 py-0.5 rounded-full">
                {badge}
              </span>
            )}
          </>
        )}
        {sidebarCollapsed && badge > 0 && (
          <span className="absolute -top-1 -right-1 bg-accent text-dark-primary text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full">
            {badge}
          </span>
        )}
      </Link>
    );
  };

  // Mobile layout with bottom navigation
  if (isMobile) {
    return (
      <div className="flex flex-col h-screen bg-dark-primary animate-fade-in">
        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto">
          {/* Video Wrapper */}
          <div className="player-wrapper-mobile">
            <video
              ref={videoRef}
              className="video-js vjs-big-play-centered"
              playsInline
              preload="auto"
            />
          </div>

          {/* Video Info */}
          <div className="px-4 py-3 space-y-3">
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
      <nav
        className={`flex flex-col bg-dark-secondary border-r border-dark-border transition-all duration-200 ${
          sidebarCollapsed ? 'w-16' : 'w-44'
        }`}
      >
        {/* Sidebar Header - Toggle Button */}
        <div className="flex items-center justify-between p-3 border-b border-dark-border">
          {!sidebarCollapsed && (
            <span className="text-sm font-medium text-text-secondary">YTandChill</span>
          )}
          <button
            onClick={toggleSidebar}
            className="p-2 rounded-lg text-text-secondary hover:bg-dark-hover hover:text-text-primary transition-colors"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <MenuIcon /> : <CollapseIcon />}
          </button>
        </div>

        {/* Nav Links */}
        <div className="flex-1 p-2 space-y-1">
          <NavLink to="/" icon={<ChannelsIcon />} label="Channels" />
          <NavLink to="/library" icon={<LibraryIcon />} label="Library" />
          <NavLink to="/queue" icon={<QueueIcon />} label="Queue" badge={queueCount} />
        </div>

        {/* Bottom Links */}
        <div className="p-2 border-t border-dark-border space-y-1">
          <NavLink to="/settings" icon={<SettingsIcon />} label="Settings" />
          <NavLink isButton onClick={handleLogout} icon={<LogoutIcon />} label="Logout" />
        </div>
      </nav>

      {/* Main Content Area - Single video element, styling changes based on mode */}
      <div className="flex-1 flex flex-col overflow-y-auto bg-dark-primary">
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
            {/* Video Wrapper */}
            <div
              className={`player-wrapper ${isTheaterMode ? '' : 'shadow-card-hover'}`}
              style={{
                height: isTheaterMode ? '100vh' : 'calc(100vh - 180px)',
                maxWidth: isTheaterMode ? '100%' : 'calc((100vh - 180px) * 16 / 9)',
                width: '100%',
              }}
            >
              <video
                ref={videoRef}
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
