import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useFavoriteChannels, useFavoriteVideos, useMarkChannelVisited, useSettings } from '../api/queries';
import VideoCard from '../components/VideoCard';
import { LoadingSpinner, EmptyState, Pagination } from '../components/ListFeedback';
import { HeartIcon } from '../components/Icons';
import { getStringSetting, getGridClass, formatFileSize, getNumericSetting } from '../utils/utils';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useCardSize } from '../contexts/PreferencesContext';
import { useGridColumns } from '../hooks/useGridColumns';
import { StickyBar, CollapsibleSearch, StickyBarRightSection } from '../components/stickybar';

export default function Favs() {
  // Mobile detection
  const isMobile = useMediaQuery('(max-width: 767px)');

  // Mobile-specific state
  const [selectedChannelId, setSelectedChannelId] = useState(null);

  // Shared state
  const { cardSize } = useCardSize('library');
  const gridColumns = useGridColumns(cardSize);
  const [searchInput, setSearchInput] = useState('');
  const [sortBy, setSortBy] = useState('date-desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [loadedPages, setLoadedPages] = useState(1);

  const { data: favoriteLibrariesRaw, isLoading: channelsLoading } = useFavoriteChannels();
  // For mobile, filter by selected channel; for desktop, get all videos (null)
  const { data: favoriteVideos, isLoading: videosLoading } = useFavoriteVideos(isMobile ? selectedChannelId : null);
  const { data: settings } = useSettings();
  const markVisited = useMarkChannelVisited();
  const itemsPerPage = getNumericSetting(settings, 'items_per_page', 50);

  // Filter favorites based on hide_empty_libraries setting
  const hideEmptyLibraries = settings?.hide_empty_libraries === 'true';
  const favoriteLibraries = (favoriteLibrariesRaw || []).filter(ch => {
    if (hideEmptyLibraries && (ch.downloaded_count || 0) === 0) {
      return false;
    }
    return true;
  });

  // Get date display preference
  const dateDisplay = getStringSetting(settings, 'library_date_display', 'downloaded');

  // Filter and sort videos (used by both mobile and desktop)
  const filteredVideos = useMemo(() => {
    if (!favoriteVideos) return [];

    return [...favoriteVideos]
      .filter(v => {
        if (!searchInput) return true;
        const search = searchInput.toLowerCase();
        return v.title?.toLowerCase().includes(search) ||
               v.channel?.title?.toLowerCase().includes(search);
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'date-desc': {
            if (dateDisplay === 'uploaded') {
              return (b.upload_date || '').localeCompare(a.upload_date || '');
            }
            return (b.downloaded_at || '').localeCompare(a.downloaded_at || '');
          }
          case 'date-asc': {
            if (dateDisplay === 'uploaded') {
              return (a.upload_date || '').localeCompare(b.upload_date || '');
            }
            return (a.downloaded_at || '').localeCompare(b.downloaded_at || '');
          }
          case 'title-asc': return (a.title || '').localeCompare(b.title || '');
          case 'title-desc': return (b.title || '').localeCompare(a.title || '');
          default: return 0;
        }
      });
  }, [favoriteVideos, searchInput, sortBy, dateDisplay]);

  // Paginate videos for desktop
  const paginatedVideos = useMemo(() => {
    if (isMobile) return filteredVideos;
    const start = (currentPage - 1) * itemsPerPage;
    return filteredVideos.slice(start, start + itemsPerPage);
  }, [filteredVideos, currentPage, itemsPerPage, isMobile]);

  // Reset page when search/sort changes
  useEffect(() => {
    setCurrentPage(1);
    setLoadedPages(1);
  }, [searchInput, sortBy]);

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

  // MOBILE VIEW
  if (isMobile) {
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
          ) : !filteredVideos || filteredVideos.length === 0 ? (
            <EmptyState
              title="No videos yet"
              description={selectedChannelId
                ? "No videos from this channel"
                : "No videos from your favorites"
              }
            />
          ) : (
            <div className="space-y-4">
              {filteredVideos.map(video => (
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
                        <span>{dateDisplay === 'uploaded' ? formatUploadDate(video.upload_date) : formatTimeAgo(video.downloaded_at)}</span>
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

  // DESKTOP VIEW - Video grid with sticky bar
  const hasNewFavorites = favoriteLibraries?.some(ch => ch.has_new_videos) || false;

  // Sort options for videos
  const videoSortOptions = [
    { value: 'date-desc', label: 'Newest First' },
    { value: 'date-asc', label: 'Oldest First' },
    { value: 'title-asc', label: 'Title A-Z' },
    { value: 'title-desc', label: 'Title Z-A' },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Sticky Header */}
      <StickyBar className="md:-mx-8 md:px-8 mb-4">
        <div className="flex items-center gap-2">
          {/* Left: Title */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <HeartIcon className={`w-5 h-5 ${hasNewFavorites ? 'text-accent' : 'text-text-secondary'}`} filled={hasNewFavorites} />
            <h1 className="text-lg font-semibold text-text-primary">Favorites</h1>
            <span className="text-sm text-text-secondary">({filteredVideos.length} videos)</span>
          </div>

          {/* Center: Search */}
          <div className="flex-1 max-w-md mx-4">
            <CollapsibleSearch
              value={searchInput}
              onChange={setSearchInput}
              placeholder="Search videos..."
              alwaysExpanded
            />
          </div>

          {/* Right: Sort + Pagination */}
          <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
            <StickyBarRightSection
              sortValue={sortBy}
              onSortChange={setSortBy}
              sortOptions={videoSortOptions}
              currentPage={currentPage}
              totalItems={filteredVideos.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
            />
          </div>
        </div>
      </StickyBar>

      {/* Video Grid */}
      {videosLoading ? (
        <div className="flex items-center justify-center h-64">
          <LoadingSpinner />
        </div>
      ) : filteredVideos.length === 0 ? (
        <EmptyState
          icon={<HeartIcon className="w-12 h-12" />}
          title={searchInput ? 'No matching videos' : 'No videos yet'}
          description={searchInput ? 'Try a different search term' : 'Videos from your favorite channels will appear here'}
        />
      ) : (
        <div className={`grid ${getGridClass(gridColumns, paginatedVideos.length)} gap-4 w-full [&>*]:min-w-0`}>
          {paginatedVideos.map(video => (
            <VideoCard
              key={video.id}
              video={video}
              showChannel={true}
              dateDisplay={dateDisplay}
            />
          ))}
        </div>
      )}

      {/* Bottom Pagination */}
      {filteredVideos.length > itemsPerPage && (
        <div className="flex justify-center mt-6">
          <Pagination
            currentPage={currentPage}
            totalItems={filteredVideos.length}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
          />
        </div>
      )}
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

function formatUploadDate(dateString) {
  if (!dateString) return '';
  // Handle YYYYMMDD format from YouTube
  let date;
  if (dateString.length === 8 && !dateString.includes('-')) {
    const year = dateString.substring(0, 4);
    const month = dateString.substring(4, 6);
    const day = dateString.substring(6, 8);
    date = new Date(year, month - 1, day);
  } else {
    date = new Date(dateString);
  }

  // Format as relative time for consistency with downloaded_at display
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays < 0) return date.toLocaleDateString();
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return date.toLocaleDateString();
}
