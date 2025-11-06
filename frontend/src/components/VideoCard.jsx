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
  const menuRef = useRef(null);
  const threeDotButtonRef = useRef(null);

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
    if (video.status === 'geoblocked') {
      return { text: 'GEO-BLOCKED', bg: 'bg-red-600/95', position: 'bottom' };
    }
    if (video.status === 'ignored') {
      return { text: 'IGNORED', bg: 'bg-gray-900/70', position: 'bottom' };
    }
    return null;
  };

  const statusBadge = getStatusBadge();

  return (
    <div
      className={`card cursor-pointer transition-colors ${
        isSelected ? 'ring-2 ring-accent/60' : ''
      } ${onToggleSelect ? 'hover:ring-2 hover:ring-accent/50' : ''}`}
      onClick={handleCardClick}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video bg-dark-tertiary overflow-hidden rounded-t-xl">
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

        {/* Playlist Badge - Top Left (only if not selected and has playlists) */}
        {!isSelected && video.playlist_ids && video.playlist_ids.length > 0 && (
          <div className="absolute top-2 left-2 bg-green-600/95 text-white px-2 py-0.5 rounded text-xs font-bold tracking-wide backdrop-blur-sm z-10">
            PLAYLIST
          </div>
        )}

        {/* Status Badge - Position based on status type */}
        {statusBadge && statusBadge.position === 'top' && (
          <div className={`absolute ${!isSelected && video.playlist_ids && video.playlist_ids.length > 0 ? 'top-8' : 'top-2'} left-2 ${statusBadge.bg} text-white px-3 py-1 rounded text-xs font-bold tracking-wide backdrop-blur-sm z-10`}>
            {statusBadge.text}
          </div>
        )}
        {statusBadge && statusBadge.position === 'bottom' && (
          <div className={`absolute bottom-0 left-0 right-0 ${statusBadge.bg} text-white px-3 py-1.5 text-center text-xs font-bold tracking-wide backdrop-blur-sm z-10`}>
            {statusBadge.text}
          </div>
        )}

        {/* Selection Checkmark - Top Right (Show when selection is active) */}
        {isSelected && onToggleSelect && (
          <div className="absolute top-2 right-2 bg-black/80 text-white rounded-full p-1.5 shadow-lg z-10">
            <svg className="w-4 h-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
        )}

        {/* 3-Dot Menu Button - Top Right (only for downloaded videos, not in edit mode) */}
        {isDownloaded && !editMode && (
          <div className="absolute top-2 right-2 z-20" ref={menuRef}>
            <button
              ref={threeDotButtonRef}
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              title="Video options"
              className="bg-black hover:bg-black text-white rounded-full p-1.5 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
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

        {/* Watched Badge - Bottom Banner */}
        {video.watched && !statusBadge && (
          <div className="absolute bottom-0 left-0 right-0 bg-green-500/95 text-white px-3 py-1.5 text-center text-xs font-bold tracking-wide backdrop-blur-sm z-10">
            WATCHED
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3 space-y-2">
        {/* Title */}
        <h3 className="text-sm font-medium text-white line-clamp-2 leading-tight" title={video.title}>
          {video.title}
        </h3>

        {/* Metadata */}
        {isLibraryView && video.file_size_bytes ? (
          // Library view: 3 columns - duration (left), date (center), size (right)
          <div className="grid grid-cols-3 gap-1 text-xs text-text-secondary">
            <span className="text-left">{formatDuration(video.duration_sec)}</span>
            <span className="text-center">{formatDate(video.upload_date)}</span>
            <span className="text-right">{formatFileSize(video.file_size_bytes)}</span>
          </div>
        ) : (
          // Channel view: 2 columns - duration (left), date (right)
          <div className="flex justify-between text-xs text-text-secondary">
            <span>{formatDuration(video.duration_sec)}</span>
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
