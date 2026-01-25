const API_BASE = '/api';

class APIClient {
  async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const config = {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    };

    const response = await fetch(url, config);

    // Handle 401 Unauthorized - session expired
    // Following autobrr/qui pattern: exclude auth check endpoints from redirect logic
    const isAuthCheckEndpoint = endpoint === '/auth/check' || endpoint === '/auth/check-first-run';

    if (response.status === 401) {
      // Only redirect if:
      // 1. Not an auth check endpoint itself
      // 2. Not already on login/setup page
      if (!isAuthCheckEndpoint &&
          !window.location.pathname.includes('/login') &&
          !window.location.pathname.includes('/setup')) {
        console.warn('Session expired, redirecting to login');
        window.location.href = '/login';
      }
      throw new Error('Session expired');
    }

    if (response.status === 204) {
      return null;
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'API request failed');
    }

    return data;
  }

  // Channels
  getChannels() {
    return this.request('/channels');
  }

  createChannel(data) {
    return this.request('/channels', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  updateChannel(id, data) {
    return this.request(`/channels/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  deleteChannel(id) {
    return this.request(`/channels/${id}`, {
      method: 'DELETE',
    });
  }

  markChannelVisited(id) {
    return this.request(`/channels/${id}/visited`, {
      method: 'POST',
    });
  }

  toggleChannelFavorite(id) {
    return this.request(`/channels/${id}/favorite`, {
      method: 'POST',
    });
  }

  getFavoriteChannels() {
    return this.request('/channels/favorites');
  }

  getFavoriteVideos(channelId = null) {
    const params = channelId ? `?channel_id=${channelId}` : '';
    return this.request(`/channels/favorites/videos${params}`);
  }

  scanChannel(id, forceFull = false, isBatchStart = false, isAutoScan = false, batchLabel = '') {
    return this.request(`/channels/${id}/scan`, {
      method: 'POST',
      body: JSON.stringify({
        force_full: forceFull,
        is_batch_start: isBatchStart,
        is_auto_scan: isAutoScan,
        batch_label: batchLabel
      }),
    });
  }

  // Videos
  getVideos(params = {}) {
    // Filter out null/undefined values before creating query string
    const filteredParams = Object.entries(params).reduce((acc, [key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        acc[key] = value;
      }
      return acc;
    }, {});
    const query = new URLSearchParams(filteredParams).toString();
    return this.request(`/videos${query ? `?${query}` : ''}`);
  }

  getVideo(id) {
    return this.request(`/videos/${id}`);
  }

  updateVideo(id, data) {
    return this.request(`/videos/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  deleteVideo(id) {
    return this.request(`/videos/${id}`, {
      method: 'DELETE',
    });
  }

  bulkUpdateVideos(videoIds, updates) {
    return this.request('/videos/bulk', {
      method: 'PATCH',
      body: JSON.stringify({ video_ids: videoIds, updates }),
    });
  }

  bulkDeleteVideos(videoIds) {
    return this.request('/videos/bulk-delete', {
      method: 'DELETE',
      body: JSON.stringify({ video_ids: videoIds }),
    });
  }

  // Watch History
  getWatchHistory(params = {}) {
    const filteredParams = Object.entries(params).reduce((acc, [key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        acc[key] = value;
      }
      return acc;
    }, {});
    const query = new URLSearchParams(filteredParams).toString();
    return this.request(`/videos/watch-history${query ? `?${query}` : ''}`);
  }

  clearWatchHistory() {
    return this.request('/videos/watch-history/clear', {
      method: 'POST',
    });
  }

  // Categories
  getCategories() {
    return this.request('/categories');
  }

  getCategory(id) {
    return this.request(`/categories/${id}`);
  }

  createCategory(data) {
    return this.request('/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  updateCategory(id, data) {
    return this.request(`/categories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  deleteCategory(id) {
    return this.request(`/categories/${id}`, {
      method: 'DELETE',
    });
  }

  bulkAssignCategory(playlistIds, categoryId) {
    return this.request('/playlists/bulk-category', {
      method: 'PATCH',
      body: JSON.stringify({ playlist_ids: playlistIds, category_id: categoryId }),
    });
  }

  // Channel Categories (separate from playlist categories)
  getChannelCategories() {
    return this.request('/channel-categories');
  }

  createChannelCategory(data) {
    return this.request('/channel-categories', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  updateChannelCategory(id, data) {
    return this.request(`/channel-categories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  deleteChannelCategory(id) {
    return this.request(`/channel-categories/${id}`, {
      method: 'DELETE',
    });
  }

  // Playlists
  getPlaylists(channelId) {
    const query = channelId ? `?channel_id=${channelId}` : '';
    return this.request(`/playlists${query}`);
  }

  getPlaylist(id) {
    return this.request(`/playlists/${id}`);
  }

  createPlaylist(data) {
    return this.request('/playlists', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  updatePlaylist(id, data) {
    return this.request(`/playlists/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  deletePlaylist(id) {
    return this.request(`/playlists/${id}`, {
      method: 'DELETE',
    });
  }

  addVideoToPlaylist(playlistId, videoId) {
    return this.request(`/playlists/${playlistId}/videos`, {
      method: 'POST',
      body: JSON.stringify({ video_id: videoId }),
    });
  }

  addVideosToPlaylistBulk(playlistId, videoIds) {
    return this.request(`/playlists/${playlistId}/videos/bulk`, {
      method: 'POST',
      body: JSON.stringify({ video_ids: videoIds }),
    });
  }

  removeVideoFromPlaylist(playlistId, videoId) {
    return this.request(`/playlists/${playlistId}/videos/${videoId}`, {
      method: 'DELETE',
    });
  }

  // Queue
  getQueue() {
    return this.request('/queue');
  }

  addToQueue(videoId) {
    return this.request('/queue', {
      method: 'POST',
      body: JSON.stringify({ video_id: videoId }),
    });
  }

  addToQueueBulk(videoIds) {
    return this.request('/queue/bulk', {
      method: 'POST',
      body: JSON.stringify({ video_ids: videoIds }),
    });
  }

  pauseQueue() {
    return this.request('/queue/pause', {
      method: 'POST',
    });
  }

  resumeQueue() {
    return this.request('/queue/resume', {
      method: 'POST',
    });
  }

  cancelCurrent() {
    return this.request('/queue/cancel-current', {
      method: 'POST',
    });
  }

  removeFromQueue(id) {
    return this.request(`/queue/${id}`, {
      method: 'DELETE',
    });
  }

  setOperation(type, message) {
    return this.request('/operation/set', {
      method: 'POST',
      body: JSON.stringify({ type, message }),
    });
  }

  clearOperation() {
    return this.request('/operation/clear', {
      method: 'POST',
    });
  }

  reorderQueue(itemId, newPosition) {
    return this.request('/queue/reorder', {
      method: 'POST',
      body: JSON.stringify({ item_id: itemId, new_position: newPosition }),
    });
  }

  moveToTop(itemId) {
    return this.request('/queue/move-to-top', {
      method: 'POST',
      body: JSON.stringify({ item_id: itemId }),
    });
  }

  moveToBottom(itemId) {
    return this.request('/queue/move-to-bottom', {
      method: 'POST',
      body: JSON.stringify({ item_id: itemId }),
    });
  }

  clearQueue() {
    return this.request('/queue/clear', {
      method: 'POST',
    });
  }

  // Toast sync (cross-device dismissal)
  dismissToast(toastId) {
    return this.request('/toast/dismiss', {
      method: 'POST',
      body: JSON.stringify({ id: toastId }),
    });
  }

  // Settings
  getSettings() {
    return this.request('/settings');
  }

  updateSettings(data) {
    return this.request('/settings', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  testYoutubeApiKey() {
    return this.request('/settings/test-youtube-api', {
      method: 'POST',
    });
  }

  // Queue Database Repair
  checkOrphanedQueue() {
    return this.request('/queue/check-orphaned');
  }

  cleanupOrphanedQueue() {
    return this.request('/queue/cleanup-orphaned', {
      method: 'POST',
    });
  }

  // Auth
  checkAuth() {
    return this.request('/auth/check');
  }

  checkFirstRun() {
    return this.request('/auth/check-first-run');
  }

  // Health
  getHealth() {
    return this.request('/health');
  }

  // Logs
  getLogs(lines = 500) {
    return this.request(`/logs?lines=${lines}`);
  }

  clearLogs(scope = 'all') {
    return this.request(`/logs?scope=${scope}`, { method: 'DELETE' });
  }

  // YT Playlist Import
  scanYouTubePlaylist(url, filter = 'new') {
    return this.request('/youtube-playlists/scan', {
      method: 'POST',
      body: JSON.stringify({ url, filter }),
    });
  }

  queuePlaylistVideos(videos) {
    return this.request('/youtube-playlists/queue', {
      method: 'POST',
      body: JSON.stringify({ videos }),
    });
  }

  removePlaylistVideos(videos) {
    return this.request('/youtube-playlists/remove', {
      method: 'POST',
      body: JSON.stringify({ videos }),
    });
  }

  // Video Import
  scanImportFolder(includeMkv = false) {
    const params = includeMkv ? '?include_mkv=true' : '';
    return this.request(`/import/scan${params}`);
  }

  getImportState() {
    return this.request('/import/state');
  }

  addImportChannel(url) {
    return this.request('/import/add-channel', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
  }

  setImportChannels(urls) {
    return this.request('/import/set-channels', {
      method: 'POST',
      body: JSON.stringify({ urls }),
    });
  }

  fetchImportChannel(channelIdx) {
    return this.request('/import/fetch-channel', {
      method: 'POST',
      body: JSON.stringify({ channel_idx: channelIdx }),
    });
  }

  matchImportFiles(channelIdx) {
    return this.request('/import/match', {
      method: 'POST',
      body: JSON.stringify({ channel_idx: channelIdx }),
    });
  }

  executeImport(matches) {
    return this.request('/import/execute', {
      method: 'POST',
      body: JSON.stringify({ matches }),
    });
  }

  resolveImportPending(file, videoId, skip = false) {
    return this.request('/import/resolve', {
      method: 'POST',
      body: JSON.stringify({ file, video_id: videoId, skip }),
    });
  }

  skipRemainingImport() {
    return this.request('/import/skip-remaining', {
      method: 'POST',
    });
  }

  resetImport(force = false) {
    return this.request('/import/reset', {
      method: 'POST',
      body: JSON.stringify({ force }),
    });
  }

  smartIdentify(mode = 'auto') {
    return this.request('/import/smart-identify', {
      method: 'POST',
      body: JSON.stringify({ mode }),
    });
  }

  executeSmartImport(matches) {
    return this.request('/import/execute-smart', {
      method: 'POST',
      body: JSON.stringify({ matches }),
    });
  }

  getEncodeStatus() {
    return this.request('/import/encode-status');
  }

  skipPendingItem(file) {
    return this.request('/import/skip-pending', {
      method: 'POST',
      body: JSON.stringify({ file }),
    });
  }
}

export default new APIClient();
