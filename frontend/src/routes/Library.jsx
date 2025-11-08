import { useState, useMemo, useRef, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useVideos, usePlaylists, useDeletePlaylist, useUpdatePlaylist, useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory, useBulkAssignCategory } from '../api/queries';
import { useNotification } from '../contexts/NotificationContext';

export default function Library() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState(localStorage.getItem('viewMode') || 'grid');
  const [playlistViewMode, setPlaylistViewMode] = useState(localStorage.getItem('playlistViewMode') || 'grid');
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

  // Channel filters with localStorage persistence
  const [channelSortBy, setChannelSortBy] = useState(() => {
    return localStorage.getItem('library_channelSortBy') || 'a_z';
  });
  const [showChannelSortMenu, setShowChannelSortMenu] = useState(false);

  const deletePlaylist = useDeletePlaylist();
  const updatePlaylist = useUpdatePlaylist();
  const { showNotification } = useNotification();
  const menuRef = useRef(null);
  const playlistSortMenuRef = useRef(null);
  const channelSortMenuRef = useRef(null);
  const categoryMenuRef = useRef(null);

  // Category hooks and state
  const { data: categories } = useCategories();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();
  const bulkAssignCategory = useBulkAssignCategory();

  const [showCreateCategoryModal, setShowCreateCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showCategorySelectorModal, setShowCategorySelectorModal] = useState(false);
  const [categoryActionType, setCategoryActionType] = useState(null); // 'single' or 'bulk'
  const [selectedPlaylistForCategory, setSelectedPlaylistForCategory] = useState(null);
  const [showCreateInSelector, setShowCreateInSelector] = useState(false);
  const [newCategoryInSelector, setNewCategoryInSelector] = useState('');
  const [expandedCategories, setExpandedCategories] = useState(() => {
    // Load expanded state from localStorage
    const saved = localStorage.getItem('expandedCategories');
    return saved ? JSON.parse(saved) : {};
  });
  const [activeCategoryMenuId, setActiveCategoryMenuId] = useState(null);
  const [renameCategoryId, setRenameCategoryId] = useState(null);
  const [renameCategoryValue, setRenameCategoryValue] = useState('');
  const [showRenameCategoryModal, setShowRenameCategoryModal] = useState(false);

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

  // Persist channel filters to localStorage
  useEffect(() => {
    localStorage.setItem('library_channelSortBy', channelSortBy);
  }, [channelSortBy]);

  // Persist expanded categories to localStorage
  useEffect(() => {
    localStorage.setItem('expandedCategories', JSON.stringify(expandedCategories));
  }, [expandedCategories]);

  // Persist view mode to localStorage
  useEffect(() => {
    localStorage.setItem('viewMode', viewMode);
  }, [viewMode]);

  // Persist playlist view mode to localStorage
  useEffect(() => {
    localStorage.setItem('playlistViewMode', playlistViewMode);
  }, [playlistViewMode]);

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

  // Filter and sort channels based on search input
  const channelsList = useMemo(() => {
    // First filter by search
    const filtered = allChannelsList.filter(channel => {
      // Search filter
      if (!(channel.title || '').toLowerCase().includes(searchInput.toLowerCase())) {
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
  }, [allChannelsList, searchInput, channelSortBy]);

  // Filter and sort playlists
  const filteredPlaylists = useMemo(() => {
    if (!playlists) return [];

    // First filter by search
    const filtered = playlists.filter(playlist => {
      // Search filter
      if (!(playlist.title || playlist.name || '').toLowerCase().includes(searchInput.toLowerCase())) {
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
  }, [playlists, searchInput, playlistSortBy]);

  // Group playlists by category
  const groupedPlaylists = useMemo(() => {
    if (!filteredPlaylists || !categories) {
      return { categorized: {}, uncategorized: filteredPlaylists || [] };
    }

    // Initialize all categories (even empty ones)
    const categorized = {};
    categories.forEach(category => {
      categorized[category.id] = {
        category,
        playlists: []
      };
    });

    // Separate playlists into categorized and uncategorized
    const uncategorized = [];

    filteredPlaylists.forEach(playlist => {
      if (playlist.category_id && categorized[playlist.category_id]) {
        categorized[playlist.category_id].playlists.push(playlist);
      } else {
        uncategorized.push(playlist);
      }
    });

    // Sort categories alphabetically by name
    const sortedCategorized = Object.entries(categorized)
      .sort(([, a], [, b]) => a.category.name.localeCompare(b.category.name))
      .reduce((acc, [key, value]) => {
        acc[key] = value;
        return acc;
      }, {});

    return {
      categorized: sortedCategorized,
      uncategorized
    };
  }, [filteredPlaylists, categories]);

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
      // Close category menu if clicking outside
      if (categoryMenuRef.current && !categoryMenuRef.current.contains(event.target)) {
        setActiveCategoryMenuId(null);
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
        id: renamePlaylistId,
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

  // Category handlers
  const handleCreateCategory = async (e) => {
    e.preventDefault();
    if (!newCategoryName.trim()) {
      showNotification('Please enter a category name', 'error');
      return;
    }

    try {
      await createCategory.mutateAsync({ name: newCategoryName.trim() });
      showNotification('Category created', 'success');
      setShowCreateCategoryModal(false);
      setNewCategoryName('');
    } catch (error) {
      showNotification(error.message || 'Failed to create category', 'error');
    }
  };

  const handleRenameCategory = async () => {
    if (!renameCategoryValue.trim()) {
      showNotification('Please enter a category name', 'error');
      return;
    }

    try {
      await updateCategory.mutateAsync({
        id: renameCategoryId,
        data: { name: renameCategoryValue.trim() },
      });
      showNotification('Category renamed', 'success');
      setShowRenameCategoryModal(false);
      setRenameCategoryId(null);
      setRenameCategoryValue('');
      setActiveCategoryMenuId(null);
    } catch (error) {
      showNotification(error.message || 'Failed to rename category', 'error');
    }
  };

  const handleDeleteCategory = async (categoryId) => {
    if (!window.confirm('Delete this category? Playlists will become uncategorized.')) return;

    try {
      await deleteCategory.mutateAsync(categoryId);
      showNotification('Category deleted', 'success');
      setActiveCategoryMenuId(null);
    } catch (error) {
      showNotification(error.message || 'Failed to delete category', 'error');
    }
  };

  const toggleCategoryExpanded = (categoryId) => {
    setExpandedCategories(prev => ({
      ...prev,
      [categoryId]: !prev[categoryId]
    }));
  };

  const handleToggleCategory = async (categoryId, isCurrentlyAssigned) => {
    try {
      if (categoryActionType === 'single' && selectedPlaylistForCategory) {
        // Single playlist - toggle on/off
        const newCategoryId = isCurrentlyAssigned ? null : categoryId;
        await updatePlaylist.mutateAsync({
          id: selectedPlaylistForCategory,
          data: { category_id: newCategoryId },
        });
        showNotification(
          isCurrentlyAssigned ? 'Removed from category' : 'Added to category',
          'success'
        );
        // Close modal after single playlist update
        setShowCategorySelectorModal(false);
        setSelectedPlaylistForCategory(null);
        setCategoryActionType(null);
        setShowCreateInSelector(false);
        setNewCategoryInSelector('');
      } else if (categoryActionType === 'bulk' && selectedPlaylists.length > 0) {
        // Bulk - assign all to this category
        await bulkAssignCategory.mutateAsync({
          playlistIds: selectedPlaylists,
          categoryId: categoryId,
        });
        showNotification(`${selectedPlaylists.length} playlists assigned to category`, 'success');
        // Clear selection after bulk assignment
        setSelectedPlaylists([]);
        setEditMode(false);
        setShowCategorySelectorModal(false);
        setSelectedPlaylistForCategory(null);
        setCategoryActionType(null);
        setShowCreateInSelector(false);
        setNewCategoryInSelector('');
      }
    } catch (error) {
      showNotification(error.message || 'Failed to update category', 'error');
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
          /* Channels: Responsive layout - wraps on mobile */
          <div className="flex flex-wrap items-center gap-3 md:gap-4">
            {/* Tabs */}
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('channels')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'channels'
                    ? 'bg-dark-tertiary text-white border border-dark-border-light'
                    : 'bg-dark-primary/95 border border-dark-border text-text-secondary hover:bg-dark-tertiary/50 hover:text-white'
                }`}
              >
                Channels
              </button>
              <button
                onClick={() => setActiveTab('playlists')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'playlists'
                    ? 'bg-dark-tertiary text-white border border-dark-border-light'
                    : 'bg-dark-primary/95 border border-dark-border text-text-secondary hover:bg-dark-tertiary/50 hover:text-white'
                }`}
              >
                Playlists
              </button>
            </div>

            {/* Search - Full width on mobile */}
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search channels..."
              className="search-input w-full sm:w-[180px]"
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
                <div className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-40 bg-dark-secondary border border-dark-border rounded-lg shadow-xl py-2 z-50">
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
          /* Playlists: Responsive layout - wraps on mobile */
          <div className="flex flex-wrap items-center gap-3 md:gap-4">
              {/* Tabs */}
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveTab('channels')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === 'channels'
                      ? 'bg-dark-tertiary text-white border border-dark-border-light'
                      : 'bg-dark-primary/95 border border-dark-border text-text-secondary hover:bg-dark-tertiary/50 hover:text-white'
                  }`}
                >
                  Channels
                </button>
                <button
                  onClick={() => setActiveTab('playlists')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === 'playlists'
                      ? 'bg-dark-tertiary text-white border border-dark-border-light'
                      : 'bg-dark-primary/95 border border-dark-border text-text-secondary hover:bg-dark-tertiary/50 hover:text-white'
                  }`}
                >
                  Playlists
                </button>
              </div>

              {/* Search - Full width on mobile */}
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search playlists..."
                className="search-input w-full sm:w-[180px]"
              />

              {/* + Category Button */}
              <button
                onClick={() => setShowCreateCategoryModal(true)}
                className="px-3 py-2 rounded-lg text-sm font-medium transition-colors bg-dark-tertiary hover:bg-dark-hover text-accent border border-accent/30 hover:border-accent/50 flex items-center gap-2 whitespace-nowrap"
                title="Create new category"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                <span className="hidden sm:inline">Category</span>
              </button>

              {/* View Toggle */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPlaylistViewMode('grid')}
                  className={`p-2 rounded-lg border transition-all ${
                    playlistViewMode === 'grid'
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
                  onClick={() => setPlaylistViewMode('list')}
                  className={`p-2 rounded-lg border transition-all ${
                    playlistViewMode === 'list'
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
                  <div className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-40 bg-dark-secondary border border-dark-border rounded-lg shadow-xl py-2 z-50">
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
                        onClick={() => {
                          setCategoryActionType('bulk');
                          setShowCategorySelectorModal(true);
                        }}
                        className="btn btn-primary btn-sm"
                      >
                        Category Options
                      </button>
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
              {allChannelsList.length > 0 && searchInput ? (
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
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 pr-2">
          {channelsList.map(channel => (
            <Link
              key={channel.id}
              to={`/channel/${channel.id}/library`}
              className="card group transition-colors"
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
        <div key={`playlists-${playlistViewMode}`}>
          {(Object.keys(groupedPlaylists.categorized).length > 0 || groupedPlaylists.uncategorized.length > 0) ? (
            <div className="space-y-6">
              {/* Render Categories */}
              {Object.entries(groupedPlaylists.categorized).map(([categoryId, { category, playlists: categoryPlaylists }]) => {
                const isExpanded = expandedCategories[categoryId] !== false; // Default to expanded

                return (
                  <div key={categoryId} className="space-y-3">
                    {/* Category Header */}
                    <div className="flex items-center justify-between gap-3 pb-2 border-b border-dark-border">
                      <button
                        onClick={() => toggleCategoryExpanded(categoryId)}
                        className="flex items-center gap-2 group hover:text-accent transition-colors flex-1 min-w-0"
                      >
                        {/* Expand/Collapse Arrow */}
                        <svg
                          className={`w-5 h-5 text-text-secondary group-hover:text-accent transition-transform ${
                            isExpanded ? 'rotate-90' : ''
                          }`}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>

                        {/* Category Name and Count */}
                        <h3 className="text-lg font-semibold text-text-primary group-hover:text-accent truncate">
                          {category.name}
                        </h3>
                        <span className="text-sm text-text-secondary whitespace-nowrap">
                          ({categoryPlaylists.length} {categoryPlaylists.length === 1 ? 'playlist' : 'playlists'})
                        </span>
                      </button>

                      {/* Category 3-Dot Menu */}
                      <div className="relative flex-shrink-0" ref={activeCategoryMenuId === categoryId ? categoryMenuRef : null}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveCategoryMenuId(activeCategoryMenuId === categoryId ? null : categoryId);
                          }}
                          className="p-2 rounded-lg bg-dark-tertiary hover:bg-dark-hover text-text-secondary hover:text-white transition-colors"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="12" cy="5" r="2"></circle>
                            <circle cx="12" cy="12" r="2"></circle>
                            <circle cx="12" cy="19" r="2"></circle>
                          </svg>
                        </button>

                        {/* Category Dropdown Menu */}
                        {activeCategoryMenuId === categoryId && (
                          <div className="absolute right-0 mt-1 bg-dark-secondary border border-dark-border rounded-lg shadow-xl py-1 min-w-[160px] z-50">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setRenameCategoryId(categoryId);
                                setRenameCategoryValue(category.name);
                                setShowRenameCategoryModal(true);
                                setActiveCategoryMenuId(null);
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
                                handleDeleteCategory(categoryId);
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
                    </div>

                    {/* Category Playlists - Only show when expanded */}
                    {isExpanded && (
                      playlistViewMode === 'grid' ? (
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 pr-2">
                          {categoryPlaylists.map(playlist => {
                            const isSelected = selectedPlaylists.includes(playlist.id);
                            return (
                              <div
                                key={playlist.id}
                                className={`card cursor-pointer transition-colors ${
                                  isSelected ? 'ring-2 ring-accent/60' : ''
                                } ${editMode ? 'hover:ring-2 hover:ring-accent/50' : 'group'}`}
                                onClick={(e) => {
                                  if (editMode) {
                                    togglePlaylistSelection(playlist.id);
                                  } else if (!e.target.closest('button') && !e.target.closest('.menu')) {
                                    navigate(`/playlist/${playlist.id}`, {
                                      state: { from: '/library?tab=playlists' }
                                    });
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

                                  {/* Selection Checkmark */}
                                  {isSelected && editMode && (
                                    <div className="absolute top-2 right-2 bg-black/80 text-white rounded-full p-1.5 shadow-lg z-10">
                                      <svg className="w-4 h-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                        <polyline points="20 6 9 17 4 12"></polyline>
                                      </svg>
                                    </div>
                                  )}

                                  {/* 3-Dot Menu */}
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

                                      {activeMenuId === playlist.id && (
                                        <div className="menu absolute right-0 mt-1 bg-dark-secondary border border-dark-border rounded-lg shadow-xl py-1 min-w-[160px] z-50">
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
                                              setSelectedPlaylistForCategory(playlist.id);
                                              setCategoryActionType('single');
                                              setShowCategorySelectorModal(true);
                                              setActiveMenuId(null);
                                            }}
                                            className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-dark-hover transition-colors flex items-center gap-2"
                                          >
                                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                                            </svg>
                                            Category Options
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
                                    <h3 className="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors line-clamp-2" title={playlist.title || playlist.name}>
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
                      ) : (
                        <div className="flex flex-col gap-2 pr-2">
                          {categoryPlaylists.map(playlist => {
                            const isSelected = selectedPlaylists.includes(playlist.id);
                            const showMenu = activeMenuId === playlist.id;
                            return (
                              <div
                                key={playlist.id}
                                className={`card flex items-center gap-3 p-0 w-full cursor-pointer transition-colors ${
                                  isSelected ? 'ring-2 ring-accent/60' : ''
                                } ${editMode ? 'hover:ring-2 hover:ring-accent/50' : 'group'}`}
                                onClick={(e) => {
                                  if (editMode) {
                                    togglePlaylistSelection(playlist.id);
                                  } else if (!e.target.closest('button')) {
                                    navigate(`/playlist/${playlist.id}`, {
                                      state: { from: '/library?tab=playlists' }
                                    });
                                  }
                                }}
                              >
                                {/* 3-Dot Menu Button */}
                                {!editMode && (
                                  <div className="flex-shrink-0 pl-3">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveMenuId(showMenu ? null : playlist.id);
                                      }}
                                      className="w-8 h-8 flex items-center justify-center bg-dark-tertiary hover:bg-dark-hover text-text-secondary hover:text-white rounded-lg transition-colors"
                                    >
                                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                        <circle cx="12" cy="5" r="2"></circle>
                                        <circle cx="12" cy="12" r="2"></circle>
                                        <circle cx="12" cy="19" r="2"></circle>
                                      </svg>
                                    </button>
                                  </div>
                                )}

                                {/* Sliding Drawer Menu */}
                                {!editMode && (
                                  <div
                                    className={`flex flex-col gap-1 overflow-hidden transition-all duration-200 ease-in-out ${
                                      showMenu ? 'w-[140px] opacity-100 pr-3' : 'w-0 opacity-0'
                                    }`}
                                  >
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setRenamePlaylistId(playlist.id);
                                        setRenameValue(playlist.title || playlist.name || '');
                                        setShowRenameModal(true);
                                        setActiveMenuId(null);
                                      }}
                                      className="px-3 py-1.5 text-left text-xs text-text-primary hover:bg-dark-hover bg-dark-secondary rounded border border-dark-border transition-colors whitespace-nowrap"
                                    >
                                      Rename
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedPlaylistForCategory(playlist.id);
                                        setCategoryActionType('single');
                                        setShowCategorySelectorModal(true);
                                        setActiveMenuId(null);
                                      }}
                                      className="px-3 py-1.5 text-left text-xs text-text-primary hover:bg-dark-hover bg-dark-secondary rounded border border-dark-border transition-colors whitespace-nowrap"
                                    >
                                      Category
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeletePlaylist(playlist.id);
                                      }}
                                      className="px-3 py-1.5 text-left text-xs text-red-400 hover:bg-dark-hover bg-dark-secondary rounded border border-dark-border transition-colors whitespace-nowrap"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                )}

                                {/* Thumbnail */}
                                <div className={`relative w-32 h-20 bg-dark-tertiary rounded-lg overflow-hidden flex-shrink-0 ${editMode ? 'ml-3' : ''}`}>
                                  {playlist.thumbnail ? (
                                    <img
                                      src={playlist.thumbnail}
                                      alt={playlist.title}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                      <svg className="w-8 h-8 text-text-muted" fill="currentColor" viewBox="0 0 20 20">
                                        <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                                      </svg>
                                    </div>
                                  )}

                                  {/* Selection Checkmark */}
                                  {isSelected && editMode && (
                                    <div className="absolute top-1 right-1 bg-black/80 text-white rounded-full p-1 shadow-lg z-10">
                                      <svg className="w-3 h-3 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                        <polyline points="20 6 9 17 4 12"></polyline>
                                      </svg>
                                    </div>
                                  )}
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                  <h3 className="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors line-clamp-2" title={playlist.title || playlist.name}>
                                    {playlist.title || playlist.name}
                                  </h3>
                                  <div className="flex items-center gap-3 mt-1">
                                    <span className="text-xs text-text-secondary">
                                      {playlist.video_count || 0} videos
                                    </span>
                                    {playlist.channel_title && (
                                      <>
                                        <span className="text-xs text-text-muted">•</span>
                                        <span className="text-xs text-text-secondary truncate" title={playlist.channel_title}>
                                          {playlist.channel_title}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )
                    )}
                  </div>
                );
              })}

              {/* Render Uncategorized Playlists */}
              {groupedPlaylists.uncategorized.length > 0 && (
                <div className="space-y-3">
                  {/* Uncategorized Header (only show if there are also categories) */}
                  {Object.keys(groupedPlaylists.categorized).length > 0 && (
                    <div className="flex items-center gap-2 pb-2 border-b border-dark-border">
                      <h3 className="text-lg font-semibold text-text-secondary">
                        Uncategorized
                      </h3>
                      <span className="text-sm text-text-muted">
                        ({groupedPlaylists.uncategorized.length} {groupedPlaylists.uncategorized.length === 1 ? 'playlist' : 'playlists'})
                      </span>
                    </div>
                  )}

                  {/* Uncategorized Playlists */}
                  {playlistViewMode === 'grid' ? (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 pr-2">
                      {groupedPlaylists.uncategorized.map(playlist => {
                        const isSelected = selectedPlaylists.includes(playlist.id);
                        return (
                          <div
                            key={playlist.id}
                            className={`card cursor-pointer transition-colors ${
                              isSelected ? 'ring-2 ring-accent/60' : ''
                            } ${editMode ? 'hover:ring-2 hover:ring-accent/50' : 'group'}`}
                            onClick={(e) => {
                              if (editMode) {
                                togglePlaylistSelection(playlist.id);
                              } else if (!e.target.closest('button') && !e.target.closest('.menu')) {
                                navigate(`/playlist/${playlist.id}`, {
                                  state: { from: '/library?tab=playlists' }
                                });
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
                                          setSelectedPlaylistForCategory(playlist.id);
                                          setCategoryActionType('single');
                                          setShowCategorySelectorModal(true);
                                          setActiveMenuId(null);
                                        }}
                                        className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-dark-hover transition-colors flex items-center gap-2"
                                      >
                                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 3h9a2 2 0 0 1 2 2z"></path>
                                        </svg>
                                        Category Options
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
                                <h3 className="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors line-clamp-2" title={playlist.title || playlist.name}>
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
                  ) : (
                    <div className="flex flex-col gap-2 pr-2">
                      {groupedPlaylists.uncategorized.map(playlist => {
                        const isSelected = selectedPlaylists.includes(playlist.id);
                        const showMenu = activeMenuId === playlist.id;
                        return (
                          <div
                            key={playlist.id}
                            className={`card flex items-center gap-3 p-0 w-full cursor-pointer transition-colors ${
                              isSelected ? 'ring-2 ring-accent/60' : ''
                            } ${editMode ? 'hover:ring-2 hover:ring-accent/50' : 'group'}`}
                            onClick={(e) => {
                              if (editMode) {
                                togglePlaylistSelection(playlist.id);
                              } else if (!e.target.closest('button')) {
                                navigate(`/playlist/${playlist.id}`, {
                                  state: { from: '/library?tab=playlists' }
                                });
                              }
                            }}
                          >
                            {/* 3-Dot Menu Button - Left of thumbnail (only when NOT in edit mode) */}
                            {!editMode && (
                              <div className="flex-shrink-0 pl-3">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveMenuId(showMenu ? null : playlist.id);
                                  }}
                                  className="w-8 h-8 flex items-center justify-center bg-dark-tertiary hover:bg-dark-hover text-text-secondary hover:text-white rounded-lg transition-colors"
                                >
                                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                    <circle cx="12" cy="5" r="2"></circle>
                                    <circle cx="12" cy="12" r="2"></circle>
                                    <circle cx="12" cy="19" r="2"></circle>
                                  </svg>
                                </button>
                              </div>
                            )}

                            {/* Sliding Drawer Menu - slides in from left, pushing content right */}
                            {!editMode && (
                              <div
                                className={`flex flex-col gap-1 overflow-hidden transition-all duration-200 ease-in-out ${
                                  showMenu ? 'w-[140px] opacity-100 pr-3' : 'w-0 opacity-0'
                                }`}
                              >
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRenamePlaylistId(playlist.id);
                                    setRenameValue(playlist.title || playlist.name || '');
                                    setShowRenameModal(true);
                                    setActiveMenuId(null);
                                  }}
                                  className="px-3 py-1.5 text-left text-xs text-text-primary hover:bg-dark-hover bg-dark-secondary rounded border border-dark-border transition-colors whitespace-nowrap"
                                >
                                  Rename
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedPlaylistForCategory(playlist.id);
                                    setCategoryActionType('single');
                                    setShowCategorySelectorModal(true);
                                    setActiveMenuId(null);
                                  }}
                                  className="px-3 py-1.5 text-left text-xs text-text-primary hover:bg-dark-hover bg-dark-secondary rounded border border-dark-border transition-colors whitespace-nowrap"
                                >
                                  Category
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeletePlaylist(playlist.id);
                                  }}
                                  className="px-3 py-1.5 text-left text-xs text-red-400 hover:bg-dark-hover bg-dark-secondary rounded border border-dark-border transition-colors whitespace-nowrap"
                                >
                                  Delete
                                </button>
                              </div>
                            )}

                            {/* Thumbnail */}
                            <div className={`relative w-32 h-20 bg-dark-tertiary rounded-lg overflow-hidden flex-shrink-0 ${editMode ? 'ml-3' : ''}`}>
                              {playlist.thumbnail ? (
                                <img
                                  src={playlist.thumbnail}
                                  alt={playlist.title}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <svg className="w-8 h-8 text-text-muted" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                                  </svg>
                                </div>
                              )}

                              {/* Selection Checkmark */}
                              {isSelected && editMode && (
                                <div className="absolute top-1 right-1 bg-black/80 text-white rounded-full p-1 shadow-lg z-10">
                                  <svg className="w-3 h-3 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                    <polyline points="20 6 9 17 4 12"></polyline>
                                  </svg>
                                </div>
                              )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <h3 className="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors line-clamp-2" title={playlist.title || playlist.name}>
                                {playlist.title || playlist.name}
                              </h3>
                              <div className="flex items-center gap-3 mt-1">
                                <span className="text-xs text-text-secondary">
                                  {playlist.video_count || 0} videos
                                </span>
                                {playlist.channel_title && (
                                  <>
                                    <span className="text-xs text-text-muted">•</span>
                                    <span className="text-xs text-text-secondary truncate" title={playlist.channel_title}>
                                      {playlist.channel_title}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-20 text-text-secondary">
          <svg className="w-16 h-16 mx-auto mb-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 10h16M4 14h10M4 18h10" />
            <circle cx="18" cy="16" r="3" />
          </svg>
          <p className="text-lg font-medium">{searchInput ? 'No matching playlists' : 'No playlists yet'}</p>
          <p className="text-sm mt-2">{searchInput ? 'Try a different search term' : 'Create playlists to organize your videos'}</p>
        </div>
      )}
        </div>
      )}

      {/* Rename Playlist Modal */}
      {showRenameModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-secondary rounded-lg max-w-md w-full p-6 shadow-2xl border border-dark-border">
            <h3 className="text-xl font-bold text-text-primary mb-4">Rename Playlist</h3>
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleRenamePlaylist();
                }
              }}
              placeholder="Enter playlist name"
              className="input w-full mb-4"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowRenameModal(false);
                  setRenamePlaylistId(null);
                  setRenameValue('');
                }}
                className="btn btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={handleRenamePlaylist}
                disabled={!renameValue.trim()}
                className="btn btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Category Modal */}
      {showCreateCategoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-secondary rounded-lg max-w-md w-full p-6 shadow-2xl border border-dark-border">
            <h3 className="text-xl font-bold text-text-primary mb-4">Create Category</h3>
            <form onSubmit={handleCreateCategory}>
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Enter category name"
                className="input w-full mb-4"
                autoFocus
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateCategoryModal(false);
                    setNewCategoryName('');
                  }}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newCategoryName.trim()}
                  className="btn btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rename Category Modal */}
      {showRenameCategoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-secondary rounded-lg max-w-md w-full p-6 shadow-2xl border border-dark-border">
            <h3 className="text-xl font-bold text-text-primary mb-4">Rename Category</h3>
            <input
              type="text"
              value={renameCategoryValue}
              onChange={(e) => setRenameCategoryValue(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleRenameCategory();
                }
              }}
              placeholder="Enter category name"
              className="input w-full mb-4"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowRenameCategoryModal(false);
                  setRenameCategoryId(null);
                  setRenameCategoryValue('');
                }}
                className="btn btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={handleRenameCategory}
                disabled={!renameCategoryValue.trim()}
                className="btn btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category Selector Modal */}
      {showCategorySelectorModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4"
          onClick={() => {
            setShowCategorySelectorModal(false);
            setSelectedPlaylistForCategory(null);
            setCategoryActionType(null);
            setShowCreateInSelector(false);
            setNewCategoryInSelector('');
          }}
        >
          <div
            className="bg-dark-secondary rounded-lg max-w-md w-full shadow-2xl border border-dark-border flex flex-col max-h-[600px]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-dark-border">
              <h3 className="text-lg font-semibold text-text-primary">Category Options</h3>
              <button
                onClick={() => {
                  setShowCategorySelectorModal(false);
                  setSelectedPlaylistForCategory(null);
                  setCategoryActionType(null);
                  setShowCreateInSelector(false);
                  setNewCategoryInSelector('');
                }}
                className="text-text-secondary hover:text-text-primary transition-colors"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            {/* Category List */}
            <div className="flex-1 overflow-y-auto p-2">
              {categories && categories.length > 0 ? (
                <div className="space-y-1">
                  {[...categories].sort((a, b) => a.name.localeCompare(b.name)).map(category => {
                    // For single playlist mode, check if this category is currently assigned
                    const currentPlaylist = categoryActionType === 'single' && playlists
                      ? playlists.find(p => p.id === selectedPlaylistForCategory)
                      : null;
                    const isAssigned = currentPlaylist && currentPlaylist.category_id === category.id;

                    return (
                      <button
                        key={category.id}
                        onClick={() => handleToggleCategory(category.id, isAssigned)}
                        className="w-full px-3 py-2 text-left rounded-lg hover:bg-dark-hover transition-colors flex items-center gap-3"
                      >
                        {/* Checkbox */}
                        <div className={`w-5 h-5 flex-shrink-0 rounded border-2 flex items-center justify-center transition-colors ${
                          isAssigned
                            ? 'bg-accent border-accent'
                            : 'border-text-secondary bg-transparent'
                        }`}>
                          {isAssigned && (
                            <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                          )}
                        </div>

                        {/* Category info */}
                        <div className="flex-1 min-w-0 flex items-center justify-between">
                          <div className="text-sm font-medium text-text-primary truncate">{category.name}</div>
                          <div className="text-xs text-text-secondary ml-2">
                            {category.playlist_count || 0} {category.playlist_count === 1 ? 'playlist' : 'playlists'}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-text-secondary">
                  <p className="text-sm">No categories yet</p>
                </div>
              )}
            </div>

            {/* Create new category section */}
            <div className="border-t border-dark-border p-4">
              {!showCreateInSelector ? (
                <button
                  onClick={() => setShowCreateInSelector(true)}
                  className="w-full px-4 py-2 text-left rounded-lg hover:bg-dark-hover transition-colors flex items-center gap-2 text-sm font-medium text-accent"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                  Create new category
                </button>
              ) : (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!newCategoryInSelector.trim()) {
                      showNotification('Please enter a category name', 'error');
                      return;
                    }
                    try {
                      const newCategory = await createCategory.mutateAsync({ name: newCategoryInSelector.trim() });
                      showNotification('Category created', 'success');
                      // Immediately assign to the new category
                      await handleToggleCategory(newCategory.id, false);
                      setShowCreateInSelector(false);
                      setNewCategoryInSelector('');
                    } catch (error) {
                      showNotification(error.message, 'error');
                    }
                  }}
                  className="space-y-2"
                >
                  <input
                    type="text"
                    value={newCategoryInSelector}
                    onChange={(e) => setNewCategoryInSelector(e.target.value)}
                    placeholder="Category name"
                    className="w-full px-3 py-2 bg-dark-tertiary border border-dark-border rounded-lg text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateInSelector(false);
                        setNewCategoryInSelector('');
                      }}
                      className="flex-1 px-3 py-1.5 text-sm rounded-lg bg-dark-tertiary hover:bg-dark-hover text-text-secondary transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 px-3 py-1.5 text-sm rounded-lg bg-dark-tertiary hover:bg-dark-hover text-text-primary font-medium border border-dark-border-light transition-colors"
                      disabled={createCategory.isLoading}
                    >
                      Create
                    </button>
                  </div>
                </form>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
