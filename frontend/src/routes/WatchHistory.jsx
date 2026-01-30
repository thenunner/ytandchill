import { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useWatchHistory, useClearWatchHistory, useChannels, useSettings } from '../api/queries';
import { useNotification } from '../contexts/NotificationContext';
import { useCardSize } from '../contexts/CardSizeContext';
import { StickyBar, SearchInput, CollapsibleSearch } from '../components/stickybar';
import { getGridClass, getTextSizes, getEffectiveCardSize, formatDuration, formatFileSize, getNumericSetting } from '../utils/utils';
import LoadingSpinner from '../components/LoadingSpinner';
import { useGridColumns } from '../hooks/useGridColumns';
import EmptyState from '../components/EmptyState';
import { ConfirmModal } from '../components/ui/SharedModals';
import { TrashIcon } from '../components/icons';
import Pagination from '../components/Pagination';
import LoadMore from '../components/LoadMore';

export default function WatchHistory() {
  const navigate = useNavigate();
  const { cardSize } = useCardSize('library');
  const { data: settings } = useSettings();
  const { showNotification } = useNotification();
  const gridColumns = useGridColumns(cardSize, 'library');

  const [searchInput, setSearchInput] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [loadedPages, setLoadedPages] = useState(1);
  const itemsPerPage = getNumericSetting(settings, 'items_per_page', 50);
  const isMobile = window.innerWidth < 640;

  // Fetch watch history
  const { data: historyVideos, isLoading } = useWatchHistory({
    channel_id: channelFilter || null,
    search: searchInput || null,
  });

  // Fetch channels for filter dropdown (only channels with library videos)
  const { data: channelsData } = useChannels();

  const clearHistory = useClearWatchHistory();

  // Get channels that have downloaded videos (from Library), including Singles
  const libraryChannels = useMemo(() => {
    if (!channelsData) return [];
    return channelsData
      .filter(ch => (ch.downloaded_count || 0) > 0)
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [channelsData]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
    setLoadedPages(1);
  }, [searchInput, channelFilter]);

  // Paginate videos
  const paginatedVideos = useMemo(() => {
    if (!historyVideos) return [];
    if (isMobile) {
      return historyVideos.slice(0, loadedPages * itemsPerPage);
    }
    const startIndex = (currentPage - 1) * itemsPerPage;
    return historyVideos.slice(startIndex, startIndex + itemsPerPage);
  }, [historyVideos, currentPage, itemsPerPage, loadedPages, isMobile]);

  // Format relative time for last watched
  const formatLastWatched = (dateString) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;

    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    return `${month}/${day}/${year}`;
  };

  const handleClearHistory = async () => {
    try {
      const result = await clearHistory.mutateAsync();
      showNotification(`Cleared ${result.cleared} videos from history`, 'success');
      setShowClearConfirm(false);
    } catch (error) {
      showNotification('Failed to clear watch history', 'error');
    }
  };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <StickyBar>
        <div className="flex items-center gap-2">
          {/* Left: Title + Channel Filter + Clear button */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <h1 className="text-lg font-semibold hidden sm:block text-text-primary">Watch History</h1>

            {/* Channel Filter - next to title */}
            {libraryChannels.length > 0 && (
              <select
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value)}
                className="bg-dark-tertiary border border-dark-border rounded-lg px-2 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent max-w-[140px] sm:max-w-[200px]"
                style={{ maxHeight: '300px' }}
              >
                <option value="">All Channels</option>
                {libraryChannels.map(channel => (
                  <option key={channel.id} value={channel.id}>
                    {channel.title}
                  </option>
                ))}
              </select>
            )}

            {historyVideos && historyVideos.length > 0 && (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-lg bg-dark-tertiary hover:bg-red-500/20 text-text-secondary hover:text-red-400 transition-colors"
                title="Clear all history"
              >
                <TrashIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Clear</span>
              </button>
            )}
          </div>

          {/* Center: Search (desktop only) */}
          <div className="hidden sm:block flex-1 max-w-md mx-4">
            <SearchInput
              value={searchInput}
              onChange={setSearchInput}
              placeholder="Search watch history..."
              className="w-full"
            />
          </div>

          {/* Right: Mobile Search + Pagination */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 ml-auto">

            {/* Mobile Search */}
            <div className="sm:hidden">
              <CollapsibleSearch
                value={searchInput}
                onChange={setSearchInput}
                placeholder="Search history..."
              />
            </div>

            {/* Desktop Pagination Info */}
            {historyVideos && historyVideos.length > itemsPerPage && !isMobile && (
              <div className="hidden sm:flex items-center gap-2">
                <Pagination
                  currentPage={currentPage}
                  totalItems={historyVideos.length}
                  itemsPerPage={itemsPerPage}
                  onPageChange={setCurrentPage}
                  compact
                />
              </div>
            )}
          </div>
        </div>
      </StickyBar>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : !historyVideos || historyVideos.length === 0 ? (
        <EmptyState
          icon={<><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l4 2" /></>}
          title={searchInput || channelFilter ? "No matching videos" : "No watch history yet"}
          message={searchInput || channelFilter ? "Try different filters" : "Videos you watch will appear here"}
        />
      ) : (() => {
        const effectiveCardSize = getEffectiveCardSize(cardSize, paginatedVideos.length);
        const textSizes = getTextSizes(effectiveCardSize);
        return (
          <>
            <div className={`grid ${getGridClass(gridColumns, paginatedVideos.length)} gap-4 w-full [&>*]:min-w-0`}>
              {paginatedVideos.map(video => (
                <Link
                  key={video.id}
                  to={`/player/${video.id}`}
                  className="group transition-colors rounded overflow-hidden"
                >
                  {/* Thumbnail */}
                  <div className="relative aspect-video bg-dark-tertiary rounded-t-xl rounded-b-xl group-hover:rounded-b-none overflow-hidden transition-all">
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

                    {/* Duration badge */}
                    {video.duration_sec > 0 && (
                      <div className="absolute bottom-1 right-1 bg-black/80 text-white text-xs font-medium px-1.5 py-0.5 rounded">
                        {formatDuration(video.duration_sec)}
                      </div>
                    )}

                    {/* Progress bar if partially watched */}
                    {video.playback_seconds > 0 && video.duration_sec > 0 && !video.watched && (
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
                        <div
                          className="h-full bg-accent"
                          style={{ width: `${Math.min((video.playback_seconds / video.duration_sec) * 100, 100)}%` }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Video Info */}
                  <div className="p-3 rounded-b-xl transition-colors group-hover:bg-dark-tertiary">
                    <h3 className={`${textSizes.title} font-semibold text-text-primary line-clamp-2 mb-1`} title={video.title}>
                      {video.title}
                    </h3>
                    <div className={`${textSizes.metadata} text-text-secondary flex items-center gap-1`}>
                      {video.channel_title && (
                        <span className="truncate">{video.channel_title}</span>
                      )}
                      {video.channel_title && video.last_watched_at && (
                        <span className="text-text-muted">•</span>
                      )}
                      {video.last_watched_at && (
                        <span className="text-text-muted whitespace-nowrap">{formatLastWatched(video.last_watched_at)}</span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Bottom Pagination (desktop) or Load More (mobile) */}
            {historyVideos.length > itemsPerPage && (
              isMobile ? (
                <LoadMore
                  currentCount={paginatedVideos.length}
                  totalCount={historyVideos.length}
                  onLoadMore={() => setLoadedPages(prev => prev + 1)}
                />
              ) : (
                <div className="flex justify-center mt-6">
                  <Pagination
                    currentPage={currentPage}
                    totalItems={historyVideos.length}
                    itemsPerPage={itemsPerPage}
                    onPageChange={setCurrentPage}
                  />
                </div>
              )
            )}
          </>
        );
      })()}

      {/* Clear History Confirmation Modal */}
      <ConfirmModal
        isOpen={showClearConfirm}
        title="Clear Watch History"
        message="Are you sure you want to clear all watch history? This cannot be undone."
        confirmText="Clear History"
        confirmStyle="danger"
        onConfirm={handleClearHistory}
        onCancel={() => setShowClearConfirm(false)}
      />
    </div>
  );
}
