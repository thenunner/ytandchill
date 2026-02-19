import { useState, useEffect, useRef, useMemo } from 'react';
import { useChannels, useCreateChannel, useDeleteChannel, useScanChannel, useUpdateChannel, useQueue, useChannelCategories, useCreateChannelCategory, useUpdateChannelCategory, useDeleteChannelCategory, useSettings, useVideoChannelMatches } from '../api/queries';
import { useNotification } from '../contexts/NotificationContext';
import { useCardSize } from '../contexts/PreferencesContext';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getUserFriendlyError, getGridClass, getTextSizes, getEffectiveCardSize, getNumericSetting, formatChannelScanTime, formatChannelVideoDate, formatChannelLastScan, formatFullDateTime } from '../utils/utils';
import { useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { StickyBar, SortDropdown, SelectionBar, EditButton, ActionDropdown, CollapsibleSearch } from '../components/stickybar';
import { LoadingSpinner, Pagination, LoadMore, EmptyState } from '../components/ListFeedback';
import { useGridColumns } from '../hooks/useGridColumns';
import { SORT_OPTIONS } from '../utils/stickyBarOptions';
import { DurationSettingsModal, CategoryManagementModal, SingleCategoryModal } from '../components/ui/DiscoverModals';
import { ConfirmModal } from '../components/ui/SharedModals';
import { SINGLES_CHANNEL_ID } from '../constants';

export default function Discover() {
  const { data: channels, isLoading } = useChannels();
  const { data: queueData } = useQueue();
  const { data: categories } = useChannelCategories();
  const { data: settings } = useSettings();
  const createChannel = useCreateChannel();
  const deleteChannel = useDeleteChannel();
  const scanChannel = useScanChannel();
  const updateChannel = useUpdateChannel();
  const createCategory = useCreateChannelCategory();
  const updateCategoryMutation = useUpdateChannelCategory();
  const deleteCategoryMutation = useDeleteChannelCategory();
  const { showNotification } = useNotification();
  const { cardSize, setCardSize } = useCardSize('channels');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const gridColumns = useGridColumns(cardSize, 'channels');

  const [showAddForm, setShowAddForm] = useState(false);
  const [newChannelUrl, setNewChannelUrl] = useState('');
  const [minMinutes, setMinMinutes] = useState(0);
  const [maxMinutes, setMaxMinutes] = useState(0);
  const [editingChannel, setEditingChannel] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [menuOpen, setMenuOpen] = useState(null); // Track which channel's menu is open (grid view only)
  const [showDurationSettings, setShowDurationSettings] = useState(null); // Track which channel shows duration settings
  const [searchInput, setSearchInput] = useState(''); // Search filter
  const [debouncedSearch, setDebouncedSearch] = useState(''); // Debounced for video search API
  const [sortBy, setSortBy] = useState(localStorage.getItem('channels_sortBy') || 'title-asc'); // Sort option
  const [selectedChannels, setSelectedChannels] = useState([]); // Selected channels for batch operations
  const [editMode, setEditMode] = useState(false); // Edit mode for bulk selection
  const [showChannelInfo, setShowChannelInfo] = useState(null); // Track which channel shows info modal

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

  // Single channel category/duration modal (from 3-dot menu)
  const [showSingleCategoryModal, setShowSingleCategoryModal] = useState(null);
  const [showDurationModal, setShowDurationModal] = useState(null);

  // Track which scan type was last initiated ('new' or 'all')
  const [lastScanType, setLastScanType] = useState(null);

  // Pagination state - Initialize page from URL (preserves position on back navigation)
  const initialPage = parseInt(searchParams.get('page'), 10) || 1;
  const [currentPageState, setCurrentPageState] = useState(initialPage);
  const [loadedPages, setLoadedPages] = useState(1); // For mobile infinite scroll
  const itemsPerPage = getNumericSetting(settings, 'items_per_page', 50);
  const isMobile = window.innerWidth < 640;

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

      // Clear scan type tracking
      setLastScanType(null);
    }

    prevOperationTypeRef.current = currentOperation?.type;
  }, [currentOperation?.type, queryClient]);

  // Check for new discoveries flag and auto-sort to most_to_review
  useEffect(() => {
    const checkDiscoveriesFlag = async () => {
      try {
        const response = await fetch('/api/settings/discoveries-flag', { credentials: 'include' });
        const data = await response.json();

        if (data.new_discoveries) {
          // Override sort to most_to_review regardless of stored preference
          setSortBy('most_to_review');
          localStorage.setItem('channels_sortBy', 'most_to_review');

          // Clear the flag so it doesn't trigger again
          await fetch('/api/settings/discoveries-flag', { method: 'DELETE', credentials: 'include' });
        }
      } catch (error) {
        console.error('Error checking discoveries flag:', error);
      }
    };

    checkDiscoveriesFlag();
  }, []); // Run only once on component mount

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
      showNotification(getUserFriendlyError(error.message, 'add channel'), 'error');
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
      showNotification(getUserFriendlyError(error.message, 'scan channel'), 'error');
    }
  };

  const handleDeleteChannel = async (channelId) => {
    try {
      await deleteChannel.mutateAsync(channelId);
      showNotification('Channel deleted', 'success');
      setDeleteConfirm(null);
    } catch (error) {
      showNotification(getUserFriendlyError(error.message, 'delete channel'), 'error');
    }
  };

  const handleBulkDeleteChannels = async () => {
    if (selectedChannels.length === 0) return;

    const count = selectedChannels.length;
    let successCount = 0;
    let errorCount = 0;

    for (const channelId of selectedChannels) {
      try {
        await deleteChannel.mutateAsync(channelId);
        successCount++;
      } catch (error) {
        console.error(`Failed to delete channel ${channelId}:`, error);
        errorCount++;
      }
    }

    if (errorCount === 0) {
      showNotification(`${successCount} channel${successCount > 1 ? 's' : ''} deleted`, 'success');
    } else {
      showNotification(`${successCount} deleted, ${errorCount} failed`, 'warning');
    }

    setSelectedChannels([]);
    setDeleteConfirm(null);
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
      showNotification(getUserFriendlyError(error.message, 'update filters'), 'error');
    }
  };

  const handleScanAllChannels = async (forceFull = false) => {
    if (!channels || channels.length === 0) {
      showNotification('No channels to scan', 'info');
      return;
    }

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

    // Track which scan type was initiated
    setLastScanType(forceFull ? 'all' : 'new');

    // Use selected channels if any, otherwise scan all (excluding Singles pseudo-channel)
    const channelsToScan = selectedChannels.length > 0
      ? channels.filter(c => selectedChannels.includes(c.id))
      : channels.filter(c => c.yt_id !== SINGLES_CHANNEL_ID);

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
    // The actual scan progress will show in the toast notification
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

      // Close category filter if clicking outside (but not on the Category button itself)
      if (categoryFilterRef.current && !categoryFilterRef.current.contains(event.target)) {
        // Check if clicking on the Category button in SelectionBar
        const isCategoryButton = event.target.closest('[data-category-trigger]');
        if (!isCategoryButton) {
          setShowCategoryFilter(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Persist sortBy to localStorage
  useEffect(() => {
    localStorage.setItem('channels_sortBy', sortBy);
  }, [sortBy]);

  // Persist category filter to localStorage
  useEffect(() => {
    localStorage.setItem('channels_categoryFilter', JSON.stringify(selectedCategories));
  }, [selectedCategories]);

  // Debounce search input for video search API calls (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Video title search — returns channels with matching videos
  const { data: videoMatches, isFetching: isSearchingVideos } = useVideoChannelMatches(debouncedSearch);

  // Build a map of channel_id -> match_count from video search results
  const videoMatchMap = useMemo(() => {
    if (!videoMatches) return {};
    const map = {};
    for (const match of videoMatches) {
      map[match.channel_id] = match.match_count;
    }
    return map;
  }, [videoMatches]);

  // Filter and sort channels (memoized for performance)
  const filteredAndSortedChannels = useMemo(() => {
    // Filter by search: match channel title (client-side) OR video matches (server-side)
    let filtered = channels?.filter(channel => {
      if (channel.yt_id === SINGLES_CHANNEL_ID) return false;
      if (!searchInput) return true;
      // Match by channel title (instant, client-side)
      if ((channel.title || '').toLowerCase().includes(searchInput.toLowerCase())) return true;
      // Match by video titles (debounced, server-side)
      if (videoMatchMap[channel.id]) return true;
      return false;
    }) || [];

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

    // Sort: needs_review channels always float to top, then apply selected sort
    const sorted = [...filtered].sort((a, b) => {
      // First: channels with videos to review float to top
      const aHasReview = (a.video_count || 0) > 0 ? 1 : 0;
      const bHasReview = (b.video_count || 0) > 0 ? 1 : 0;
      if (aHasReview !== bHasReview) {
        return bHasReview - aHasReview; // Channels needing review first
      }

      // Second: apply selected sort within each group
      switch (sortBy) {
        case 'title-asc':
          return (a.title || '').localeCompare(b.title || '');
        case 'title-desc':
          return (b.title || '').localeCompare(a.title || '');
        case 'scan-desc':
          return new Date(b.last_scan_at || 0) - new Date(a.last_scan_at || 0);
        case 'scan-asc':
          return new Date(a.last_scan_at || 0) - new Date(b.last_scan_at || 0);
        case 'count-desc':
          return (b.downloaded_count || 0) - (a.downloaded_count || 0);
        case 'count-asc':
          return (a.downloaded_count || 0) - (b.downloaded_count || 0);
        default:
          return 0;
      }
    });

    return sorted;
  }, [channels, searchInput, selectedCategories, sortBy, videoMatchMap]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
    setLoadedPages(1);
  }, [searchInput, sortBy, selectedCategories]);

  // Paginate channels (mobile: infinite scroll, desktop: pagination)
  const paginatedChannels = useMemo(() => {
    if (isMobile) {
      // Mobile: show loadedPages worth of items
      return filteredAndSortedChannels.slice(0, loadedPages * itemsPerPage);
    }
    // Desktop: standard pagination
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredAndSortedChannels.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredAndSortedChannels, currentPage, itemsPerPage, loadedPages, isMobile]);

  return (
    <div className="space-y-2 animate-fade-in">
      <StickyBar>
        {/* Single row on all screen sizes */}
        <div className="flex items-center gap-2">
          {/* Left: Add + Scan + Edit */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            {/* Add Dropdown - Primary */}
            <ActionDropdown
              label="Add"
              variant="primary"
              items={[
                {
                  label: 'Follow Channel',
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                      <circle cx="8.5" cy="7" r="4" />
                      <line x1="20" y1="8" x2="20" y2="14" />
                      <line x1="23" y1="11" x2="17" y2="11" />
                    </svg>
                  ),
                  onClick: () => setShowAddForm(true),
                },
                { divider: true },
                {
                  label: 'Add Once',
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="23 7 16 12 23 17 23 7" />
                      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                    </svg>
                  ),
                  onClick: () => navigate('/videos'),
                },
                {
                  label: 'Import Existing',
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  ),
                  onClick: () => navigate('/import'),
                },
              ]}
            />

            {/* Scan Dropdown - Secondary */}
            <ActionDropdown
              label={isScanRunning ? 'Scanning...' : 'Scan'}
              variant="secondary"
              disabled={!channels || channels.length === 0 || isScanRunning}
              items={[
                {
                  label: selectedChannels.length > 0 ? 'Scan Selected (New)' : 'Scan New Videos',
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="23 4 23 10 17 10" />
                      <path d="M20.49 15a9 9 0 01-2.12 3.36 9 9 0 01-11.58 1.47A9 9 0 013 12a9 9 0 011.79-5.37A9 9 0 0112 3a9 9 0 018.5 6.5L23 10" />
                    </svg>
                  ),
                  onClick: () => handleScanAllChannels(false),
                },
                {
                  label: selectedChannels.length > 0 ? 'Scan Selected (All)' : 'Scan All Videos',
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="23 4 23 10 17 10" />
                      <polyline points="1 20 1 14 7 14" />
                      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                    </svg>
                  ),
                  onClick: () => handleScanAllChannels(true),
                },
              ]}
            />

            {/* Edit Button */}
            <EditButton
              active={editMode}
              onToggle={() => {
                setEditMode(!editMode);
                setSelectedChannels([]);
              }}
            />
          </div>

          {/* Center: Search (desktop only, fills available space) */}
          <div className="hidden sm:block flex-1 max-w-md mx-4">
            <CollapsibleSearch
              value={searchInput}
              onChange={setSearchInput}
              placeholder="Search channels..."
              alwaysExpanded
            />
          </div>

          {/* Right: Mobile (Sort + Search) / Desktop (Sort + Pagination) */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 ml-auto">
            {/* Mobile: Sort + Search */}
            <div className="sm:hidden flex items-center gap-1">
              <SortDropdown
                value={sortBy}
                onChange={(value) => {
                  setSortBy(value);
                  localStorage.setItem('channels_sortBy', value);
                }}
                options={SORT_OPTIONS.channels}
              />
              <CollapsibleSearch
                value={searchInput}
                onChange={setSearchInput}
                placeholder="Search channels..."
              />
            </div>

            {/* Desktop: Sort + Pagination */}
            <div className="hidden sm:block">
              <SortDropdown
                value={sortBy}
                onChange={(value) => {
                  setSortBy(value);
                  localStorage.setItem('channels_sortBy', value);
                }}
                options={SORT_OPTIONS.channels}
              />
            </div>
            <div className="hidden sm:block">
              <Pagination
                currentPage={currentPage}
                totalItems={filteredAndSortedChannels.length}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
              />
            </div>
          </div>
        </div>
      </StickyBar>

      {/* Floating Selection Bar for Edit Mode */}
      <SelectionBar
        show={editMode && filteredAndSortedChannels.length > 0}
        selectedCount={selectedChannels.length}
        totalCount={filteredAndSortedChannels.length}
        onSelectAll={() => setSelectedChannels(filteredAndSortedChannels.map(c => c.id))}
        onClear={() => setSelectedChannels([])}
        onDone={() => {
          setEditMode(false);
          setSelectedChannels([]);
        }}
        actions={[
          ...(selectedChannels.length > 0 ? [{
            label: 'Category',
            onClick: () => setShowCategoryFilter(prev => !prev),
            variant: 'default',
            dataAttrs: { 'data-category-trigger': true }
          }] : []),
          ...(selectedChannels.length > 0 ? [{
            label: 'Delete',
            onClick: () => setDeleteConfirm({ bulk: true, count: selectedChannels.length }),
            variant: 'danger'
          }] : [])
        ]}
      />

      {/* Category Assign Modal - Glass Minimal Style (triggered from SelectionBar) */}
      {showCategoryFilter && (
        <div
          ref={categoryFilterRef}
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4 sm:p-4"
          onClick={() => setShowCategoryFilter(false)}
        >
          {/* Desktop - Glass Modal */}
          <div
            className="hidden sm:block backdrop-blur-xl bg-dark-secondary border border-white/10 rounded-2xl max-w-sm w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-medium text-text-primary">Assign to Category</h3>
                <button
                  onClick={() => setShowCategoryFilter(false)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-text-muted hover:text-text-primary transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Category options */}
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {/* Uncategorized option */}
                <button
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors text-left"
                  onClick={async () => {
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
                  }}
                >
                  <span className="text-sm text-text-muted italic">Uncategorized</span>
                </button>

                {/* Category list */}
                {categories?.map(category => (
                  <button
                    key={category.id}
                    className="flex items-center justify-between w-full px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors text-left"
                    onClick={async () => {
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

                      queryClient.invalidateQueries(['channel-categories']);
                      setSelectedChannels([]);
                      setShowCategoryFilter(false);
                    }}
                  >
                    <span className="text-sm text-text-primary">{category.name}</span>
                    <span className="text-xs px-1.5 py-0.5 bg-white/10 rounded text-text-muted">{category.channel_count}</span>
                  </button>
                ))}
              </div>

              {/* Manage Categories */}
              <div className="border-t border-white/10 mt-4 pt-3">
                <button
                  onClick={() => {
                    setShowCategoryFilter(false);
                    setShowCategoryModal(true);
                  }}
                  className="w-full text-center text-sm text-accent hover:text-accent/80 transition-colors"
                >
                  Manage Categories...
                </button>
              </div>
            </div>
          </div>

          {/* Mobile - Bottom Sheet */}
          <div
            className="sm:hidden fixed inset-x-0 bottom-0 backdrop-blur-xl bg-dark-secondary rounded-t-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mt-3" />
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <h3 className="font-semibold text-text-primary">Assign to Category</h3>
              <button
                onClick={() => setShowCategoryFilter(false)}
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"
              >
                <svg className="w-4 h-4 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-4 max-h-72 overflow-y-auto">
              {/* Uncategorized option */}
              <button
                className="flex items-center w-full px-4 py-3.5 rounded-xl hover:bg-white/5 active:bg-white/10 transition-colors text-left"
                onClick={async () => {
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
                }}
              >
                <span className="text-base text-text-muted italic">Uncategorized</span>
              </button>

              {/* Category list */}
              {categories?.map(category => (
                <button
                  key={category.id}
                  className="flex items-center justify-between w-full px-4 py-3.5 rounded-xl hover:bg-white/5 active:bg-white/10 transition-colors text-left"
                  onClick={async () => {
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

                    queryClient.invalidateQueries(['channel-categories']);
                    setSelectedChannels([]);
                    setShowCategoryFilter(false);
                  }}
                >
                  <span className="text-base text-text-primary">{category.name}</span>
                  <span className="text-xs px-2 py-1 bg-white/10 rounded-lg text-text-muted">{category.channel_count}</span>
                </button>
              ))}
            </div>

            {/* Manage Categories */}
            <div className="px-4 pb-6 pt-2">
              <button
                onClick={() => {
                  setShowCategoryFilter(false);
                  setShowCategoryModal(true);
                }}
                className="w-full py-3.5 rounded-xl bg-white/5 text-accent font-medium"
              >
                Manage Categories...
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddForm && (
        <div className="card p-4 animate-slide-down max-w-2xl mx-auto">
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
                <div className="flex items-center gap-1 mb-1">
                  <label className="text-xs font-semibold text-text-secondary">Min (min)</label>
                  <button
                    type="button"
                    className="text-text-secondary hover:text-text-primary transition-colors"
                    title="Minimum video duration in minutes. Only videos longer than this will be found. Use 0 for no minimum."
                  >
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
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
                <div className="flex items-center gap-1 mb-1">
                  <label className="text-xs font-semibold text-text-secondary">Max (min)</label>
                  <button
                    type="button"
                    className="text-text-secondary hover:text-text-primary transition-colors"
                    title="Maximum video duration in minutes. Only videos shorter than this will be found. Use 0 for no maximum."
                  >
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
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

      {/* Channels Grid */}
      {(() => {
        const effectiveCardSize = getEffectiveCardSize(cardSize, paginatedChannels.length);
        const textSizes = getTextSizes(effectiveCardSize);
        return (
        <div className={`grid ${getGridClass(gridColumns, paginatedChannels.length)} gap-4 w-full [&>*]:min-w-0`}>
          {paginatedChannels.map(channel => (
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
                    className="w-full px-4 py-2 text-left text-sm hover:bg-dark-hover transition-colors"
                    title="Toggle automatic downloading of new videos from this channel"
                  >
                    <span className={`font-medium ${channel.auto_download ? 'text-green-400' : 'text-red-400'}`}>
                      Auto-Download
                    </span>
                  </button>

                  {/* Duration Settings - opens modal */}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setEditingChannel(channel);
                      setShowDurationModal(channel);
                      setMenuOpen(null);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-dark-hover transition-colors"
                  >
                    <span className="font-medium">Duration Settings</span>
                  </button>

                  {/* Set Category - opens modal */}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowSingleCategoryModal(channel);
                      setMenuOpen(null);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-dark-hover transition-colors"
                  >
                    <span className="font-medium">Set Category</span>
                  </button>

                  {/* Channel Info */}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowChannelInfo(channel);
                      setMenuOpen(null);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-dark-hover transition-colors"
                  >
                    <span className="font-medium">Channel Info</span>
                  </button>

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
              className="relative overflow-hidden cursor-pointer transition-all rounded-xl group"
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
              {/* Upper Left: To Review Badge (only if > 0) */}
              {(channel.video_count || 0) > 0 && (
                <div className="absolute top-0 left-0 bg-accent text-white font-bold text-sm px-2 py-1 rounded-tl-xl rounded-br-lg leading-none z-20">
                  {channel.video_count}
                </div>
              )}

              {/* Checkmark overlay when selected in edit mode */}
              {editMode && selectedChannels.includes(channel.id) && (
                <div className="absolute top-2 right-2 bg-black/80 text-white rounded-full p-1.5 shadow-lg z-20">
                  <svg className="w-4 h-4 text-accent-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </div>
              )}

              <Link
                to={searchInput && videoMatchMap[channel.id]
                  ? `/discover/${channel.id}?videoSearch=${encodeURIComponent(searchInput)}`
                  : `/discover/${channel.id}`
                }
                className="block"
                onClick={(e) => {
                  if (editMode) {
                    e.preventDefault();
                  }
                }}
              >
                {/* Channel Thumbnail - YT style */}
                <div className={`relative w-full aspect-video bg-dark-tertiary overflow-hidden transition-all rounded-t-xl rounded-b-xl group-hover:rounded-b-none ${
                  (channel.video_count || 0) > 0 ? 'border-4 border-accent' : ''
                }`}>
                  {channel.thumbnail ? (
                    <img
                      src={channel.thumbnail}
                      alt={channel.title}
                      className="absolute inset-0 w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg className="w-10 h-10 text-text-muted" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                      </svg>
                    </div>
                  )}

                  {/* Lower Left: AUTO Badge - Attached to border like upper badges */}
                  {channel.auto_download && (
                    <div className="absolute bottom-0 left-0 bg-green-500 text-white font-bold text-xs px-1.5 py-0.5 rounded-bl-xl group-hover:rounded-bl-none rounded-tr-lg z-10">
                      AUTO
                    </div>
                  )}

                  {/* Lower Right: Last Scan Time */}
                  <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-1 rounded z-10">
                    {formatChannelScanTime(channel.last_scan_time) || 'Never'}
                  </div>
                </div>

                {/* Content Section */}
                <div className={`p-3 rounded-b-xl transition-colors ${editMode && selectedChannels.includes(channel.id) ? 'bg-dark-tertiary' : 'group-hover:bg-dark-tertiary'}`}>
                  {/* Title + 3-dot menu */}
                  <div className="flex items-start justify-between gap-2">
                    <h3 className={`${textSizes.title} font-semibold text-text-primary line-clamp-2 leading-tight flex-1 min-w-0`} title={channel.title}>
                      {channel.title}
                    </h3>

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
                          aria-label="Channel options"
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
                  {searchInput && videoMatchMap[channel.id] && (
                    <p className="text-xs text-accent mt-1 truncate">
                      {videoMatchMap[channel.id]} video{videoMatchMap[channel.id] !== 1 ? 's' : ''} match '{searchInput}'
                    </p>
                  )}
                </div>
              </Link>

            </div>
          </div>
          ))}
        </div>
        );
      })()}

      {/* Load More - mobile only */}
      {isMobile && filteredAndSortedChannels.length > 0 && (
        <LoadMore
          currentCount={paginatedChannels.length}
          totalCount={filteredAndSortedChannels.length}
          onLoadMore={() => setLoadedPages(prev => prev + 1)}
        />
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : filteredAndSortedChannels.length === 0 ? (
        searchInput ? (
          <EmptyState
            icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />}
            title="No matching channels"
            message={isSearchingVideos ? "Searching videos..." : "No channels or videos match your search"}
          />
        ) : (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <svg className="w-20 h-20 text-text-muted mb-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <h3 className="text-xl font-semibold text-text-primary mb-2">No channels yet</h3>
            <p className="text-text-secondary mb-6 text-center max-w-md">
              Subscribe to YT channels to monitor them for new videos
            </p>
            <button
              onClick={() => setShowAddForm(true)}
              className="btn btn-primary text-lg px-8 py-3 flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add your first channel
            </button>
          </div>
        )
      ) : null}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deleteConfirm}
        title={deleteConfirm?.bulk ? `Delete ${deleteConfirm.count} Channel${deleteConfirm.count > 1 ? 's' : ''}?` : 'Delete Channel?'}
        message={
          <>
            <p className="mb-3">
              {deleteConfirm?.bulk
                ? `Are you sure you want to delete ${deleteConfirm.count} selected channel${deleteConfirm.count > 1 ? 's' : ''}?`
                : <>Are you sure you want to delete "<span className="font-semibold text-text-primary">{deleteConfirm?.title}</span>"?</>
              }
            </p>
            <p className="text-xs text-text-muted">
              This will remove the channel{deleteConfirm?.bulk && deleteConfirm.count > 1 ? 's' : ''} from your subscriptions and clear any pending/discovered videos. Downloaded videos will remain in your library.
            </p>
          </>
        }
        confirmText={deleteChannel.isPending ? 'Deleting...' : 'Delete'}
        onConfirm={() => deleteConfirm.bulk ? handleBulkDeleteChannels() : handleDeleteChannel(deleteConfirm.id)}
        onCancel={() => setDeleteConfirm(null)}
        isLoading={deleteChannel.isPending}
      />

      {/* Channel Info Modal - Glass Minimal Style */}
      {showChannelInfo && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 sm:p-4"
          onClick={() => setShowChannelInfo(null)}
        >
          {/* Desktop: centered modal */}
          <div
            className="hidden sm:block backdrop-blur-xl bg-dark-secondary border border-white/10 rounded-2xl max-w-sm w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-medium text-text-primary">Channel Info</h3>
                <button
                  onClick={() => setShowChannelInfo(null)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-text-muted hover:text-text-primary transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-text-muted text-xs mb-0.5">YT ID</p>
                  <p className="text-text-primary font-mono text-xs">{showChannelInfo.yt_id}</p>
                </div>
                <div>
                  <p className="text-text-muted text-xs mb-0.5">Title</p>
                  <p className="text-text-primary">{showChannelInfo.title}</p>
                </div>
                <div>
                  <p className="text-text-muted text-xs mb-0.5">Thumbnail</p>
                  <p className="text-text-secondary text-xs truncate" title={showChannelInfo.thumbnail || '-'}>
                    {showChannelInfo.thumbnail || '-'}
                  </p>
                </div>
                <div>
                  <p className="text-text-muted text-xs mb-0.5">Folder</p>
                  <p className="text-text-primary">{showChannelInfo.folder_name}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-text-muted text-xs mb-0.5">Last Scan</p>
                    <p className="text-text-primary">
                      {showChannelInfo.last_scan_at ? formatFullDateTime(showChannelInfo.last_scan_at).split(',')[0] : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-text-muted text-xs mb-0.5">Created</p>
                    <p className="text-text-primary">
                      {showChannelInfo.created_at ? formatFullDateTime(showChannelInfo.created_at).split(',')[0] : '-'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Mobile: Bottom Sheet */}
          <div
            className="sm:hidden fixed inset-x-0 bottom-0 backdrop-blur-xl bg-dark-secondary rounded-t-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mt-3" />
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <h3 className="font-semibold text-text-primary">Channel Info</h3>
              <button
                onClick={() => setShowChannelInfo(null)}
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"
              >
                <svg className="w-4 h-4 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <p className="text-text-muted text-xs mb-1">YT ID</p>
                <p className="text-sm font-mono text-text-primary">{showChannelInfo.yt_id}</p>
              </div>
              <div>
                <p className="text-text-muted text-xs mb-1">Title</p>
                <p className="text-sm text-text-primary">{showChannelInfo.title}</p>
              </div>
              <div>
                <p className="text-text-muted text-xs mb-1">Thumbnail</p>
                <p className="text-text-secondary text-xs break-all">{showChannelInfo.thumbnail || '-'}</p>
              </div>
              <div>
                <p className="text-text-muted text-xs mb-1">Folder</p>
                <p className="text-sm text-text-primary">{showChannelInfo.folder_name}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-text-muted text-xs mb-1">Last Scan</p>
                  <p className="text-sm text-text-primary">
                    {showChannelInfo.last_scan_at ? formatFullDateTime(showChannelInfo.last_scan_at).split(',')[0] : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-text-muted text-xs mb-1">Created</p>
                  <p className="text-sm text-text-primary">
                    {showChannelInfo.created_at ? formatFullDateTime(showChannelInfo.created_at).split(',')[0] : '-'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Category Management Modal */}
      <CategoryManagementModal
        isOpen={showCategoryModal}
        onClose={() => {
          setShowCategoryModal(false);
          setNewCategoryName('');
          setEditingCategory(null);
        }}
        categories={categories}
        onCreateCategory={async (name) => {
          try {
            await createCategory.mutateAsync({ name });
            showNotification('Category created', 'success');
          } catch (error) {
            showNotification(getUserFriendlyError(error.message, 'create category'), 'error');
          }
        }}
        onUpdateCategory={async (id, name) => {
          try {
            await updateCategoryMutation.mutateAsync({ id, data: { name } });
            showNotification('Category renamed', 'success');
          } catch (error) {
            showNotification(getUserFriendlyError(error.message, 'rename category'), 'error');
          }
        }}
        onDeleteCategory={async (id) => {
          try {
            await deleteCategoryMutation.mutateAsync(id);
            showNotification('Category deleted', 'success');
          } catch (error) {
            showNotification(getUserFriendlyError(error.message, 'delete category'), 'error');
          }
        }}
        isCreating={createCategory.isPending}
        isUpdating={updateCategoryMutation.isPending}
      />

      {/* Duration Settings Modal */}
      <DurationSettingsModal
        channel={showDurationModal}
        onSave={(updatedChannel) => {
          handleUpdateFilters(updatedChannel);
          setShowDurationModal(null);
        }}
        onClose={() => setShowDurationModal(null)}
      />

      {/* Single Channel Category Modal */}
      <SingleCategoryModal
        isOpen={!!showSingleCategoryModal}
        onClose={() => setShowSingleCategoryModal(null)}
        channel={showSingleCategoryModal}
        categories={categories}
        onSelectCategory={(categoryId) => {
          const categoryName = categoryId
            ? categories?.find(c => c.id === categoryId)?.name
            : 'Uncategorized';
          updateChannel.mutate({
            id: showSingleCategoryModal.id,
            data: { category_id: categoryId }
          }, {
            onSuccess: () => {
              showNotification(`${showSingleCategoryModal.title} ${categoryId ? 'moved to' : 'set to'} ${categoryName}`, 'success');
              setShowSingleCategoryModal(null);
            }
          });
        }}
        onManageCategories={() => {
          setShowSingleCategoryModal(null);
          setShowCategoryModal(true);
        }}
      />
    </div>
  );
}
