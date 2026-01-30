import { useState, useEffect } from 'react';
import { ResponsiveModal, ConfirmModal } from './SharedModals';
import { useCreatePlaylist, useUpdatePlaylist, usePlaylists } from '../../api/queries';
import { useNotification } from '../../contexts/NotificationContext';
import { getUserFriendlyError } from '../../utils/utils';

// Close icon SVG component
const CloseIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

// Checkmark icon
const CheckIcon = ({ className = "w-3 h-3" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

// Plus icon
const PlusIcon = () => (
  <svg className="w-4 h-4 sm:w-4 sm:h-4 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
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
        <p className="text-text-muted text-sm sm:text-sm text-xs mb-3 sm:mb-3 mb-2">Playlist name</p>
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setErrorMessage('');
          }}
          placeholder="Enter name..."
          className={`w-full bg-white/5 rounded-xl px-4 py-3 sm:py-3 py-3.5 text-sm sm:text-sm text-base text-text-primary placeholder-text-muted focus:outline-none sm:focus:ring-2 sm:focus:ring-accent/30 mb-2 ${
            errorMessage ? 'border border-red-500/50 sm:border sm:border-red-500/50 border-2' : 'sm:border-0 border-2 border-transparent focus:border-accent'
          }`}
          autoFocus
        />
        {errorMessage && (
          <p className="text-red-500 text-xs mb-4 sm:mb-4 mt-2">{errorMessage}</p>
        )}
        {!errorMessage && <div className="mb-4 sm:mb-4" />}

        <div className="flex gap-2 sm:gap-2 gap-3 sm:mt-0 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 sm:py-2.5 py-3.5 rounded-xl bg-white/5 hover:bg-white/10 text-text-secondary text-sm font-medium sm:font-normal transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className={`flex-1 py-2.5 sm:py-2.5 py-3.5 rounded-xl text-sm font-medium sm:font-medium font-semibold transition-colors ${
              errorMessage
                ? 'bg-accent/40 text-dark-deepest/50 cursor-not-allowed'
                : 'bg-accent/90 hover:bg-accent sm:bg-accent/90 sm:hover:bg-accent bg-accent text-dark-deepest'
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
 * RenamePlaylistModal - Simple input modal for renaming a playlist
 */
export function RenamePlaylistModal({
  isOpen,
  onClose,
  value,
  onChange,
  onRename,
  isLoading
}) {
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      onRename();
    }
  };

  return (
    <ResponsiveModal isOpen={isOpen} onClose={onClose} title="Rename Playlist">
      <p className="text-text-muted text-sm sm:text-sm text-xs mb-3 sm:mb-3 mb-2">Playlist name</p>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyPress={handleKeyPress}
        placeholder="Enter name..."
        className="w-full bg-white/5 rounded-xl px-4 py-3 sm:py-3 py-3.5 text-sm sm:text-sm text-base text-text-primary placeholder-text-muted focus:outline-none sm:focus:ring-2 sm:focus:ring-accent/30 sm:border-0 border-2 border-transparent focus:border-accent mb-4 sm:mb-4"
        autoFocus
      />
      <div className="flex gap-2 sm:gap-2 gap-3 sm:mt-0 mt-5">
        <button
          onClick={onClose}
          className="flex-1 py-2.5 sm:py-2.5 py-3.5 rounded-xl bg-white/5 hover:bg-white/10 text-text-secondary text-sm font-medium sm:font-normal transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onRename}
          disabled={!value.trim() || isLoading}
          className="flex-1 py-2.5 sm:py-2.5 py-3.5 rounded-xl bg-accent/90 hover:bg-accent sm:bg-accent/90 sm:hover:bg-accent bg-accent text-dark-deepest text-sm font-medium sm:font-medium font-semibold transition-colors disabled:opacity-50"
        >
          {isLoading ? 'Renaming...' : 'Rename'}
        </button>
      </div>
    </ResponsiveModal>
  );
}

/**
 * CreateCategoryModal - Create a new playlist category
 */
export function CreateCategoryModal({
  isOpen,
  onClose,
  value,
  onChange,
  onCreate,
  isCreating
}) {
  const handleSubmit = (e) => {
    e.preventDefault();
    onCreate();
  };

  return (
    <ResponsiveModal isOpen={isOpen} onClose={onClose} title="New Category">
      <form onSubmit={handleSubmit}>
        <p className="text-text-muted text-sm sm:text-sm text-xs mb-3 sm:mb-3 mb-2">Category name</p>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter name..."
          className="w-full bg-white/5 rounded-xl px-4 py-3 sm:py-3 py-3.5 text-sm sm:text-sm text-base text-text-primary placeholder-text-muted focus:outline-none sm:focus:ring-2 sm:focus:ring-accent/30 sm:border-0 border-2 border-transparent focus:border-accent mb-4 sm:mb-4"
          autoFocus
        />
        <div className="flex gap-2 sm:gap-2 gap-3 sm:mt-0 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 sm:py-2.5 py-3.5 rounded-xl bg-white/5 hover:bg-white/10 text-text-secondary text-sm font-medium sm:font-normal transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!value.trim() || isCreating}
            className="flex-1 py-2.5 sm:py-2.5 py-3.5 rounded-xl bg-accent/90 hover:bg-accent sm:bg-accent/90 sm:hover:bg-accent bg-accent text-dark-deepest text-sm font-medium sm:font-medium font-semibold transition-colors disabled:opacity-50"
          >
            {isCreating ? 'Creating...' : 'Create'}
          </button>
        </div>
      </form>
    </ResponsiveModal>
  );
}

/**
 * RenameCategoryModal - Rename a playlist category
 */
export function RenameCategoryModal({
  isOpen,
  onClose,
  value,
  onChange,
  onRename,
  isRenaming
}) {
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      onRename();
    }
  };

  return (
    <ResponsiveModal isOpen={isOpen} onClose={onClose} title="Rename Category">
      <p className="text-text-muted text-sm sm:text-sm text-xs mb-3 sm:mb-3 mb-2">Category name</p>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyPress={handleKeyPress}
        placeholder="Enter name..."
        className="w-full bg-white/5 rounded-xl px-4 py-3 sm:py-3 py-3.5 text-sm sm:text-sm text-base text-text-primary placeholder-text-muted focus:outline-none sm:focus:ring-2 sm:focus:ring-accent/30 sm:border-0 border-2 border-transparent focus:border-accent mb-4 sm:mb-4"
        autoFocus
      />
      <div className="flex gap-2 sm:gap-2 gap-3 sm:mt-0 mt-5">
        <button
          onClick={onClose}
          className="flex-1 py-2.5 sm:py-2.5 py-3.5 rounded-xl bg-white/5 hover:bg-white/10 text-text-secondary text-sm font-medium sm:font-normal transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onRename}
          disabled={!value.trim() || isRenaming}
          className="flex-1 py-2.5 sm:py-2.5 py-3.5 rounded-xl bg-accent/90 hover:bg-accent sm:bg-accent/90 sm:hover:bg-accent bg-accent text-dark-deepest text-sm font-medium sm:font-medium font-semibold transition-colors disabled:opacity-50"
        >
          {isRenaming ? 'Renaming...' : 'Rename'}
        </button>
      </div>
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
      <div className="max-h-52 sm:max-h-52 max-h-64 overflow-y-auto -mx-5 px-5 sm:mx-0 sm:px-0">
        {categories && categories.length > 0 ? (
          [...categories].sort((a, b) => a.name.localeCompare(b.name)).map(category => {
            const isAssigned = currentPlaylist && currentPlaylist.category_id === category.id;

            return (
              <label
                key={category.id}
                onClick={() => onToggleCategory(category.id, isAssigned)}
                className="flex items-center gap-3 sm:gap-3 gap-4 px-4 py-3 sm:px-4 sm:py-3 px-5 py-4 hover:bg-white/5 sm:hover:bg-white/5 active:bg-white/5 cursor-pointer transition-colors sm:border-0 border-b border-white/5"
              >
                <div className={`w-5 h-5 sm:w-5 sm:h-5 w-6 h-6 rounded sm:rounded rounded-lg flex items-center justify-center transition-colors ${
                  isAssigned ? 'bg-accent' : 'border border-dark-border-light sm:border sm:border-dark-border-light border-2 border-white/20'
                }`}>
                  {isAssigned && (
                    <CheckIcon className="w-3 h-3 sm:w-3 sm:h-3 w-4 h-4 text-dark-deepest" />
                  )}
                </div>
                <span className="text-sm sm:text-sm text-base text-text-primary flex-1 truncate">{category.name}</span>
                <span className="text-xs sm:text-xs text-sm text-text-muted">{category.playlist_count || 0}</span>
              </label>
            );
          })
        ) : (
          <div className="text-center py-6 sm:py-6 py-8 text-text-muted text-sm">No categories yet</div>
        )}
      </div>

      {/* Create new category */}
      <div className="pt-3 border-t border-white/10 mt-3 -mx-5 px-5 sm:mx-0 sm:px-0 sm:p-3 p-4">
        {!showCreateInSelector ? (
          <button
            onClick={() => setShowCreateInSelector(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 sm:py-2.5 py-4 rounded-xl sm:rounded-xl rounded-2xl border border-dashed border-white/20 hover:border-accent hover:text-accent text-text-muted sm:text-text-muted text-text-secondary text-sm transition-colors"
          >
            <PlusIcon />
            New category
          </button>
        ) : (
          <form onSubmit={handleCreateCategory} className="space-y-2 sm:space-y-2 space-y-3">
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Category name"
              className="w-full bg-white/5 rounded-xl px-3 py-2.5 sm:px-3 sm:py-2.5 px-4 py-3.5 text-sm sm:text-sm text-base text-text-primary placeholder-text-muted focus:outline-none sm:focus:ring-2 sm:focus:ring-accent/30 sm:border-0 border-2 border-transparent focus:border-accent"
              autoFocus
            />
            <div className="flex gap-2 sm:gap-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowCreateInSelector(false);
                  setNewCategoryName('');
                }}
                className="flex-1 py-2 sm:py-2 py-3.5 text-sm rounded-xl bg-white/5 hover:bg-white/10 text-text-secondary font-medium sm:font-normal transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2 sm:py-2 py-3.5 text-sm rounded-xl bg-accent/90 hover:bg-accent sm:bg-accent/90 sm:hover:bg-accent bg-accent text-dark-deepest font-medium sm:font-medium font-semibold transition-colors"
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
  RenamePlaylistModal,
  CreateCategoryModal,
  RenameCategoryModal,
  CategorySelectorModal
};
