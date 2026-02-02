import { useState, useMemo, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useVideos, useChannels, useBulkDeleteVideos, useQueue, useSettings, useMarkChannelVisited, useThumbnailBatch } from '../api/queries';
import { useNotification } from '../contexts/NotificationContext';
import { getUserFriendlyError, getGridClass, getEffectiveCardSize, getBooleanSetting, getNumericSetting, getStringSetting } from '../utils/utils';
import { useCardSize } from '../contexts/PreferencesContext';
import { useGridColumns } from '../hooks/useGridColumns';
import VideoCard from '../components/VideoCard';
import AddToPlaylistMenu from '../components/AddToPlaylistMenu';
import { LoadingSpinner, Pagination, LoadMore, EmptyState, useScrollToTop, ScrollToTopButton } from '../components/ListFeedback';
import { ConfirmModal } from '../components/ui/SharedModals';
import { StickyBar, SelectionBar, CollapsibleSearch, BackButton, EditButton, TabGroup, StickyBarRightSection } from '../components/stickybar';
import { SORT_OPTIONS, DURATION_OPTIONS } from '../utils/stickyBarOptions';
import { parseVideoDate } from '../utils/videoUtils';

/**
 * LibraryChannel - Shows downloaded videos for a channel
 * URL: /library/channel/:channelId
 */
export default function LibraryChannel() {
  const { channelId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: channels } = useChannels();
  const { data: queueData } = useQueue();
  const { data: settings } = useSettings();
  const bulkDeleteVideos = useBulkDeleteVideos();
  const markChannelVisited = useMarkChannelVisited();
  const { showNotification } = useNotification();

  const { cardSize } = useCardSize('library');
  const gridColumns = useGridColumns(cardSize);

  // Mark channel as visited when entering (for new videos badge)
  useEffect(() => {
    if (channelId) {
      markChannelVisited.mutate(parseInt(channelId));
    }
  }, [channelId]);

  // Get queue video IDs for showing "QUEUED" status
  const queueVideoIds = new Set(
    (queueData?.queue_items || [])
      .filter(item => item.status === 'pending' || item.status === 'downloading')
      .map(item => item.video?.id)
      .filter(Boolean)
  );

  const [selectedVideos, setSelectedVideos] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const { showButton: showScrollTop, scrollToTop } = useScrollToTop();
  const [editMode, setEditMode] = useState(false);
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);

  // Initialize page from URL (preserves position on back navigation)
  const initialPage = parseInt(searchParams.get('page'), 10) || 1;
  const [currentPageState, setCurrentPageState] = useState(initialPage);
  const [loadedPages, setLoadedPages] = useState(1);

  // Wrapper to persist page to URL
  const setCurrentPage = (page) => {
    setCurrentPageState(page);
    const newParams = new URLSearchParams(searchParams);
    if (page > 1) {
      newParams.set('page', page.toString());
    } else {
      newParams.delete('page');
    }
    setSearchParams(newParams, { replace: true });
  };
  const currentPage = currentPageState;
  const itemsPerPage = getNumericSetting(settings, 'items_per_page', 50);
  const isMobile = window.innerWidth < 640;
  const [deleteVideosConfirm, setDeleteVideosConfirm] = useState(null);

  const channel = channels?.find(c => c.id === Number(channelId));

  // Build localStorage key for per-channel persistence
  const localStorageKey = `libraryChannel_${channelId}`;

  // Content filter: 'videos' or 'playlists' (default: 'videos')
  const contentFilter = (() => {
    const urlParam = searchParams.get('filter');
    if (urlParam) return urlParam;
    const stored = localStorage.getItem(`${localStorageKey}_filter`);
    return stored || 'videos';
  })();

  const sort = (() => {
    const urlParam = searchParams.get('sort');
    if (urlParam) return urlParam;
    const stored = localStorage.getItem(`${localStorageKey}_sort`);
    return stored || 'date-desc';
  })();

  const durationFilter = (() => {
    const urlParam = searchParams.get('duration');
    if (urlParam) return urlParam;
    const stored = localStorage.getItem(`${localStorageKey}_duration`);
    return stored || 'all';
  })();

  // Convert duration filter to min/max for API
  const minDuration = durationFilter === '30-60' ? '30' : durationFilter === 'over60' ? '60' : null;
  const maxDuration = durationFilter === '0-30' ? '30' : durationFilter === '30-60' ? '60' : null;

  // Use global hide settings from Settings page
  const hideWatched = getBooleanSetting(settings, 'hide_watched');
  const hidePlaylisted = getBooleanSetting(settings, 'hide_playlisted');

  const { data: videos, isLoading } = useVideos({
    channel_id: channelId,
    status: 'library',
    ignored: 'false',
    min_duration: minDuration,
    max_duration: maxDuration,
  });

  // Initialize URL params from localStorage on mount
  useEffect(() => {
    const newParams = new URLSearchParams(searchParams);
    let changed = false;

    if (!searchParams.has('sort')) {
      const storedSort = localStorage.getItem(`${localStorageKey}_sort`);
      if (storedSort) {
        newParams.set('sort', storedSort);
        changed = true;
      }
    }

    if (!searchParams.has('filter')) {
      const storedFilter = localStorage.getItem(`${localStorageKey}_filter`);
      if (storedFilter) {
        newParams.set('filter', storedFilter);
        changed = true;
      }
    }

    if (!searchParams.has('duration')) {
      const storedDuration = localStorage.getItem(`${localStorageKey}_duration`);
      if (storedDuration && storedDuration !== 'all') {
        newParams.set('duration', storedDuration);
        changed = true;
      }
    }

    if (changed) {
      setSearchParams(newParams, { replace: true });
    }
  }, [channelId]);

  const handleSort = (sortValue) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('sort', sortValue);
    localStorage.setItem(`${localStorageKey}_sort`, sortValue);
    setSearchParams(newParams);
  };

  // Filter and sort videos
  const sortedVideos = useMemo(() => {
    if (!videos) return [];

    return [...videos]
      .filter(video => {
        if (!(video.title || '').toLowerCase().includes(searchInput.toLowerCase())) {
          return false;
        }
        if (hideWatched && video.watched) {
          return false;
        }
        if (hidePlaylisted && video.playlist_name) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        switch (sort) {
          case 'date-desc': {
            const dateA = parseVideoDate(a, settings);
            const dateB = parseVideoDate(b, settings);
            return (dateB?.getTime() || 0) - (dateA?.getTime() || 0);
          }
          case 'date-asc': {
            const dateA = parseVideoDate(a, settings);
            const dateB = parseVideoDate(b, settings);
            return (dateA?.getTime() || 0) - (dateB?.getTime() || 0);
          }
          case 'duration-desc':
            return (b.duration_sec || 0) - (a.duration_sec || 0);
          case 'duration-asc':
            return (a.duration_sec || 0) - (b.duration_sec || 0);
          case 'title-asc':
            return (a.title || '').localeCompare(b.title || '');
          case 'title-desc':
            return (b.title || '').localeCompare(a.title || '');
          default:
            return 0;
        }
      });
  }, [videos, searchInput, hideWatched, hidePlaylisted, sort, settings]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
    setLoadedPages(1);
  }, [searchInput, sort, durationFilter, contentFilter]);

  // Clear selection and exit edit mode when switching tabs
  useEffect(() => {
    setSelectedVideos([]);
    setEditMode(false);
  }, [contentFilter]);

  // Adjust page if current page is now empty
  useEffect(() => {
    const totalPages = Math.ceil(sortedVideos.length / itemsPerPage);
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [sortedVideos.length, itemsPerPage, currentPage]);

  // Redirect to library if channel becomes empty (all videos deleted)
  useEffect(() => {
    if (!isLoading && videos && videos.length === 0) {
      navigate('/library', { replace: true });
    }
  }, [videos, isLoading, navigate]);

  // Paginate videos
  const paginatedVideos = useMemo(() => {
    if (isMobile) {
      return sortedVideos.slice(0, loadedPages * itemsPerPage);
    }
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedVideos.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedVideos, currentPage, itemsPerPage, loadedPages, isMobile]);

  // Batch fetch thumbnails for current page (reduces 20+ HTTP requests to 1)
  const videoIds = useMemo(() => paginatedVideos.map(v => v.id), [paginatedVideos]);
  const { data: thumbnails } = useThumbnailBatch(videoIds);

  const handleDurationChange = (value) => {
    const newParams = new URLSearchParams(searchParams);
    if (value && value !== 'all') {
      newParams.set('duration', value);
      localStorage.setItem(`${localStorageKey}_duration`, value);
    } else {
      newParams.delete('duration');
      localStorage.removeItem(`${localStorageKey}_duration`);
    }
    setSearchParams(newParams);
  };

  const handleSearchChange = (value) => {
    setSearchInput(value);
  };

  const handleBulkAction = async (action) => {
    if (selectedVideos.length === 0) return;

    try {
      switch (action) {
        case 'delete':
          setDeleteVideosConfirm({ count: selectedVideos.length });
          return;
        case 'playlist':
          setShowPlaylistMenu(true);
          return;
      }
      setSelectedVideos([]);
    } catch (error) {
      showNotification(getUserFriendlyError(error.message, 'complete action'), 'error');
    }
  };

  const handleConfirmDeleteVideos = async () => {
    if (!deleteVideosConfirm) return;

    try {
      await bulkDeleteVideos.mutateAsync(selectedVideos);
      showNotification(`${selectedVideos.length} videos deleted`, 'success');
      setSelectedVideos([]);
      setEditMode(false);
      setDeleteVideosConfirm(null);
    } catch (error) {
      showNotification(getUserFriendlyError(error.message, 'delete videos'), 'error');
    }
  };

  const toggleSelectVideo = (videoId) => {
    setSelectedVideos(prev =>
      prev.includes(videoId)
        ? prev.filter(id => id !== videoId)
        : [...prev, videoId]
    );
  };

  const selectAll = () => {
    setSelectedVideos(sortedVideos.map(v => v.id));
  };

  const selectPage = () => {
    setSelectedVideos(paginatedVideos.map(v => v.id));
  };

  const clearSelection = () => {
    setSelectedVideos([]);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Sticky Header */}
      <StickyBar className="md:-mx-8 md:px-8 mb-4">
        <div className="flex items-center gap-2">
          {/* Left: Back + Tabs + Edit */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            <BackButton to="/library" title="Back to Library" />

            <TabGroup
              tabs={[
                { id: 'videos', label: 'Videos' },
                { id: 'playlists', label: 'Playlists' },
              ]}
              active={contentFilter}
              onChange={(tabId) => {
                if (tabId === 'playlists') {
                  navigate('/library?tab=playlists');
                } else {
                  const newParams = new URLSearchParams(searchParams);
                  newParams.delete('filter');
                  setSearchParams(newParams);
                }
              }}
              showCountOnActive={false}
            />

            {contentFilter !== 'playlists' && (
              <EditButton
                active={editMode}
                onToggle={() => {
                  setEditMode(!editMode);
                  setSelectedVideos([]);
                }}
              />
            )}
          </div>

          {/* Center: Search (desktop only) */}
          <div className="hidden sm:block flex-1 max-w-md mx-4">
            <CollapsibleSearch
              value={searchInput}
              onChange={handleSearchChange}
              placeholder="Search videos..."
              alwaysExpanded
            />
          </div>

          {/* Right: Mobile (Sort + Search) / Desktop (Sort + Pagination) */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 ml-auto">
            <div className="sm:hidden flex items-center gap-1.5">
              <StickyBarRightSection
                sortValue={sort}
                onSortChange={handleSort}
                sortOptions={SORT_OPTIONS.videos}
                durationValue={durationFilter}
                onDurationChange={handleDurationChange}
                durationOptions={DURATION_OPTIONS}
                currentPage={currentPage}
                totalItems={sortedVideos.length}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
                showMobileSort={true}
              />
              <CollapsibleSearch
                value={searchInput}
                onChange={handleSearchChange}
                placeholder="Search videos..."
              />
            </div>

            <StickyBarRightSection
              sortValue={sort}
              onSortChange={handleSort}
              sortOptions={SORT_OPTIONS.videos}
              durationValue={durationFilter}
              onDurationChange={handleDurationChange}
              durationOptions={DURATION_OPTIONS}
              currentPage={currentPage}
              totalItems={sortedVideos.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              showMobileSort={false}
            />
          </div>
        </div>
      </StickyBar>

      {/* SelectionBar - Library mode edit actions */}
      {contentFilter !== 'playlists' && (
        <SelectionBar
          show={editMode && sortedVideos.length > 0}
          selectedCount={selectedVideos.length}
          totalCount={sortedVideos.length}
          onSelectAll={selectAll}
          onClear={clearSelection}
          onDone={() => {
            setEditMode(false);
            setSelectedVideos([]);
          }}
          actions={[
            ...(selectedVideos.length > 0 ? [{
              label: 'Playlist',
              onClick: () => handleBulkAction('playlist'),
              variant: 'default'
            }] : []),
            ...(selectedVideos.length > 0 ? [{
              label: 'Delete',
              onClick: () => handleBulkAction('delete'),
              variant: 'danger'
            }] : [])
          ]}
        />
      )}

      {/* Videos Grid */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : sortedVideos.length === 0 ? (
        <EmptyState
          icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />}
          title={videos && videos.length > 0 && (hideWatched || hidePlaylisted)
            ? `All videos are ${hideWatched && hidePlaylisted ? 'watched or in playlists' : hideWatched ? 'watched' : 'in playlists'}`
            : 'No videos found'}
          message={videos && videos.length > 0 && (hideWatched || hidePlaylisted)
            ? 'Remove filter to see them'
            : 'No downloaded videos yet'}
        />
      ) : (() => {
        const effectiveCardSize = getEffectiveCardSize(cardSize, paginatedVideos.length);
        return (
          <div className="px-0 sm:px-6 lg:px-12 xl:px-16">
            <div className={`grid ${getGridClass(gridColumns, paginatedVideos.length)} gap-4 w-full [&>*]:min-w-0`}>
              {paginatedVideos.map(video => (
                <VideoCard
                  key={video.id}
                  video={video}
                  isSelected={selectedVideos.includes(video.id)}
                  onToggleSelect={editMode ? toggleSelectVideo : undefined}
                  isQueued={queueVideoIds.has(video.id)}
                  editMode={editMode}
                  isLibraryView={true}
                  effectiveCardSize={effectiveCardSize}
                  thumbnailDataUrl={thumbnails?.[video.id]}
                />
              ))}
            </div>
          </div>
        );
      })()}

      {/* Bottom Pagination (desktop) or Load More (mobile) */}
      {sortedVideos.length > 0 && (
        isMobile ? (
          <LoadMore
            currentCount={paginatedVideos.length}
            totalCount={sortedVideos.length}
            onLoadMore={() => setLoadedPages(prev => prev + 1)}
          />
        ) : (
          <div className="flex justify-center mt-6">
            <Pagination
              currentPage={currentPage}
              totalItems={sortedVideos.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
            />
          </div>
        )
      )}

      <ScrollToTopButton show={showScrollTop} onClick={scrollToTop} />

      {/* Add to Playlist Menu */}
      {showPlaylistMenu && (
        <AddToPlaylistMenu
          videoIds={selectedVideos}
          onClose={() => {
            setShowPlaylistMenu(false);
            setSelectedVideos([]);
          }}
        />
      )}

      {/* Delete Videos Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deleteVideosConfirm}
        title="Delete Videos"
        message={
          <>
            Permanently delete <span className="font-semibold">{deleteVideosConfirm?.count} videos</span> from your library?
            This will also delete the video files from disk.
          </>
        }
        confirmText="Delete"
        confirmStyle="danger"
        onConfirm={handleConfirmDeleteVideos}
        onCancel={() => setDeleteVideosConfirm(null)}
      />
    </div>
  );
}
