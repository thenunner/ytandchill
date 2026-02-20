import { useState, useRef, useEffect } from 'react';
import { useScanYouTubePlaylist, useQueuePlaylistVideos, useRemovePlaylistVideos } from '../api/queries';
import { useNotification } from '../contexts/NotificationContext';
import { useCardSize } from '../contexts/PreferencesContext';
import { getGridClass, getUserFriendlyError, formatDuration, formatDate } from '../utils/utils';
import { useGridColumns } from '../hooks/useGridColumns';
import { StickyBar, CollapsibleSearch, SelectionBar } from '../components/stickybar';
import { EmptyState, useScrollToTop, ScrollToTopButton } from '../components/ListFeedback';

export default function Videos() {
  const { showNotification } = useNotification();
  const { cardSize, setCardSize } = useCardSize('videos');
  const scanPlaylist = useScanYouTubePlaylist();
  const queueVideos = useQueuePlaylistVideos();
  const removeVideos = useRemovePlaylistVideos();
  const gridColumns = useGridColumns(cardSize);

  // State
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [scanResults, setScanResults] = useState(null);
  const { showButton: showScrollTop, scrollToTop } = useScrollToTop();

  // URL history state
  const [showUrlHistory, setShowUrlHistory] = useState(false);
  const [urlHistory, setUrlHistory] = useState(() => {
    const saved = localStorage.getItem('videos_url_history');
    return saved ? JSON.parse(saved) : [];
  });
  const urlInputRef = useRef(null);
  const urlHistoryRef = useRef(null);

  // Click outside to close URL history dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (urlHistoryRef.current && !urlHistoryRef.current.contains(event.target) &&
          urlInputRef.current && !urlInputRef.current.contains(event.target)) {
        setShowUrlHistory(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Save URL to history (called on successful scan)
  const saveUrlToHistory = (url) => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;

    // Remove if already exists, then add to front
    const newHistory = [trimmedUrl, ...urlHistory.filter(u => u !== trimmedUrl)].slice(0, 5);
    setUrlHistory(newHistory);
    localStorage.setItem('videos_url_history', JSON.stringify(newHistory));
  };
  const [selectedVideos, setSelectedVideos] = useState(new Set());
  const [isScanning, setIsScanning] = useState(false);
  const [isQueueing, setIsQueueing] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [filterMode, setFilterMode] = useState('new'); // 'new' or 'all'
  const [statusFilter, setStatusFilter] = useState('available'); // 'all', 'available', 'ignored', 'error'
  const [searchInput, setSearchInput] = useState(''); // Search filter for video titles
  const [createPlaylist, setCreatePlaylist] = useState(false);
  const [playlistName, setPlaylistName] = useState('');

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
    setStatusFilter('available'); // Reset to available filter
    setSearchInput(''); // Clear search
    setCreatePlaylist(false);
    setPlaylistName('');

    try {
      const result = await scanPlaylist.mutateAsync({ url: playlistUrl, filter });
      setScanResults(result);

      // Save URL to history on successful scan
      saveUrlToHistory(playlistUrl);

      // Pre-fill playlist name if available (toggle stays off by default)
      if (result.playlist_title) {
        setPlaylistName(result.playlist_title);
      }

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
      showNotification(getUserFriendlyError(error.message || 'Failed to scan URL'), 'error');
    } finally {
      setIsScanning(false);
    }
  };

  const handleSelectAll = () => {
    if (scanResults?.videos) {
      // Only select visible/filtered videos
      const filteredVideos = scanResults.videos.filter(video => {
        // Search filter
        if (searchInput && !(video.title || '').toLowerCase().includes(searchInput.toLowerCase())) {
          return false;
        }
        // Status filter (only in All mode)
        if (filterMode !== 'all' || statusFilter === 'all') return true;
        if (statusFilter === 'available') return !video.status || video.status === 'discovered';
        if (statusFilter === 'ignored') return video.status === 'ignored';
        if (statusFilter === 'error') return video.status === 'removed';
        return true;
      });
      setSelectedVideos(new Set(filteredVideos.map(v => v.yt_id)));
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
      showNotification(getUserFriendlyError(error.message || 'Failed to remove videos'), 'error');
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
      const effectivePlaylistName = createPlaylist && playlistName.trim() ? playlistName.trim() : null;
      const result = await queueVideos.mutateAsync({
        videos: videosToQueue,
        playlistName: effectivePlaylistName
      });

      const playlistMsg = result.playlist_name ? ` + playlist "${result.playlist_name}" created` : '';
      showNotification(`Queued ${result.queued} videos${playlistMsg}`, 'success');

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
      showNotification(getUserFriendlyError(error.message || 'Failed to queue videos'), 'error');
    } finally {
      setIsQueueing(false);
    }
  };

  return (
    <div className="pb-4 space-y-4">
      {/* Scan Form */}
      <form onSubmit={handleScan} className="bg-dark-secondary rounded-lg p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <input
              ref={urlInputRef}
              type="text"
              value={playlistUrl}
              onChange={(e) => setPlaylistUrl(e.target.value)}
              onFocus={() => urlHistory.length > 0 && setShowUrlHistory(true)}
              placeholder="Paste YT video, playlist, or channel URL"
              className="w-full bg-dark-tertiary border border-dark-border rounded-lg px-4 py-2 text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent"
              disabled={isScanning}
            />
            {/* URL History Dropdown */}
            {showUrlHistory && urlHistory.length > 0 && (
              <div
                ref={urlHistoryRef}
                className="absolute top-full left-0 right-0 mt-1 bg-dark-secondary border border-dark-border rounded-lg shadow-xl z-50 overflow-hidden"
              >
                <div className="py-1">
                  {urlHistory.map((url, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        setPlaylistUrl(url);
                        setShowUrlHistory(false);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-dark-hover transition-colors truncate"
                      title={url}
                    >
                      {url}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
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
        <StickyBar className="rounded-lg">
          <div className="flex flex-col gap-3">
            {/* Row 1: Found count (mobile & desktop) */}
            <div className="flex items-center justify-between">
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
            </div>

            {scanResults.videos.length > 0 && (
              <>
                {/* Row 2: Search (full width on mobile) */}
                <div className="w-full sm:w-auto sm:max-w-xs">
                  <CollapsibleSearch
                    value={searchInput}
                    onChange={setSearchInput}
                    placeholder="Search videos..."
                    alwaysExpanded
                  />
                </div>

                {/* Row 3: Status Filter (only in All mode) */}
                {filterMode === 'all' && (
                  <div className="flex items-center gap-1 bg-dark-tertiary rounded-lg p-1 w-full sm:w-auto">
                    <button
                      onClick={() => setStatusFilter('available')}
                      className={`flex-1 sm:flex-none px-3 py-1.5 text-xs rounded transition-colors ${
                        statusFilter === 'available' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      Available
                    </button>
                    <button
                      onClick={() => setStatusFilter('ignored')}
                      className={`flex-1 sm:flex-none px-3 py-1.5 text-xs rounded transition-colors ${
                        statusFilter === 'ignored' ? 'bg-yellow-500 text-black' : 'text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      Ignored
                    </button>
                    <button
                      onClick={() => setStatusFilter('error')}
                      className={`flex-1 sm:flex-none px-3 py-1.5 text-xs rounded transition-colors ${
                        statusFilter === 'error' ? 'bg-red-500 text-white' : 'text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      Errors
                    </button>
                    <button
                      onClick={() => setStatusFilter('all')}
                      className={`flex-1 sm:flex-none px-3 py-1.5 text-xs rounded transition-colors ${
                        statusFilter === 'all' ? 'bg-dark-border text-text-primary' : 'text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      All
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </StickyBar>
      )}

      {/* Selection Bar for Videos */}
      {scanResults?.videos && scanResults.videos.length > 0 && (
        <SelectionBar
          show={true}
          selectedCount={selectedVideos.size}
          totalCount={scanResults.videos.length}
          onSelectAll={handleSelectAll}
          onClear={handleClearSelection}
          hideDone={true}
          actions={selectedVideos.size > 0 ? [
            {
              label: 'Ignore',
              onClick: handleRemoveSelected,
              disabled: isRemoving,
              variant: 'warning'
            },
            ...(scanResults.playlist_title ? [{
              render: (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCreatePlaylist(!createPlaylist)}
                    title={createPlaylist ? 'Playlist will be created on queue' : 'Create a local playlist from these videos'}
                    className={`px-2.5 sm:px-3 py-2.5 sm:py-1.5 text-sm rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                      createPlaylist
                        ? 'bg-accent hover:bg-accent-hover !text-white font-medium'
                        : 'bg-accent/10 hover:bg-accent/20 text-accent-text'
                    }`}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    <span className="hidden sm:inline">Playlist</span>
                  </button>
                  {createPlaylist && (
                    <input
                      type="text"
                      value={playlistName}
                      onChange={(e) => setPlaylistName(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      placeholder="Playlist name"
                      className="w-32 sm:w-48 bg-dark-tertiary border border-dark-border rounded-lg px-2.5 py-1.5 text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  )}
                </div>
              )
            }] : []),
            {
              label: 'Queue',
              onClick: handleQueueSelected,
              disabled: isQueueing,
              variant: 'primary'
            }
          ] : []}
        />
      )}

      {/* Video Grid */}
      {scanResults?.videos && scanResults.videos.length > 0 && (() => {
        const filteredVideos = scanResults.videos.filter(video => {
          // Search filter
          if (searchInput && !(video.title || '').toLowerCase().includes(searchInput.toLowerCase())) {
            return false;
          }
          // Status filter (only in All mode)
          if (filterMode !== 'all' || statusFilter === 'all') return true;
          if (statusFilter === 'available') return !video.status || video.status === 'discovered';
          if (statusFilter === 'ignored') return video.status === 'ignored';
          if (statusFilter === 'error') return video.status === 'removed';
          return true;
        });

        return (
            <div className={`grid ${getGridClass(gridColumns, filteredVideos.length)} gap-4 w-full [&>*]:min-w-0`}>
              {filteredVideos.map((video) => (
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

                {/* Selection Checkmark - Upper Right (higher z-index than status badge) */}
                {selectedVideos.has(video.yt_id) && (
                  <div className="absolute top-2 right-2 bg-black/80 text-white rounded-full p-1.5 shadow-lg z-20">
                    <svg className="w-4 h-4 text-accent-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  </div>
                )}
              </div>

              {/* Video Info */}
              <div className="p-3">
                <h3 className="text-text-primary font-medium text-sm line-clamp-2 mb-1" title={video.title}>
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
        );
      })()}

      {/* Empty State */}
      {!scanResults && !isScanning && (
        <div className="bg-dark-secondary rounded-lg p-8">
          <EmptyState
            icon={<path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />}
            title="Paste a URL to get started"
            message={
              <div className="space-y-3">
                <p>Paste a YT video, playlist, or channel URL above. Select which videos to download as singles without subscribing to the full channel.</p>
                <div className="text-center space-y-1.5 text-sm">
                  <p><span className="font-semibold text-text-primary">Scan New</span> – Checks the URL and shows only video(s) not already in your library</p>
                  <p><span className="font-semibold text-text-primary">Scan All</span> – Checks the URL and shows all video(s), including ones already in your library</p>
                </div>
              </div>
            }
          />
        </div>
      )}

      <ScrollToTopButton show={showScrollTop} onClick={scrollToTop} />
    </div>
  );
}
