import { useState } from 'react';
import { ResponsiveModal } from './SharedModals';
import { useCreatePlaylist, useUpdatePlaylist, usePlaylists } from '../../api/queries';
import { useNotification } from '../../contexts/NotificationContext';
import { getUserFriendlyError } from '../../utils/utils';
import { CheckIcon } from '../Icons';

// Plus icon
const PlusIcon = () => (
  <svg className="w-5 h-5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
  </svg>
);

/**
 * PlaylistModal - Create or rename a playlist (standalone version)
 */
export function PlaylistModal({ playlist, onClose }) {
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
    <ResponsiveModal
      isOpen={true}
      onClose={onClose}
      title={isEdit ? 'Rename Playlist' : 'New Playlist'}
      zIndex={99999}
    >
      <form onSubmit={handleSubmit}>
        <p className="text-text-muted text-xs sm:text-sm mb-2 sm:mb-3">Playlist name</p>
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setErrorMessage('');
          }}
          placeholder="Enter name..."
          className={`w-full bg-white/5 rounded-xl px-4 py-3.5 sm:py-3 text-base sm:text-sm text-text-primary placeholder-text-muted focus:outline-none sm:focus:ring-2 sm:focus:ring-accent/30 mb-2 ${
            errorMessage ? 'border-2 sm:border border-red-500/50' : 'border-2 sm:border-0 border-transparent focus:border-accent'
          }`}
          autoFocus
        />
        {errorMessage && (
          <p className="text-red-500 text-xs mt-2 mb-4">{errorMessage}</p>
        )}
        {!errorMessage && <div className="mb-4" />}

        <div className="flex gap-3 sm:gap-2 mt-5 sm:mt-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3.5 sm:py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-text-secondary text-sm font-medium sm:font-normal transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className={`flex-1 py-3.5 sm:py-2.5 rounded-xl text-sm font-semibold sm:font-medium transition-colors ${
              errorMessage
                ? 'bg-accent/40 text-dark-deepest/50 cursor-not-allowed'
                : 'bg-accent sm:bg-accent/90 sm:hover:bg-accent text-dark-deepest'
            }`}
            disabled={createPlaylist.isLoading || updatePlaylist.isLoading || !!errorMessage}
          >
            {isEdit ? 'Save' : 'Create'}
          </button>
        </div>
      </form>
    </ResponsiveModal>
  );
}

/**
 * CategorySelectorModal - Assign playlist(s) to a category
 */
export function CategorySelectorModal({
  isOpen,
  onClose,
  categories,
  playlists,
  selectedPlaylistId,
  categoryActionType, // 'single' or 'bulk'
  onToggleCategory,
  onCreateCategory,
  createCategoryMutation
}) {
  const [showCreateInSelector, setShowCreateInSelector] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const { showNotification } = useNotification();

  const handleClose = () => {
    setShowCreateInSelector(false);
    setNewCategoryName('');
    onClose();
  };

  const handleCreateCategory = async (e) => {
    e.preventDefault();
    if (!newCategoryName.trim()) {
      showNotification('Please enter a category name', 'error');
      return;
    }
    try {
      const newCategory = await onCreateCategory(newCategoryName.trim());
      showNotification('Category created', 'success');
      await onToggleCategory(newCategory.id, false);
      setShowCreateInSelector(false);
      setNewCategoryName('');
    } catch (error) {
      showNotification(getUserFriendlyError(error.message, 'create category'), 'error');
    }
  };

  // Get current playlist for checking assigned state
  const currentPlaylist = categoryActionType === 'single' && playlists
    ? playlists.find(p => p.id === selectedPlaylistId)
    : null;

  return (
    <ResponsiveModal isOpen={isOpen} onClose={handleClose} title="Assign to Category">
      {/* Category List */}
      <div className="max-h-64 sm:max-h-52 overflow-y-auto -mx-5 px-5 sm:mx-0 sm:px-0">
        {categories && categories.length > 0 ? (
          [...categories].sort((a, b) => a.name.localeCompare(b.name)).map(category => {
            const isAssigned = currentPlaylist && currentPlaylist.category_id === category.id;

            return (
              <label
                key={category.id}
                onClick={() => onToggleCategory(category.id, isAssigned)}
                className="flex items-center gap-4 sm:gap-3 px-5 sm:px-4 py-4 sm:py-3 hover:bg-white/5 active:bg-white/5 cursor-pointer transition-colors border-b sm:border-0 border-white/5"
              >
                <div className={`w-6 h-6 sm:w-5 sm:h-5 rounded-lg sm:rounded flex items-center justify-center transition-colors ${
                  isAssigned ? 'bg-accent' : 'border-2 sm:border border-white/20 sm:border-dark-border-light'
                }`}>
                  {isAssigned && (
                    <CheckIcon className="w-4 h-4 sm:w-3 sm:h-3 text-dark-deepest" />
                  )}
                </div>
                <span className="text-base sm:text-sm text-text-primary flex-1 truncate">{category.name}</span>
                <span className="text-sm sm:text-xs text-text-muted">{category.playlist_count || 0}</span>
              </label>
            );
          })
        ) : (
          <div className="text-center py-8 sm:py-6 text-text-muted text-sm">No categories yet</div>
        )}
      </div>

      {/* Create new category */}
      <div className="pt-3 border-t border-white/10 mt-3 -mx-5 px-5 sm:mx-0 sm:px-0 p-4 sm:p-3">
        {!showCreateInSelector ? (
          <button
            onClick={() => setShowCreateInSelector(true)}
            className="w-full flex items-center justify-center gap-2 py-4 sm:py-2.5 rounded-2xl sm:rounded-xl border border-dashed border-white/20 hover:border-accent hover:text-accent text-text-secondary sm:text-text-muted text-sm transition-colors"
          >
            <PlusIcon />
            New category
          </button>
        ) : (
          <form onSubmit={handleCreateCategory} className="space-y-3 sm:space-y-2">
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Category name"
              className="w-full bg-white/5 rounded-xl px-4 sm:px-3 py-3.5 sm:py-2.5 text-base sm:text-sm text-text-primary placeholder-text-muted focus:outline-none sm:focus:ring-2 sm:focus:ring-accent/30 border-2 sm:border-0 border-transparent focus:border-accent"
              autoFocus
            />
            <div className="flex gap-3 sm:gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowCreateInSelector(false);
                  setNewCategoryName('');
                }}
                className="flex-1 py-3.5 sm:py-2 text-sm rounded-xl bg-white/5 hover:bg-white/10 text-text-secondary font-medium sm:font-normal transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-3.5 sm:py-2 text-sm rounded-xl bg-accent sm:bg-accent/90 sm:hover:bg-accent text-dark-deepest font-semibold sm:font-medium transition-colors"
                disabled={createCategoryMutation?.isLoading}
              >
                Create
              </button>
            </div>
          </form>
        )}
      </div>
    </ResponsiveModal>
  );
}

export default {
  PlaylistModal,
  CategorySelectorModal
};
