import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useSearchParams, Link, useLocation, useNavigate } from 'react-router-dom';
import { useVideos, useChannels, useAddToQueue, useAddToQueueBulk, useBulkUpdateVideos, useBulkDeleteVideos, useQueue, useDeleteVideo, useDeleteChannel, useScanChannel, useUpdateChannel } from '../api/queries';
import { useNotification } from '../contexts/NotificationContext';
import VideoCard from '../components/VideoCard';
import VideoRow from '../components/VideoRow';
import FiltersModal from '../components/FiltersModal';
import AddToPlaylistMenu from '../components/AddToPlaylistMenu';
import Pagination from '../components/Pagination';
import ConfirmModal from '../components/ui/ConfirmModal';
import api from '../api/client';

export default function ChannelLibrary() {
  const { channelId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: channels } = useChannels();
  const { data: queueData } = useQueue();
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

  const [viewMode, setViewMode] = useState(localStorage.getItem('viewMode') || 'grid');
  const [selectedVideos, setSelectedVideos] = useState([]);
  const [showFiltersModal, setShowFiltersModal] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showDurationSettings, setShowDurationSettings] = useState(false);
  const [editingChannel, setEditingChannel] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(() => {
    const stored = localStorage.getItem('channelLibrary_itemsPerPage');
    return stored ? Number(stored) : 50;
  });
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

  const minDuration = (() => {
    const urlParam = searchParams.get('min_duration');
    if (urlParam) return urlParam;
    return localStorage.getItem(`${localStorageKey}_minDuration`) || null;
  })();

  const maxDuration = (() => {
    const urlParam = searchParams.get('max_duration');
    if (urlParam) return urlParam;
    return localStorage.getItem(`${localStorageKey}_maxDuration`) || null;
  })();

  const uploadDateFrom = (() => {
    const urlParam = searchParams.get('upload_from');
    if (urlParam) return urlParam;
    return localStorage.getItem(`${localStorageKey}_uploadFrom`) || null;
  })();

  const uploadDateTo = (() => {
    const urlParam = searchParams.get('upload_to');
    if (urlParam) return urlParam;
    return localStorage.getItem(`${localStorageKey}_uploadTo`) || null;
  })();

  // For library mode, initialize from localStorage if URL param not present
  const hideWatched = (() => {
    const urlParam = searchParams.get('hide_watched');
    if (urlParam !== null) return urlParam === 'true';
    if (isLibraryMode) return localStorage.getItem('channelLibrary_hideWatched') === 'true';
    return false;
  })();

  const hidePlaylisted = (() => {
    const urlParam = searchParams.get('hide_playlisted');
    if (urlParam !== null) return urlParam === 'true';
    if (isLibraryMode) return localStorage.getItem('channelLibrary_hidePlaylisted') === 'true';
    return false;
  })();

  // Derive current filter states for the modal
  const getCurrentUploadDateFilter = () => {
    if (!uploadDateFrom) return '';
    const now = new Date();
    const from = new Date(uploadDateFrom);
    const daysDiff = Math.floor((now - from) / (24 * 60 * 60 * 1000));

    if (daysDiff >= 0 && daysDiff <= 7) return 'week';
    if (daysDiff >= 28 && daysDiff <= 31) return 'month';
    if (daysDiff >= 360 && daysDiff <= 370) return 'year';
    return '';
  };

  const getCurrentDurationFilter = () => {
    const min = minDuration ? parseInt(minDuration) : null;
    const max = maxDuration ? parseInt(maxDuration) : null;

    if (max === 5 && !min) return 'under5';
    if (min === 5 && max === 30) return '5-30';
    if (min === 30 && max === 60) return '30-60';
    if (min === 60 && !max) return 'over60';
    return '';
  };

  const currentUploadDateFilter = getCurrentUploadDateFilter();
  const currentDurationFilter = getCurrentDurationFilter();

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
    upload_from: uploadDateFrom,
    upload_to: uploadDateTo,
  });

  useEffect(() => {
    localStorage.setItem('viewMode', viewMode);
  }, [viewMode]);

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

    if (!searchParams.has('min_duration')) {
      const storedMinDuration = localStorage.getItem(`${localStorageKey}_minDuration`);
      if (storedMinDuration) {
        newParams.set('min_duration', storedMinDuration);
        changed = true;
      }
    }

    if (!searchParams.has('max_duration')) {
      const storedMaxDuration = localStorage.getItem(`${localStorageKey}_maxDuration`);
      if (storedMaxDuration) {
        newParams.set('max_duration', storedMaxDuration);
        changed = true;
      }
    }

    if (!searchParams.has('upload_from')) {
      const storedUploadFrom = localStorage.getItem(`${localStorageKey}_uploadFrom`);
      if (storedUploadFrom) {
        newParams.set('upload_from', storedUploadFrom);
        changed = true;
      }
    }

    if (!searchParams.has('upload_to')) {
      const storedUploadTo = localStorage.getItem(`${localStorageKey}_uploadTo`);
      if (storedUploadTo) {
        newParams.set('upload_to', storedUploadTo);
        changed = true;
      }
    }

    if (isLibraryMode) {
      if (!searchParams.has('hide_watched')) {
        const storedHideWatched = localStorage.getItem('channelLibrary_hideWatched');
        if (storedHideWatched === 'true') {
          newParams.set('hide_watched', 'true');
          changed = true;
        }
      }

      if (!searchParams.has('hide_playlisted')) {
        const storedHidePlaylisted = localStorage.getItem('channelLibrary_hidePlaylisted');
        if (storedHidePlaylisted === 'true') {
          newParams.set('hide_playlisted', 'true');
          changed = true;
        }
      }
    }

    if (changed) {
      setSearchParams(newParams, { replace: true });
    }
  }, [channelId]); // Run when channelId changes (navigating to a different channel or returning to same channel)

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
    if (value) {
      newParams.set(key, value);
      // Save to localStorage for persistence
      if (key === 'filter') localStorage.setItem(`${localStorageKey}_filter`, value);
      if (key === 'min_duration') localStorage.setItem(`${localStorageKey}_minDuration`, value);
      if (key === 'max_duration') localStorage.setItem(`${localStorageKey}_maxDuration`, value);
      if (key === 'upload_from') localStorage.setItem(`${localStorageKey}_uploadFrom`, value);
      if (key === 'upload_to') localStorage.setItem(`${localStorageKey}_uploadTo`, value);
    } else {
      newParams.delete(key);
      // Remove from localStorage when cleared
      if (key === 'filter') localStorage.removeItem(`${localStorageKey}_filter`);
      if (key === 'min_duration') localStorage.removeItem(`${localStorageKey}_minDuration`);
      if (key === 'max_duration') localStorage.removeItem(`${localStorageKey}_maxDuration`);
      if (key === 'upload_from') localStorage.removeItem(`${localStorageKey}_uploadFrom`);
      if (key === 'upload_to') localStorage.removeItem(`${localStorageKey}_uploadTo`);
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

  // Helper to parse upload_date (YYYYMMDD format) or discovered_at (ISO format)
  const parseVideoDate = (video) => {
    if (video.upload_date && video.upload_date.length === 8) {
      // Parse YYYYMMDD format
      const year = video.upload_date.substring(0, 4);
      const month = video.upload_date.substring(4, 6);
      const day = video.upload_date.substring(6, 8);
      return new Date(`${year}-${month}-${day}`);
    }
    return new Date(video.discovered_at);
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
        // Newest first - use upload_date, fall back to discovered_at
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
  }, [searchInput, hideWatched, hidePlaylisted, sort, contentFilter]);

  // Adjust page if current page is now empty (after bulk delete/ignore)
  useEffect(() => {
    const totalPages = Math.ceil(sortedVideos.length / itemsPerPage);
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [sortedVideos.length, itemsPerPage, currentPage]);

  // Paginate videos
  const paginatedVideos = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedVideos.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedVideos, currentPage, itemsPerPage]);

  const handleFilterChange = (key, value) => {
    const newParams = new URLSearchParams(searchParams);

    if (key === 'view') {
      setViewMode(value);
      return;
    }

    // Handle hide_watched and hide_playlisted - update both URL and localStorage
    if (key === 'hide_watched' || key === 'hide_playlisted') {
      if (value) {
        newParams.set(key, value);
        if (isLibraryMode) {
          const storageKey = key === 'hide_watched' ? 'channelLibrary_hideWatched' : 'channelLibrary_hidePlaylisted';
          localStorage.setItem(storageKey, 'true');
        }
      } else {
        newParams.delete(key);
        if (isLibraryMode) {
          const storageKey = key === 'hide_watched' ? 'channelLibrary_hideWatched' : 'channelLibrary_hidePlaylisted';
          localStorage.setItem(storageKey, 'false');
        }
      }
      setSearchParams(newParams);
      return;
    }

    if (key === 'sort') {
      newParams.set('sort', value);
      // Save to localStorage for persistence
      localStorage.setItem(`${localStorageKey}_sort`, value);
    } else if (key === 'duration') {
      // Convert duration filter to min/max minutes
      newParams.delete('min_duration');
      newParams.delete('max_duration');
      // Clear localStorage for duration
      localStorage.removeItem(`${localStorageKey}_minDuration`);
      localStorage.removeItem(`${localStorageKey}_maxDuration`);

      if (value === 'under5') {
        newParams.set('max_duration', '5');
        localStorage.setItem(`${localStorageKey}_maxDuration`, '5');
      } else if (value === '5-30') {
        newParams.set('min_duration', '5');
        newParams.set('max_duration', '30');
        localStorage.setItem(`${localStorageKey}_minDuration`, '5');
        localStorage.setItem(`${localStorageKey}_maxDuration`, '30');
      } else if (value === '30-60') {
        newParams.set('min_duration', '30');
        newParams.set('max_duration', '60');
        localStorage.setItem(`${localStorageKey}_minDuration`, '30');
        localStorage.setItem(`${localStorageKey}_maxDuration`, '60');
      } else if (value === 'over60') {
        newParams.set('min_duration', '60');
        localStorage.setItem(`${localStorageKey}_minDuration`, '60');
      }
    } else if (key === 'uploadDate') {
      // Convert upload date filter to from/to dates
      newParams.delete('upload_from');
      newParams.delete('upload_to');
      // Clear localStorage for upload dates
      localStorage.removeItem(`${localStorageKey}_uploadFrom`);
      localStorage.removeItem(`${localStorageKey}_uploadTo`);

      const now = new Date();
      if (value === 'week') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const fromDate = weekAgo.toISOString().split('T')[0];
        newParams.set('upload_from', fromDate);
        localStorage.setItem(`${localStorageKey}_uploadFrom`, fromDate);
      } else if (value === 'month') {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const fromDate = monthAgo.toISOString().split('T')[0];
        newParams.set('upload_from', fromDate);
        localStorage.setItem(`${localStorageKey}_uploadFrom`, fromDate);
      } else if (value === 'year') {
        const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        const fromDate = yearAgo.toISOString().split('T')[0];
        newParams.set('upload_from', fromDate);
        localStorage.setItem(`${localStorageKey}_uploadFrom`, fromDate);
      }
    } else if (value) {
      newParams.set(key, value);
    } else {
      newParams.delete(key);
    }

    setSearchParams(newParams);
  };

  // Real-time search handler - just update local state (debounce will handle URL params)
  const handleSearchChange = (value) => {
    setSearchInput(value);
  };

  const toggleHideFilter = (filterKey) => {
    const newParams = new URLSearchParams(searchParams);
    const currentValue = newParams.get(filterKey) === 'true';

    if (currentValue) {
      newParams.delete(filterKey);
    } else {
      newParams.set(filterKey, 'true');
    }

    setSearchParams(newParams);
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
          await bulkUpdate.mutateAsync({
            videoIds: selectedVideos,
            updates: { status: 'discovered' },
          });
          showNotification(`${selectedVideos.length} videos unignored`, 'success');
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

      // Backend handles completion message via status bar
    } catch (error) {
      showNotification(error.message, 'error');
    }
  };

  const handleDeleteChannel = async () => {
    try {
      showNotification(`Deleting channel...`, 'info', { persistent: true });
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

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-red-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Sticky Header Row */}
      <div className="sticky top-[68px] z-40 bg-dark-primary/95 backdrop-blur-lg md:-mx-8 md:px-8 pb-4 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Back Arrow - Library mode goes to /library, Discovery mode goes to / (main channels list) */}
          <Link
            to={isLibraryMode ? "/library" : "/"}
            className="flex items-center justify-center w-9 h-9 rounded-lg bg-dark-tertiary hover:bg-dark-hover border border-dark-border text-text-secondary hover:text-text-primary transition-colors"
            title={isLibraryMode ? "Back to Library" : "Back to Channels"}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </Link>

          {/* Tabs - Different for Library vs Discovery mode */}
          <div className="flex gap-2">
            {isLibraryMode ? (
              <>
                {/* Library Mode: Videos / Playlists */}
                <button
                  onClick={() => {
                    const newParams = new URLSearchParams(searchParams);
                    newParams.delete('filter');
                    setSearchParams(newParams);
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    contentFilter === 'videos'
                      ? 'bg-dark-tertiary text-text-primary border border-dark-border-light'
                      : 'bg-dark-primary/95 border border-dark-border text-text-secondary hover:bg-dark-tertiary/50 hover:text-text-primary'
                  }`}
                >
                  Videos
                </button>
                <button
                  onClick={() => {
                    navigate('/library?tab=playlists');
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-dark-primary/95 border border-dark-border text-text-secondary hover:bg-dark-tertiary/50 hover:text-text-primary"
                >
                  Playlists
                </button>
              </>
            ) : (
              <>
                {/* Discovery Mode: To Review / Ignored */}
                <button
                  onClick={() => {
                    const newParams = new URLSearchParams(searchParams);
                    newParams.delete('filter');
                    setSearchParams(newParams);
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
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
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
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

          {/* Search */}
          <div className="flex items-center">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search videos..."
              className="search-input w-full sm:w-[180px]"
            />
          </div>

          {/* View Toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg border transition-all ${
                viewMode === 'grid'
                  ? 'bg-dark-tertiary border-dark-border-light text-text-primary'
                  : 'bg-dark-primary/95 border-dark-border text-text-secondary hover:bg-dark-tertiary/50 hover:text-text-primary'
              }`}
              title="Grid View"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7"></rect>
                <rect x="14" y="3" width="7" height="7"></rect>
                <rect x="14" y="14" width="7" height="7"></rect>
                <rect x="3" y="14" width="7" height="7"></rect>
              </svg>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg border transition-all ${
                viewMode === 'list'
                  ? 'bg-dark-tertiary border-dark-border-light text-text-primary'
                  : 'bg-dark-primary/95 border-dark-border text-text-secondary hover:bg-dark-tertiary/50 hover:text-text-primary'
              }`}
              title="List View"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="8" y1="6" x2="21" y2="6"></line>
                <line x1="8" y1="12" x2="21" y2="12"></line>
                <line x1="8" y1="18" x2="21" y2="18"></line>
                <line x1="3" y1="6" x2="3.01" y2="6"></line>
                <line x1="3" y1="12" x2="3.01" y2="12"></line>
                <line x1="3" y1="18" x2="3.01" y2="18"></line>
              </svg>
            </button>
          </div>

          {/* Pagination */}
          <Pagination
            currentPage={currentPage}
            totalItems={sortedVideos.length}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
            onItemsPerPageChange={(value) => {
              setItemsPerPage(value);
              localStorage.setItem('channelLibrary_itemsPerPage', value);
              setCurrentPage(1);
            }}
          />

          {/* Filters Button - Show for both videos and playlists */}
          <button
            onClick={() => setShowFiltersModal(true)}
            title="Filter and sort videos"
            className="filter-btn"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"></path>
            </svg>
            <span>Filters</span>
          </button>

          {/* Edit Button - Only in library mode for videos */}
          {isLibraryMode && contentFilter !== 'playlists' && (
            <button
              onClick={() => {
                setEditMode(!editMode);
                setSelectedVideos([]); // Clear selection when toggling
              }}
              title={editMode ? "Exit selection mode" : "Select videos for bulk actions"}
              className={`filter-btn ${editMode ? 'bg-dark-tertiary text-text-primary border-dark-border-light' : ''}`}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
              <span>{editMode ? 'Done' : 'Edit'}</span>
            </button>
          )}

          {/* Edit Mode Actions - Only in library mode when edit mode is active */}
          {isLibraryMode && editMode && contentFilter !== 'playlists' && (
            <>
              {/* Select All - Always visible */}
              {sortedVideos.length > 0 && (
                <>
                  <button
                    onClick={selectAll}
                    className="btn btn-primary btn-sm"
                  >
                    Select All ({sortedVideos.length})
                  </button>
                  <button
                    onClick={selectPage}
                    className="btn btn-secondary btn-sm"
                  >
                    Select Page ({paginatedVideos.length})
                  </button>
                </>
              )}

              {/* Action Buttons - Appear when videos are selected */}
              {selectedVideos.length > 0 && (
                <>
                  <span className="text-sm text-text-secondary">{selectedVideos.length} selected</span>
                  <button
                    onClick={() => handleBulkAction('delete')}
                    className="btn btn-secondary btn-sm"
                  >
                    Delete All
                  </button>
                  <button
                    onClick={() => handleBulkAction('playlist')}
                    className="btn btn-primary btn-sm"
                  >
                    Add to Playlist
                  </button>
                  <button
                    onClick={clearSelection}
                    className="btn btn-secondary btn-sm"
                  >
                    Clear
                  </button>
                </>
              )}
            </>
          )}

          {/* Select All and Bulk Actions - Only in discovery mode */}
          {!isLibraryMode && contentFilter !== 'playlists' && (
            <>
              {/* Select All - Always visible */}
              {sortedVideos.length > 0 && (
                <>
                  <button
                    onClick={selectAll}
                    className="btn btn-primary btn-sm"
                  >
                    Select All ({sortedVideos.length})
                  </button>
                  <button
                    onClick={selectPage}
                    className="btn btn-secondary btn-sm"
                  >
                    Select Page ({paginatedVideos.length})
                  </button>
                </>
              )}

              {/* Action Buttons - Appear when videos are selected */}
              {selectedVideos.length > 0 && (
                <>
                  <span className="text-sm text-text-secondary">{selectedVideos.length} selected</span>
                  {contentFilter === 'to-review' && (
                    <>
                      <button
                        onClick={() => handleBulkAction('queue')}
                        className="btn btn-primary btn-sm"
                      >
                        Add to Queue
                      </button>
                      <button
                        onClick={() => handleBulkAction('ignore')}
                        className="btn btn-secondary btn-sm"
                      >
                        Ignore
                      </button>
                    </>
                  )}
                  {contentFilter === 'ignored' && (
                    <button
                      onClick={() => handleBulkAction('unignore')}
                      className="btn btn-primary btn-sm"
                    >
                      Unignore
                    </button>
                  )}
                  <button
                    onClick={clearSelection}
                    className="btn btn-secondary btn-sm"
                  >
                    Clear
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

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

      {/* Videos Grid/List */}
      {sortedVideos.length === 0 ? (
          <div className="text-center py-20 text-text-secondary">
            <svg className="w-16 h-16 mx-auto mb-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
            </svg>
            {videos && videos.length > 0 && (hideWatched || hidePlaylisted) ? (
              <>
                <p className="text-lg font-medium">All videos are {hideWatched && hidePlaylisted ? 'watched or in playlists' : hideWatched ? 'watched' : 'in playlists'}</p>
                <p className="text-sm mt-2">Remove filter to see them</p>
              </>
            ) : (
              <>
                <p className="text-lg font-medium">No videos found</p>
                <p className="text-sm mt-2">{isLibraryMode ? 'No downloaded videos yet' : 'Try adjusting your filters or scan for videos'}</p>
              </>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="px-6 lg:px-12 xl:px-16">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
            {paginatedVideos.map(video => (
              <VideoCard
                key={video.id}
                video={video}
                isSelected={selectedVideos.includes(video.id)}
                onToggleSelect={isLibraryMode && editMode ? toggleSelectVideo : !isLibraryMode ? toggleSelectVideo : undefined}
                isQueued={queueVideoIds.has(video.id)}
                editMode={isLibraryMode && editMode}
                isLibraryView={isLibraryMode}
              />
            ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 items-start">
            {paginatedVideos.map(video => (
              <VideoRow
                key={video.id}
                video={video}
                isSelected={selectedVideos.includes(video.id)}
                isQueued={queueVideoIds.has(video.id)}
                onToggleSelect={isLibraryMode && editMode ? toggleSelectVideo : !isLibraryMode ? toggleSelectVideo : undefined}
              />
            ))}
          </div>
        )}

      {/* Bottom Pagination */}
      {sortedVideos.length > 0 && (
        <div className="flex justify-center mt-6">
          <Pagination
            currentPage={currentPage}
            totalItems={sortedVideos.length}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
            onItemsPerPageChange={(value) => {
              setItemsPerPage(value);
              localStorage.setItem('channelLibrary_itemsPerPage', value);
              setCurrentPage(1);
            }}
          />
        </div>
      )}

      {/* Filters Modal */}
      <FiltersModal
        isOpen={showFiltersModal}
        onClose={() => setShowFiltersModal(false)}
        filters={{
          uploadDate: currentUploadDateFilter,
          duration: currentDurationFilter,
          view: viewMode,
          sort,
          hideWatched,
          hidePlaylisted
        }}
        onFilterChange={handleFilterChange}
        hideVideosFilter={true}
        isPlaylistMode={contentFilter === 'playlists'}
        isLibraryMode={isLibraryMode}
        isPlaylistView={contentFilter === 'playlists'}
      />

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
