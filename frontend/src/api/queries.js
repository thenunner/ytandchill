import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from './client';

// Auth (following autobrr/qui pattern)
export function useAuthCheck() {
  return useQuery({
    queryKey: ['auth', 'check'],
    queryFn: () => api.checkAuth(),
    retry: false,                    // Don't retry failed auth
    staleTime: Infinity,             // Only refetch on window focus
    refetchOnWindowFocus: true,      // Check auth when switching tabs
  });
}

export function useFirstRunCheck() {
  return useQuery({
    queryKey: ['auth', 'first-run'],
    queryFn: () => api.checkFirstRun(),
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: true,
  });
}

// Channels - SSE init populates cache, SSE events invalidate on changes
export function useChannels() {
  return useQuery({
    queryKey: ['channels'],
    queryFn: () => api.getChannels(),
    staleTime: 30000, // 30s - prevents refetch during navigation, SSE events handle updates
    refetchOnWindowFocus: false,
  });
}

export function useCreateChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.createChannel(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
    },
  });
}

export function useUpdateChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => api.updateChannel(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
    },
  });
}

export function useDeleteChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.deleteChannel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      queryClient.invalidateQueries({ queryKey: ['videos'] });
    },
  });
}

export function useMarkChannelVisited() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.markChannelVisited(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      queryClient.invalidateQueries({ queryKey: ['favorite-channels'] });
    },
  });
}

// Favorites - SSE init populates cache from channels data
export function useFavoriteChannels() {
  return useQuery({
    queryKey: ['favorite-channels'],
    queryFn: () => api.getFavoriteChannels(),
    staleTime: 30000, // 30s - prevents refetch during navigation, SSE events handle updates
    refetchOnWindowFocus: false,
  });
}

export function useFavoriteVideos(channelId = null) {
  return useQuery({
    queryKey: ['favorite-videos', channelId],
    queryFn: () => api.getFavoriteVideos(channelId),
    staleTime: 30000,
  });
}

export function useToggleChannelFavorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.toggleChannelFavorite(id),
    // Optimistic update for instant UI response
    onMutate: async (id) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['channels'] });
      await queryClient.cancelQueries({ queryKey: ['favorite-channels'] });

      // Snapshot previous values
      const previousChannels = queryClient.getQueryData(['channels']);
      const previousFavorites = queryClient.getQueryData(['favorite-channels']);

      // Optimistically update channels
      queryClient.setQueryData(['channels'], (old) => {
        if (!old) return old;
        return old.map(ch => ch.id === id ? { ...ch, is_favorite: !ch.is_favorite } : ch);
      });

      // Optimistically update favorites list
      queryClient.setQueryData(['favorite-channels'], (old) => {
        if (!old) return old;
        const channel = previousChannels?.find(ch => ch.id === id);
        if (!channel) return old;

        if (channel.is_favorite) {
          // Removing from favorites
          return old.filter(ch => ch.id !== id);
        } else {
          // Adding to favorites
          return [...old, { ...channel, is_favorite: true }];
        }
      });

      return { previousChannels, previousFavorites };
    },
    onError: (err, id, context) => {
      // Rollback on error
      if (context?.previousChannels) {
        queryClient.setQueryData(['channels'], context.previousChannels);
      }
      if (context?.previousFavorites) {
        queryClient.setQueryData(['favorite-channels'], context.previousFavorites);
      }
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      queryClient.invalidateQueries({ queryKey: ['favorite-channels'] });
      queryClient.invalidateQueries({ queryKey: ['favorite-videos'] });
    },
  });
}

export function useScanChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, forceFull = false, is_batch_start = false, is_auto_scan = false, batch_label = '' }) =>
      api.scanChannel(id, forceFull, is_batch_start, is_auto_scan, batch_label),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['videos'] });
      queryClient.invalidateQueries({ queryKey: ['channels'] });
    },
  });
}

// Videos
export function useVideos(params) {
  return useQuery({
    queryKey: ['videos', params],
    queryFn: () => api.getVideos(params),
    refetchInterval: 30000, // SSE handles real-time updates, polling is fallback
    staleTime: 10000,
  });
}

export function useVideo(id) {
  return useQuery({
    queryKey: ['video', id],
    queryFn: () => api.getVideo(id),
    enabled: !!id,
    staleTime: 60000,  // Cache for 60 seconds
    refetchOnWindowFocus: false,  // Don't refetch when window regains focus
    refetchOnMount: false,  // Don't refetch if data is fresh
    refetchOnReconnect: false,  // Don't refetch on reconnect
  });
}

// Fast playback data - minimal query for instant video start
export function useVideoPlayback(id) {
  return useQuery({
    queryKey: ['video-playback', id],
    queryFn: () => api.getVideoPlayback(id),
    enabled: !!id,
    staleTime: 30000,  // Cache for 30 seconds
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
}

export function useUpdateVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => api.updateVideo(id, data),
    onSuccess: (updatedVideo, { id, data }) => {
      // For playback_seconds updates (progress saves), just update cache silently
      // Don't refetch - it causes connection queueing issues
      if (data.playback_seconds !== undefined && Object.keys(data).length === 1) {
        // Only updating progress - update cache directly without refetch
        queryClient.setQueryData(['video', id], (old) =>
          old ? { ...old, playback_seconds: data.playback_seconds } : old
        );
        return;
      }

      // For other updates (watched status, etc.), invalidate to refresh UI
      queryClient.invalidateQueries({ queryKey: ['videos'] });
      queryClient.invalidateQueries({ queryKey: ['video', id] });
    },
  });
}

export function useDeleteVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.deleteVideo(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['videos'] });
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      queryClient.invalidateQueries({ queryKey: ['channels'] }); // Update channel video counts
      queryClient.invalidateQueries({ queryKey: ['favorite-channels'] }); // Update favorite libraries
      queryClient.invalidateQueries({ queryKey: ['favorite-videos'] }); // Update mobile Favs
    },
  });
}

export function useBulkUpdateVideos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ videoIds, updates }) => api.bulkUpdateVideos(videoIds, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['videos'] });
      queryClient.invalidateQueries({ queryKey: ['channels'] }); // Update channel video counts
    },
  });
}

export function useBulkDeleteVideos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (videoIds) => api.bulkDeleteVideos(videoIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['videos'] });
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      queryClient.invalidateQueries({ queryKey: ['channels'] }); // Update channel video counts
    },
  });
}

// Watch History
export function useWatchHistory(params = {}) {
  return useQuery({
    queryKey: ['watch-history', params],
    queryFn: () => api.getWatchHistory(params),
    staleTime: 30000,
  });
}

export function useClearWatchHistory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.clearWatchHistory(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watch-history'] });
      queryClient.invalidateQueries({ queryKey: ['videos'] });
    },
  });
}

// Categories
export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => api.getCategories(),
  });
}

export function useCategory(id) {
  return useQuery({
    queryKey: ['category', id],
    queryFn: () => api.getCategory(id),
    enabled: !!id,
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.createCategory(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => api.updateCategory(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['category'] });
    },
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['playlists'] }); // Playlists become uncategorized
    },
  });
}

export function useBulkAssignCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ playlistIds, categoryId }) => api.bulkAssignCategory(playlistIds, categoryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
  });
}

// Channel Categories (separate from playlist categories)
export function useChannelCategories() {
  return useQuery({
    queryKey: ['channel-categories'],
    queryFn: () => api.getChannelCategories(),
    staleTime: 60000, // 60 seconds - categories rarely change
  });
}

export function useCreateChannelCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.createChannelCategory(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-categories'] });
    },
  });
}

export function useUpdateChannelCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => api.updateChannelCategory(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-categories'] });
    },
  });
}

export function useDeleteChannelCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.deleteChannelCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-categories'] });
      queryClient.invalidateQueries({ queryKey: ['channels'] }); // Channels become uncategorized
    },
  });
}

// Playlists
export function usePlaylists(channelId) {
  return useQuery({
    queryKey: ['playlists', channelId],
    queryFn: () => api.getPlaylists(channelId),
    staleTime: 60000, // 60 seconds - playlists rarely change
  });
}

export function usePlaylist(id) {
  return useQuery({
    queryKey: ['playlist', id],
    queryFn: () => api.getPlaylist(id),
    enabled: !!id,
  });
}

export function useCreatePlaylist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.createPlaylist(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
    },
  });
}

export function useUpdatePlaylist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => api.updatePlaylist(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      queryClient.invalidateQueries({ queryKey: ['playlist'] });
    },
  });
}

export function useDeletePlaylist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.deletePlaylist(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
    },
  });
}

export function useAddVideoToPlaylist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ playlistId, videoId }) => api.addVideoToPlaylist(playlistId, videoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      queryClient.invalidateQueries({ queryKey: ['playlist'] });
      queryClient.invalidateQueries({ queryKey: ['videos'] }); // Update video.playlist_ids
    },
  });
}

export function useAddVideosToPlaylistBulk() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ playlistId, videoIds }) => api.addVideosToPlaylistBulk(playlistId, videoIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      queryClient.invalidateQueries({ queryKey: ['playlist'] });
      queryClient.invalidateQueries({ queryKey: ['videos'] });
    },
  });
}

export function useRemoveVideoFromPlaylist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ playlistId, videoId }) => api.removeVideoFromPlaylist(playlistId, videoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      queryClient.invalidateQueries({ queryKey: ['playlist'] });
      queryClient.invalidateQueries({ queryKey: ['videos'] }); // Update video.playlist_ids
    },
  });
}

// Queue - SSE init populates cache, SSE events update in real-time
export function useQueue(options = {}) {
  const { sseConnected, enablePolling } = options;
  // Only App.jsx passes sseConnected - it controls the SSE connection
  // Other components can enable polling explicitly or just read from shared cache
  const isMainConsumer = sseConnected !== undefined;

  return useQuery({
    queryKey: ['queue'],
    queryFn: () => api.getQueue(),
    // SSE init populates cache, polling only as fallback when SSE disconnected
    refetchInterval: enablePolling ? 2000 : (isMainConsumer ? (sseConnected ? false : 3000) : false),
    staleTime: 30000, // 30s - prevents refetch during navigation, SSE events handle updates
    refetchOnWindowFocus: false,
  });
}

export function useAddToQueue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (videoId) => api.addToQueue(videoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue'] });
      queryClient.invalidateQueries({ queryKey: ['videos'] });
      queryClient.invalidateQueries({ queryKey: ['channels'] }); // Update channel video counts
    },
  });
}

export function useAddToQueueBulk() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (videoIds) => api.addToQueueBulk(videoIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue'] });
      queryClient.invalidateQueries({ queryKey: ['videos'] });
      queryClient.invalidateQueries({ queryKey: ['channels'] }); // Update channel video counts
    },
  });
}

export function usePauseQueue() {
  return useMutation({
    mutationFn: () => api.pauseQueue(),
  });
}

export function useResumeQueue() {
  return useMutation({
    mutationFn: () => api.resumeQueue(),
  });
}

export function useCancelCurrent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.cancelCurrent(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue'] });
    },
  });
}

export function useRemoveFromQueue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.removeFromQueue(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue'] });
    },
  });
}

export function useReorderQueue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, newPosition }) => api.reorderQueue(itemId, newPosition),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue'] });
    },
  });
}

export function useMoveToTop() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId) => api.moveToTop(itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue'] });
    },
  });
}

export function useMoveToBottom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId) => api.moveToBottom(itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue'] });
    },
  });
}

export function useClearQueue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.clearQueue(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue'] });
      queryClient.invalidateQueries({ queryKey: ['videos'] });
    },
  });
}

// Format choice - for videos without H.264 format available
export function useFormatChoice() {
  return useQuery({
    queryKey: ['formatChoice'],
    queryFn: () => null,  // Set via SSE only, no direct API call
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

export function useFormatChoiceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ videoId, choice }) => api.submitFormatChoice(videoId, choice),
    onSuccess: () => {
      // Clear the format choice state
      queryClient.setQueryData(['formatChoice'], null);
      queryClient.invalidateQueries({ queryKey: ['queue'] });
      queryClient.invalidateQueries({ queryKey: ['videos'] });
    },
  });
}

// Settings - SSE init populates cache, SSE events invalidate on changes
export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => api.getSettings(),
    staleTime: 30000, // 30s - prevents refetch during navigation, SSE events handle updates
    refetchOnWindowFocus: false,
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.updateSettings(data),
    onMutate: async (newSettings) => {
      // Cancel any outgoing refetches so they don't overwrite optimistic update
      await queryClient.cancelQueries({ queryKey: ['settings'] });

      // Snapshot previous value
      const previousSettings = queryClient.getQueryData(['settings']);

      // Optimistically update cache - immediately visible to all components
      queryClient.setQueryData(['settings'], (old) => ({
        ...old,
        ...newSettings,
      }));

      return { previousSettings };
    },
    onError: (err, newSettings, context) => {
      // Rollback on error
      if (context?.previousSettings) {
        queryClient.setQueryData(['settings'], context.previousSettings);
      }
    },
    onSettled: () => {
      // Always refetch after mutation to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}

// Health
export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => api.getHealth(),
    staleTime: 30000, // Consider fresh for 30 seconds
    refetchOnMount: true, // Check on mount
    refetchInterval: 60000, // Poll every 60s for worker thread monitoring
  });
}

export function useLogs(lines = 500, options = {}) {
  const { enabled = true } = options;
  return useQuery({
    queryKey: ['logs', lines],
    queryFn: () => api.getLogs(lines),
    staleTime: 10000,
    refetchInterval: enabled ? 10000 : false, // Only poll when logs visible
    enabled, // Don't fetch at all when disabled
  });
}

// YT Playlist Import
export function useScanYouTubePlaylist() {
  return useMutation({
    mutationFn: ({ url, filter = 'new' }) => api.scanYouTubePlaylist(url, filter),
  });
}

export function useQueuePlaylistVideos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ videos }) => api.queuePlaylistVideos(videos),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue'] });
      queryClient.invalidateQueries({ queryKey: ['videos'] });
    },
  });
}

export function useRemovePlaylistVideos() {
  return useMutation({
    mutationFn: ({ videos }) => api.removePlaylistVideos(videos),
  });
}

// Video Import
export function useScanImportFolder(includeMkv = false) {
  return useQuery({
    queryKey: ['import', 'scan', { includeMkv }],
    queryFn: () => api.scanImportFolder(includeMkv),
    staleTime: 0, // Always refetch
  });
}

export function useImportState() {
  return useQuery({
    queryKey: ['import-state'],
    queryFn: () => api.getImportState(),
    refetchInterval: 5000, // SSE handles real-time updates, polling is fallback
    staleTime: 2000,
  });
}

export function useAddImportChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (url) => api.addImportChannel(url),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['import', 'state'] });
    },
  });
}

export function useFetchImportChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (channelIdx) => api.fetchImportChannel(channelIdx),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['import', 'state'] });
    },
  });
}

export function useMatchImportFiles() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (channelIdx) => api.matchImportFiles(channelIdx),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['import', 'state'] });
    },
  });
}

export function useExecuteImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (matches) => api.executeImport(matches),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['import', 'state'] });
      queryClient.invalidateQueries({ queryKey: ['videos'] });
      queryClient.invalidateQueries({ queryKey: ['channels'] });
    },
  });
}

export function useResolveImportPending() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, videoId, skip }) => api.resolveImportPending(file, videoId, skip),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['import', 'state'] });
      queryClient.invalidateQueries({ queryKey: ['videos'] });
    },
  });
}

export function useSkipRemainingImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.skipRemainingImport(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['import', 'state'] });
    },
  });
}

export function useResetImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ force } = {}) => api.resetImport(force),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['import', 'scan'] });
      queryClient.invalidateQueries({ queryKey: ['import', 'state'] });
    },
  });
}

export function useSmartIdentify() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ mode }) => api.smartIdentify(mode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['import', 'state'] });
    },
  });
}

export function useExecuteSmartImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (matches) => api.executeSmartImport(matches),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['import', 'state'] });
      queryClient.invalidateQueries({ queryKey: ['videos'] });
      queryClient.invalidateQueries({ queryKey: ['channels'] });
    },
  });
}

export function useEncodeStatus(enabled = true) {
  return useQuery({
    queryKey: ['encode-status'],
    queryFn: () => api.getEncodeStatus(),
    refetchInterval: enabled ? 5000 : false, // SSE handles real-time updates, polling is fallback
    staleTime: 2000,
    enabled,
  });
}

export function useSkipPendingItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file) => api.skipPendingItem(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['import', 'state'] });
    },
  });
}

// Thumbnails - batch fetch to reduce HTTP connections (20 requests -> 1)
export function useThumbnailBatch(videoIds) {
  return useQuery({
    queryKey: ['thumbnails', videoIds?.length > 0 ? videoIds.slice().sort().join(',') : ''],
    queryFn: () => api.batchThumbnails(videoIds),
    enabled: videoIds && videoIds.length > 0,
    staleTime: 5 * 60 * 1000, // Cache 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache 10 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

// Channel thumbnails - batch fetch for sidebar (8-10 requests -> 1)
export function useChannelThumbnailBatch(channelIds) {
  return useQuery({
    queryKey: ['channel-thumbnails', channelIds?.length > 0 ? channelIds.slice().sort((a, b) => a - b).join(',') : ''],
    queryFn: () => api.batchChannelThumbnails(channelIds),
    enabled: channelIds && channelIds.length > 0,
    staleTime: 5 * 60 * 1000, // Cache 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache 10 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

