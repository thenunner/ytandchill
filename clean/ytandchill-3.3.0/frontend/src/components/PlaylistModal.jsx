import { useState, useEffect } from 'react';
import { useCreatePlaylist, useUpdatePlaylist, usePlaylists } from '../api/queries';
import { useNotification } from '../contexts/NotificationContext';

export default function PlaylistModal({ playlist, onClose }) {
  const [name, setName] = useState(playlist?.name || '');
  const [errorMessage, setErrorMessage] = useState('');
  const createPlaylist = useCreatePlaylist();
  const updatePlaylist = useUpdatePlaylist();
  const { data: existingPlaylists } = usePlaylists();
  const { showNotification } = useNotification();

  const isEdit = !!playlist;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!name.trim()) {
      showNotification('Please enter a playlist name', 'error');
      setErrorMessage('');
      return;
    }

    // Check for duplicate names
    const duplicate = existingPlaylists?.find(p =>
      p.name.toLowerCase() === name.trim().toLowerCase() &&
      (!isEdit || p.id !== playlist.id)
    );

    if (duplicate) {
      setErrorMessage('Already Exists');
      return;
    }

    try {
      setErrorMessage('');
      if (isEdit) {
        await updatePlaylist.mutateAsync({ id: playlist.id, data: { name } });
        showNotification('Playlist updated', 'success');
      } else {
        await createPlaylist.mutateAsync({ name });
        showNotification('Playlist created', 'success');
      }
      onClose();
    } catch (error) {
      showNotification(error.message, 'error');
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 z-[99999] flex items-center justify-center animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-dark-secondary rounded-xl border border-dark-border p-6 w-full max-w-md animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-xl font-semibold text-text-primary mb-4">
          {isEdit ? 'Rename Playlist' : 'Create Playlist'}
        </h3>

        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setErrorMessage(''); // Clear error when typing
              }}
              placeholder="My Playlist"
              className="w-full px-4 py-2 bg-dark-tertiary border border-dark-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
              autoFocus
            />
            {errorMessage && (
              <p className="mt-2 text-sm text-red-500 font-medium">{errorMessage}</p>
            )}
          </div>

          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={createPlaylist.isLoading || updatePlaylist.isLoading}
            >
              {isEdit ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
