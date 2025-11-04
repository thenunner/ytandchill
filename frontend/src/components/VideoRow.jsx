import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDeleteVideo } from '../api/queries';
import { useNotification } from '../contexts/NotificationContext';
import AddToPlaylistMenu from './AddToPlaylistMenu';
import ConfirmDialog from './ConfirmDialog';

export default function VideoRow({
  video,
  isSelected,
  onToggleSelect,
  showRemoveFromPlaylist,
  onRemoveFromPlaylist,
  isQueued,
  editMode = false,
}) {
  const navigate = useNavigate();
  const deleteVideo = useDeleteVideo();
  const { showNotification } = useNotification();
  const [showMenu, setShowMenu] = useState(false);
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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
      navigate(`/player/${video.id}`);
    }
  };

  const isDownloaded = video.status === 'library';
  const isDownloading = video.status === 'downloading';

  // Get status badge info
  const getStatusBadge = () => {
    if (isDownloading) {
      return { text: 'DOWNLOADING', bg: 'bg-accent/95' };
    }
    if (isQueued) {
      return { text: 'QUEUED', bg: 'bg-blue-600/95' };
    }
    if (video.status === 'geoblocked') {
      return { text: 'GEO-BLOCKED', bg: 'bg-red-600/95' };
    }
    if (video.status === 'ignored') {
      return { text: 'IGNORED', bg: 'bg-gray-600/95' };
    }
    return null;
  };

  const statusBadge = getStatusBadge();

  return (
    <div
      className={`card flex items-center gap-3 p-0 w-full cursor-pointer transition-all ${
        isSelected ? 'ring-2 ring-accent/60 shadow-card-hover' : ''
      } ${onToggleSelect ? 'hover:ring-2 hover:ring-accent/50' : ''}`}
      onClick={handleCardClick}
    >
      {/* 3-Dot Menu Button - Left of thumbnail (only for downloaded videos, not in edit mode) */}
      {isDownloaded && !editMode && (
        <div className="flex-shrink-0 pl-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="w-8 h-8 flex items-center justify-center bg-dark-tertiary hover:bg-dark-hover text-text-secondary hover:text-white rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="2"></circle>
              <circle cx="12" cy="12" r="2"></circle>
              <circle cx="12" cy="19" r="2"></circle>
            </svg>
          </button>
        </div>
      )}

      {/* Sliding Drawer Menu - slides in from left, pushing content right */}
      {isDownloaded && !editMode && (
        <div
          className={`flex flex-col gap-1 overflow-hidden transition-all duration-200 ease-in-out ${
            showMenu ? 'w-[140px] opacity-100 pr-3' : 'w-0 opacity-0'
          }`}
        >
          {showRemoveFromPlaylist ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemoveFromPlaylist(video.id);
                setShowMenu(false);
              }}
              className="px-3 py-1.5 text-left text-xs text-text-primary hover:bg-dark-hover bg-dark-secondary rounded border border-dark-border transition-colors whitespace-nowrap"
            >
              Remove from playlist
            </button>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(false);
                setShowPlaylistMenu(true);
              }}
              className="px-3 py-1.5 text-left text-xs text-text-primary hover:bg-dark-hover bg-dark-secondary rounded border border-dark-border transition-colors whitespace-nowrap"
            >
              Add to playlist
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(false);
              setShowDeleteConfirm(true);
            }}
            className="px-3 py-1.5 text-left text-xs text-red-400 hover:bg-dark-hover bg-dark-secondary rounded border border-dark-border transition-colors whitespace-nowrap"
          >
            Delete video
          </button>
        </div>
      )}

      {/* Selection Checkmark - Show when selection is active */}
      {isSelected && onToggleSelect && !isDownloaded && (
        <div className="flex-shrink-0 pl-3">
          <div className="w-8 h-8 flex items-center justify-center bg-black/80 text-white rounded-full">
            <svg className="w-4 h-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
        </div>
      )}

      {/* Thumbnail */}
      <div className={`relative w-[200px] h-[80px] flex-shrink-0 bg-dark-tertiary rounded-lg overflow-hidden ${!isDownloaded || editMode ? 'ml-3' : ''}`}>
        {video.thumb_url ? (
          <img
            src={video.thumb_url}
            alt={video.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-8 h-8 text-text-muted" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
            </svg>
          </div>
        )}

        {/* Status Badge - Top Left */}
        {statusBadge && (
          <div className={`absolute top-1.5 left-1.5 ${statusBadge.bg} text-white px-2 py-0.5 rounded text-[10px] font-bold tracking-wide backdrop-blur-sm`}>
            {statusBadge.text}
          </div>
        )}

        {/* Watched Badge - Bottom Banner */}
        {video.watched && !statusBadge && (
          <div className="absolute bottom-0 left-0 right-0 bg-green-500/95 text-white px-2 py-1 text-center text-[10px] font-bold tracking-wide backdrop-blur-sm">
            WATCHED
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 py-2 pr-4 space-y-1.5">
        {/* Title */}
        <h3 className="text-base font-medium text-white leading-tight line-clamp-1" title={video.title}>
          {video.title}
        </h3>

        {/* Metadata */}
        <div className="flex items-center gap-2 text-xs text-text-secondary flex-wrap">
          <span>{formatDuration(video.duration_sec)}</span>
          <span className="text-text-muted">•</span>
          <span>{formatDate(video.upload_date)}</span>
          {video.file_size_bytes && (
            <>
              <span className="text-text-muted">•</span>
              <span>{formatFileSize(video.file_size_bytes)}</span>
            </>
          )}
          {video.playlist_ids && video.playlist_ids.length > 0 && (
            <>
              <span className="text-text-muted">•</span>
              <span className="text-green-500 font-semibold">In Playlist</span>
            </>
          )}
        </div>
      </div>

      {/* Add to Playlist Menu */}
      {showPlaylistMenu && (
        <AddToPlaylistMenu
          videoId={video.id}
          video={video}
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
