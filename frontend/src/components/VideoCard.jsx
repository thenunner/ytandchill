import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useDeleteVideo } from '../api/queries';
import { useNotification } from '../contexts/NotificationContext';
import AddToPlaylistMenu from './AddToPlaylistMenu';
import ConfirmDialog from './ConfirmDialog';

export default function VideoCard({
  video,
  isSelected,
  onToggleSelect,
  showRemoveFromPlaylist,
  onRemoveFromPlaylist,
  isQueued,
  editMode = false, // New prop for edit mode
  isLibraryView = false, // New prop for library view (shows 3-column layout with file size)
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const deleteVideo = useDeleteVideo();
  const { showNotification } = useNotification();
  const [showMenu, setShowMenu] = useState(false);
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const menuRef = useRef(null);
  const threeDotButtonRef = useRef(null);
  const videoPreviewRef = useRef(null);
  const previewTimeoutRef = useRef(null);

  const formatDuration = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return hrs > 0
      ? `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
      : `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const year = dateStr.slice(0, 4);
    const month = dateStr.slice(4, 6);
    const day = dateStr.slice(6, 8);
    return `${month}/${day}/${year}`;
  };

  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '';
    const gb = bytes / (1024 * 1024 * 1024);
    const mb = bytes / (1024 * 1024);

    if (gb >= 1) {
      return `${gb.toFixed(2)} GB`;
    } else {
      return `${mb.toFixed(0)} MB`;
    }
  };

  const handleDelete = async () => {
    try {
      await deleteVideo.mutateAsync(video.id);
      showNotification('Video deleted', 'success');
      setShowMenu(false);
      setShowDeleteConfirm(false);
    } catch (error) {
      showNotification(error.message || 'Failed to delete video', 'error');
    }
  };

  const handleCardClick = (e) => {
    // Don't navigate if clicking on menu or buttons
    if (e.target.closest('button') || e.target.closest('.menu')) {
      return;
    }

    // If onToggleSelect is provided (either in edit mode or discovery mode), toggle selection
    if (onToggleSelect) {
      onToggleSelect(video.id);
      return;
    }

    // Otherwise, play the video (only if it's downloaded)
    if (video.status === 'library') {
      navigate(`/player/${video.id}`, {
        state: { from: location.pathname + location.search }
      });
    }
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu]);

  // Cleanup preview on unmount
  useEffect(() => {
    return () => {
      if (previewTimeoutRef.current) {
        clearTimeout(previewTimeoutRef.current);
      }
      if (videoPreviewRef.current) {
        videoPreviewRef.current.pause();
        videoPreviewRef.current.src = '';
      }
    };
  }, []);

  const handlePreviewStart = () => {
    if (!isDownloaded || !video.file_path) return;

    if (videoPreviewRef.current) {
      // Build video source URL
      const pathParts = video.file_path.replace(/\\/g, '/').split('/');
      const videoSrc = `/api/media/${pathParts.slice(-2).join('/')}`;

      const video_el = videoPreviewRef.current;

      // Only set src if not already set
      if (video_el.src !== window.location.origin + videoSrc) {
        video_el.src = videoSrc;
      }

      // Start at ~15% into the video
      const startTime = Math.min(video.duration_sec * 0.15, video.duration_sec - 15);

      // Wait for video to be ready before showing
      const playPreview = () => {
        video_el.currentTime = Math.max(0, startTime);
        setPreviewPlaying(true);
        video_el.play().catch(() => {
          setPreviewPlaying(false);
        });
      };

      // If video already has data, play immediately
      if (video_el.readyState >= 2) {
        playPreview();
      } else {
        // Wait for enough data to play
        video_el.oncanplay = () => {
          playPreview();
          video_el.oncanplay = null;
        };
      }
    }
  };

  const handlePreviewStop = () => {
    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current);
    }
    setPreviewPlaying(false);
    if (videoPreviewRef.current) {
      videoPreviewRef.current.pause();
      videoPreviewRef.current.oncanplay = null;
    }
  };

  const isDownloaded = video.status === 'library';
  const isDownloading = video.status === 'downloading';

  // Get status badge info - only show DOWNLOADING, QUEUED, IGNORED, or GEO-BLOCKED
  const getStatusBadge = () => {
    if (isDownloading) {
      return { text: 'DOWNLOADING', bg: 'bg-accent/95', position: 'top' };
    }
    if (isQueued) {
      return { text: 'QUEUED', bg: 'bg-blue-600/95', position: 'top' };
    }
    if (video.status === 'removed') {
      return { text: 'REMOVED', bg: 'bg-red-600/95', position: 'bottom' };
    }
    if (video.status === 'ignored') {
      return { text: 'IGNORED', bg: 'bg-gray-900/70', position: 'bottom' };
    }
    return null;
  };

  const statusBadge = getStatusBadge();

  return (
    <div
      className="group cursor-pointer transition-colors rounded"
      onClick={handleCardClick}
    >
      {/* Thumbnail with video preview */}
      <div
        className={`relative aspect-video bg-dark-tertiary overflow-hidden transition-all ${
          isSelected
            ? 'rounded-t-xl'
            : 'rounded-t-xl rounded-b-xl group-hover:rounded-b-none'
        }`}
        onMouseEnter={handlePreviewStart}
        onMouseLeave={handlePreviewStop}
      >
        {/* Video Preview Element (hidden until hover) */}
        {isDownloaded && video.file_path && (
          <video
            ref={videoPreviewRef}
            className={`absolute inset-0 w-full h-full object-cover ${previewPlaying ? 'block' : 'hidden'}`}
            muted
            playsInline
            loop
          />
        )}

        {/* Thumbnail Image */}
        {!previewPlaying && (
          <>
            {video.thumb_url ? (
              <img
                src={video.thumb_url}
                alt={video.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <svg className="w-10 h-10 text-text-muted" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                </svg>
              </div>
            )}
          </>
        )}

        {/* Selection Checkmark - Top Right (Show when selection is active) */}
        {isSelected && onToggleSelect && (
          <div className="absolute top-2 right-2 bg-black/80 text-white rounded-full p-1.5 shadow-lg z-10">
            <svg className="w-4 h-4 text-accent-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
        )}

        {/* Status Badge - For non-library videos (channels view) */}
        {statusBadge && statusBadge.position === 'top' && (
          <div className={`absolute top-2 left-2 ${statusBadge.bg} text-white px-3 py-1 rounded text-xs font-bold tracking-wide backdrop-blur-sm z-10`}>
            {statusBadge.text}
          </div>
        )}
        {statusBadge && statusBadge.position === 'bottom' && (
          <div className={`absolute bottom-0 left-0 right-0 ${statusBadge.bg} text-white px-3 py-1.5 text-center text-xs font-bold tracking-wide backdrop-blur-sm z-10`}>
            {statusBadge.text}
          </div>
        )}

        {/* Duration overlay - bottom right (YouTube style) */}
        {video.duration_sec && (
          <div className="absolute bottom-1 right-1 bg-black/80 text-white text-xs font-semibold px-1.5 py-0.5 rounded">
            {formatDuration(video.duration_sec)}
          </div>
        )}

        {/* WATCHED badge - top left overlay (library videos only) */}
        {isDownloaded && video.watched && (
          <div className="absolute top-2 left-2 bg-black/80 text-white px-2 py-0.5 rounded text-xs font-semibold">
            WATCHED
          </div>
        )}

        {/* PLAYLIST badge - bottom left overlay (when video is in playlists) */}
        {video.playlist_ids && video.playlist_ids.length > 0 && (
          <div className="absolute bottom-1 left-1 bg-green-600/90 text-white px-1.5 py-0.5 rounded text-xs font-semibold">
            PLAYLIST
          </div>
        )}
      </div>

      {/* Content */}
      <div className={`p-3 space-y-2 rounded-b-xl transition-colors ${isSelected ? 'bg-dark-tertiary' : 'group-hover:bg-dark-tertiary'}`}>
        {/* Title + 3-dot menu (library videos only) */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-medium text-text-primary line-clamp-2 leading-tight flex-1 min-w-0" title={video.title}>
            {video.title}
          </h3>

          {/* 3-dot menu - library videos only */}
          {isDownloaded && !editMode && (
            <div className="relative flex-shrink-0" ref={menuRef}>
              <button
                ref={threeDotButtonRef}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(!showMenu);
                }}
                title="Video options"
                className="p-1 rounded hover:bg-dark-hover transition-colors text-text-secondary hover:text-text-primary"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="5" r="2"></circle>
                  <circle cx="12" cy="12" r="2"></circle>
                  <circle cx="12" cy="19" r="2"></circle>
                </svg>
              </button>

              {/* Dropdown Menu */}
              {showMenu && (
                <div
                  className="menu absolute right-0 mt-1 bg-dark-secondary border border-dark-border rounded-lg shadow-xl py-1 min-w-[160px] z-50"
                  onMouseLeave={(e) => e.stopPropagation()}
                >
                  {showRemoveFromPlaylist ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveFromPlaylist(video.id);
                        setShowMenu(false);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-dark-hover transition-colors flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      </svg>
                      Remove from playlist
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMenu(false);
                        setShowPlaylistMenu(true);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-dark-hover transition-colors flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                      </svg>
                      Add to playlist
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(false);
                      setShowDeleteConfirm(true);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-dark-hover transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      <line x1="10" y1="11" x2="10" y2="17"></line>
                      <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                    Delete video
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Metadata */}
        {isLibraryView && video.file_size_bytes ? (
          // Library view: YouTube style - date • size
          <div className="text-sm text-text-secondary font-medium">
            <span>{formatDate(video.upload_date)} • {formatFileSize(video.file_size_bytes)}</span>
          </div>
        ) : (
          // Channel view: date only - duration now on thumbnail
          <div className="text-sm text-text-secondary font-medium">
            <span>{formatDate(video.upload_date)}</span>
          </div>
        )}
      </div>

      {/* Add to Playlist Menu */}
      {showPlaylistMenu && (
        <AddToPlaylistMenu
          videoId={video.id}
          video={video}
          triggerRef={threeDotButtonRef}
          onClose={() => setShowPlaylistMenu(false)}
        />
      )}

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
    </div>
  );
}
