import { useState, useRef, useMemo, useEffect } from 'react';
import { useParams, useSearchParams, Link, useLocation, useNavigate } from 'react-router-dom';
import { useVideos, useChannels, useAddToQueue, useAddToQueueBulk, useBulkUpdateVideos, useBulkDeleteVideos, useQueue, useDeleteVideo, useDeleteChannel, useScanChannel, useUpdateChannel, useSettings } from '../api/queries';
import { useNotification } from '../contexts/NotificationContext';
import { useCardSize } from '../contexts/CardSizeContext';
import { getGridClass, getEffectiveCardSize } from '../utils/gridUtils';
import { useGridColumns } from '../hooks/useGridColumns';
import VideoCard from '../components/VideoCard';
import SortDropdown from '../components/stickybar/SortDropdown';
import AddToPlaylistMenu from '../components/AddToPlaylistMenu';
import LoadingSpinner from '../components/LoadingSpinner';
import Pagination from '../components/Pagination';
import LoadMore from '../components/LoadMore';
import ConfirmModal from '../components/ui/ConfirmModal';
import api from '../api/client';
import { StickyBar, SearchInput, SelectionBar } from '../components/stickybar';
import EmptyState from '../components/EmptyState';

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
  const { showNotification } = useNotification();

  // Detect library mode from URL
  const isLibraryMode = location.pathname.endsWith('/library');

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
  const [menuOpen, setMenuOpen] = useState(false);
  const [showDurationSettings, setShowDurationSettings] = useState(false);
  const [editingChannel, setEditingChannel] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadedPages, setLoadedPages] = useState(1); // For mobile infinite scroll
  const itemsPerPage = Number(localStorage.getItem('global_items_per_page')) || 50;
  const isMobile = window.innerWidth < 640;
  const [deleteVideosConfirm, setDeleteVideosConfirm] = useState(null); // { count: number }
  const menuRef = useRef(null);

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
  const hideWatched = isLibraryMode && localStorage.getItem('global_hide_watched') === 'true';
  const hidePlaylisted = isLibraryMode && localStorage.getItem('global_hide_playlisted') === 'true';

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
      const dateDisplay = localStorage.getItem('library_date_display') || 'downloaded';
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

      // Debug: log if date is invalid
      if (isNaN(parsed.getTime())) {
        console.log('Invalid date for video:', video.title, 'upload_date:', video.upload_date);
      }

      return parsed;
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
      showNotification(error.message, 'error');
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
      showNotification(error.message, 'error');
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
      showNotification(error.message, 'error');
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
      showNotification(error.message, 'error');
    }
  };

  const handleDeleteChannel = async () => {
    try {
      await deleteChannel.mutateAsync(Number(channelId));
      showNotification('Channel deleted', 'success');
      setDeleteConfirm(null);
      navigate('/');
    } catch (error) {
      showNotification(error.message, 'error');
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
      showNotification(error.message, 'error');
    }
  };

  // Click outside to close menu
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [menuOpen]);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Sticky Header - Desktop: single row, Mobile: 2 rows */}
      <StickyBar className="md:-mx-8 md:px-8 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          {/* Left: Back + Tabs + Filters + Edit + CardSize */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Back Arrow */}
            <Link
              to={isLibraryMode ? "/library" : "/"}
              className="flex items-center justify-center w-9 h-9 rounded-lg bg-dark-tertiary hover:bg-dark-hover border border-dark-border text-text-secondary hover:text-text-primary transition-colors flex-shrink-0"
              title={isLibraryMode ? "Back to Library" : "Back to Channels"}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            </Link>

            {/* Tabs */}
            <div className="flex gap-1 sm:gap-2">
              {isLibraryMode ? (
                <>
                  <button
                    onClick={() => {
                      const newParams = new URLSearchParams(searchParams);
                      newParams.delete('filter');
                      setSearchParams(newParams);
                    }}
                    className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                      contentFilter === 'videos'
                        ? 'bg-dark-tertiary text-text-primary border border-dark-border-light'
                        : 'bg-dark-primary/95 border border-dark-border text-text-secondary hover:bg-dark-tertiary/50 hover:text-text-primary'
                    }`}
                  >
                    Videos
                  </button>
                  <button
                    onClick={() => navigate('/library?tab=playlists')}
                    className="px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors bg-dark-primary/95 border border-dark-border text-text-secondary hover:bg-dark-tertiary/50 hover:text-text-primary"
                  >
                    Playlists
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      const newParams = new URLSearchParams(searchParams);
                      newParams.delete('filter');
                      setSearchParams(newParams);
                    }}
                    className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                      contentFilter === 'to-review'
                        ? 'bg-dark-tertiary text-text-primary border border-dark-border-light'
                        : 'bg-dark-primary/95 border border-dark-border text-text-secondary hover:bg-dark-tertiary/50 hover:text-text-primary'
                    }`}
                  >
                    To Review
                  </button>
                  <button
                    onClick={() => {
                      const newParams = new URLSearchParams(searchParams);
                      newParams.set('filter', 'ignored');
                      setSearchParams(newParams);
                    }}
                    className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                      contentFilter === 'ignored'
                        ? 'bg-dark-tertiary text-text-primary border border-dark-border-light'
                        : 'bg-dark-primary/95 border border-dark-border text-text-secondary hover:bg-dark-tertiary/50 hover:text-text-primary'
                    }`}
                  >
                    Ignored
                  </button>
                </>
              )}
            </div>

            {/* Sort Dropdown */}
            <SortDropdown
              value={sort}
              onChange={(value) => {
                handleSort(value);
              }}
              options={[
                { value: 'date-desc', label: 'Newest' },
                { value: 'date-asc', label: 'Oldest' },
                { divider: true },
                { value: 'title-asc', label: 'A → Z' },
                { value: 'title-desc', label: 'Z → A' },
                { divider: true },
                { value: 'duration-desc', label: 'Longest' },
                { value: 'duration-asc', label: 'Shortest' },
              ]}
              durationValue={durationFilter}
              onDurationChange={handleDurationChange}
              durationOptions={[
                { value: 'all', label: 'All' },
                { value: '0-30', label: '0-30 min' },
                { value: '30-60', label: '30-60 min' },
                { value: 'over60', label: 'Over 60 min' },
              ]}
            />

            {/* Edit Button - Only in library mode */}
            {isLibraryMode && contentFilter !== 'playlists' && (
              <button
                onClick={() => {
                  setEditMode(!editMode);
                  setSelectedVideos([]);
                }}
                title={editMode ? "Exit selection mode" : "Select videos for bulk actions"}
                className={`filter-btn show-label ${editMode ? 'bg-dark-tertiary text-text-primary border-dark-border-light' : ''}`}
              >
                <span>{editMode ? 'Done' : 'Edit'}</span>
              </button>
            )}
          </div>

          {/* Right: Search + Pagination */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <SearchInput
              value={searchInput}
              onChange={handleSearchChange}
              placeholder="Search videos..."
              className="flex-1 sm:flex-none sm:w-[200px]"
            />
            {!isMobile && (
              <Pagination
                currentPage={currentPage}
                totalItems={sortedVideos.length}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
              />
            )}
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
            {
              label: 'Delete',
              onClick: () => handleBulkAction('delete'),
              danger: true
            },
            {
              label: 'Add to Playlist',
              onClick: () => handleBulkAction('playlist'),
              primary: true
            }
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
        <div className="relative flex items-center gap-6 mb-4">
          {channel.thumbnail && (
            <img
              src={channel.thumbnail}
              alt={channel.title}
              className="w-16 h-16 rounded-full border-4 border-white"
            />
          )}
          <div>
            <h2 className="text-base md:text-2xl font-bold text-text-primary">{channel.title}</h2>
            <p className="text-text-secondary text-sm">{sortedVideos.length} videos</p>
          </div>

          {/* 3-Dot Menu Button */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenuOpen(!menuOpen);
              }}
              className="p-1.5 rounded-full bg-gray-600 hover:bg-gray-500 transition-colors"
            >
              <svg className="w-4 h-4 text-text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="5" r="1"></circle>
                <circle cx="12" cy="12" r="1"></circle>
                <circle cx="12" cy="19" r="1"></circle>
              </svg>
            </button>

            {/* Dropdown Menu */}
            {menuOpen && (
              <div className="absolute top-full left-0 mt-1 bg-dark-secondary border border-dark-border rounded-lg shadow-xl z-50 w-[200px] animate-scale-in">
                <div className="py-1">
                  {/* Scan New */}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleScanChannel(false);
                      setMenuOpen(false);
                    }}
                    disabled={isScanRunning}
                    className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-dark-hover transition-colors flex flex-col disabled:opacity-50 disabled:cursor-not-allowed"
                    title={isScanRunning ? "Scan in progress..." : "Scan for new videos since last scan"}
                  >
                    <span className="font-medium">Scan</span>
                    {channel.last_scan_at && (
                      <span className="text-xs text-text-secondary mt-0.5">
                        Since {new Date(channel.last_scan_at).toLocaleDateString()} video
                      </span>
                    )}
                  </button>

                  {/* Scan All */}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleScanChannel(true);
                      setMenuOpen(false);
                    }}
                    disabled={isScanRunning}
                    className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-dark-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title={isScanRunning ? "Scan in progress..." : "Full scan - rescan all videos"}
                  >
                    <span className="font-medium">Scan All</span>
                  </button>

                  {/* Duration Settings */}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowDurationSettings(!showDurationSettings);
                      setEditingChannel(channel);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-dark-hover transition-colors"
                  >
                    <span className="font-medium">Duration Settings</span>
                  </button>

                  {/* Auto-Download Toggle */}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
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
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-dark-hover transition-colors flex items-center gap-2"
                    title="If checked, will automatically download any new video that is found via scan (manual or automated)"
                  >
                    <input
                      type="checkbox"
                      checked={channel.auto_download || false}
                      readOnly
                      className="w-4 h-4 rounded border-dark-border bg-dark-tertiary text-accent-text"
                    />
                    <span className="font-medium">Auto-Download</span>
                  </button>

                  {/* Delete Channel */}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDeleteConfirm({ id: channel.id, title: channel.title });
                      setMenuOpen(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-red-900/30 transition-colors border-t border-dark-border"
                  >
                    <span className="font-medium">Delete Channel</span>
                  </button>
                </div>
              </div>
            )}

            {/* Duration Settings Slide-out Panel */}
            {showDurationSettings && editingChannel && (
              <div className="absolute top-full left-[210px] mt-1 bg-dark-secondary border border-dark-border rounded-lg shadow-xl z-50 w-[280px] p-4 animate-scale-in">
                <h4 className="text-sm font-bold text-text-primary mb-3">Duration Settings</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">
                      Min Minutes
                    </label>
                    <input
                      type="number"
                      value={editingChannel.min_minutes}
                      onChange={(e) => setEditingChannel({
                        ...editingChannel,
                        min_minutes: Number(e.target.value)
                      })}
                      className="input text-sm py-1.5 w-full"
                      min="0"
                      title="Minimum video duration in minutes. Only videos longer than this will be found. Use 0 for no minimum."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">
                      Max Minutes
                    </label>
                    <input
                      type="number"
                      value={editingChannel.max_minutes}
                      onChange={(e) => setEditingChannel({
                        ...editingChannel,
                        max_minutes: Number(e.target.value)
                      })}
                      className="input text-sm py-1.5 w-full"
                      min="0"
                      title="Maximum video duration in minutes. Only videos shorter than this will be found. Use 0 for no maximum."
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => {
                        setShowDurationSettings(false);
                        setEditingChannel(null);
                      }}
                      className="btn btn-secondary btn-sm flex-1"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleUpdateFilters}
                      className="btn btn-primary btn-sm flex-1"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Stats Bar - Only in discovery mode */}
          {!isLibraryMode && (
            <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-2">
              {/* Auto indicator */}
              {channel.auto_download && (
                <span className="text-green-500 text-[10px] font-bold tracking-wide mr-1" title="Auto-download enabled">AUTO</span>
              )}

              {/* Downloaded */}
              <div className="flex items-center gap-1 text-sm font-semibold text-accent" title="Downloaded videos">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                <span className="font-mono">{channel.downloaded_count || 0}</span>
              </div>

              {/* Discovered */}
              <div className="flex items-center gap-1 text-sm font-semibold text-gray-400" title="To Review">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <circle cx="12" cy="12" r="1"></circle>
                </svg>
                <span className="font-mono">{channel.video_count || 0}</span>
              </div>

              {/* Ignored */}
              <div className="flex items-center gap-1 text-sm font-semibold text-gray-400" title="Ignored videos">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
                </svg>
                <span className="font-mono">{channel.ignored_count || 0}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Videos Grid */}
      {sortedVideos.length === 0 ? (
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
        <div className="px-6 lg:px-12 xl:px-16">
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
