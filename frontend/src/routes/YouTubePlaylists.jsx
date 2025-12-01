import { useState } from 'react';
import { useScanYouTubePlaylist, useQueuePlaylistVideos, useRemovePlaylistVideos } from '../api/queries';
import { useNotification } from '../contexts/NotificationContext';

export default function YouTubePlaylists() {
  const { showNotification } = useNotification();
  const scanPlaylist = useScanYouTubePlaylist();
  const queueVideos = useQueuePlaylistVideos();
  const removeVideos = useRemovePlaylistVideos();

  // State
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [scanResults, setScanResults] = useState(null);
  const [selectedVideos, setSelectedVideos] = useState(new Set());
  const [isScanning, setIsScanning] = useState(false);
  const [isQueueing, setIsQueueing] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [filterMode, setFilterMode] = useState('new'); // 'new' or 'all'

  const handleScan = async (e, filter = filterMode) => {
    if (e) e.preventDefault();
    if (!playlistUrl.trim()) {
      showNotification('Please enter a playlist URL', 'error');
      return;
    }

    setIsScanning(true);
    setScanResults(null);
    setSelectedVideos(new Set());
    setFilterMode(filter);

    try {
      const result = await scanPlaylist.mutateAsync({ url: playlistUrl, filter });
      setScanResults(result);

      if (result.videos.length === 0) {
        showNotification(
          result.total_in_playlist > 0
            ? `All ${result.total_in_playlist} videos already in your library`
            : 'No videos found in playlist',
          'info'
        );
      } else {
        const msg = filter === 'all'
          ? `Found ${result.total_in_playlist} videos (${result.new_videos_count} new)`
          : `Found ${result.new_videos_count} new videos (${result.already_in_db} already in DB)`;
        showNotification(msg, 'success');
      }
    } catch (error) {
      showNotification(error.message || 'Failed to scan URL', 'error');
    } finally {
      setIsScanning(false);
    }
  };

  const handleSelectAll = () => {
    if (scanResults?.videos) {
      setSelectedVideos(new Set(scanResults.videos.map(v => v.yt_id)));
    }
  };

  const handleClearSelection = () => {
    setSelectedVideos(new Set());
  };

  const handleToggleSelect = (ytId) => {
    const newSelected = new Set(selectedVideos);
    if (newSelected.has(ytId)) {
      newSelected.delete(ytId);
    } else {
      newSelected.add(ytId);
    }
    setSelectedVideos(newSelected);
  };

  const handleRemoveSelected = async () => {
    if (!scanResults?.videos || selectedVideos.size === 0) return;

    setIsRemoving(true);

    try {
      const videosToRemove = scanResults.videos.filter(v => selectedVideos.has(v.yt_id));
      await removeVideos.mutateAsync({ videos: videosToRemove });

      showNotification(`Marked ${videosToRemove.length} videos as ignored`, 'success');

      // Update local state - mark as ignored or remove from list
      if (filterMode === 'all') {
        // In "all" mode, update status to 'ignored'
        const updatedVideos = scanResults.videos.map(v =>
          selectedVideos.has(v.yt_id) ? { ...v, status: 'ignored' } : v
        );
        setScanResults({ ...scanResults, videos: updatedVideos });
      } else {
        // In "new" mode, remove from list
        const remainingVideos = scanResults.videos.filter(v => !selectedVideos.has(v.yt_id));
        setScanResults({ ...scanResults, videos: remainingVideos });
      }
      setSelectedVideos(new Set());
    } catch (error) {
      showNotification(error.message || 'Failed to remove videos', 'error');
    } finally {
      setIsRemoving(false);
    }
  };

  const handleQueueSelected = async () => {
    if (selectedVideos.size === 0) {
      showNotification('No videos selected', 'error');
      return;
    }

    setIsQueueing(true);

    try {
      const videosToQueue = scanResults.videos.filter(v => selectedVideos.has(v.yt_id));
      const result = await queueVideos.mutateAsync({ videos: videosToQueue });

      showNotification(`Queued ${result.queued} videos`, 'success');

      // Update local state
      if (filterMode === 'all') {
        // In "all" mode, update status to 'queued'
        const updatedVideos = scanResults.videos.map(v =>
          selectedVideos.has(v.yt_id) ? { ...v, status: 'queued' } : v
        );
        setScanResults({ ...scanResults, videos: updatedVideos });
      } else {
        // In "new" mode, remove from list
        const remainingVideos = scanResults.videos.filter(v => !selectedVideos.has(v.yt_id));
        setScanResults({ ...scanResults, videos: remainingVideos });
      }
      setSelectedVideos(new Set());

    } catch (error) {
      showNotification(error.message || 'Failed to queue videos', 'error');
    } finally {
      setIsQueueing(false);
    }
  };

  const formatDuration = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return hrs > 0
      ? `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
      : `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const year = dateStr.slice(0, 4);
    const month = dateStr.slice(4, 6);
    const day = dateStr.slice(6, 8);
    return `${month}/${day}/${year}`;
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-xl font-bold text-text-primary">Import Videos</h1>
      </div>

      {/* Scan Form */}
      <form onSubmit={handleScan} className="bg-dark-secondary rounded-lg p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={playlistUrl}
            onChange={(e) => setPlaylistUrl(e.target.value)}
            placeholder="Paste YouTube video, playlist, or channel URL"
            className="flex-1 bg-dark-tertiary border border-dark-border rounded-lg px-4 py-2 text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent"
            disabled={isScanning}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={(e) => handleScan(e, 'new')}
              disabled={isScanning || !playlistUrl.trim()}
              className={`px-4 py-2 font-semibold rounded-lg transition-colors ${
                filterMode === 'new' && scanResults
                  ? 'bg-accent text-white'
                  : 'bg-dark-tertiary hover:bg-dark-border text-text-secondary'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isScanning && filterMode === 'new' ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Scanning...
                </span>
              ) : (
                'Scan New'
              )}
            </button>
            <button
              type="button"
              onClick={(e) => handleScan(e, 'all')}
              disabled={isScanning || !playlistUrl.trim()}
              className={`px-4 py-2 font-semibold rounded-lg transition-colors ${
                filterMode === 'all' && scanResults
                  ? 'bg-accent text-white'
                  : 'bg-dark-tertiary hover:bg-dark-border text-text-secondary'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isScanning && filterMode === 'all' ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Scanning...
                </span>
              ) : (
                'Scan All'
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Results Summary */}
      {scanResults && (
        <div className="bg-dark-secondary rounded-lg p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="text-text-secondary">
              {scanResults.videos.length === 0 ? (
                <span>No new videos to import</span>
              ) : (
                <span>
                  Found <span className="text-text-primary font-semibold">{scanResults.videos.length}</span> new videos
                  {scanResults.already_in_db > 0 && (
                    <span className="text-text-muted"> ({scanResults.already_in_db} previously seen)</span>
                  )}
                </span>
              )}
            </div>

            {scanResults.videos.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSelectAll}
                  className="px-3 py-1.5 text-sm bg-dark-tertiary hover:bg-dark-border text-text-secondary rounded-lg transition-colors"
                >
                  Select All
                </button>
                <button
                  onClick={handleClearSelection}
                  className="px-3 py-1.5 text-sm bg-dark-tertiary hover:bg-dark-border text-text-secondary rounded-lg transition-colors"
                >
                  Clear
                </button>
                <span className="text-text-muted text-sm">
                  {selectedVideos.size} selected
                </span>
              </div>
            )}
          </div>

          {/* Action Bar */}
          {scanResults.videos.length > 0 && selectedVideos.size > 0 && (
            <div className="mt-4 pt-4 border-t border-dark-border flex justify-end gap-2">
              <button
                onClick={handleRemoveSelected}
                disabled={isRemoving}
                className="px-4 py-2 bg-dark-tertiary hover:bg-yellow-500/20 text-text-secondary hover:text-yellow-400 disabled:opacity-50 rounded-lg transition-colors"
              >
                {isRemoving ? 'Ignoring...' : 'Ignore'}
              </button>
              <button
                onClick={handleQueueSelected}
                disabled={isQueueing}
                className="px-4 py-2 bg-accent hover:bg-accent/80 disabled:bg-dark-tertiary disabled:text-text-secondary text-white font-semibold rounded-lg transition-colors"
              >
                {isQueueing ? 'Queueing...' : `Queue ${selectedVideos.size} Videos`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Video Grid */}
      {scanResults?.videos && scanResults.videos.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {scanResults.videos.map((video) => (
            <div
              key={video.yt_id}
              onClick={() => handleToggleSelect(video.yt_id)}
              className={`bg-dark-secondary rounded-lg overflow-hidden cursor-pointer transition-all ${
                selectedVideos.has(video.yt_id)
                  ? 'ring-2 ring-accent'
                  : 'hover:bg-dark-tertiary'
              }`}
            >
              {/* Thumbnail */}
              <div className="relative aspect-video bg-dark-tertiary">
                {video.thumbnail ? (
                  <img
                    src={video.thumbnail}
                    alt={video.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-text-muted">
                    <svg className="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="2" y="2" width="20" height="20" rx="2" />
                      <path d="M10 8l6 4-6 4V8z" fill="currentColor" />
                    </svg>
                  </div>
                )}

                {/* Duration Badge */}
                <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded">
                  {formatDuration(video.duration_sec)}
                </div>

                {/* Status Badge (in All mode) */}
                {video.status && (
                  <div className={`absolute top-2 right-2 text-xs px-2 py-0.5 rounded font-medium ${
                    video.status === 'library' ? 'bg-green-500/90 text-white' :
                    video.status === 'queued' ? 'bg-blue-500/90 text-white' :
                    video.status === 'ignored' ? 'bg-yellow-500/90 text-black' :
                    video.status === 'removed' ? 'bg-red-500/90 text-white' :
                    'bg-gray-500/90 text-white'
                  }`}>
                    {video.status === 'library' ? 'Downloaded' :
                     video.status === 'queued' ? 'Queued' :
                     video.status === 'ignored' ? 'Ignored' :
                     video.status === 'removed' ? 'Error' :
                     video.status}
                  </div>
                )}

                {/* Selection Indicator */}
                <div className={`absolute top-2 left-2 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                  selectedVideos.has(video.yt_id)
                    ? 'bg-accent border-accent'
                    : 'bg-black/50 border-white/50'
                }`}>
                  {selectedVideos.has(video.yt_id) && (
                    <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </div>

              {/* Video Info */}
              <div className="p-3">
                <h3 className="text-text-primary font-medium text-sm line-clamp-2 mb-1">
                  {video.title}
                </h3>
                <div className="flex items-center gap-2 text-xs text-text-secondary">
                  <span>{video.channel_title}</span>
                  {video.upload_date && (
                    <>
                      <span>•</span>
                      <span>{formatDate(video.upload_date)}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!scanResults && !isScanning && (
        <div className="bg-dark-secondary rounded-lg p-8 text-center">
          <svg className="w-16 h-16 mx-auto text-text-muted mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <h3 className="text-text-primary font-semibold mb-2">Import Videos from YouTube</h3>
          <p className="text-text-secondary text-sm max-w-md mx-auto">
            Paste a YouTube video, playlist, or channel URL above. Select which videos to download
            as singles without subscribing to the full channel.
          </p>
        </div>
      )}
    </div>
  );
}
