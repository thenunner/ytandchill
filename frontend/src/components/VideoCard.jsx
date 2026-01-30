import { useState, useRef, useEffect, memo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useDeleteVideo, useSettings } from '../api/queries';
import { useNotification } from '../contexts/NotificationContext';
import { getUserFriendlyError, getTextSizes, formatDuration, formatDate, formatDateTime, formatFileSize, getStringSetting } from '../utils/utils';
import { usePrefetchImage } from '../hooks/usePrefetchImage';
import AddToPlaylistMenu from './AddToPlaylistMenu';
import ConfirmDialog from './ConfirmDialog';
import { ThreeDotsIcon, CheckmarkIcon, TrashIcon, PlusIcon } from './icons';

// Memoized to prevent re-renders when sibling cards change selection state
const VideoCard = memo(function VideoCard({
  video,
  isSelected,
  onToggleSelect,
  isQueued,
  editMode = false, // New prop for edit mode
  isLibraryView = false, // New prop for library view (shows 3-column layout with file size)
  effectiveCardSize, // Required: card size for text sizing
}) {
  const { data: settings } = useSettings();
  const textSizes = getTextSizes(effectiveCardSize);
  const navigate = useNavigate();
  const location = useLocation();
  const deleteVideo = useDeleteVideo();
  const { showNotification } = useNotification();
  const [showMenu, setShowMenu] = useState(false);
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showVideoInfo, setShowVideoInfo] = useState(false);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewMuted, setPreviewMuted] = useState(true);
  const [previewProgress, setPreviewProgress] = useState(0);
  const [imageError, setImageError] = useState(false);
  const menuRef = useRef(null);
  const threeDotButtonRef = useRef(null);
  const videoPreviewRef = useRef(null);
  const previewTimeoutRef = useRef(null);
  const progressAnimationRef = useRef(null);

  // Prefetch thumbnail 500px before it becomes visible
  const prefetchRef = usePrefetchImage(video.thumb_url);

  const handleDelete = async () => {
    try {
      await deleteVideo.mutateAsync(video.id);
      showNotification('Video deleted', 'success');
      setShowMenu(false);
      setShowDeleteConfirm(false);
    } catch (error) {
      showNotification(getUserFriendlyError(error.message, 'delete video'), 'error');
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

  // Reset image error state when video changes
  useEffect(() => {
    setImageError(false);
  }, [video.id, video.thumb_url]);

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
      if (progressAnimationRef.current) {
        cancelAnimationFrame(progressAnimationRef.current);
      }
      if (videoPreviewRef.current) {
        videoPreviewRef.current.pause();
        videoPreviewRef.current.oncanplay = null;
        videoPreviewRef.current.src = '';
      }
    };
  }, []);

  // Update progress bar while preview is playing
  useEffect(() => {
    if (previewPlaying && videoPreviewRef.current) {
      const updateProgress = () => {
        const video = videoPreviewRef.current;
        if (video && video.duration) {
          setPreviewProgress((video.currentTime / video.duration) * 100);
        }
        if (previewPlaying) {
          progressAnimationRef.current = requestAnimationFrame(updateProgress);
        }
      };
      progressAnimationRef.current = requestAnimationFrame(updateProgress);
    } else {
      if (progressAnimationRef.current) {
        cancelAnimationFrame(progressAnimationRef.current);
      }
      setPreviewProgress(0);
    }
    return () => {
      if (progressAnimationRef.current) {
        cancelAnimationFrame(progressAnimationRef.current);
      }
    };
  }, [previewPlaying]);

  // Sync muted state to video element (must use ref, not attribute, for autoplay to work)
  useEffect(() => {
    if (videoPreviewRef.current && previewPlaying) {
      videoPreviewRef.current.muted = previewMuted;
    }
  }, [previewMuted, previewPlaying]);

  const isDownloaded = video.status === 'library';
  const isDownloading = video.status === 'downloading';

  // Compute video source URL for previews
  const videoSrc = isDownloaded && video.file_path
    ? `/api/media/${video.file_path.replace(/\\/g, '/').split('/').slice(-2).join('/')}`
    : null;

  // Ensure video element has correct src when videoSrc changes
  useEffect(() => {
    if (videoPreviewRef.current && videoSrc) {
      if (videoPreviewRef.current.getAttribute('src') !== videoSrc) {
        videoPreviewRef.current.src = videoSrc;
      }
    }
  }, [videoSrc]);

  const handlePreviewStart = () => {
    if (!videoSrc || !videoPreviewRef.current) return;

    const video_el = videoPreviewRef.current;

    // Ensure the video element has the correct src (fix for React not updating it)
    if (video_el.getAttribute('src') !== videoSrc) {
      video_el.src = videoSrc;
      video_el.load();
    }

    // Wait for video to be ready before showing
    const playPreview = () => {
      video_el.currentTime = 0;
      setPreviewPlaying(true);
      video_el.play().catch(() => {
        setPreviewPlaying(false);
      });
    };

    // If video already has data (from preload="metadata"), play immediately
    if (video_el.readyState >= 2) {
      playPreview();
    } else {
      // Wait for enough data to play
      video_el.oncanplay = () => {
        playPreview();
        video_el.oncanplay = null;
      };
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
      ref={prefetchRef}
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
        {videoSrc && (
          <>
            <video
              ref={videoPreviewRef}
              src={videoSrc}
              className={`absolute inset-0 w-full h-full object-cover ${previewPlaying ? 'block' : 'hidden'}`}
              muted
              playsInline
              loop
              preload="metadata"
            />
            {/* Audio toggle button - shows during preview */}
            {previewPlaying && (
              <>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setPreviewMuted(!previewMuted);
                  }}
                  className="absolute top-2 right-2 z-30 bg-black/70 hover:bg-black/90 text-white rounded-full p-2 transition-colors"
                  title={previewMuted ? 'Unmute' : 'Mute'}
                >
                  {previewMuted ? (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                    </svg>
                  )}
                </button>

                {/* Preview Scrubber/Progress Bar */}
                <div
                  className="absolute bottom-0 left-0 right-0 h-6 z-30 cursor-pointer group/scrubber"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (videoPreviewRef.current && videoPreviewRef.current.duration) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const clickX = e.clientX - rect.left;
                      const percent = clickX / rect.width;
                      videoPreviewRef.current.currentTime = percent * videoPreviewRef.current.duration;
                    }
                  }}
                  onMouseMove={(e) => {
                    // Allow dragging to scrub
                    if (e.buttons === 1 && videoPreviewRef.current && videoPreviewRef.current.duration) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const clickX = e.clientX - rect.left;
                      const percent = Math.max(0, Math.min(1, clickX / rect.width));
                      videoPreviewRef.current.currentTime = percent * videoPreviewRef.current.duration;
                    }
                  }}
                >
                  {/* Gradient background for visibility */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  {/* Progress track */}
                  <div className="absolute bottom-1 left-2 right-2 h-1 bg-white/30 rounded-full overflow-hidden group-hover/scrubber:h-2 transition-all">
                    {/* Progress fill */}
                    <div
                      className="h-full bg-accent rounded-full transition-none"
                      style={{ width: `${previewProgress}%` }}
                    />
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* Thumbnail Image */}
        {!previewPlaying && (
          <>
            {video.thumb_url && !imageError ? (
              <img
                src={video.thumb_url}
                alt={video.title}
                className="w-full h-full object-cover"
                loading="lazy"
                onError={() => setImageError(true)}
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

        {/* Selection Indicator - Top Right */}
        {/* Only show when selected (accent background with checkmark) */}
        {isSelected && onToggleSelect && (
          <div className="absolute top-2 right-2 bg-accent rounded-full p-1.5 shadow-lg z-10">
            <CheckmarkIcon className="w-4 h-4 text-white" strokeWidth="3" />
          </div>
        )}

        {/* Status Badge - For non-library videos (channels view) */}
        {statusBadge && statusBadge.position === 'top' && (
          <div className={`absolute top-2 left-2 ${statusBadge.bg} text-white px-3 py-1 rounded ${textSizes.badge} font-bold tracking-wide backdrop-blur-sm z-10`}>
            {statusBadge.text}
          </div>
        )}
        {statusBadge && statusBadge.position === 'bottom' && (
          <div className={`absolute bottom-0 left-0 right-0 ${statusBadge.bg} text-white px-3 py-1.5 text-center ${textSizes.badge} font-bold tracking-wide backdrop-blur-sm z-10`}>
            {statusBadge.text}
          </div>
        )}

        {/* Duration overlay - bottom right (YT style) - hidden during preview */}
        {video.duration_sec && !previewPlaying && (
          <div className={`absolute bottom-1 right-1 bg-black/80 text-white ${textSizes.badge} font-semibold px-1.5 py-0.5 rounded z-20`}>
            {formatDuration(video.duration_sec)}
          </div>
        )}

      </div>

      {/* Content */}
      <div className={`p-3 space-y-2 rounded-b-xl transition-colors ${isSelected ? 'bg-dark-tertiary' : 'group-hover:bg-dark-tertiary'}`}>
        {/* Title row - different layout for library vs channel view */}
        {isLibraryView ? (
          // Library view: title + 3-dot menu
          <div className="flex items-start justify-between gap-2">
            <h3 className={`${textSizes.title} font-medium text-text-primary ${textSizes.titleClamp || 'line-clamp-2'} leading-tight flex-1 min-w-0`} title={video.title}>
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
                  aria-label="Video options"
                  className="p-1 rounded hover:bg-dark-hover transition-colors text-text-secondary hover:text-text-primary"
                >
                  <ThreeDotsIcon />
                </button>

                {/* Dropdown Menu */}
                {showMenu && (
                  <div
                    className="menu absolute right-0 mt-1 bg-dark-secondary border border-dark-border rounded-lg shadow-xl py-1 min-w-[160px] z-50"
                    onMouseLeave={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMenu(false);
                        setShowPlaylistMenu(true);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-dark-hover transition-colors flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="7" height="7"></rect>
                        <rect x="14" y="3" width="7" height="7"></rect>
                        <rect x="3" y="14" width="7" height="7"></rect>
                        <rect x="14" y="14" width="7" height="7"></rect>
                      </svg>
                      Playlist Options
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMenu(false);
                        setShowVideoInfo(true);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-dark-hover transition-colors flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="16" x2="12" y2="12"></line>
                        <line x1="12" y1="8" x2="12.01" y2="8"></line>
                      </svg>
                      Video Info
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMenu(false);
                        setShowDeleteConfirm(true);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-dark-hover transition-colors flex items-center gap-2"
                    >
                      <TrashIcon className="w-4 h-4" />
                      Delete video
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          // Channel view: just title (duration is now on thumbnail)
          <h3 className={`${textSizes.title} font-medium text-text-primary line-clamp-2 leading-tight`} title={video.title}>
            {video.title}
          </h3>
        )}

        {/* Metadata */}
        {isLibraryView && video.file_size_bytes ? (
          // Library view: date (uploaded or downloaded based on setting) • size • badges
          <div className={`${textSizes.metadata} text-text-secondary font-medium flex items-center gap-1 flex-wrap`}>
            <span>
              {(() => {
                const dateDisplay = getStringSetting(settings, 'library_date_display', 'downloaded');
                if (dateDisplay === 'uploaded' && video.upload_date) {
                  return formatDate(video.upload_date);
                }
                return formatDateTime(video.downloaded_at);
              })()}
            </span>
            <span>•</span>
            <span>{formatFileSize(video.file_size_bytes)}</span>
            {video.watched && (
              <>
                <span>•</span>
                <span className="text-text-muted uppercase">Watched</span>
              </>
            )}
            {video.playlist_ids && video.playlist_ids.length > 0 && (
              <>
                <span>•</span>
                <span className="text-green-500 uppercase">Playlist</span>
              </>
            )}
          </div>
        ) : (
          // Channel view: just upload date (duration is now with title)
          <div className={`${textSizes.metadata} text-text-secondary font-medium`}>
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

      {/* Video Info Modal - Glass Minimal Style */}
      {showVideoInfo && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 sm:p-4"
          onClick={(e) => {
            e.stopPropagation();
            setShowVideoInfo(false);
          }}
        >
          {/* Desktop: centered modal, Mobile: bottom sheet */}
          <div
            className="hidden sm:block backdrop-blur-xl bg-dark-secondary border border-white/10 rounded-2xl max-w-sm w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-medium text-text-primary">Video Info</h3>
                <button
                  onClick={() => setShowVideoInfo(false)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-text-muted hover:text-text-primary transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="space-y-3 text-sm">
                <InfoField label="YT ID" value={video.yt_id} mono />
                <InfoField label="Title" value={video.title} />
                <div className="grid grid-cols-2 gap-3">
                  <InfoField label="Duration" value={video.duration_sec ? formatDuration(video.duration_sec) : '-'} />
                  <InfoField label="Upload Date" value={video.upload_date || '-'} />
                </div>
                <InfoField label="Thumb URL" value={video.thumb_url || '-'} small truncate />
                <InfoField label="File Path" value={video.file_path || '-'} small truncate />
                <div className="grid grid-cols-2 gap-3">
                  <InfoField label="File Size" value={video.file_size_bytes ? formatFileSize(video.file_size_bytes) : '-'} />
                  <InfoField label="Downloaded" value={video.downloaded_at ? formatDateTime(video.downloaded_at).split(',')[0] : '-'} />
                </div>
                <InfoField label="Channel" value={video.channel_title || '-'} />
              </div>
            </div>
          </div>

          {/* Mobile: Bottom Sheet */}
          <div
            className="sm:hidden fixed inset-x-0 bottom-0 backdrop-blur-xl bg-dark-secondary rounded-t-3xl max-h-[85%] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mt-3" />
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <h3 className="font-semibold text-text-primary">Video Info</h3>
              <button
                onClick={() => setShowVideoInfo(false)}
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"
              >
                <svg className="w-4 h-4 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              <InfoField label="YT ID" value={video.yt_id} mono />
              <InfoField label="Title" value={video.title} />
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/5 rounded-xl p-3 text-center">
                  <p className="text-accent text-base font-semibold">{video.duration_sec ? formatDuration(video.duration_sec) : '-'}</p>
                  <p className="text-text-muted text-xs">Duration</p>
                </div>
                <div className="bg-white/5 rounded-xl p-3 text-center">
                  <p className="text-base font-semibold text-text-primary">{video.file_size_bytes ? formatFileSize(video.file_size_bytes) : '-'}</p>
                  <p className="text-text-muted text-xs">Size</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <InfoField label="Upload Date" value={video.upload_date || '-'} />
                <InfoField label="Downloaded" value={video.downloaded_at ? formatDateTime(video.downloaded_at).split(',')[0] : '-'} />
              </div>
              <InfoField label="Thumb URL" value={video.thumb_url || '-'} small truncate />
              <InfoField label="File Path" value={video.file_path || '-'} small truncate />
              <InfoField label="Channel" value={video.channel_title || '-'} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default VideoCard;

function InfoField({ label, value, mono, small, truncate }) {
  return (
    <div>
      <p className="text-text-muted text-xs mb-0.5">{label}</p>
      <p
        className={`text-text-primary ${mono ? 'font-mono text-xs' : ''} ${small ? 'text-text-secondary text-xs' : 'text-sm'} ${truncate ? 'truncate' : ''}`}
        title={truncate ? value : undefined}
      >
        {value}
      </p>
    </div>
  );
}
