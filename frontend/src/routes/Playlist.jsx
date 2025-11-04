import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { usePlaylist, useRemoveVideoFromPlaylist } from '../api/queries';
import { useNotification } from '../contexts/NotificationContext';
import VideoCard from '../components/VideoCard';
import VideoRow from '../components/VideoRow';
import FiltersModal from '../components/FiltersModal';

export default function Playlist() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: playlist, isLoading } = usePlaylist(id);
  const removeVideo = useRemoveVideoFromPlaylist();
  const { showNotification } = useNotification();

  const [viewMode, setViewMode] = useState(localStorage.getItem('viewMode') || 'grid');
  const [searchInput, setSearchInput] = useState('');
  const [showFiltersModal, setShowFiltersModal] = useState(false);
  const [sort, setSort] = useState('date-desc');
  const [hideWatched, setHideWatched] = useState(false);

  useEffect(() => {
    localStorage.setItem('viewMode', viewMode);
  }, [viewMode]);

  const handleFilterChange = (key, value) => {
    if (key === 'view') {
      setViewMode(value);
    } else if (key === 'sort') {
      setSort(value);
    } else if (key === 'hide_watched') {
      setHideWatched(value === 'true');
    }
  };

  const handleRemoveVideo = async (videoId) => {
    try {
      await removeVideo.mutateAsync({ playlistId: parseInt(id), videoId });
      showNotification('Video removed from playlist', 'success');
    } catch (error) {
      showNotification(error.message, 'error');
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

  // Helper to parse upload_date (YYYYMMDD format)
  const parseVideoDate = (video) => {
    if (video.upload_date && video.upload_date.length === 8) {
      const year = video.upload_date.substring(0, 4);
      const month = video.upload_date.substring(4, 6);
      const day = video.upload_date.substring(6, 8);
      return new Date(`${year}-${month}-${day}`);
    }
    return new Date(video.discovered_at);
  };

  // Filter and sort videos
  const sortedVideos = (playlist.videos || [])
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

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Sticky Header Row */}
      <div className="sticky top-[100px] z-40 bg-dark-primary/95 backdrop-blur-lg -mx-8 px-8 py-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            {/* Back Arrow */}
            <Link
              to={playlist.channel_id ? `/channel/${playlist.channel_id}/library?filter=playlists` : '/library?tab=playlists'}
              className="flex items-center justify-center w-9 h-9 rounded-lg bg-dark-tertiary hover:bg-dark-hover border border-dark-border text-text-secondary hover:text-white transition-all"
              title="Back"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            </Link>

            {/* Playlist Title */}
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-text-primary">{playlist.name}</h2>
              <span className="text-sm text-text-secondary">({sortedVideos.length} videos)</span>
            </div>
          </div>
        </div>

        {/* Controls Row */}
        <div className="flex items-center gap-3">
          {/* Search */}
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search videos..."
            className="search-input w-[180px]"
          />

          {/* Filters Button */}
          <button
            onClick={() => setShowFiltersModal(true)}
            className="filter-btn"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"></path>
            </svg>
            <span>Filters</span>
          </button>
        </div>
      </div>

      {/* Videos Grid/List */}
      {sortedVideos.length > 0 ? (
        viewMode === 'grid' ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
            {sortedVideos.map((video) => (
              <VideoCard
                key={video.id}
                video={video}
                showRemoveFromPlaylist={true}
                onRemoveFromPlaylist={() => handleRemoveVideo(video.id)}
                isLibraryView={true}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2 items-start">
            {sortedVideos.map((video) => (
              <VideoRow
                key={video.id}
                video={video}
                showRemoveFromPlaylist={true}
                onRemoveFromPlaylist={() => handleRemoveVideo(video.id)}
              />
            ))}
          </div>
        )
      ) : (
        <div className="text-center py-20 text-text-secondary">
          <svg className="w-16 h-16 mx-auto mb-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
          </svg>
          <p className="text-lg font-medium">{(playlist.videos || []).length === 0 ? 'This playlist is empty' : 'No videos match your filters'}</p>
          <p className="text-sm mt-2">{(playlist.videos || []).length === 0 ? 'Add videos from your library to get started' : 'Try adjusting your search or filters'}</p>
        </div>
      )}

      {/* Filters Modal */}
      <FiltersModal
        isOpen={showFiltersModal}
        onClose={() => setShowFiltersModal(false)}
        filters={{
          view: viewMode,
          sort,
          hideWatched
        }}
        onFilterChange={handleFilterChange}
        hideVideosFilter={true}
        isPlaylistMode={false}
        isLibraryMode={true}
      />
    </div>
  );
}
