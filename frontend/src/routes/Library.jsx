import { useState, useMemo, useRef, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useVideos, usePlaylists, useDeletePlaylist, useUpdatePlaylist } from '../api/queries';
import { useNotification } from '../contexts/NotificationContext';

export default function Library() {
  const [searchParams] = useSearchParams();
  const [viewMode, setViewMode] = useState(localStorage.getItem('viewMode') || 'grid');
  const [searchInput, setSearchInput] = useState('');
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'channels');
  const [editMode, setEditMode] = useState(false);
  const [selectedPlaylists, setSelectedPlaylists] = useState([]);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renamePlaylistId, setRenamePlaylistId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [activeMenuId, setActiveMenuId] = useState(null);

  // Playlist filters with localStorage persistence
  const [playlistSortBy, setPlaylistSortBy] = useState(() => {
    return localStorage.getItem('library_playlistSortBy') || 'a_z';
  });
  const [showPlaylistSortMenu, setShowPlaylistSortMenu] = useState(false);
  const [hideEmptyPlaylists, setHideEmptyPlaylists] = useState(() => {
    return localStorage.getItem('library_hideEmptyPlaylists') === 'true';
  });

  // Channel filters with localStorage persistence
  const [channelSortBy, setChannelSortBy] = useState(() => {
    return localStorage.getItem('library_channelSortBy') || 'a_z';
  });
  const [showChannelSortMenu, setShowChannelSortMenu] = useState(false);
  const [hideWatchedChannels, setHideWatchedChannels] = useState(() => {
    return localStorage.getItem('library_hideWatchedChannels') === 'true';
  });

  const deletePlaylist = useDeletePlaylist();
  const updatePlaylist = useUpdatePlaylist();
  const { showNotification } = useNotification();
  const menuRef = useRef(null);
  const playlistSortMenuRef = useRef(null);
  const channelSortMenuRef = useRef(null);

  // Sync activeTab with URL parameter
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'playlists' || tabParam === 'channels') {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  // Persist playlist filters to localStorage
  useEffect(() => {
    localStorage.setItem('library_playlistSortBy', playlistSortBy);
  }, [playlistSortBy]);

  useEffect(() => {
    localStorage.setItem('library_hideEmptyPlaylists', hideEmptyPlaylists);
  }, [hideEmptyPlaylists]);

  // Persist channel filters to localStorage
  useEffect(() => {
    localStorage.setItem('library_channelSortBy', channelSortBy);
  }, [channelSortBy]);

  useEffect(() => {
    localStorage.setItem('library_hideWatchedChannels', hideWatchedChannels);
  }, [hideWatchedChannels]);

  // Helper function to format file size
  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 GB';
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(1)} GB`;
  };

  // Fetch only library videos to get channels that have downloads
  const { data: videos, isLoading} = useVideos({
    status: 'library',
  });

  // Fetch all playlists
  const { data: playlists, isLoading: playlistsLoading } = usePlaylists();

  // Group videos by channel and get channel info - memoized to prevent thumbnail flickering
  const allChannelsList = useMemo(() => {
    if (!videos) return [];

    return Object.values(videos.reduce((acc, video) => {
      const channelId = video.channel_id;
      if (!acc[channelId]) {
        acc[channelId] = {
          id: channelId,
          title: video.channel_title,
          videoCount: 0,
          totalSizeBytes: 0,
          videos: [],  // Store all videos for random thumbnail selection
          watchedCount: 0,
        };
      }
      acc[channelId].videoCount++;
      acc[channelId].totalSizeBytes += video.file_size_bytes || 0;
      acc[channelId].videos.push(video);
      if (video.watched) {
        acc[channelId].watchedCount++;
      }
      return acc;
    }, {})).map(channel => {
      // Pick a random video thumbnail for this channel (only once per video list)
      const randomVideo = channel.videos[Math.floor(Math.random() * channel.videos.length)];
      return {
        ...channel,
        thumbnail: randomVideo.thumb_url,
        allWatched: channel.watchedCount === channel.videoCount,
      };
    });
  }, [videos]);

  // Filter and sort channels based on search input and filters
  const channelsList = useMemo(() => {
    // First filter by search and hide watched
    const filtered = allChannelsList.filter(channel => {
      // Search filter
      if (!(channel.title || '').toLowerCase().includes(searchInput.toLowerCase())) {
        return false;
      }
      // Hide watched channels filter
      if (hideWatchedChannels && channel.allWatched) {
        return false;
      }
      return true;
    });

    // Then sort based on selected option
    const sorted = [...filtered].sort((a, b) => {
      switch (channelSortBy) {
        case 'a_z':
          return (a.title || '').localeCompare(b.title || '');
        case 'z_a':
          return (b.title || '').localeCompare(a.title || '');
        case 'most_videos':
          return b.videoCount - a.videoCount;
        case 'least_videos':
          return a.videoCount - b.videoCount;
        default:
          return 0;
      }
    });

    return sorted;
  }, [allChannelsList, searchInput, hideWatchedChannels, channelSortBy]);

  // Filter and sort playlists
  const filteredPlaylists = useMemo(() => {
    if (!playlists) return [];

    // First filter by search and empty playlists
    const filtered = playlists.filter(playlist => {
      // Search filter
      if (!(playlist.title || playlist.name || '').toLowerCase().includes(searchInput.toLowerCase())) {
        return false;
      }
      // Hide empty playlists filter
      if (hideEmptyPlaylists && (playlist.video_count === 0 || !playlist.video_count)) {
        return false;
      }
      return true;
    });

    // Then sort based on selected option
    const sorted = [...filtered].sort((a, b) => {
      switch (playlistSortBy) {
        case 'a_z':
          return ((a.title || a.name) || '').localeCompare((b.title || b.name) || '');
        case 'z_a':
          return ((b.title || b.name) || '').localeCompare((a.title || a.name) || '');
        case 'most_videos':
          return (b.video_count || 0) - (a.video_count || 0);
        case 'least_videos':
          return (a.video_count || 0) - (b.video_count || 0);
        default:
          return 0;
      }
    });

    return sorted;
  }, [playlists, searchInput, hideEmptyPlaylists, playlistSortBy]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setActiveMenuId(null);
      }
      // Close playlist sort menu if clicking outside
      if (playlistSortMenuRef.current && !playlistSortMenuRef.current.contains(event.target)) {
        setShowPlaylistSortMenu(false);
      }
      // Close channel sort menu if clicking outside
      if (channelSortMenuRef.current && !channelSortMenuRef.current.contains(event.target)) {
        setShowChannelSortMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDeletePlaylist = async (playlistId) => {
    if (!window.confirm('Delete this playlist? Videos will not be deleted.')) return;

    try {
      await deletePlaylist.mutateAsync(playlistId);
      showNotification('Playlist deleted', 'success');
      setActiveMenuId(null);
    } catch (error) {
      showNotification(error.message || 'Failed to delete playlist', 'error');
    }
  };

  const handleRenamePlaylist = async () => {
    if (!renameValue.trim()) {
      showNotification('Please enter a playlist name', 'error');
      return;
    }

    try {
      await updatePlaylist.mutateAsync({
        playlistId: renamePlaylistId,
        data: { name: renameValue },
      });
      showNotification('Playlist renamed', 'success');
      setShowRenameModal(false);
      setRenamePlaylistId(null);
      setRenameValue('');
    } catch (error) {
      showNotification(error.message || 'Failed to rename playlist', 'error');
    }
  };

  const togglePlaylistSelection = (playlistId) => {
    setSelectedPlaylists(prev =>
      prev.includes(playlistId)
        ? prev.filter(id => id !== playlistId)
        : [...prev, playlistId]
    );
  };

  const selectAllPlaylists = () => {
    setSelectedPlaylists(filteredPlaylists.map(p => p.id));
  };

  const clearPlaylistSelection = () => {
    setSelectedPlaylists([]);
  };

  const handleBulkDeletePlaylists = async () => {
    if (selectedPlaylists.length === 0) return;
    if (!window.confirm(`Delete ${selectedPlaylists.length} playlists? Videos will not be deleted.`)) return;

    try {
      for (const playlistId of selectedPlaylists) {
        await deletePlaylist.mutateAsync(playlistId);
      }
      showNotification(`${selectedPlaylists.length} playlists deleted`, 'success');
      setSelectedPlaylists([]);
    } catch (error) {
      showNotification(error.message || 'Failed to delete playlists', 'error');
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-red-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">

      {/* Header */}
      <div className="sticky top-[100px] z-40 bg-dark-primary/95 backdrop-blur-lg -mx-4 px-4 py-4 mb-4">
        {activeTab === 'channels' ? (
          /* Channels: Single row layout */
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-bold text-text-primary">Library</h2>

            {/* Tabs */}
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('channels')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'channels'
                    ? 'bg-dark-tertiary text-white border border-dark-border-light'
                    : 'bg-dark-primary/95 border border-dark-border text-text-secondary hover:bg-dark-tertiary/50 hover:text-white'
                }`}
              >
                Channels
              </button>
              <button
                onClick={() => setActiveTab('playlists')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'playlists'
                    ? 'bg-dark-tertiary text-white border border-dark-border-light'
                    : 'bg-dark-primary/95 border border-dark-border text-text-secondary hover:bg-dark-tertiary/50 hover:text-white'
                }`}
              >
                Playlists
              </button>
            </div>

            {/* Search */}
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search channels..."
              className="search-input w-[180px]"
            />

            {/* Sort Button */}
            <div className="relative" ref={channelSortMenuRef}>
              <button
                onClick={() => setShowChannelSortMenu(!showChannelSortMenu)}
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
              {showChannelSortMenu && (
                <div className="absolute right-0 mt-2 w-40 bg-dark-secondary border border-dark-border rounded-lg shadow-xl py-2 z-50">
                  <div className="px-3 py-2 text-xs font-semibold text-text-secondary uppercase">Sort By</div>

                  {/* A-Z / Z-A */}
                  <div className="px-4 py-2 hover:bg-dark-hover transition-colors">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex gap-4">
                        <button
                          onClick={() => { setChannelSortBy('a_z'); setShowChannelSortMenu(false); }}
                          className={`${channelSortBy === 'a_z' ? 'text-green-500' : 'text-text-primary hover:text-green-500'}`}
                        >
                          A-Z
                        </button>
                        <button
                          onClick={() => { setChannelSortBy('z_a'); setShowChannelSortMenu(false); }}
                          className={`${channelSortBy === 'z_a' ? 'text-green-500' : 'text-text-primary hover:text-green-500'}`}
                        >
                          Z-A
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Videos */}
                  <div className="px-4 py-2 hover:bg-dark-hover transition-colors">
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-text-primary">Videos</span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => { setChannelSortBy('most_videos'); setShowChannelSortMenu(false); }}
                          className={`p-1 rounded ${channelSortBy === 'most_videos' ? 'text-green-500' : 'text-text-muted hover:text-text-primary'}`}
                          title="Most Videos"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                            <path d="M12 5v14M5 12l7-7 7 7"></path>
                          </svg>
                        </button>
                        <button
                          onClick={() => { setChannelSortBy('least_videos'); setShowChannelSortMenu(false); }}
                          className={`p-1 rounded ${channelSortBy === 'least_videos' ? 'text-green-500' : 'text-text-muted hover:text-text-primary'}`}
                          title="Least Videos"
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

            {/* Hide Watched Button */}
            <button
              onClick={() => setHideWatchedChannels(!hideWatchedChannels)}
              className={`filter-btn ${hideWatchedChannels ? 'bg-dark-tertiary text-white border-dark-border-light' : ''}`}
              title="Hide channels where all videos are watched"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {hideWatchedChannels ? (
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                ) : (
                  <circle cx="12" cy="12" r="10" />
                )}
              </svg>
              <span>Hide watched</span>
            </button>

            {/* View Toggle */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-lg border transition-all ${
                  viewMode === 'grid'
                    ? 'bg-dark-tertiary border-dark-border-light text-white ring-2 ring-accent/40'
                    : 'bg-dark-primary border-dark-border text-text-muted hover:bg-dark-secondary hover:text-text-primary hover:border-dark-border-light'
                }`}
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
                    ? 'bg-dark-tertiary border-dark-border-light text-white ring-2 ring-accent/40'
                    : 'bg-dark-primary border-dark-border text-text-muted hover:bg-dark-secondary hover:text-text-primary hover:border-dark-border-light'
                }`}
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
        ) : (
          /* Playlists: Two row layout for extra buttons */
          <>
            <div className="flex items-center gap-4">
              <h2 className="text-2xl font-bold text-text-primary">Library</h2>
            </div>

            <div className="flex items-center gap-4 mt-4">
              {/* Tabs */}
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveTab('channels')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    activeTab === 'channels'
                      ? 'bg-dark-tertiary text-white border border-dark-border-light'
                      : 'bg-dark-primary/95 border border-dark-border text-text-secondary hover:bg-dark-tertiary/50 hover:text-white'
                  }`}
                >
                  Channels
                </button>
                <button
                  onClick={() => setActiveTab('playlists')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    activeTab === 'playlists'
                      ? 'bg-dark-tertiary text-white border border-dark-border-light'
                      : 'bg-dark-primary/95 border border-dark-border text-text-secondary hover:bg-dark-tertiary/50 hover:text-white'
                  }`}
                >
                  Playlists
                </button>
              </div>

              {/* Search */}
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search playlists..."
                className="search-input w-[180px]"
              />

              {/* Sort Button */}
              <div className="relative" ref={playlistSortMenuRef}>
                <button
                  onClick={() => setShowPlaylistSortMenu(!showPlaylistSortMenu)}
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
                {showPlaylistSortMenu && (
                  <div className="absolute right-0 mt-2 w-40 bg-dark-secondary border border-dark-border rounded-lg shadow-xl py-2 z-50">
                    <div className="px-3 py-2 text-xs font-semibold text-text-secondary uppercase">Sort By</div>

                    {/* A-Z / Z-A */}
                    <div className="px-4 py-2 hover:bg-dark-hover transition-colors">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex gap-4">
                          <button
                            onClick={() => { setPlaylistSortBy('a_z'); setShowPlaylistSortMenu(false); }}
                            className={`${playlistSortBy === 'a_z' ? 'text-green-500' : 'text-text-primary hover:text-green-500'}`}
                          >
                            A-Z
                          </button>
                          <button
                            onClick={() => { setPlaylistSortBy('z_a'); setShowPlaylistSortMenu(false); }}
                            className={`${playlistSortBy === 'z_a' ? 'text-green-500' : 'text-text-primary hover:text-green-500'}`}
                          >
                            Z-A
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Videos */}
                    <div className="px-4 py-2 hover:bg-dark-hover transition-colors">
                      <div className="flex items-center gap-3 text-sm">
                        <span className="text-text-primary">Videos</span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => { setPlaylistSortBy('most_videos'); setShowPlaylistSortMenu(false); }}
                            className={`p-1 rounded ${playlistSortBy === 'most_videos' ? 'text-green-500' : 'text-text-muted hover:text-text-primary'}`}
                            title="Most Videos"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                              <path d="M12 5v14M5 12l7-7 7 7"></path>
                            </svg>
                          </button>
                          <button
                            onClick={() => { setPlaylistSortBy('least_videos'); setShowPlaylistSortMenu(false); }}
                            className={`p-1 rounded ${playlistSortBy === 'least_videos' ? 'text-green-500' : 'text-text-muted hover:text-text-primary'}`}
                            title="Least Videos"
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

              {/* Hide Empty Button */}
              <button
                onClick={() => setHideEmptyPlaylists(!hideEmptyPlaylists)}
                className={`filter-btn ${hideEmptyPlaylists ? 'bg-dark-tertiary text-white border-dark-border-light' : ''}`}
                title="Hide playlists with 0 videos"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {hideEmptyPlaylists ? (
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  ) : (
                    <circle cx="12" cy="12" r="10" />
                  )}
                </svg>
                <span>Hide empty</span>
              </button>

              {/* Edit Button */}
              <button
              onClick={() => {
                setEditMode(!editMode);
                setSelectedPlaylists([]);
              }}
                className={`filter-btn ${editMode ? 'bg-dark-tertiary text-white border-dark-border-light' : ''}`}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
                <span>{editMode ? 'Done' : 'Edit'}</span>
              </button>

              {/* Bulk Actions - only show in edit mode */}
              {editMode && (
                <>
                  {filteredPlaylists.length > 0 && (
                    <button
                      onClick={selectAllPlaylists}
                      className="btn btn-primary btn-sm"
                    >
                      Select All ({filteredPlaylists.length})
                    </button>
                  )}
                  {selectedPlaylists.length > 0 && (
                    <>
                      <span className="text-sm text-text-secondary">{selectedPlaylists.length} selected</span>
                      <button
                        onClick={handleBulkDeletePlaylists}
                        className="btn btn-secondary btn-sm"
                      >
                        Delete All
                      </button>
                      <button
                        onClick={clearPlaylistSelection}
                        className="btn btn-secondary btn-sm"
                      >
                        Clear
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* Channels Tab */}
      {activeTab === 'channels' && (
        <>
          {channelsList.length === 0 ? (
            <div className="text-center py-20 text-text-secondary">
              <svg className="w-16 h-16 mx-auto mb-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
              </svg>
              {allChannelsList.length > 0 && (hideWatchedChannels || searchInput) ? (
                <>
                  <p className="text-lg font-medium">No channels match filters</p>
                  <p className="text-sm mt-2">Remove filters to see them</p>
                </>
              ) : (
                <>
                  <p className="text-lg font-medium">No downloaded videos</p>
                  <p className="text-sm mt-2">Videos you download will appear here</p>
                </>
              )}
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
          {channelsList.map(channel => (
            <Link
              key={channel.id}
              to={`/channel/${channel.id}/library`}
              className="card group hover:shadow-card-hover transition-all"
            >
              {/* Thumbnail */}
              <div className="relative aspect-video bg-dark-tertiary rounded-t-xl overflow-hidden">
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

              {/* Channel Info */}
              <div className="p-3">
                <h3 className="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors truncate mb-1" title={channel.title}>
                  {channel.title}
                </h3>
                <div className="flex items-center justify-between text-xs text-text-secondary">
                  <span>{channel.videoCount} video{channel.videoCount !== 1 ? 's' : ''}</span>
                  <span>{formatFileSize(channel.totalSizeBytes)}</span>
                </div>
              </div>
            </Link>
          ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
          {channelsList.map(channel => (
            <Link
              key={channel.id}
              to={`/channel/${channel.id}/library`}
              className="card p-4 group hover:bg-dark-hover transition-colors flex items-center gap-4"
            >
              {/* Thumbnail */}
              <div className="relative w-32 h-20 bg-dark-tertiary rounded-lg overflow-hidden flex-shrink-0">
                {channel.thumbnail ? (
                  <img
                    src={channel.thumbnail}
                    alt={channel.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-text-muted" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Channel Info */}
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-text-primary group-hover:text-accent transition-colors truncate">
                  {channel.title}
                </h3>
                <p className="text-sm text-text-secondary">
                  {channel.videoCount} video{channel.videoCount !== 1 ? 's' : ''}
                </p>
              </div>

              {/* Arrow */}
              <svg className="w-5 h-5 text-text-muted group-hover:text-accent transition-colors flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </Link>
          ))}
            </div>
          )}
        </>
      )}

      {/* Playlists Tab */}
      {activeTab === 'playlists' && (
        <>
          {filteredPlaylists.length === 0 ? (
            <div className="text-center py-20 text-text-secondary">
              <svg className="w-16 h-16 mx-auto mb-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 10h16M4 14h10M4 18h10" />
                <circle cx="18" cy="16" r="3" />
              </svg>
              <p className="text-lg font-medium">{searchInput ? 'No matching playlists' : 'No playlists yet'}</p>
              <p className="text-sm mt-2">{searchInput ? 'Try a different search term' : 'Create playlists to organize your videos'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
              {filteredPlaylists.map(playlist => {
                const isSelected = selectedPlaylists.includes(playlist.id);
                return (
                  <div
                    key={playlist.id}
                    className={`card cursor-pointer transition-all ${
                      isSelected ? 'ring-2 ring-accent/60 shadow-card-hover' : ''
                    } ${editMode ? 'hover:ring-2 hover:ring-accent/50' : 'group hover:shadow-card-hover'}`}
                    onClick={(e) => {
                      if (editMode) {
                        togglePlaylistSelection(playlist.id);
                      } else if (!e.target.closest('button') && !e.target.closest('.menu')) {
                        window.location.href = `/playlist/${playlist.id}`;
                      }
                    }}
                  >
                    {/* Playlist thumbnail */}
                    <div className="relative aspect-video bg-dark-tertiary rounded-t-xl overflow-hidden">
                      {playlist.thumbnail ? (
                        <img
                          src={playlist.thumbnail}
                          alt={playlist.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <svg className="w-10 h-10 text-text-muted" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                          </svg>
                        </div>
                      )}

                      {/* Selection Checkmark - Show when in edit mode and selected */}
                      {isSelected && editMode && (
                        <div className="absolute top-2 right-2 bg-black/80 text-white rounded-full p-1.5 shadow-lg z-10">
                          <svg className="w-4 h-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                        </div>
                      )}

                      {/* 3-Dot Menu - Show when NOT in edit mode */}
                      {!editMode && (
                        <div className="absolute top-2 right-2 z-20" ref={activeMenuId === playlist.id ? menuRef : null}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuId(activeMenuId === playlist.id ? null : playlist.id);
                            }}
                            className="bg-black/70 hover:bg-black/90 text-white rounded-full p-1.5 transition-colors"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                              <circle cx="12" cy="5" r="2"></circle>
                              <circle cx="12" cy="12" r="2"></circle>
                              <circle cx="12" cy="19" r="2"></circle>
                            </svg>
                          </button>

                          {/* Dropdown Menu */}
                          {activeMenuId === playlist.id && (
                            <div
                              className="menu absolute right-0 mt-1 bg-dark-secondary border border-dark-border rounded-lg shadow-xl py-1 min-w-[160px] z-50"
                              onMouseLeave={(e) => e.stopPropagation()}
                            >
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRenamePlaylistId(playlist.id);
                                  setRenameValue(playlist.title || playlist.name || '');
                                  setShowRenameModal(true);
                                  setActiveMenuId(null);
                                }}
                                className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-dark-hover transition-colors flex items-center gap-2"
                              >
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                                Rename
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeletePlaylist(playlist.id);
                                }}
                                className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-dark-hover transition-colors flex items-center gap-2"
                              >
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="3 6 5 6 21 6"></polyline>
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                  <line x1="10" y1="11" x2="10" y2="17"></line>
                                  <line x1="14" y1="11" x2="14" y2="17"></line>
                                </svg>
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {/* Playlist info */}
                    <div className="p-3">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors truncate" title={playlist.title || playlist.name}>
                          {playlist.title || playlist.name}
                        </h3>
                        <span className="text-xs text-text-secondary whitespace-nowrap flex-shrink-0">
                          {playlist.video_count || 0} videos
                        </span>
                      </div>
                      <p className="text-xs text-text-secondary" title={playlist.channel_title}>
                        {playlist.channel_title}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
