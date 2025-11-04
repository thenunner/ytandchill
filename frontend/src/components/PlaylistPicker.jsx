import { useState } from 'react';
import { usePlaylists, useCreatePlaylist, useAddVideoToPlaylist } from '../api/queries';
import { useNotification } from '../contexts/NotificationContext';

export default function PlaylistPicker({ videoId, channelId, onClose }) {
  const { data: playlists } = usePlaylists(channelId);
  const createPlaylist = useCreatePlaylist();
  const addToPlaylist = useAddVideoToPlaylist();
  const { showNotification } = useNotification();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');

  const handleCreatePlaylist = async (e) => {
    e.preventDefault();
    try {
      const playlist = await createPlaylist.mutateAsync({
        name: newPlaylistName,
        channel_id: channelId,
      });
      await addToPlaylist.mutateAsync({
        playlistId: playlist.id,
        videoId,
      });
      setNewPlaylistName('');
      setShowCreateForm(false);
      showNotification('Playlist created and video added', 'success');
      if (onClose) onClose();
    } catch (error) {
      showNotification(error.message, 'error');
    }
  };

  const handleAddToPlaylist = async (playlistId) => {
    try {
      await addToPlaylist.mutateAsync({ playlistId, videoId });
      showNotification('Video added to playlist', 'success');
      if (onClose) onClose();
    } catch (error) {
      showNotification(error.message, 'error');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg max-w-md w-full max-h-[80vh] overflow-y-auto">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold text-gray-100">Add to Playlist</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-200"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Existing Playlists */}
          <div className="space-y-2">
            {playlists?.map(playlist => (
              <button
                key={playlist.id}
                onClick={() => handleAddToPlaylist(playlist.id)}
                className="w-full text-left p-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              >
                <div className="font-medium text-gray-100">{playlist.name}</div>
                <div className="text-sm text-gray-400">{playlist.video_count} videos</div>
              </button>
            ))}
          </div>

          {/* Create New Playlist */}
          {showCreateForm ? (
            <form onSubmit={handleCreatePlaylist} className="space-y-3">
              <input
                type="text"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                placeholder="Playlist name"
                className="input"
                required
              />
              <div className="flex space-x-2">
                <button type="submit" className="btn btn-primary flex-1">
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setShowCreateForm(true)}
              className="w-full btn btn-secondary"
            >
              Create New Playlist
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
