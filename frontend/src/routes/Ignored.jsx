import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useVideos, useBulkUpdateVideos, useQueue } from '../api/queries';
import { useNotification } from '../contexts/NotificationContext';
import VideoCard from '../components/VideoCard';
import VideoRow from '../components/VideoRow';
import Filters from '../components/Filters';
import SortBar from '../components/SortBar';
import MultiSelectBar from '../components/MultiSelectBar';

export default function Ignored() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: queueData } = useQueue();
  const bulkUpdate = useBulkUpdateVideos();
  const { showNotification } = useNotification();

  // Get queue video IDs for showing "QUEUED" status
  const queueVideoIds = new Set(
    (queueData?.queue_items || [])
      .filter(item => item.status === 'pending' || item.status === 'downloading')
      .map(item => item.video?.id)
      .filter(Boolean)
  );

  const [viewMode, setViewMode] = useState(localStorage.getItem('viewMode') || 'grid');
  const [selectedVideos, setSelectedVideos] = useState([]);
  
  const search = searchParams.get('search') || '';
  const sort = searchParams.get('sort') || 'date_desc';

  const { data: videos, isLoading } = useVideos({
    ignored: 'true',
    search,
  });

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

  const sortedVideos = videos ? [...videos].sort((a, b) => {
    switch (sort) {
      case 'date_desc':
        return new Date(b.discovered_at) - new Date(a.discovered_at);
      case 'date_asc':
        return new Date(a.discovered_at) - new Date(b.discovered_at);
      case 'duration_desc':
        return b.duration_sec - a.duration_sec;
      case 'duration_asc':
        return a.duration_sec - b.duration_sec;
      default:
        return 0;
    }
  }) : [];

  const handleBulkAction = async (action) => {
    if (selectedVideos.length === 0) return;

    try {
      if (action === 'unignore') {
        await bulkUpdate.mutateAsync({
          videoIds: selectedVideos,
          updates: { status: 'discovered' },
        });
        showNotification(`${selectedVideos.length} video${selectedVideos.length > 1 ? 's' : ''} unignored`, 'success');
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

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-red-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="sticky top-[100px] z-40 bg-dark-primary/95 backdrop-blur-lg -mx-8 px-8 py-4 mb-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-gray-100">Ignored Videos</h2>
            <p className="text-gray-400 mt-1">Videos that don't meet your criteria</p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded ${viewMode === 'grid' ? 'bg-red-600' : 'bg-gray-700'}`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded ${viewMode === 'list' ? 'bg-red-600' : 'bg-gray-700'}`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>

        <Filters search={search} onFilter={handleFilter} hideStatusFilter hideWatchedFilter />

        <SortBar sort={sort} onSort={handleSort} />
      </div>

      {selectedVideos.length > 0 && (
        <MultiSelectBar
          count={selectedVideos.length}
          onAction={handleBulkAction}
          onSelectAll={() => setSelectedVideos(sortedVideos.map(v => v.id))}
          onClear={() => setSelectedVideos([])}
          showUnignore
        />
      )}

      {sortedVideos.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg">No ignored videos</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {sortedVideos.map(video => (
            <VideoCard
              key={video.id}
              video={video}
              isSelected={selectedVideos.includes(video.id)}
              onToggleSelect={toggleSelectVideo}
              showUnignore
              isQueued={queueVideoIds.has(video.id)}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {sortedVideos.map(video => (
            <VideoRow
              key={video.id}
              video={video}
              isSelected={selectedVideos.includes(video.id)}
              onToggleSelect={toggleSelectVideo}
              showUnignore
              isQueued={queueVideoIds.has(video.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
