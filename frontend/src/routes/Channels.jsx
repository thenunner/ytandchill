import { useState, useEffect, useRef } from 'react';
import { useChannels, useCreateChannel, useDeleteChannel, useScanChannel, useUpdateChannel, useQueue, useChannelCategories, useCreateChannelCategory, useUpdateChannelCategory, useDeleteChannelCategory } from '../api/queries';
import { useNotification } from '../contexts/NotificationContext';
import { Link, useNavigate } from 'react-router-dom';
import ChannelRow from '../components/ChannelRow';
import { getUserFriendlyError } from '../utils/errorMessages';
import { useQueryClient } from '@tanstack/react-query';
import api from '../api/client';

export default function Channels() {
  const { data: channels, isLoading } = useChannels();
  const { data: queueData } = useQueue();
  const { data: categories } = useChannelCategories();
  const createChannel = useCreateChannel();
  const deleteChannel = useDeleteChannel();
  const scanChannel = useScanChannel();
  const updateChannel = useUpdateChannel();
  const createCategory = useCreateChannelCategory();
  const updateCategoryMutation = useUpdateChannelCategory();
  const deleteCategoryMutation = useDeleteChannelCategory();
  const { showNotification } = useNotification();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [showAddForm, setShowAddForm] = useState(false);
  const [newChannelUrl, setNewChannelUrl] = useState('');
  const [minMinutes, setMinMinutes] = useState(0);
  const [maxMinutes, setMaxMinutes] = useState(0);
  const [editingChannel, setEditingChannel] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [menuOpen, setMenuOpen] = useState(null); // Track which channel's menu is open (grid view only)
  const [showDurationSettings, setShowDurationSettings] = useState(null); // Track which channel shows duration settings
  const [searchInput, setSearchInput] = useState(''); // Search filter
  const [sortBy, setSortBy] = useState(localStorage.getItem('channels_sortBy') || 'needs_review_then_scan'); // Sort option
  const [showSortMenu, setShowSortMenu] = useState(false); // Sort menu visibility
  const [viewMode, setViewMode] = useState(localStorage.getItem('channelsViewMode') || 'grid'); // Grid or list view
  const [selectedChannels, setSelectedChannels] = useState([]); // Selected channels for batch operations
  const [editMode, setEditMode] = useState(false); // Edit mode for bulk selection
  const sortMenuRef = useRef(null);

  // Category filter state
  const [selectedCategories, setSelectedCategories] = useState(() => {
    const saved = localStorage.getItem('channels_categoryFilter');
    return saved ? JSON.parse(saved) : [];
  });
  const [showCategoryFilter, setShowCategoryFilter] = useState(false);
  const categoryFilterRef = useRef(null);

  // Category management modal state
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState(null);
  const [deleteCategoryConfirm, setDeleteCategoryConfirm] = useState(null);

  // Category submenu for channel assignment
  const [showCategorySubmenu, setShowCategorySubmenu] = useState(null);

  // Watch for scan completion and refetch channels
  const currentOperation = queueData?.current_operation;
  const prevOperationTypeRef = useRef(null);
  const isScanRunning = currentOperation?.type === 'scanning';

  useEffect(() => {
    // Detect when scan completes (type changes to 'scan_complete' from anything else)
    // This catches both: scanning->scan_complete AND cases where we missed the 'scanning' state
    if (currentOperation?.type === 'scan_complete' && prevOperationTypeRef.current !== 'scan_complete') {
      // Scan just completed - refetch channels to show updated counts and last_scan_time
      queryClient.invalidateQueries(['channels']);

      // Clear selected channels
      setSelectedChannels([]);
    }

    prevOperationTypeRef.current = currentOperation?.type;
  }, [currentOperation?.type, queryClient]);

  const handleAddChannel = async (e) => {
    e.preventDefault();

    // Process the URL input
    let processedUrl = newChannelUrl.trim();

    // Auto-complete bare @handles to full URL
    if (processedUrl.startsWith('@') && !processedUrl.includes('youtube.com')) {
      processedUrl = `https://www.youtube.com/${processedUrl}`;
    }

    // Reject URLs with subpaths like /videos, /playlists, /streams, etc.
    const invalidSuffixes = ['/videos', '/playlists', '/streams', '/shorts', '/community', '/about', '/channels', '/featured'];
    const hasInvalidSuffix = invalidSuffixes.some(suffix => {
      // Check if URL contains these suffixes after the channel identifier
      const lowerUrl = processedUrl.toLowerCase();
      return lowerUrl.includes(suffix);
    });

    if (hasInvalidSuffix) {
      showNotification('Invalid URL: Remove /videos, /playlists, or /streams from the channel URL', 'error');
      return;
    }

    try {
      const result = await createChannel.mutateAsync({
        url: processedUrl,
        min_minutes: minMinutes,
        max_minutes: maxMinutes,
      });
      setNewChannelUrl('');
      setMinMinutes(0);
      setMaxMinutes(0);
      setShowAddForm(false);

      // Show scan results message
      if (result.scan_result && result.scan_result.status === 'queued') {
        showNotification(
          `Channel added! Initial scan queued`,
          'success'
        );
      } else {
        showNotification('Channel added successfully', 'success');
      }
    } catch (error) {
      showNotification(getUserFriendlyError(error.message), 'error');
    }
  };

  const handleScanChannel = async (channelId, forceFull = false) => {
    try {
      const scanType = forceFull ? 'Rescanning all videos' : 'Scanning for new videos';

      // Get channel title for batch label
      const channel = channels?.find(c => c.id === channelId);
      const batchLabel = channel ? channel.title : 'Channel scan';

      const result = await scanChannel.mutateAsync({
        id: channelId,
        forceFull,
        is_batch_start: true,  // Single scans are their own "batch"
        is_auto_scan: false,
        batch_label: batchLabel
      });

      if (result.status === 'queued') {
        showNotification(`${scanType} queued`, 'info');
      } else if (result.status === 'batch_in_progress') {
        showNotification('A scan is already running. Please wait for it to complete.', 'warning');
      } else if (result.status === 'already_queued') {
        showNotification('Scan already queued for this channel', 'info');
      }
    } catch (error) {
      showNotification(getUserFriendlyError(error.message), 'error');
    }
  };

  const handleDeleteChannel = async (channelId) => {
    try {
      showNotification(`Deleting channel...`, 'info', { persistent: true });
      await deleteChannel.mutateAsync(channelId);
      showNotification('Channel deleted', 'success');
      setDeleteConfirm(null);
    } catch (error) {
      showNotification(getUserFriendlyError(error.message), 'error');
    }
  };

  const handleUpdateFilters = async (channel) => {
    try {
      await updateChannel.mutateAsync({
        id: channel.id,
        data: {
          min_minutes: channel.min_minutes,
          max_minutes: channel.max_minutes,
        },
      });
      setEditingChannel(null);
      showNotification('Filters updated', 'success');
    } catch (error) {
      showNotification(getUserFriendlyError(error.message), 'error');
    }
  };

  const handleScanAllChannels = async (forceFull = false) => {
    if (!channels || channels.length === 0) {
      showNotification('No channels to scan', 'info');
      return;
    }

    // Use selected channels if any, otherwise scan all (excluding Singles pseudo-channel)
    const channelsToScan = selectedChannels.length > 0
      ? channels.filter(c => selectedChannels.includes(c.id))
      : channels.filter(c => c.yt_id !== '__singles__');

    if (channelsToScan.length === 0) {
      showNotification('No channels selected', 'info');
      return;
    }

    const scanType = forceFull ? 'full scan' : 'new videos scan';

    // Determine batch label
    let batchLabel;
    if (selectedChannels.length === 0) {
      // Scanning all channels
      batchLabel = forceFull ? 'Scan All' : 'Scan New';
    } else if (channelsToScan.length === 1) {
      // Single channel selected
      batchLabel = channelsToScan[0].title;
    } else {
      // Multiple channels selected
      batchLabel = `Scan ${channelsToScan.length} channels`;
    }

    // Set scanning status immediately (optimistic UI) - don't await, fire and forget
    api.setOperation('scanning', 'Scanning channels for new videos').catch(() => {});
    // Immediately refetch queue to pick up the new operation status
    queryClient.invalidateQueries(['queue']);

    // Queue all channels at once (non-blocking)
    let queued = 0;
    let alreadyQueued = 0;
    let errorCount = 0;

    for (const channel of channelsToScan) {
      try {
        const result = await scanChannel.mutateAsync({
          id: channel.id,
          forceFull: forceFull,
          is_batch_start: queued === 0,  // First channel in batch
          is_auto_scan: false,
          batch_label: batchLabel
        });

        if (result.status === 'queued') {
          queued++;
        } else if (result.status === 'batch_in_progress') {
          showNotification('A scan is already running. Please wait for it to complete.', 'warning');
          return;  // Stop immediately
        } else if (result.status === 'already_queued') {
          alreadyQueued++;
        }
      } catch (error) {
        console.error(`Failed to queue scan for channel ${channel.title}:`, error);
        errorCount++;
      }
    }

    // Don't show "Queued X scans" message - scans happen too fast and cause double messaging
    // The actual scan progress will show in the status bar
    if (errorCount > 0) {
      const message = `Queued ${queued} scans (${alreadyQueued} already queued, ${errorCount} errors)`;
      showNotification(message, 'warning');
    }
  };

  // Click outside to close menu and duration settings
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Check if click is outside any card
      const cards = document.querySelectorAll('.channel-card-container');
      let clickedOutside = true;

      cards.forEach(card => {
        if (card.contains(event.target)) {
          clickedOutside = false;
        }
      });

      if (clickedOutside) {
        setMenuOpen(null);
        setShowDurationSettings(null);
        setShowCategorySubmenu(null);
      }

      // Close sort menu if clicking outside
      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target)) {
        setShowSortMenu(false);
      }

      // Close category filter if clicking outside
      if (categoryFilterRef.current && !categoryFilterRef.current.contains(event.target)) {
        setShowCategoryFilter(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Persist viewMode to localStorage
  useEffect(() => {
    localStorage.setItem('channelsViewMode', viewMode);
  }, [viewMode]);

  // Persist sortBy to localStorage
  useEffect(() => {
    localStorage.setItem('channels_sortBy', sortBy);
  }, [sortBy]);

  // Persist category filter to localStorage
  useEffect(() => {
    localStorage.setItem('channels_categoryFilter', JSON.stringify(selectedCategories));
  }, [selectedCategories]);

  // Helper function to check if a date is today
  const isToday = (date) => {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  };

  // Helper function to format scan time only
  const formatScanTime = (scanTimeString) => {
    if (!scanTimeString) return null;
    const scanDate = new Date(scanTimeString);

    if (isToday(scanDate)) {
      // Show time with minutes
      const hours = scanDate.getHours();
      const minutes = scanDate.getMinutes();
      const ampm = hours >= 12 ? 'pm' : 'am';
      const displayHours = hours % 12 || 12;
      const displayMinutes = minutes.toString().padStart(2, '0');
      return `${displayHours}:${displayMinutes}${ampm}`;
    } else {
      // Show date
      return scanDate.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
    }
  };

  // Helper function to format video date only
  const formatVideoDate = (videoDateString) => {
    if (!videoDateString) return null;
    const year = videoDateString.substring(0, 4);
    const month = videoDateString.substring(4, 6);
    const day = videoDateString.substring(6, 8);
    const videoDate = new Date(year, month - 1, day);
    return videoDate.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
  };

  // Helper function to format last scan - always shows "Scan: x | Video: x"
  const formatLastScan = (scanTimeString, videoDateString) => {
    if (!scanTimeString) return 'Never';

    // Parse the UTC datetime string and convert to local time
    // Backend sends ISO string in UTC, JavaScript Date automatically converts to local timezone
    const scanDate = new Date(scanTimeString);

    // Format scan: time if today, date if past
    let scanStr;
    if (isToday(scanDate)) {
      // Get local hour and minutes (JavaScript automatically converts from UTC)
      const hours = scanDate.getHours();
      const minutes = scanDate.getMinutes();
      const ampm = hours >= 12 ? 'pm' : 'am';
      const displayHours = hours % 12 || 12;
      const displayMinutes = minutes.toString().padStart(2, '0');
      scanStr = `${displayHours}:${displayMinutes}${ampm}`;
    } else {
      // Display date in local timezone
      scanStr = scanDate.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
    }

    // Format video: always date
    if (videoDateString) {
      const year = videoDateString.substring(0, 4);
      const month = videoDateString.substring(4, 6);
      const day = videoDateString.substring(6, 8);
      const videoDate = new Date(year, month - 1, day);
      const videoStr = videoDate.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
      return `Scan: ${scanStr} | Video: ${videoStr}`;
    } else {
      return `Scan: ${scanStr} | Video: None`;
    }
  };

  // Filter and sort channels
  const filteredAndSortedChannels = (() => {
    // First filter by search (and exclude Singles pseudo-channel)
    let filtered = channels?.filter(channel =>
      channel.yt_id !== '__singles__' &&
      (channel.title || '').toLowerCase().includes(searchInput.toLowerCase())
    ) || [];

    // Then filter by category if any categories are selected
    if (selectedCategories.length > 0) {
      filtered = filtered.filter(channel => {
        // 'uncategorized' is a special value for channels without category
        if (selectedCategories.includes('uncategorized') && !channel.category_id) {
          return true;
        }
        // Check if channel's category is in selected categories
        return selectedCategories.includes(channel.category_id);
      });
    }

    // Then sort based on selected option
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'needs_review_then_scan':
          // Sort by channels with videos to review first (any > 0), then by newest video upload date
          const aHasReview = (a.video_count || 0) > 0 ? 1 : 0;
          const bHasReview = (b.video_count || 0) > 0 ? 1 : 0;
          const reviewDiff = bHasReview - aHasReview;
          if (reviewDiff !== 0) return reviewDiff;

          // Within same review status, sort by newest video upload date (YYYYMMDD format)
          const aVideoDate = a.last_video_date || '';
          const bVideoDate = b.last_video_date || '';
          return bVideoDate.localeCompare(aVideoDate); // Newest video first
        case 'a_z':
          return (a.title || '').localeCompare(b.title || '');
        case 'z_a':
          return (b.title || '').localeCompare(a.title || '');
        case 'most_downloaded':
          return (b.downloaded_count || 0) - (a.downloaded_count || 0);
        case 'least_downloaded':
          return (a.downloaded_count || 0) - (b.downloaded_count || 0);
        case 'most_to_review':
          return (b.video_count || 0) - (a.video_count || 0);
        case 'least_to_review':
          return (a.video_count || 0) - (b.video_count || 0);
        case 'newest_scanned':
          return new Date(b.last_scan_at || 0) - new Date(a.last_scan_at || 0);
        case 'oldest_scanned':
          return new Date(a.last_scan_at || 0) - new Date(b.last_scan_at || 0);
        default:
          return 0;
      }
    });

    return sorted;
  })();

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-red-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="sticky top-[68px] z-40 bg-dark-primary/95 backdrop-blur-lg pb-4">
        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className={`w-8 h-8 p-0 flex items-center justify-center border rounded transition-all ${
              filteredAndSortedChannels.length === 0 && !showAddForm
                ? 'bg-green-600 hover:bg-green-700 border-green-500 text-white shadow-lg shadow-green-500/50 animate-pulse'
                : 'bg-dark-hover hover:bg-dark-tertiary border-dark-border-light text-text-primary'
            }`}
            title={showAddForm ? 'Cancel' : filteredAndSortedChannels.length === 0 ? 'Add Your First Channel!' : 'Add Channel'}
          >
            {showAddForm ? (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            )}
          </button>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search channels..."
            className="search-input w-full sm:w-[200px] h-8 py-1 px-3 text-sm"
          />

          {/* Sort Button */}
          <div className="relative" ref={sortMenuRef}>
            <button
              onClick={() => setShowSortMenu(!showSortMenu)}
              className="filter-btn"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="4" y1="6" x2="16" y2="6"></line>
                <line x1="4" y1="12" x2="13" y2="12"></line>
                <line x1="4" y1="18" x2="10" y2="18"></line>
              </svg>
              <span>Sort</span>
            </button>

            {/* Sort Dropdown Menu */}
            {showSortMenu && (
              <div className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-56 bg-dark-secondary border border-dark-border rounded-lg shadow-xl py-2 z-[100]">
                <div className="px-3 py-2 text-xs font-semibold text-text-secondary uppercase">Sort By</div>

                {/* A-Z / Z-A */}
                <div className="px-4 py-2 hover:bg-dark-hover transition-colors">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex gap-4">
                      <button
                        onClick={() => { setSortBy('a_z'); setShowSortMenu(false); }}
                        className={`${sortBy === 'a_z' ? 'text-accent' : 'text-text-primary hover:text-accent'}`}
                      >
                        A-Z
                      </button>
                      <button
                        onClick={() => { setSortBy('z_a'); setShowSortMenu(false); }}
                        className={`${sortBy === 'z_a' ? 'text-accent' : 'text-text-primary hover:text-accent'}`}
                      >
                        Z-A
                      </button>
                    </div>
                  </div>
                </div>

                {/* Downloaded */}
                <div className="px-4 py-2 hover:bg-dark-hover transition-colors">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-primary">Downloaded</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => { setSortBy('most_downloaded'); setShowSortMenu(false); }}
                        className={`p-1 rounded ${sortBy === 'most_downloaded' ? 'text-accent-text' : 'text-text-muted hover:text-text-primary'}`}
                        title="Most Downloaded"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                          <path d="M12 5v14M5 12l7-7 7 7"></path>
                        </svg>
                      </button>
                      <button
                        onClick={() => { setSortBy('least_downloaded'); setShowSortMenu(false); }}
                        className={`p-1 rounded ${sortBy === 'least_downloaded' ? 'text-accent-text' : 'text-text-muted hover:text-text-primary'}`}
                        title="Least Downloaded"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                          <path d="M12 19V5M5 12l7 7 7-7"></path>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Needs Review */}
                <div className="px-4 py-2 hover:bg-dark-hover transition-colors">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-primary">To Review</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => { setSortBy('most_to_review'); setShowSortMenu(false); }}
                        className={`p-1 rounded ${sortBy === 'most_to_review' ? 'text-accent-text' : 'text-text-muted hover:text-text-primary'}`}
                        title="Most To Review"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                          <path d="M12 5v14M5 12l7-7 7 7"></path>
                        </svg>
                      </button>
                      <button
                        onClick={() => { setSortBy('least_to_review'); setShowSortMenu(false); }}
                        className={`p-1 rounded ${sortBy === 'least_to_review' ? 'text-accent-text' : 'text-text-muted hover:text-text-primary'}`}
                        title="Least To Review"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                          <path d="M12 19V5M5 12l7 7 7-7"></path>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Last Scanned */}
                <div className="px-4 py-2 hover:bg-dark-hover transition-colors">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-primary">Last Scanned</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => { setSortBy('newest_scanned'); setShowSortMenu(false); }}
                        className={`p-1 rounded ${sortBy === 'newest_scanned' ? 'text-accent-text' : 'text-text-muted hover:text-text-primary'}`}
                        title="Newest Scanned"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                          <path d="M12 5v14M5 12l7-7 7 7"></path>
                        </svg>
                      </button>
                      <button
                        onClick={() => { setSortBy('oldest_scanned'); setShowSortMenu(false); }}
                        className={`p-1 rounded ${sortBy === 'oldest_scanned' ? 'text-accent-text' : 'text-text-muted hover:text-text-primary'}`}
                        title="Oldest Scanned"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                          <path d="M12 19V5M5 12l7 7 7-7"></path>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Category Filter */}
          <div className="relative" ref={categoryFilterRef}>
            <button
              onClick={() => setShowCategoryFilter(!showCategoryFilter)}
              className={`filter-btn ${selectedCategories.length > 0 ? 'ring-2 ring-accent/40' : ''}`}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
              <span>
                {selectedCategories.length === 0
                  ? 'Category'
                  : selectedCategories.length === 1
                    ? (selectedCategories[0] === 'uncategorized' ? 'Uncategorized' : categories?.find(c => c.id === selectedCategories[0])?.name || 'Category')
                    : `${selectedCategories.length} categories`}
              </span>
            </button>

            {/* Category Filter/Assign Dropdown */}
            {showCategoryFilter && (
              <div className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-64 bg-dark-secondary border border-dark-border rounded-lg shadow-xl py-2 z-[100]">
                <div className="px-3 py-2 text-xs font-semibold text-text-secondary uppercase flex justify-between items-center">
                  <span>
                    {selectedChannels.length > 0
                      ? `Assign ${selectedChannels.length} channel${selectedChannels.length > 1 ? 's' : ''} to:`
                      : 'Filter by Category'}
                  </span>
                  {selectedChannels.length === 0 && selectedCategories.length > 0 && (
                    <button
                      onClick={() => setSelectedCategories([])}
                      className="text-accent-text hover:text-accent-text/80 text-xs normal-case"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Uncategorized option */}
                <button
                  className="flex items-center gap-2 px-4 py-2 hover:bg-dark-hover cursor-pointer w-full text-left"
                  onClick={async () => {
                    if (selectedChannels.length > 0) {
                      // Bulk assign mode - set all selected channels to uncategorized
                      const count = selectedChannels.length;
                      showNotification(`Assigning ${count} channel${count > 1 ? 's' : ''} to Uncategorized...`, 'info');

                      let successCount = 0;
                      let errorCount = 0;

                      for (const channelId of selectedChannels) {
                        try {
                          await updateChannel.mutateAsync({ id: channelId, data: { category_id: null } });
                          successCount++;
                        } catch (error) {
                          console.error(`Failed to update channel ${channelId}:`, error);
                          errorCount++;
                        }
                      }

                      if (errorCount === 0) {
                        showNotification(`${successCount} channel${successCount > 1 ? 's' : ''} set to Uncategorized`, 'success');
                      } else {
                        showNotification(`${successCount} assigned, ${errorCount} failed`, 'warning');
                      }

                      setSelectedChannels([]);
                      setShowCategoryFilter(false);
                    } else {
                      // Filter mode - toggle uncategorized filter
                      if (selectedCategories.includes('uncategorized')) {
                        setSelectedCategories(selectedCategories.filter(c => c !== 'uncategorized'));
                      } else {
                        setSelectedCategories([...selectedCategories, 'uncategorized']);
                      }
                    }
                  }}
                >
                  {selectedChannels.length === 0 && (
                    <input
                      type="checkbox"
                      checked={selectedCategories.includes('uncategorized')}
                      readOnly
                      className="w-4 h-4 rounded border-dark-border bg-dark-tertiary text-accent-text"
                    />
                  )}
                  <span className="text-sm text-text-secondary italic">Uncategorized</span>
                </button>

                {/* Category list */}
                {categories?.map(category => (
                  <button
                    key={category.id}
                    className="flex items-center gap-2 px-4 py-2 hover:bg-dark-hover cursor-pointer w-full text-left"
                    onClick={async () => {
                      if (selectedChannels.length > 0) {
                        // Bulk assign mode
                        const count = selectedChannels.length;
                        showNotification(`Assigning ${count} channel${count > 1 ? 's' : ''} to ${category.name}...`, 'info');

                        let successCount = 0;
                        let errorCount = 0;

                        for (const channelId of selectedChannels) {
                          try {
                            await updateChannel.mutateAsync({ id: channelId, data: { category_id: category.id } });
                            successCount++;
                          } catch (error) {
                            console.error(`Failed to update channel ${channelId}:`, error);
                            errorCount++;
                          }
                        }

                        if (errorCount === 0) {
                          showNotification(`${successCount} channel${successCount > 1 ? 's' : ''} assigned to ${category.name}`, 'success');
                        } else {
                          showNotification(`${successCount} assigned, ${errorCount} failed`, 'warning');
                        }

                        // Invalidate channel-categories to update counts
                        queryClient.invalidateQueries(['channel-categories']);
                        setSelectedChannels([]);
                        setShowCategoryFilter(false);
                      } else {
                        // Filter mode - toggle category filter
                        if (selectedCategories.includes(category.id)) {
                          setSelectedCategories(selectedCategories.filter(c => c !== category.id));
                        } else {
                          setSelectedCategories([...selectedCategories, category.id]);
                        }
                      }
                    }}
                  >
                    {selectedChannels.length === 0 && (
                      <input
                        type="checkbox"
                        checked={selectedCategories.includes(category.id)}
                        readOnly
                        className="w-4 h-4 rounded border-dark-border bg-dark-tertiary text-accent-text"
                      />
                    )}
                    <span className="text-sm text-text-primary">{category.name}</span>
                    <span className="text-xs text-text-muted ml-auto">{category.channel_count}</span>
                  </button>
                ))}

                {/* Manage Categories */}
                <div className="border-t border-dark-border mt-2 pt-2">
                  <button
                    onClick={() => {
                      setShowCategoryFilter(false);
                      setShowCategoryModal(true);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-accent-text hover:bg-dark-hover"
                  >
                    Manage Categories...
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Edit/Done Button */}
          <button
            onClick={() => {
              setEditMode(!editMode);
              setSelectedChannels([]);
            }}
            className={`filter-btn ${editMode ? 'bg-dark-tertiary text-text-primary border-dark-border-light' : ''}`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            <span>{editMode ? 'Done' : 'Edit'}</span>
          </button>

          {/* Selection indicator and bulk actions - only in edit mode */}
          {editMode && (
            <>
              {selectedChannels.length > 0 && (
                <span className="text-xs text-accent-text font-medium">
                  {selectedChannels.length} selected
                </span>
              )}
              {filteredAndSortedChannels.length > 0 && (
                <button
                  onClick={() => setSelectedChannels(filteredAndSortedChannels.map(c => c.id))}
                  className="btn btn-primary btn-sm"
                >
                  Select All ({filteredAndSortedChannels.length})
                </button>
              )}
              {selectedChannels.length > 0 && (
                <button
                  onClick={() => setSelectedChannels([])}
                  className="btn btn-secondary btn-sm"
                >
                  Clear
                </button>
              )}
            </>
          )}

          {/* Scan New Button */}
          <button
            onClick={() => handleScanAllChannels(false)}
            disabled={!channels || channels.length === 0 || isScanRunning}
            className="filter-btn disabled:opacity-50 disabled:cursor-not-allowed"
            title={isScanRunning
              ? "Scan in progress..."
              : selectedChannels.length > 0
                ? "Scan selected channels for new videos since last scan"
                : "Scan all channels for new videos since last scan"}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10"></polyline>
              <path d="M20.49 15a9 9 0 01-2.12 3.36 9 9 0 01-11.58 1.47A9 9 0 013 12a9 9 0 011.79-5.37A9 9 0 0112 3a9 9 0 018.5 6.5L23 10"></path>
            </svg>
            <span>Scan New</span>
          </button>

          {/* Scan All Button */}
          <button
            onClick={() => handleScanAllChannels(true)}
            disabled={!channels || channels.length === 0 || isScanRunning}
            className="filter-btn disabled:opacity-50 disabled:cursor-not-allowed"
            title={isScanRunning
              ? "Scan in progress..."
              : selectedChannels.length > 0
                ? "Rescan selected channels for all videos"
                : "Rescan all channels for all videos"}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              <polyline points="23 4 23 10 17 10"></polyline>
              <path d="M20.49 15a9 9 0 01-2.12 3.36 9 9 0 01-11.58 1.47A9 9 0 013 12a9 9 0 011.79-5.37A9 9 0 0112 3a9 9 0 018.5 6.5L23 10"></path>
            </svg>
            <span>Scan All</span>
          </button>

          {/* View Toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg border transition-all ${
                viewMode === 'grid'
                  ? 'bg-dark-tertiary border-dark-border-light text-text-primary ring-2 ring-accent/40'
                  : 'bg-dark-primary border-dark-border text-text-muted hover:bg-dark-secondary hover:text-text-primary hover:border-dark-border-light'
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
                  ? 'bg-dark-tertiary border-dark-border-light text-text-primary ring-2 ring-accent/40'
                  : 'bg-dark-primary border-dark-border text-text-muted hover:bg-dark-secondary hover:text-text-primary hover:border-dark-border-light'
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
        </div>
      </div>

      {showAddForm && (
        <div className="card p-4 animate-slide-down max-w-2xl">
          <form onSubmit={handleAddChannel} className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-text-secondary mb-1 block">Channel URL or ID</label>
              <input
                type="text"
                value={newChannelUrl}
                onChange={(e) => setNewChannelUrl(e.target.value)}
                placeholder="https://www.youtube.com/channel/..."
                className="input text-sm py-1.5 px-3 w-full"
                required
              />
            </div>
            <div className="flex items-end gap-3">
              <div className="w-32">
                <label className="text-xs font-semibold text-text-secondary mb-1 block">Min (min)</label>
                <input
                  type="number"
                  value={minMinutes}
                  onChange={(e) => setMinMinutes(Number(e.target.value))}
                  placeholder="0"
                  className="input text-sm py-1.5 px-3 w-full"
                  min="0"
                />
              </div>
              <div className="w-32">
                <label className="text-xs font-semibold text-text-secondary mb-1 block">Max (min)</label>
                <input
                  type="number"
                  value={maxMinutes}
                  onChange={(e) => setMaxMinutes(Number(e.target.value))}
                  placeholder="0"
                  className="input text-sm py-1.5 px-3 w-full"
                  min="0"
                />
              </div>
              <button
                type="submit"
                disabled={createChannel.isPending}
                className="btn btn-primary py-1.5 px-4 text-sm"
              >
                {createChannel.isPending ? 'Adding...' : 'Add Channel'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Channels Grid/List */}
      {viewMode === 'grid' ? (
        <div className="px-6 lg:px-12 xl:px-16">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
          {filteredAndSortedChannels.map(channel => (
          <div key={channel.id} className="relative group channel-card-container">
            {/* Dropdown Menu - OUTSIDE card to avoid overflow:hidden clipping */}
            {menuOpen === channel.id && (
              <div className="absolute top-10 right-2 bg-dark-secondary border border-dark-border rounded-lg shadow-xl z-[100] w-[200px] animate-scale-in">
                <div className="py-1 max-h-[400px] overflow-y-auto">
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

                  {/* Duration Settings */}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowDurationSettings(showDurationSettings === channel.id ? null : channel.id);
                      if (showDurationSettings !== channel.id) {
                        setEditingChannel(channel);
                      }
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-dark-hover transition-colors flex items-center justify-between"
                  >
                    <span className="font-medium">Duration Settings</span>
                    <svg className={`w-4 h-4 text-text-muted transition-transform ${showDurationSettings === channel.id ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                  </button>

                  {/* Duration Settings - inline expansion */}
                  {showDurationSettings === channel.id && (
                    <div className="bg-dark-tertiary/50 border-t border-dark-border p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <label className="block text-xs text-text-secondary mb-1">Min</label>
                          <input
                            type="number"
                            value={editingChannel?.id === channel.id ? editingChannel.min_minutes : channel.min_minutes}
                            onChange={(e) => setEditingChannel({
                              ...channel,
                              min_minutes: Number(e.target.value),
                              max_minutes: editingChannel?.id === channel.id ? editingChannel.max_minutes : channel.max_minutes
                            })}
                            onClick={(e) => e.stopPropagation()}
                            className="input text-sm py-1 w-full"
                            min="0"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="block text-xs text-text-secondary mb-1">Max</label>
                          <input
                            type="number"
                            value={editingChannel?.id === channel.id ? editingChannel.max_minutes : channel.max_minutes}
                            onChange={(e) => setEditingChannel({
                              ...channel,
                              max_minutes: Number(e.target.value),
                              min_minutes: editingChannel?.id === channel.id ? editingChannel.min_minutes : channel.min_minutes
                            })}
                            onClick={(e) => e.stopPropagation()}
                            className="input text-sm py-1 w-full"
                            min="0"
                          />
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleUpdateFilters(editingChannel || channel);
                          setShowDurationSettings(null);
                          setMenuOpen(null);
                        }}
                        className="w-full btn btn-primary btn-sm"
                      >
                        Save
                      </button>
                    </div>
                  )}

                  {/* Set Category - expands inline */}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowCategorySubmenu(showCategorySubmenu === channel.id ? null : channel.id);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-dark-hover transition-colors flex items-center justify-between"
                  >
                    <span className="font-medium">Set Category</span>
                    <svg className={`w-4 h-4 text-text-muted transition-transform ${showCategorySubmenu === channel.id ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                  </button>

                  {/* Category Options - inline expansion */}
                  {showCategorySubmenu === channel.id && (
                    <div className="bg-dark-tertiary/50 border-t border-dark-border">
                      {/* Uncategorized option */}
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          updateChannel.mutate({
                            id: channel.id,
                            data: { category_id: null }
                          }, {
                            onSuccess: () => {
                              showNotification(`${channel.title} set to Uncategorized`, 'success');
                              setShowCategorySubmenu(null);
                              setMenuOpen(null);
                            }
                          });
                        }}
                        className={`w-full px-6 py-2 text-left text-sm hover:bg-dark-hover transition-colors flex items-center gap-2 ${!channel.category_id ? 'text-accent-text' : 'text-text-secondary italic'}`}
                      >
                        {!channel.category_id && (
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                            <polyline points="20 6 9 17 4 12" stroke="currentColor" strokeWidth="3" fill="none"></polyline>
                          </svg>
                        )}
                        <span className={!channel.category_id ? '' : 'ml-5'}>Uncategorized</span>
                      </button>

                      {/* Category options */}
                      {categories?.map(cat => (
                        <button
                          key={cat.id}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            updateChannel.mutate({
                              id: channel.id,
                              data: { category_id: cat.id }
                            }, {
                              onSuccess: () => {
                                showNotification(`${channel.title} moved to ${cat.name}`, 'success');
                                setShowCategorySubmenu(null);
                                setMenuOpen(null);
                              }
                            });
                          }}
                          className={`w-full px-6 py-2 text-left text-sm hover:bg-dark-hover transition-colors flex items-center gap-2 ${channel.category_id === cat.id ? 'text-accent-text' : 'text-text-primary'}`}
                        >
                          {channel.category_id === cat.id && (
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                              <polyline points="20 6 9 17 4 12" stroke="currentColor" strokeWidth="3" fill="none"></polyline>
                            </svg>
                          )}
                          <span className={channel.category_id === cat.id ? '' : 'ml-5'}>{cat.name}</span>
                        </button>
                      ))}

                      {/* No categories message */}
                      {(!categories || categories.length === 0) && (
                        <div className="px-6 py-2 text-sm text-text-muted italic">
                          No categories yet
                        </div>
                      )}
                    </div>
                  )}

                  {/* Delete Channel */}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDeleteConfirm({ id: channel.id, title: channel.title });
                      setMenuOpen(null);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-red-900/30 transition-colors border-t border-dark-border"
                  >
                    <span className="font-medium">Delete Channel</span>
                  </button>
                </div>
              </div>
            )}

            <div
              className={`overflow-hidden cursor-pointer transition-all rounded ${
                selectedChannels.includes(channel.id) ? 'ring-2 ring-accent/60' : ''
              } ${editMode ? 'hover:ring-2 hover:ring-accent/50' : 'hover:scale-100'}`}
              onClick={() => {
                if (editMode) {
                  setSelectedChannels(prev =>
                    prev.includes(channel.id)
                      ? prev.filter(id => id !== channel.id)
                      : [...prev, channel.id]
                  );
                }
              }}
            >
              {/* Checkmark overlay when selected in edit mode */}
              {editMode && selectedChannels.includes(channel.id) && (
                <div className="absolute top-2 right-2 bg-black/80 text-white rounded-full p-1.5 shadow-lg z-10">
                  <svg className="w-4 h-4 text-accent-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </div>
              )}

              <Link
                to={`/channel/${channel.id}`}
                className="block"
                onClick={(e) => {
                  if (editMode) {
                    e.preventDefault();
                  }
                }}
              >
                {/* Channel Thumbnail - YouTube style */}
                <div className="relative w-full aspect-video bg-dark-tertiary rounded-t-lg overflow-hidden">
                  {channel.thumbnail ? (
                    <img
                      src={channel.thumbnail}
                      alt={channel.title}
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

                {/* Content Section */}
                <div className="p-3 space-y-2 transition-colors group-hover:bg-dark-tertiary">
                  {/* Title + AUTO badge + 3-dot menu */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {/* AUTO badge */}
                      {channel.auto_download && (
                        <span className="text-green-500 text-[10px] font-bold tracking-wide flex-shrink-0">AUTO</span>
                      )}
                      {/* Title */}
                      <h3 className="text-base font-semibold text-text-primary line-clamp-1 leading-tight flex-1 min-w-0" title={channel.title}>
                        {channel.title}
                      </h3>
                    </div>

                    {/* 3-dot menu - hidden in edit mode */}
                    {!editMode && (
                      <div className="relative flex-shrink-0">
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setShowCategorySubmenu(null);
                            setMenuOpen(menuOpen === channel.id ? null : channel.id);
                          }}
                          className="p-1 rounded hover:bg-dark-hover transition-colors"
                        >
                          <svg className="w-5 h-5 text-text-secondary" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="12" cy="5" r="2"></circle>
                            <circle cx="12" cy="12" r="2"></circle>
                            <circle cx="12" cy="19" r="2"></circle>
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Scan and Video Dates - YouTube style */}
                  <div className="text-sm text-text-secondary font-medium">
                    Scan • {formatScanTime(channel.last_scan_time) || 'None'} - Last video • {formatVideoDate(channel.last_video_date) || 'None'}
                  </div>

                  {/* Stats - To Review, Downloaded, Ignored (closer together with dots) */}
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {/* To Review - First */}
                    <div className={`flex items-center gap-1 font-semibold ${(channel.video_count || 0) > 0 ? 'text-red-500' : 'text-gray-400'}`} title="To Review">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <circle cx="12" cy="12" r="1"></circle>
                      </svg>
                      <span className="font-mono">{channel.video_count || 0}</span>
                    </div>

                    {/* Separator dot */}
                    <span className="text-text-secondary">•</span>

                    {/* Downloaded - Second */}
                    <div className="flex items-center gap-1 font-semibold text-accent-text" title="Downloaded videos">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                      </svg>
                      <span className="font-mono">{channel.downloaded_count || 0}</span>
                    </div>

                    {/* Separator dot */}
                    <span className="text-text-secondary">•</span>

                    {/* Ignored - Third */}
                    <div className="flex items-center gap-1 font-semibold text-gray-400" title="Ignored videos">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
                      </svg>
                      <span className="font-mono">{channel.ignored_count || 0}</span>
                    </div>
                  </div>
                </div>
              </Link>

            </div>
          </div>
          ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 overflow-x-hidden">
          {filteredAndSortedChannels.map(channel => (
            <ChannelRow
              key={channel.id}
              channel={channel}
              onScan={handleScanChannel}
              onUpdateChannel={updateChannel.mutateAsync}
              onDelete={setDeleteConfirm}
              navigate={navigate}
              showNotification={showNotification}
              editMode={editMode}
              isSelected={selectedChannels.includes(channel.id)}
              onToggleSelect={(id) => {
                setSelectedChannels(prev =>
                  prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
                );
              }}
            />
          ))}
        </div>
      )}

      {filteredAndSortedChannels.length === 0 && (
        <div className="text-center py-20 text-text-secondary">
          <svg className="w-16 h-16 mx-auto mb-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <p className="text-lg font-medium">{searchInput ? 'No matching channels' : 'No channels yet'}</p>
          <p className="text-sm mt-2">{searchInput ? 'Try a different search term' : 'Add a YouTube channel to get started'}</p>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-secondary rounded-lg max-w-md w-full p-6 shadow-2xl border border-dark-border">
            <h3 className="text-xl font-bold text-text-primary mb-3">Delete Channel?</h3>
            <p className="text-text-secondary mb-4">
              Are you sure you want to delete "<span className="text-text-primary font-semibold">{deleteConfirm.title}</span>"?
            </p>
            <p className="text-sm text-text-muted mb-6">
              This will remove the channel from your subscriptions and clear any pending/discovered videos. Downloaded videos will remain in your library.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="btn btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteChannel(deleteConfirm.id)}
                disabled={deleteChannel.isPending}
                className="btn btn-danger flex-1"
              >
                {deleteChannel.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category Management Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-secondary rounded-lg max-w-md w-full p-6 shadow-2xl border border-dark-border">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-text-primary">Manage Categories</h3>
              <button
                onClick={() => {
                  setShowCategoryModal(false);
                  setNewCategoryName('');
                  setEditingCategory(null);
                }}
                className="text-text-muted hover:text-text-primary"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            {/* Add new category */}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!newCategoryName.trim()) return;
                try {
                  await createCategory.mutateAsync({ name: newCategoryName.trim() });
                  setNewCategoryName('');
                  showNotification('Category created', 'success');
                } catch (error) {
                  showNotification(getUserFriendlyError(error.message), 'error');
                }
              }}
              className="flex gap-2 mb-4"
            >
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="New category name..."
                className="input flex-1 text-sm py-1.5 px-3"
              />
              <button
                type="submit"
                disabled={!newCategoryName.trim() || createCategory.isPending}
                className="btn btn-primary btn-sm"
              >
                Add
              </button>
            </form>

            {/* Category list */}
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {categories?.length === 0 && (
                <p className="text-text-muted text-sm text-center py-4">No categories yet</p>
              )}
              {categories?.map(category => (
                <div key={category.id} className="flex items-center justify-between p-2 bg-dark-tertiary rounded">
                  {editingCategory?.id === category.id ? (
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (!editingCategory.name.trim()) return;
                        try {
                          await updateCategoryMutation.mutateAsync({
                            id: category.id,
                            data: { name: editingCategory.name.trim() }
                          });
                          setEditingCategory(null);
                          showNotification('Category renamed', 'success');
                        } catch (error) {
                          showNotification(getUserFriendlyError(error.message), 'error');
                        }
                      }}
                      className="flex gap-2 flex-1"
                    >
                      <input
                        type="text"
                        value={editingCategory.name}
                        onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                        className="input flex-1 text-sm py-1 px-2"
                        autoFocus
                      />
                      <button type="submit" className="text-green-500 hover:text-green-400">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingCategory(null)}
                        className="text-text-muted hover:text-text-primary"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18"></line>
                          <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                      </button>
                    </form>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-text-primary text-sm">{category.name}</span>
                        <span className="text-xs text-text-muted">({category.channel_count})</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditingCategory({ id: category.id, name: category.name })}
                          className="p-1 text-text-muted hover:text-text-primary"
                          title="Rename"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                          </svg>
                        </button>
                        <button
                          onClick={() => setDeleteCategoryConfirm(category)}
                          className="p-1 text-text-muted hover:text-red-400"
                          title="Delete"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                          </svg>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Delete Category Confirmation Modal */}
      {deleteCategoryConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] p-4">
          <div className="bg-dark-secondary rounded-lg max-w-sm w-full p-6 shadow-2xl border border-dark-border">
            <h3 className="text-lg font-bold text-text-primary mb-3">Delete Category?</h3>
            <p className="text-text-secondary mb-4 text-sm">
              Delete "<span className="text-text-primary font-semibold">{deleteCategoryConfirm.name}</span>"?
              {deleteCategoryConfirm.channel_count > 0 && (
                <span className="block mt-2 text-yellow-400">
                  {deleteCategoryConfirm.channel_count} channel{deleteCategoryConfirm.channel_count !== 1 ? 's' : ''} will become uncategorized.
                </span>
              )}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteCategoryConfirm(null)}
                className="btn btn-secondary flex-1 btn-sm"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    await deleteCategoryMutation.mutateAsync(deleteCategoryConfirm.id);
                    setDeleteCategoryConfirm(null);
                    showNotification('Category deleted', 'success');
                  } catch (error) {
                    showNotification(getUserFriendlyError(error.message), 'error');
                  }
                }}
                disabled={deleteCategoryMutation.isPending}
                className="btn btn-danger flex-1 btn-sm"
              >
                {deleteCategoryMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
