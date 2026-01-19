import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { usePlaylist, useRemoveVideoFromPlaylist, useDeleteVideo, useBulkUpdateVideos } from '../api/queries';
import { useNotification } from '../contexts/NotificationContext';
import { useCardSize } from '../contexts/CardSizeContext';
import { getGridClass, getEffectiveCardSize } from '../utils/gridUtils';
import { useGridColumns } from '../hooks/useGridColumns';
import VideoCard from '../components/VideoCard';
import FiltersModal from '../components/FiltersModal';
import Pagination from '../components/Pagination';
import LoadMore from '../components/LoadMore';
import ConfirmModal from '../components/ui/ConfirmModal';
import AddToPlaylistMenu from '../components/AddToPlaylistMenu';
import { StickyBar, SearchInput, CardSizeSlider, SelectionBar } from '../components/stickybar';
import EmptyState from '../components/EmptyState';

export default function Playlist() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: playlist, isLoading } = usePlaylist(id);
  const removeVideo = useRemoveVideoFromPlaylist();
  const deleteVideo = useDeleteVideo();
  const bulkUpdateVideos = useBulkUpdateVideos();
  const { showNotification } = useNotification();
  const { cardSize, setCardSize } = useCardSize('library');
  const gridColumns = useGridColumns(cardSize);

  const [searchInput, setSearchInput] = useState('');
  const [showFiltersModal, setShowFiltersModal] = useState(false);
  const [sort, setSort] = useState(localStorage.getItem('playlist_sort') || 'date-desc');
  const [hideWatched, setHideWatched] = useState(localStorage.getItem('playlist_hideWatched') === 'true');
  const [editMode, setEditMode] = useState(false);
  const [selectedVideos, setSelectedVideos] = useState([]);
  const [showBulkPlaylistOptions, setShowBulkPlaylistOptions] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadedPages, setLoadedPages] = useState(1); // For mobile infinite scroll
  const itemsPerPage = Number(localStorage.getItem('global_items_per_page')) || 50;
  const isMobile = window.innerWidth < 640;
  const [confirmAction, setConfirmAction] = useState(null); // { type: 'remove' | 'delete', count: number }


  useEffect(() => {
    localStorage.setItem('playlist_sort', sort);
  }, [sort]);

  useEffect(() => {
    localStorage.setItem('playlist_hideWatched', hideWatched.toString());
  }, [hideWatched]);

  const handleFilterChange = (key, value) => {
    if (key === 'sort') {
      setSort(value);
    } else if (key === 'hide_watched') {
      setHideWatched(value === 'true');
    }
  };

  // Edit mode handlers
  const toggleVideoSelection = (videoId) => {
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

  const handleBulkAction = async (action) => {
    if (selectedVideos.length === 0) return;

    try {
      switch (action) {
        case 'mark-watched':
          await bulkUpdateVideos.mutateAsync({
            videoIds: selectedVideos,
            updates: { watched: true }
          });
          showNotification(`${selectedVideos.length} videos marked as watched`, 'success');
          break;

        case 'remove':
          setConfirmAction({ type: 'remove', count: selectedVideos.length });
          return;

        case 'delete':
          setConfirmAction({ type: 'delete', count: selectedVideos.length });
          return;
      }
      setSelectedVideos([]);
    } catch (error) {
      showNotification(error.message, 'error');
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;

    try {
      if (confirmAction.type === 'remove') {
        for (const videoId of selectedVideos) {
          await removeVideo.mutateAsync({ playlistId: parseInt(id), videoId });
        }
        showNotification(`${selectedVideos.length} videos removed from playlist`, 'success');
      } else if (confirmAction.type === 'delete') {
        for (const videoId of selectedVideos) {
          await deleteVideo.mutateAsync(videoId);
        }
        showNotification(`${selectedVideos.length} videos deleted from library`, 'success');
      }
      setSelectedVideos([]);
      setConfirmAction(null);
    } catch (error) {
      showNotification(error.message, 'error');
    }
  };

  // Helper to parse downloaded_at date
  const parseVideoDate = (video) => {
    if (video.downloaded_at) {
      return new Date(video.downloaded_at);
    }
    // Fallback to discovered_at if downloaded_at is not set
    return new Date(video.discovered_at || 0);
  };

  // Filter and sort videos - must be before any early returns
  const sortedVideos = useMemo(() => {
    if (!playlist?.videos) return [];
    return playlist.videos
      .filter(video => {
        // Search filter
        if (!(video.title || '').toLowerCase().includes(searchInput.toLowerCase())) {
          return false;
        }
        // Hide watched filter
        if (hideWatched && video.watched) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        switch (sort) {
          case 'date-desc':
            return parseVideoDate(b) - parseVideoDate(a);
          case 'date-asc':
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
  }, [playlist?.videos, searchInput, hideWatched, sort]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
    setLoadedPages(1); // Reset mobile infinite scroll
  }, [searchInput, sort, hideWatched]);

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

  if (isLoading) {
    return <div className="text-center py-20 text-text-secondary">Loading playlist...</div>;
  }

  if (!playlist) {
    return (
      <div className="text-center py-20 text-text-secondary">
        <p className="text-lg font-medium">Playlist not found</p>
        <button
          onClick={() => navigate('/library?tab=playlists')}
          className="btn btn-primary mt-4"
        >
          Back to Library
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Sticky Header Row - 2 column grid: LEFT (back, title, search) | RIGHT (controls) */}
      <StickyBar className="-mx-8 px-8 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-center">
          {/* LEFT: Back, Title, Search */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Back Arrow */}
            <button
              onClick={() => {
                const referrer = location.state?.from || (
                  playlist.channel_id
                    ? `/channel/${playlist.channel_id}/library?filter=playlists`
                    : '/library?tab=playlists'
                );
                navigate(referrer);
              }}
              className="flex items-center justify-center w-9 h-9 rounded-lg bg-dark-tertiary hover:bg-dark-hover border border-dark-border text-text-secondary hover:text-text-primary transition-colors flex-shrink-0"
              title="Back"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            </button>

            {/* Playlist Title */}
            <h2 className="text-lg font-semibold text-text-primary">{playlist.name}</h2>
            <span className="text-sm text-text-secondary">({sortedVideos.length} videos)</span>

            {/* Search - left justified */}
            <SearchInput
              value={searchInput}
              onChange={setSearchInput}
              placeholder="Search videos..."
              className="w-full sm:w-[180px]"
            />
          </div>

          {/* RIGHT: Controls */}
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <CardSizeSlider tab="library" />

            {!isMobile && (
              <Pagination
                currentPage={currentPage}
                totalItems={sortedVideos.length}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
              />
            )}

            <button
              onClick={() => setShowFiltersModal(true)}
              className="filter-btn"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"></path>
              </svg>
              <span>Filters</span>
            </button>

            <button
              onClick={() => {
                setEditMode(!editMode);
                setSelectedVideos([]);
              }}
              className={`filter-btn ${editMode ? 'bg-dark-tertiary text-text-primary border-dark-border-light' : ''}`}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
              <span>{editMode ? 'Done' : 'Edit'}</span>
            </button>
          </div>
        </div>
      </StickyBar>

      {/* SelectionBar for edit mode */}
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
            label: 'Mark Watched',
            onClick: () => handleBulkAction('mark-watched'),
            primary: true
          },
          {
            label: 'Playlist Options',
            onClick: () => setShowBulkPlaylistOptions(true)
          },
          {
            label: 'Delete',
            onClick: () => handleBulkAction('delete'),
            danger: true
          }
        ]}
      />

      {/* Videos Grid */}
      {sortedVideos.length > 0 ? (() => {
        const effectiveCardSize = getEffectiveCardSize(cardSize, paginatedVideos.length);
        return (
        <div className="px-6 lg:px-12 xl:px-16">
          <div className={`grid ${getGridClass(gridColumns, paginatedVideos.length)} gap-4 w-full [&>*]:min-w-0`}>
          {paginatedVideos.map((video) => (
            <VideoCard
              key={video.id}
              video={video}
              isLibraryView={true}
              editMode={editMode}
              isSelected={selectedVideos.includes(video.id)}
              onToggleSelect={editMode ? toggleVideoSelection : undefined}
              effectiveCardSize={effectiveCardSize}
            />
          ))}
          </div>
        </div>
        );
      })() : (
        <EmptyState
          icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />}
          title={(playlist.videos || []).length === 0 ? 'This playlist is empty' : 'No videos match your filters'}
          message={(playlist.videos || []).length === 0 ? 'Add videos from your library to get started' : 'Try adjusting your search or filters'}
        />
      )}

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

      {/* Filters Modal */}
      <FiltersModal
        isOpen={showFiltersModal}
        onClose={() => setShowFiltersModal(false)}
        filters={{
          sort,
          hideWatched
        }}
        onFilterChange={handleFilterChange}
        hideVideosFilter={true}
        isPlaylistMode={false}
        isLibraryMode={true}
        isPlaylistView={true}
      />

      {/* Confirmation Modals */}
      <ConfirmModal
        isOpen={confirmAction?.type === 'remove'}
        title="Remove from Playlist"
        message={
          <>
            Remove <span className="font-semibold">{confirmAction?.count} videos</span> from this playlist?
            The videos will remain in your library.
          </>
        }
        confirmText="Remove"
        confirmStyle="danger"
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmAction(null)}
      />

      <ConfirmModal
        isOpen={confirmAction?.type === 'delete'}
        title="Delete Videos"
        message={
          <>
            Permanently delete <span className="font-semibold">{confirmAction?.count} videos</span> from your library?
            This will also delete the video files from disk.
          </>
        }
        confirmText="Delete"
        confirmStyle="danger"
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmAction(null)}
      />

      {/* Bulk Playlist Options Menu */}
      {showBulkPlaylistOptions && (
        <AddToPlaylistMenu
          videoIds={selectedVideos}
          onClose={() => {
            setShowBulkPlaylistOptions(false);
            setSelectedVideos([]);
            setEditMode(false);
          }}
        />
      )}
    </div>
  );
}
