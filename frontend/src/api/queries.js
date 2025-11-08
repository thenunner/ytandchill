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
    mutationFn: ({ id, forceFull = false }) => api.scanChannel(id, forceFull),
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
    refetchInterval: 2000, // Refetch every 2 seconds for real-time updates
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
