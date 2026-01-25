import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useFavoriteChannels, useFavoriteVideos, useMarkChannelVisited, useSettings } from '../api/queries';
import VideoCard from '../components/VideoCard';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import { HeartIcon } from '../components/icons';

export default function Favs() {
  const [selectedChannelId, setSelectedChannelId] = useState(null);

  const { data: favoriteLibrariesRaw, isLoading: channelsLoading } = useFavoriteChannels();
  const { data: favoriteVideos, isLoading: videosLoading } = useFavoriteVideos(selectedChannelId);
  const { data: settings } = useSettings();
  const markVisited = useMarkChannelVisited();

  // Filter favorites based on hide_empty_libraries setting
  const hideEmptyLibraries = settings?.hide_empty_libraries === 'true';
  const favoriteLibraries = (favoriteLibrariesRaw || []).filter(ch => {
    if (hideEmptyLibraries && (ch.downloaded_count || 0) === 0) {
      return false;
    }
    return true;
  });

  // Handle channel avatar click - toggle filter
  const handleChannelClick = (channelId) => {
    if (selectedChannelId === channelId) {
      // Deselect if tapping same channel
      setSelectedChannelId(null);
    } else {
      // Select this channel and mark as visited (clears new video dot)
      setSelectedChannelId(channelId);
      markVisited.mutate(channelId);
    }
  };


  // Loading state
  if (channelsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  // No favorites yet
  if (!favoriteLibraries || favoriteLibraries.length === 0) {
    return (
      <div className="p-4">
        <h1 className="text-xl font-bold text-text-primary mb-2">Favorite Libraries</h1>
        <EmptyState
          icon={<HeartIcon className="w-12 h-12" />}
          title="No favorite libraries yet"
          description="Heart libraries in Library to add them to your favorites"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Sticky Header with Channel Bar */}
      <div className="sticky top-0 z-10 bg-dark-secondary border-b border-dark-border flex-shrink-0">

        {/* Horizontal Channel Scroll Bar */}
        <div
          className="flex gap-3 px-4 pt-3 pb-3 overflow-x-auto"
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            WebkitOverflowScrolling: 'touch'
          }}
        >
          {favoriteLibraries.map(channel => (
            <button
              key={channel.id}
              onClick={() => handleChannelClick(channel.id)}
              className={`flex-shrink-0 flex flex-col items-center gap-1 w-14 transition-opacity ${
                selectedChannelId && selectedChannelId !== channel.id ? 'opacity-40' : ''
              }`}
            >
              <div className="relative">
                <div
                  className={`w-12 h-12 rounded-full overflow-hidden border-2 transition-colors ${
                    selectedChannelId === channel.id
                      ? 'border-accent shadow-[0_0_0_2px_rgba(var(--accent-rgb),0.3)]'
                      : 'border-dark-border'
                  }`}
                >
                  {channel.thumbnail ? (
                    <img src={channel.thumbnail} className="w-full h-full object-cover" alt="" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-dark-tertiary">
                      <span className="text-xs font-bold text-text-muted">
                        {channel.title?.substring(0, 2).toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
                {/* Dot indicator for new videos */}
                {channel.has_new_videos && (
                  <div className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-accent border-2 border-dark-secondary" />
                )}
              </div>
              <span className={`text-[10px] font-medium truncate w-full text-center ${
                channel.has_new_videos ? 'text-text-primary' : 'text-text-secondary'
              }`}>
                {channel.title?.length > 8 ? channel.title.substring(0, 8) + '...' : channel.title}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Video List */}
      <div className="flex-1 overflow-y-auto p-4 pb-20">
        {videosLoading ? (
          <div className="flex items-center justify-center h-32">
            <LoadingSpinner />
          </div>
        ) : !favoriteVideos || favoriteVideos.length === 0 ? (
          <EmptyState
            title="No videos yet"
            description={selectedChannelId
              ? "No videos from this channel"
              : "No videos from your favorites"
            }
          />
        ) : (
          <div className="space-y-4">
            {favoriteVideos.map(video => (
              <Link
                key={video.id}
                to={`/player/${video.id}`}
                className="block"
              >
                <div className="bg-dark-secondary rounded-xl overflow-hidden">
                  {/* Thumbnail */}
                  <div className="relative aspect-video bg-dark-tertiary">
                    {video.thumb_url && (
                      <img src={video.thumb_url} className="w-full h-full object-cover" alt="" loading="lazy" />
                    )}
                    {/* Duration badge */}
                    {video.duration_sec && (
                      <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-xs font-semibold bg-black/80 text-white">
                        {formatDuration(video.duration_sec)}
                      </div>
                    )}
                  </div>
                  {/* Video Info */}
                  <div className="p-3">
                    <h3 className="text-sm font-medium text-text-primary line-clamp-2 leading-tight">
                      {video.title}
                    </h3>
                    <div className="text-xs text-text-secondary mt-1.5 flex items-center gap-1">
                      <span>{video.channel?.title || 'Unknown'}</span>
                      <span>•</span>
                      <span>{formatTimeAgo(video.downloaded_at)}</span>
                      {video.file_size_bytes && (
                        <>
                          <span>•</span>
                          <span>{formatFileSize(video.file_size_bytes)}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Helper functions
function formatDuration(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatTimeAgo(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString();
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
