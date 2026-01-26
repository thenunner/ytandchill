import { useState, useEffect } from 'react';
import { useCreatePlaylist, useUpdatePlaylist, usePlaylists } from '../api/queries';
import { useNotification } from '../contexts/NotificationContext';
import { getUserFriendlyError } from '../utils/errorMessages';

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
      showNotification(getUserFriendlyError(error.message, isEdit ? 'update playlist' : 'create playlist'), 'error');
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 z-[99999] flex items-center justify-center p-4 sm:p-4 animate-fade-in"
      onClick={onClose}
    >
      {/* Desktop - Glass Modal */}
      <div
        className="hidden sm:block backdrop-blur-xl bg-dark-secondary border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-medium text-text-primary">
              {isEdit ? 'Rename Playlist' : 'New Playlist'}
            </h3>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-text-muted hover:text-text-primary transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <p className="text-text-muted text-sm mb-3">Playlist name</p>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setErrorMessage('');
              }}
              placeholder="Enter name..."
              className={`w-full bg-white/5 rounded-xl px-4 py-3 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 mb-2 ${
                errorMessage ? 'border border-red-500/50' : 'border-0'
              }`}
              autoFocus
            />
            {errorMessage && (
              <p className="text-red-500 text-xs mb-4">{errorMessage}</p>
            )}
            {!errorMessage && <div className="mb-4" />}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-text-secondary text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  errorMessage
                    ? 'bg-accent/40 text-dark-deepest/50 cursor-not-allowed'
                    : 'bg-accent/90 hover:bg-accent text-dark-deepest'
                }`}
                disabled={createPlaylist.isLoading || updatePlaylist.isLoading || !!errorMessage}
              >
                {isEdit ? 'Save' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Mobile - Bottom Sheet with Keyboard Awareness */}
      <div
        className="sm:hidden fixed inset-x-0 bottom-0 backdrop-blur-xl bg-dark-secondary rounded-t-3xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mt-3" />
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-text-primary">
              {isEdit ? 'Rename Playlist' : 'New Playlist'}
            </h3>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"
            >
              <svg className="w-4 h-4 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <p className="text-text-muted text-xs mb-2">Playlist name</p>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setErrorMessage('');
              }}
              placeholder="Enter name..."
              className={`w-full bg-white/5 rounded-xl px-4 py-3.5 text-base text-text-primary placeholder-text-muted focus:outline-none ${
                errorMessage ? 'border-2 border-red-500/50' : 'border-2 border-transparent focus:border-accent'
              }`}
              autoFocus
            />
            {errorMessage && (
              <p className="text-red-500 text-xs mt-2">{errorMessage}</p>
            )}

            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3.5 bg-white/5 rounded-xl text-text-secondary font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className={`flex-1 py-3.5 rounded-xl font-semibold ${
                  errorMessage
                    ? 'bg-accent/40 text-dark-deepest/50 cursor-not-allowed'
                    : 'bg-accent text-dark-deepest'
                }`}
                disabled={createPlaylist.isLoading || updatePlaylist.isLoading || !!errorMessage}
              >
                {isEdit ? 'Save' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
