import { useState, useMemo, useEffect } from 'react';
import { useParams, useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { useVideos, useChannels, useAddToQueue, useAddToQueueBulk, useBulkUpdateVideos, useBulkDeleteVideos, useQueue, useDeleteVideo, useDeleteChannel, useScanChannel, useUpdateChannel, useSettings, useMarkChannelVisited } from '../api/queries';
import { useNotification } from '../contexts/NotificationContext';
import { getUserFriendlyError } from '../utils/errorMessages';
import { useCardSize } from '../contexts/CardSizeContext';
import { getGridClass, getEffectiveCardSize } from '../utils/gridUtils';
import { useGridColumns } from '../hooks/useGridColumns';
import { getBooleanSetting, getNumericSetting, getStringSetting } from '../utils/settingsUtils';
import VideoCard from '../components/VideoCard';
import AddToPlaylistMenu from '../components/AddToPlaylistMenu';
import LoadingSpinner from '../components/LoadingSpinner';
import Pagination from '../components/Pagination';
import LoadMore from '../components/LoadMore';
import ConfirmModal from '../components/ui/ConfirmModal';
import api from '../api/client';
import { StickyBar, SearchInput, SelectionBar, CollapsibleSearch, BackButton, EditButton, TabGroup, ActionDropdown, StickyBarRightSection } from '../components/stickybar';
import EmptyState from '../components/EmptyState';
import { SORT_OPTIONS, DURATION_OPTIONS } from '../constants/stickyBarOptions';

export default function ChannelLibrary() {
  const { channelId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: channels } = useChannels();
  const { data: queueData } = useQueue();
  const { data: settings } = useSettings();
  const addToQueue = useAddToQueue();
  const addToQueueBulk = useAddToQueueBulk();
  const bulkUpdate = useBulkUpdateVideos();
  const bulkDeleteVideos = useBulkDeleteVideos();
  const deleteVideo = useDeleteVideo();
  const deleteChannel = useDeleteChannel();
  const scanChannel = useScanChannel();
  const updateChannel = useUpdateChannel();
  const markChannelVisited = useMarkChannelVisited();
  const { showNotification } = useNotification();

  // Detect library mode from URL
  const isLibraryMode = location.pathname.endsWith('/library');

  // Mark channel as visited when entering from Library tab (for new videos badge)
  useEffect(() => {
    if (isLibraryMode && channelId) {
      markChannelVisited.mutate(parseInt(channelId));
    }
  }, [channelId, isLibraryMode]);

  // Use appropriate card size based on whether we're in library or channels mode
  const { cardSize, setCardSize } = useCardSize(isLibraryMode ? 'library' : 'channels');
  const gridColumns = useGridColumns(cardSize);

  // Get queue video IDs for showing "QUEUED" status
  const queueVideoIds = new Set(
    (queueData?.queue_items || [])
      .filter(item => item.status === 'pending' || item.status === 'downloading')
      .map(item => item.video?.id)
      .filter(Boolean)
  );

  // Check if scan is currently running
  const currentOperation = queueData?.current_operation;
  const isScanRunning = currentOperation?.type === 'scanning';

  const [selectedVideos, setSelectedVideos] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [showDurationSettings, setShowDurationSettings] = useState(false);
  const [editingChannel, setEditingChannel] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadedPages, setLoadedPages] = useState(1); // For mobile infinite scroll
  const itemsPerPage = getNumericSetting(settings, 'items_per_page', 50);
  const isMobile = window.innerWidth < 640;
  const [deleteVideosConfirm, setDeleteVideosConfirm] = useState(null); // { count: number }

  const channel = channels?.find(c => c.id === Number(channelId));

  // Get filters from URL, with localStorage fallback
  // Build localStorage keys with channel ID for per-channel persistence
  const localStorageKey = `channelLibrary_${channelId}`;

  // Library mode: 'videos' or 'playlists' (default: 'videos')
  // Discovery mode: 'to-review' or 'ignored' (default: 'to-review')
  const contentFilter = (() => {
    const urlParam = searchParams.get('filter');
    if (urlParam) return urlParam;
    const stored = localStorage.getItem(`${localStorageKey}_filter`);
    return stored || (isLibraryMode ? 'videos' : 'to-review');
  })();

  const search = searchParams.get('search') || '';

  const sort = (() => {
    const urlParam = searchParams.get('sort');
    if (urlParam) return urlParam;
    const stored = localStorage.getItem(`${localStorageKey}_sort`);
    return stored || 'date-desc';
  })();

  // Simplified duration filter: 'all', '0-30', '30-60', 'over60'
  const durationFilter = (() => {
    const urlParam = searchParams.get('duration');
    if (urlParam) return urlParam;
    const stored = localStorage.getItem(`${localStorageKey}_duration`);
    return stored || 'all';
  })();

  // Convert duration filter to min/max for API
  const minDuration = durationFilter === '30-60' ? '30' : durationFilter === 'over60' ? '60' : null;
  const maxDuration = durationFilter === '0-30' ? '30' : durationFilter === '30-60' ? '60' : null;

  // Use global hide settings from Settings page (library mode only)
  const hideWatched = isLibraryMode && getBooleanSetting(settings, 'hide_watched');
  const hidePlaylisted = isLibraryMode && getBooleanSetting(settings, 'hide_playlisted');

  // Determine status and ignored based on mode
  let status, ignored;
  if (isLibraryMode) {
    // Library mode: show downloaded videos (status='library')
    status = 'library';
    ignored = 'false';
  } else {
    // Discovery mode: To Review = discovered videos, Ignored = ignored videos
    if (contentFilter === 'ignored') {
      ignored = 'true';
    } else {
      // to-review
      status = 'discovered';
      ignored = 'false';
    }
  }

  const { data: videos, isLoading } = useVideos({
    channel_id: channelId,
    status,
    ignored,
    search,
    min_duration: minDuration,
    max_duration: maxDuration,
  });


  // Initialize URL params from localStorage on mount
  useEffect(() => {
    const newParams = new URLSearchParams(searchParams);
    let changed = false;

    // Only set URL params from localStorage if they're not already in the URL
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
  }, [channelId]); // Run when channelId changes

  // Note: searchInput is kept as pure local state to avoid losing focus on input
  // It persists naturally when toggling edit mode since it's component state

  // Scroll detection for scroll-to-top button
  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFilter = (key, value) => {
    const newParams = new URLSearchParams(searchParams);
    if (value && value !== 'all') {
      newParams.set(key, value);
      // Save to localStorage for persistence
      if (key === 'filter') localStorage.setItem(`${localStorageKey}_filter`, value);
      if (key === 'duration') localStorage.setItem(`${localStorageKey}_duration`, value);
    } else {
      newParams.delete(key);
      // Remove from localStorage when cleared
      if (key === 'filter') localStorage.removeItem(`${localStorageKey}_filter`);
      if (key === 'duration') localStorage.removeItem(`${localStorageKey}_duration`);
    }
    setSearchParams(newParams);
  };

  const handleSort = (sortValue) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('sort', sortValue);
    // Save to localStorage for persistence
    localStorage.setItem(`${localStorageKey}_sort`, sortValue);
    setSearchParams(newParams);
  };

  // Helper to parse video date for sorting
  const parseVideoDate = (video) => {
    // Library mode: respect the date display setting (uploaded vs downloaded)
    if (isLibraryMode) {
      const dateDisplay = getStringSetting(settings, 'library_date_display', 'downloaded');
      if (dateDisplay === 'uploaded' && video.upload_date) {
        const year = video.upload_date.slice(0, 4);
        const month = video.upload_date.slice(4, 6);
        const day = video.upload_date.slice(6, 8);
        return new Date(`${year}-${month}-${day}`);
      }
      if (video.downloaded_at) {
        return new Date(video.downloaded_at);
      }
    }
    // Discovery mode (to-review/ignored): use upload_date (matches displayed date)
    if (video.upload_date) {
      const year = video.upload_date.slice(0, 4);
      const month = video.upload_date.slice(4, 6);
      const day = video.upload_date.slice(6, 8);
      const parsed = new Date(`${year}-${month}-${day}`);

      return isNaN(parsed.getTime()) ? new Date(video.discovered_at || 0) : parsed;
    }
    // Fallback to discovered_at if neither is available
    return new Date(video.discovered_at || 0);
  };

  // Filter and sort videos (memoized for performance)
  const sortedVideos = useMemo(() => {
    if (!videos) return [];

    return [...videos]
      .filter(video => {
        // Client-side filtering by title based on searchInput
        if (!(video.title || '').toLowerCase().includes(searchInput.toLowerCase())) {
          return false;
        }

        // Hide watched videos if filter is enabled
        if (hideWatched && video.watched) {
          return false;
        }

        // Hide playlisted videos if filter is enabled
        if (hidePlaylisted && video.playlist_name) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
    switch (sort) {
      case 'date-desc':
        // Newest first
        return parseVideoDate(b) - parseVideoDate(a);
      case 'date-asc':
        // Oldest first
        return parseVideoDate(a) - parseVideoDate(b);
      case 'duration-desc':
        return b.duration_sec - a.duration_sec;
      case 'duration-asc':
        return a.duration_sec - b.duration_sec;
      case 'title-asc':
        return a.title.localeCompare(b.title);
      case 'title-desc':
        return b.title.localeCompare(a.title);
      default:
        return 0;
    }
  });
  }, [videos, searchInput, hideWatched, hidePlaylisted, sort]);

  // Reset page when FILTERS change (not when data changes from bulk actions)
  useEffect(() => {
    setCurrentPage(1);
    setLoadedPages(1); // Reset mobile infinite scroll
  }, [searchInput, sort, durationFilter, contentFilter]);

  // Clear selection and exit edit mode when switching tabs
  useEffect(() => {
    setSelectedVideos([]);
    setEditMode(false);
  }, [contentFilter]);

  // Adjust page if current page is now empty (after bulk delete/ignore)
  useEffect(() => {
    const totalPages = Math.ceil(sortedVideos.length / itemsPerPage);
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [sortedVideos.length, itemsPerPage, currentPage]);

  // Paginate videos (mobile: infinite scroll, desktop: pagination)
  const paginatedVideos = useMemo(() => {
    if (isMobile) {
      // Mobile: show loadedPages worth of items
      return sortedVideos.slice(0, loadedPages * itemsPerPage);
    }
    // Desktop: standard pagination
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedVideos.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedVideos, currentPage, itemsPerPage, loadedPages, isMobile]);

  // Handle duration filter change from SortDropdown
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

  // Real-time search handler - just update local state (debounce will handle URL params)
  const handleSearchChange = (value) => {
    setSearchInput(value);
  };

  const handleAddToQueue = async (videoId) => {
    try {
      await addToQueue.mutateAsync(videoId);
      showNotification('Added to queue', 'success');
    } catch (error) {
      showNotification(getUserFriendlyError(error.message, 'add to queue'), 'error');
    }
  };

  const handleBulkAction = async (action) => {
    if (selectedVideos.length === 0) return;

    try {
      switch (action) {
        case 'queue':
          // Use bulk endpoint for better performance
          const result = await addToQueueBulk.mutateAsync(selectedVideos);
          if (result.skipped_count > 0) {
            showNotification(`${result.added_count} videos added to queue, ${result.skipped_count} already in queue`, 'success');
          } else {
            showNotification(`${result.added_count} videos added to queue`, 'success');
          }
          break;
        case 'ignore':
          await bulkUpdate.mutateAsync({
            videoIds: selectedVideos,
            updates: { status: 'ignored' },
          });
          showNotification(`${selectedVideos.length} videos ignored`, 'success');
          break;
        case 'unignore':
          // Add ignored videos directly to queue instead of just unignoring
          const unignoreResult = await addToQueueBulk.mutateAsync(selectedVideos);
          if (unignoreResult.skipped_count > 0) {
            showNotification(`${unignoreResult.added_count} videos added to queue, ${unignoreResult.skipped_count} already in queue`, 'success');
          } else {
            showNotification(`${unignoreResult.added_count} videos added to queue`, 'success');
          }
          break;
        case 'delete':
          // Delete multiple videos
          setDeleteVideosConfirm({ count: selectedVideos.length });
          return;
        case 'playlist':
          // Show playlist menu for bulk add
          setShowPlaylistMenu(true);
          return; // Don't clear selection yet
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

  const handleScanChannel = async (forceFull = false) => {
    // Check API key status for full scans (needed for upload dates)
    if (forceFull) {
      if (!settings?.youtube_api_key) {
        showNotification('No API key configured - upload dates will not be fetched', 'warning');
      } else {
        // Test if API key is valid
        try {
          const result = await api.testYoutubeApiKey();
          if (!result.valid) {
            showNotification('API key is invalid - upload dates will not be fetched', 'warning');
          }
        } catch (error) {
          showNotification('API key is invalid - upload dates will not be fetched', 'warning');
        }
      }
    }

    try {
      // Get channel info for batch label
      const channel = channels?.find(c => c.id === Number(channelId));
      const batchLabel = channel?.title || `Channel ${channelId}`;

      // Set scanning status immediately (optimistic UI)
      try {
        await api.setOperation('scanning', 'Scanning channels for new videos');
      } catch (error) {
        // Ignore errors, backend will set it anyway
      }

      const result = await scanChannel.mutateAsync({
        id: Number(channelId),
        forceFull,
        is_batch_start: true,  // Single scans are their own "batch"
        is_auto_scan: false,
        batch_label: batchLabel
      });

      // Backend handles completion message via toast notification
    } catch (error) {
      showNotification(getUserFriendlyError(error.message, 'scan channel'), 'error');
    }
  };

  const handleDeleteChannel = async () => {
    try {
      await deleteChannel.mutateAsync(Number(channelId));
      showNotification('Channel deleted', 'success');
      setDeleteConfirm(null);
      navigate('/');
    } catch (error) {
      showNotification(getUserFriendlyError(error.message, 'delete channel'), 'error');
    }
  };

  const handleUpdateFilters = async () => {
    try {
      await updateChannel.mutateAsync({
        id: Number(channelId),
        data: {
          min_minutes: editingChannel.min_minutes,
          max_minutes: editingChannel.max_minutes,
        },
      });
      setEditingChannel(null);
      setShowDurationSettings(false);
      showNotification('Filters updated', 'success');
    } catch (error) {
      showNotification(getUserFriendlyError(error.message, 'update filters'), 'error');
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Sticky Header */}
      <StickyBar className="md:-mx-8 md:px-8 mb-4">
        <div className="flex items-center gap-2">
          {/* Left: Back + Tabs + Edit/Manage */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            <BackButton
              to={isLibraryMode ? "/library" : "/"}
              title={isLibraryMode ? "Back to Library" : "Back to Channels"}
            />

            {/* Tabs */}
            {isLibraryMode ? (
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
            ) : (
              <TabGroup
                tabs={[
                  { id: 'to-review', label: 'Review', count: channel?.video_count },
                  { id: 'ignored', label: 'Ignored', count: channel?.ignored_count },
                ]}
                active={contentFilter}
                onChange={(tabId) => {
                  const newParams = new URLSearchParams(searchParams);
                  if (tabId === 'ignored') {
                    newParams.set('filter', 'ignored');
                  } else {
                    newParams.delete('filter');
                  }
                  setSearchParams(newParams);
                }}
                showCountOnActive={true}
                hideCountOnMobile={true}
              />
            )}

            {/* Edit Button - Only in library mode */}
            {isLibraryMode && contentFilter !== 'playlists' && (
              <EditButton
                active={editMode}
                onToggle={() => {
                  setEditMode(!editMode);
                  setSelectedVideos([]);
                }}
              />
            )}

            {/* Manage Dropdown - Only in discovery mode */}
            {!isLibraryMode && channel && (
              <ActionDropdown
                label="Manage"
                variant="secondary"
                mobileIcon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="4" y1="21" x2="4" y2="14"/>
                    <line x1="4" y1="10" x2="4" y2="3"/>
                    <line x1="12" y1="21" x2="12" y2="12"/>
                    <line x1="12" y1="8" x2="12" y2="3"/>
                    <line x1="20" y1="21" x2="20" y2="16"/>
                    <line x1="20" y1="12" x2="20" y2="3"/>
                    <line x1="1" y1="14" x2="7" y2="14"/>
                    <line x1="9" y1="8" x2="15" y2="8"/>
                    <line x1="17" y1="16" x2="23" y2="16"/>
                  </svg>
                }
                items={[
                  {
                    label: 'Scan New Videos',
                    icon: (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="23 4 23 10 17 10" />
                        <path d="M20.49 15a9 9 0 01-2.12 3.36 9 9 0 01-11.58 1.47A9 9 0 013 12a9 9 0 011.79-5.37A9 9 0 0112 3a9 9 0 018.5 6.5L23 10" />
                      </svg>
                    ),
                    onClick: () => handleScanChannel(false),
                    disabled: isScanRunning,
                  },
                  {
                    label: 'Scan All Videos',
                    icon: (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="23 4 23 10 17 10" />
                        <polyline points="1 20 1 14 7 14" />
                        <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                      </svg>
                    ),
                    onClick: () => handleScanChannel(true),
                    disabled: isScanRunning,
                  },
                  { divider: true },
                  {
                    label: 'Duration Settings',
                    icon: (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    ),
                    onClick: () => {
                      setShowDurationSettings(true);
                      setEditingChannel(channel);
                    },
                  },
                  {
                    label: channel.auto_download ? 'Auto-Download ✓' : 'Auto-Download',
                    icon: (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    ),
                    onClick: () => {
                      const newValue = !channel.auto_download;
                      updateChannel.mutate({
                        id: channel.id,
                        data: { auto_download: newValue }
                      }, {
                        onSuccess: () => {
                          showNotification(
                            newValue
                              ? `Auto-download enabled for ${channel.title}`
                              : `Auto-download disabled for ${channel.title}`,
                            'success'
                          );
                        }
                      });
                    },
                  },
                  { divider: true },
                  {
                    label: 'Delete Channel',
                    icon: (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                      </svg>
                    ),
                    onClick: () => setDeleteConfirm({ id: channel.id, title: channel.title }),
                    variant: 'danger',
                  },
                ]}
              />
            )}
          </div>

          {/* Center: Search (desktop only, fills available space) */}
          <div className="hidden sm:block flex-1 max-w-md mx-4">
            <SearchInput
              value={searchInput}
              onChange={handleSearchChange}
              placeholder="Search videos..."
              className="w-full"
            />
          </div>

          {/* Right: Mobile (Sort + Search) / Desktop (Sort + Pagination) */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 ml-auto">
            {/* Mobile only: Sort + Search */}
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

            {/* Desktop: Sort + Pagination */}
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
      {isLibraryMode && contentFilter !== 'playlists' && (
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

      {/* SelectionBar - Discovery mode actions (only shows when items selected) */}
      {!isLibraryMode && contentFilter !== 'playlists' && (
        <SelectionBar
          show={selectedVideos.length > 0}
          selectedCount={selectedVideos.length}
          totalCount={sortedVideos.length}
          onSelectAll={selectAll}
          onClear={clearSelection}
          onDone={clearSelection}
          actions={contentFilter === 'to-review' ? [
            {
              label: 'Add to Queue',
              onClick: () => handleBulkAction('queue'),
              primary: true
            },
            {
              label: 'Ignore',
              onClick: () => handleBulkAction('ignore')
            }
          ] : [
            {
              label: 'Add to Queue',
              onClick: () => handleBulkAction('unignore'),
              primary: true
            }
          ]}
        />
      )}

      {/* Channel Header - Only show in discovery mode for videos, not in library mode or playlists */}
      {channel && contentFilter !== 'playlists' && !isLibraryMode && (
        <div className="flex items-center gap-4 mb-4">
          {channel.thumbnail && (
            <img
              src={channel.thumbnail}
              alt={channel.title}
              className="w-12 h-12 sm:w-16 sm:h-16 rounded-full border-2 border-dark-border"
            />
          )}
          <div>
            <h2 className="text-base sm:text-xl font-bold text-text-primary">{channel.title}</h2>
            <p className="text-text-secondary text-sm">{sortedVideos.length} videos</p>
          </div>
        </div>
      )}

      {/* Duration Settings Modal */}
      {showDurationSettings && editingChannel && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-secondary rounded-lg max-w-sm w-full p-6 shadow-2xl border border-dark-border">
            <h3 className="text-lg font-bold text-text-primary mb-4">Duration Settings</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Min Minutes
                </label>
                <input
                  type="number"
                  value={editingChannel.min_minutes}
                  onChange={(e) => setEditingChannel({
                    ...editingChannel,
                    min_minutes: Number(e.target.value)
                  })}
                  className="input w-full"
                  min="0"
                  placeholder="0 = no minimum"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Max Minutes
                </label>
                <input
                  type="number"
                  value={editingChannel.max_minutes}
                  onChange={(e) => setEditingChannel({
                    ...editingChannel,
                    max_minutes: Number(e.target.value)
                  })}
                  className="input w-full"
                  min="0"
                  placeholder="0 = no maximum"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setShowDurationSettings(false);
                    setEditingChannel(null);
                  }}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateFilters}
                  className="btn btn-primary flex-1"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
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
            : (isLibraryMode ? 'No downloaded videos yet' : 'Try adjusting your filters or scan for videos')}
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
              onToggleSelect={isLibraryMode && editMode ? toggleSelectVideo : !isLibraryMode ? toggleSelectVideo : undefined}
              isQueued={queueVideoIds.has(video.id)}
              editMode={isLibraryMode && editMode}
              isLibraryView={isLibraryMode}
              effectiveCardSize={effectiveCardSize}
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

      {/* Scroll to Top Button */}
      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-20 right-6 p-3 bg-gray-700 hover:bg-gray-600 rounded-full shadow-lg transition-colors z-50 animate-fade-in"
          aria-label="Scroll to top"
        >
          <svg className="w-5 h-5 text-text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="18 15 12 9 6 15"></polyline>
          </svg>
        </button>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-secondary rounded-lg max-w-md w-full p-6 shadow-2xl border border-dark-border">
            <h3 className="text-xl font-bold text-text-primary mb-3">Delete Channel?</h3>
            <p className="text-text-secondary mb-4">
              Are you sure you want to delete "<span className="text-text-primary font-semibold">{deleteConfirm.title}</span>"?
            </p>
            <p className="text-sm text-yellow-400 mb-6">
              ⚠️ This will permanently delete all scanned videos from this channel. Downloaded videos in your library will not be affected.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="btn btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteChannel}
                disabled={deleteChannel.isPending}
                className="btn btn-danger flex-1"
              >
                {deleteChannel.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add to Playlist Menu */}
      {showPlaylistMenu && (
        <AddToPlaylistMenu
          videoIds={selectedVideos}
          onClose={() => {
            setShowPlaylistMenu(false);
            setSelectedVideos([]); // Clear selection after adding to playlist
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
