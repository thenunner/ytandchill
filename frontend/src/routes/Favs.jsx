import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useFavoriteChannels, useFavoriteVideos, useMarkChannelVisited, useSettings, useToggleChannelFavorite } from '../api/queries';
import VideoCard from '../components/VideoCard';
import { LoadingSpinner, EmptyState, Pagination, LoadMore } from '../components/ListFeedback';
import { HeartIcon } from '../components/Icons';
import { getStringSetting, getGridClass, getTextSizes, getEffectiveCardSize, formatFileSize, getNumericSetting } from '../utils/utils';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useCardSize } from '../contexts/PreferencesContext';
import { useGridColumns } from '../hooks/useGridColumns';
import { StickyBar, CollapsibleSearch, StickyBarRightSection } from '../components/stickybar';
import { SORT_OPTIONS } from '../utils/stickyBarOptions';

export default function Favs() {
  // Mobile detection
  const isMobile = useMediaQuery('(max-width: 767px)');

  // Mobile-specific state
  const [selectedChannelId, setSelectedChannelId] = useState(null);

  // Desktop-specific state
  const { cardSize } = useCardSize('library');
  const gridColumns = useGridColumns(cardSize);
  const toggleFavorite = useToggleChannelFavorite();
  const [searchInput, setSearchInput] = useState('');
  const [sortBy, setSortBy] = useState('title-asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [loadedPages, setLoadedPages] = useState(1);

  const { data: favoriteLibrariesRaw, isLoading: channelsLoading } = useFavoriteChannels();
  const { data: favoriteVideos, isLoading: videosLoading } = useFavoriteVideos(selectedChannelId);
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

  // Get date display preference and sort videos accordingly (for mobile)
  const dateDisplay = getStringSetting(settings, 'library_date_display', 'downloaded');
  const sortedVideos = useMemo(() => {
    if (!favoriteVideos) return [];
    return [...favoriteVideos].sort((a, b) => {
      if (dateDisplay === 'uploaded') {
        // Sort by upload_date (string format YYYYMMDD or YYYY-MM-DD)
        const dateA = a.upload_date || '';
        const dateB = b.upload_date || '';
        return dateB.localeCompare(dateA); // Descending (newest first)
      } else {
        // Sort by downloaded_at (ISO datetime string)
        const dateA = a.downloaded_at || '';
        const dateB = b.downloaded_at || '';
        return dateB.localeCompare(dateA); // Descending (newest first)
      }
    });
  }, [favoriteVideos, dateDisplay]);

  // Desktop: Filter and sort channels
  const filteredChannels = useMemo(() => {
    if (!favoriteLibraries) return [];

    return [...favoriteLibraries]
      .filter(ch => ch.title?.toLowerCase().includes(searchInput.toLowerCase()))
      .sort((a, b) => {
        switch (sortBy) {
          case 'title-asc': return (a.title || '').localeCompare(b.title || '');
          case 'title-desc': return (b.title || '').localeCompare(a.title || '');
          case 'count-desc': return (b.downloaded_count || 0) - (a.downloaded_count || 0);
          case 'count-asc': return (a.downloaded_count || 0) - (b.downloaded_count || 0);
          default: return 0;
        }
      });
  }, [favoriteLibraries, searchInput, sortBy]);

  // Desktop: Paginate channels
  const paginatedChannels = useMemo(() => {
    if (isMobile) return filteredChannels.slice(0, loadedPages * itemsPerPage);
    const start = (currentPage - 1) * itemsPerPage;
    return filteredChannels.slice(start, start + itemsPerPage);
  }, [filteredChannels, currentPage, itemsPerPage, isMobile, loadedPages]);

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
          ) : !sortedVideos || sortedVideos.length === 0 ? (
            <EmptyState
              title="No videos yet"
              description={selectedChannelId
                ? "No videos from this channel"
                : "No videos from your favorites"
              }
            />
          ) : (
            <div className="space-y-4">
              {sortedVideos.map(video => (
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

  // DESKTOP VIEW - Channel card grid with sticky bar
  const effectiveCardSize = getEffectiveCardSize(cardSize, paginatedChannels.length);
  const textSizes = getTextSizes(effectiveCardSize);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Sticky Header */}
      <StickyBar className="md:-mx-8 md:px-8 mb-4">
        <div className="flex items-center gap-2">
          {/* Left: Title */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <HeartIcon className="w-5 h-5 text-accent" filled />
            <h1 className="text-lg font-semibold text-text-primary">Favorites</h1>
            <span className="text-sm text-text-secondary">({filteredChannels.length})</span>
          </div>

          {/* Center: Search */}
          <div className="flex-1 max-w-md mx-4">
            <CollapsibleSearch
              value={searchInput}
              onChange={setSearchInput}
              placeholder="Search favorites..."
              alwaysExpanded
            />
          </div>

          {/* Right: Sort + Pagination */}
          <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
            <StickyBarRightSection
              sortValue={sortBy}
              onSortChange={setSortBy}
              sortOptions={SORT_OPTIONS.channels}
              currentPage={currentPage}
              totalItems={filteredChannels.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
            />
          </div>
        </div>
      </StickyBar>

      {/* Channel Grid */}
      {filteredChannels.length === 0 ? (
        <EmptyState
          icon={<HeartIcon className="w-12 h-12" />}
          title={searchInput ? 'No matching favorites' : 'No favorite libraries yet'}
          description={searchInput ? 'Try a different search term' : 'Heart libraries in Library to add them to your favorites'}
        />
      ) : (
        <div className={`grid ${getGridClass(gridColumns, paginatedChannels.length)} gap-4 w-full [&>*]:min-w-0`}>
          {paginatedChannels.map(channel => (
            <Link
              key={channel.id}
              to={`/library/channel/${channel.id}`}
              className="group transition-colors rounded overflow-hidden"
            >
              {/* Thumbnail */}
              <div className="relative aspect-video bg-dark-tertiary rounded-t-xl rounded-b-xl group-hover:rounded-b-none overflow-hidden transition-all">
                {channel.thumbnail ? (
                  <img
                    src={channel.thumbnail}
                    alt={channel.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <svg className="w-10 h-10 text-text-muted" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                    </svg>
                  </div>
                )}
                {/* New Videos Badge */}
                {channel.has_new_videos && (
                  <div className="absolute top-0 left-0 bg-accent text-white font-bold text-sm px-2 py-1 rounded-tl-xl rounded-br-lg leading-none z-20">
                    NEW
                  </div>
                )}
              </div>

              {/* Channel Info */}
              <div className="p-3 rounded-b-xl transition-colors group-hover:bg-dark-tertiary">
                <div className="flex items-start justify-between gap-2">
                  <h3 className={`${textSizes.title} font-semibold text-text-primary line-clamp-2 mb-1 flex-1`} title={channel.title}>
                    {channel.title}
                  </h3>
                  {/* Heart Button (unfavorite) */}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      toggleFavorite.mutate(channel.id);
                    }}
                    className="p-1.5 -mr-1.5 -mt-0.5 rounded-lg flex-shrink-0 transition-all hover:scale-110 active:scale-95 text-accent"
                    title="Remove from favorites"
                  >
                    <HeartIcon className="w-5 h-5" filled />
                  </button>
                </div>
                <div className="text-sm text-text-secondary font-medium">
                  <span>
                    {channel.downloaded_count || 0} video{(channel.downloaded_count || 0) !== 1 ? 's' : ''}
                    {(channel.downloaded_count || 0) > 0 && channel.total_size_bytes && ` • ${formatFileSize(channel.total_size_bytes)}`}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Bottom Pagination */}
      {filteredChannels.length > itemsPerPage && (
        <div className="flex justify-center mt-6">
          <Pagination
            currentPage={currentPage}
            totalItems={filteredChannels.length}
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
