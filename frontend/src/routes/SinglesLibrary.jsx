import { useState, useMemo, useRef, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useVideos, useAddToQueueBulk, useBulkDeleteVideos, useQueue } from '../api/queries';
import { useNotification } from '../contexts/NotificationContext';
import VideoCard from '../components/VideoCard';
import VideoRow from '../components/VideoRow';
import AddToPlaylistMenu from '../components/AddToPlaylistMenu';
import Pagination from '../components/Pagination';
import ConfirmModal from '../components/ui/ConfirmModal';

export default function SinglesLibrary() {
  const { folderName } = useParams();
  const { showNotification } = useNotification();
  const addToQueueBulk = useAddToQueueBulk();
  const bulkDeleteVideos = useBulkDeleteVideos();
  const { data: queueData } = useQueue();

  // Get queue video IDs for showing "QUEUED" status
  const queueVideoIds = new Set(
    (queueData?.queue_items || [])
      .filter(item => item.status === 'pending' || item.status === 'downloading')
      .map(item => item.video?.id)
      .filter(Boolean)
  );

  const [viewMode, setViewMode] = useState(localStorage.getItem('singlesLibrary_viewMode') || 'grid');
  const [selectedVideos, setSelectedVideos] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(() => {
    const stored = localStorage.getItem('singlesLibrary_itemsPerPage');
    return stored ? Number(stored) : 50;
  });
  const [sortBy, setSortBy] = useState(() => {
    return localStorage.getItem('singlesLibrary_sortBy') || 'date-desc';
  });
  const [showSortMenu, setShowSortMenu] = useState(false);
  const sortMenuRef = useRef(null);

  // Persist view mode
  useEffect(() => {
    localStorage.setItem('singlesLibrary_viewMode', viewMode);
  }, [viewMode]);

  // Persist sort
  useEffect(() => {
    localStorage.setItem('singlesLibrary_sortBy', sortBy);
  }, [sortBy]);

  // Close sort menu on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target)) {
        setShowSortMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch library videos for this folder
  const { data: videos, isLoading } = useVideos({
    status: 'library',
    folder_name: decodeURIComponent(folderName),
  });

  // Filter and sort videos
  const filteredVideos = useMemo(() => {
    if (!videos) return [];

    let filtered = videos.filter(v =>
      v.folder_name === decodeURIComponent(folderName) &&
      !v.channel_id
    );

    // Search filter
    if (searchInput) {
      const search = searchInput.toLowerCase();
      filtered = filtered.filter(v =>
        (v.title || '').toLowerCase().includes(search)
      );
    }

    // Sort
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'date-desc':
          return new Date(b.downloaded_at || 0) - new Date(a.downloaded_at || 0);
        case 'date-asc':
          return new Date(a.downloaded_at || 0) - new Date(b.downloaded_at || 0);
        case 'title-asc':
          return (a.title || '').localeCompare(b.title || '');
        case 'title-desc':
          return (b.title || '').localeCompare(a.title || '');
        case 'duration-desc':
          return (b.duration_sec || 0) - (a.duration_sec || 0);
        case 'duration-asc':
          return (a.duration_sec || 0) - (b.duration_sec || 0);
        default:
          return 0;
      }
    });

    return sorted;
  }, [videos, folderName, searchInput, sortBy]);

  // Paginate
  const paginatedVideos = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredVideos.slice(start, start + itemsPerPage);
  }, [filteredVideos, currentPage, itemsPerPage]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchInput, sortBy]);

  const toggleVideoSelection = (videoId) => {
    setSelectedVideos(prev =>
      prev.includes(videoId)
        ? prev.filter(id => id !== videoId)
        : [...prev, videoId]
    );
  };

  const selectAllVideos = () => {
    setSelectedVideos(filteredVideos.map(v => v.id));
  };

  const clearSelection = () => {
    setSelectedVideos([]);
  };

  const handleBulkQueue = async () => {
    if (selectedVideos.length === 0) return;
    try {
      await addToQueueBulk.mutateAsync(selectedVideos);
      showNotification(`Added ${selectedVideos.length} videos to queue`, 'success');
      setSelectedVideos([]);
      setEditMode(false);
    } catch (error) {
      showNotification(error.message || 'Failed to add to queue', 'error');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedVideos.length === 0) return;
    setDeleteConfirm({ type: 'bulk', count: selectedVideos.length });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;

    try {
      await bulkDeleteVideos.mutateAsync(selectedVideos);
      showNotification(`Deleted ${selectedVideos.length} videos`, 'success');
      setSelectedVideos([]);
      setEditMode(false);
      setDeleteConfirm(null);
    } catch (error) {
      showNotification(error.message || 'Failed to delete', 'error');
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-red-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  const decodedFolderName = decodeURIComponent(folderName);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="sticky top-[100px] z-40 bg-dark-primary/95 backdrop-blur-lg -mx-4 px-4 py-4 mb-4">
        <div className="flex flex-wrap items-center gap-3 md:gap-4">
          {/* Back Link */}
          <Link
            to="/library?tab=singles"
            className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
            <span className="hidden sm:inline">Singles</span>
          </Link>

          {/* Folder Title */}
          <h1 className="text-lg font-semibold text-text-primary truncate max-w-[200px]" title={decodedFolderName}>
            {decodedFolderName}
          </h1>

          {/* Search */}
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search videos..."
            className="search-input w-full sm:w-[180px]"
          />

          {/* Sort */}
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

            {showSortMenu && (
              <div className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-40 bg-dark-secondary border border-dark-border rounded-lg shadow-xl py-2 z-50">
                <div className="px-3 py-2 text-xs font-semibold text-text-secondary uppercase">Sort By</div>
                {[
                  { value: 'date-desc', label: 'Newest First' },
                  { value: 'date-asc', label: 'Oldest First' },
                  { value: 'title-asc', label: 'Title A-Z' },
                  { value: 'title-desc', label: 'Title Z-A' },
                  { value: 'duration-desc', label: 'Longest' },
                  { value: 'duration-asc', label: 'Shortest' },
                ].map(option => (
                  <button
                    key={option.value}
                    onClick={() => { setSortBy(option.value); setShowSortMenu(false); }}
                    className={`w-full px-4 py-2 text-left text-sm transition-colors ${
                      sortBy === option.value ? 'text-accent' : 'text-text-primary hover:bg-dark-hover'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* View Toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg border transition-all ${
                viewMode === 'grid'
                  ? 'bg-dark-tertiary border-dark-border-light text-text-primary ring-2 ring-accent/40'
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
                  ? 'bg-dark-tertiary border-dark-border-light text-text-primary ring-2 ring-accent/40'
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

          {/* Edit Button */}
          <button
            onClick={() => {
              setEditMode(!editMode);
              setSelectedVideos([]);
            }}
            className={`filter-btn ${editMode ? 'bg-dark-tertiary text-text-primary border-dark-border-light' : ''}`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            <span>{editMode ? 'Done' : 'Edit'}</span>
          </button>

          {/* Bulk Actions */}
          {editMode && (
            <>
              {filteredVideos.length > 0 && (
                <button onClick={selectAllVideos} className="btn btn-primary btn-sm">
                  Select All ({filteredVideos.length})
                </button>
              )}
              {selectedVideos.length > 0 && (
                <>
                  <span className="text-sm text-text-secondary">{selectedVideos.length} selected</span>
                  <button onClick={handleBulkQueue} className="btn btn-primary btn-sm">
                    Queue All
                  </button>
                  <button
                    onClick={() => setShowPlaylistMenu(true)}
                    className="btn btn-primary btn-sm"
                  >
                    Add to Playlist
                  </button>
                  <button onClick={handleBulkDelete} className="btn btn-secondary btn-sm">
                    Delete
                  </button>
                  <button onClick={clearSelection} className="btn btn-secondary btn-sm">
                    Clear
                  </button>
                </>
              )}
            </>
          )}

          {/* Pagination */}
          <Pagination
            currentPage={currentPage}
            totalItems={filteredVideos.length}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
            onItemsPerPageChange={(value) => {
              setItemsPerPage(value);
              localStorage.setItem('singlesLibrary_itemsPerPage', value);
              setCurrentPage(1);
            }}
          />
        </div>
      </div>

      {/* Video Grid/List */}
      {filteredVideos.length === 0 ? (
        <div className="text-center py-20 text-text-secondary">
          <svg className="w-16 h-16 mx-auto mb-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
          </svg>
          {searchInput ? (
            <>
              <p className="text-lg font-medium">No videos match your search</p>
              <p className="text-sm mt-2">Try a different search term</p>
            </>
          ) : (
            <>
              <p className="text-lg font-medium">No videos in this folder</p>
              <p className="text-sm mt-2">Import videos via the Videos tab</p>
            </>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
          {paginatedVideos.map(video => (
            <VideoCard
              key={video.id}
              video={video}
              isQueued={queueVideoIds.has(video.id)}
              isSelected={selectedVideos.includes(video.id)}
              editMode={editMode}
              onToggleSelect={() => toggleVideoSelection(video.id)}
              isLibraryView={true}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {paginatedVideos.map(video => (
            <VideoRow
              key={video.id}
              video={video}
              isQueued={queueVideoIds.has(video.id)}
              isSelected={selectedVideos.includes(video.id)}
              editMode={editMode}
              onToggleSelect={() => toggleVideoSelection(video.id)}
            />
          ))}
        </div>
      )}

      {/* Bottom Pagination */}
      {filteredVideos.length > 0 && (
        <div className="flex justify-center mt-6">
          <Pagination
            currentPage={currentPage}
            totalItems={filteredVideos.length}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
            onItemsPerPageChange={(value) => {
              setItemsPerPage(value);
              localStorage.setItem('singlesLibrary_itemsPerPage', value);
              setCurrentPage(1);
            }}
          />
        </div>
      )}

      {/* Add to Playlist Menu */}
      {showPlaylistMenu && selectedVideos.length > 0 && (
        <AddToPlaylistMenu
          videoIds={selectedVideos}
          onClose={() => setShowPlaylistMenu(false)}
          onSuccess={() => {
            setSelectedVideos([]);
            setEditMode(false);
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deleteConfirm}
        title={`Delete ${deleteConfirm?.count || 0} Videos?`}
        message={`Are you sure you want to delete ${deleteConfirm?.count || 0} videos? This will remove them from your library and delete the files.`}
        confirmText="Delete"
        confirmStyle="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
