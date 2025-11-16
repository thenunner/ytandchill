import { useState, useEffect, useRef } from 'react';
import { useChannels, useCreateChannel, useDeleteChannel, useScanChannel, useUpdateChannel } from '../api/queries';
import { useNotification } from '../contexts/NotificationContext';
import { Link, useNavigate } from 'react-router-dom';
import ChannelRow from '../components/ChannelRow';

export default function Channels() {
  const { data: channels, isLoading } = useChannels();
  const createChannel = useCreateChannel();
  const deleteChannel = useDeleteChannel();
  const scanChannel = useScanChannel();
  const updateChannel = useUpdateChannel();
  const { showNotification } = useNotification();
  const navigate = useNavigate();

  const [showAddForm, setShowAddForm] = useState(false);
  const [newChannelUrl, setNewChannelUrl] = useState('');
  const [minMinutes, setMinMinutes] = useState(0);
  const [maxMinutes, setMaxMinutes] = useState(0);
  const [editingChannel, setEditingChannel] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [menuOpen, setMenuOpen] = useState(null); // Track which channel's menu is open (grid view only)
  const [showDurationSettings, setShowDurationSettings] = useState(null); // Track which channel shows duration settings
  const [searchInput, setSearchInput] = useState(''); // Search filter
  const [sortBy, setSortBy] = useState(localStorage.getItem('channels_sortBy') || 'most_downloaded'); // Sort option
  const [showSortMenu, setShowSortMenu] = useState(false); // Sort menu visibility
  const [isScanningAll, setIsScanningAll] = useState(false); // Scan all progress
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 }); // X/Y progress
  const [viewMode, setViewMode] = useState(localStorage.getItem('channelsViewMode') || 'grid'); // Grid or list view
  const sortMenuRef = useRef(null);

  const handleAddChannel = async (e) => {
    e.preventDefault();
    try {
      const result = await createChannel.mutateAsync({
        url: newChannelUrl,
        min_minutes: minMinutes,
        max_minutes: maxMinutes,
      });
      setNewChannelUrl('');
      setMinMinutes(0);
      setMaxMinutes(0);
      setShowAddForm(false);

      // Show scan results from auto-scan
      if (result.scan_result) {
        showNotification(
          `Channel added! Found ${result.scan_result.new_videos} new videos, ${result.scan_result.ignored_videos} ignored`,
          'success'
        );
      } else {
        showNotification('Channel added successfully', 'success');
      }
    } catch (error) {
      showNotification(error.message, 'error');
    }
  };

  const handleScanChannel = async (channelId, forceFull = false) => {
    try {
      const scanType = forceFull ? 'Rescanning all videos' : 'Scanning for new videos';
      showNotification(scanType, 'info', { persistent: true });

      const result = await scanChannel.mutateAsync({ id: channelId, forceFull });
      showNotification(`Found ${result.new_videos} new videos, ${result.ignored_videos} ignored`, 'success');

      // Navigate to channel page after scan
      navigate(`/channel/${channelId}`);
    } catch (error) {
      showNotification(error.message, 'error');
    }
  };

  const handleDeleteChannel = async (channelId) => {
    try {
      showNotification(`Deleting channel...`, 'info', { persistent: true });
      await deleteChannel.mutateAsync(channelId);
      showNotification('Channel deleted', 'success');
      setDeleteConfirm(null);
    } catch (error) {
      showNotification(error.message, 'error');
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
      showNotification(error.message, 'error');
    }
  };

  const handleScanAllChannels = async () => {
    if (!channels || channels.length === 0) {
      showNotification('No channels to scan', 'info');
      return;
    }

    setIsScanningAll(true);
    setScanProgress({ current: 0, total: channels.length });
    showNotification(`Starting scan of ${channels.length} channels...`, 'info', { persistent: true });

    let totalNew = 0;
    let totalIgnored = 0;
    let errorCount = 0;

    for (let i = 0; i < channels.length; i++) {
      const channel = channels[i];
      setScanProgress({ current: i + 1, total: channels.length });

      // Format last video date
      let lastVideoText = '';
      if (channel.last_video_date) {
        const date = new Date(channel.last_video_date.slice(0, 4),
                               parseInt(channel.last_video_date.slice(4, 6)) - 1,
                               channel.last_video_date.slice(6, 8));
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        lastVideoText = ` from ${month}/${day}`;
      }

      showNotification(
        `Scanning "${channel.title}"${lastVideoText} (${i + 1}/${channels.length})`,
        'info',
        { persistent: true }
      );

      try {
        const result = await scanChannel.mutateAsync({
          id: channel.id,
          forceFull: false
        });
        totalNew += result.new_videos || 0;
        totalIgnored += result.ignored_videos || 0;
      } catch (error) {
        console.error(`Failed to scan channel ${channel.title}:`, error);
        errorCount++;
      }
    }

    setIsScanningAll(false);
    setScanProgress({ current: 0, total: 0 });

    const message = errorCount > 0
      ? `Scan complete: ${totalNew} new, ${totalIgnored} ignored (${errorCount} errors)`
      : `Scan complete: ${totalNew} new videos, ${totalIgnored} ignored`;

    showNotification(message, errorCount > 0 ? 'warning' : 'success');
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
      }

      // Close sort menu if clicking outside
      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target)) {
        setShowSortMenu(false);
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

  // Helper function to format last scan date
  const formatLastScan = (dateString) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = now - date;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      // Format as Mon DD (e.g., "Nov 14")
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  // Filter and sort channels
  const filteredAndSortedChannels = (() => {
    // First filter by search
    const filtered = channels?.filter(channel =>
      (channel.title || '').toLowerCase().includes(searchInput.toLowerCase())
    ) || [];

    // Then sort based on selected option
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'a_z':
          return (a.title || '').localeCompare(b.title || '');
        case 'z_a':
          return (b.title || '').localeCompare(a.title || '');
        case 'most_downloaded':
          return (b.downloaded_count || 0) - (a.downloaded_count || 0);
        case 'least_downloaded':
          return (a.downloaded_count || 0) - (b.downloaded_count || 0);
        case 'most_to_review':
          return (b.discovered_count || 0) - (a.discovered_count || 0);
        case 'least_to_review':
          return (a.discovered_count || 0) - (b.discovered_count || 0);
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
      <div className="sticky top-[100px] z-40 bg-dark-primary/95 backdrop-blur-lg md:-mx-4 md:px-4 py-4 mb-4">
        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="w-8 h-8 p-0 flex items-center justify-center bg-dark-hover hover:bg-dark-tertiary border border-dark-border-light rounded text-text-primary transition-colors"
            title={showAddForm ? 'Cancel' : 'Add Channel'}
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
              <div className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-56 bg-dark-secondary border border-dark-border rounded-lg shadow-xl py-2 z-50">
                <div className="px-3 py-2 text-xs font-semibold text-text-secondary uppercase">Sort By</div>

                {/* A-Z / Z-A */}
                <div className="px-4 py-2 hover:bg-dark-hover transition-colors">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex gap-4">
                      <button
                        onClick={() => { setSortBy('a_z'); setShowSortMenu(false); }}
                        className={`${sortBy === 'a_z' ? 'text-green-500' : 'text-text-primary hover:text-green-500'}`}
                      >
                        A-Z
                      </button>
                      <button
                        onClick={() => { setSortBy('z_a'); setShowSortMenu(false); }}
                        className={`${sortBy === 'z_a' ? 'text-green-500' : 'text-text-primary hover:text-green-500'}`}
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
                        className={`p-1 rounded ${sortBy === 'most_downloaded' ? 'text-green-500' : 'text-text-muted hover:text-text-primary'}`}
                        title="Most Downloaded"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                          <path d="M12 5v14M5 12l7-7 7 7"></path>
                        </svg>
                      </button>
                      <button
                        onClick={() => { setSortBy('least_downloaded'); setShowSortMenu(false); }}
                        className={`p-1 rounded ${sortBy === 'least_downloaded' ? 'text-green-500' : 'text-text-muted hover:text-text-primary'}`}
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
                        className={`p-1 rounded ${sortBy === 'most_to_review' ? 'text-green-500' : 'text-text-muted hover:text-text-primary'}`}
                        title="Most To Review"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                          <path d="M12 5v14M5 12l7-7 7 7"></path>
                        </svg>
                      </button>
                      <button
                        onClick={() => { setSortBy('least_to_review'); setShowSortMenu(false); }}
                        className={`p-1 rounded ${sortBy === 'least_to_review' ? 'text-green-500' : 'text-text-muted hover:text-text-primary'}`}
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
                        className={`p-1 rounded ${sortBy === 'newest_scanned' ? 'text-green-500' : 'text-text-muted hover:text-text-primary'}`}
                        title="Newest Scanned"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                          <path d="M12 5v14M5 12l7-7 7 7"></path>
                        </svg>
                      </button>
                      <button
                        onClick={() => { setSortBy('oldest_scanned'); setShowSortMenu(false); }}
                        className={`p-1 rounded ${sortBy === 'oldest_scanned' ? 'text-green-500' : 'text-text-muted hover:text-text-primary'}`}
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

          {/* Scan All Button */}
          <button
            onClick={handleScanAllChannels}
            disabled={isScanningAll || !channels || channels.length === 0}
            className="filter-btn disabled:opacity-50 disabled:cursor-not-allowed"
            title={isScanningAll ? `Scanning ${scanProgress.current}/${scanProgress.total}...` : 'Scan all channels for new videos'}
          >
            {isScanningAll ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" opacity="0.25"></path>
                  <path d="M21 12a9 9 0 01-9 9" strokeLinecap="round"></path>
                </svg>
                <span>Scanning {scanProgress.current}/{scanProgress.total}</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  <polyline points="23 4 23 10 17 10"></polyline>
                  <path d="M20.49 15a9 9 0 01-2.12 3.36 9 9 0 01-11.58 1.47A9 9 0 013 12a9 9 0 011.79-5.37A9 9 0 0112 3a9 9 0 018.5 6.5L23 10"></path>
                </svg>
                <span>Scan All</span>
              </>
            )}
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

      {/* Overlay for Duration Settings - closes on click outside */}
      {showDurationSettings !== null && (
        <div
          className="fixed inset-0 z-40 bg-transparent"
          onClick={() => {
            setShowDurationSettings(null);
            setEditingChannel(null);
          }}
        />
      )}

      {/* Channels Grid/List */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
          {filteredAndSortedChannels.map(channel => (
          <div key={channel.id} className="relative group channel-card-container z-50">
            <div className="card overflow-hidden hover:scale-100">
              <Link
                to={`/channel/${channel.id}`}
                className="block"
              >
                {/* Top: Channel Logo Banner */}
                <div className="relative w-full h-24 bg-dark-tertiary">
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

                  {/* Auto-Download Badge - Top Left */}
                  {channel.auto_download && (
                    <div className="absolute top-2 left-2 bg-green-600/90 text-white px-2 py-0.5 rounded text-[10px] font-bold tracking-wide backdrop-blur-sm">
                      AUTO
                    </div>
                  )}

                  {/* Last Scan Badge - Bottom Left */}
                  <div className="absolute bottom-2 left-2 bg-dark-secondary/90 text-text-primary px-2 py-0.5 rounded text-[10px] font-bold tracking-wide backdrop-blur-sm">
                    {formatLastScan(channel.last_scan_at)}
                  </div>
                </div>

                {/* Content Section */}
                <div className="p-3 space-y-2">
                  {/* Row 1: Title and 3-Dot Menu */}
                  <div className="flex items-center justify-between gap-2">
                    {/* Title - single line with ellipsis */}
                    <h3 className="text-sm font-semibold text-text-primary line-clamp-1 leading-tight group-hover:text-accent transition-colors flex-1" title={channel.title}>
                      {channel.title}
                    </h3>

                    {/* 3-Dot Menu Button */}
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setMenuOpen(menuOpen === channel.id ? null : channel.id);
                      }}
                      className="p-1.5 rounded-full bg-dark-tertiary/50 backdrop-blur-sm border border-dark-border opacity-100 hover:bg-dark-hover transition-all flex-shrink-0"
                    >
                      <svg className="w-4 h-4 text-text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="5" r="1"></circle>
                        <circle cx="12" cy="12" r="1"></circle>
                        <circle cx="12" cy="19" r="1"></circle>
                      </svg>
                    </button>
                  </div>

                  {/* Row 2: Stats - Downloaded (left), Discovered (middle), Ignored (right) */}
                  <div className="flex items-center justify-between">
                    {/* Downloaded - Far Left */}
                    <div className="flex items-center gap-1 text-sm font-semibold text-green-400" title="Downloaded videos">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                      </svg>
                      <span className="font-mono">{channel.downloaded_count || 0}</span>
                    </div>

                    {/* Discovered - Middle */}
                    <div className="flex items-center gap-1 text-sm font-semibold text-gray-400" title="To Review">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <circle cx="12" cy="12" r="1"></circle>
                      </svg>
                      <span className="font-mono">{channel.video_count || 0}</span>
                    </div>

                    {/* Ignored - Far Right */}
                    <div className="flex items-center gap-1 text-sm font-semibold text-gray-400" title="Ignored videos">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
                      </svg>
                      <span className="font-mono">{channel.ignored_count || 0}</span>
                    </div>
                  </div>
                </div>
              </Link>

              {/* Duration Settings Panel - inside card */}
              {showDurationSettings === channel.id && editingChannel?.id === channel.id && (
                <div
                  className="border-t border-dark-border p-4 bg-dark-tertiary/50 animate-slide-down"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
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
                    <div className="flex-1">
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
                    <button
                      onClick={() => {
                        handleUpdateFilters(editingChannel);
                        setShowDurationSettings(null);
                      }}
                      className="btn btn-primary btn-sm"
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Dropdown Menu - outside card, left edge starts at 3-dot button */}
            {menuOpen === channel.id && (
              <div className="absolute bottom-[calc(100%-106px)] right-[-16px] bg-dark-secondary border border-dark-border rounded-lg shadow-xl z-50 w-[200px] animate-scale-in">
                <div className="py-1">
                  {/* Scan New */}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleScanChannel(channel.id, false);
                      setMenuOpen(null);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-dark-hover transition-colors flex flex-col"
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
                      handleScanChannel(channel.id, true);
                      setMenuOpen(null);
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
                      setShowDurationSettings(showDurationSettings === channel.id ? null : channel.id);
                      setEditingChannel(channel);
                      setMenuOpen(null);
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
                      className="w-4 h-4 rounded border-dark-border bg-dark-tertiary text-accent"
                    />
                    <span className="font-medium">Auto-Download</span>
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
          </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filteredAndSortedChannels.map(channel => (
            <ChannelRow
              key={channel.id}
              channel={channel}
              onScan={handleScanChannel}
              onEditFilters={(ch) => {
                setEditingChannel({ ...ch });
                setShowDurationSettings(ch.id);
              }}
              onDelete={setDeleteConfirm}
              navigate={navigate}
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
    </div>
  );
}
