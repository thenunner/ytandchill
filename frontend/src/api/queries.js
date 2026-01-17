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

// Channels
export function useChannels() {
  return useQuery({
    queryKey: ['channels'],
    queryFn: () => api.getChannels(),
  });
}

export function useCreateChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.createChannel(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['channels']);
    },
  });
}

export function useUpdateChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => api.updateChannel(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['channels']);
    },
  });
}

export function useDeleteChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.deleteChannel(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['channels']);
      queryClient.invalidateQueries(['videos']);
    },
  });
}

export function useScanChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, forceFull = false, is_batch_start = false, is_auto_scan = false, batch_label = '' }) =>
      api.scanChannel(id, forceFull, is_batch_start, is_auto_scan, batch_label),
    onSuccess: () => {
      queryClient.invalidateQueries(['videos']);
      queryClient.invalidateQueries(['channels']);
    },
  });
}

// Videos
export function useVideos(params) {
  return useQuery({
    queryKey: ['videos', params],
    queryFn: () => api.getVideos(params),
    refetchInterval: 5000, // Refetch every 5 seconds for status updates
  });
}

export function useVideo(id) {
  return useQuery({
    queryKey: ['video', id],
    queryFn: () => api.getVideo(id),
    enabled: !!id,
  });
}

export function useUpdateVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => api.updateVideo(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['videos']);
      queryClient.invalidateQueries(['video']);
    },
  });
}

export function useDeleteVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.deleteVideo(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['videos']);
      queryClient.invalidateQueries(['playlists']);
    },
  });
}

export function useBulkUpdateVideos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ videoIds, updates }) => api.bulkUpdateVideos(videoIds, updates),
    onSuccess: () => {
      queryClient.invalidateQueries(['videos']);
    },
  });
}

export function useBulkDeleteVideos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (videoIds) => api.bulkDeleteVideos(videoIds),
    onSuccess: () => {
      queryClient.invalidateQueries(['videos']);
      queryClient.invalidateQueries(['playlists']);
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
      queryClient.invalidateQueries(['categories']);
    },
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => api.updateCategory(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['categories']);
      queryClient.invalidateQueries(['category']);
    },
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['categories']);
      queryClient.invalidateQueries(['playlists']); // Playlists become uncategorized
    },
  });
}

export function useBulkAssignCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ playlistIds, categoryId }) => api.bulkAssignCategory(playlistIds, categoryId),
    onSuccess: () => {
      queryClient.invalidateQueries(['playlists']);
      queryClient.invalidateQueries(['categories']);
    },
  });
}

// Channel Categories (separate from playlist categories)
export function useChannelCategories() {
  return useQuery({
    queryKey: ['channel-categories'],
    queryFn: () => api.getChannelCategories(),
  });
}

export function useCreateChannelCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.createChannelCategory(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['channel-categories']);
    },
  });
}

export function useUpdateChannelCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => api.updateChannelCategory(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['channel-categories']);
    },
  });
}

export function useDeleteChannelCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.deleteChannelCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['channel-categories']);
      queryClient.invalidateQueries(['channels']); // Channels become uncategorized
    },
  });
}

// Playlists
export function usePlaylists(channelId) {
  return useQuery({
    queryKey: ['playlists', channelId],
    queryFn: () => api.getPlaylists(channelId),
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
      queryClient.invalidateQueries(['playlists']);
    },
  });
}

export function useUpdatePlaylist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => api.updatePlaylist(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['playlists']);
      queryClient.invalidateQueries(['playlist']);
    },
  });
}

export function useDeletePlaylist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.deletePlaylist(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['playlists']);
    },
  });
}

export function useAddVideoToPlaylist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ playlistId, videoId }) => api.addVideoToPlaylist(playlistId, videoId),
    onSuccess: () => {
      queryClient.invalidateQueries(['playlists']);
      queryClient.invalidateQueries(['playlist']);
    },
  });
}

export function useAddVideosToPlaylistBulk() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ playlistId, videoIds }) => api.addVideosToPlaylistBulk(playlistId, videoIds),
    onSuccess: () => {
      queryClient.invalidateQueries(['playlists']);
      queryClient.invalidateQueries(['playlist']);
      queryClient.invalidateQueries(['videos']);
    },
  });
}

export function useRemoveVideoFromPlaylist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ playlistId, videoId }) => api.removeVideoFromPlaylist(playlistId, videoId),
    onSuccess: () => {
      queryClient.invalidateQueries(['playlists']);
      queryClient.invalidateQueries(['playlist']);
    },
  });
}

// Queue
export function useQueue() {
  return useQuery({
    queryKey: ['queue'],
    queryFn: () => api.getQueue(),
    refetchInterval: 500, // Refetch every 500ms for faster status updates
    staleTime: 0, // Always consider stale for immediate polling
  });
}

export function useAddToQueue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (videoId) => api.addToQueue(videoId),
    onSuccess: () => {
      queryClient.invalidateQueries(['queue']);
      queryClient.invalidateQueries(['videos']);
    },
  });
}

export function useAddToQueueBulk() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (videoIds) => api.addToQueueBulk(videoIds),
    onSuccess: () => {
      queryClient.invalidateQueries(['queue']);
      queryClient.invalidateQueries(['videos']);
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
      queryClient.invalidateQueries(['queue']);
    },
  });
}

export function useRemoveFromQueue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.removeFromQueue(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['queue']);
    },
  });
}

export function useReorderQueue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, newPosition }) => api.reorderQueue(itemId, newPosition),
    onSuccess: () => {
      queryClient.invalidateQueries(['queue']);
    },
  });
}

export function useMoveToTop() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId) => api.moveToTop(itemId),
    onSuccess: () => {
      queryClient.invalidateQueries(['queue']);
    },
  });
}

export function useMoveToBottom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId) => api.moveToBottom(itemId),
    onSuccess: () => {
      queryClient.invalidateQueries(['queue']);
    },
  });
}

export function useClearQueue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.clearQueue(),
    onSuccess: () => {
      queryClient.invalidateQueries(['queue']);
      queryClient.invalidateQueries(['videos']);
    },
  });
}

// Settings
export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => api.getSettings(),
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.updateSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['settings']);
    },
  });
}

// Health
export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => api.getHealth(),
    refetchInterval: 10000, // Check health every 10 seconds
  });
}

export function useLogs(lines = 500) {
  return useQuery({
    queryKey: ['logs', lines],
    queryFn: () => api.getLogs(lines),
    refetchInterval: 5000, // Refresh logs every 5 seconds
  });
}

// YouTube Playlist Import
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
      queryClient.invalidateQueries(['queue']);
      queryClient.invalidateQueries(['videos']);
    },
  });
}

export function useRemovePlaylistVideos() {
  return useMutation({
    mutationFn: ({ videos }) => api.removePlaylistVideos(videos),
  });
}

// Video Import
export function useScanImportFolder() {
  return useQuery({
    queryKey: ['import', 'scan'],
    queryFn: () => api.scanImportFolder(),
    staleTime: 0, // Always refetch
  });
}

export function useImportState() {
  return useQuery({
    queryKey: ['import', 'state'],
    queryFn: () => api.getImportState(),
    refetchInterval: 1000, // Poll every second during import
    staleTime: 0,
  });
}

export function useAddImportChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (url) => api.addImportChannel(url),
    onSuccess: () => {
      queryClient.invalidateQueries(['import', 'state']);
    },
  });
}

export function useSetImportChannels() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (urls) => api.setImportChannels(urls),
    onSuccess: () => {
      queryClient.invalidateQueries(['import', 'state']);
    },
  });
}

export function useFetchImportChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (channelIdx) => api.fetchImportChannel(channelIdx),
    onSuccess: () => {
      queryClient.invalidateQueries(['import', 'state']);
    },
  });
}

export function useMatchImportFiles() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (channelIdx) => api.matchImportFiles(channelIdx),
    onSuccess: () => {
      queryClient.invalidateQueries(['import', 'state']);
    },
  });
}

export function useExecuteImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (matches) => api.executeImport(matches),
    onSuccess: () => {
      queryClient.invalidateQueries(['import', 'state']);
      queryClient.invalidateQueries(['videos']);
      queryClient.invalidateQueries(['channels']);
    },
  });
}

export function useResolveImportPending() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, videoId, skip }) => api.resolveImportPending(file, videoId, skip),
    onSuccess: () => {
      queryClient.invalidateQueries(['import', 'state']);
      queryClient.invalidateQueries(['videos']);
    },
  });
}

export function useSkipRemainingImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.skipRemainingImport(),
    onSuccess: () => {
      queryClient.invalidateQueries(['import', 'state']);
    },
  });
}

export function useResetImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.resetImport(),
    onSuccess: () => {
      queryClient.invalidateQueries(['import', 'scan']);
      queryClient.invalidateQueries(['import', 'state']);
    },
  });
}

export function useSmartIdentify() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ mode }) => api.smartIdentify(mode),
    onSuccess: () => {
      queryClient.invalidateQueries(['import', 'state']);
    },
  });
}

export function useExecuteSmartImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (matches) => api.executeSmartImport(matches),
    onSuccess: () => {
      queryClient.invalidateQueries(['import', 'state']);
      queryClient.invalidateQueries(['videos']);
      queryClient.invalidateQueries(['channels']);
    },
  });
}

