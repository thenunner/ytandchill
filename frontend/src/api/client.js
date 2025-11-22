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
}

export default new APIClient();
