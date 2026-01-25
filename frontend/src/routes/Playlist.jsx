import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { usePlaylist, useRemoveVideoFromPlaylist, useDeleteVideo, useBulkUpdateVideos, useSettings, useDeletePlaylist, useUpdatePlaylist } from '../api/queries';
import { useNotification } from '../contexts/NotificationContext';
import { getUserFriendlyError } from '../utils/errorMessages';
import { useCardSize } from '../contexts/CardSizeContext';
import { getGridClass, getEffectiveCardSize } from '../utils/gridUtils';
import { useGridColumns } from '../hooks/useGridColumns';
import { getBooleanSetting, getNumericSetting } from '../utils/settingsUtils';
import VideoCard from '../components/VideoCard';
import Pagination from '../components/Pagination';
import LoadMore from '../components/LoadMore';
import ConfirmModal from '../components/ui/ConfirmModal';
import AddToPlaylistMenu from '../components/AddToPlaylistMenu';
import { StickyBar, SelectionBar, SearchInput, CollapsibleSearch, BackButton, ActionDropdown, StickyBarRightSection } from '../components/stickybar';
import EmptyState from '../components/EmptyState';
import { SORT_OPTIONS, DURATION_OPTIONS } from '../constants/stickyBarOptions';

export default function Playlist() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: playlist, isLoading } = usePlaylist(id);
  const { data: settings } = useSettings();
  const removeVideo = useRemoveVideoFromPlaylist();
  const deleteVideo = useDeleteVideo();
  const bulkUpdateVideos = useBulkUpdateVideos();
  const deletePlaylist = useDeletePlaylist();
  const updatePlaylist = useUpdatePlaylist();
  const { showNotification } = useNotification();
  const { cardSize, setCardSize } = useCardSize('library');
  const gridColumns = useGridColumns(cardSize);

  const [searchInput, setSearchInput] = useState('');
  const [sort, setSort] = useState(localStorage.getItem('playlist_sort') || 'date-desc');
  const [durationFilter, setDurationFilter] = useState(localStorage.getItem('playlist_duration') || 'all');
  // Use global hide settings from Settings page (synced via backend)
  const hideWatched = getBooleanSetting(settings, 'hide_watched');
  const [editMode, setEditMode] = useState(false);
  const [selectedVideos, setSelectedVideos] = useState([]);
  const [showBulkPlaylistOptions, setShowBulkPlaylistOptions] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadedPages, setLoadedPages] = useState(1); // For mobile infinite scroll
  const itemsPerPage = getNumericSetting(settings, 'items_per_page', 50);
  const isMobile = window.innerWidth < 640;
  const [confirmAction, setConfirmAction] = useState(null); // { type: 'remove' | 'delete' | 'deletePlaylist', count: number }
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameValue, setRenameValue] = useState('');


  useEffect(() => {
    localStorage.setItem('playlist_sort', sort);
  }, [sort]);

  useEffect(() => {
    localStorage.setItem('playlist_duration', durationFilter);
  }, [durationFilter]);

  // Convert duration filter to min/max for filtering
  const getDurationRange = () => {
    switch (durationFilter) {
      case '0-30': return { min: 0, max: 30 * 60 };
      case '30-60': return { min: 30 * 60, max: 60 * 60 };
      case 'over60': return { min: 60 * 60, max: Infinity };
      default: return null;
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
      showNotification(getUserFriendlyError(error.message, 'complete action'), 'error');
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
      } else if (confirmAction.type === 'deletePlaylist') {
        await handleDeletePlaylist();
        return; // handleDeletePlaylist navigates away
      }
      setSelectedVideos([]);
      setConfirmAction(null);
    } catch (error) {
      showNotification(getUserFriendlyError(error.message, 'complete action'), 'error');
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
    const durationRange = getDurationRange();
    return playlist.videos
      .filter(video => {
        // Search filter
        if (!(video.title || '').toLowerCase().includes(searchInput.toLowerCase())) {
          return false;
        }
        // Hide watched filter (global setting)
        if (hideWatched && video.watched) {
          return false;
        }
        // Duration filter
        if (durationRange) {
          const duration = video.duration_sec || 0;
          if (duration < durationRange.min || duration >= durationRange.max) {
            return false;
          }
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
  }, [playlist?.videos, searchInput, hideWatched, sort, durationFilter]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
    setLoadedPages(1); // Reset mobile infinite scroll
  }, [searchInput, sort, durationFilter]);

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

  // Playlist action handlers
  const handlePlayAll = () => {
    if (sortedVideos.length > 0) {
      navigate(`/video/${sortedVideos[0].id}`, { state: { playlistId: id, playlistVideos: sortedVideos.map(v => v.id) } });
    }
  };

  const handleShuffle = () => {
    if (sortedVideos.length > 0) {
      const shuffled = [...sortedVideos].sort(() => Math.random() - 0.5);
      navigate(`/video/${shuffled[0].id}`, { state: { playlistId: id, playlistVideos: shuffled.map(v => v.id), shuffle: true } });
    }
  };

  const handleRenamePlaylist = async () => {
    if (!renameValue.trim()) return;
    try {
      await updatePlaylist.mutateAsync({ id, data: { name: renameValue.trim() } });
      showNotification('Playlist renamed', 'success');
      setShowRenameModal(false);
      setRenameValue('');
    } catch (error) {
      showNotification(getUserFriendlyError(error.message, 'rename playlist'), 'error');
    }
  };

  const handleDeletePlaylist = async () => {
    try {
      await deletePlaylist.mutateAsync(id);
      showNotification('Playlist deleted', 'success');
      navigate('/library?tab=playlists');
    } catch (error) {
      showNotification(getUserFriendlyError(error.message, 'delete playlist'), 'error');
    }
  };

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
      {/* Sticky Header Row */}
      <StickyBar className="-mx-8 px-8 mb-4">
        <div className="flex items-center gap-2">
          {/* LEFT: Back, Title, Options */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <BackButton
              onClick={() => navigate(location.state?.from || '/library?tab=playlists')}
              title="Back"
            />

            {/* Playlist Title */}
            <h2 className="text-sm sm:text-lg font-semibold text-text-primary truncate max-w-[100px] sm:max-w-none">{playlist.name}</h2>
            <span className="text-xs sm:text-sm text-text-secondary whitespace-nowrap">({sortedVideos.length})</span>

            {/* Options Dropdown */}
            <ActionDropdown
              label="Options"
              variant="secondary"
              mobileIcon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="4" y1="21" x2="4" y2="14"/>
                  <line x1="4" y1="10" x2="4" y2="3"/>
                  <line x1="12" y1="21" x2="12" y2="12"/>
                  <line x1="12" y1="8" x2="12" y2="3"/>
                  <line x1="20" y1="21" x2="20" y2="16"/>
                  <line x1="20" y1="12" x2="20" y2="3"/>
                  <line x1="1" y1="14" x2="7" y2="14"/>
                  <line x1="9" y1="8" x2="15" y2="8"/>
                  <line x1="17" y1="16" x2="23" y2="16"/>
                </svg>
              }
              items={[
                {
                  label: 'Play All',
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  ),
                  onClick: handlePlayAll,
                  disabled: sortedVideos.length === 0,
                },
                {
                  label: 'Shuffle',
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="16 3 21 3 21 8" />
                      <line x1="4" y1="20" x2="21" y2="3" />
                      <polyline points="21 16 21 21 16 21" />
                      <line x1="15" y1="15" x2="21" y2="21" />
                      <line x1="4" y1="4" x2="9" y2="9" />
                    </svg>
                  ),
                  onClick: handleShuffle,
                  disabled: sortedVideos.length === 0,
                },
                { divider: true },
                {
                  label: 'Edit',
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  ),
                  onClick: () => {
                    setEditMode(!editMode);
                    setSelectedVideos([]);
                  },
                },
                {
                  label: 'Rename',
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                    </svg>
                  ),
                  onClick: () => {
                    setRenameValue(playlist.name);
                    setShowRenameModal(true);
                  },
                },
                { divider: true },
                {
                  label: 'Delete Playlist',
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                    </svg>
                  ),
                  onClick: () => setConfirmAction({ type: 'deletePlaylist' }),
                  variant: 'danger',
                },
              ]}
            />
          </div>

          {/* CENTER: Search (desktop only, fills available space) */}
          <div className="hidden sm:block flex-1 max-w-md mx-4">
            <SearchInput
              value={searchInput}
              onChange={setSearchInput}
              placeholder="Search videos..."
              className="w-full"
            />
          </div>

          {/* RIGHT: Mobile (Sort + Search) / Desktop (Sort + Pagination) */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 ml-auto">
            {/* Mobile: Sort + Search */}
            <div className="sm:hidden flex items-center gap-1.5">
              <StickyBarRightSection
                sortValue={sort}
                onSortChange={setSort}
                sortOptions={SORT_OPTIONS.videos}
                durationValue={durationFilter}
                onDurationChange={setDurationFilter}
                durationOptions={DURATION_OPTIONS}
                currentPage={currentPage}
                totalItems={sortedVideos.length}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
                showMobileSort={true}
              />
              <CollapsibleSearch
                value={searchInput}
                onChange={setSearchInput}
                placeholder="Search videos..."
              />
            </div>

            {/* Desktop: Sort + Pagination */}
            <StickyBarRightSection
              sortValue={sort}
              onSortChange={setSort}
              sortOptions={SORT_OPTIONS.videos}
              durationValue={durationFilter}
              onDurationChange={setDurationFilter}
              durationOptions={DURATION_OPTIONS}
              currentPage={currentPage}
              totalItems={sortedVideos.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              showMobileSort={false}
            />
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
          ...(selectedVideos.length > 0 ? [{
            label: 'Playlist',
            onClick: () => setShowBulkPlaylistOptions(true),
            variant: 'default'
          }] : []),
          ...(selectedVideos.length > 0 ? [{
            label: 'Delete',
            onClick: () => handleBulkAction('delete'),
            variant: 'danger'
          }] : [])
        ]}
      />

      {/* Videos Grid */}
      {sortedVideos.length > 0 ? (() => {
        const effectiveCardSize = getEffectiveCardSize(cardSize, paginatedVideos.length);
        return (
        <div className="px-0 sm:px-6 lg:px-12 xl:px-16">
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

      <ConfirmModal
        isOpen={confirmAction?.type === 'deletePlaylist'}
        title="Delete Playlist"
        message={
          <>
            Delete playlist <span className="font-semibold">{playlist?.name}</span>?
            The videos will remain in your library.
          </>
        }
        confirmText="Delete"
        confirmStyle="danger"
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmAction(null)}
      />

      {/* Rename Modal */}
      <ConfirmModal
        isOpen={showRenameModal}
        title="Rename Playlist"
        message={
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRenamePlaylist()}
            className="w-full px-3 py-2 bg-dark-tertiary border border-dark-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
            placeholder="Playlist name"
            autoFocus
          />
        }
        confirmText="Rename"
        onConfirm={handleRenamePlaylist}
        onCancel={() => {
          setShowRenameModal(false);
          setRenameValue('');
        }}
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
