import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useSearchParams, Link, useLocation, useNavigate } from 'react-router-dom';
import { useVideos, useChannels, useAddToQueue, useBulkUpdateVideos, usePlaylists, useQueue, useDeleteVideo, useDeleteChannel, useScanChannel, useUpdateChannel } from '../api/queries';
import { useNotification } from '../contexts/NotificationContext';
import VideoCard from '../components/VideoCard';
import VideoRow from '../components/VideoRow';
import FiltersModal from '../components/FiltersModal';
import MultiSelectBar from '../components/MultiSelectBar';
import AddToPlaylistMenu from '../components/AddToPlaylistMenu';

export default function ChannelLibrary() {
  const { channelId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: channels } = useChannels();
  const { data: playlists } = usePlaylists();
  const { data: queueData } = useQueue();
  const addToQueue = useAddToQueue();
  const bulkUpdate = useBulkUpdateVideos();
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
  const menuRef = useRef(null);

  const channel = channels?.find(c => c.id === Number(channelId));

  // Get filters from URL, with localStorage fallback for library mode visibility filters
  // Library mode: 'videos' or 'playlists' (default: 'videos')
  // Discovery mode: 'needs-review' or 'ignored' (default: 'needs-review')
  const contentFilter = searchParams.get('filter') || (isLibraryMode ? 'videos' : 'needs-review');
  const search = searchParams.get('search') || '';
  const sort = searchParams.get('sort') || 'date-desc';
  const minDuration = searchParams.get('min_duration');
  const maxDuration = searchParams.get('max_duration');
  const uploadDateFrom = searchParams.get('upload_from');
  const uploadDateTo = searchParams.get('upload_to');

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
    // Discovery mode: Needs Review = discovered videos, Ignored = ignored videos
    if (contentFilter === 'ignored') {
      ignored = 'true';
    } else {
      // needs-review
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

  // Initialize URL params from localStorage on mount (library mode only)
  useEffect(() => {
    if (isLibraryMode) {
      const newParams = new URLSearchParams(searchParams);
      let changed = false;

      // Only set URL params from localStorage if they're not already in the URL
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

      if (changed) {
        setSearchParams(newParams, { replace: true });
      }
    }
  }, []); // Run only on mount

  // Persist library mode visibility filters to localStorage
  useEffect(() => {
    if (isLibraryMode) {
      localStorage.setItem('channelLibrary_hideWatched', hideWatched);
    }
  }, [hideWatched, isLibraryMode]);

  useEffect(() => {
    if (isLibraryMode) {
      localStorage.setItem('channelLibrary_hidePlaylisted', hidePlaylisted);
    }
  }, [hidePlaylisted, isLibraryMode]);

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
    } else {
      newParams.delete(key);
    }
    setSearchParams(newParams);
  };

  const handleSort = (sortValue) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('sort', sortValue);
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

  const handleFilterChange = (key, value) => {
    const newParams = new URLSearchParams(searchParams);

    if (key === 'view') {
      setViewMode(value);
      return;
    }

    if (key === 'sort') {
      newParams.set('sort', value);
    } else if (key === 'duration') {
      // Convert duration filter to min/max minutes
      newParams.delete('min_duration');
      newParams.delete('max_duration');

      if (value === 'under5') {
        newParams.set('max_duration', '5');
      } else if (value === '5-30') {
        newParams.set('min_duration', '5');
        newParams.set('max_duration', '30');
      } else if (value === '30-60') {
        newParams.set('min_duration', '30');
        newParams.set('max_duration', '60');
      } else if (value === 'over60') {
        newParams.set('min_duration', '60');
      }
    } else if (key === 'uploadDate') {
      // Convert upload date filter to from/to dates
      newParams.delete('upload_from');
      newParams.delete('upload_to');

      const now = new Date();
      if (value === 'week') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        newParams.set('upload_from', weekAgo.toISOString().split('T')[0]);
      } else if (value === 'month') {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        newParams.set('upload_from', monthAgo.toISOString().split('T')[0]);
      } else if (value === 'year') {
        const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        newParams.set('upload_from', yearAgo.toISOString().split('T')[0]);
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
          for (const videoId of selectedVideos) {
            await addToQueue.mutateAsync(videoId);
          }
          showNotification(`${selectedVideos.length} videos added to queue`, 'success');
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
          if (!window.confirm(`Delete ${selectedVideos.length} videos?`)) return;

          for (const videoId of selectedVideos) {
            await deleteVideo.mutateAsync(videoId);
          }
          showNotification(`${selectedVideos.length} videos deleted`, 'success');
          break;
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

  const clearSelection = () => {
    setSelectedVideos([]);
  };

  const handleScanChannel = async (forceFull = false) => {
    try {
      const scanType = forceFull ? 'Rescanning all videos' : 'Scanning for new videos';
      showNotification(scanType, 'info', { persistent: true });

      const result = await scanChannel.mutateAsync({ id: Number(channelId), forceFull });
      showNotification(`Found ${result.new_videos} new videos, ${result.ignored_videos} ignored`, 'success');
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
      <div className="sticky top-[100px] z-40 bg-dark-primary/95 backdrop-blur-lg -mx-8 px-8 py-4 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Back Arrow - Library mode goes to /library, Discovery mode goes to / (main channels list) */}
          <Link
            to={isLibraryMode ? "/library" : "/"}
            className="flex items-center justify-center w-9 h-9 rounded-lg bg-dark-tertiary hover:bg-dark-hover border border-dark-border text-text-secondary hover:text-white transition-colors"
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
                      ? 'bg-dark-tertiary text-white border border-dark-border-light'
                      : 'bg-dark-primary/95 border border-dark-border text-text-secondary hover:bg-dark-tertiary/50 hover:text-white'
                  }`}
                >
                  Videos
                </button>
                <button
                  onClick={() => {
                    const newParams = new URLSearchParams(searchParams);
                    newParams.set('filter', 'playlists');
                    setSearchParams(newParams);
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    contentFilter === 'playlists'
                      ? 'bg-dark-tertiary text-white border border-dark-border-light'
                      : 'bg-dark-primary/95 border border-dark-border text-text-secondary hover:bg-dark-tertiary/50 hover:text-white'
                  }`}
                >
                  Playlists
                </button>
              </>
            ) : (
              <>
                {/* Discovery Mode: Needs Review / Ignored */}
                <button
                  onClick={() => {
                    const newParams = new URLSearchParams(searchParams);
                    newParams.delete('filter');
                    setSearchParams(newParams);
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    contentFilter === 'needs-review'
                      ? 'bg-dark-tertiary text-white border border-dark-border-light'
                      : 'bg-dark-primary/95 border border-dark-border text-text-secondary hover:bg-dark-tertiary/50 hover:text-white'
                  }`}
                >
                  Needs Review
                </button>
                <button
                  onClick={() => {
                    const newParams = new URLSearchParams(searchParams);
                    newParams.set('filter', 'ignored');
                    setSearchParams(newParams);
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    contentFilter === 'ignored'
                      ? 'bg-dark-tertiary text-white border border-dark-border-light'
                      : 'bg-dark-primary/95 border border-dark-border text-text-secondary hover:bg-dark-tertiary/50 hover:text-white'
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
              className="search-input w-[180px]"
            />
          </div>

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
              className={`filter-btn ${editMode ? 'bg-dark-tertiary text-white border-dark-border-light' : ''}`}
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
                <button
                  onClick={selectAll}
                  className="btn btn-primary btn-sm"
                >
                  Select All ({sortedVideos.length})
                </button>
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
                <button
                  onClick={selectAll}
                  className="btn btn-primary btn-sm"
                >
                  Select All ({sortedVideos.length})
                </button>
              )}

              {/* Action Buttons - Appear when videos are selected */}
              {selectedVideos.length > 0 && (
                <>
                  <span className="text-sm text-text-secondary">{selectedVideos.length} selected</span>
                  {contentFilter === 'needs-review' && (
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

      {/* Channel Header - Only show for videos, not playlists */}
      {channel && contentFilter !== 'playlists' && (
        <div className="relative flex items-center gap-6 mb-4">
          {channel.thumbnail && (
            <img
              src={channel.thumbnail}
              alt={channel.title}
              className="w-16 h-16 rounded-full border-4 border-white"
            />
          )}
          <div>
            <h2 className="text-2xl font-bold text-text-primary">{channel.title}</h2>
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
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                    className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-dark-hover transition-colors flex flex-col"
                  >
                    <span className="font-medium">Scan New</span>
                    {channel.last_scan_at && (
                      <span className="text-xs text-text-secondary mt-0.5">
                        Since {new Date(channel.last_scan_at).toLocaleDateString()}
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
                    className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-dark-hover transition-colors"
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
            <div className="flex items-center gap-2">
              {/* Downloaded */}
              <div className="flex items-center gap-1 text-sm font-semibold text-green-400" title="Downloaded videos">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                <span className="font-mono">{channel.downloaded_count || 0}</span>
              </div>

              {/* Discovered */}
              <div className="flex items-center gap-1 text-sm font-semibold text-gray-400" title="Discovered videos">
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

      {/* Videos Grid/List or Playlists */}
      {contentFilter === 'playlists' ? (
        // Playlists View - show all playlists (not filtered by channel)
        (() => {
          const channelPlaylists = (playlists || []).sort((a, b) => {
            switch (sort) {
              case 'date-desc':
                // Newest first
                return new Date(b.created_at) - new Date(a.created_at);
              case 'date-asc':
                // Oldest first
                return new Date(a.created_at) - new Date(b.created_at);
              case 'videos-desc':
                // Most videos first
                return (b.video_count || 0) - (a.video_count || 0);
              case 'videos-asc':
                // Least videos first
                return (a.video_count || 0) - (b.video_count || 0);
              case 'title-asc':
                // A-Z
                return (a.title || a.name).localeCompare(b.title || b.name);
              case 'title-desc':
                // Z-A
                return (b.title || b.name).localeCompare(a.title || a.name);
              default:
                return 0;
            }
          });
          return channelPlaylists.length === 0 ? (
            <div className="text-center py-20 text-text-secondary">
              <svg className="w-16 h-16 mx-auto mb-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 10h16M4 14h10M4 18h10" />
                <circle cx="18" cy="16" r="3" />
              </svg>
              <p className="text-lg font-medium">No playlists yet</p>
              <p className="text-sm mt-2">Create playlists to organize your videos</p>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
              {channelPlaylists.map(playlist => (
                <Link
                  key={playlist.id}
                  to={`/playlist/${playlist.id}`}
                  className="card group transition-colors"
                >
                  {/* Playlist thumbnail */}
                  <div className="relative aspect-video bg-dark-tertiary rounded-t-xl overflow-hidden">
                    {playlist.thumbnail ? (
                      <img
                        src={playlist.thumbnail}
                        alt={playlist.title || playlist.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <svg className="w-10 h-10 text-text-muted" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                        </svg>
                      </div>
                    )}
                  </div>
                  {/* Playlist info */}
                  <div className="p-3 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors truncate" title={playlist.title || playlist.name}>
                      {playlist.title || playlist.name}
                    </h3>
                    <span className="text-xs text-text-secondary whitespace-nowrap flex-shrink-0">
                      {playlist.video_count || 0} videos
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          );
        })()
      ) : (
        // Videos View
        sortedVideos.length === 0 ? (
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
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
            {sortedVideos.map(video => (
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
        ) : (
          <div className="flex flex-col gap-2 items-start">
            {sortedVideos.map(video => (
              <VideoRow
                key={video.id}
                video={video}
                isSelected={selectedVideos.includes(video.id)}
                isQueued={queueVideoIds.has(video.id)}
                onToggleSelect={isLibraryMode && editMode ? toggleSelectVideo : !isLibraryMode ? toggleSelectVideo : undefined}
              />
            ))}
          </div>
        )
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
      />

      {/* Scroll to Top Button */}
      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 p-3 bg-gray-700 hover:bg-gray-600 rounded-full shadow-lg transition-colors z-50 animate-fade-in"
          aria-label="Scroll to top"
        >
          <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
    </div>
  );
}
